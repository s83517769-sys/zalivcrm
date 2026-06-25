import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabaseClient } from '../lib/supabase'
import { authStyles } from '../lib/authStyles'

// Страница установки/сброса пароля.
//
// Сценарий: юзер заходил через GitHub OAuth, пароля у учётки нет. Чтобы
// добавить email+password identity к ТОМУ ЖЕ user_id (GitHub-вход
// сохраняется), он жмёт «Send password recovery» в Supabase Dashboard или
// получает recovery-письмо иным способом. Ссылка из письма ведёт сюда.
//
// supabaseClient инициализирован с detectSessionInUrl:true (lib/supabase.js),
// поэтому SDK сам подхватывает access_token из хеша/квери и поднимает
// сессию + эмитит событие PASSWORD_RECOVERY. Мы ловим оба пути: подписку на
// onAuthStateChange и проверку текущей сессии (на случай если событие уже
// прошло до маунта).
//
// updateUser({ password }) внутри recovery-сессии:
//  - привязывает password identity к существующему user_id
//  - не удаляет github identity (она остаётся в auth.identities)
//  - после этого можно входить и через GitHub, и через email+password
export default function ResetPassword() {
  const router = useRouter()
  const [dark, setDark] = useState(true)
  const [ready, setReady] = useState(false)  // есть ли валидная recovery-сессия
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    setDark(t ? t === 'dark' : true)
  }, [])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  useEffect(() => {
    let cancelled = false

    // Слушаем PASSWORD_RECOVERY — событие приходит после того, как SDK
    // распарсил recovery-ссылку и поднял сессию.
    const { data: sub } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
        setChecking(false)
      }
    })

    // Фоллбэк: если сессия уже есть (юзер залогинен и сам открыл страницу,
    // или событие отстрелило до подписки) — тоже даём задать пароль.
    supabaseClient.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data?.session) {
        setReady(true)
      }
      setChecking(false)
    })

    return () => { cancelled = true; sub?.subscription?.unsubscribe?.() }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (password.length < 6) return setErr('Пароль минимум 6 символов')
    if (password !== password2) return setErr('Пароли не совпадают')
    setBusy(true)
    const { error } = await supabaseClient.auth.updateUser({ password })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true)
  }

  return (
    <>
      <Head><title>Сброс пароля — ЗаливCRM</title></Head>
      <style>{authStyles}</style>
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">Залив<em>CRM</em></div>
          <div className="auth-sub">Установка пароля</div>

          {done ? (
            <>
              <div className="auth-ok">Пароль установлен. Теперь можно входить по email + паролю.</div>
              <button className="auth-btn" type="button" onClick={()=>router.replace('/')}>Перейти в CRM →</button>
              <div className="auth-link"><Link href="/login">К странице входа</Link></div>
            </>
          ) : checking ? (
            <div className="auth-sub" style={{margin:'20px 0'}}>Проверяем ссылку...</div>
          ) : !ready ? (
            <>
              <div className="auth-err">Ссылка протухла или невалидна. Запроси новое письмо для сброса пароля.</div>
              <div className="auth-link"><Link href="/login">К странице входа</Link></div>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="auth-fi">
                <label>Новый пароль</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="минимум 6 символов" autoFocus required/>
              </div>
              <div className="auth-fi">
                <label>Повтори пароль</label>
                <input type="password" value={password2} onChange={e=>setPassword2(e.target.value)} placeholder="••••••••" required/>
              </div>
              {err && <div className="auth-err">{err}</div>}
              <button className="auth-btn" type="submit" disabled={busy}>{busy?'Сохраняем...':'Установить пароль'}</button>
              <div className="auth-link"><Link href="/login">Отмена</Link></div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
