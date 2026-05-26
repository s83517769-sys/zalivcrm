import { supabaseAdmin } from '../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = req.headers['x-api-key'] || req.body?.api_key
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  const { batch } = req.body
  if (!batch || !Array.isArray(batch)) {
    return res.status(400).json({ error: 'batch array required' })
  }

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const results = []
  const errors = []

  for (const item of batch) {
    try {
      const {
        name, google_ads_id, currency, tech_status,
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

      // Обновляем tech_status и last_seen_at
      const updates = {
        last_seen_at: new Date().toISOString(),
        watchdog_status: 'alive',
        google_ads_id: cleanId || account.google_ads_id,
      }
      if (tech_status) updates.tech_status = tech_status
      if (currency) updates.currency = currency

      // Автодата крута
      if (tech_status === 'РАБОТАЕТ' && !account.crut_date) {
        updates.crut_date = today
      }

      await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', account.id)

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
