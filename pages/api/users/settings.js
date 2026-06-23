import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'
import {
  DEFAULT_STATUSES, DEFAULT_GROUPS, DEFAULT_CURRENCY_RATES,
  DEFAULT_ROW_RULES, DEFAULT_STATUS_AUTOMATIONS,
} from '../../../lib/defaults'

const DEFAULT_WATCHDOG_HOURS = 2
const DEFAULT_MODERATION_HOURS = 12
const DEFAULT_ARCHIVE_AUTODELETE_DAYS = 30

// Ключи, которые принимаем на запись
const WRITABLE = [
  'custom_statuses', 'custom_groups', 'watchdog_hours', 'moderation_hours',
  'archive_autodelete_days', 'column_config', 'row_rules', 'currency_rates',
  'ui_density', 'ui_theme', 'status_automations', 'default_sort',
  'user_timezone', 'spend_by_user_tz',
]

function notEmpty(v) {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

export default async function handler(req, res) {
  const userId = await getUserIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    // select * — устойчиво к отсутствию кастомных колонок
    const { data: row } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    return res.status(200).json({
      settings: {
        // сид дефолтов, если у пользователя ещё пусто
        custom_statuses: notEmpty(row?.custom_statuses) ? row.custom_statuses : DEFAULT_STATUSES,
        custom_groups: notEmpty(row?.custom_groups) ? row.custom_groups : DEFAULT_GROUPS,
        watchdog_hours: row?.watchdog_hours ?? DEFAULT_WATCHDOG_HOURS,
        moderation_hours: row?.moderation_hours ?? DEFAULT_MODERATION_HOURS,
        archive_autodelete_days: row?.archive_autodelete_days ?? DEFAULT_ARCHIVE_AUTODELETE_DAYS,
        column_config: row?.column_config || {},
        // сохранённые правила + новые дефолтные, которых у пользователя ещё нет (по id)
        row_rules: notEmpty(row?.row_rules)
          ? [...row.row_rules, ...DEFAULT_ROW_RULES.filter(d => !row.row_rules.some(r => r.id === d.id))]
          : DEFAULT_ROW_RULES,
        currency_rates: notEmpty(row?.currency_rates) ? row.currency_rates : DEFAULT_CURRENCY_RATES,
        ui_density: row?.ui_density || 'cozy',
        ui_theme: row?.ui_theme || 'dark',
        status_automations: notEmpty(row?.status_automations) ? row.status_automations : DEFAULT_STATUS_AUTOMATIONS,
        default_sort: row?.default_sort || null,
        // канонический IANA-id Кипра — Asia/Nicosia (Europe/Nicosia — алиас, его нет в списках выбора)
        user_timezone: (row?.user_timezone || 'Asia/Nicosia') === 'Europe/Nicosia' ? 'Asia/Nicosia' : (row?.user_timezone || 'Asia/Nicosia'),
        // По умолчанию ВЫКЛ: показываем «как в Google Ads» (легаси-поля today_/yest_ из accounts).
        spend_by_user_tz: row?.spend_by_user_tz === true,
      },
    })
  }

  if (req.method === 'POST') {
    const body = req.body || {}
    const patch = { user_id: userId, updated_at: new Date().toISOString() }
    for (const k of WRITABLE) {
      if (body[k] !== undefined) patch[k] = body[k]
    }

    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert(patch, { onConflict: 'user_id' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
