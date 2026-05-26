import { supabaseAdmin } from '../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ accounts: data || [] })
  }

  if (req.method === 'POST') {
    const body = { ...req.body }
    const today = new Date().toISOString().split('T')[0]

    // Автодата пуска
    if (body.status === 'Пуск' && !body.launch_date) {
      body.launch_date = today
    }
    // Автодата крута
    if (body.status && body.status.toLowerCase().includes('крутит') && !body.crut_date) {
      body.crut_date = today
    }
    // Заморозка при финальных статусах
    if (['БАН', 'На смену', 'Отмена запуска'].includes(body.status)) {
      body.is_frozen = true
      if (!body.ban_date) body.ban_date = today
    }

    // Убираем пустые строки чтобы не было ошибок
    Object.keys(body).forEach(k => {
      if (body[k] === '') body[k] = null
    })

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert({ ...body, user_id: USER_ID })
      .select()
      .single()

    if (error) {
      console.error('INSERT ERROR:', error)
      return res.status(500).json({ error: error.message, details: error })
    }
    return res.status(200).json({ account: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
