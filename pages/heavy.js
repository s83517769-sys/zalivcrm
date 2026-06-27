import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'

export default function Heavy() {
  const { user, signOut } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [metrics, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('cost')
  const [filter, setFilter] = useState('all')
  const [editHeavy, setEditHeavy] = useState(null)
  const [heavyData, setHeavyData] = useState({}) // { accountId: { heavy: 0, avg_flow: 0, slots: [] } }
  const [toast, setToast] = useState('')

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    const saved = localStorage.getItem('zcrm_heavy')
    if (saved) setHeavyData(JSON.parse(saved))
    load()
  }, [])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  async function load() {
    setLoading(true)
    const data = await api('/api/accounts')
    const accs = data.accounts || []
    setAccounts(accs)

    const metricsMap = {}
    await Promise.all(accs.map(async a => {
      const m = await api(`/api/metrics/${a.id}`)
      metricsMap[a.id] = m.metrics || []
    }))
    setMetrics(metricsMap)
    setLoading(false)
  }

  function getTotalCost(accId) {
    return (metrics[accId] || []).reduce((s, m) => s + (+m.cost_usd || 0), 0)
  }
  function getTotalConv(accId) {
    return (metrics[accId] || []).reduce((s, m) => s + (+m.conversions || 0), 0)
  }
  function getCPA(accId) {
    const cost = getTotalCost(accId)
    const conv = getTotalConv(accId)
    return conv > 0 ? cost / conv : 0
  }

  function saveHeavy(accId, data) {
    const next = { ...heavyData, [accId]: data }
    setHeavyData(next)
    localStorage.setItem('zcrm_heavy', JSON.stringify(next))
    setEditHeavy(null)
    showToast('Сохранено ✓')
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // Только аккаунты у которых есть метрики или конверсии
  const rows = accounts.map(a => ({
    ...a,
    totalCost: getTotalCost(a.id),
    totalConv: getTotalConv(a.id),
    cpa: getCPA(a.id),
    heavy: heavyData[a.id]?.heavy || 0,
    avg_flow: heavyData[a.id]?.avg_flow || 0,
    slots: heavyData[a.id]?.slots || [],
  }))

  const filtered = rows
    .filter(a => {
      if (search && !a.name?.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'has_conv') return a.totalConv > 0
      if (filter === 'has_heavy') return a.heavy > 0
      if (filter === 'no_heavy') return a.totalConv > 0 && a.heavy === 0
      return a.totalCost > 0 || a.totalConv > 0
    })
    .sort((a, b) => {
      if (sortBy === 'cost') return b.totalCost - a.totalCost
      if (sortBy === 'conv') return b.totalConv - a.totalConv
      if (sortBy === 'cpa') return a.cpa - b.cpa
      if (sortBy === 'heavy') return b.heavy - a.heavy
      return (a.name||'').localeCompare(b.name||'')
    })

  const totalCost = filtered.reduce((s, a) => s + a.totalCost, 0)
  const totalConv = filtered.reduce((s, a) => s + a.totalConv, 0)
  const totalHeavy = filtered.reduce((s, a) => s + a.heavy, 0)
  const avgCpa = totalConv > 0 ? totalCost / totalConv : 0

  return (
    <>
      <Head><title>Heavy — ЗаливCRM</title></Head>
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
        .btn.act{background:rgba(91,110,245,.12);border-color:rgba(91,110,245,.3);color:var(--acc)}
        .toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--bd);background:var(--s1);flex-wrap:wrap;flex-shrink:0}
        .srch input{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:5px 8px;color:var(--t);font-size:12px;outline:none;width:200px}
        .srch input:focus{border-color:var(--acc)}
        .srch input::placeholder{color:var(--t3)}
        .ssel{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 7px;font-size:11px;color:var(--t2);outline:none;cursor:pointer;font-family:'Inter',sans-serif}
        .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px 16px;border-bottom:1px solid var(--bd);background:var(--s1);flex-shrink:0}
        .sc{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:8px 12px}
        .sc-l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
        .sc-v{font-size:16px;font-weight:500;font-family:'JetBrains Mono',monospace}
        .tbl-wrap{flex:1;overflow:auto}
        table{width:100%;border-collapse:collapse;font-size:12px}
        thead th{position:sticky;top:0;background:var(--s2);padding:7px 10px;text-align:left;font-size:10px;color:var(--t3);font-weight:500;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--bd);white-space:nowrap;z-index:10}
        thead th.r{text-align:right}
        tbody tr{border-bottom:1px solid var(--bd);transition:background .07s}
        tbody tr:hover td{background:var(--s2)}
        td{padding:6px 10px;vertical-align:middle}
        td.r{text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px}
        .acc-name{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:12px;color:var(--t)}
        .acc-sub{font-size:10px;color:var(--t3);margin-top:1px}
        .heavy-val{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:500}
        .slots{display:flex;gap:3px;flex-wrap:wrap}
        .slot{width:18px;height:18px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;font-family:'JetBrains Mono',monospace}
        .slot-num{background:rgba(34,209,122,.15);color:#22d17a}
        .slot-empty{background:var(--s3);color:var(--t3)}
        .edit-btn{background:none;border:1px solid var(--bd);border-radius:3px;cursor:pointer;color:var(--t3);font-size:10px;padding:2px 7px;font-family:'Inter',sans-serif;white-space:nowrap}
        .edit-btn:hover{border-color:var(--acc);color:var(--acc)}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:flex;align-items:center;justify-content:center}
        .modal{background:var(--s1);border:1px solid var(--bd2);border-radius:8px;width:500px;padding:24px}
        .modal h2{font-size:14px;font-weight:600;margin-bottom:16px;font-family:'JetBrains Mono',monospace;color:var(--acc)}
        .fi{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
        .fi label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em}
        .fi input{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:6px 8px;color:var(--t);font-size:13px;font-family:'JetBrains Mono',monospace;outline:none;width:100%}
        .fi input:focus{border-color:var(--acc)}
        .slots-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:4px}
        .slot-inp{background:var(--s2);border:1px solid var(--bd);border-radius:3px;padding:4px;color:var(--t);font-size:11px;font-family:'JetBrains Mono',monospace;outline:none;width:100%;text-align:center}
        .slot-inp:focus{border-color:var(--acc)}
        .slot-lbl{font-size:9px;color:var(--t3);text-align:center;margin-bottom:2px}
        .modal-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--bd)}
        .btn-acc{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:500}
        .btn-acc:hover{opacity:.9}
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:8px 16px;font-size:12px;color:var(--t);opacity:0;transition:all .2s;z-index:600;pointer-events:none}
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
        <Link href="/heavy" className="nav-link act">💪 Heavy</Link>
        <Link href="/archive" className="nav-link">🗄 Архив</Link>
        <Link href="/settings" className="nav-link">⚙️ Настройки</Link>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
          <button className="btn" onClick={()=>{const n=dark?'light':'dark';setDark(n==='dark');localStorage.setItem('zcrm_theme',n)}}>{dark?'☀️':'🌙'}</button>
          {user && <span style={{fontSize:11,color:'var(--t2)'}}>{user.user_metadata?.name || user.email}</span>}
          <button className="btn" onClick={signOut}>Выйти</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="srch">
          <input placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[
            {k:'all',l:'Все с метриками'},
            {k:'has_conv',l:'С конверсиями'},
            {k:'has_heavy',l:'С хеви'},
            {k:'no_heavy',l:'Хеви не заполнен'},
          ].map(f=>(
            <button key={f.k} className={`btn${filter===f.k?' act':''}`} onClick={()=>setFilter(f.k)}>{f.l}</button>
          ))}
        </div>
        <select className="ssel" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="cost">По расходу ↓</option>
          <option value="conv">По конверсиям ↓</option>
          <option value="cpa">По CPA ↑</option>
          <option value="heavy">По хеви ↓</option>
          <option value="name">По названию</option>
        </select>
        <span style={{fontSize:11,color:'var(--t3)',marginLeft:'auto'}}>{filtered.length} акк.</span>
      </div>

      <div className="summary">
        <div className="sc"><div className="sc-l">Всего расход</div><div className="sc-v" style={{color:'#22d17a'}}>{totalCost>0?'$'+Math.round(totalCost).toLocaleString('ru'):'—'}</div></div>
        <div className="sc"><div className="sc-l">Конверсии</div><div className="sc-v" style={{color:'#f5a623'}}>{totalConv||'—'}</div></div>
        <div className="sc"><div className="sc-l">Средний CPA</div><div className="sc-v" style={{color:avgCpa>70?'#f05555':'#22d17a'}}>{avgCpa>0?'$'+avgCpa.toFixed(0):'—'}</div></div>
        <div className="sc"><div className="sc-l">Всего хеви</div><div className="sc-v" style={{color:'#c084fc'}}>{totalHeavy||'—'}</div></div>
        <div className="sc"><div className="sc-l">Акк. с хеви</div><div className="sc-v">{filtered.filter(a=>a.heavy>0).length}</div></div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th style={{width:160}}>Аккаунт</th>
            <th style={{width:60}}>Гео</th>
            <th style={{width:80}}>Крео</th>
            <th className="r" style={{width:80}}>Расход $</th>
            <th className="r" style={{width:60}}>Конв.</th>
            <th className="r" style={{width:70}}>CPA $</th>
            <th className="r" style={{width:60}}>Хеви</th>
            <th className="r" style={{width:70}}>Ср. поток</th>
            <th style={{width:200}}>Слоты конверсий</th>
            <th style={{width:80}}>Действия</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="acc-name">{a.name}</div>
                  <div className="acc-sub">{a.status} · {a.funnel||'—'}</div>
                </td>
                <td style={{fontSize:11,color:'var(--t2)'}}>{a.geo||'—'}</td>
                <td style={{fontSize:11,color:'var(--t2)'}}>{a.creo||'—'}</td>
                <td className="r" style={{color:a.totalCost>0?'#22d17a':'var(--t3)'}}>
                  {a.totalCost>0?'$'+a.totalCost.toFixed(0):'—'}
                </td>
                <td className="r" style={{color:a.totalConv>0?'#f5a623':'var(--t3)'}}>
                  {a.totalConv||'—'}
                </td>
                <td className="r" style={{color:a.cpa>70?'#f05555':a.cpa>0?'#22d17a':'var(--t3)'}}>
                  {a.cpa>0?'$'+a.cpa.toFixed(0):'—'}
                </td>
                <td className="r">
                  <span className="heavy-val" style={{color:a.heavy>0?'#c084fc':'var(--t3)'}}>
                    {a.heavy||'—'}
                  </span>
                </td>
                <td className="r" style={{color:a.avg_flow>0?'var(--t)':'var(--t3)'}}>
                  {a.avg_flow>0?a.avg_flow:'—'}
                </td>
                <td>
                  <div className="slots">
                    {a.slots.length > 0
                      ? a.slots.slice(0,20).map((v,i) => (
                          <div key={i} className={`slot${v?` slot-num`:' slot-empty'}`}>
                            {v||''}
                          </div>
                        ))
                      : <span style={{fontSize:10,color:'var(--t3)'}}>не заполнено</span>
                    }
                  </div>
                </td>
                <td>
                  <button className="edit-btn" onClick={()=>setEditHeavy(a)}>✏️ Хеви</button>
                </td>
              </tr>
            ))}
            {filtered.length===0&&!loading&&(
              <tr><td colSpan={10} style={{textAlign:'center',padding:'40px',color:'var(--t3)'}}>
                Нет аккаунтов с метриками. Добавь метрики на странице аккаунта.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT HEAVY MODAL */}
      {editHeavy && <HeavyModal acc={editHeavy} data={heavyData[editHeavy.id]||{}} onSave={d=>saveHeavy(editHeavy.id,d)} onClose={()=>setEditHeavy(null)}/>}

      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}

function HeavyModal({ acc, data, onSave, onClose }) {
  const [heavy, setHeavy] = useState(String(data.heavy||''))
  const [avg_flow, setAvgFlow] = useState(String(data.avg_flow||''))
  const [slots, setSlots] = useState(Array.from({length:20}, (_,i) => data.slots?.[i]||''))

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>{acc.name}</h2>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          <div className="fi">
            <label>Кол-во хеви</label>
            <input type="number" value={heavy} onChange={e=>setHeavy(e.target.value)} placeholder="0"/>
          </div>
          <div className="fi">
            <label>Средний поток</label>
            <input type="number" value={avg_flow} onChange={e=>setAvgFlow(e.target.value)} placeholder="0"/>
          </div>
        </div>
        <div style={{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Слоты конверсий (#1 — #20)</div>
        <div className="slots-grid">
          {slots.map((v,i) => (
            <div key={i}>
              <div className="slot-lbl">#{i+1}</div>
              <input className="slot-inp" type="number" value={v} onChange={e=>{const n=[...slots];n[i]=e.target.value;setSlots(n)}} placeholder="—"/>
            </div>
          ))}
        </div>
        <div className="modal-acts">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-acc" onClick={()=>onSave({heavy:+heavy||0,avg_flow:+avg_flow||0,slots:slots.map(v=>+v||0)})}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
