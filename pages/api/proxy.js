import { supabaseAdmin } from '../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

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
