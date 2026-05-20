/**
 * GET /api/accounts
 * Returns all accounts with today's and yesterday's metrics
 */

import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Простая auth через заголовок (потом заменим на JWT)
  const apiKey = req.headers['x-api-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key' })

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('api_key', apiKey)
    .single()

  if (!user) return res.status(401).json({ error: 'Invalid API key' })

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Получаем все аккаунты
  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })

  // Получаем метрики за сегодня и вчера
  const { data: metrics } = await supabaseAdmin
    .from('metrics')
    .select('*')
    .eq('user_id', user.id)
    .in('metric_date', [today, yesterday])

  // Собираем метрики по аккаунтам
  const metricsMap = {}
  for (const m of (metrics || [])) {
    if (!metricsMap[m.account_id]) metricsMap[m.account_id] = {}
    metricsMap[m.account_id][m.period] = m
  }

  // Соединяем
  const result = accounts.map(a => {
    const todayM = metricsMap[a.id]?.today || {}
    const yesterM = metricsMap[a.id]?.yesterday || {}

    // Вычисляем display_status
    const finalStatuses = ['БАН', 'отклон', 'Вериф', 'Вериф BOV', 'Ком Вериф',
      'На смену', 'Модерация']
    const isPayment = (a.manual_status || '').startsWith('Оплата')
    let display_status = a.manual_status

    if (!finalStatuses.includes(a.manual_status) && !isPayment) {
      if (a.watchdog_status === 'dead') display_status = 'НЕТ СВЯЗИ'
      else if (a.tech_status === 'РАБОТАЕТ') display_status = 'Крутит'
      else if (a.tech_status === 'ВСЕ НА ПАУЗЕ') display_status = 'Пауза'
      else if (a.tech_status === 'ПРОВЕРЬ АККАУНТ') display_status = 'Проверь'
      else display_status = a.manual_status || a.tech_status
    }

    return {
      ...a,
      display_status,
      today_cost: todayM.cost || 0,
      today_clicks: todayM.clicks || 0,
      today_cpc: todayM.cpc || 0,
      today_ctr: todayM.ctr || 0,
      today_conv: todayM.conversions || 0,
      today_impr: todayM.impressions || 0,
      yest_cost: yesterM.cost || 0,
      yest_clicks: yesterM.clicks || 0,
      yest_cpc: yesterM.cpc || 0,
      yest_ctr: yesterM.ctr || 0,
      yest_conv: yesterM.conversions || 0,
      yest_impr: yesterM.impressions || 0,
    }
  })

  return res.status(200).json({ accounts: result })
}
