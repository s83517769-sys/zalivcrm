import { DateTime } from 'luxon'
import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

const DEFAULT_TZ = 'Asia/Nicosia'

// GET /api/metrics/batch?year=YYYY&month=M (1-12)
//
// Перф-замена N-запросов /api/metrics/{id} на /stats (#6): одним заходом отдаёт
// метрики ВСЕХ не-архивных аккаунтов юзера за месяц. Воспроизводит ТУ ЖЕ
// логику слияния, что /api/metrics/[accountId].js — daily_metrics как база,
// сверху overlay из hourly_metrics (OFF: бакет = metric_date по поясу аккаунта;
// ON: пересборка под пояс пользователя). Поэтому числа на /stats идентичны —
// меняется только способ загрузки, не формула.
//
// /api/metrics/[accountId] НЕ удаляется — им пользуется drawer на главной.

// Пагинация: PostgREST/Supabase отдаёт максимум 1000 строк на запрос. 94 акк ×
// 31 день (+ часы) заведомо больше — тянем .range(from, from+999) циклом, пока
// страница полная, иначе хвост обрежется и суммы станут неполными (см. #90).
async function fetchAll(build) {
  const pageSize = 1000
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) return { data: null, error }
    if (data && data.length) all.push(...data)
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return { data: all, error: null }
}

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const year = parseInt(req.query.year)
  const month = parseInt(req.query.month) // 1..12
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year + month (1-12) required' })
  }

  // Пояс пользователя + режим спенда — как в /api/metrics/[accountId]
  let userTz = DEFAULT_TZ
  let spendByUserTz = false
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('user_timezone, spend_by_user_tz')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (us?.user_timezone && DateTime.local().setZone(us.user_timezone).isValid) userTz = us.user_timezone
    spendByUserTz = us?.spend_by_user_tz === true
  } catch {}

  // Набор аккаунтов — РОВНО тот же, что /api/accounts отдаёт на /stats:
  // не-архивные текущего юзера. Иначе суммы разъедутся (архивные добавят спенд).
  const { data: accs, error: accErr } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('is_archived', false)
  if (accErr) return res.status(500).json({ error: accErr.message })
  const allowed = new Set((accs || []).map(a => a.id))
  if (!allowed.size) {
    return res.status(200).json({ metrics: {}, spend_by_user_tz: spendByUserTz, user_timezone: userTz })
  }

  const mm = String(month).padStart(2, '0')
  const monthStart = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  // Запас ±2 дня по краям окна для часов: в ON-режиме дата пересобирается под
  // пояс пользователя и может сдвинуться на сутки относительно metric_date.
  const winStart = DateTime.fromISO(monthStart).minus({ days: 2 }).toISODate()
  const winEnd = DateTime.fromISO(monthEnd).plus({ days: 2 }).toISODate()

  // База: daily_metrics за месяц (нативная валюта в cost_usd — как и было).
  const { data: daily, error: dErr } = await fetchAll((a, b) => supabaseAdmin
    .from('daily_metrics')
    .select('account_id, metric_date, clicks, cost_usd, conversions, cpc_usd, cpa')
    .eq('user_id', USER_ID)
    .gte('metric_date', monthStart)
    .lte('metric_date', monthEnd)
    .range(a, b))
  if (dErr) return res.status(500).json({ error: dErr.message })

  // Часы для overlay. OFF — бакет по metric_date (не нужен hour/tz); ON — нужен
  // hour + account_timezone для пересборки под пояс пользователя.
  const hourCols = spendByUserTz
    ? 'account_id, metric_date, hour, account_timezone, cost_native, clicks, conversions'
    : 'account_id, metric_date, cost_native, clicks, conversions'
  const { data: hours, error: hErr } = await fetchAll((a, b) => supabaseAdmin
    .from('hourly_metrics')
    .select(hourCols)
    .eq('user_id', USER_ID)
    .gte('metric_date', winStart)
    .lte('metric_date', winEnd)
    .range(a, b))
  if (hErr) return res.status(500).json({ error: hErr.message })

  // byAcc[accId][date] = строка. Сперва daily-база.
  const byAcc = {}
  const ensure = (id) => (byAcc[id] || (byAcc[id] = {}))
  for (const r of (daily || [])) {
    if (!allowed.has(r.account_id)) continue
    ensure(r.account_id)[r.metric_date] = {
      account_id: r.account_id,
      metric_date: r.metric_date,
      clicks: r.clicks,
      cost_usd: r.cost_usd,
      conversions: r.conversions,
      cpc_usd: r.cpc_usd,
      cpa: r.cpa,
    }
  }

  // Агрегация часов по аккаунту+дате (та же логика, что в [accountId].js).
  const agg = {} // accId -> date -> { cost, clicks, conversions }
  for (const h of (hours || [])) {
    if (!allowed.has(h.account_id)) continue
    let date
    if (!spendByUserTz) {
      date = h.metric_date
    } else {
      const zone = h.account_timezone && DateTime.local().setZone(h.account_timezone).isValid ? h.account_timezone : 'UTC'
      const dt = DateTime.fromISO(h.metric_date, { zone }).set({ hour: h.hour })
      if (!dt.isValid) continue
      date = dt.setZone(userTz).toISODate()
    }
    if (!date) continue
    const ad = agg[h.account_id] || (agg[h.account_id] = {})
    const d = ad[date] || (ad[date] = { cost: 0, clicks: 0, conversions: 0 })
    d.cost += +h.cost_native || 0
    d.clicks += +h.clicks || 0
    d.conversions += +h.conversions || 0
  }

  // Overlay: часы перекрывают daily за те же даты (как в [accountId].js).
  for (const [accId, ad] of Object.entries(agg)) {
    const dst = ensure(accId)
    for (const [date, d] of Object.entries(ad)) {
      dst[date] = {
        account_id: accId,
        metric_date: date,
        clicks: d.clicks,
        cost_usd: Math.round(d.cost * 100) / 100,                  // имя историческое; нативная валюта
        conversions: Math.round(d.conversions * 100) / 100,
        cpc_usd: d.clicks > 0 ? Math.round(d.cost / d.clicks * 10000) / 10000 : 0,
        cpa: d.conversions > 0 ? Math.round(d.cost / d.conversions * 100) / 100 : 0,
        source: spendByUserTz ? 'hourly_user_tz' : 'hourly_acct_tz',
      }
    }
  }

  // В массивы по аккаунту — структура { accId: [rows] }, как ждёт /stats.
  const metrics = {}
  for (const [accId, byDate] of Object.entries(byAcc)) {
    metrics[accId] = Object.values(byDate)
  }

  return res.status(200).json({ metrics, spend_by_user_tz: spendByUserTz, user_timezone: userTz })
}
