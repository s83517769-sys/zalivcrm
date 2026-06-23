import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// POST /api/accounts/delete
//   { ids: [...] }  → реальное удаление аккаунтов навсегда.
//
// Защиты:
//   - удаляем ТОЛЬКО архивные (is_archived=true). Случайно выпилить активный
//     невозможно даже если фронт прислал id активного.
//   - удаляем только аккаунты текущего пользователя (eq user_id).
//
// Снимки в daily_tech_status / daily_manual_status НЕ удаляются — каскад
// был снят миграцией archive_autodelete_and_snapshot_protection.sql.
// Историческая статистика этого аккаунта сохраняется навсегда.
export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { ids } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' })
  }

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .delete()
    .eq('user_id', USER_ID)
    .eq('is_archived', true)
    .in('id', ids)
    .select('id')

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ deleted: data?.length || 0 })
}
