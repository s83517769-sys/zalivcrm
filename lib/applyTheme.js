// Применение кастомной темы (per-user) поверх существующих CSS-переменных.
// Акцент UI уже завязан на var(--acc)/var(--acc2) во всех страницах — мы просто
// переопределяем эти переменные инлайном на <body> (инлайн побеждает классовые
// body.dark/body.light). Пусто/сброс → removeProperty → возвращается дефолт.
//
// Семантические статус-цвета (бан/крутит/модерация/удалить) НЕ трогаем — они в
// lib/techStatus.js и не зависят от --acc.

const LS_KEY = 'zcrm_theme_config'

function clampHex(h) {
  if (typeof h !== 'string') return null
  const s = h.trim()
  return /^#([0-9a-fA-F]{6})$/.test(s) ? s.toLowerCase() : null
}

// Относительная яркость (0..255) для выбора контрастного текста на акценте.
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// Затемнить hex на factor (0..1) — для производного --acc2 (hover/кнопки).
function darken(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - factor))
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - factor))
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - factor))
  const h = (n) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Безопасный URL картинки обложки (только http/https, без javascript: и пр.)
function safeUrl(u) {
  if (typeof u !== 'string') return null
  const s = u.trim()
  if (!/^https?:\/\//i.test(s)) return null
  if (/["')\\]/.test(s)) return null // не пускаем символы, ломающие css url()
  return s
}

// Собрать фон декоративной зоны (шапка/сайдбар) из конфига.
// mode: 'none' | 'color' | 'image'. Для картинки кладём тёмный оверлей, чтобы
// текст/логотип оставались читаемыми поверх любой обложки.
function coverValue(cfg) {
  if (!cfg || cfg.mode === 'none' || !cfg.mode) return null
  if (cfg.mode === 'color') return clampHex(cfg.color)
  if (cfg.mode === 'image') {
    const url = safeUrl(cfg.image)
    if (!url) return null
    return `linear-gradient(rgba(8,9,13,.55),rgba(8,9,13,.55)), url("${url}") center/cover no-repeat`
  }
  return null
}

// Применить тему к документу. tc = theme_config из user_settings.
export function applyTheme(tc) {
  if (typeof document === 'undefined') return
  const b = document.body
  if (!b) return
  const set = (k, v) => v ? b.style.setProperty(k, v) : b.style.removeProperty(k)

  // ── Акцент ──
  const acc = clampHex(tc?.accent)
  if (acc) {
    set('--acc', acc)
    set('--acc2', darken(acc, 0.18))                 // производная для hover/кнопок
    set('--acc-fg', luminance(acc) > 150 ? '#1a1d2e' : '#ffffff') // текст на акценте
  } else {
    set('--acc', null); set('--acc2', null); set('--acc-fg', null)
  }

  // ── Обложка шапки / сайдбара ──
  set('--topbar-bg', coverValue(tc?.header))
  set('--sidebar-bg', coverValue(tc?.sidebar))
}

// Прочитать кэш темы из localStorage (для мгновенного применения без вспышки).
export function cachedTheme() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

// Сохранить кэш темы (вызывается после загрузки настроек / сохранения на /settings).
export function cacheTheme(tc) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(tc || {})) } catch {}
}
