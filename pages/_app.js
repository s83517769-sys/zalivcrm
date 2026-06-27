import { useEffect } from 'react'
import { api } from '../lib/api'
import { applyTheme, cachedTheme, cacheTheme } from '../lib/applyTheme'
import '../styles/theme-bg.css'

// Кастомный App — единая точка применения per-user темы на ВСЕХ страницах
// (общего layout в проекте нет). Сначала мгновенно применяем кэш из
// localStorage (без вспышки дефолта), затем подтягиваем актуальный
// theme_config из настроек и обновляем. Тема = только переопределение
// CSS-переменных акцента/обложки; логику/данные не трогает.
export default function App({ Component, pageProps }) {
  useEffect(() => {
    applyTheme(cachedTheme()) // мгновенно из кэша
    api('/api/users/settings')
      .then(r => {
        const tc = r?.settings?.theme_config || {}
        applyTheme(tc)
        cacheTheme(tc)
      })
      .catch(() => {}) // на пре-авторизационных страницах настроек нет — остаётся кэш/дефолт
  }, [])

  return (
    <>
      {/* Декоративный фоновый слой (за всем контентом). Стиль/анимацию задаёт applyTheme. */}
      <div id="zcrm-theme-bg" style={{ display: 'none' }} />
      <Component {...pageProps} />
    </>
  )
}
