import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('is_archived', true)
    .order('updated_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ accounts: data || [] })
}
