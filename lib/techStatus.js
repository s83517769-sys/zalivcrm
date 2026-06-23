// Единый источник правды для вычисляемого технического статуса.
// Используется и фронтом (pages/index.js — рендер таблицы и сайдбара),
// и сервером (pages/api/ingest.js — снимок в daily_tech_status каждый час).
// Чтобы фронт и снимок никогда не расходились — вся логика живёт здесь.

// Карта канонических литералов: алиасы → один лейбл + цвет.
// Старые статусы legacy-MCC-скрипта (РАБОТАЕТ / ВСЕ НА ПАУЗЕ / ПРОВЕРЬ АККАУНТ /
// НЕТ СВЯЗИ) сохранены — это другая ветка, не наш computeStatus.
export const TECH_STATUS_MAP = {
  'Крутит':         { l:'Крутит',         c:'#22d17a' },
  'КРУТИТ':         { l:'Крутит',         c:'#22d17a' },
  'крутит':         { l:'Крутит',         c:'#22d17a' },
  'Отклонены':      { l:'Отклонены',      c:'#f5a623' },
  'ОТКЛОНЕНЫ':      { l:'Отклонены',      c:'#f5a623' },
  'Бюджет':         { l:'Бюджет',         c:'#f5a623' },
  'БЮДЖЕТ':         { l:'Бюджет',         c:'#f5a623' },
  'Пауза/Оплата':   { l:'Пауза/Оплата',   c:'#f5a623' },
  'Пауза':          { l:'Пауза/Оплата',   c:'#f5a623' },
  'ПАУЗЕ':          { l:'Пауза/Оплата',   c:'#f5a623' },
  'ВСЕ НА ПАУЗЕ':   { l:'Пауза/Оплата',   c:'#f5a623' },
  'РАБОТАЕТ':       { l:'Крутит',         c:'#22d17a' },
  'ПРОВЕРЬ АККАУНТ':{ l:'ПРОВЕРЬ',        c:'#f5a623' },
  'ПРОВЕРЬ':        { l:'ПРОВЕРЬ',        c:'#f5a623' },
  'НЕТ СВЯЗИ':      { l:'НЕТ СВЯЗИ',      c:'#f05555' },
  'нет связи':      { l:'НЕТ СВЯЗИ',      c:'#f05555' },
  // Вычисляемые на лету — литералов в БД не пишем, тут только цвет/лейбл для UI.
  'Бан':            { l:'Бан',            c:'#f05555' },
  'Модерация':      { l:'Модерация',      c:'#c9c020' },
  'Новые':          { l:'Новые',          c:'#6b7280' },
}

export function techStatusInfo(s) {
  return s ? (TECH_STATUS_MAP[s] || null) : null
}

// Канонизация: любые алиасы/легаси → один лейбл. Неизвестное возвращается как
// есть, чтобы попало в фильтр одной строкой (а не разделилось на два).
export function canonTechStatus(s) {
  if (!s) return ''
  const info = TECH_STATUS_MAP[s]
  return info ? info.l : s
}

// «Была ли активность когда-либо» — из локальных полей строки аккаунта,
// без новой колонки и без серверных запросов:
//   - today_cost/today_clicks/yest_cost/yest_clicks — пишутся ингестом
//   - crut_date — ставится ингестом при первом 'Крутит'/'РАБОТАЕТ' от скрипта
export function hadAnyActivity(a) {
  if (!a) return false
  if (a.crut_date) return true
  return (+a.today_cost  > 0) || (+a.yest_cost  > 0)
      || (+a.today_clicks > 0) || (+a.yest_clicks > 0)
}

// Возраст аккаунта < окна модерации. created_at стоит на каждой строке
// (database_schema.sql:77 — TIMESTAMPTZ DEFAULT NOW()). Защитный фолбэк: если
// created_at пуст — окно НЕ маркируется, в Модерацию не залипнем.
export function isModerationWindow(a, moderationHours) {
  if (!a || !a.created_at) return false
  const age = Date.now() - new Date(a.created_at).getTime()
  return age < moderationHours * 3600 * 1000
}

// Эффективный технический статус — первое подходящее правило побеждает:
//   1. !last_seen_at                        → ''  (скрипт ни разу не присылал)
//   2. last_seen_at > watchdog_hours        → 'Бан'
//   3. reported === 'Отклонены'             → 'Отклонены'
//   4. hadAnyActivity(a)                    → reported  (Крутит/Бюджет/Пауза...)
//   5. возраст < moderation_hours, нет активности → 'Модерация'
//   6. иначе                                → reported  (обычно 'Пауза/Оплата')
export function effectiveTechStatus(a, watchdogHours, moderationHours) {
  if (!a) return ''
  if (!a.last_seen_at) return ''
  const diff = Date.now() - new Date(a.last_seen_at).getTime()
  if (diff > watchdogHours * 3600 * 1000) return 'Бан'
  const reported = canonTechStatus(a.tech_status)
  if (reported === 'Отклонены') return 'Отклонены'
  if (hadAnyActivity(a)) return reported
  if (isModerationWindow(a, moderationHours)) return 'Модерация'
  return reported
}

// Канонический порядок для UI (использует фронт; сервер хранит сырьём).
export const TECH_STATUS_ORDER = ['Модерация','Крутит','Отклонены','Бюджет','Пауза/Оплата','ПРОВЕРЬ','НЕТ СВЯЗИ','Бан']
export const SIDEBAR_TECH_ORDER = ['Новые', ...TECH_STATUS_ORDER]
