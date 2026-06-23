import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'
import { TECH_STATUS_MAP } from '../lib/techStatus'

// Технические статусы для режима «По тех-статусам» — дефолтный набор строк
// в каноническом порядке. Финальный список строится динамически из реальных
// снимков + этого набора (см. activeTechStatuses), пустые строки скрываются.
// «ПРОВЕРЬ» и «НЕТ СВЯЗИ» — legacy из MCC-скрипта, в новой логике заменены
// на Бан/Модерация/Новые, поэтому в дефолтный набор не входят. Если такие
// статусы окажутся в старых снимках — отрисуются как «прочие» в конце.
const TECH_STATUSES_FOR_STATS = ['Модерация','Крутит','Отклонены','Бюджет','Пауза/Оплата','Бан']

// Шапка ячейки-дня. Один компонент на все 4 таблицы — гарантирует, что
// число и подпись «сег.» всегда выложены одинаково и не ломают высоту строки.
// Day number сверху, «сег.» строго под ним с собственным line-height — никаких
// перекрытий с первой строкой данных.
function DayTh({ d, today }) {
  const isToday = d === today
  return (
    <th className={isToday ? 'today-col' : ''}>
      <div className="th-day">
        <span className="th-day-num">{d}</span>
        {isToday && <span className="th-day-tag">сег.</span>}
      </div>
    </th>
  )
}

const STATUSES = [
  { key: 'Пуск',          color: '#4ea8de', bg: 'rgba(78,168,222,.12)' },
  { key: 'Модерация',     color: '#f5a623', bg: 'rgba(245,166,35,.12)' },
  { key: 'Крутит',        color: '#22d17a', bg: 'rgba(34,209,122,.12)' },
  { key: 'Крутит (огран)',color: '#22d17a', bg: 'rgba(34,209,122,.08)' },
  { key: 'Дизапрув',      color: '#f5a623', bg: 'rgba(245,166,35,.1)'  },
  { key: 'Вериф',         color: '#c084fc', bg: 'rgba(192,132,252,.12)'},
  { key: 'Вериф BOV',     color: '#c084fc', bg: 'rgba(192,132,252,.1)' },
  { key: 'На смену',      color: '#f05555', bg: 'rgba(240,85,85,.1)'   },
  { key: 'БАН',           color: '#f05555', bg: 'rgba(240,85,85,.12)'  },
  { key: 'отклон',        color: '#f5a623', bg: 'rgba(245,166,35,.1)'  },
  { key: 'Пауза',         color: '#4ea8de', bg: 'rgba(78,168,222,.1)'  },
  { key: 'Оплата 20',     color: '#f472b6', bg: 'rgba(244,114,182,.12)'},
  { key: 'Оплата 40',     color: '#f472b6', bg: 'rgba(244,114,182,.12)'},
  { key: 'Оплата 50',     color: '#f472b6', bg: 'rgba(244,114,182,.12)'},
  { key: 'Оплата 200',    color: '#f472b6', bg: 'rgba(244,114,182,.12)'},
  { key: 'Отмена запуска',color: '#f05555', bg: 'rgba(240,85,85,.08)' },
]

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export default function Stats() {
  const { user, signOut } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [metrics, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [view, setView] = useState('status') // status | cost | zalivshik
  // Внутри режима «По статусам»: показывать строки по ручным или по техническим.
  // Дефолт — технические (вылизанные, отражают реальность от скрипта).
  const [statusKind, setStatusKind] = useState('tech') // 'tech' | 'manual'
  const [techStats, setTechStats] = useState(null) // { by_day:{}, first_snapshot:null }
  const [manualStats, setManualStats] = useState(null) // зеркало для ручных снимков
  const [customStatuses, setCustomStatuses] = useState([]) // палитра ручных статусов из настроек

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const daysInMonth = getDaysInMonth(year, month)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const monthName = now.toLocaleString('ru', { month: 'long', year: 'numeric' })

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t) setDark(t === 'dark')
    load()
    // year/month фиксированы на «сейчас» при заходе на /stats — грузим один раз
    api(`/api/stats/tech-status?year=${year}&month=${month + 1}`)
      .then(r => setTechStats(r))
      .catch(() => setTechStats({ by_day: {}, first_snapshot: null }))
    api(`/api/stats/manual-status?year=${year}&month=${month + 1}`)
      .then(r => setManualStats(r))
      .catch(() => setManualStats({ by_day: {}, first_snapshot: null }))
    // Палитра ручных статусов — из настроек юзера. Нужна для цвета строки в
    // режиме «Ручные»: пользователь может завести свой custom_statuses,
    // встроенный STATUSES — fallback для базовых имён.
    api('/api/users/settings')
      .then(r => {
        if (Array.isArray(r?.settings?.custom_statuses)) setCustomStatuses(r.settings.custom_statuses)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.body.className = dark ? 'dark' : 'light'
  }, [dark])

  async function load() {
    setLoading(true)
    const data = await api('/api/accounts')
    const accs = data.accounts || []
    setAccounts(accs)

    // Загружаем метрики для всех аккаунтов
    const metricsMap = {}
    await Promise.all(accs.map(async a => {
      const m = await api(`/api/metrics/${a.id}`)
      metricsMap[a.id] = m.metrics || []
    }))
    setMetrics(metricsMap)
    setLoading(false)
  }

  // Считаем статусы по дням
  // Используем created_at как прокси для даты добавления
  // и статус как текущий
  function getStatusCountForDay(day, status) {
    const date = new Date(year, month, day)
    return accounts.filter(a => {
      if (a.status !== status) return false
      const created = new Date(a.created_at)
      // Аккаунт существовал в этот день
      return created <= date
    }).length
  }

  function getCostForDay(day) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    let total = 0
    Object.values(metrics).forEach(accMetrics => {
      const m = accMetrics.find(m => m.metric_date === dateStr)
      if (m) total += +m.cost_usd || 0
    })
    return total
  }

  function getClicksForDay(day) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    let total = 0
    Object.values(metrics).forEach(accMetrics => {
      const m = accMetrics.find(m => m.metric_date === dateStr)
      if (m) total += +m.clicks || 0
    })
    return total
  }

  function getConvForDay(day) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    let total = 0
    Object.values(metrics).forEach(accMetrics => {
      const m = accMetrics.find(m => m.metric_date === dateStr)
      if (m) total += +m.conversions || 0
    })
    return total
  }

  // Группы заливщиков
  const zalivshiki = [...new Set(accounts.map(a => a.zalivshik).filter(Boolean))]

  function getZalivshikCountForDay(day, zalivshik, status) {
    const date = new Date(year, month, day)
    return accounts.filter(a => {
      if (a.zalivshik !== zalivshik) return false
      if (status && a.status !== status) return false
      const created = new Date(a.created_at)
      return created <= date
    }).length
  }

  const totalCost = days.reduce((s, d) => s + getCostForDay(d), 0)
  const totalClicks = days.reduce((s, d) => s + getClicksForDay(d), 0)
  const totalConv = days.reduce((s, d) => s + getConvForDay(d), 0)
  const avgCpa = totalConv > 0 ? totalCost / totalConv : 0

  // Активные статусы для режима «Ручные» — динамически из РЕАЛЬНЫХ снимков и
  // текущих аккаунтов, плюс палитра custom_statuses + дефолтный STATUSES.
  // Пустые (нигде не встретились) — не показываем.
  function colorOfManualStatus(name) {
    const c = customStatuses.find(s => s.name === name)
    if (c?.color) return { color: c.color, bg: c.bg || `${c.color}1f` }
    const s = STATUSES.find(s => s.key === name)
    if (s) return { color: s.color, bg: s.bg }
    return { color: '#6b7280', bg: 'rgba(107,114,128,.12)' }
  }
  const activeManualStatuses = (() => {
    const names = new Set()
    for (const a of accounts) { if (a.status) names.add(a.status) }
    if (manualStats?.by_day) {
      for (const d of Object.values(manualStats.by_day)) {
        for (const n of Object.keys(d)) names.add(n)
      }
    }
    // Сортировка: сначала имена из custom_statuses в их порядке, потом из дефолтного STATUSES,
    // потом всё остальное по алфавиту. Скрытые (нет ни в снимках, ни в текущих) сюда не попадают.
    const order = [
      ...customStatuses.map(s => s.name),
      ...STATUSES.map(s => s.key).filter(k => !customStatuses.some(c => c.name === k)),
    ]
    return [...names].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  })()

  // Активные тех-статусы для режима «Технические» — динамически из снимков.
  // Legacy «ПРОВЕРЬ» / «НЕТ СВЯЗИ» в TECH_STATUSES_FOR_STATS уже не входят;
  // если они вдруг прилетят из старых снимков — попадут как «прочие» в конец,
  // что приемлемо (постепенно вытесняются).
  const activeTechStatuses = (() => {
    const names = new Set(TECH_STATUSES_FOR_STATS)
    if (techStats?.by_day) {
      for (const d of Object.values(techStats.by_day)) {
        for (const n of Object.keys(d)) names.add(n)
      }
    }
    const sorted = [...names].sort((a, b) => {
      const ia = TECH_STATUSES_FOR_STATS.indexOf(a)
      const ib = TECH_STATUSES_FOR_STATS.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    // Скрываем строки, где total за месяц = 0 (Сейчас тоже учитываем).
    return sorted.filter(ts => {
      let total = 0
      if (techStats?.by_day) for (const d of Object.values(techStats.by_day)) total += d[ts] || 0
      return total > 0
    })
  })()

  return (
    <>
      <Head><title>Статистика — ЗаливCRM</title></Head>
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
        .nav-link.act{background:rgba(91,110,245,.12);color:var(--acc)}
        .sep{width:1px;height:20px;background:var(--bd)}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--t2);cursor:pointer;white-space:nowrap;outline:none;transition:all .1s;font-family:'Inter',sans-serif}
        .btn:hover{background:var(--s3);color:var(--t)}
        .btn.act{background:rgba(91,110,245,.12);border-color:rgba(91,110,245,.3);color:var(--acc)}
        .page{padding:16px 20px;max-width:100%;overflow-x:auto}
        .page-title{font-size:18px;font-weight:600;color:var(--t);margin-bottom:4px}
        .page-sub{font-size:12px;color:var(--t3);margin-bottom:16px;text-transform:capitalize}
        .summary-cards{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:20px}
        .sc{background:var(--s1);border:1px solid var(--bd);border-radius:6px;padding:10px 12px}
        .sc-l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
        .sc-v{font-size:18px;font-weight:500;font-family:'JetBrains Mono',monospace;color:var(--t)}
        .sc-v.g{color:#22d17a}.sc-v.r{color:#f05555}.sc-v.a{color:#f5a623}
        .table-wrap{overflow-x:auto}
        table{border-collapse:separate;border-spacing:0;font-size:11px;min-width:100%}
        /* Sticky-шапка под топбаром. КЛЮЧЕВОЙ момент: border-collapse:separate
           вместо collapse — без этого z-index на <th> при position:sticky не
           работает надёжно в Chrome (известная проблема), thead перекрывала
           первую строку только частично, отчего та визуально подрезалась
           сверху. С border-spacing:0 геометрия не меняется, но stacking теперь
           корректный: thead с z-index:20 полностью кроет первую строку tbody
           при скролле, не пропуская её верх под себя.
           Разделитель — outset box-shadow (1px ниже cell). vertical-align:top
           + .th-day → числа дней у верхнего края, «сег.» строго под числом. */
        thead th{position:sticky;top:48px;background:var(--s2);padding:8px 8px 12px;text-align:center;font-size:11px;color:var(--t3);font-weight:500;box-shadow:0 1px 0 var(--bd);white-space:nowrap;z-index:20;vertical-align:top;line-height:1.2}
        thead th:first-child{text-align:left;position:sticky;left:0;z-index:30;min-width:120px}
        .th-day{display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1}
        .th-day-num{font-size:11px;color:var(--t3);font-weight:500;line-height:1}
        .th-day-tag{font-size:8px;color:var(--acc);line-height:1;letter-spacing:.03em}
        tbody tr:hover td{background:var(--s2)}
        /* Первая строка tbody — увеличенный отступ сверху: при скролле sticky
           шапка останавливается ровно над ней, отступ гарантирует читаемость. */
        tbody tr:first-child td{padding-top:14px}
        td{padding:5px 8px;text-align:center;border-bottom:1px solid var(--bd);white-space:nowrap;font-family:'JetBrains Mono',monospace;vertical-align:middle;background:var(--bg)}
        td:first-child{text-align:left;position:sticky;left:0;background:var(--bg);z-index:10;font-family:'Inter',sans-serif;font-size:11px}
        tbody tr:hover td:first-child{background:var(--s2)}
        .status-label{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500}
        .status-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .cell-val{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;min-width:24px}
        .cell-zero{color:var(--t3)}
        .today-col{background:rgba(91,110,245,.06) !important}
        .total-row td{background:var(--s2);font-weight:600;border-top:2px solid var(--bd2)}
        .cost-row td{color:#22d17a}
        .section-header{background:var(--s1) !important}
        .section-header td{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--t3);font-weight:600;padding:8px 8px 4px;font-family:'Inter',sans-serif}
        .overlay{position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;gap:14px}
        .spin{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
      `}</style>

      {loading && <div className="overlay"><div className="spin"/><div style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--t3)'}}>Загрузка...</div></div>}

      <div className="topbar">
        <div className="logo">Залив<em>CRM</em></div>
        <div className="sep"/>
        <Link href="/" className="nav-link">← Аккаунты</Link>
        <Link href="/stats" className="nav-link act">📊 Статистика</Link>
        <Link href="/proxy" className="nav-link">🌐 Прокси</Link>
        <Link href="/urls" className="nav-link">🔗 URL / CLO</Link>
        <Link href="/heavy" className="nav-link">💪 Heavy</Link>
        <Link href="/archive" className="nav-link">🗄 Архив</Link>
        <Link href="/settings" className="nav-link">⚙️ Настройки</Link>
        <div style={{marginLeft:'auto',display:'flex',gap:5}}>
          <button className={`btn${view==='status'?' act':''}`} onClick={()=>setView('status')}>По статусам</button>
          <button className={`btn${view==='cost'?' act':''}`} onClick={()=>setView('cost')}>По метрикам</button>
          {zalivshiki.length > 0 && <button className={`btn${view==='zalivshik'?' act':''}`} onClick={()=>setView('zalivshik')}>По заливщикам</button>}
          <div className="sep"/>
          <button className="btn" onClick={()=>{const n=dark?'light':'dark';setDark(n==='dark');localStorage.setItem('zcrm_theme',n)}}>{dark?'☀️':'🌙'}</button>
          {user && <span style={{fontSize:11,color:'var(--t2)',marginLeft:4}}>{user.user_metadata?.name || user.email}</span>}
          <button className="btn" onClick={signOut}>Выйти</button>
        </div>
      </div>

      <div className="page">
        <div className="page-title">Ежедневная сводка</div>
        <div className="page-sub">{monthName} · {accounts.length} аккаунтов</div>

        {/* Summary cards */}
        <div className="summary-cards">
          <div className="sc"><div className="sc-l">Всего акк.</div><div className="sc-v">{accounts.length}</div></div>
          <div className="sc"><div className="sc-l">Крутит</div><div className="sc-v g">{accounts.filter(a=>a.status&&a.status.includes('Крутит')).length}</div></div>
          <div className="sc"><div className="sc-l">БАН / На смену</div><div className="sc-v r">{accounts.filter(a=>['БАН','На смену'].includes(a.status)).length}</div></div>
          <div className="sc"><div className="sc-l">Cost этот мес.</div><div className="sc-v g">{totalCost>0?'$'+Math.round(totalCost).toLocaleString('ru'):'—'}</div></div>
          <div className="sc"><div className="sc-l">Клики</div><div className="sc-v">{totalClicks>0?totalClicks.toLocaleString('ru'):'—'}</div></div>
          <div className="sc"><div className="sc-l">Конв. / CPA</div><div className="sc-v a">{totalConv>0?`${totalConv} / $${avgCpa.toFixed(0)}`:'—'}</div></div>
        </div>

        <div className="table-wrap">
          {view === 'status' && (
            <>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{fontSize:11,color:'var(--t3)'}}>Источник статуса:</span>
                <button className={`btn${statusKind==='manual'?' act':''}`} onClick={()=>setStatusKind('manual')}>Ручные</button>
                <button className={`btn${statusKind==='tech'?' act':''}`} onClick={()=>setStatusKind('tech')}>Технические</button>
                <span style={{fontSize:11,color:'var(--t3)',marginLeft:'auto'}}>
                  {statusKind === 'tech' ? (
                    techStats?.first_snapshot
                      ? `история ведётся с ${new Date(techStats.first_snapshot).toLocaleDateString('ru')} — ранее данных нет`
                      : 'история накапливается с первого ингеста после запуска фичи'
                  ) : (
                    manualStats?.first_snapshot
                      ? `история ведётся с ${new Date(manualStats.first_snapshot).toLocaleDateString('ru')} — ранее данных нет`
                      : 'история накапливается с первого ингеста / ручной смены после запуска фичи'
                  )}
                </span>
              </div>
              {statusKind === 'manual' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Статус</th>
                      {days.map(d => <DayTh key={d} d={d} today={today}/>)}
                      <th>Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Общий итог */}
                    <tr className="total-row">
                      <td><span className="status-label">Всего аккаунтов</span></td>
                      {days.map(d => {
                        const cnt = accounts.filter(a => new Date(a.created_at) <= new Date(year, month, d)).length
                        return <td key={d} className={d===today?'today-col':''}>{cnt||<span className="cell-zero">—</span>}</td>
                      })}
                      <td>{accounts.length}</td>
                    </tr>

                    {activeManualStatuses.map(name => {
                      const {color, bg} = colorOfManualStatus(name)
                      const todayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(today).padStart(2,'0')}`
                      const nowCnt = manualStats?.by_day?.[todayStr]?.[name] || accounts.filter(a=>a.status===name).length
                      return (
                        <tr key={name}>
                          <td>
                            <span className="status-label">
                              <span className="status-dot" style={{background:color}}/>
                              {name}
                            </span>
                          </td>
                          {days.map(d => {
                            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                            const cnt = manualStats?.by_day?.[dateStr]?.[name] || 0
                            return (
                              <td key={d} className={d===today?'today-col':''}>
                                {cnt > 0
                                  ? <span className="cell-val" style={{background:bg,color}}>{cnt}</span>
                                  : <span className="cell-zero">—</span>
                                }
                              </td>
                            )
                          })}
                          <td style={{color,fontWeight:500}}>{nowCnt || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Тех. статус</th>
                      {days.map(d => <DayTh key={d} d={d} today={today}/>)}
                      <th>Сейчас</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTechStatuses.map(ts => {
                      const info = TECH_STATUS_MAP[ts]
                      const color = info?.c || '#6b7280'
                      const bg = `${color}1f` // ~12% alpha hex
                      // Итого по дню сегодня — берём агрегат за today, если есть
                      const todayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(today).padStart(2,'0')}`
                      const nowCnt = techStats?.by_day?.[todayStr]?.[ts] || 0
                      return (
                        <tr key={ts}>
                          <td>
                            <span className="status-label">
                              <span className="status-dot" style={{background:color}}/>
                              {ts}
                            </span>
                          </td>
                          {days.map(d => {
                            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                            const cnt = techStats?.by_day?.[dateStr]?.[ts] || 0
                            const hasAnyDay = techStats?.by_day && techStats.by_day[dateStr]
                            return (
                              <td key={d} className={d===today?'today-col':''}>
                                {cnt > 0
                                  ? <span className="cell-val" style={{background:bg,color}}>{cnt}</span>
                                  : <span className="cell-zero">—</span>
                                }
                              </td>
                            )
                          })}
                          <td style={{color,fontWeight:500}}>{nowCnt || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {view === 'cost' && (
            <table>
              <thead>
                <tr>
                  <th>Метрика</th>
                  {days.map(d => <DayTh key={d} d={d} today={today}/>)}
                  <th>Итого</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="status-label">💰 Cost $</span></td>
                  {days.map(d => {
                    const v = getCostForDay(d)
                    return <td key={d} className={d===today?'today-col':''} style={{color:v>0?'#22d17a':'var(--t3)'}}>
                      {v>0?'$'+v.toFixed(0):'—'}
                    </td>
                  })}
                  <td style={{color:'#22d17a',fontWeight:600}}>${totalCost.toFixed(0)}</td>
                </tr>
                <tr>
                  <td><span className="status-label">👆 Клики</span></td>
                  {days.map(d => {
                    const v = getClicksForDay(d)
                    return <td key={d} className={d===today?'today-col':''} style={{color:v>0?'var(--t)':'var(--t3)'}}>
                      {v>0?v:'—'}
                    </td>
                  })}
                  <td style={{fontWeight:600}}>{totalClicks||'—'}</td>
                </tr>
                <tr>
                  <td><span className="status-label">🎯 Конверсии</span></td>
                  {days.map(d => {
                    const v = getConvForDay(d)
                    return <td key={d} className={d===today?'today-col':''} style={{color:v>0?'#f5a623':'var(--t3)'}}>
                      {v>0?v:'—'}
                    </td>
                  })}
                  <td style={{color:'#f5a623',fontWeight:600}}>{totalConv||'—'}</td>
                </tr>
                <tr>
                  <td><span className="status-label">📊 CPA $</span></td>
                  {days.map(d => {
                    const cost = getCostForDay(d)
                    const conv = getConvForDay(d)
                    const cpa = conv > 0 ? cost/conv : 0
                    return <td key={d} className={d===today?'today-col':''} style={{color:cpa>70?'#f05555':cpa>0?'#22d17a':'var(--t3)'}}>
                      {cpa>0?'$'+cpa.toFixed(0):'—'}
                    </td>
                  })}
                  <td style={{color:avgCpa>70?'#f05555':'#22d17a',fontWeight:600}}>{avgCpa>0?'$'+avgCpa.toFixed(0):'—'}</td>
                </tr>
                <tr>
                  <td><span className="status-label">⚡ CPC $</span></td>
                  {days.map(d => {
                    const cost = getCostForDay(d)
                    const clicks = getClicksForDay(d)
                    const cpc = clicks > 0 ? cost/clicks : 0
                    return <td key={d} className={d===today?'today-col':''} style={{color:cpc>0?'var(--t)':'var(--t3)'}}>
                      {cpc>0?'$'+cpc.toFixed(2):'—'}
                    </td>
                  })}
                  <td style={{fontWeight:600}}>{totalClicks>0?'$'+(totalCost/totalClicks).toFixed(2):'—'}</td>
                </tr>
              </tbody>
            </table>
          )}

          {view === 'zalivshik' && (
            <table>
              <thead>
                <tr>
                  <th>Заливщик / Статус</th>
                  {days.map(d => <DayTh key={d} d={d} today={today}/>)}
                  <th>Сейчас</th>
                </tr>
              </thead>
              <tbody>
                {zalivshiki.map(z => (
                  <>
                    <tr key={z} className="section-header">
                      <td colSpan={daysInMonth+2}>👤 {z}</td>
                    </tr>
                    {STATUSES.filter(s => accounts.some(a => a.zalivshik === z && a.status === s.key)).map(s => (
                      <tr key={z+s.key}>
                        <td style={{paddingLeft:20}}>
                          <span className="status-label">
                            <span className="status-dot" style={{background:s.color}}/>
                            {s.key}
                          </span>
                        </td>
                        {days.map(d => {
                          const cnt = getZalivshikCountForDay(d, z, s.key)
                          return (
                            <td key={d} className={d===today?'today-col':''}>
                              {cnt > 0
                                ? <span className="cell-val" style={{background:s.bg,color:s.color}}>{cnt}</span>
                                : <span className="cell-zero">—</span>
                              }
                            </td>
                          )
                        })}
                        <td style={{color:s.color}}>
                          {accounts.filter(a=>a.zalivshik===z&&a.status===s.key).length||'—'}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
