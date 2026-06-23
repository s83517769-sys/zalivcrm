import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// POST /api/accounts/archive-cleanup
//
// Удаляет навсегда архивные аккаунты, чей archived_at старше N дней,
// где N = user_settings.archive_autodelete_days (default 30).
// Снимки в daily_tech_status / daily_manual_status НЕ удаляются — ON DELETE
// CASCADE для FK на account_id был снят миграцией archive_autodelete_and_*.
// Старые архивные без archived_at (созданные до миграции) НЕ удаляются —
// archived_at IS NULL не попадает под `archived_at < threshold`.
// Триггерится с фронта при заходе на /archive (нет cron).
export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let days = 30
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('archive_autodelete_days')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (Number.isFinite(+us?.archive_autodelete_days) && +us.archive_autodelete_days > 0) {
      days = +us.archive_autodelete_days
    }
  } catch {}

  const thresholdISO = new Date(Date.now() - days * 86400000).toISOString()

  // DELETE FROM accounts WHERE user_id=me AND is_archived=true
  //                       AND archived_at IS NOT NULL AND archived_at < threshold
  // Postgrest .lt() уже игнорирует NULL (NULL < value → NULL → не попадёт), но
  // явный .not('archived_at','is',null) делает запрос самодокументируемым.
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .delete()
    .eq('user_id', USER_ID)
    .eq('is_archived', true)
    .not('archived_at', 'is', null)
    .lt('archived_at', thresholdISO)
    .select('id')

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ deleted: data?.length || 0, days })
}
