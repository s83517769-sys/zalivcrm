import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'

const BASE_STATUSES = [
  { name:'Пуск', color:'#4ea8de' },{ name:'Модерация', color:'#f5a623' },
  { name:'Крутит', color:'#22d17a' },{ name:'Крутит (огран)', color:'#22d17a' },
  { name:'Дизапрув', color:'#f5a623' },{ name:'Разлог', color:'#f5a623' },
  { name:'Апила', color:'#f5a623' },{ name:'Вериф', color:'#c084fc' },
  { name:'Вериф BOV', color:'#c084fc' },{ name:'Ком Вериф', color:'#c084fc' },
  { name:'На смену', color:'#f05555' },{ name:'БАН', color:'#f05555' },
  { name:'Отмена запуска', color:'#f05555' },{ name:'отклон', color:'#f5a623' },
  { name:'Пауза', color:'#4ea8de' },{ name:'Оплата 20', color:'#f472b6' },
  { name:'Оплата 40', color:'#f472b6' },{ name:'Оплата 50', color:'#f472b6' },
  { name:'Оплата 200', color:'#f472b6' },{ name:'В ожидании', color:'#6b7280' },
  { name:'пустой', color:'#6b7280' },
]
const BASE_GROUPS = [
  { prefix:'SL-USA', color:'#4ea8de' },{ prefix:'GS-USA', color:'#22d17a' },
  { prefix:'MM-NZ', color:'#c084fc' },
]

export default function Settings() {
  const { user, signOut } = useAuth()
  const [dark, setDark] = useState(true)
  const [toast, setToast] = useState('')

  const [profile, setProfile] = useState({ name:'', email:'', avatar_url:'', api_key:'' })
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [accounts, setAccounts] = useState([])

  const [customStatuses, setCustomStatuses] = useState([])
  const [customGroups, setCustomGroups] = useState([])
  const [watchdogHours, setWatchdogHours] = useState(2)

  const [newStatus, setNewStatus] = useState({ name:'', color:'#5b6ef5' })
  const [newGroup, setNewGroup] = useState({ prefix:'', color:'#5b6ef5' })

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    load()
  }, [])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  async function load() {
    const [p, s, a] = await Promise.all([
      api('/api/users/profile'),
      api('/api/users/settings'),
      api('/api/accounts'),
    ])
    if (p.profile) { setProfile(p.profile); setNameInput(p.profile.name || '') }
    if (s.settings) {
      setCustomStatuses(s.settings.custom_statuses || [])
      setCustomGroups(s.settings.custom_groups || [])
      setWatchdogHours(s.settings.watchdog_hours ?? 2)
    }
    setAccounts(a.accounts || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function saveName() {
    setSavingName(true)
    const r = await api('/api/users/profile', { method:'PATCH', body: JSON.stringify({ name: nameInput }) })
    setSavingName(false)
    if (r.error) return showToast('Ошибка: ' + r.error)
    showToast('Имя сохранено ✓')
  }

  function copyKey() {
    if (!profile.api_key) return showToast('Ключ ещё не создан')
    navigator.clipboard?.writeText(profile.api_key)
    showToast('API ключ скопирован ✓')
  }

  async function regenKey() {
    if (!confirm('Сгенерировать новый API ключ?\n\nЭто СЛОМАЕТ скрипты Google Ads — придётся вставить новый ключ в monitoring_script.js и watchdog_script.js.')) return
    const r = await api('/api/users/regenerate-key', { method:'POST' })
    if (r.error) return showToast('Ошибка: ' + r.error)
    setProfile(p => ({ ...p, api_key: r.api_key }))
    showToast('Новый ключ создан ✓')
  }

  async function saveSettings(patch) {
    const r = await api('/api/users/settings', { method:'POST', body: JSON.stringify(patch) })
    if (r.error) { showToast('Ошибка: ' + r.error); return false }
    return true
  }

  // ── Статусы ──
  const statusCount = (name) => accounts.filter(a => a.status === name).length
  async function addStatus() {
    const name = newStatus.name.trim()
    if (!name) return showToast('Введи название статуса')
    if ([...BASE_STATUSES, ...customStatuses].some(s => s.name === name)) return showToast('Такой статус уже есть')
    const next = [...customStatuses, { name, color: newStatus.color }]
    setCustomStatuses(next)
    if (await saveSettings({ custom_statuses: next })) { setNewStatus({ name:'', color:'#5b6ef5' }); showToast('Статус добавлен ✓') }
  }
  async function delStatus(name) {
    if (statusCount(name) > 0) return showToast(`Нельзя удалить: есть аккаунты (${statusCount(name)})`)
    const next = customStatuses.filter(s => s.name !== name)
    setCustomStatuses(next)
    if (await saveSettings({ custom_statuses: next })) showToast('Статус удалён')
  }

  // ── Группы ──
  async function addGroup() {
    const prefix = newGroup.prefix.trim()
    if (!prefix) return showToast('Введи префикс группы')
    if ([...BASE_GROUPS, ...customGroups].some(g => g.prefix === prefix)) return showToast('Такая группа уже есть')
    const next = [...customGroups, { prefix, color: newGroup.color }]
    setCustomGroups(next)
    if (await saveSettings({ custom_groups: next })) { setNewGroup({ prefix:'', color:'#5b6ef5' }); showToast('Группа добавлена ✓') }
  }
  async function delGroup(prefix) {
    const next = customGroups.filter(g => g.prefix !== prefix)
    setCustomGroups(next)
    if (await saveSettings({ custom_groups: next })) showToast('Группа удалена')
  }

  // ── Watchdog ──
  async function saveWatchdog() {
    const h = Math.max(1, parseInt(watchdogHours) || 2)
    setWatchdogHours(h)
    if (await saveSettings({ watchdog_hours: h })) showToast('Watchdog сохранён ✓')
  }

  const allStatuses = [...BASE_STATUSES.map(s => ({ ...s, base:true })), ...customStatuses.map(s => ({ ...s, base:false }))]
  const allGroups = [...BASE_GROUPS.map(g => ({ ...g, base:true })), ...customGroups.map(g => ({ ...g, base:false }))]

  return (
    <>
      <Head><title>Настройки — ЗаливCRM</title></Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body.dark{--bg:#08090d;--s1:#0e0f15;--s2:#13141c;--s3:#191b25;--bd:#252840;--bd2:#2f3355;--t:#dde1f0;--t2:#8892b0;--t3:#4a5275;--acc:#5b6ef5;--acc2:#4556e0}
        body.light{--bg:#f0f2f5;--s1:#ffffff;--s2:#f8f9fb;--s3:#eef0f4;--bd:#dde1eb;--bd2:#c5cad8;--t:#1a1d2e;--t2:#4a5275;--t3:#8892b0;--acc:#4556e0;--acc2:#3445d0}
        body{background:var(--bg);color:var(--t);font-family:'Inter',sans-serif;font-size:13px;min-height:100vh;display:flex;flex-direction:column}
        .topbar{display:flex;align-items:center;gap:10px;padding:0 16px;height:48px;background:var(--s1);border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:50;flex-shrink:0}
        .logo{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500}
        .logo em{color:var(--acc);font-style:normal}
        .nav-link{font-size:12px;color:var(--t3);text-decoration:none;padding:4px 10px;border-radius:4px;transition:all .1s}
        .nav-link:hover{background:var(--s2);color:var(--t)}
        .nav-link.act{background:rgba(91,110,245,.12);color:var(--acc);font-weight:500}
        .sep{width:1px;height:20px;background:var(--bd)}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:5px 11px;font-size:12px;color:var(--t2);cursor:pointer;white-space:nowrap;outline:none;transition:all .1s;font-family:'Inter',sans-serif}
        .btn:hover{background:var(--s3);color:var(--t)}
        .btn-acc{background:var(--acc2);border-color:var(--acc);color:#fff;font-weight:500}
        .btn-acc:hover{background:var(--acc)}
        .btn-del{background:rgba(240,85,85,.1);border-color:rgba(240,85,85,.3);color:#f05555}
        .btn-del:hover{background:rgba(240,85,85,.2)}
        .wrap{max-width:680px;margin:0 auto;padding:24px 20px 60px;width:100%}
        .card{background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:18px 20px;margin-bottom:16px}
        .card h2{font-size:13px;font-weight:600;color:var(--t);margin-bottom:14px;display:flex;align-items:center;gap:7px}
        .fi{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
        .fi label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em}
        .fi input{background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;color:var(--t);font-size:13px;font-family:'Inter',sans-serif;outline:none;width:100%}
        .fi input:focus{border-color:var(--acc)}
        .fi input:disabled{opacity:.6}
        .row{display:flex;gap:8px;align-items:flex-end}
        .keybox{display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--t2);word-break:break-all}
        .avatar{width:48px;height:48px;border-radius:50%;border:1px solid var(--bd);object-fit:cover}
        .avatar-ph{width:48px;height:48px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:18px;font-family:'JetBrains Mono',monospace}
        .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
        .schip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px 3px 7px;border-radius:13px;border:1px solid var(--bd);background:var(--s2);font-size:12px;color:var(--t)}
        .schip .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
        .schip .x{cursor:pointer;color:var(--t3);font-size:13px;line-height:1}
        .schip .x:hover{color:#f05555}
        .schip.base{opacity:.75}
        .color-inp{width:34px;height:34px;border:1px solid var(--bd);border-radius:6px;background:var(--s2);padding:2px;cursor:pointer}
        .hint{font-size:11px;color:var(--t3);margin-top:2px}
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:8px 16px;font-size:12px;color:var(--t);opacity:0;transition:all .2s;z-index:600;pointer-events:none;white-space:nowrap}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
      `}</style>

      <div className="topbar">
        <div className="logo">Залив<em>CRM</em></div>
        <div className="sep"/>
        <Link href="/" className="nav-link">Аккаунты</Link>
        <Link href="/stats" className="nav-link">📊 Статистика</Link>
        <Link href="/proxy" className="nav-link">🌐 Прокси</Link>
        <Link href="/urls" className="nav-link">🔗 URL / CLO</Link>
        <Link href="/heavy" className="nav-link">💪 Heavy</Link>
        <Link href="/archive" className="nav-link">🗄 Архив</Link>
        <Link href="/settings" className="nav-link act">⚙️ Настройки</Link>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
          <button className="btn" onClick={()=>{const n=dark?'light':'dark';setDark(n==='dark');localStorage.setItem('zcrm_theme',n)}}>{dark?'☀️':'🌙'}</button>
          {user && <span style={{fontSize:11,color:'var(--t2)'}}>{user.user_metadata?.name || user.email}</span>}
          <button className="btn" onClick={signOut}>Выйти</button>
        </div>
      </div>

      <div className="wrap">
        {/* ПРОФИЛЬ */}
        <div className="card">
          <h2>👤 Профиль</h2>
          <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
            {profile.avatar_url
              ? <img className="avatar" src={profile.avatar_url} alt=""/>
              : <div className="avatar-ph">{(profile.name||profile.email||'?').slice(0,1).toUpperCase()}</div>}
            <div style={{flex:1}}>
              <div className="fi">
                <label>Имя</label>
                <input value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="Твоё имя"/>
              </div>
              <div className="fi">
                <label>Email</label>
                <input value={profile.email} disabled/>
              </div>
              <button className="btn btn-acc" onClick={saveName} disabled={savingName}>{savingName?'Сохраняем...':'Сохранить'}</button>
            </div>
          </div>
        </div>

        {/* API КЛЮЧ */}
        <div className="card">
          <h2>🔑 API ключ</h2>
          <div className="hint" style={{marginBottom:8}}>Используется в скриптах Google Ads (monitoring + watchdog).</div>
          <div className="keybox">{profile.api_key || 'ключ ещё не создан'}</div>
          <div className="row" style={{marginTop:10}}>
            <button className="btn" onClick={copyKey}>⎘ Скопировать</button>
            <button className="btn btn-del" onClick={regenKey}>↻ Сгенерировать новый</button>
          </div>
          <div className="hint" style={{marginTop:8}}>⚠️ Новый ключ сломает текущие скрипты — нужно будет вставить его заново.</div>
        </div>

        {/* СТАТУСЫ */}
        <div className="card">
          <h2>🏷 Статусы</h2>
          <div className="chips">
            {allStatuses.map(s=>(
              <span key={s.name} className={`schip${s.base?' base':''}`}>
                <span className="dot" style={{background:s.color}}/>
                {s.name}
                {statusCount(s.name)>0 && <span style={{color:'var(--t3)',fontSize:10}}>· {statusCount(s.name)}</span>}
                {!s.base && <span className="x" title="Удалить" onClick={()=>delStatus(s.name)}>×</span>}
              </span>
            ))}
          </div>
          <div className="row">
            <input className="color-inp" type="color" value={newStatus.color} onChange={e=>setNewStatus({...newStatus,color:e.target.value})}/>
            <div className="fi" style={{flex:1,marginBottom:0}}>
              <label>Новый статус</label>
              <input value={newStatus.name} onChange={e=>setNewStatus({...newStatus,name:e.target.value})} placeholder="Название статуса"/>
            </div>
            <button className="btn btn-acc" onClick={addStatus}>+ Добавить</button>
          </div>
          <div className="hint">Базовые статусы удалить нельзя. Кастомный — только если нет аккаунтов с ним.</div>
        </div>

        {/* ГРУППЫ */}
        <div className="card">
          <h2>📁 Группы</h2>
          <div className="chips">
            {allGroups.map(g=>(
              <span key={g.prefix} className={`schip${g.base?' base':''}`}>
                <span className="dot" style={{background:g.color}}/>
                {g.prefix}
                {!g.base && <span className="x" title="Удалить" onClick={()=>delGroup(g.prefix)}>×</span>}
              </span>
            ))}
          </div>
          <div className="row">
            <input className="color-inp" type="color" value={newGroup.color} onChange={e=>setNewGroup({...newGroup,color:e.target.value})}/>
            <div className="fi" style={{flex:1,marginBottom:0}}>
              <label>Новая группа (префикс)</label>
              <input value={newGroup.prefix} onChange={e=>setNewGroup({...newGroup,prefix:e.target.value})} placeholder="напр. ART_DE"/>
            </div>
            <button className="btn btn-acc" onClick={addGroup}>+ Добавить</button>
          </div>
          <div className="hint">Группа определяется по префиксу названия аккаунта.</div>
        </div>

        {/* WATCHDOG */}
        <div className="card">
          <h2>🐶 Watchdog</h2>
          <div className="row">
            <div className="fi" style={{maxWidth:160,marginBottom:0}}>
              <label>Часов без данных → «НЕТ СВЯЗИ»</label>
              <input type="number" min={1} value={watchdogHours} onChange={e=>setWatchdogHours(e.target.value)}/>
            </div>
            <button className="btn btn-acc" onClick={saveWatchdog}>Сохранить</button>
          </div>
          <div className="hint">По умолчанию 2 часа. Применяется при проверках watchdog-скриптом.</div>
        </div>
      </div>

      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}
