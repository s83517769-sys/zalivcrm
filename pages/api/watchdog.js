/**
 * POST /api/watchdog
 *
 * Принимает проверки от watchdog скрипта.
 * Скрипт стоит на одном аккаунте и проверяет все остальные.
 *
 * Body:
 * {
 *   api_key: "user_api_key",
 *   dead_hours: 2,
 *   events: [{
 *     name: "SL-USA-122",
 *     google_ads_id: "778-546-0052",
 *     has_data_today: false,
 *     checked_at: "2026-05-20T14:00:00Z"
 *   }]
 * }
 */

import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { api_key, events, dead_hours = 2 } = req.body

  if (!api_key) return res.status(401).json({ error: 'API key required' })

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('api_key', api_key)
    .single()

  if (!user) return res.status(401).json({ error: 'Invalid API key' })

  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'No events' })
  }

  const userId = user.id
  const now = new Date()
  const marked_dead = []
  const marked_alive = []

  for (const event of events) {
    const name = (event.name || '').replace(/\\_/g, '_').trim()
    if (!name) continue

    // Найти аккаунт
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('id, tech_status, manual_status, last_seen_at, watchdog_status')
      .eq('user_id', userId)
      .eq('name', name)
      .single()

    if (!account) continue

    // Пропускаем если ручной статус финальный (БАН, Отклон и т.д.)
    const finalStatuses = ['БАН', 'отклон', 'Вериф', 'Вериф BOV', 'Ком Вериф',
      'Оплата 20', 'Оплата 40', 'Оплата 50', 'Оплата 200', 'На смену']
    if (finalStatuses.includes(account.manual_status)) continue

    const lastSeen = account.last_seen_at ? new Date(account.last_seen_at) : null
    const hoursAgo = lastSeen ? (now - lastSeen) / 3600000 : null

    const isDead = hoursAgo !== null && hoursAgo >= dead_hours
    const wasAlive = account.watchdog_status === 'alive'
    const wasDead = account.watchdog_status === 'dead'

    if (isDead && wasAlive) {
      // Аккаунт умер
      await supabaseAdmin
        .from('accounts')
        .update({
          tech_status: 'НЕТ СВЯЗИ',
          watchdog_status: 'dead',
          updated_at: now.toISOString(),
        })
        .eq('id', account.id)

      await supabaseAdmin
        .from('watchdog_events')
        .insert({
          account_id: account.id,
          user_id: userId,
          event_type: 'died',
          old_status: account.tech_status,
          new_status: 'НЕТ СВЯЗИ',
          hours_dead: hoursAgo ? Math.round(hoursAgo * 10) / 10 : null,
          message: `Нет данных ${hoursAgo ? Math.round(hoursAgo) : '?'} ч.`,
        })

      marked_dead.push(name)

    } else if (!isDead && wasDead) {
      // Аккаунт ожил
      await supabaseAdmin
        .from('accounts')
        .update({
          tech_status: 'ПРОВЕРЬ АККАУНТ',
          watchdog_status: 'alive',
          updated_at: now.toISOString(),
        })
        .eq('id', account.id)

      await supabaseAdmin
        .from('watchdog_events')
        .insert({
          account_id: account.id,
          user_id: userId,
          event_type: 'revived',
          old_status: 'НЕТ СВЯЗИ',
          new_status: 'ПРОВЕРЬ АККАУНТ',
          message: 'Аккаунт снова передаёт данные',
        })

      marked_alive.push(name)
    }
  }

  return res.status(200).json({
    ok: true,
    dead: marked_dead,
    alive: marked_alive,
  })
}
