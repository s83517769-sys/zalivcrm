import { DateTime } from 'luxon'
import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'

const DEFAULT_TZ = 'Asia/Nicosia'

// GET /api/metrics-hourly?accountId=...&day=today|yesterday
// Возвращает почасовой спенд за выбранный день.
// Режим OFF (по умолчанию): дни — в поясе АККАУНТА (как в Google Ads). hourly_metrics.metric_date
// и hourly_metrics.hour уже хранятся в поясе аккаунта — просто фильтруем и группируем.
// Режим ON: пересборка под user_timezone — (metric_date, hour, account_timezone) → момент →
// перевод в user_timezone → бакет (date, hour).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  const { accountId, day } = req.query
  if (!accountId) return res.status(400).json({ error: 'accountId required' })
  const which = day === 'yesterday' ? 'yesterday' : 'today'

  // Настройки + пояс аккаунта
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

  const { data: acc } = await supabaseAdmin
    .from('accounts')
    .select('account_timezone')
    .eq('id', accountId)
    .eq('user_id', USER_ID)
    .maybeSingle()
  const accTzRaw = acc?.account_timezone
  const accTz = accTzRaw && DateTime.local().setZone(accTzRaw).isValid ? accTzRaw : 'UTC'

  const zoneForDay = spendByUserTz ? userTz : accTz
  const targetDate = which === 'today'
    ? DateTime.now().setZone(zoneForDay).toISODate()
    : DateTime.now().setZone(zoneForDay).minus({ days: 1 }).toISODate()

  // Окно ±2 дня по UTC — покрывает любые сдвиги поясов (-12..+14).
  const sinceDate = DateTime.utc().minus({ days: 2 }).toISODate()
  const untilDate = DateTime.utc().plus({ days: 1 }).toISODate()
  const { data: rows, error } = await supabaseAdmin
    .from('hourly_metrics')
    .select('metric_date, hour, account_timezone, cost_native')
    .eq('user_id', USER_ID)
    .eq('account_id', accountId)
    .gte('metric_date', sinceDate)
    .lte('metric_date', untilDate)
  if (error) return res.status(500).json({ error: error.message })

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, cost: 0 }))
  for (const r of (rows || [])) {
    let date, hour
    if (!spendByUserTz) {
      // OFF: metric_date/hour уже в поясе аккаунта
      date = r.metric_date
      hour = r.hour
    } else {
      // ON: переводим момент в user_timezone
      const zRaw = r.account_timezone && DateTime.local().setZone(r.account_timezone).isValid
        ? r.account_timezone : 'UTC'
      const dt = DateTime.fromISO(r.metric_date, { zone: zRaw }).set({ hour: r.hour })
      if (!dt.isValid) continue
      const uDt = dt.setZone(userTz)
      date = uDt.toISODate()
      hour = uDt.hour
    }
    if (date !== targetDate) continue
    if (hour < 0 || hour > 23) continue
    hours[hour].cost += +r.cost_native || 0
  }

  for (const h of hours) h.cost = Math.round(h.cost * 100) / 100
  const total = Math.round(hours.reduce((s, h) => s + h.cost, 0) * 100) / 100

  return res.status(200).json({
    hours, date: targetDate, day: which, total,
    timezone: zoneForDay,
    spend_by_user_tz: spendByUserTz,
  })
}
