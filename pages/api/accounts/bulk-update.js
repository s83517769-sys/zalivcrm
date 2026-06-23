import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'
import { effectiveTechStatus } from '../../../lib/techStatus'

// Поля, разрешённые к массовому изменению
const ALLOWED = ['status', 'zalivshik', 'geo', 'funnel', 'format', 'creo', 'dis_reason', 'comment', 'is_archived']
// Поля, которые логируем в account_history
const HISTORY_FIELDS = ['status', 'zalivshik', 'geo', 'funnel', 'format', 'creo', 'dis_reason', 'comment']

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

  // Прежние значения для Undo (только меняемые поля). Когда массово архивим
  // (см. блок снимков ниже) — нужны ещё поля для effectiveTechStatus, поэтому
  // в этом случае тянем строки целиком.
  const archivingNow = changes.is_archived === true
  const cols = ['id', ...Object.keys(patch)].join(', ')
  const { data: before, error: selErr } = await supabaseAdmin
    .from('accounts')
    .select(archivingNow ? '*' : cols)
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

  // История по каждому изменённому полю
  if (Array.isArray(before)) {
    const rows = []
    for (const field of HISTORY_FIELDS) {
      if (!(field in patch)) continue
      const nv = patch[field]
      for (const b of before) {
        const ov = b[field]
        if ((ov ?? null) === (nv ?? null)) continue
        rows.push({
          account_id: b.id, user_id: USER_ID, field_name: field,
          old_value: ov == null ? null : String(ov),
          new_value: nv == null ? null : String(nv),
          note: 'Массовое изменение',
        })
      }
    }
    if (rows.length) await supabaseAdmin.from('account_history').insert(rows)
  }

  // Архивация: фиксируем СНИМОК ЗА СЕГОДНЯ для обеих осей у каждого аккаунта,
  // которого этот батч реально переводит из активного в архивный (false→true).
  // Без этого ингест после архивации пропускает аккаунт, и столбец «день
  // архивации» в /stats остаётся пустым.
  // Изолированный try/catch — ошибка не валит основной апдейт.
  if (archivingNow && Array.isArray(before)) {
    const transitioning = before.filter(b => b.is_archived !== true)
    if (transitioning.length > 0) {
      let watchdogHrs = 2, moderationHrs = 12
      try {
        const { data: us } = await supabaseAdmin
          .from('user_settings')
          .select('watchdog_hours, moderation_hours')
          .eq('user_id', USER_ID)
          .maybeSingle()
        if (Number.isFinite(+us?.watchdog_hours) && +us.watchdog_hours > 0) watchdogHrs = +us.watchdog_hours
        if (Number.isFinite(+us?.moderation_hours) && +us.moderation_hours > 0) moderationHrs = +us.moderation_hours
      } catch {}

      const today = new Date().toISOString().split('T')[0]
      const updatedManual = patch.status // если бэтч также менял status — берём новый
      const techRows = []
      const manualRows = []
      for (const b of transitioning) {
        const after = { ...b, ...patch }
        try {
          const eff = effectiveTechStatus(after, watchdogHrs, moderationHrs)
          if (eff) techRows.push({
            account_id: b.id, user_id: USER_ID, snapshot_date: today,
            tech_status: eff, updated_at: now,
          })
        } catch {}
        const manualNow = updatedManual ?? b.status
        if (manualNow) manualRows.push({
          account_id: b.id, user_id: USER_ID, snapshot_date: today,
          status: manualNow, updated_at: now,
        })
      }
      try {
        if (techRows.length) await supabaseAdmin
          .from('daily_tech_status')
          .upsert(techRows, { onConflict: 'account_id,snapshot_date' })
      } catch {}
      try {
        if (manualRows.length) await supabaseAdmin
          .from('daily_manual_status')
          .upsert(manualRows, { onConflict: 'account_id,snapshot_date' })
      } catch {}
    }
  }

  return res.status(200).json({ ok: true, updated: ids.length, before: before || [] })
}
