import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('proxy_stock')
      .select('*')
      .eq('user_id', USER_ID)

    if (error) return res.status(500).json({ error: error.message })

    const proxies = {}
    ;(data || []).forEach(row => { proxies[row.geo] = row.count })
    return res.status(200).json({ proxies })
  }

  if (req.method === 'POST') {
    const { geo, count } = req.body

    const { error } = await supabaseAdmin
      .from('proxy_stock')
      .upsert({ user_id: USER_ID, geo, count }, { onConflict: 'user_id,geo' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
