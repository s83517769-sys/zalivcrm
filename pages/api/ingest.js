import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdByApiKey } from '../../lib/auth'
import { effectiveTechStatus } from '../../lib/techStatus'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = req.headers['x-api-key'] || req.body?.api_key
  const user = await getUserIdByApiKey(key)
  if (!user) return res.status(401).json({ error: 'Invalid API key' })
  // Триал-гейт убран: биллинга ещё нет, а проверка блокировала приём данных
  // (plan='trial' + trial_ends_at в прошлом по дефолтам схемы). Вернём при вводе биллинга.
  const USER_ID = user.id

  const { batch } = req.body
  if (!batch || !Array.isArray(batch)) {
    return res.status(400).json({ error: 'batch array required' })
  }

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Настройки юзера: терминальные ручные статусы (для заморозки tech_status в апдейте),
  // плюс пороги watchdog_hours / moderation_hours — нужны для дневного снимка
  // вычисленного тех-статуса в daily_tech_status. Один запрос на все три ключа.
  let terminalNames = ['БАН', 'На смену', 'Отмена запуска']
  let watchdogHrs = 2
  let moderationHrs = 12
  try {
    const { data: us } = await supabaseAdmin
      .from('user_settings')
      .select('custom_statuses, watchdog_hours, moderation_hours')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (Array.isArray(us?.custom_statuses)) {
      const t = us.custom_statuses.filter(s => s.category === 'terminal').map(s => s.name)
      if (t.length) terminalNames = t
    }
    if (Number.isFinite(+us?.watchdog_hours) && +us.watchdog_hours > 0) watchdogHrs = +us.watchdog_hours
    if (Number.isFinite(+us?.moderation_hours) && +us.moderation_hours > 0) moderationHrs = +us.moderation_hours
  } catch {}

  const results = []
  const errors = []

  for (const item of batch) {
    try {
      const {
        name, google_ads_id, currency, tech_status,
        tech_note, campaigns, hourly, account_timezone,
        today_cost, today_clicks, today_cpc, today_conv,
        yest_cost, yest_clicks, yest_cpc, yest_conv,
      } = item

      // Чистим ID от дефисов для поиска
      const cleanId = (google_ads_id || '').replace(/-/g, '')

      // Ищем аккаунт по google_ads_id
      let account = null
      if (cleanId) {
        const { data } = await supabaseAdmin
          .from('accounts')
          .select('*')
          .eq('user_id', USER_ID)
          .eq('google_ads_id', cleanId)
          .maybeSingle()
        account = data
      }

      // Если не нашли по ID — ищем по имени
      if (!account && name) {
        const { data } = await supabaseAdmin
          .from('accounts')
          .select('*')
          .eq('user_id', USER_ID)
          .eq('name', name)
          .maybeSingle()
        account = data
      }

      // Если аккаунт не найден — создаём
      if (!account) {
        const { data, error } = await supabaseAdmin
          .from('accounts')
          .insert({
            user_id: USER_ID,
            name: name || google_ads_id,
            google_ads_id: cleanId,
            currency: currency || 'USD',
            status: 'Крутит',
            last_seen_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (error) throw error
        account = data
      }

      // Архивный аккаунт: запрос принимаем, но НЕ обновляем (статистика заморожена
      // на моменте архивации; разархивация автоматически вернёт приём)
      if (account.is_archived) {
        results.push({ id: account.id, name: account.name, skipped: 'archived' })
        continue
      }

      // Обновляем tech_status и last_seen_at
      const isFrozen = terminalNames.includes(account.status)
      const overridden = Array.isArray(account.metrics_manual_override) ? account.metrics_manual_override : []

      const updates = {
        last_seen_at: new Date().toISOString(),
        watchdog_status: 'alive',
        google_ads_id: cleanId || account.google_ads_id,
      }
      if (currency) updates.currency = currency

      // Замороженный аккаунт: тех. статус скриптом не трогаем (метрики всё равно пишем ниже)
      if (!isFrozen) {
        if (tech_status) updates.tech_status = tech_status
        if ('tech_note' in account) updates.tech_note = tech_note || null
        // Автодата крута (старый скрипт шлёт РАБОТАЕТ, новый — Крутит)
        if ((tech_status === 'РАБОТАЕТ' || tech_status === 'Крутит') && !account.crut_date) {
          updates.crut_date = today
        }
      }

      // Детализация кампаний и пояс аккаунта (данные, не статус) — если колонки есть
      if ('campaigns_snapshot' in account && Array.isArray(campaigns)) {
        updates.campaigns_snapshot = campaigns
      }
      if ('account_timezone' in account && account_timezone) {
        updates.account_timezone = account_timezone
      }

      // «Витринные» метрики на строке аккаунта — только если колонка существует
      // и поле не закреплено вручную (metrics_manual_override)
      const showcase = {
        today_cost, today_clicks, today_cpc, today_conv,
        yest_cost, yest_clicks, yest_cpc, yest_conv,
      }
      for (const [f, v] of Object.entries(showcase)) {
        if (f in account && !overridden.includes(f) && v !== undefined) {
          updates[f] = v
        }
      }

      const { error: updErr } = await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', account.id)
      if (updErr) errors.push({ name, stage: 'account_update', error: updErr.message })

      // Дневной снимок вычисленного тех-статуса в daily_tech_status — источник
      // правды для /stats режима «По тех-статусам». Считается через ту же
      // effectiveTechStatus, что использует фронт (lib/techStatus.js), на
      // апдейтенном состоянии аккаунта. Каждый часовой ингест перезаписывает
      // строку за текущий день — к концу дня там финальное состояние.
      // Изолирован от метрик: ошибка снимка НЕ ломает приём.
      try {
        const after = { ...account, ...updates }
        const eff = effectiveTechStatus(after, watchdogHrs, moderationHrs)
        if (eff) {
          const { error: dtsErr } = await supabaseAdmin
            .from('daily_tech_status')
            .upsert({
              account_id: account.id,
              user_id: USER_ID,
              snapshot_date: today,
              tech_status: eff,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'account_id,snapshot_date' })
          if (dtsErr) errors.push({ name, stage: 'tech_status_snapshot', error: dtsErr.message })
        }
      } catch (e) {
        errors.push({ name, stage: 'tech_status_snapshot', error: e.message })
      }

      // Почасовой спенд → hourly_metrics (upsert по account+date+hour).
      // Пустой/отсутствующий массив НИЧЕГО не трогает — молчание не обнуляет историю.
      if (Array.isArray(hourly) && hourly.length > 0) {
        const hourRows = hourly
          .filter(h => h && h.date && h.hour != null && h.hour >= 0 && h.hour <= 23)
          .map(h => ({
            account_id: account.id,
            user_id: USER_ID,
            metric_date: h.date,
            hour: h.hour,
            account_timezone: account_timezone || null,
            cost_native: +h.cost || 0,
            currency: currency || account.currency || 'USD',
            clicks: +h.clicks || 0,
            conversions: +h.conversions || 0,
            impressions: +h.impressions || 0,
            updated_at: new Date().toISOString(),
          }))
        if (hourRows.length) {
          const { error: hErr } = await supabaseAdmin
            .from('hourly_metrics')
            .upsert(hourRows, { onConflict: 'account_id,metric_date,hour' })
          if (hErr) errors.push({ name, stage: 'hourly_upsert', error: hErr.message })
        }
      }

      // Метрики сегодня
      if (today_cost > 0 || today_clicks > 0) {
        await supabaseAdmin
          .from('daily_metrics')
          .upsert({
            account_id: account.id,
            user_id: USER_ID,
            metric_date: today,
            clicks: today_clicks || 0,
            cpc_usd: today_cpc || 0,
            cost_usd: today_cost || 0,
            conversions: today_conv || 0,
            cpa: today_conv > 0 ? (today_cost / today_conv) : 0,
          }, { onConflict: 'account_id,metric_date' })
      }

      // Метрики вчера
      if (yest_cost > 0 || yest_clicks > 0) {
        await supabaseAdmin
          .from('daily_metrics')
          .upsert({
            account_id: account.id,
            user_id: USER_ID,
            metric_date: yesterday,
            clicks: yest_clicks || 0,
            cpc_usd: yest_cpc || 0,
            cost_usd: yest_cost || 0,
            conversions: yest_conv || 0,
            cpa: yest_conv > 0 ? (yest_cost / yest_conv) : 0,
          }, { onConflict: 'account_id,metric_date' })
      }

      results.push({ id: account.id, name: account.name, status: tech_status })

    } catch (e) {
      console.error('INGEST item error:', e)
      errors.push({ name: item.name, error: e.message })
    }
  }

  return res.status(200).json({
    ok: true,
    processed: results.length,
    errors: errors.length,
    results,
    errors_list: errors,
  })
}
