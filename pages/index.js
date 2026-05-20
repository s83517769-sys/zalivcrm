import { useEffect, useState } from 'react'
import Head from 'next/head'

export default function Home() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sideFilter, setSideFilter] = useState('all')
  const [period, setPeriod] = useState('today')
  const [sortBy, setSortBy] = useState('cost_d')
  const [syncTime, setSyncTime] = useState('')
  const [dark, setDark] = useState(true)

  const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'

  useEffect(() => {
    const saved = localStorage.getItem('zcrm_theme')
    if (saved) setDark(saved === 'dark')
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('zcrm_theme', next ? 'dark' : 'light')
  }

  async function loadData() {
    try {
      const res = await fetch('/api/accounts', { headers: { 'x-api-key': API_KEY } })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const data = await res.json()
      setAccounts(data.accounts || [])
      const now = new Date()
      setSyncTime(now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0'))
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData(); const i = setInterval(loadData, 5*60*1000); return () => clearInterval(i) }, [])

  function pv(a) {
    if (period === 'yest') return { cost: a.yest_cost||0, clicks: a.yest_clicks||0, cpc: a.yest_cpc||0, ctr: a.yest_ctr||0, conv: a.yest_conv||0 }
    return { cost: a.today_cost||0, clicks: a.today_clicks||0, cpc: a.today_cpc||0, ctr: a.today_ctr||0, conv: a.today_conv||0 }
  }
  function f$(v) { const n=+v||0; if(!n)return'—'; if(n>=1000)return'$'+Math.round(n).toLocaleString('ru'); return'$'+n.toFixed(2) }
  function cnt(fn) { return accounts.filter(fn).length }

  const filtered = accounts
    .filter(a => {
      if (search && !a.name?.toLowerCase().includes(search.toLowerCase()) && !a.google_ads_id?.includes(search)) return false
      if (sideFilter === 'all') return true
      if (sideFilter === 'РАБОТАЕТ') return a.tech_status === 'РАБОТАЕТ'
      if (sideFilter === 'ПРОВЕРЬ') return a.tech_status === 'ПРОВЕРЬ АККАУНТ'
      if (sideFilter === 'ПАУЗЕ') return a.tech_status === 'ВСЕ НА ПАУЗЕ'
      if (sideFilter === 'НЕТ СВЯЗИ') return a.tech_status === 'НЕТ СВЯЗИ' || a.watchdog_status === 'dead'
      if (sideFilter === 'БАН') return a.manual_status === 'БАН'
      if (sideFilter === 'отклон') return a.manual_status === 'отклон'
      if (['SL-USA','GS-USA','MM-NZ'].includes(sideFilter)) return a.name?.startsWith(sideFilter)
      return true
    })
    .sort((a,b) => {
      const pa=pv(a),pb=pv(b)
      if(sortBy==='cost_d') return pb.cost-pa.cost
      if(sortBy==='cost_a') return pa.cost-pb.cost
      if(sortBy==='clicks') return pb.clicks-pa.clicks
      if(sortBy==='conv') return pb.conv-pa.conv
      return (a.name||'').localeCompare(b.name||'')
    })

  const totalToday = accounts.reduce((s,a)=>s+(a.today_cost||0),0)
  const totalYest  = accounts.reduce((s,a)=>s+(a.yest_cost||0),0)
  const totalClicks= accounts.reduce((s,a)=>s+(a.today_clicks||0),0)
  const totalConv  = accounts.reduce((s,a)=>s+(a.today_conv||0),0)
  const problems   = accounts.filter(a=>a.tech_status==='ПРОВЕРЬ АККАУНТ'||a.tech_status==='НЕТ СВЯЗИ'||a.watchdog_status==='dead').length
  const working    = accounts.filter(a=>a.tech_status==='РАБОТАЕТ').length

  function statusCls(s) {
    if(!s) return 'bgr'
    const m={'РАБОТАЕТ':'bg','Крутит':'bg','Пуск':'bg','ПРОВЕРЬ АККАУНТ':'ba','Проверь':'ba','Модерация':'ba','отклон':'ba','БАН':'br','НЕТ СВЯЗИ':'br','ВСЕ НА ПАУЗЕ':'bb','Пауза':'bb','Вериф':'bp'}
    if(s.startsWith('Оплата')) return 'bpk'
    return m[s]||'bgr'
  }

  const d = dark

  return (
    <>
      <Head><title>ЗаливCRM</title></Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Inter',sans-serif;font-size:13px;min-height:100vh;overflow-x:hidden;transition:background .2s,color .2s}

        /* DARK */
        body.dark{--bg:#08090d;--s1:#0e0f15;--s2:#13141c;--s3:#191b25;--bd:#252840;--bd2:#2f3355;--t:#dde1f0;--t2:#8892b0;--t3:#4a5275;--acc:#5b6ef5}
        /* LIGHT */
        body.light{--bg:#f4f5f7;--s1:#ffffff;--s2:#f8f9fb;--s3:#f0f1f4;--bd:#e2e4eb;--bd2:#c8cbda;--t:#1a1d2e;--t2:#4a5275;--t3:#8892b0;--acc:#4556e0}

        body{background:var(--bg);color:var(--t)}
        --green:#22d17a;--red:#f05555;--amber:#f5a623;--blue:#4ea8de;--purple:#c084fc;--pink:#f472b6;--gray:#6b7280;

        .app{display:flex;flex-direction:column;height:100vh;overflow:hidden}
        .topbar{display:flex;align-items:center;gap:10px;padding:0 16px;height:46px;background:var(--s1);border-bottom:1px solid var(--bd);flex-shrink:0}
        .logo{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:500;letter-spacing:.05em;color:var(--t)}
        .logo em{color:var(--acc);font-style:normal}
        .live-b{font-size:10px;color:#22d17a;background:rgba(34,209,122,.1);padding:1px 7px;border-radius:3px;margin-left:6px}
        .sep{width:1px;height:18px;background:var(--bd)}
        .srch input{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:5px 8px;color:var(--t);font-size:12px;outline:none;width:220px}
        .srch input:focus{border-color:var(--bd2)}
        .srch input::placeholder{color:var(--t3)}
        .tbs{font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace;white-space:nowrap;margin-left:auto}
        .tbs b{color:var(--t);font-weight:500}
        .tbs.g b{color:#22d17a}.tbs.r b{color:#f05555}
        .tb-acts{display:flex;gap:5px;align-items:center}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 9px;font-size:11px;color:var(--t2);cursor:pointer;font-family:'Inter',sans-serif;transition:all .1s;white-space:nowrap;outline:none}
        .btn:hover{background:var(--s3);color:var(--t)}
        .theme-btn{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 10px;font-size:13px;cursor:pointer;color:var(--t2);transition:all .1s;outline:none}
        .theme-btn:hover{background:var(--s3);color:var(--t)}
        .body{display:flex;flex:1;overflow:hidden}
        .sidebar{width:182px;background:var(--s1);border-right:1px solid var(--bd);flex-shrink:0;overflow-y:auto}
        .sb-sec{padding:10px 0 2px}
        .sb-lbl{font-size:10px;color:var(--t3);letter-spacing:.1em;text-transform:uppercase;padding:0 12px 5px}
        .sbi{display:flex;align-items:center;gap:7px;padding:5px 12px;cursor:pointer;color:var(--t3);font-size:12px;border-left:2px solid transparent;transition:all .1s;user-select:none}
        .sbi:hover{background:var(--s2);color:var(--t)}
        .sbi.act{background:var(--s2);color:var(--t);border-left-color:var(--acc)}
        .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .cnt{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;background:var(--s3);padding:1px 5px;border-radius:8px;color:var(--t3)}
        .sbi.act .cnt{background:rgba(91,110,245,.15);color:var(--acc)}
        .main{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column}
        .sbar{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:10px 14px;flex-shrink:0;border-bottom:1px solid var(--bd);background:var(--s1)}
        .sc{background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:9px 11px}
        .sc-l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
        .sc-v{font-size:17px;font-weight:500;font-family:'JetBrains Mono',monospace;line-height:1;color:var(--t)}
        .sc-s{font-size:10px;color:var(--t3);margin-top:2px}
        .sc.gr .sc-v{color:#22d17a}.sc.rd .sc-v{color:#f05555}.sc.am .sc-v{color:#f5a623}
        .tbar{display:flex;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid var(--bd);flex-shrink:0;background:var(--s1)}
        .fbt{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 9px;font-size:11px;color:var(--t3);cursor:pointer;font-family:'Inter',sans-serif;transition:all .1s;white-space:nowrap;outline:none}
        .fbt:hover{background:var(--s3);color:var(--t)}
        .fbt.act{background:rgba(69,86,224,.12);border-color:rgba(69,86,224,.4);color:var(--acc)}
        .tbar-r{margin-left:auto;display:flex;gap:5px;align-items:center}
        .ssel{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 7px;font-size:11px;color:var(--t2);font-family:'Inter',sans-serif;outline:none;cursor:pointer}
        .tbl-wrap{flex:1;overflow:auto}
        table{width:100%;border-collapse:collapse;font-size:12px}
        thead th{position:sticky;top:0;background:var(--s2);padding:7px 9px;text-align:left;font-size:10px;color:var(--t3);font-weight:500;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--bd);white-space:nowrap;z-index:10}
        thead th.r{text-align:right}
        tbody tr{border-bottom:1px solid var(--bd);cursor:pointer;transition:background .08s}
        tbody tr:hover td{background:var(--s2)}
        td{padding:6px 9px;vertical-align:middle;white-space:nowrap}
        td.r{text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px}
        td.z{color:var(--t3)}
        .an{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:12px;color:var(--t)}
        .ad{font-size:10px;color:var(--t3);margin-top:1px}
        .badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:500;font-family:'JetBrains Mono',monospace}
        .badge::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .bg{background:rgba(34,209,122,.1);color:#22d17a}.bg::before{background:#22d17a}
        .br{background:rgba(240,85,85,.1);color:#f05555}.br::before{background:#f05555}
        .ba{background:rgba(245,166,35,.1);color:#f5a623}.ba::before{background:#f5a623}
        .bb{background:rgba(78,168,222,.1);color:#4ea8de}.bb::before{background:#4ea8de}
        .bp{background:rgba(192,132,252,.1);color:#c084fc}.bp::before{background:#c084fc}
        .bpk{background:rgba(244,114,182,.12);color:#f472b6}.bpk::before{background:#f472b6}
        .bgr{background:rgba(107,114,128,.1);color:#6b7280}.bgr::before{background:#6b7280}
        .gv{color:#22d17a}.rv{color:#f05555}
        .nc{max-width:150px;overflow:hidden;text-overflow:ellipsis;color:var(--t3);font-size:11px}
        .nc.has{color:var(--t)}
        .empty{padding:60px;text-align:center;color:var(--t3);line-height:2}
        .empty-title{font-size:14px;color:var(--t);margin-bottom:8px}
        .overlay{position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;gap:14px}
        .overlay.hidden{display:none}
        .spin-r{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
      `}</style>

      <body className={dark ? 'dark' : 'light'}>

      {loading && (
        <div className="overlay">
          <div className="spin-r"></div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:'12px',color:'var(--t3)'}}>Загружаем данные...</div>
        </div>
      )}

      <div className="app">
        <div className="topbar">
          <div className="logo">Залив<em>CRM</em><span className="live-b">● live</span></div>
          <div className="sep"></div>
          <div className="srch">
            <input placeholder="Поиск по названию / ID..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="tbs g" style={{marginLeft:'auto'}}>Сег.: <b>{f$(totalToday)}</b></div>
          <div className="tbs">Вчера: <b>{f$(totalYest)}</b></div>
          <div className="tbs">Кл.: <b>{totalClicks.toLocaleString('ru')}</b></div>
          <div className="tbs">Конв.: <b>{totalConv}</b></div>
          <div className="tbs r">Пробл.: <b>{problems}</b></div>
          <div className="sep"></div>
          <div className="tb-acts">
            {syncTime && <span style={{fontSize:'10px',color:'var(--t3)',fontFamily:'JetBrains Mono,monospace'}}>обн. {syncTime}</span>}
            <button className="btn" onClick={loadData}>↻ Обновить</button>
            <button className="theme-btn" onClick={toggleTheme} title="Сменить тему">
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className="body">
          <div className="sidebar">
            <div className="sb-sec">
              <div className="sb-lbl">Тех. статус</div>
              {[
                {f:'all',       label:'Все',          color:'var(--t3)',  c:accounts.length},
                {f:'РАБОТАЕТ',  label:'Работает',     color:'#22d17a',   c:cnt(a=>a.tech_status==='РАБОТАЕТ')},
                {f:'ПРОВЕРЬ',   label:'Проверь',      color:'#f5a623',   c:cnt(a=>a.tech_status==='ПРОВЕРЬ АККАУНТ')},
                {f:'ПАУЗЕ',     label:'Все на паузе', color:'#4ea8de',   c:cnt(a=>a.tech_status==='ВСЕ НА ПАУЗЕ')},
                {f:'НЕТ СВЯЗИ', label:'Нет связи',   color:'#f05555',   c:cnt(a=>a.tech_status==='НЕТ СВЯЗИ'||a.watchdog_status==='dead')},
              ].map(item=>(
                <div key={item.f} className={`sbi${sideFilter===item.f?' act':''}`} onClick={()=>setSideFilter(item.f)}>
                  <span className="dot" style={{background:item.color}}></span>
                  {item.label}
                  <span className="cnt">{item.c}</span>
                </div>
              ))}
            </div>
            <div className="sb-sec">
              <div className="sb-lbl">Ручной статус</div>
              {[
                {f:'БАН',    label:'БАН',    color:'#f05555', c:cnt(a=>a.manual_status==='БАН')},
                {f:'отклон', label:'Отклон', color:'#f5a623', c:cnt(a=>a.manual_status==='отклон')},
              ].map(item=>(
                <div key={item.f} className={`sbi${sideFilter===item.f?' act':''}`} onClick={()=>setSideFilter(item.f)}>
                  <span className="dot" style={{background:item.color}}></span>
                  {item.label}
                  <span className="cnt">{item.c}</span>
                </div>
              ))}
            </div>
            <div className="sb-sec">
              <div className="sb-lbl">Группа</div>
              {[
                {f:'SL-USA',color:'#5b6ef5'},
                {f:'GS-USA',color:'#4ea8de'},
                {f:'MM-NZ', color:'#c084fc'},
              ].map(item=>(
                <div key={item.f} className={`sbi${sideFilter===item.f?' act':''}`} onClick={()=>setSideFilter(item.f)}>
                  <span className="dot" style={{background:item.color}}></span>
                  {item.f}
                  <span className="cnt">{cnt(a=>a.name?.startsWith(item.f))}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="main">
            <div className="sbar">
              <div className="sc gr"><div className="sc-l">Расход сегодня</div><div className="sc-v">{f$(totalToday)}</div><div className="sc-s">{accounts.length} акк.</div></div>
              <div className="sc"><div className="sc-l">Расход вчера</div><div className="sc-v">{f$(totalYest)}</div><div className="sc-s">весь день</div></div>
              <div className="sc"><div className="sc-l">Клики сег.</div><div className="sc-v">{totalClicks.toLocaleString('ru')}</div><div className="sc-s">всего</div></div>
              <div className="sc am"><div className="sc-l">Конверсии</div><div className="sc-v">{totalConv}</div><div className="sc-s">сегодня</div></div>
              <div className="sc rd"><div className="sc-l">Проблемы</div><div className="sc-v">{problems}</div><div className="sc-s">Проверь + Нет связи</div></div>
              <div className="sc"><div className="sc-l">Работает</div><div className="sc-v">{working}</div><div className="sc-s">из {accounts.length}</div></div>
            </div>

            <div className="tbar">
              <div style={{display:'flex',gap:'3px'}}>
                {['today','yest'].map(p=>(
                  <button key={p} className={`fbt${period===p?' act':''}`} onClick={()=>setPeriod(p)}>
                    {p==='today'?'Сегодня':'Вчера'}
                  </button>
                ))}
              </div>
              <div className="tbar-r">
                <select className="ssel" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                  <option value="cost_d">Расход ↓</option>
                  <option value="cost_a">Расход ↑</option>
                  <option value="clicks">Клики ↓</option>
                  <option value="conv">Конв. ↓</option>
                  <option value="name">По названию</option>
                </select>
                <span style={{fontSize:'11px',color:'var(--t3)'}}>{filtered.length} акк.</span>
              </div>
            </div>

            <div className="tbl-wrap">
              {error ? (
                <div className="empty"><div className="empty-title" style={{color:'#f05555'}}>Ошибка: {error}</div><div>Скрипты ещё не запускались — данных нет</div></div>
              ) : !loading && accounts.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">Аккаунтов пока нет</div>
                  <div>Запусти скрипт мониторинга в Google Ads —</div>
                  <div>аккаунты появятся автоматически после первого запуска</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{width:'130px'}}>Аккаунт</th>
                      <th style={{width:'108px'}}>Тех. статус</th>
                      <th style={{width:'108px'}}>Руч. статус</th>
                      <th className="r" style={{width:'70px'}}>Расход</th>
                      <th className="r" style={{width:'50px'}}>Клики</th>
                      <th className="r" style={{width:'46px'}}>CPC</th>
                      <th className="r" style={{width:'46px'}}>Конв.</th>
                      <th className="r" style={{width:'50px'}}>CPA</th>
                      <th className="r" style={{width:'46px'}}>CTR</th>
                      <th style={{width:'100px'}}>ID</th>
                      <th style={{width:'140px'}}>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => {
                      const v = pv(a)
                      const cpa = v.conv > 0 ? v.cost / v.conv : 0
                      const ts = a.tech_status
                      const ms = a.display_status || a.manual_status
                      return (
                        <tr key={a.id}>
                          <td><div className="an">{a.name}</div><div className="ad">{a.google_ads_id||''}</div></td>
                          <td><span className={`badge ${statusCls(ts)}`}>{ts==='РАБОТАЕТ'?'Работает':ts==='ПРОВЕРЬ АККАУНТ'?'Проверь':ts==='ВСЕ НА ПАУЗЕ'?'Паузе':ts==='НЕТ СВЯЗИ'?'Нет связи':ts||'—'}</span></td>
                          <td>{ms?<span className={`badge ${statusCls(ms)}`}>{ms}</span>:<span style={{color:'var(--t3)',fontSize:'10px'}}>—</span>}</td>
                          <td className={`r${v.cost>0?' gv':' z'}`}>{f$(v.cost)}</td>
                          <td className={`r${v.clicks>0?' gv':' z'}`}>{v.clicks||'—'}</td>
                          <td className="r">{v.cpc?'$'+v.cpc.toFixed(2):'—'}</td>
                          <td className={`r${v.conv>0?' gv':' z'}`}>{v.conv||'—'}</td>
                          <td className={`r${cpa>0?(cpa>70?' rv':' gv'):''}`}>{cpa?f$(cpa):'—'}</td>
                          <td className="r">{v.ctr?v.ctr.toFixed(2)+'%':'—'}</td>
                          <td style={{fontSize:'10px',color:'var(--t3)',fontFamily:'JetBrains Mono,monospace'}}>{a.google_ads_id||'—'}</td>
                          <td className={`nc${a.comment?' has':''}`}>{a.comment||a.dis_reason||'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
      </body>
    </>
  )
}
