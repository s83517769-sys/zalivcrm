import { DateTime } from 'luxon'
import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'

const DEFAULT_TZ = 'Europe/Nicosia'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  // Часовой пояс пользователя
  let userTz = DEFAULT_TZ
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('user_timezone')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (us?.user_timezone && DateTime.local().setZone(us.user_timezone).isValid) {
      userTz = us.user_timezone
    }
  } catch {}

  const nowU = DateTime.now().setZone(userTz)
  const todayU = nowU.toISODate()
  const yesterdayU = nowU.minus({ days: 1 }).toISODate()

  // Валюта каждого аккаунта (cost хранится в НАТИВНОЙ валюте, нормализация — на клиенте)
  const { data: accs } = await supabaseAdmin
    .from('accounts')
    .select('id, currency')
    .eq('user_id', USER_ID)
  const curMap = Object.fromEntries((accs || []).map(a => [a.id, a.currency || 'USD']))

  const summary = {}
  const ensure = (id) => {
    if (!summary[id]) summary[id] = { currency: curMap[id] || 'USD' }
    return summary[id]
  }

  // ── 1. Аккаунты с почасовыми данными: пересборка под пояс пользователя ──
  // Окно в 3 даты по поясу аккаунта покрывает любые смещения (-12..+14) и DST.
  const sinceDate = nowU.minus({ days: 2 }).toISODate()
  const hourlyAccounts = new Set()
  try {
    const { data: hours } = await supabaseAdmin
      .from('hourly_metrics')
      .select('account_id, metric_date, hour, account_timezone, cost_native, clicks, conversions')
      .eq('user_id', USER_ID)
      .gte('metric_date', sinceDate)

    const buckets = {} // account_id -> { today:{...}, yesterday:{...} }
    for (const h of (hours || [])) {
      const zone = h.account_timezone && DateTime.local().setZone(h.account_timezone).isValid
        ? h.account_timezone : 'UTC'
      // (дата, час) по поясу аккаунта → момент времени → дата по поясу пользователя
      const dt = DateTime.fromISO(h.metric_date, { zone }).set({ hour: h.hour })
      if (!dt.isValid) continue
      const userDate = dt.setZone(userTz).toISODate()
      let key = null
      if (userDate === todayU) key = 'today'
      else if (userDate === yesterdayU) key = 'yesterday'
      if (!key) continue

      hourlyAccounts.add(h.account_id)
      if (!buckets[h.account_id]) buckets[h.account_id] = {}
      const b = buckets[h.account_id][key] || (buckets[h.account_id][key] = { cost: 0, clicks: 0, conversions: 0 })
      b.cost += +h.cost_native || 0
      b.clicks += +h.clicks || 0
      b.conversions += +h.conversions || 0
    }

    for (const [accId, periods] of Object.entries(buckets)) {
      const entry = ensure(accId)
      for (const [key, b] of Object.entries(periods)) {
        entry[key] = {
          cost_usd: Math.round(b.cost * 100) / 100,       // имя поля историческое; значение в нативной валюте
          clicks: b.clicks,
          conversions: Math.round(b.conversions * 100) / 100,
          cpc_usd: b.clicks > 0 ? Math.round(b.cost / b.clicks * 10000) / 10000 : 0,
          cpa: b.conversions > 0 ? Math.round(b.cost / b.conversions * 100) / 100 : 0,
        }
      }
    }
  } catch (e) {
    console.error('hourly summary error:', e)
  }

  // ── 2. Фолбэк для аккаунтов на старом скрипте: daily_metrics как раньше ──
  const todayLegacy = new Date().toISOString().split('T')[0]
  const yesterdayLegacy = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const { data, error } = await supabaseAdmin
    .from('daily_metrics')
    .select('account_id, metric_date, clicks, cpc_usd, cost_usd, conversions, cpa')
    .eq('user_id', USER_ID)
    .in('metric_date', [todayLegacy, yesterdayLegacy])

  if (error) return res.status(500).json({ error: error.message })

  for (const row of (data || [])) {
    if (hourlyAccounts.has(row.account_id)) continue // почасовые данные точнее
    const entry = ensure(row.account_id)
    if (row.metric_date === todayLegacy) entry.today = row
    else entry.yesterday = row
  }

  return res.status(200).json({ summary, user_timezone: userTz })
}
