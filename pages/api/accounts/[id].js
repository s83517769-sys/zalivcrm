import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
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
      .eq('user_id', USER_ID)
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
      .eq('user_id', USER_ID)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ is_archived: true })
      .eq('id', id)
      .eq('user_id', USER_ID)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
