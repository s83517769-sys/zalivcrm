import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'

const CATEGORIES = [
  { k:'active',   l:'Актив',    c:'#22d17a' },
  { k:'problem',  l:'Проблема', c:'#f5a623' },
  { k:'terminal', l:'Терминал', c:'#f05555' },
  { k:'neutral',  l:'Нейтр.',   c:'#6b7280' },
]
const slug = (s) => (s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_+|_+$/g, '') || ('st_' + Date.now())

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
  const [userTz, setUserTz] = useState('Asia/Nicosia')
  const [tzSaving, setTzSaving] = useState(false)
  const [spendByUserTz, setSpendByUserTz] = useState(false)
  const [rowRules, setRowRules] = useState([])
  const [rates, setRates] = useState({ USD:1 })
  const [newRate, setNewRate] = useState({ cur:'', val:'' })

  const [newStatus, setNewStatus] = useState({ name:'', color:'#5b6ef5', category:'active' })
  const [newGroup, setNewGroup] = useState({ prefix:'', color:'#5b6ef5' })
  const [stDrag, setStDrag] = useState(null) // индекс перетаскиваемого статуса

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
      setRowRules(s.settings.row_rules || [])
      setRates({ USD:1, ...(s.settings.currency_rates || {}) })
      if (s.settings.user_timezone) setUserTz(s.settings.user_timezone)
      setSpendByUserTz(s.settings.spend_by_user_tz === true)
    }
    setAccounts(a.accounts || [])
  }

  // ── Правила подсветки ──
  const RULE_LABELS = {
    no_signal:'НЕТ СВЯЗИ (tech_status)', maybe_ban:'Возможно бан (тратил → замолчал)',
    spend_no_conv:'Спенд > 0, но 0 конверсий',
    cpa_high:'CPA выше порога', cpc_jump:'Скачок CPC сегодня к вчера',
  }
  const RULE_HAS_THRESHOLD = { cpa_high:'$', cpc_jump:'%' }
  async function updateRule(id, patch) {
    const next = rowRules.map(r => r.id === id ? { ...r, ...patch } : r)
    setRowRules(next)
    await saveSettings({ row_rules: next })
  }
  // правка порога без сохранения на каждый keystroke
  function setRuleLocal(id, patch) {
    setRowRules(rowRules.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  async function saveRules() {
    await saveSettings({ row_rules: rowRules })
  }

  // ── Курсы валют ──
  async function persistRates(next) {
    setRates(next)
    return saveSettings({ currency_rates: next })
  }
  async function updateRate(cur, val) {
    const next = { ...rates, [cur]: parseFloat(val) || 0 }
    await persistRates(next)
  }
  async function addRate() {
    const cur = newRate.cur.trim().toUpperCase()
    const val = parseFloat(newRate.val)
    if (!cur) return showToast('Введи код валюты')
    if (rates[cur] !== undefined) return showToast('Такая валюта уже есть')
    if (!val || val <= 0) return showToast('Введи курс к USD')
    if (await persistRates({ ...rates, [cur]: val })) { setNewRate({ cur:'', val:'' }); showToast('Валюта добавлена ✓') }
  }
  async function delRate(cur) {
    if (cur === 'USD') return showToast('USD удалить нельзя')
    const next = { ...rates }; delete next[cur]
    if (await persistRates(next)) showToast('Валюта удалена')
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

  // ── Статусы (строго из custom_statuses) ──
  const statusCount = (name) => accounts.filter(a => a.status === name).length

  async function persistStatuses(next) {
    setCustomStatuses(next)
    return saveSettings({ custom_statuses: next })
  }
  async function addStatus() {
    const name = newStatus.name.trim()
    if (!name) return showToast('Введи название статуса')
    if (customStatuses.some(s => s.name.toLowerCase() === name.toLowerCase())) return showToast('Такой статус уже есть')
    let id = slug(name)
    while (customStatuses.some(s => s.id === id)) id += '_'
    const next = [...customStatuses, { id, name, color: newStatus.color, category: newStatus.category }]
    if (await persistStatuses(next)) { setNewStatus({ name:'', color:'#5b6ef5', category:'active' }); showToast('Статус добавлен ✓') }
  }
  async function updateStatus(id, patch) {
    const next = customStatuses.map(s => s.id === id ? { ...s, ...patch } : s)
    await persistStatuses(next)
  }
  async function delStatus(s) {
    if (statusCount(s.name) > 0) return showToast(`Нельзя удалить: есть аккаунты (${statusCount(s.name)})`)
    if (await persistStatuses(customStatuses.filter(x => x.id !== s.id))) showToast('Статус удалён')
  }
  function dropStatus(toIdx) {
    const from = stDrag
    setStDrag(null)
    if (from == null || from === toIdx) return
    const next = [...customStatuses]
    const [x] = next.splice(from, 1)
    next.splice(toIdx, 0, x)
    persistStatuses(next)
  }

  // ── Группы (строго из custom_groups) ──
  async function addGroup() {
    const prefix = newGroup.prefix.trim()
    if (!prefix) return showToast('Введи префикс группы')
    if (customGroups.some(g => g.prefix.toLowerCase() === prefix.toLowerCase())) return showToast('Такая группа уже есть')
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
  // ── Часовой пояс ──
  const TZ_LIST = (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function')
    ? Intl.supportedValuesOf('timeZone')
    : ['Asia/Nicosia','Europe/Kyiv','Europe/Moscow','Europe/Warsaw','Europe/Berlin','Europe/London','America/New_York','America/Los_Angeles','Asia/Dubai','Asia/Bangkok','UTC']
  async function saveTz(tz) {
    setUserTz(tz)
    setTzSaving(true)
    const ok = await saveSettings({ user_timezone: tz })
    setTzSaving(false)
    if (ok) showToast('Часовой пояс сохранён ✓ — спенд пересчитан')
  }
  async function toggleSpendByUserTz(on) {
    setSpendByUserTz(on)
    const ok = await saveSettings({ spend_by_user_tz: on })
    if (ok) showToast(on ? 'Спенд по вашему поясу ✓' : 'Спенд как в Google Ads ✓')
  }
  function autoTz() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected) saveTz(detected)
    } catch { showToast('Не удалось определить пояс') }
  }

  async function saveWatchdog() {
    const h = Math.max(1, parseInt(watchdogHours) || 2)
    setWatchdogHours(h)
    if (await saveSettings({ watchdog_hours: h })) showToast('Watchdog сохранён ✓')
  }

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
        .color-inp.sm{width:28px;height:28px}
        .hint{font-size:11px;color:var(--t3);margin-top:2px}
        .st-list{display:flex;flex-direction:column;gap:4px}
        .st-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border:1px solid var(--bd);border-radius:6px;background:var(--s2)}
        .st-row.drag{opacity:.4}
        .st-handle{cursor:grab;color:var(--t3);font-size:13px;user-select:none}
        .st-handle:active{cursor:grabbing}
        .st-name{flex:1;min-width:80px;background:var(--s1);border:1px solid var(--bd);border-radius:5px;padding:5px 8px;color:var(--t);font-size:13px;outline:none;font-family:'Inter',sans-serif}
        .st-name:focus{border-color:var(--acc)}
        .st-cat{background:var(--s1);border:1px solid var(--bd);border-radius:5px;padding:5px 6px;color:var(--t2);font-size:12px;outline:none;cursor:pointer;font-family:'Inter',sans-serif}
        .st-badge{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:500;white-space:nowrap}
        .st-cnt{min-width:22px;text-align:center;font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace}
        .st-del{background:none;border:none;color:var(--t3);cursor:pointer;font-size:16px;line-height:1;padding:0 4px}
        .st-del:hover:not(:disabled){color:#f05555}
        .st-del:disabled{opacity:.25;cursor:default}
        .rule-toggle{display:flex;align-items:center}
        .rule-name{flex:1;font-size:13px;color:var(--t)}
        .rule-thr{display:flex;align-items:center;gap:4px}
        .rule-thr input{width:64px;background:var(--s1);border:1px solid var(--bd);border-radius:5px;padding:5px 7px;color:var(--t);font-size:12px;outline:none;font-family:'JetBrains Mono',monospace}
        .rule-thr input:focus{border-color:var(--acc)}
        .rule-unit{font-size:12px;color:var(--t3)}
        .rate-cur{width:48px;font-family:'JetBrains Mono',monospace;font-weight:500;font-size:13px;color:var(--t)}
        .rate-val{width:110px;background:var(--s1);border:1px solid var(--bd);border-radius:5px;padding:5px 8px;color:var(--t);font-size:13px;font-family:'JetBrains Mono',monospace;outline:none}
        .rate-val:focus{border-color:var(--acc)}
        .rate-val:disabled{opacity:.5}
        .rate-eq{flex:1;font-size:11px;color:var(--t3)}
        .tz-sel{background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;color:var(--t);font-size:13px;outline:none;width:100%;font-family:'Inter',sans-serif;cursor:pointer}
        .tz-sel:focus{border-color:var(--acc)}
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
          <h2>🏷 Статусы <span style={{fontSize:11,color:'var(--t3)',fontWeight:400}}>· перетаскивай за ⠿</span></h2>
          <div className="st-list">
            {customStatuses.length === 0 && <div className="hint">Список пуст — добавь первый статус ниже.</div>}
            {customStatuses.map((s, i)=>{
              const used = statusCount(s.name)
              return (
                <div key={s.id} className={`st-row${stDrag===i?' drag':''}`}
                     onDragOver={e=>{e.preventDefault()}}
                     onDrop={()=>dropStatus(i)}>
                  <span className="st-handle" draggable onDragStart={()=>setStDrag(i)} onDragEnd={()=>setStDrag(null)}>⠿</span>
                  <input className="color-inp sm" type="color" value={s.color||'#5b6ef5'} onChange={e=>updateStatus(s.id,{color:e.target.value})}/>
                  <input className="st-name" value={s.name} onChange={e=>updateStatus(s.id,{name:e.target.value})}/>
                  <select className="st-cat" value={s.category||'neutral'} onChange={e=>updateStatus(s.id,{category:e.target.value})}>
                    {CATEGORIES.map(c=><option key={c.k} value={c.k}>{c.l}</option>)}
                  </select>
                  <span className="st-badge" style={{background:(CATEGORIES.find(c=>c.k===s.category)?.c||'#6b7280')+'22',color:CATEGORIES.find(c=>c.k===s.category)?.c||'#6b7280'}}>
                    {CATEGORIES.find(c=>c.k===s.category)?.l||'—'}
                  </span>
                  <span className="st-cnt" title="Аккаунтов с этим статусом">{used||0}</span>
                  <button className="st-del" title={used>0?`Нельзя: есть аккаунты (${used})`:'Удалить'} disabled={used>0} onClick={()=>delStatus(s)}>×</button>
                </div>
              )
            })}
          </div>
          <div className="row" style={{marginTop:12}}>
            <input className="color-inp" type="color" value={newStatus.color} onChange={e=>setNewStatus({...newStatus,color:e.target.value})}/>
            <div className="fi" style={{flex:1,marginBottom:0}}>
              <label>Новый статус</label>
              <input value={newStatus.name} onChange={e=>setNewStatus({...newStatus,name:e.target.value})} placeholder="Название статуса"/>
            </div>
            <div className="fi" style={{marginBottom:0}}>
              <label>Категория</label>
              <select className="ssel" value={newStatus.category} onChange={e=>setNewStatus({...newStatus,category:e.target.value})}>
                {CATEGORIES.map(c=><option key={c.k} value={c.k}>{c.l}</option>)}
              </select>
            </div>
            <button className="btn btn-acc" onClick={addStatus}>+ Добавить</button>
          </div>
          <div className="hint">Категория управляет счётчиками панели и заморозкой терминальных. Удалить можно, только если нет аккаунтов с этим статусом.</div>
        </div>

        {/* ГРУППЫ */}
        <div className="card">
          <h2>📁 Группы</h2>
          <div className="chips">
            {customGroups.length === 0 && <div className="hint">Групп пока нет.</div>}
            {customGroups.map(g=>(
              <span key={g.prefix} className="schip">
                <span className="dot" style={{background:g.color}}/>
                {g.prefix}
                <span className="x" title="Удалить" onClick={()=>delGroup(g.prefix)}>×</span>
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

        {/* ПРАВИЛА ПОДСВЕТКИ */}
        <div className="card">
          <h2>🎨 Подсветка строк</h2>
          <div className="hint" style={{marginBottom:10}}>Сработавшее правило красит левую полосу строки (приоритет — сверху вниз). CPA-правило красит ячейку CPA.</div>
          <div className="st-list">
            {rowRules.length === 0 && <div className="hint">Правил нет.</div>}
            {rowRules.map(r=>(
              <div key={r.id} className="st-row">
                <label className="rule-toggle" title={r.enabled===false?'Выключено':'Включено'}>
                  <input type="checkbox" checked={r.enabled!==false} onChange={e=>updateRule(r.id,{enabled:e.target.checked})}/>
                </label>
                <input className="color-inp sm" type="color" value={r.color||'#f5a623'} onChange={e=>updateRule(r.id,{color:e.target.value})}/>
                <span className="rule-name">{RULE_LABELS[r.id] || r.field}</span>
                {RULE_HAS_THRESHOLD[r.id] && (
                  <span className="rule-thr">
                    <input type="number" value={r.value}
                           onChange={e=>setRuleLocal(r.id,{value:parseFloat(e.target.value)||0})}
                           onBlur={saveRules}
                           onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/>
                    <span className="rule-unit">{RULE_HAS_THRESHOLD[r.id]}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* КУРСЫ ВАЛЮТ */}
        <div className="card">
          <h2>💱 Курсы валют к USD</h2>
          <div className="hint" style={{marginBottom:10}}>Спенд в панели аккаунтов нормализуется в USD: нативная сумма × курс. USD всегда 1.</div>
          <div className="st-list">
            {Object.entries(rates).sort((a,b)=>a[0].localeCompare(b[0])).map(([cur,val])=>(
              <div key={cur} className="st-row">
                <span className="rate-cur">{cur}</span>
                <input className="rate-val" type="number" step="0.0001" value={val} disabled={cur==='USD'}
                       onChange={e=>setRates({...rates,[cur]:e.target.value})}
                       onBlur={e=>cur!=='USD' && updateRate(cur,e.target.value)}/>
                <span className="rate-eq">× нативная = USD</span>
                <button className="st-del" title={cur==='USD'?'USD удалить нельзя':'Удалить'} disabled={cur==='USD'} onClick={()=>delRate(cur)}>×</button>
              </div>
            ))}
          </div>
          <div className="row" style={{marginTop:12}}>
            <div className="fi" style={{maxWidth:110,marginBottom:0}}>
              <label>Валюта</label>
              <input value={newRate.cur} onChange={e=>setNewRate({...newRate,cur:e.target.value})} placeholder="напр. CAD"/>
            </div>
            <div className="fi" style={{maxWidth:130,marginBottom:0}}>
              <label>Курс к USD</label>
              <input type="number" step="0.0001" value={newRate.val} onChange={e=>setNewRate({...newRate,val:e.target.value})} placeholder="0.74"/>
            </div>
            <button className="btn btn-acc" onClick={addRate}>+ Добавить</button>
          </div>
        </div>

        {/* ЧАСОВОЙ ПОЯС */}
        <div className="card">
          <h2>🌍 Часовой пояс</h2>
          <div className="hint" style={{marginBottom:10}}>Спенд и время показываются по этому поясу. Смена пояса пересчитывает всю историю (часы хранятся в БД).</div>
          <div className="row">
            <div className="fi" style={{flex:1,maxWidth:320,marginBottom:0}}>
              <label>Пояс</label>
              <select className="tz-sel" value={userTz} onChange={e=>saveTz(e.target.value)} disabled={tzSaving}>
                {!TZ_LIST.includes(userTz) && <option value={userTz}>{userTz}</option>}
                {TZ_LIST.map(z=><option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <button className="btn" onClick={autoTz} disabled={tzSaving}>📍 Определить автоматически</button>
          </div>
          <div className="hint" style={{marginTop:8}}>
            Сейчас в этом поясе: {(() => { try { return new Date().toLocaleString('ru', { timeZone: userTz, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) } catch { return '—' } })()}
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--bd)'}}>
            <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer'}}>
              <input type="checkbox" checked={spendByUserTz} onChange={e=>toggleSpendByUserTz(e.target.checked)} style={{marginTop:3}}/>
              <span>
                <div style={{fontSize:13,color:'var(--t)',fontWeight:500}}>Спенд по моему часовому поясу</div>
                <div className="hint" style={{marginTop:3}}>
                  Выкл — спенд как в Google Ads (по поясу аккаунта). Вкл — пересчёт по вашему часовому поясу из почасовых данных.
                </div>
              </span>
            </label>
          </div>
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
