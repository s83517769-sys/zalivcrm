/**
 * PATCH /api/accounts/[id]
 * Update account manual fields: manual_status, card, comment, etc.
 */

import { supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = req.headers['x-api-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key' })

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('api_key', apiKey)
    .single()

  if (!user) return res.status(401).json({ error: 'Invalid API key' })

  // Проверяем что аккаунт принадлежит пользователю
  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('id, manual_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!account) return res.status(404).json({ error: 'Account not found' })

  const allowed = [
    'manual_status', 'card', 'clo_url', 'black_utm', 'white_id',
    'comment', 'dis_date', 'dis_reason', 'dis_solution',
    'domain', 'format', 'crea', 'voronka', 'google_tag',
    'geo', 'lang', 'devices', 'is_archived', 'is_hidden',
  ]

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key]
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }

  updates.updated_at = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('accounts')
    .update(updates)
    .eq('id', id)

  if (error) return res.status(500).json({ error: error.message })

  // Логируем смену ручного статуса
  if (updates.manual_status && updates.manual_status !== account.manual_status) {
    await supabaseAdmin
      .from('account_history')
      .insert({
        account_id: id,
        user_id: user.id,
        change_type: 'status',
        field_name: 'manual_status',
        old_value: account.manual_status || '—',
        new_value: updates.manual_status,
      })
  }

  return res.status(200).json({ ok: true })
}
