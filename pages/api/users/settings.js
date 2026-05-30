import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

const DEFAULT_WATCHDOG_HOURS = 2

export default async function handler(req, res) {
  const userId = await getUserIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    // select * — устойчиво к отсутствию кастомных колонок
    const { data: row } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    return res.status(200).json({
      settings: {
        custom_statuses: row?.custom_statuses || [],
        custom_groups: row?.custom_groups || [],
        watchdog_hours: row?.watchdog_hours ?? DEFAULT_WATCHDOG_HOURS,
      },
    })
  }

  if (req.method === 'POST') {
    const { custom_statuses, custom_groups, watchdog_hours } = req.body || {}
    const patch = { user_id: userId, updated_at: new Date().toISOString() }
    if (custom_statuses !== undefined) patch.custom_statuses = custom_statuses
    if (custom_groups !== undefined) patch.custom_groups = custom_groups
    if (watchdog_hours !== undefined) patch.watchdog_hours = watchdog_hours

    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert(patch, { onConflict: 'user_id' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
