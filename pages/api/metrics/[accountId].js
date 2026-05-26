import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

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
      .limit(31)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ metrics: data })
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
