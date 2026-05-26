import { supabaseAdmin } from '../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  const userId = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ accounts: data })
  }

  if (req.method === 'POST') {
    const body = req.body
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Автодата пуска
    if (body.status === 'Пуск' && !body.launch_date) {
      body.launch_date = today
    }
    // Автодата крута
    if (body.status && body.status.toLowerCase().includes('крутит') && !body.crut_date) {
      body.crut_date = today
    }
    // Заморозка при финальных статусах
    const frozen = ['БАН', 'На смену', 'Отмена запуска']
    if (frozen.includes(body.status)) {
      body.is_frozen = true
      if (!body.ban_date) body.ban_date = today
    }

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert({ ...body, user_id: userId })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ account: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
