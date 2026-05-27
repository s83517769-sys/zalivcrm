import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabaseClient } from '../lib/supabase'
import { authStyles } from '../lib/authStyles'

export default function Login() {
  const router = useRouter()
  const [dark, setDark] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    setDark(t ? t === 'dark' : true)
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) { setErr(error.message); return }
    router.replace('/')
  }

  async function githubLogin() {
    setErr(''); setBusy(true)
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) { setBusy(false); setErr(error.message) }
  }

  return (
    <>
      <Head><title>Вход — ЗаливCRM</title></Head>
      <style>{authStyles}</style>
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-logo">Залив<em>CRM</em></div>
          <div className="auth-sub">Вход в аккаунт</div>
          <div className="auth-fi">
            <label>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@mail.com" autoFocus required/>
          </div>
          <div className="auth-fi">
            <label>Пароль</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/>
          </div>
          {err && <div className="auth-err">{err}</div>}
          <button className="auth-btn" type="submit" disabled={busy}>{busy?'Входим...':'Войти'}</button>
          <div className="auth-divider">или</div>
          <button className="auth-btn-gh" type="button" onClick={githubLogin} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Войти через GitHub
          </button>
          <div className="auth-link">Нет аккаунта? <Link href="/register">Зарегистрироваться</Link></div>
        </form>
      </div>
    </>
  )
}
