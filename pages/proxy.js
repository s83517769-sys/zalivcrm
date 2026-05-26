import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'

const GEOS = ['AU','NL','BE','US','HR','BG','LV','UK','PL','FR','CZ','CA','JP','TW','TH','MY','KR','NZ','DE','ES']

export default function Proxy() {
  const { user, signOut } = useAuth()
  const [proxies, setProxies] = useState({})
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    load()
  }, [])

  useEffect(() => {
    document.body.className = dark ? 'dark' : 'light'
  }, [dark])

  async function load() {
    setLoading(true)
    const data = await api('/api/proxy')
    setProxies(data.proxies || {})
    setLoading(false)
  }

  async function save(geo, val) {
    const n = parseInt(val) || 0
    await api('/api/proxy', {
      method: 'POST',
      body: JSON.stringify({ geo, count: n })
    })
    setProxies(p => ({ ...p, [geo]: n }))
    setEditing(null)
    showToast('Сохранено ✓')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  const totalProxies = Object.values(proxies).reduce((s, v) => s + (+v || 0), 0)
  const geoWithProxies = GEOS.filter(g => (proxies[g] || 0) > 0).length

  return (
    <>
      <Head><title>Прокси — ЗаливCRM</title></Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body.dark{--bg:#08090d;--s1:#0e0f15;--s2:#13141c;--s3:#191b25;--bd:#252840;--bd2:#2f3355;--t:#dde1f0;--t2:#8892b0;--t3:#4a5275;--acc:#5b6ef5}
        body.light{--bg:#f0f2f5;--s1:#ffffff;--s2:#f8f9fb;--s3:#eef0f4;--bd:#dde1eb;--bd2:#c5cad8;--t:#1a1d2e;--t2:#4a5275;--t3:#8892b0;--acc:#4556e0}
        body{background:var(--bg);color:var(--t);font-family:'Inter',sans-serif;font-size:13px;min-height:100vh}
        .topbar{display:flex;align-items:center;gap:10px;padding:0 16px;height:48px;background:var(--s1);border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:50}
        .logo{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500}
        .logo em{color:var(--acc);font-style:normal}
        .nav-link{font-size:12px;color:var(--t3);text-decoration:none;padding:4px 10px;border-radius:4px;transition:all .1s}
        .nav-link:hover{background:var(--s2);color:var(--t)}
        .nav-link.act{background:rgba(91,110,245,.12);color:var(--acc);font-weight:500}
        .sep{width:1px;height:20px;background:var(--bd)}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--t2);cursor:pointer;white-space:nowrap;outline:none;transition:all .1s;font-family:'Inter',sans-serif}
        .btn:hover{background:var(--s3);color:var(--t)}
        .page{padding:20px 24px;max-width:900px}
        .page-title{font-size:18px;font-weight:600;color:var(--t);margin-bottom:4px}
        .page-sub{font-size:12px;color:var(--t3);margin-bottom:20px}
        .summary{display:flex;gap:12px;margin-bottom:24px}
        .sc{background:var(--s1);border:1px solid var(--bd);border-radius:6px;padding:10px 16px;min-width:140px}
        .sc-l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
        .sc-v{font-size:20px;font-weight:500;font-family:'JetBrains Mono',monospace;color:var(--t)}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
        .proxy-card{background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:14px 16px;cursor:pointer;transition:all .15s;position:relative}
        .proxy-card:hover{border-color:var(--bd2);background:var(--s2)}
        .proxy-card.has{border-color:rgba(34,209,122,.3)}
        .proxy-card.low{border-color:rgba(245,166,35,.3)}
        .proxy-card.empty{opacity:.6}
        .geo-label{font-size:16px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--t);margin-bottom:6px}
        .geo-count{font-size:28px;font-weight:500;font-family:'JetBrains Mono',monospace}
        .geo-count.has{color:#22d17a}
        .geo-count.low{color:#f5a623}
        .geo-count.empty{color:var(--t3)}
        .geo-sub{font-size:10px;color:var(--t3);margin-top:3px}
        .edit-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center}
        .edit-modal{background:var(--s1);border:1px solid var(--bd2);border-radius:8px;padding:24px;width:260px}
        .edit-title{font-size:15px;font-weight:600;margin-bottom:16px;font-family:'JetBrains Mono',monospace}
        .edit-input{width:100%;background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:10px;font-size:24px;font-weight:500;font-family:'JetBrains Mono',monospace;color:var(--t);outline:none;text-align:center;margin-bottom:12px}
        .edit-input:focus{border-color:var(--acc)}
        .edit-acts{display:flex;gap:8px}
        .edit-save{flex:1;background:var(--acc);border:none;border-radius:4px;padding:8px;color:#fff;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif}
        .edit-save:hover{opacity:.9}
        .edit-cancel{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:8px 14px;color:var(--t2);font-size:13px;cursor:pointer;font-family:'Inter',sans-serif}
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:8px 16px;font-size:12px;color:var(--t);opacity:0;transition:all .2s;z-index:600;pointer-events:none;white-space:nowrap}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        .overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:500}
        .spin{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {loading && <div className="overlay"><div className="spin"/></div>}

      <div className="topbar">
        <div className="logo">Залив<em>CRM</em></div>
        <div className="sep"/>
        <Link href="/" className="nav-link">Аккаунты</Link>
        <Link href="/stats" className="nav-link">📊 Статистика</Link>
        <Link href="/proxy" className="nav-link act">🌐 Прокси</Link>
        <Link href="/urls" className="nav-link">🔗 URL / CLO</Link>
        <Link href="/heavy" className="nav-link">💪 Heavy</Link>
        <Link href="/archive" className="nav-link">🗄 Архив</Link>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
          <button className="btn" onClick={()=>{const n=dark?'light':'dark';setDark(n==='dark');localStorage.setItem('zcrm_theme',n)}}>{dark?'☀️':'🌙'}</button>
          {user && <span style={{fontSize:11,color:'var(--t2)'}}>{user.user_metadata?.name || user.email}</span>}
          <button className="btn" onClick={signOut}>Выйти</button>
        </div>
      </div>

      <div className="page">
        <div className="page-title">🌐 Прокси</div>
        <div className="page-sub">Кликни на гео чтобы обновить остаток</div>

        <div className="summary">
          <div className="sc"><div className="sc-l">Всего прокси</div><div className="sc-v" style={{color:'#22d17a'}}>{totalProxies}</div></div>
          <div className="sc"><div className="sc-l">Гео с прокси</div><div className="sc-v">{geoWithProxies} / {GEOS.length}</div></div>
          <div className="sc"><div className="sc-l">Заканчивают</div><div className="sc-v" style={{color:'#f5a623'}}>{GEOS.filter(g=>(proxies[g]||0)>0&&(proxies[g]||0)<=5).length}</div></div>
        </div>

        <div className="grid">
          {GEOS.map(geo => {
            const cnt = proxies[geo] || 0
            const cls = cnt === 0 ? 'empty' : cnt <= 5 ? 'low' : 'has'
            return (
              <div key={geo} className={`proxy-card ${cls}`} onClick={()=>{setEditing(geo);setEditVal(String(cnt))}}>
                <div className="geo-label">{geo}</div>
                <div className={`geo-count ${cls}`}>{cnt}</div>
                <div className="geo-sub">{cnt===0?'нет прокси':cnt<=5?'⚠️ заканчивают':'✓ есть'}</div>
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <div className="edit-overlay" onClick={()=>setEditing(null)}>
          <div className="edit-modal" onClick={e=>e.stopPropagation()}>
            <div className="edit-title">🌐 {editing}</div>
            <input
              className="edit-input"
              type="number"
              value={editVal}
              onChange={e=>setEditVal(e.target.value)}
              autoFocus
              onKeyDown={e=>e.key==='Enter'&&save(editing,editVal)}
            />
            <div className="edit-acts">
              <button className="edit-cancel" onClick={()=>setEditing(null)}>Отмена</button>
              <button className="edit-save" onClick={()=>save(editing,editVal)}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}
