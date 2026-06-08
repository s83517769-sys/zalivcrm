import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'
import { DEFAULT_STATUS_AUTOMATIONS, TERMINAL_STATUS_NAMES } from '../../../lib/defaults'

const METRIC_FIELDS = ['today_cost','today_clicks','today_cpc','today_conv','yest_cost','yest_clicks','yest_cpc','yest_conv']

export default async function handler(req, res) {
  const USER_ID = await getUserIdFromRequest(req)
  if (!USER_ID) return res.status(401).json({ error: 'Unauthorized' })
  const { id } = req.query

  if (req.method === 'PATCH') {
    const body = { ...req.body }
    // Пустые строки → null (иначе date/числовые колонки падают на '' → 500).
    // Делаем до автоматизаций и истории, чтобы очистка поля давала чистый null.
    Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null })
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Получаем текущий аккаунт
    const { data: current } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', USER_ID)
      .single()

    if (!current) return res.status(404).json({ error: 'Not found' })

    // Настройки автоматизаций (best-effort)
    let autos = DEFAULT_STATUS_AUTOMATIONS
    let terminalNames = TERMINAL_STATUS_NAMES
    try {
      const { data: us } = await supabaseAdmin
        .from('user_settings')
        .select('status_automations, custom_statuses')
        .eq('user_id', USER_ID)
        .maybeSingle()
      if (us?.status_automations && Object.keys(us.status_automations).length) autos = { ...autos, ...us.status_automations }
      if (Array.isArray(us?.custom_statuses) && us.custom_statuses.length) {
        const t = us.custom_statuses.filter(s => s.category === 'terminal').map(s => s.name)
        if (t.length) terminalNames = t
      }
    } catch {}

    // Смена статуса (включая очистку в null)
    if ('status' in body && body.status !== current.status) {
      // Автодаты — только при установке непустого статуса
      if (body.status) {
        if (autos.pusk_sets_start_date && body.status === 'Пуск' && !current.launch_date) {
          body.launch_date = today
        }
        if (autos.krutit_sets_crut_date && body.status.toLowerCase().includes('крутит') && !current.crut_date) {
          body.crut_date = today
        }
        if (terminalNames.includes(body.status)) {
          body.is_frozen = true
          if (!current.ban_date) body.ban_date = today
        }
      }

      // Пишем историю (set и clear)
      await supabaseAdmin.from('account_history').insert({
        account_id: id,
        user_id: USER_ID,
        field_name: 'status',
        old_value: current.status,
        new_value: body.status,
      })
    }

    // Автоматизация: заполнили причину бана → только автодата бана (status НЕ трогаем)
    if (autos.ban_reason_to_na_smenu && body.ban_reason && body.ban_reason !== current.ban_reason) {
      if (!current.ban_date && !body.ban_date) body.ban_date = today
    }

    // Логируем изменение дизапрува
    if (body.dis_reason && body.dis_reason !== current.dis_reason) {
      await supabaseAdmin.from('account_history').insert({
        account_id: id,
        user_id: USER_ID,
        field_name: 'dis_reason',
        old_value: current.dis_reason,
        new_value: body.dis_reason,
      })
    }

    // Общий лог изменений прочих полей (status и dis_reason логируются выше)
    const TRACKED = ['name','google_ads_id','geo','zalivshik','funnel','creo','card','google_tag','format','launch_date','crut_date','ban_date','ban_reason','comment']
    const histRows = []
    for (const f of TRACKED) {
      if (f in body && body[f] !== current[f] && String(current[f] ?? '') !== String(body[f] ?? '')) {
        histRows.push({ account_id: id, user_id: USER_ID, field_name: f, old_value: current[f] != null ? String(current[f]) : null, new_value: body[f] != null ? String(body[f]) : null })
      }
    }
    if (histRows.length) await supabaseAdmin.from('account_history').insert(histRows)

    // metrics_manual_override: ручная правка метрики закрепляет поле от перезаписи скриптом
    if ('metrics_manual_override' in current) {
      const overridden = Array.isArray(current.metrics_manual_override) ? [...current.metrics_manual_override] : []
      let changed = false
      for (const f of METRIC_FIELDS) {
        if (f in body && f in current && body[f] !== current[f] && !overridden.includes(f)) {
          overridden.push(f); changed = true
        }
      }
      if (changed) body.metrics_manual_override = overridden
    }

    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ ...body, updated_at: now.toISOString() })
      .eq('id', id)
      .eq('user_id', USER_ID)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ is_archived: true })
      .eq('id', id)
      .eq('user_id', USER_ID)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

