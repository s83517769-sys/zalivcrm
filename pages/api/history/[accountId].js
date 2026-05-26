import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  const { accountId } = req.query

  const { data, error } = await supabaseAdmin
    .from('account_history')
    .select('*')
    .eq('account_id', accountId)
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ history: data })
}
