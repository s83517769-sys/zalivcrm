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
          <div className="auth-link">Нет аккаунта? <Link href="/register">Зарегистрироваться</Link></div>
        </form>
      </div>
    </>
  )
}
