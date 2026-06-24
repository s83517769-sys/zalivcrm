import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// GET /api/stats/analytics?year=YYYY&month=M&mode=manual|tech
//
// 5 метрик одним JSON. Источник бана зависит от mode:
//   manual → accounts.ban_date (set on first terminal transition)
//   tech   → MIN(snapshot_date) FROM daily_tech_status WHERE tech_status='Бан'
//            (включает удалённые навсегда аккаунты — снимки переживают DELETE)
// Каждый аккаунт считается ОДИН раз. Источники не смешиваются.
//
// Burn (cost_to_ban): конвертирован в USD ПО АНАЛОГИИ С ФРОНТОМ (pages/index.js).
//   raw_native_cost из daily_metrics.cost_usd (название обманчивое — там native!)
//   умножается на rate из user_settings.currency_rates по a.currency.
//   USD по умолчанию = 1. Курсы — текущие (исторические не накапливаются).

const MIN_FOR_AGG = 3 // меньше — выводим «данных недостаточно»

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const year = parseInt(req.query.year)
  const month = parseInt(req.query.month) // 1..12
  const mode = req.query.mode === 'manual' ? 'manual' : 'tech'
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year + month (1-12) required' })
  }

  const periodStart = new Date(year, month - 1, 1)
  const periodEndExclusive = new Date(year, month, 1) // exclusive upper bound
  const periodStartStr = `${year}-${String(month).padStart(2,'0')}-01`
  const periodEndExclusiveStr = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2,'0')}-01`

  // ── 1. Курсы валют (как на фронте) ────────────────────────────────────
  const { data: us } = await supabaseAdmin
    .from('user_settings')
    .select('currency_rates')
    .eq('user_id', USER_ID)
    .maybeSingle()
  const currencyRates = { USD: 1, ...(us?.currency_rates || {}) }
  const rateOf = (cur) => currencyRates[cur] || 1

  // ── 2. Аккаунты (активные + архивные; удалённых нет) ─────────────────
  const { data: accounts, error: accErr } = await supabaseAdmin
    .from('accounts')
    .select('id, currency, created_at, launch_date, crut_date, ban_date, ban_reason, status, is_archived, geo, funnel, format')
    .eq('user_id', USER_ID)
  if (accErr) return res.status(500).json({ error: accErr.message })

  const accountMap = new Map((accounts || []).map(a => [a.id, a]))

  // ── 3. Per-account bannedMap по режиму ───────────────────────────────
  const bannedMap = new Map() // id → { ban_date_effective:Date, account:row|null }
  let deletedTechBanCount = 0

  if (mode === 'manual') {
    for (const a of (accounts || [])) {
      if (a.ban_date) {
        bannedMap.set(a.id, {
          ban_date_effective: new Date(a.ban_date),
          account: a,
        })
      }
    }
  } else {
    // tech mode — читаем daily_tech_status, группируем по account_id (MIN дата)
    const { data: techBanRows, error: tbErr } = await supabaseAdmin
      .from('daily_tech_status')
      .select('account_id, snapshot_date')
      .eq('user_id', USER_ID)
      .eq('tech_status', 'Бан')
    if (tbErr) return res.status(500).json({ error: tbErr.message })

    for (const row of (techBanRows || [])) {
      const date = new Date(row.snapshot_date)
      const existing = bannedMap.get(row.account_id)
      if (!existing || date < existing.ban_date_effective) {
        bannedMap.set(row.account_id, {
          ban_date_effective: date,
          account: accountMap.get(row.account_id) || null,
        })
      }
    }
    for (const id of bannedMap.keys()) {
      if (!accountMap.has(id)) deletedTechBanCount++
    }
  }

  // Знаменатель для % банов — все «известные» аккаунты в этом режиме:
  //   manual: только живые в accounts
  //   tech: живые + удалённые с тех-снимками (входят как deletedTechBanCount)
  const totalKnownAccounts = (accounts?.length || 0) + (mode === 'tech' ? deletedTechBanCount : 0)

  // ── 4. Lifetime ──────────────────────────────────────────────────────
  const lifetimes = []
  for (const [id, info] of bannedMap) {
    const a = info.account
    if (!a) continue // удалённый — нет start-даты
    const startISO = a.crut_date || a.launch_date || a.created_at
    if (!startISO) continue
    const start = new Date(startISO)
    const days = Math.floor((info.ban_date_effective - start) / 86400000)
    if (days < 0) continue
    lifetimes.push(days)
  }
  lifetimes.sort((a, b) => a - b)
  const lifetimeBuckets = [
    { label: '0-3д',   from: 0,  to: 3  },
    { label: '4-7д',   from: 4,  to: 7  },
    { label: '8-14д',  from: 8,  to: 14 },
    { label: '15-30д', from: 15, to: 30 },
    { label: '31-60д', from: 31, to: 60 },
    { label: '60+д',   from: 61, to: Infinity },
  ]
  const lifetimeHistogram = lifetimeBuckets.map(b => ({
    label: b.label,
    count: lifetimes.filter(d => d >= b.from && d <= b.to).length,
  }))
  const lifetime = lifetimes.length >= MIN_FOR_AGG
    ? {
        count: lifetimes.length,
        avg_days: round1(avg(lifetimes)),
        median: lifetimes[Math.floor(lifetimes.length / 2)],
        min: lifetimes[0],
        max: lifetimes[lifetimes.length - 1],
        histogram: lifetimeHistogram,
      }
    : { count: lifetimes.length, insufficient: true }

  // ── 5. % банов + тренд ───────────────────────────────────────────────
  const bansInPeriod = []
  for (const info of bannedMap.values()) {
    if (info.ban_date_effective >= periodStart && info.ban_date_effective < periodEndExclusive) {
      bansInPeriod.push(info.ban_date_effective)
    }
  }
  // По дням текущего месяца (для тренда — простой bar chart)
  const daysInMonth = new Date(year, month, 0).getDate()
  const byDay = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    count: 0,
  }))
  for (const d of bansInPeriod) {
    byDay[d.getDate() - 1].count++
  }
  const banTrend = {
    total_known_accounts: totalKnownAccounts,
    banned_in_period: bansInPeriod.length,
    banned_total: bannedMap.size,
    pct_in_period: totalKnownAccounts > 0 ? round1(bansInPeriod.length / totalKnownAccounts * 100) : 0,
    pct_total: totalKnownAccounts > 0 ? round1(bannedMap.size / totalKnownAccounts * 100) : 0,
    by_day: byDay,
  }

  // ── 6. Burn до бана (с конвертацией в USD как на фронте) ─────────────
  // Берём метрики только для забаненных, которые есть в accounts (у удалённых
  // daily_metrics удалён каскадно). Затем фильтруем metric_date <= ban_date_eff.
  const existingBannedIds = [...bannedMap.keys()].filter(id => accountMap.has(id))
  let metricsRows = []
  if (existingBannedIds.length) {
    const { data, error: mErr } = await supabaseAdmin
      .from('daily_metrics')
      .select('account_id, metric_date, cost_usd')
      .eq('user_id', USER_ID)
      .in('account_id', existingBannedIds)
    if (mErr) return res.status(500).json({ error: mErr.message })
    metricsRows = data || []
  }
  const burnPerAccount = new Map()
  for (const row of metricsRows) {
    const info = bannedMap.get(row.account_id)
    if (!info) continue
    const a = info.account
    if (!a) continue
    if (new Date(row.metric_date) > info.ban_date_effective) continue
    const rate = rateOf(a.currency || 'USD')
    const usd = (+row.cost_usd || 0) * rate
    burnPerAccount.set(row.account_id, (burnPerAccount.get(row.account_id) || 0) + usd)
  }
  const burns = [...burnPerAccount.values()].filter(v => v > 0).sort((a, b) => a - b)
  const burnBuckets = [
    { label: '$0-50',     from: 0,    to: 50    },
    { label: '$50-200',   from: 50,   to: 200   },
    { label: '$200-500',  from: 200,  to: 500   },
    { label: '$500-1000', from: 500,  to: 1000  },
    { label: '$1k+',      from: 1000, to: Infinity },
  ]
  const burnHistogram = burnBuckets.map(b => ({
    label: b.label,
    count: burns.filter(v => v >= b.from && v < b.to).length,
  }))
  const burnTotalAll = [...burnPerAccount.values()].reduce((s, v) => s + v, 0)
  const burn = burns.length >= MIN_FOR_AGG
    ? {
        count: burns.length,
        total_usd: round0(burnTotalAll),
        avg_usd: round0(avg(burns)),
        median: round0(burns[Math.floor(burns.length / 2)]),
        max: round0(burns[burns.length - 1]),
        histogram: burnHistogram,
      }
    : { count: burns.length, total_usd: round0(burnTotalAll), insufficient: true }

  // ── 7. Причины бана ──────────────────────────────────────────────────
  const reasonCounts = new Map()
  for (const info of bannedMap.values()) {
    const a = info.account
    const raw = (a?.ban_reason || '').trim()
    const reason = raw || 'Не указано'
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1)
  }
  const reasonsTotal = bannedMap.size
  const reasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      pct: reasonsTotal > 0 ? round1(count / reasonsTotal * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
  // Гарантируем строку «Не указано» в выводе (даже если 0 — для прозрачности)
  if (!reasonCounts.has('Не указано')) {
    reasons.push({ reason: 'Не указано', count: 0, pct: 0 })
  }
  const reasonsFillRate = reasonsTotal > 0
    ? round0((1 - (reasonCounts.get('Не указано') || 0) / reasonsTotal) * 100)
    : 0

  // ── 8. Воронка ───────────────────────────────────────────────────────
  const createdInPeriod = (accounts || []).filter(a => {
    const c = new Date(a.created_at)
    return c >= periodStart && c < periodEndExclusive
  })
  const reachedCrut = createdInPeriod.filter(a => a.crut_date).length
  const bannedCohort = createdInPeriod.filter(a => bannedMap.has(a.id)).length
  const funnel = {
    created_in_period: createdInPeriod.length,
    reached_crut: reachedCrut,
    banned: bannedCohort,
    pct_crut: createdInPeriod.length > 0 ? round1(reachedCrut / createdInPeriod.length * 100) : 0,
    pct_banned: createdInPeriod.length > 0 ? round1(bannedCohort / createdInPeriod.length * 100) : 0,
  }

  // ── 9. Notes ─────────────────────────────────────────────────────────
  const notes = []
  if (mode === 'tech' && deletedTechBanCount > 0) {
    notes.push(`В техрежиме учтено ${deletedTechBanCount} удалённых навсегда аккаунтов (по сохранившимся снимкам). Срок жизни и burn для них не вычисляются — исходные строки потеряны.`)
  }
  notes.push(`Burn конвертирован в USD по ТЕКУЩИМ курсам из настроек (исторические курсы не сохраняются). Если курсы менялись существенно — фактический спенд мог отличаться.`)
  notes.push(`ban_reason заполнено в ${reasonsFillRate}% случаев — остальное «Не указано».`)

  return res.status(200).json({
    mode,
    period: { year, month, periodStart: periodStartStr, periodEndExclusive: periodEndExclusiveStr },
    lifetime,
    ban_trend: banTrend,
    burn,
    reasons,
    funnel,
    notes,
  })
}

function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length }
function round0(v) { return Math.round(v) }
function round1(v) { return Math.round(v * 10) / 10 }
