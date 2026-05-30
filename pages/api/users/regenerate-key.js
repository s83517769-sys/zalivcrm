import { randomBytes } from 'crypto'
import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await getUserIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  // 64-символьный hex-ключ (как формат существующих ключей)
  const newKey = randomBytes(32).toString('hex')

  const { error } = await supabaseAdmin
    .from('users')
    .update({ api_key: newKey })
    .eq('id', userId)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, api_key: newKey })
}
