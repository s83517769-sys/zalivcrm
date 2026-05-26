import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'

const STATUSES = [
  'Пуск','Модерация','Крутит','Крутит (огран)','Дизапрув','Разлог','Апила',
  'Вериф','Вериф BOV','Ком Вериф','На смену','БАН','Отмена запуска',
  'отклон','Пауза','Оплата 20','Оплата 40','Оплата 50','Оплата 200',
  'В ожидании','пустой'
]

const STATUS_COLOR = {
  'Пуск':'#4ea8de','Модерация':'#f5a623','Крутит':'#22d17a','Крутит (огран)':'#22d17a',
  'Дизапрув':'#f5a623','Разлог':'#f5a623','Апила':'#f5a623',
  'Вериф':'#c084fc','Вериф BOV':'#c084fc','Ком Вериф':'#c084fc',
  'На смену':'#f05555','БАН':'#f05555','Отмена запуска':'#f05555',
  'отклон':'#f5a623','Пауза':'#4ea8de',
  'Оплата 20':'#f472b6','Оплата 40':'#f472b6','Оплата 50':'#f472b6','Оплата 200':'#f472b6',
  'В ожидании':'#6b7280','пустой':'#6b7280',
}

const STATUS_BG = {
  'Крутит':'rgba(34,209,122,.12)','Крутит (огран)':'rgba(34,209,122,.1)',
  'БАН':'rgba(240,85,85,.12)','На смену':'rgba(240,85,85,.1)','Отмена запуска':'rgba(240,85,85,.1)',
  'Дизапрув':'rgba(245,166,35,.12)','отклон':'rgba(245,166,35,.1)','Модерация':'rgba(245,166,35,.08)',
  'Пуск':'rgba(78,168,222,.12)','Пауза':'rgba(78,168,222,.1)',
  'Вериф':'rgba(192,132,252,.12)','Вериф BOV':'rgba(192,132,252,.1)','Ком Вериф':'rgba(192,132,252,.1)',
  'Оплата 20':'rgba(244,114,182,.12)','Оплата 40':'rgba(244,114,182,.12)',
  'Оплата 50':'rgba(244,114,182,.12)','Оплата 200':'rgba(244,114,182,.12)',
}

const FROZEN = ['БАН','На смену','Отмена запуска']

const EMPTY_FORM = {
  name:'', google_ads_id:'', currency:'USD', status:'Пуск', zalivshik:'',
  geo:'', interests:'', funnel:'', link:'', black:'', clo_url:'', white_id:'',
  format:'Фото', creo:'', txt_variant:'', google_tag:'', language:'', devices:'all',
  comment:'', card:'', dis_date:'', dis_reason:'', dis_solution:'',
  launch_date:'', crut_date:'', ban_date:'', ban_reason:''
}

function api(path, opts={}) {
  return fetch(path, {
    ...opts,
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json', ...(opts.headers||{}) }
  }).then(r => r.json())
}

export default function Home() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [drawerMetrics, setDrawerMetrics] = useState([])
  const [drawerHistory, setDrawerHistory] = useState([])
  const [drawerTab, setDrawerTab] = useState('info')
  const [editForm, setEditForm] = useState(null)
  const [toast, setToast] = useState('')
  const [syncTime, setSyncTime] = useState('')
  const [statusPopup, setStatusPopup] = useState(null)
  const popupRef = useRef(null)

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    load()
  }, [])

  useEffect(() => {
    document.body.className = dark ? 'dark' : 'light'
  }, [dark])

  function toggleTheme() {
    const n = !dark; setDark(n)
    localStorage.setItem('zcrm_theme', n ? 'dark' : 'light')
  }

  async function load() {
    setLoading(true)
    const data = await api('/api/accounts')
    setAccounts(data.accounts || [])
    setLoading(false)
    const now = new Date()
    setSyncTime(now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0'))
  }

  async function openDrawer(acc) {
    setDrawer(acc)
    setEditForm({...acc})
    setDrawerTab('info')
    const [m, h] = await Promise.all([
      api(`/api/metrics/${acc.id}`),
      api(`/api/history/${acc.id}`)
    ])
    setDrawerMetrics(m.metrics || [])
    setDrawerHistory(h.history || [])
  }

  async function saveEdit() {
    if (!drawer) return
    setSaving(true)
    await api(`/api/accounts/${drawer.id}`, { method:'PATCH', body: JSON.stringify(editForm) })
    await load()
    const updated = accounts.find(a => a.id === drawer.id)
    if (updated) setDrawer({...updated, ...editForm})
    showToast('Сохранено ✓')
    setSaving(false)
  }

  async function addAccount() {
    if (!form.name) return showToast('Введи название аккаунта')
    setSaving(true)
    await api('/api/accounts', { method:'POST', body: JSON.stringify(form) })
    await load()
    setForm(EMPTY_FORM)
    setShowAdd(false)
    showToast('Аккаунт добавлен ✓')
    setSaving(false)
  }

  async function quickStatus(accId, newStatus) {
    setStatusPopup(null)
    await api(`/api/accounts/${accId}`, { method:'PATCH', body: JSON.stringify({ status: newStatus }) })
    await load()
    showToast('Статус → ' + newStatus)
  }

  async function archiveAcc(id) {
    await api(`/api/accounts/${id}`, { method:'DELETE' })
    await load()
    setDrawer(null)
    showToast('Аккаунт в архиве')
  }

  async function addMetric(accountId, row) {
    await api(`/api/metrics/${accountId}`, { method:'POST', body: JSON.stringify(row) })
    const m = await api(`/api/metrics/${accountId}`)
    setDrawerMetrics(m.metrics || [])
    showToast('Метрики сохранены ✓')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function f$(v) { const n=+v||0; if(!n) return '—'; return n>=1000?'$'+Math.round(n).toLocaleString('ru'):'$'+n.toFixed(2) }
  function grp(name) {
    if (!name) return 'OTHER'
    if (name.startsWith('SL-USA')) return 'SL-USA'
    if (name.startsWith('GS-USA')) return 'GS-USA'
    if (name.startsWith('MM-NZ')) return 'MM-NZ'
    if (name.startsWith('ART_DE')) return 'ART_DE'
    if (name.startsWith('NIK_DE')) return 'NIK_DE'
    if (name.startsWith('SN_')) return 'SN'
    if (name.startsWith('YUZ_')) return 'YUZ'
    return 'OTHER'
  }

  const filtered = accounts.filter(a => {
    if (search && !a.name?.toLowerCase().includes(search.toLowerCase()) &&
        !a.google_ads_id?.includes(search) && !a.zalivshik?.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    return true
  }).sort((a,b) => {
    if (sortBy === 'name') return (a.name||'').localeCompare(b.name||'')
    if (sortBy === 'status') return (a.status||'').localeCompare(b.status||'')
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const statusGroups = {}
  STATUSES.forEach(s => { statusGroups[s] = accounts.filter(a => a.status === s).length })

  const totalAccounts = accounts.length
  const working = accounts.filter(a => a.status && a.status.toLowerCase().includes('крутит')).length
  const problems = accounts.filter(a => ['БАН','На смену','отклон','Дизапрув'].includes(a.status)).length

  return (
    <>
      <Head><title>ЗаливCRM</title></Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body.dark{--bg:#08090d;--s1:#0e0f15;--s2:#13141c;--s3:#191b25;--bd:#252840;--bd2:#2f3355;--t:#dde1f0;--t2:#8892b0;--t3:#4a5275;--acc:#5b6ef5;--acc2:#4556e0}
        body.light{--bg:#f0f2f5;--s1:#ffffff;--s2:#f8f9fb;--s3:#eef0f4;--bd:#dde1eb;--bd2:#c5cad8;--t:#1a1d2e;--t2:#4a5275;--t3:#8892b0;--acc:#4556e0;--acc2:#3445d0}
        body{background:var(--bg);color:var(--t);font-family:'Inter',sans-serif;font-size:13px;min-height:100vh}
        .app{display:flex;flex-direction:column;height:100vh;overflow:hidden}
        .topbar{display:flex;align-items:center;gap:10px;padding:0 16px;height:48px;background:var(--s1);border-bottom:1px solid var(--bd);flex-shrink:0}
        .logo{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500;letter-spacing:.04em}
        .logo em{color:var(--acc);font-style:normal}
        .live{font-size:10px;color:#22d17a;background:rgba(34,209,122,.1);padding:2px 8px;border-radius:3px;margin-left:8px}
        .sep{width:1px;height:20px;background:var(--bd);flex-shrink:0}
        .srch{position:relative}
        .srch input{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:5px 8px 5px 30px;color:var(--t);font-size:12px;outline:none;width:220px}
        .srch input:focus{border-color:var(--acc)}
        .srch input::placeholder{color:var(--t3)}
        .srch-ic{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--t3);font-size:13px;pointer-events:none}
        .tb-stats{display:flex;gap:14px;margin-left:auto}
        .tbs{font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace;white-space:nowrap}
        .tbs b{color:var(--t);font-weight:500}
        .tbs.g b{color:#22d17a}.tbs.r b{color:#f05555}.tbs.a b{color:#f5a623}
        .tb-acts{display:flex;gap:5px;align-items:center}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--t2);cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;outline:none;transition:all .1s}
        .btn:hover{background:var(--s3);color:var(--t)}
        .btn-acc{background:var(--acc2);border-color:var(--acc);color:#fff;font-weight:500}
        .btn-acc:hover{background:var(--acc);color:#fff}
        .body{display:flex;flex:1;overflow:hidden}
        .sidebar{width:180px;background:var(--s1);border-right:1px solid var(--bd);overflow-y:auto;flex-shrink:0}
        .sb-sec{padding:8px 0 4px}
        .sb-lbl{font-size:10px;color:var(--t3);letter-spacing:.1em;text-transform:uppercase;padding:0 12px 4px}
        .sbi{display:flex;align-items:center;gap:6px;padding:4px 12px;cursor:pointer;color:var(--t3);font-size:12px;border-left:2px solid transparent;transition:all .1s;user-select:none}
        .sbi:hover{background:var(--s2);color:var(--t)}
        .sbi.act{background:var(--s2);color:var(--t);border-left-color:var(--acc)}
        .sb-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .sb-cnt{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;background:var(--s3);padding:1px 5px;border-radius:8px;color:var(--t3)}
        .sbi.act .sb-cnt{color:var(--acc);background:rgba(91,110,245,.15)}
        .main{flex:1;overflow:hidden;display:flex;flex-direction:column}
        .toolbar{display:flex;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid var(--bd);flex-shrink:0;background:var(--s1)}
        .ssel{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 7px;font-size:11px;color:var(--t2);outline:none;cursor:pointer;font-family:'Inter',sans-serif}
        .tbl-wrap{flex:1;overflow:auto}
        table{width:100%;border-collapse:collapse;font-size:12px}
        thead th{position:sticky;top:0;background:var(--s2);padding:7px 9px;text-align:left;font-size:10px;color:var(--t3);font-weight:500;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--bd);white-space:nowrap;z-index:10}
        thead th.r{text-align:right}
        tbody tr{border-bottom:1px solid var(--bd);cursor:pointer;transition:background .07s}
        tbody tr:hover td{background:var(--s2)}
        td{padding:6px 9px;vertical-align:middle;white-space:nowrap}
        td.r{text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px}
        .acc-name{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:12px;color:var(--t)}
        .acc-sub{font-size:10px;color:var(--t3);margin-top:1px}
        .badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:500;font-family:'JetBrains Mono',monospace;cursor:pointer;white-space:nowrap}
        .badge-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .cell-sm{font-size:11px;color:var(--t2);max-width:120px;overflow:hidden;text-overflow:ellipsis}
        .cell-sm.muted{color:var(--t3)}
        .frozen-row td{opacity:.6}
        .dbg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:none}
        .dbg.open{display:block}
        .drawer{position:fixed;top:0;right:-600px;width:600px;height:100vh;background:var(--s1);border-left:1px solid var(--bd);z-index:201;display:flex;flex-direction:column;transition:right .2s cubic-bezier(.4,0,.2,1);overflow:hidden}
        .drawer.open{right:0}
        .dr-head{padding:14px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:flex-start;gap:10px;flex-shrink:0}
        .dr-name{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:500;color:var(--t)}
        .dr-sub{font-size:11px;color:var(--t3);margin-top:3px}
        .dr-close{margin-left:auto;background:none;border:none;color:var(--t3);cursor:pointer;font-size:20px;line-height:1;padding:2px;flex-shrink:0}
        .dr-close:hover{color:var(--t)}
        .dr-tabs{display:flex;border-bottom:1px solid var(--bd);flex-shrink:0}
        .dr-tab{padding:8px 16px;font-size:12px;color:var(--t3);cursor:pointer;border-bottom:2px solid transparent;transition:all .1s}
        .dr-tab:hover{color:var(--t)}
        .dr-tab.act{color:var(--acc);border-bottom-color:var(--acc)}
        .dr-body{flex:1;overflow-y:auto;padding:16px 18px}
        .dr-sec{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;margin-top:16px}
        .dr-sec:first-child{margin-top:0}
        .dr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .dr-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
        .fi{display:flex;flex-direction:column;gap:3px}
        .fi label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em}
        .fi input,.fi select,.fi textarea{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:5px 7px;color:var(--t);font-size:12px;font-family:'Inter',sans-serif;outline:none;width:100%}
        .fi input:focus,.fi select:focus,.fi textarea:focus{border-color:var(--acc)}
        .fi textarea{resize:vertical;min-height:48px}
        .fi-full{grid-column:1/-1}
        .dr-save{width:100%;background:var(--acc2);border:1px solid var(--acc);border-radius:4px;padding:8px;color:#fff;font-size:13px;font-weight:500;cursor:pointer;margin-top:12px;font-family:'Inter',sans-serif}
        .dr-save:hover{background:var(--acc)}
        .metric-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
        .metric-table th{background:var(--s2);padding:5px 8px;text-align:center;font-size:10px;color:var(--t3);border-bottom:1px solid var(--bd)}
        .metric-table td{padding:5px 8px;text-align:center;border-bottom:1px solid var(--bd);font-family:'JetBrains Mono',monospace;font-size:11px}
        .metric-table tr:hover td{background:var(--s2)}
        .metric-input-row{display:grid;grid-template-columns:repeat(6,1fr) auto;gap:4px;align-items:end;margin-top:8px}
        .metric-input-row input{background:var(--s2);border:1px solid var(--bd);border-radius:3px;padding:4px 6px;color:var(--t);font-size:11px;font-family:'JetBrains Mono',monospace;outline:none;width:100%;text-align:center}
        .metric-input-row input:focus{border-color:var(--acc)}
        .hist-item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd)}
        .hist-item:last-child{border-bottom:none}
        .hist-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:4px;background:var(--acc)}
        .hist-txt{font-size:12px;color:var(--t)}
        .hist-date{font-size:10px;color:var(--t3);font-family:'JetBrains Mono',monospace;margin-top:2px}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:flex;align-items:center;justify-content:center}
        .modal{background:var(--s1);border:1px solid var(--bd);border-radius:8px;width:640px;max-height:90vh;overflow-y:auto;padding:24px;position:relative}
        .modal h2{font-size:15px;font-weight:600;color:var(--t);margin-bottom:16px}
        .modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .modal-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
        .modal-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--bd)}
        .status-popup{position:fixed;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:5px;z-index:400;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:60vh;overflow-y:auto}
        .sp-item{display:flex;align-items:center;gap:7px;padding:5px 10px;font-size:12px;color:var(--t2);cursor:pointer;border-radius:3px}
        .sp-item:hover{background:var(--s3);color:var(--t)}
        .overlay{position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;gap:14px}
        .overlay.hidden{display:none}
        .spin{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:8px 16px;font-size:12px;color:var(--t);opacity:0;transition:all .2s;z-index:600;pointer-events:none;white-space:nowrap}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        .btn-del{background:rgba(240,85,85,.1);border-color:rgba(240,85,85,.3);color:#f05555}
        .btn-del:hover{background:rgba(240,85,85,.2)}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
      `}</style>

      {loading && <div className="overlay"><div className="spin"></div><div style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--t3)'}}>Загрузка...</div></div>}

      <div className="app">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo">Залив<em>CRM</em><span className="live">● live</span></div>
          <div className="sep"/>
          <Link href="/" style={{fontSize:12,color:'var(--acc)',fontWeight:500,textDecoration:'none',padding:'4px 10px',background:'rgba(91,110,245,.1)',borderRadius:4}}>Аккаунты</Link>
          <Link href="/stats" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>📊 Статистика</Link>
          <Link href="/proxy" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>🌐 Прокси</Link>
          <Link href="/urls" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>🔗 URL / CLO</Link>
          <Link href="/heavy" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>💪 Heavy</Link>
          <div className="sep"/>
          <div className="srch">
            <span className="srch-ic">⌕</span>
            <input placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="tb-stats">
            <div className="tbs">Всего: <b>{totalAccounts}</b></div>
            <div className="tbs g">Крутит: <b>{working}</b></div>
            <div className="tbs r">Проблем: <b>{problems}</b></div>
          </div>
          <div className="sep"/>
          <div className="tb-acts">
            {syncTime && <span style={{fontSize:10,color:'var(--t3)',fontFamily:'JetBrains Mono'}}>обн. {syncTime}</span>}
            <button className="btn" onClick={load}>↻</button>
            <button className="btn" onClick={toggleTheme}>{dark?'☀️':'🌙'}</button>
            <button className="btn btn-acc" onClick={()=>setShowAdd(true)}>+ Аккаунт</button>
          </div>
        </div>

        <div className="body">
          {/* SIDEBAR */}
          <div className="sidebar">
            <div className="sb-sec">
              <div className="sb-lbl">Статус</div>
              <div className={`sbi${statusFilter==='all'?' act':''}`} onClick={()=>setStatusFilter('all')}>
                <span className="sb-dot" style={{background:'var(--t3)'}}/>Все<span className="sb-cnt">{totalAccounts}</span>
              </div>
              {STATUSES.filter(s=>statusGroups[s]>0).map(s=>(
                <div key={s} className={`sbi${statusFilter===s?' act':''}`} onClick={()=>setStatusFilter(s)}>
                  <span className="sb-dot" style={{background:STATUS_COLOR[s]||'#6b7280'}}/>
                  {s}<span className="sb-cnt">{statusGroups[s]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MAIN */}
          <div className="main">
            <div className="toolbar">
              <span style={{fontSize:11,color:'var(--t3)'}}>{filtered.length} акк.</span>
              <select className="ssel" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{marginLeft:8}}>
                <option value="created_at">По дате добавления</option>
                <option value="name">По названию</option>
                <option value="status">По статусу</option>
              </select>
            </div>

            <div className="tbl-wrap">
              {filtered.length === 0 && !loading ? (
                <div style={{padding:'60px',textAlign:'center',color:'var(--t3)',lineHeight:2}}>
                  <div style={{fontSize:14,color:'var(--t)',marginBottom:8}}>Аккаунтов нет</div>
                  <div>Нажми <b style={{color:'var(--acc)'}}>+ Аккаунт</b> чтобы добавить первый</div>
                </div>
              ) : (
                <table>
                  <thead><tr>
                    <th style={{width:150}}>Аккаунт</th>
                    <th style={{width:130}}>Статус</th>
                    <th style={{width:80}}>Гео</th>
                    <th style={{width:80}}>Воронка</th>
                    <th style={{width:100}}>Крео</th>
                    <th style={{width:80}}>Карта</th>
                    <th style={{width:120}}>Дата пуска</th>
                    <th style={{width:120}}>Дата крута</th>
                    <th style={{width:80}}>Заливщик</th>
                    <th style={{width:160}}>Дизапрув</th>
                    <th style={{width:120}}>Комментарий</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(a => (
                      <tr key={a.id} className={a.is_frozen?'frozen-row':''} onClick={()=>openDrawer(a)}>
                        <td>
                          <div className="acc-name">{a.name||'—'}</div>
                          <div className="acc-sub">{a.google_ads_id||''}</div>
                        </td>
                        <td onClick={e=>{e.stopPropagation();setStatusPopup({id:a.id,x:e.clientX,y:e.clientY})}}>
                          <span className="badge" style={{background:STATUS_BG[a.status]||'rgba(107,114,128,.1)',color:STATUS_COLOR[a.status]||'#6b7280'}}>
                            <span className="badge-dot" style={{background:STATUS_COLOR[a.status]||'#6b7280'}}/>
                            {a.status||'—'}
                          </span>
                        </td>
                        <td><span className="cell-sm">{a.geo||'—'}</span></td>
                        <td><span className="cell-sm">{a.funnel||'—'}</span></td>
                        <td><span className="cell-sm">{a.creo||'—'}</span></td>
                        <td><span className="cell-sm">{a.card||'—'}</span></td>
                        <td><span className="cell-sm">{a.launch_date||'—'}</span></td>
                        <td><span className="cell-sm">{a.crut_date||'—'}</span></td>
                        <td><span className="cell-sm">{a.zalivshik||'—'}</span></td>
                        <td>
                          {a.dis_reason ? (
                            <div>
                              <div className="cell-sm" style={{color:'#f5a623'}}>{a.dis_date||''}</div>
                              <div className="cell-sm muted" style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis'}}>{a.dis_reason}</div>
                            </div>
                          ) : <span className="cell-sm muted">—</span>}
                        </td>
                        <td><span className="cell-sm muted">{a.comment||'—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STATUS POPUP */}
      {statusPopup && (
        <div style={{position:'fixed',inset:0,zIndex:399}} onClick={()=>setStatusPopup(null)}>
          <div className="status-popup" style={{left:Math.min(statusPopup.x,window.innerWidth-190),top:Math.min(statusPopup.y+4,window.innerHeight-300)}}>
            {STATUSES.map(s=>(
              <div key={s} className="sp-item" onClick={e=>{e.stopPropagation();quickStatus(statusPopup.id,s)}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:STATUS_COLOR[s]||'#6b7280',display:'inline-block',flexShrink:0}}/>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DRAWER */}
      <div className={`dbg${drawer?' open':''}`} onClick={()=>setDrawer(null)}/>
      <div className={`drawer${drawer?' open':''}`}>
        {drawer && editForm && (
          <>
            <div className="dr-head">
              <div>
                <div className="dr-name">{drawer.name}</div>
                <div className="dr-sub">{drawer.google_ads_id} · {drawer.currency} · {drawer.geo}</div>
              </div>
              <button className="dr-close" onClick={()=>setDrawer(null)}>×</button>
            </div>
            <div className="dr-tabs">
              {['info','metrics','history'].map(t=>(
                <div key={t} className={`dr-tab${drawerTab===t?' act':''}`} onClick={()=>setDrawerTab(t)}>
                  {t==='info'?'Информация':t==='metrics'?'Метрики по дням':'История'}
                </div>
              ))}
            </div>
            <div className="dr-body">
              {drawerTab === 'info' && (
                <>
                  <div className="dr-sec">Основное</div>
                  <div className="dr-grid">
                    <div className="fi"><label>Название</label><input value={editForm.name||''} onChange={e=>setEditForm({...editForm,name:e.target.value})}/></div>
                    <div className="fi"><label>Google Ads ID</label><input value={editForm.google_ads_id||''} onChange={e=>setEditForm({...editForm,google_ads_id:e.target.value})}/></div>
                    <div className="fi"><label>Статус</label>
                      <select value={editForm.status||''} onChange={e=>setEditForm({...editForm,status:e.target.value})}>
                        {STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="fi"><label>Заливщик</label><input value={editForm.zalivshik||''} onChange={e=>setEditForm({...editForm,zalivshik:e.target.value})}/></div>
                    <div className="fi"><label>Гео</label><input value={editForm.geo||''} onChange={e=>setEditForm({...editForm,geo:e.target.value})}/></div>
                    <div className="fi"><label>Интересы</label><input value={editForm.interests||''} onChange={e=>setEditForm({...editForm,interests:e.target.value})}/></div>
                    <div className="fi"><label>Воронка</label><input value={editForm.funnel||''} onChange={e=>setEditForm({...editForm,funnel:e.target.value})}/></div>
                    <div className="fi"><label>Формат</label>
                      <select value={editForm.format||'Фото'} onChange={e=>setEditForm({...editForm,format:e.target.value})}>
                        <option>Фото</option><option>Видео</option>
                      </select>
                    </div>
                    <div className="fi"><label>Крео</label><input value={editForm.creo||''} onChange={e=>setEditForm({...editForm,creo:e.target.value})}/></div>
                    <div className="fi"><label>Текста</label><input value={editForm.txt_variant||''} onChange={e=>setEditForm({...editForm,txt_variant:e.target.value})}/></div>
                    <div className="fi"><label>Карта</label><input value={editForm.card||''} onChange={e=>setEditForm({...editForm,card:e.target.value})}/></div>
                    <div className="fi"><label>Валюта</label>
                      <select value={editForm.currency||'USD'} onChange={e=>setEditForm({...editForm,currency:e.target.value})}>
                        <option>USD</option><option>EUR</option><option>AUD</option><option>GBP</option>
                      </select>
                    </div>
                  </div>

                  <div className="dr-sec">Ссылки</div>
                  <div className="dr-grid">
                    <div className="fi fi-full"><label>White (ссылка)</label><input value={editForm.link||''} onChange={e=>setEditForm({...editForm,link:e.target.value})}/></div>
                    <div className="fi fi-full"><label>Black UTM</label><input value={editForm.black||''} onChange={e=>setEditForm({...editForm,black:e.target.value})}/></div>
                    <div className="fi fi-full"><label>CLO</label><input value={editForm.clo_url||''} onChange={e=>setEditForm({...editForm,clo_url:e.target.value})}/></div>
                    <div className="fi"><label>Google Tag</label><input value={editForm.google_tag||''} onChange={e=>setEditForm({...editForm,google_tag:e.target.value})}/></div>
                    <div className="fi"><label>White ID</label><input value={editForm.white_id||''} onChange={e=>setEditForm({...editForm,white_id:e.target.value})}/></div>
                  </div>

                  <div className="dr-sec">Дизапрув / Огран</div>
                  <div className="dr-grid">
                    <div className="fi"><label>Дата</label><input value={editForm.dis_date||''} onChange={e=>setEditForm({...editForm,dis_date:e.target.value})} placeholder="дд.мм.гг"/></div>
                    <div className="fi"><label>Решение</label><input value={editForm.dis_solution||''} onChange={e=>setEditForm({...editForm,dis_solution:e.target.value})}/></div>
                    <div className="fi fi-full"><label>Причина</label><textarea value={editForm.dis_reason||''} onChange={e=>setEditForm({...editForm,dis_reason:e.target.value})}/></div>
                  </div>

                  <div className="dr-sec">Даты</div>
                  <div className="dr-grid3">
                    <div className="fi"><label>Дата пуска</label><input type="date" value={editForm.launch_date||''} onChange={e=>setEditForm({...editForm,launch_date:e.target.value})}/></div>
                    <div className="fi"><label>Дата крута</label><input type="date" value={editForm.crut_date||''} onChange={e=>setEditForm({...editForm,crut_date:e.target.value})}/></div>
                    <div className="fi"><label>Дата бана</label><input type="date" value={editForm.ban_date||''} onChange={e=>setEditForm({...editForm,ban_date:e.target.value})}/></div>
                  </div>

                  <div className="dr-sec">Комментарий</div>
                  <div className="fi"><textarea value={editForm.comment||''} onChange={e=>setEditForm({...editForm,comment:e.target.value})} style={{minHeight:60}}/></div>

                  <button className="dr-save" onClick={saveEdit} disabled={saving}>{saving?'Сохраняем...':'Сохранить'}</button>
                  <button className="btn btn-del" style={{width:'100%',marginTop:8,padding:7}} onClick={()=>archiveAcc(drawer.id)}>В архив</button>
                </>
              )}

              {drawerTab === 'metrics' && (
                <MetricsTab accountId={drawer.id} metrics={drawerMetrics} onAdd={addMetric} onRefresh={async()=>{const m=await api(`/api/metrics/${drawer.id}`);setDrawerMetrics(m.metrics||[])}} />
              )}

              {drawerTab === 'history' && (
                <>
                  <div className="dr-sec">История изменений</div>
                  {drawerHistory.length === 0 ? (
                    <div style={{color:'var(--t3)',fontSize:12}}>История пуста</div>
                  ) : drawerHistory.map(h => (
                    <div key={h.id} className="hist-item">
                      <div className="hist-dot"/>
                      <div>
                        <div className="hist-txt">
                          <b>{h.field_name}</b>: {h.old_value||'—'} → <b>{h.new_value}</b>
                        </div>
                        <div className="hist-date">{new Date(h.created_at).toLocaleString('ru')}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ADD ACCOUNT MODAL */}
      {showAdd && (
        <div className="modal-bg" onClick={()=>setShowAdd(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2>+ Новый аккаунт</h2>
            <div className="modal-grid">
              <div className="fi"><label>Название *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="SL-USA-200"/></div>
              <div className="fi"><label>Google Ads ID</label><input value={form.google_ads_id} onChange={e=>setForm({...form,google_ads_id:e.target.value})} placeholder="123-456-7890"/></div>
              <div className="fi"><label>Статус</label>
                <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="fi"><label>Заливщик</label><input value={form.zalivshik} onChange={e=>setForm({...form,zalivshik:e.target.value})} placeholder="Имя"/></div>
              <div className="fi"><label>Гео</label><input value={form.geo} onChange={e=>setForm({...form,geo:e.target.value})} placeholder="KR"/></div>
              <div className="fi"><label>Интересы</label><input value={form.interests} onChange={e=>setForm({...form,interests:e.target.value})} placeholder="Segment"/></div>
              <div className="fi"><label>Воронка</label><input value={form.funnel} onChange={e=>setForm({...form,funnel:e.target.value})} placeholder="281"/></div>
              <div className="fi"><label>Формат</label>
                <select value={form.format} onChange={e=>setForm({...form,format:e.target.value})}>
                  <option>Фото</option><option>Видео</option>
                </select>
              </div>
              <div className="fi"><label>Крео</label><input value={form.creo} onChange={e=>setForm({...form,creo:e.target.value})} placeholder="3экрана"/></div>
              <div className="fi"><label>Текста</label><input value={form.txt_variant} onChange={e=>setForm({...form,txt_variant:e.target.value})} placeholder="111"/></div>
              <div className="fi"><label>Карта</label><input value={form.card} onChange={e=>setForm({...form,card:e.target.value})} placeholder="мультик 9137"/></div>
              <div className="fi"><label>Валюта</label>
                <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
                  <option>USD</option><option>EUR</option><option>AUD</option><option>GBP</option>
                </select>
              </div>
              <div className="fi" style={{gridColumn:'1/-1'}}><label>White ссылка</label><input value={form.link} onChange={e=>setForm({...form,link:e.target.value})} placeholder="knalav.digital"/></div>
              <div className="fi" style={{gridColumn:'1/-1'}}><label>Black UTM</label><input value={form.black} onChange={e=>setForm({...form,black:e.target.value})} placeholder="utm_campaign=..."/></div>
              <div className="fi" style={{gridColumn:'1/-1'}}><label>CLO</label><input value={form.clo_url} onChange={e=>setForm({...form,clo_url:e.target.value})} placeholder="https://secure-appdesktop.com/..."/></div>
              <div className="fi" style={{gridColumn:'1/-1'}}><label>Google Tag</label><input value={form.google_tag} onChange={e=>setForm({...form,google_tag:e.target.value})} placeholder="AW-18089739696/IOL6CNnQ9KscELCL7rFD"/></div>
              <div className="fi" style={{gridColumn:'1/-1'}}><label>Комментарий</label><textarea value={form.comment} onChange={e=>setForm({...form,comment:e.target.value})}/></div>
            </div>
            <div className="modal-acts">
              <button className="btn" onClick={()=>setShowAdd(false)}>Отмена</button>
              <button className="btn btn-acc" onClick={addAccount} disabled={saving}>{saving?'Добавляем...':'Добавить аккаунт'}</button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast${toast?' show':''}`}>{toast}</div>
    </>
  )
}

function MetricsTab({ accountId, metrics, onAdd, onRefresh }) {
  const today = new Date().toISOString().split('T')[0]
  const [row, setRow] = useState({ metric_date: today, clicks:'', cpc_local:'', cpc_usd:'', cost_usd:'', conversions:'' })

  const totalCost = metrics.reduce((s,m)=>s+(+m.cost_usd||0),0)
  const totalClicks = metrics.reduce((s,m)=>s+(+m.clicks||0),0)
  const totalConv = metrics.reduce((s,m)=>s+(+m.conversions||0),0)
  const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:12,fontFamily:'JetBrains Mono',fontSize:11,color:'var(--t3)'}}>
        <span>Итого: <b style={{color:'var(--t)'}}>${totalCost.toFixed(2)}</b></span>
        <span>Кликов: <b style={{color:'var(--t)'}}>{totalClicks}</b></span>
        <span>Конв.: <b style={{color:'var(--t)'}}>{totalConv}</b></span>
        <span>Ср.CPC: <b style={{color:'var(--t)'}}>${avgCpc.toFixed(3)}</b></span>
      </div>

      <table className="metric-table">
        <thead><tr>
          <th>Дата</th><th>Клики</th><th>CPC (лок.)</th><th>CPC $</th><th>Cost $</th><th>Конв.</th><th>CPA $</th>
        </tr></thead>
        <tbody>
          {metrics.map(m=>(
            <tr key={m.id}>
              <td>{m.metric_date}</td>
              <td>{m.clicks||'—'}</td>
              <td>{m.cpc_local||'—'}</td>
              <td>{m.cpc_usd||'—'}</td>
              <td style={{color:'#22d17a'}}>{m.cost_usd?'$'+Number(m.cost_usd).toFixed(2):'—'}</td>
              <td>{m.conversions||'—'}</td>
              <td style={{color:m.cpa>70?'#f05555':m.cpa>0?'#22d17a':'var(--t3)'}}>{m.cpa?'$'+Number(m.cpa).toFixed(2):'—'}</td>
            </tr>
          ))}
          {metrics.length === 0 && <tr><td colSpan={7} style={{color:'var(--t3)',textAlign:'center',padding:'16px'}}>Нет данных</td></tr>}
        </tbody>
      </table>

      <div style={{fontSize:10,color:'var(--t3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>Добавить день</div>
      <div className="metric-input-row">
        <input type="date" value={row.metric_date} onChange={e=>setRow({...row,metric_date:e.target.value})}/>
        <input placeholder="Клики" value={row.clicks} onChange={e=>setRow({...row,clicks:e.target.value})}/>
        <input placeholder="CPC лок." value={row.cpc_local} onChange={e=>setRow({...row,cpc_local:e.target.value})}/>
        <input placeholder="CPC $" value={row.cpc_usd} onChange={e=>setRow({...row,cpc_usd:e.target.value})}/>
        <input placeholder="Cost $" value={row.cost_usd} onChange={e=>setRow({...row,cost_usd:e.target.value})}/>
        <input placeholder="Конв." value={row.conversions} onChange={e=>setRow({...row,conversions:e.target.value})}/>
        <button className="btn btn-acc" style={{padding:'4px 10px'}} onClick={()=>onAdd(accountId,row)}>+</button>
      </div>
    </div>
  )
}
