import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'
import { effectiveTechStatus } from '../../lib/techStatus'

// POST /api/snapshot-sweep
//
// Закрывает дыру с потерей снимков у молчащих аккаунтов.
//
// Проблема: daily_tech_status пишется только в ingest (когда аккаунт прислал
// данные) и при архивации (PR #78). Молчащий неархивный аккаунт ingest не
// вызывает → effectiveTechStatus = 'Бан' не фиксируется в БД, аналитика
// недосчитывает бан. См. отчёт по разведке: https://claude.ai/code/session_01FtqvQDDt6R9daa2kET4BsK
//
// Что делает sweep: проходит по ВСЕМ неархивным аккаунтам юзера, вычисляет
// effectiveTechStatus (с учётом watchdog_hours / moderation_hours из настроек)
// и UPSERT'ит daily_tech_status за сегодня. Заодно пишет daily_manual_status
// (a.status), чтобы обе оси имели одинаковую плотность данных.
//
// Идемпотентно: upsert по (account_id, snapshot_date) — повторные вызовы
// безопасны, перепишут на актуальный статус. Можно дёргать много раз в день.
//
// Триггер: вызывается из pages/stats.js на загрузке (fire-and-forget).
// Архивные ИСКЛЮЧЕНЫ — их финальный snapshot фиксируется при архивации в #78.
//
// Изолирован от ingest и от других путей записи snapshot'ов.
export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Настройки — для effectiveTechStatus
  let watchdogHrs = 2, moderationHrs = 12
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('watchdog_hours, moderation_hours')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (Number.isFinite(+us?.watchdog_hours) && +us.watchdog_hours > 0) watchdogHrs = +us.watchdog_hours
    if (Number.isFinite(+us?.moderation_hours) && +us.moderation_hours > 0) moderationHrs = +us.moderation_hours
  } catch (e) {
    console.error('[snapshot-sweep] settings load failed:', e?.message || e)
  }

  // Все неархивные аккаунты юзера. SELECT * — у разных юзеров на accounts могут
  // быть разные опциональные колонки (today_cost/today_clicks/yest_cost/yest_clicks
  // в схеме не определены, ingest пишет их через guard `if (f in account)`).
  // Явный перечень падал с 42703 «column does not exist» на тех инстансах,
  // где этих колонок нет. effectiveTechStatus защищён от undefined.
  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('is_archived', false)
  if (error) {
    console.error('[snapshot-sweep] accounts select failed:', error.message)
    return res.status(500).json({ error: error.message })
  }

  const today = new Date().toISOString().split('T')[0]
  const now = new Date().toISOString()
  const techRows = []
  const manualRows = []
  let banCount = 0, moderationCount = 0

  for (const a of (accounts || [])) {
    // Тех-снимок: считаем по той же функции, что фронт и ingest
    const eff = effectiveTechStatus(a, watchdogHrs, moderationHrs)
    if (eff) {
      techRows.push({
        account_id: a.id, user_id: USER_ID, snapshot_date: today,
        tech_status: eff, updated_at: now,
      })
      if (eff === 'Бан') banCount++
      else if (eff === 'Модерация') moderationCount++
    }
    // Manual-снимок — текущее значение accounts.status
    if (a.status) {
      manualRows.push({
        account_id: a.id, user_id: USER_ID, snapshot_date: today,
        status: a.status, updated_at: now,
      })
    }
  }

  // Двумя upsert'ами. Каждый в своём блоке — если упадёт один (миграция
  // не выполнена, конфликт RLS), второй всё равно отработает.
  // Ошибки также пишутся в console.error, чтобы быть видимыми в Vercel logs.
  let techError = null, manualError = null
  if (techRows.length) {
    const { error: e } = await supabaseAdmin
      .from('daily_tech_status')
      .upsert(techRows, { onConflict: 'account_id,snapshot_date' })
    if (e) {
      techError = e.message
      console.error('[snapshot-sweep] daily_tech_status upsert failed:', e.message)
    }
  }
  if (manualRows.length) {
    const { error: e } = await supabaseAdmin
      .from('daily_manual_status')
      .upsert(manualRows, { onConflict: 'account_id,snapshot_date' })
    if (e) {
      manualError = e.message
      console.error('[snapshot-sweep] daily_manual_status upsert failed:', e.message)
    }
  }

  return res.status(200).json({
    swept_accounts: accounts?.length || 0,
    tech_snapshots: techRows.length,
    manual_snapshots: manualRows.length,
    detected_today: { ban: banCount, moderation: moderationCount },
    errors: { tech: techError, manual: manualError },
  })
}
