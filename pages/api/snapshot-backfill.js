import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'

// POST /api/snapshot-backfill
//
// РАЗОВОЕ восстановление потерянных снимков 'Бан' для категории A из разведки:
// молчащие НЕархивные аккаунты (last_seen_at протух > watchdog_hours), у которых
// snapshot 'Бан' за дни молчания отсутствует.
//
// Логика:
//   для каждого неархивного аккаунта с непустым last_seen_at:
//     silence_start = date(last_seen_at + watchdog_hours)
//     если silence_start < today:
//       для каждого дня D от silence_start до today (включительно):
//         если в daily_tech_status нет snapshot за D для этого аккаунта:
//           upsert (account_id, D, 'Бан')
//
// Идемпотентно: upsert по (account_id, snapshot_date) — повторные вызовы
// безопасны, существующие snapshot'ы (тех-Крутит / Пауза / Бан / любые)
// НЕ перезаписываются благодаря явной проверке "уже есть snapshot за этот день".
//
// Возвращает счётчики: сколько аккаунтов обработано, сколько snapshot'ов
// вставлено, сколько уже существовало (пропущено).
//
// Категории B/C/D из разведки (архивные с не-Бан snapshot / архивные без
// snapshot / физически удалённые) НЕ покрываются этим backfill'ом —
// решение по ним отложено.

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let watchdogHrs = 2
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('watchdog_hours')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (Number.isFinite(+us?.watchdog_hours) && +us.watchdog_hours > 0) watchdogHrs = +us.watchdog_hours
  } catch {}

  // Только неархивные с непустым last_seen_at. Архивные исключены.
  const { data: accounts, error: accErr } = await supabaseAdmin
    .from('accounts')
    .select('id, last_seen_at')
    .eq('user_id', USER_ID)
    .eq('is_archived', false)
    .not('last_seen_at', 'is', null)
  if (accErr) return res.status(500).json({ error: accErr.message })

  const todayISO = new Date().toISOString().split('T')[0]
  const threshold = Date.now() - watchdogHrs * 3600 * 1000

  const silentAccountIds = []
  const silenceStartByAcc = {}
  for (const a of (accounts || [])) {
    const lastSeenMs = new Date(a.last_seen_at).getTime()
    if (!Number.isFinite(lastSeenMs)) continue
    if (lastSeenMs > threshold) continue
    // Первый день молчания (по UTC, как и snapshot_date в БД)
    const silenceStartMs = lastSeenMs + watchdogHrs * 3600 * 1000
    const silenceStartISO = new Date(silenceStartMs).toISOString().split('T')[0]
    silentAccountIds.push(a.id)
    silenceStartByAcc[a.id] = silenceStartISO
  }

  if (!silentAccountIds.length) {
    return res.status(200).json({
      processed: 0,
      silent_accounts: 0,
      inserted: 0,
      already_existing: 0,
      note: 'Нет неархивных молчащих аккаунтов под порогом.',
    })
  }

  // Какие snapshot'ы уже есть для этих аккаунтов начиная с минимального
  // silence_start. Чтобы не топтать существующие записи (если в день
  // молчания ingest всё-таки прилетел и записал что-то другое, или sweep
  // уже отработал).
  const minStart = Object.values(silenceStartByAcc).sort()[0]
  const { data: existingSnapshots, error: snapErr } = await supabaseAdmin
    .from('daily_tech_status')
    .select('account_id, snapshot_date')
    .eq('user_id', USER_ID)
    .gte('snapshot_date', minStart)
    .lte('snapshot_date', todayISO)
    .in('account_id', silentAccountIds)
  if (snapErr) return res.status(500).json({ error: snapErr.message })

  const existingSet = new Set(
    (existingSnapshots || []).map(s => `${s.account_id}|${s.snapshot_date}`)
  )

  const nowISO = new Date().toISOString()
  const rowsToInsert = []
  let alreadyExisting = 0

  for (const accId of silentAccountIds) {
    const start = silenceStartByAcc[accId]
    // Перебираем дни от silence_start до today включительно
    let cursor = new Date(start + 'T00:00:00Z').getTime()
    const todayMs = new Date(todayISO + 'T00:00:00Z').getTime()
    while (cursor <= todayMs) {
      const dayISO = new Date(cursor).toISOString().split('T')[0]
      const key = `${accId}|${dayISO}`
      if (existingSet.has(key)) {
        alreadyExisting++
      } else {
        rowsToInsert.push({
          account_id: accId,
          user_id: USER_ID,
          snapshot_date: dayISO,
          tech_status: 'Бан',
          updated_at: nowISO,
        })
      }
      cursor += 86400000
    }
  }

  let insertError = null
  if (rowsToInsert.length) {
    // Upsert с onConflict для бронежилета — даже если existingSet что-то
    // упустил из-за гонки, конфликт PK будет тихо разрешён.
    const { error } = await supabaseAdmin
      .from('daily_tech_status')
      .upsert(rowsToInsert, { onConflict: 'account_id,snapshot_date', ignoreDuplicates: true })
    if (error) insertError = error.message
  }

  return res.status(200).json({
    processed: accounts?.length || 0,
    silent_accounts: silentAccountIds.length,
    inserted: rowsToInsert.length,
    already_existing: alreadyExisting,
    error: insertError,
  })
}
