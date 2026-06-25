import { DateTime } from 'luxon'
import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'

const DEFAULT_TZ = 'Asia/Nicosia'

// Пагинированная выборка hourly_metrics. Supabase / PostgREST по умолчанию
// возвращает максимум 1000 строк на запрос — при 60+ активных аккаунтах ×
// 3 дня × 24 часа лимит срабатывает и отрезает хвост (наиболее свежие часы
// = «сегодня»). Цикл .range(from, from + 999) тянет страницы пока возвращается
// полная (== pageSize) — иначе выходим.
async function fetchAllHourly(supabase, userId, sinceDate, columns) {
  const pageSize = 1000
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('hourly_metrics')
      .select(columns)
      .eq('user_id', userId)
      .gte('metric_date', sinceDate)
      .range(from, from + pageSize - 1)
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

  // Настройки: пояс пользователя + режим спенда (по умолчанию false — как в Google Ads)
  let userTz = DEFAULT_TZ
  let spendByUserTz = false
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (us?.user_timezone && DateTime.local().setZone(us.user_timezone).isValid) {
      userTz = us.user_timezone
    }
    spendByUserTz = us?.spend_by_user_tz === true
  } catch {}

  // ── Режим OFF (по умолчанию): спенд «как в Google Ads» ──
  // Источник — те же hourly_metrics, но агрегируем по поясу КАЖДОГО АККАУНТА (а не пользователя).
  // hourly_metrics.metric_date уже хранится по поясу аккаунта (так пишет скрипт v2), поэтому
  // достаточно сравнить с «сегодня/вчера» в поясе этого аккаунта — без перевода времени.
  if (!spendByUserTz) {
    const { data: accs, error: accErr } = await supabaseAdmin
      .from('accounts')
      .select('id, currency, account_timezone')
      .eq('user_id', USER_ID)
    if (accErr) return res.status(500).json({ error: accErr.message })

    const summary = {}
    for (const a of (accs || [])) summary[a.id] = { currency: a.currency || 'USD' }
    const accMap = Object.fromEntries((accs || []).map(a => [a.id, a]))

    // Окно ~3 даты покрывает любые «сегодня/вчера» при любых поясах (-12..+14).
    // Считаем по UTC-дате с запасом 2 дня вперёд/назад от текущей.
    const utcNow = DateTime.utc()
    const sinceDate = utcNow.minus({ days: 2 }).toISODate()
    const { data: hours, error: hErr } = await fetchAllHourly(
      supabaseAdmin, USER_ID, sinceDate,
      'account_id, metric_date, account_timezone, cost_native, clicks, conversions'
    )
    if (hErr) return res.status(500).json({ error: hErr.message })

    // Группируем часы по account_id + понимаем пояс аккаунта (из самих часов или из accounts).
    const byAcc = {}
    for (const h of (hours || [])) {
      const g = byAcc[h.account_id] || (byAcc[h.account_id] = { tz: null, rows: [] })
      if (!g.tz && h.account_timezone) g.tz = h.account_timezone
      g.rows.push(h)
    }

    const hourlyAccounts = new Set()
    for (const [accId, g] of Object.entries(byAcc)) {
      const zoneRaw = g.tz || accMap[accId]?.account_timezone || 'UTC'
      const zone = DateTime.local().setZone(zoneRaw).isValid ? zoneRaw : 'UTC'
      const todayAcc     = DateTime.now().setZone(zone).toISODate()
      const yesterdayAcc = DateTime.now().setZone(zone).minus({ days: 1 }).toISODate()

      const buckets = { today: { cost: 0, clicks: 0, conv: 0 }, yesterday: { cost: 0, clicks: 0, conv: 0 } }
      let touched = false
      for (const h of g.rows) {
        let key = null
        if (h.metric_date === todayAcc) key = 'today'
        else if (h.metric_date === yesterdayAcc) key = 'yesterday'
        if (!key) continue
        touched = true
        buckets[key].cost += +h.cost_native || 0
        buckets[key].clicks += +h.clicks || 0
        buckets[key].conv += +h.conversions || 0
      }
      if (!touched) continue
      hourlyAccounts.add(accId)
      const entry = summary[accId] || (summary[accId] = { currency: accMap[accId]?.currency || 'USD' })
      const pack = (b) => ({
        cost_usd: Math.round(b.cost * 100) / 100,                  // имя историческое; нативная валюта
        clicks: b.clicks,
        conversions: Math.round(b.conv * 100) / 100,
        cpc_usd: b.clicks > 0 ? Math.round(b.cost / b.clicks * 10000) / 10000 : 0,
        cpa: b.conv > 0 ? Math.round(b.cost / b.conv * 100) / 100 : 0,
      })
      if (buckets.today.cost > 0 || buckets.today.clicks > 0 || buckets.today.conv > 0) entry.today = pack(buckets.today)
      if (buckets.yesterday.cost > 0 || buckets.yesterday.clicks > 0 || buckets.yesterday.conv > 0) entry.yesterday = pack(buckets.yesterday)
    }

    // Daily-фоллбэк = AUGMENT, не skip. Раньше блок пропускал аккаунт с любыми
    // hourly-строками (`if (hourlyAccounts.has(...)) continue`) — из-за этого
    // если today-часы не подтянулись (лимит 1000, gap скрипта, любое), summary
    // оставался без today, хотя daily_metrics за сегодня в БД был.
    //
    // Теперь: для каждой daily-строки определяем, относится ли она к «сегодня»
    // / «вчера» В ПОЯСЕ АККАУНТА (как в hourly-бакетах выше). hourly остаётся
    // приоритетным — daily проставляем только если entry.today/yesterday ещё
    // не выставлен. Окно расширяю до 3-х UTC-дней, чтобы покрыть случаи когда
    // account-TZ today сдвинут относительно UTC даты, по которой ingest пишет
    // metric_date.
    const dailyWindowStart = utcNow.minus({ days: 2 }).toISODate()
    const { data: dms } = await supabaseAdmin
      .from('daily_metrics')
      .select('account_id, metric_date, clicks, cpc_usd, cost_usd, conversions, cpa')
      .eq('user_id', USER_ID)
      .gte('metric_date', dailyWindowStart)
    for (const row of (dms || [])) {
      const acc = accMap[row.account_id]
      const zoneRaw = acc?.account_timezone || 'UTC'
      const zone = DateTime.local().setZone(zoneRaw).isValid ? zoneRaw : 'UTC'
      const todayAcc     = DateTime.now().setZone(zone).toISODate()
      const yesterdayAcc = DateTime.now().setZone(zone).minus({ days: 1 }).toISODate()
      const entry = summary[row.account_id] || (summary[row.account_id] = { currency: acc?.currency || 'USD' })
      if      (row.metric_date === todayAcc     && !entry.today)     entry.today = row
      else if (row.metric_date === yesterdayAcc && !entry.yesterday) entry.yesterday = row
    }

    return res.status(200).json({ summary, user_timezone: userTz, spend_by_user_tz: false })
  }

  // ── Режим ON: пересборка из hourly_metrics под user_timezone (предыдущая логика) ──
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

  // 1. Аккаунты с почасовыми данными — пересборка под пояс пользователя.
  // Окно в 3 даты по поясу аккаунта покрывает любые смещения (-12..+14) и DST.
  // Тянем пагинированно — обходим дефолтный лимит Supabase 1000 строк (см.
  // fetchAllHourly наверху файла), иначе при росте числа аккаунтов хвост
  // (свежие часы = «сегодня») снова потеряется.
  const sinceDate = nowU.minus({ days: 2 }).toISODate()
  const hourlyAccounts = new Set()
  try {
    const { data: hours } = await fetchAllHourly(
      supabaseAdmin, USER_ID, sinceDate,
      'account_id, metric_date, hour, account_timezone, cost_native, clicks, conversions'
    )

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
          cost_usd: Math.round(b.cost * 100) / 100,
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

  // 2. Daily-фоллбэк = AUGMENT, не skip (см. комментарий в OFF-режиме выше).
  // hourly остаётся приоритетным, daily проставляется только в пробелы. Окно
  // — 3 UTC-дня, чтобы покрыть пояса. Сравнение «сегодня»/«вчера» делается
  // в поясе ПОЛЬЗОВАТЕЛЯ (todayU/yesterdayU уже посчитаны выше) — той же
  // логикой, что и hourly-бакеты в ON-режиме.
  const dailyWindowStart = DateTime.utc().minus({ days: 2 }).toISODate()
  const { data, error } = await supabaseAdmin
    .from('daily_metrics')
    .select('account_id, metric_date, clicks, cpc_usd, cost_usd, conversions, cpa')
    .eq('user_id', USER_ID)
    .gte('metric_date', dailyWindowStart)

  if (error) return res.status(500).json({ error: error.message })

  for (const row of (data || [])) {
    const entry = ensure(row.account_id)
    if      (row.metric_date === todayU     && !entry.today)     entry.today = row
    else if (row.metric_date === yesterdayU && !entry.yesterday) entry.yesterday = row
  }

  return res.status(200).json({ summary, user_timezone: userTz, spend_by_user_tz: true })
}
