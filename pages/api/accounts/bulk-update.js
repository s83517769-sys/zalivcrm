import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// Поля, разрешённые к массовому изменению
const ALLOWED = ['status', 'zalivshik', 'geo', 'is_archived']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  const { ids, changes } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' })
  }
  if (!changes || typeof changes !== 'object') {
    return res.status(400).json({ error: 'changes object required' })
  }

  // Только разрешённые поля
  const patch = {}
  for (const k of ALLOWED) if (k in changes) patch[k] = changes[k]
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no allowed fields in changes' })
  }

  // Прежние значения для Undo (только меняемые поля)
  const cols = ['id', ...Object.keys(patch)].join(', ')
  const { data: before, error: selErr } = await supabaseAdmin
    .from('accounts')
    .select(cols)
    .eq('user_id', USER_ID)
    .in('id', ids)
  if (selErr) return res.status(500).json({ error: selErr.message })

  const now = new Date().toISOString()
  const { error: updErr } = await supabaseAdmin
    .from('accounts')
    .update({ ...patch, updated_at: now })
    .eq('user_id', USER_ID)
    .in('id', ids)
  if (updErr) return res.status(500).json({ error: updErr.message })

  // История по смене статуса
  if ('status' in patch && Array.isArray(before)) {
    const rows = before
      .filter(b => b.status !== patch.status)
      .map(b => ({
        account_id: b.id, user_id: USER_ID, field_name: 'status',
        old_value: b.status, new_value: patch.status, note: 'Массовое изменение',
      }))
    if (rows.length) await supabaseAdmin.from('account_history').insert(rows)
  }

  return res.status(200).json({ ok: true, updated: ids.length, before: before || [] })
}
