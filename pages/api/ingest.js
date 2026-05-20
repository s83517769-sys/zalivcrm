/**
 * POST /api/ingest
 *
 * Принимает данные от скрипта мониторинга Google Ads.
 * Скрипт шлёт batch с метриками по всем аккаунтам каждый час.
 *
 * Body:
 * {
 *   api_key: "user_api_key",
 *   batch: [{
 *     name: "SL-USA-122",
 *     google_ads_id: "778-546-0052",
 *     tech_status: "РАБОТАЕТ",
 *     today_cost: 1.19,
 *     yest_cost: 71.57,
 *     all_cost: 365.78,
 *     today_clicks: 3,
 *     yest_clicks: 183,
 *     today_cpc: 0.40,
 *     yest_cpc: 0.39,
 *     today_ctr: 0.18,
 *     yest_ctr: 0.15,
 *     today_conv: 0,
 *     yest_conv: 17,
 *     today_impr: 1638,
 *     yest_impr: 119579,
 *     updated_at: "20.05.2026 15:48"
 *   }]
 * }
 */

import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { api_key, batch } = req.body

  // Проверяем API ключ
  if (!api_key) {
    return res.status(401).json({ error: 'API key required' })
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id, plan, trial_ends_at')
    .eq('api_key', api_key)
    .single()

  if (userErr || !user) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  // Проверяем не истёк ли trial
  if (user.plan === 'trial' && new Date(user.trial_ends_at) < new Date()) {
    return res.status(403).json({ error: 'Trial expired' })
  }

  if (!batch || !Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ error: 'Empty batch' })
  }

  const userId = user.id
  const now = new Date().toISOString()
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  let updated = 0
  let created = 0
  let errors = []

  for (const item of batch) {
    try {
      const name = (item.name || '').replace(/\\_/g, '_').trim()
      if (!name) continue

      // 1. Найти или создать аккаунт
      let { data: account } = await supabaseAdmin
        .from('accounts')
        .select('id, tech_status, manual_status, watchdog_status')
        .eq('user_id', userId)
        .eq('name', name)
        .single()

      if (!account) {
        // Создаём новый аккаунт
        const { data: newAcc, error: createErr } = await supabaseAdmin
          .from('accounts')
          .insert({
            user_id: userId,
            name: name,
            google_ads_id: item.google_ads_id || null,
            tech_status: item.tech_status || 'РАБОТАЕТ',
            manual_status: 'Пуск',
            last_seen_at: now,
            watchdog_status: 'alive',
          })
          .select('id')
          .single()

        if (createErr) { errors.push({ name, error: createErr.message }); continue }
        account = newAcc
        created++
      } else {
        // Обновляем технический статус и время обновления
        const oldStatus = account.tech_status
        const newStatus = item.tech_status || 'РАБОТАЕТ'

        await supabaseAdmin
          .from('accounts')
          .update({
            google_ads_id: item.google_ads_id || account.google_ads_id,
            tech_status: newStatus,
            last_seen_at: now,
            watchdog_status: 'alive',
            updated_at: now,
          })
          .eq('id', account.id)

        // Логируем смену тех. статуса
        if (oldStatus !== newStatus) {
          await supabaseAdmin
            .from('account_history')
            .insert({
              account_id: account.id,
              user_id: userId,
              change_type: 'status',
              field_name: 'tech_status',
              old_value: oldStatus,
              new_value: newStatus,
              note: 'Автоматически от скрипта мониторинга',
            })
        }

        updated++
      }

      // 2. Сохраняем метрики за СЕГОДНЯ (upsert)
      await supabaseAdmin
        .from('metrics')
        .upsert({
          account_id: account.id,
          user_id: userId,
          metric_date: today,
          period: 'today',
          cost: parseFloat(item.today_cost) || 0,
          clicks: parseInt(item.today_clicks) || 0,
          cpc: parseFloat(item.today_cpc) || 0,
          ctr: parseFloat(item.today_ctr) || 0,
          conversions: parseFloat(item.today_conv) || 0,
          impressions: parseInt(item.today_impr) || 0,
          source: 'script',
          recorded_at: now,
        }, { onConflict: 'account_id,metric_date,period' })

      // 3. Сохраняем метрики за ВЧЕРА (upsert)
      await supabaseAdmin
        .from('metrics')
        .upsert({
          account_id: account.id,
          user_id: userId,
          metric_date: yesterday,
          period: 'yesterday',
          cost: parseFloat(item.yest_cost) || 0,
          clicks: parseInt(item.yest_clicks) || 0,
          cpc: parseFloat(item.yest_cpc) || 0,
          ctr: parseFloat(item.yest_ctr) || 0,
          conversions: parseFloat(item.yest_conv) || 0,
          impressions: parseInt(item.yest_impr) || 0,
          source: 'script',
          recorded_at: now,
        }, { onConflict: 'account_id,metric_date,period' })

    } catch (e) {
      errors.push({ name: item.name, error: e.message })
    }
  }

  return res.status(200).json({
    ok: true,
    processed: batch.length,
    created,
    updated,
    errors: errors.length ? errors : undefined,
  })
}
