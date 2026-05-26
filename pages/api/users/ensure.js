import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await getUserIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { email } = req.body || {}

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!existing) {
    const { error } = await supabaseAdmin
      .from('users')
      .insert({ id: userId, email: email || `${userId}@user`, password_hash: 'supabase_auth' })
    if (error && !String(error.message).includes('duplicate')) {
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(200).json({ ok: true })
}
