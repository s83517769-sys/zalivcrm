import { supabaseAdmin } from '../../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  const { accountId } = req.query

  const { data, error } = await supabaseAdmin
    .from('account_history')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ history: data })
}
