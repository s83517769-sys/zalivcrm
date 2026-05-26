import { supabaseAdmin } from '../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const { data, error } = await supabaseAdmin
    .from('daily_metrics')
    .select('account_id, metric_date, clicks, cpc_usd, cost_usd, conversions, cpa')
    .eq('user_id', USER_ID)
    .in('metric_date', [today, yesterday])

  if (error) return res.status(500).json({ error: error.message })

  // Группируем по account_id
  const summary = {}
  for (const row of (data || [])) {
    if (!summary[row.account_id]) summary[row.account_id] = {}
    if (row.metric_date === today) {
      summary[row.account_id].today = row
    } else {
      summary[row.account_id].yesterday = row
    }
  }

  return res.status(200).json({ summary })
}
