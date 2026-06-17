import { DateTime } from 'luxon'
import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

const DEFAULT_TZ = 'Asia/Nicosia'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  const { accountId } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('daily_metrics')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', USER_ID)
      .order('metric_date', { ascending: false })
      .limit(365)
    if (error) return res.status(500).json({ error: error.message })

    // Если режим «спенд по поясу пользователя» ВЫКЛЮЧЕН — отдаём daily_metrics как есть (по поясу аккаунта)
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

    if (!spendByUserTz) {
      return res.status(200).json({ metrics: data || [] })
    }

    // Режим ON: дни из часов под пояс пользователя — точнее дневной таблицы, перекрывают её
    const byDate = {}
    for (const r of (data || [])) byDate[r.metric_date] = r
    try {

      const since = DateTime.now().setZone(userTz).minus({ days: 92 }).toISODate()
      const { data: hours } = await supabaseAdmin
        .from('hourly_metrics')
        .select('metric_date, hour, account_timezone, cost_native, clicks, conversions')
        .eq('account_id', accountId)
        .eq('user_id', USER_ID)
        .gte('metric_date', since)

      const days = {} // userDate -> агрегат
      for (const h of (hours || [])) {
        const zone = h.account_timezone && DateTime.local().setZone(h.account_timezone).isValid ? h.account_timezone : 'UTC'
        const dt = DateTime.fromISO(h.metric_date, { zone }).set({ hour: h.hour })
        if (!dt.isValid) continue
        const userDate = dt.setZone(userTz).toISODate()
        const d = days[userDate] || (days[userDate] = { cost: 0, clicks: 0, conversions: 0 })
        d.cost += +h.cost_native || 0
        d.clicks += +h.clicks || 0
        d.conversions += +h.conversions || 0
      }
      for (const [date, d] of Object.entries(days)) {
        byDate[date] = {
          id: `h-${accountId}-${date}`,
          account_id: accountId,
          metric_date: date,
          clicks: d.clicks,
          cost_usd: Math.round(d.cost * 100) / 100,   // имя историческое; нативная валюта
          conversions: Math.round(d.conversions * 100) / 100,
          cpc_usd: d.clicks > 0 ? Math.round(d.cost / d.clicks * 10000) / 10000 : 0,
          cpa: d.conversions > 0 ? Math.round(d.cost / d.conversions * 100) / 100 : 0,
          source: 'hourly',
        }
      }
    } catch (e) {
      console.error('hourly day-rollup error:', e)
    }

    const merged = Object.values(byDate)
      .sort((a, b) => (a.metric_date < b.metric_date ? 1 : -1))
      .slice(0, 365)
    return res.status(200).json({ metrics: merged })
  }

  if (req.method === 'POST') {
    const { metric_date, clicks, cpc_local, cpc_usd, cost_usd, conversions } = req.body
    const cpa = conversions > 0 ? cost_usd / conversions : 0

    const { error } = await supabaseAdmin
      .from('daily_metrics')
      .upsert({
        account_id: accountId,
        user_id: USER_ID,
        metric_date,
        clicks: clicks || 0,
        cpc_local: cpc_local || 0,
        cpc_usd: cpc_usd || 0,
        cost_usd: cost_usd || 0,
        conversions: conversions || 0,
        cpa,
      }, { onConflict: 'account_id,metric_date' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
