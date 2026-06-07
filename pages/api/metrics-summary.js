import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const { data, error } = await supabaseAdmin
    .from('daily_metrics')
    .select('account_id, metric_date, clicks, cpc_usd, cost_usd, conversions, cpa')
    .eq('user_id', USER_ID)
    .in('metric_date', [today, yesterday])

  if (error) return res.status(500).json({ error: error.message })

  // Валюта каждого аккаунта (cost_usd хранит НАТИВНУЮ валюту, нормализация — на клиенте)
  const { data: accs } = await supabaseAdmin
    .from('accounts')
    .select('id, currency')
    .eq('user_id', USER_ID)
  const curMap = Object.fromEntries((accs || []).map(a => [a.id, a.currency || 'USD']))

  // Группируем по account_id
  const summary = {}
  for (const row of (data || [])) {
    if (!summary[row.account_id]) summary[row.account_id] = { currency: curMap[row.account_id] || 'USD' }
    if (row.metric_date === today) {
      summary[row.account_id].today = row
    } else {
      summary[row.account_id].yesterday = row
    }
  }

  return res.status(200).json({ summary })
}
