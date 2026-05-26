import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabaseClient } from '../lib/supabase'
import { authStyles } from '../lib/authStyles'

export default function Register() {
  const router = useRouter()
  const [dark, setDark] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (password.length < 6) return setErr('Пароль минимум 6 символов')
    if (password !== password2) return setErr('Пароли не совпадают')
    setBusy(true)
    const { data, error } = await supabaseClient.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    })
    if (error) { setBusy(false); setErr(error.message); return }

    // Создаём запись в таблице users (если есть активная сессия)
    if (data.session) {
      await fetch('/api/users/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      }).catch(() => {})
    }

    setBusy(false)
    setDone(true)
  }

  return (
    <>
      <Head><title>Регистрация — ЗаливCRM</title></Head>
      <style>{authStyles}</style>
      <div className="auth-wrap">
        {done ? (
          <div className="auth-card" style={{maxWidth:420}}>
            <div className="auth-logo">Залив<em>CRM</em></div>
            <div className="auth-sub">Аккаунт создан 🎉</div>
            <div className="onb-step">
              <div className="onb-num">1</div>
              <div>
                <div className="onb-tt">Добавь первый аккаунт</div>
                <div className="onb-ds">Нажми «+ Аккаунт» в CRM или загрузи список через «📋 Массовое».</div>
              </div>
            </div>
            <div className="onb-step">
              <div className="onb-num">2</div>
              <div>
                <div className="onb-tt">Установи скрипт мониторинга</div>
                <div className="onb-ds">Вставь <code>monitoring_script.js</code> в Google Ads → Tools → Scripts, добавь свой API-ключ. <a href="https://github.com/s83517769-sys/zalivcrm#readme" target="_blank" rel="noreferrer">Инструкция →</a></div>
              </div>
            </div>
            <div className="onb-step">
              <div className="onb-num">3</div>
              <div>
                <div className="onb-tt">Готово!</div>
                <div className="onb-ds">Данные начнут появляться автоматически каждый час.</div>
              </div>
            </div>
            <button className="auth-btn" style={{marginTop:18}} onClick={()=>router.replace('/')}>Перейти в CRM →</button>
          </div>
        ) : (
          <form className="auth-card" onSubmit={submit}>
            <div className="auth-logo">Залив<em>CRM</em></div>
            <div className="auth-sub">Создать аккаунт</div>
            <div className="auth-fi">
              <label>Имя</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя" autoFocus required/>
            </div>
            <div className="auth-fi">
              <label>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@mail.com" required/>
            </div>
            <div className="auth-fi">
              <label>Пароль</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="минимум 6 символов" required/>
            </div>
            <div className="auth-fi">
              <label>Повтори пароль</label>
              <input type="password" value={password2} onChange={e=>setPassword2(e.target.value)} placeholder="••••••••" required/>
            </div>
            {err && <div className="auth-err">{err}</div>}
            <button className="auth-btn" type="submit" disabled={busy}>{busy?'Создаём...':'Создать аккаунт'}</button>
            <div className="auth-link">Уже есть аккаунт? <Link href="/login">Войти</Link></div>
          </form>
        )}
      </div>
    </>
  )
}
