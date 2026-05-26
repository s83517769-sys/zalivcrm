import { supabaseAdmin } from '../../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  const { id } = req.query

  if (req.method === 'PATCH') {
    const body = { ...req.body }
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Получаем текущий аккаунт
    const { data: current } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single()

    if (!current) return res.status(404).json({ error: 'Not found' })

    // Логика автодат
    if (body.status && body.status !== current.status) {
      if (body.status === 'Пуск' && !current.launch_date) {
        body.launch_date = today
      }
      if (body.status && body.status.toLowerCase().includes('крутит') && !current.crut_date) {
        body.crut_date = today
      }
      const frozen = ['БАН', 'На смену', 'Отмена запуска']
      if (frozen.includes(body.status)) {
        body.is_frozen = true
        if (!current.ban_date) body.ban_date = today
      }

      // Пишем историю
      await supabaseAdmin.from('account_history').insert({
        account_id: id,
        user_id: USER_ID,
        field_name: 'status',
        old_value: current.status,
        new_value: body.status,
      })
    }

    // Логируем изменение дизапрува
    if (body.dis_reason && body.dis_reason !== current.dis_reason) {
      await supabaseAdmin.from('account_history').insert({
        account_id: id,
        user_id: USER_ID,
        field_name: 'dis_reason',
        old_value: current.dis_reason,
        new_value: body.dis_reason,
      })
    }

    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ ...body, updated_at: now.toISOString() })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ is_archived: true })
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
