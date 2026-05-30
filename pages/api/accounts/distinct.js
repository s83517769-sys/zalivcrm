import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// Поля, по которым разрешено собирать distinct (для combobox)
const ALLOWED = ['ban_reason', 'dis_reason', 'dis_solution', 'zalivshik', 'geo', 'funnel', 'creo', 'card']

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })

  const { field } = req.query
  if (!ALLOWED.includes(field)) return res.status(400).json({ error: 'field not allowed' })

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select(field)
    .eq('user_id', USER_ID)
    .not(field, 'is', null)

  if (error) return res.status(500).json({ error: error.message })

  const values = [...new Set((data || []).map(r => r[field]).filter(v => v != null && String(v).trim() !== ''))]
    .sort((a, b) => String(a).localeCompare(String(b)))

  return res.status(200).json({ values })
}
