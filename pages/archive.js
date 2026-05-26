import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'

const STATUS_COLOR = {
  'Пуск':'#4ea8de','Модерация':'#f5a623','Крутит':'#22d17a','Крутит (огран)':'#22d17a',
  'Дизапрув':'#f5a623','Разлог':'#f5a623','Апила':'#f5a623',
  'Вериф':'#c084fc','Вериф BOV':'#c084fc','Ком Вериф':'#c084fc',
  'На смену':'#f05555','БАН':'#f05555','Отмена запуска':'#f05555',
  'отклон':'#f5a623','Пауза':'#4ea8de',
  'Оплата 20':'#f472b6','Оплата 40':'#f472b6','Оплата 50':'#f472b6','Оплата 200':'#f472b6',
  'В ожидании':'#6b7280','пустой':'#6b7280',
}

export default function Archive() {
  const { user, signOut } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [costs, setCosts] = useState({})
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [search, setSearch] = useState('')
  const [restoring, setRestoring] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    load()
  }, [])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  async function load() {
    setLoading(true)
    const data = await api('/api/accounts/archived')
    const accs = data.accounts || []
    setAccounts(accs)

    const costMap = {}
    await Promise.all(accs.map(async a => {
      const m = await api(`/api/metrics/${a.id}`)
      costMap[a.id] = (m.metrics || []).reduce((s, r) => s + (+r.cost_usd || 0), 0)
    }))
    setCosts(costMap)
    setLoading(false)
  }

  async function restore(id) {
    setRestoring(id)
    await api(`/api/accounts/${id}`, { method:'PATCH', body: JSON.stringify({ is_archived: false }) })
    setRestoring(null)
    showToast('Аккаунт восстановлен ✓')
    await load()
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }
  function f$(v) { const n=+v||0; if(!n) return '—'; return n>=1000?'$'+Math.round(n).toLocaleString('ru'):'$'+n.toFixed(0) }

  const filtered = accounts.filter(a =>
    !search || a.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Head><title>Архив — ЗаливCRM</title></Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body.dark{--bg:#08090d;--s1:#0e0f15;--s2:#13141c;--s3:#191b25;--bd:#252840;--bd2:#2f3355;--t:#dde1f0;--t2:#8892b0;--t3:#4a5275;--acc:#5b6ef5}
        body.light{--bg:#f0f2f5;--s1:#ffffff;--s2:#f8f9fb;--s3:#eef0f4;--bd:#dde1eb;--bd2:#c5cad8;--t:#1a1d2e;--t2:#4a5275;--t3:#8892b0;--acc:#4556e0}
        body{background:var(--bg);color:var(--t);font-family:'Inter',sans-serif;font-size:13px;min-height:100vh;display:flex;flex-direction:column}
        .topbar{display:flex;align-items:center;gap:10px;padding:0 16px;height:48px;background:var(--s1);border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:50;flex-shrink:0}
        .logo{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500}
        .logo em{color:var(--acc);font-style:normal}
        .nav-link{font-size:12px;color:var(--t3);text-decoration:none;padding:4px 10px;border-radius:4px;transition:all .1s}
        .nav-link:hover{background:var(--s2);color:var(--t)}
        .nav-link.act{background:rgba(91,110,245,.12);color:var(--acc);font-weight:500}
        .sep{width:1px;height:20px;background:var(--bd)}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--t2);cursor:pointer;white-space:nowrap;outline:none;transition:all .1s;font-family:'Inter',sans-serif}
        .btn:hover{background:var(--s3);color:var(--t)}
        .toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--bd);background:var(--s1);flex-shrink:0}
        .srch input{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:5px 8px;color:var(--t);font-size:12px;outline:none;width:220px}
        .srch input:focus{border-color:var(--acc)}
        .srch input::placeholder{color:var(--t3)}
        .tbl-wrap{flex:1;overflow:auto}
        table{width:100%;border-collapse:collapse;font-size:12px}
        thead th{position:sticky;top:0;background:var(--s2);padding:7px 10px;text-align:left;font-size:10px;color:var(--t3);font-weight:500;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--bd);white-space:nowrap;z-index:10}
        thead th.r{text-align:right}
        tbody tr{border-bottom:1px solid var(--bd);transition:background .07s}
        tbody tr:hover td{background:var(--s2)}
        td{padding:6px 10px;vertical-align:middle;white-space:nowrap}
        td.r{text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px}
        .acc-name{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:12px;color:var(--t)}
        .acc-sub{font-size:10px;color:var(--t3);margin-top:1px}
        .badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:500;font-family:'JetBrains Mono',monospace;white-space:nowrap}
        .badge-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .cell-sm{font-size:11px;color:var(--t2);max-width:220px;overflow:hidden;text-overflow:ellipsis;display:inline-block}
        .cell-sm.muted{color:var(--t3)}
        .btn-restore{background:rgba(34,209,122,.1);border:1px solid rgba(34,209,122,.3);border-radius:3px;cursor:pointer;color:#22d17a;font-size:11px;padding:3px 10px;font-family:'Inter',sans-serif;white-space:nowrap}
        .btn-restore:hover{background:rgba(34,209,122,.2)}
        .btn-restore:disabled{opacity:.5;cursor:default}
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:8px 16px;font-size:12px;color:var(--t);opacity:0;transition:all .2s;z-index:600;pointer-events:none;white-space:nowrap}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        .overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:500}
        .spin{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
      `}</style>

      {loading && <div className="overlay"><div className="spin"/></div>}

      <div className="topbar">
        <div className="logo">Залив<em>CRM</em></div>
        <div className="sep"/>
        <Link href="/" className="nav-link">Аккаунты</Link>
        <Link href="/stats" className="nav-link">📊 Статистика</Link>
        <Link href="/proxy" className="nav-link">🌐 Прокси</Link>
        <Link href="/urls" className="nav-link">🔗 URL / CLO</Link>
        <Link href="/heavy" className="nav-link">💪 Heavy</Link>
        <Link href="/archive" className="nav-link act">🗄 Архив</Link>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
          <button className="btn" onClick={()=>{const n=dark?'light':'dark';setDark(n==='dark');localStorage.setItem('zcrm_theme',n)}}>{dark?'☀️':'🌙'}</button>
          {user && <span style={{fontSize:11,color:'var(--t2)'}}>{user.user_metadata?.name || user.email}</span>}
          <button className="btn" onClick={signOut}>Выйти</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="srch">
          <input placeholder="Поиск по названию..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <span style={{fontSize:11,color:'var(--t3)',marginLeft:'auto'}}>{filtered.length} в архиве</span>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th style={{width:170}}>Аккаунт</th>
            <th style={{width:130}}>Статус</th>
            <th style={{width:80}}>Гео</th>
            <th className="r" style={{width:100}}>Расход всего</th>
            <th style={{width:110}}>Дата бана</th>
            <th style={{width:240}}>Причина бана</th>
            <th style={{width:100}}>Заливщик</th>
            <th style={{width:110}}>Действия</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="acc-name">{a.name||'—'}</div>
                  <div className="acc-sub">{a.google_ads_id||''}</div>
                </td>
                <td>
                  <span className="badge" style={{background:'rgba(107,114,128,.1)',color:STATUS_COLOR[a.status]||'#6b7280'}}>
                    <span className="badge-dot" style={{background:STATUS_COLOR[a.status]||'#6b7280'}}/>
                    {a.status||'—'}
                  </span>
                </td>
                <td><span className="cell-sm">{a.geo||'—'}</span></td>
                <td className="r" style={{color:costs[a.id]>0?'#22d17a':'var(--t3)'}}>{f$(costs[a.id])}</td>
                <td><span className="cell-sm">{a.ban_date||'—'}</span></td>
                <td><span className="cell-sm muted" title={a.ban_reason||''}>{a.ban_reason||'—'}</span></td>
                <td><span className="cell-sm">{a.zalivshik||'—'}</span></td>
                <td>
                  <button className="btn-restore" disabled={restoring===a.id} onClick={()=>restore(a.id)}>
                    {restoring===a.id?'...':'↩ Восстановить'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length===0 && !loading && (
              <tr><td colSpan={8} style={{textAlign:'center',padding:'40px',color:'var(--t3)'}}>
                Архив пуст
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}
