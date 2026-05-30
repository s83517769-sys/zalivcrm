import { supabaseAdmin } from '../../../lib/supabase'

function tokenFrom(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

export default async function handler(req, res) {
  const token = tokenFrom(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !authData?.user) return res.status(401).json({ error: 'Unauthorized' })
  const user = authData.user
  const userId = user.id

  if (req.method === 'GET') {
    const { data: row } = await supabaseAdmin
      .from('users')
      .select('api_key, email')
      .eq('id', userId)
      .maybeSingle()

    const meta = user.user_metadata || {}
    return res.status(200).json({
      profile: {
        id: userId,
        email: user.email || row?.email || '',
        name: meta.name || meta.full_name || meta.user_name || '',
        avatar_url: meta.avatar_url || meta.picture || '',
        api_key: row?.api_key || null,
      },
    })
  }

  if (req.method === 'PATCH') {
    const { name } = req.body || {}
    if (typeof name !== 'string') return res.status(400).json({ error: 'name required' })

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { ...(user.user_metadata || {}), name: name.trim() },
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
