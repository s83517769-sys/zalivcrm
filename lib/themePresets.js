// Галерея готовых тем-пресетов (как темы в Telegram). Каждый пресет — согласованная
// тёмная премиум-палитра: акцент + цвет шапки/сайдбара + мягкий градиент фона
// СТРАНИЦЫ (за контентом, не за таблицами). Применяется через theme_config.
//
// pageBg.value — CSS linear/radial-gradient (мягкий, тёмный) для декоративного
// фона. animatedBg (тумблер в настройках) заставляет градиент медленно дышать.
//
// Семантические статус-цвета (бан/крутит/модерация) тут НЕ участвуют — они в
// lib/techStatus.js и темой не меняются.

export const THEME_PRESETS = [
  {
    id: 'midnight', name: 'Midnight', accent: '#5b6ef5', accent2: '#4556e0',
    topbarBg: '#0c0e16', sidebarBg: '#0c0e16',
    pageBg: 'linear-gradient(135deg, #0a0b12 0%, #11132a 50%, #0a0b12 100%)',
  },
  {
    id: 'ocean', name: 'Ocean', accent: '#0ea5e9', accent2: '#0a7fb8',
    topbarBg: '#06141c', sidebarBg: '#06141c',
    pageBg: 'linear-gradient(135deg, #061018 0%, #0a2433 50%, #061018 100%)',
  },
  {
    id: 'sunset', name: 'Sunset', accent: '#f97316', accent2: '#d9772b',
    topbarBg: '#1a0e0a', sidebarBg: '#1a0e0a',
    pageBg: 'linear-gradient(135deg, #140a08 0%, #2b160e 50%, #140a08 100%)',
  },
  {
    id: 'forest', name: 'Forest', accent: '#22a06b', accent2: '#1a8054',
    topbarBg: '#08140d', sidebarBg: '#08140d',
    pageBg: 'linear-gradient(135deg, #07120c 0%, #0e241a 50%, #07120c 100%)',
  },
  {
    id: 'aurora', name: 'Aurora', accent: '#34d399', accent2: '#7c5cf0',
    topbarBg: '#0a1018', sidebarBg: '#0a1018',
    pageBg: 'linear-gradient(135deg, #0a1018 0%, #112436 40%, #1a1430 75%, #0a1018 100%)',
  },
  {
    id: 'graphite', name: 'Graphite', accent: '#94a3b8', accent2: '#64748b',
    topbarBg: '#101216', sidebarBg: '#101216',
    pageBg: 'linear-gradient(135deg, #0c0e11 0%, #181b21 50%, #0c0e11 100%)',
  },
  {
    id: 'plum', name: 'Plum', accent: '#a855f7', accent2: '#8b3fd6',
    topbarBg: '#140a1a', sidebarBg: '#140a1a',
    pageBg: 'linear-gradient(135deg, #100817 0%, #221033 50%, #100817 100%)',
  },
  {
    id: 'cherry', name: 'Cherry', accent: '#f43f5e', accent2: '#d62d4b',
    topbarBg: '#190a0e', sidebarBg: '#190a0e',
    pageBg: 'linear-gradient(135deg, #130809 0%, #2a1018 50%, #130809 100%)',
  },
  {
    id: 'amber', name: 'Amber', accent: '#f59e0b', accent2: '#c97f08',
    topbarBg: '#161007', sidebarBg: '#161007',
    pageBg: 'linear-gradient(135deg, #110c06 0%, #241c0c 50%, #110c06 100%)',
  },
  {
    id: 'teal', name: 'Teal', accent: '#14b8a6', accent2: '#0e8c80',
    topbarBg: '#071614', sidebarBg: '#071614',
    pageBg: 'linear-gradient(135deg, #061312 0%, #0c2724 50%, #061312 100%)',
  },
  {
    id: 'indigo', name: 'Indigo', accent: '#818cf8', accent2: '#5b6ef5',
    topbarBg: '#0d0e1c', sidebarBg: '#0d0e1c',
    pageBg: 'linear-gradient(135deg, #0a0b18 0%, #161a3a 50%, #0a0b18 100%)',
  },
  {
    id: 'rose-gold', name: 'Rose Gold', accent: '#fb7185', accent2: '#e0457b',
    topbarBg: '#190c10', sidebarBg: '#190c10',
    pageBg: 'linear-gradient(135deg, #130a0c 0%, #2a141c 50%, #130a0c 100%)',
  },
]

// Преобразовать пресет в theme_config (совместимо со структурой #99 +
// расширения pageBg/preset). animatedBg сохраняем как есть (тумблер отдельный).
export function presetToConfig(p, prev = {}) {
  return {
    ...prev,
    preset: p.id,
    accent: p.accent,
    accent2: p.accent2,
    header: { mode: 'color', color: p.topbarBg },
    sidebar: { mode: 'color', color: p.sidebarBg },
    pageBg: { type: 'gradient', value: p.pageBg },
  }
}
