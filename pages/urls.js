import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'

function cp(text, cb) {
  navigator.clipboard.writeText(text).then(cb)
}

export default function URLs() {
  const { user, signOut } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | has_black | no_black | has_clo
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    load()
  }, [])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  async function load() {
    setLoading(true)
    const data = await api('/api/accounts')
    setAccounts(data.accounts || [])
    setLoading(false)
  }

  async function saveUrls() {
    if (!editing) return
    setSaving(true)
    await api(`/api/accounts/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        link: editForm.link,
        black: editForm.black,
        clo_url: editForm.clo_url,
        white_id: editForm.white_id,
        google_tag: editForm.google_tag,
      })
    })
    await load()
    setEditing(null)
    showToast('Сохранено ✓')
    setSaving(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 2200) }

  const filtered = accounts.filter(a => {
    if (search && !a.name?.toLowerCase().includes(search.toLowerCase()) &&
        !a.link?.toLowerCase().includes(search.toLowerCase()) &&
        !a.black?.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'has_black') return !!a.black
    if (filter === 'no_black') return !a.black
    if (filter === 'has_clo') return !!a.clo_url
    if (filter === 'no_clo') return !a.clo_url
    return true
  })

  const hasBlack = accounts.filter(a => a.black).length
  const hasClo = accounts.filter(a => a.clo_url).length
  const hasLink = accounts.filter(a => a.link).length

  return (
    <>
      <Head><title>URL / CLO — ЗаливCRM</title></Head>
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
        .btn.act{background:rgba(91,110,245,.12);border-color:rgba(91,110,245,.3);color:var(--acc)}
        .btn-acc{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:500}
        .btn-acc:hover{opacity:.9}
        .toolbar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--bd);background:var(--s1);flex-wrap:wrap}
        .srch{position:relative}
        .srch input{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:5px 8px 5px 28px;color:var(--t);font-size:12px;outline:none;width:220px}
        .srch input:focus{border-color:var(--acc)}
        .srch input::placeholder{color:var(--t3)}
        .srch-ic{position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--t3);pointer-events:none}
        .summary{display:flex;gap:8px;padding:10px 16px;border-bottom:1px solid var(--bd);background:var(--s1)}
        .sc{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:7px 12px;display:flex;align-items:center;gap:8px}
        .sc-v{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500}
        .sc-l{font-size:11px;color:var(--t3)}
        .tbl-wrap{overflow:auto;flex:1}
        table{width:100%;border-collapse:collapse;font-size:12px}
        thead th{position:sticky;top:0;background:var(--s2);padding:7px 10px;text-align:left;font-size:10px;color:var(--t3);font-weight:500;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--bd);white-space:nowrap;z-index:10}
        tbody tr{border-bottom:1px solid var(--bd);transition:background .07s}
        tbody tr:hover td{background:var(--s2)}
        td{padding:7px 10px;vertical-align:middle}
        .acc-name{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:12px;color:var(--t)}
        .acc-status{font-size:10px;color:var(--t3);margin-top:2px}
        .url-cell{display:flex;align-items:center;gap:6px;max-width:260px}
        .url-text{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
        .url-text.empty{color:var(--t3);font-style:italic;font-family:'Inter',sans-serif;font-size:11px}
        .url-text.has{color:var(--t)}
        .cp-btn{background:none;border:none;cursor:pointer;color:var(--t3);font-size:12px;padding:2px 4px;border-radius:3px;flex-shrink:0;line-height:1}
        .cp-btn:hover{background:var(--s3);color:var(--t)}
        .edit-btn{background:none;border:1px solid var(--bd);border-radius:3px;cursor:pointer;color:var(--t3);font-size:10px;padding:2px 7px;flex-shrink:0;font-family:'Inter',sans-serif}
        .edit-btn:hover{border-color:var(--acc);color:var(--acc)}
        .tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:500;font-family:'JetBrains Mono',monospace}
        .tag-g{background:rgba(34,209,122,.1);color:#22d17a}
        .tag-r{background:rgba(240,85,85,.1);color:#f05555}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:flex;align-items:center;justify-content:center}
        .modal{background:var(--s1);border:1px solid var(--bd2);border-radius:8px;width:580px;max-height:90vh;overflow-y:auto;padding:24px}
        .modal h2{font-size:15px;font-weight:600;margin-bottom:16px;font-family:'JetBrains Mono',monospace;color:var(--t)}
        .fi{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
        .fi label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em}
        .fi input,.fi textarea{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:6px 8px;color:var(--t);font-size:12px;font-family:'JetBrains Mono',monospace;outline:none;width:100%}
        .fi input:focus,.fi textarea:focus{border-color:var(--acc)}
        .fi textarea{min-height:52px;resize:vertical}
        .modal-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--bd)}
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
        <Link href="/urls" className="nav-link act">🔗 URL / CLO</Link>
        <Link href="/heavy" className="nav-link">💪 Heavy</Link>
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
          <span className="srch-ic">⌕</span>
          <input placeholder="Поиск по названию / URL..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[
            {k:'all',l:'Все'},
            {k:'has_black',l:'✓ Black'},
            {k:'no_black',l:'✗ Без Black'},
            {k:'has_clo',l:'✓ CLO'},
            {k:'no_clo',l:'✗ Без CLO'},
          ].map(f=>(
            <button key={f.k} className={`btn${filter===f.k?' act':''}`} onClick={()=>setFilter(f.k)}>{f.l}</button>
          ))}
        </div>
        <span style={{fontSize:11,color:'var(--t3)',marginLeft:'auto'}}>{filtered.length} акк.</span>
      </div>

      <div className="summary">
        <div className="sc"><span className="sc-v" style={{color:'#22d17a'}}>{hasBlack}</span><span className="sc-l">с Black UTM</span></div>
        <div className="sc"><span className="sc-v" style={{color:'#4ea8de'}}>{hasClo}</span><span className="sc-l">с CLO</span></div>
        <div className="sc"><span className="sc-v">{hasLink}</span><span className="sc-l">с White ссылкой</span></div>
        <div className="sc"><span className="sc-v" style={{color:'#f05555'}}>{accounts.length - hasBlack}</span><span className="sc-l">без Black</span></div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th style={{width:160}}>Аккаунт</th>
            <th style={{width:220}}>White ссылка</th>
            <th style={{width:260}}>Black UTM</th>
            <th style={{width:220}}>CLO</th>
            <th style={{width:160}}>Google Tag</th>
            <th style={{width:80}}>Действия</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="acc-name">{a.name}</div>
                  <div className="acc-status">{a.status} · {a.geo||'—'}</div>
                </td>
                <td>
                  <div className="url-cell">
                    <span className={`url-text${a.link?' has':' empty'}`}>{a.link||'не заполнено'}</span>
                    {a.link && <button className="cp-btn" onClick={()=>cp(a.link,()=>showToast('Скопировано ✓'))} title="Копировать">⎘</button>}
                  </div>
                </td>
                <td>
                  <div className="url-cell">
                    {a.black
                      ? <span className="tag tag-g" style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',display:'block',whiteSpace:'nowrap'}}>{a.black}</span>
                      : <span className="url-text empty">не заполнено</span>
                    }
                    {a.black && <button className="cp-btn" onClick={()=>cp(a.black,()=>showToast('Скопировано ✓'))} title="Копировать">⎘</button>}
                  </div>
                </td>
                <td>
                  <div className="url-cell">
                    {a.clo_url
                      ? <a href={a.clo_url} target="_blank" rel="noopener noreferrer" className="url-text has" style={{textDecoration:'none'}}>{a.clo_url}</a>
                      : <span className="url-text empty">не заполнено</span>
                    }
                    {a.clo_url && <button className="cp-btn" onClick={()=>cp(a.clo_url,()=>showToast('Скопировано ✓'))} title="Копировать">⎘</button>}
                  </div>
                </td>
                <td>
                  <div className="url-cell">
                    <span className={`url-text${a.google_tag?' has':' empty'}`}>{a.google_tag||'—'}</span>
                    {a.google_tag && <button className="cp-btn" onClick={()=>cp(a.google_tag,()=>showToast('Скопировано ✓'))} title="Копировать">⎘</button>}
                  </div>
                </td>
                <td>
                  <button className="edit-btn" onClick={()=>{setEditing(a);setEditForm({link:a.link||'',black:a.black||'',clo_url:a.clo_url||'',white_id:a.white_id||'',google_tag:a.google_tag||''})}}>
                    ✏️ Изменить
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} style={{textAlign:'center',padding:'40px',color:'var(--t3)'}}>Нет аккаунтов</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT MODAL */}
      {editing && (
        <div className="modal-bg" onClick={()=>setEditing(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2>{editing.name}</h2>
            <div className="fi">
              <label>White ссылка (домен)</label>
              <input value={editForm.link} onChange={e=>setEditForm({...editForm,link:e.target.value})} placeholder="knalav.digital"/>
            </div>
            <div className="fi">
              <label>Black UTM</label>
              <textarea value={editForm.black} onChange={e=>setEditForm({...editForm,black:e.target.value})} placeholder="utm_campaign=SL-USA-122&utm_content=vid&utm_source=google_01&cid=sg1&bid=11"/>
            </div>
            <div className="fi">
              <label>CLO ссылка</label>
              <input value={editForm.clo_url} onChange={e=>setEditForm({...editForm,clo_url:e.target.value})} placeholder="https://secure-appdesktop.com/..."/>
            </div>
            <div className="fi">
              <label>White ID</label>
              <input value={editForm.white_id} onChange={e=>setEditForm({...editForm,white_id:e.target.value})} placeholder="1274"/>
            </div>
            <div className="fi">
              <label>Google Tag</label>
              <input value={editForm.google_tag} onChange={e=>setEditForm({...editForm,google_tag:e.target.value})} placeholder="AW-18089739696/IOL6CNnQ9KscELCL7rFD"/>
            </div>
            <div className="modal-acts">
              <button className="btn" onClick={()=>setEditing(null)}>Отмена</button>
              <button className="btn btn-acc" onClick={saveUrls} disabled={saving}>{saving?'Сохраняем...':'Сохранить'}</button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}
