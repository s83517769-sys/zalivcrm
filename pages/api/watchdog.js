import { supabaseAdmin } from '../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = req.headers['x-api-key'] || req.body?.api_key
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  const { events, dead_hours = 2 } = req.body
  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'events array required' })
  }

  const results = { alive: [], dead: [], not_found: [] }

  // Получаем все аккаунты из CRM
  const { data: allAccounts } = await supabaseAdmin
    .from('accounts')
    .select('id, name, google_ads_id, last_seen_at, watchdog_status, status, tech_status')
    .eq('user_id', USER_ID)
    .eq('is_archived', false)

  const now = new Date()
  const deadThreshold = dead_hours * 60 * 60 * 1000 // в миллисекундах

  // Обрабатываем каждый аккаунт из watchdog событий
  for (const event of events) {
    const cleanId = (event.google_ads_id || '').replace(/-/g, '')

    // Ищем в CRM
    const account = allAccounts?.find(a =>
      a.google_ads_id === cleanId ||
      a.name === event.name
    )

    if (!account) {
      results.not_found.push({ name: event.name, google_ads_id: event.google_ads_id })
      continue
    }

    // Обновляем last_seen_at
    await supabaseAdmin
      .from('accounts')
      .update({
        last_seen_at: now.toISOString(),
        watchdog_status: 'alive',
        tech_status: account.tech_status === 'НЕТ СВЯЗИ' ? 'ПРОВЕРЬ АККАУНТ' : account.tech_status,
      })
      .eq('id', account.id)

    results.alive.push({ name: account.name, id: account.id })
  }

  // Проверяем аккаунты которые НЕ пришли в этом watchdog батче
  // — значит они мертвы
  const reportedIds = new Set(
    events.map(e => (e.google_ads_id || '').replace(/-/g, ''))
  )

  for (const account of (allAccounts || [])) {
    // Пропускаем заморозеные и те что пришли в отчёте
    if (account.status === 'БАН' || account.status === 'На смену' || account.status === 'Отмена запуска') continue
    if (reportedIds.has(account.google_ads_id || '')) continue

    // Проверяем когда последний раз видели
    if (!account.last_seen_at) continue
    const lastSeen = new Date(account.last_seen_at)
    const diff = now - lastSeen

    if (diff > deadThreshold) {
      // Помечаем как мёртвый
      await supabaseAdmin
        .from('accounts')
        .update({
          watchdog_status: 'dead',
          tech_status: 'НЕТ СВЯЗИ',
        })
        .eq('id', account.id)

      // Пишем событие
      await supabaseAdmin
        .from('watchdog_events')
        .insert({
          account_id: account.id,
          user_id: USER_ID,
          event_type: 'died',
          hours_dead: Math.round(diff / 3600000 * 10) / 10,
          message: `Нет обновлений ${Math.round(diff / 3600000)}ч`,
        })

      results.dead.push({
        name: account.name,
        id: account.id,
        hours_dead: Math.round(diff / 3600000 * 10) / 10
      })
    }
  }

  return res.status(200).json({
    ok: true,
    alive: results.alive.length,
    dead: results.dead.length,
    not_found: results.not_found.length,
    dead_accounts: results.dead,
    not_found_accounts: results.not_found,
  })
}
