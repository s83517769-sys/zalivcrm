import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// GET /api/stats/manual-status?year=YYYY&month=M (1-12)
//
// Возвращает агрегаты по daily_manual_status за указанный месяц:
//   {
//     by_day: { 'YYYY-MM-DD': { 'Крутит': 17, 'БАН': 2, ... }, ... },
//     first_snapshot: 'YYYY-MM-DD' | null   // дата самого старого снимка для юзера
//   }
// Дни без снимков отсутствуют в by_day — фронт отрисовывает их прочерком.
// Зеркало /api/stats/tech-status — один шаблон для обоих осей.
export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const year = parseInt(req.query.year)
  const month = parseInt(req.query.month) // 1..12
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year + month (1-12) required' })
  }

  const mm = String(month).padStart(2, '0')
  const monthStart = `${year}-${mm}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const { data, error } = await supabaseAdmin
    .from('daily_manual_status')
    .select('snapshot_date, status')
    .eq('user_id', USER_ID)
    .gte('snapshot_date', monthStart)
    .lt('snapshot_date', nextMonth)

  if (error) return res.status(500).json({ error: error.message })

  const by_day = {}
  for (const row of (data || [])) {
    const d = row.snapshot_date
    const s = row.status
    if (!by_day[d]) by_day[d] = {}
    by_day[d][s] = (by_day[d][s] || 0) + 1
  }

  const { data: firstRow } = await supabaseAdmin
    .from('daily_manual_status')
    .select('snapshot_date')
    .eq('user_id', USER_ID)
    .order('snapshot_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  return res.status(200).json({
    by_day,
    first_snapshot: firstRow?.snapshot_date || null,
  })
}
