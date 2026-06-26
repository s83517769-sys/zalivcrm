import { useEffect, useState, useMemo, Fragment } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'
import { TECH_STATUS_MAP, effectiveTechStatus } from '../lib/techStatus'

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

// Линейный график метрик. Метрики разного порядка (Cost ~$1400, Конверсии ~25,
// CPA ~$2): на одной общей оси Y маленькие линии сплющивались бы в ноль. Здесь
// каждая линия НОРМАЛИЗОВАНА в свой [0, max этой метрики]: занимает всю высоту,
// форма (где пик, где провал) сравнима между метриками, абсолютные значения —
// в тултипе на точках и в легенде «текущее / max». Y-оси с числами нет —
// она была бы валидной только для одной метрики из набора.
//
// Defs приходят как массив определений; enabled — Set ключей включённых.
// dataOf(key, day) возвращает число (0 если нет данных).
function MetricsLineChart({ defs, enabled, dataOf, days, today }) {
  // Только дни 1..today (будущие не рисуем, как в графике статусов).
  const visibleDays = days.filter(d => d <= today)
  const active = defs.filter(d => enabled.has(d.key))

  if (visibleDays.length === 0 || active.length === 0) {
    return (
      <div style={{marginTop:12,padding:'20px 16px',textAlign:'center',color:'var(--t3)',fontSize:12,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6}}>
        {active.length === 0 ? 'Выбери хотя бы одну метрику над графиком' : 'Дней с данными пока нет'}
      </div>
    )
  }

  const W = 900, H = 240
  const padL = 16, padR = 16, padT = 14, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const xOf = i => visibleDays.length === 1
    ? padL + plotW / 2
    : padL + (i / (visibleDays.length - 1)) * plotW

  // Per-metric: max и сериализованные точки в нормализованных координатах.
  // current — значение за сегодня (последний видимый день) для подписи в легенде.
  const series = active.map(def => {
    const vals = visibleDays.map(d => +dataOf(def.key, d) || 0)
    const max = Math.max(0, ...vals)
    const yOf = v => padT + plotH - (max > 0 ? (v / max) * plotH : 0)
    const pts = vals.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')
    const dots = vals.map((v, i) => ({ x: xOf(i), y: yOf(v), v, d: visibleDays[i] }))
    return { def, vals, max, pts, dots, current: vals[vals.length - 1] }
  })

  const xLabelStep = Math.max(1, Math.ceil(visibleDays.length / 12))

  return (
    <div style={{marginTop:12}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:H,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6}}>
        {/* Лёгкая горизонталь — base line (без чисел: ось значит «0..max» per-line) */}
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="var(--bd)" strokeWidth="0.5"/>
        <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="var(--bd)" strokeWidth="0.5" strokeDasharray="2 3"/>
        {/* X-подписи (дни) */}
        {visibleDays.map((d, i) => {
          if (i % xLabelStep !== 0 && i !== visibleDays.length - 1) return null
          return (
            <text key={d} x={xOf(i)} y={H-padB+14} fontSize="9" textAnchor="middle" fill="var(--t3)" fontFamily="JetBrains Mono,monospace">
              {d}
            </text>
          )
        })}
        {/* Линии */}
        {series.map(({ def, pts }) => (
          <polyline key={`l-${def.key}`} points={pts} fill="none" stroke={def.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
        ))}
        {/* Точки с тултипом — показывают реальное значение */}
        {series.map(({ def, dots }) => dots.map((p, i) => (
          <circle key={`p-${def.key}-${i}`} cx={p.x} cy={p.y} r="2.5" fill={def.color}>
            <title>{`${def.label} · ${p.d}: ${def.fmt(p.v)}`}</title>
          </circle>
        )))}
      </svg>
      {/* Легенда: цвет, имя, current/max — компактно справа */}
      <div style={{display:'flex',flexWrap:'wrap',gap:'6px 16px',marginTop:8,padding:'0 4px'}}>
        {series.map(({ def, current, max }) => (
          <span key={def.key} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'var(--t2)'}}>
            <span style={{width:14,height:2,background:def.color,borderRadius:1,flexShrink:0}}/>
            {def.label}
            <span style={{fontFamily:'JetBrains Mono,monospace',color:'var(--t3)'}}>
              {def.fmt(current)} <span style={{opacity:.6}}>/ max {def.fmt(max)}</span>
            </span>
          </span>
        ))}
      </div>
      <div style={{fontSize:10,color:'var(--t3)',marginTop:6,padding:'0 4px'}}>
        Каждая линия нормализована в свой 0..max, чтобы метрики разного порядка были читаемы. Реальные значения — в тултипе и легенде.
      </div>
    </div>
  )
}

// Круговая (donut) диаграмма долей статусов. counts — { name: number }, может
// прийти из snapshot.by_day[date] (срез на конкретный день) или вычислиться
// клиентом из активных аккаунтов (текущее состояние). Цвета secторов идут
// через тот же colorOf, что у линий и таблицы — «Бан» в любой визуализации
// один и тот же красный. Чистый SVG, без библиотек.
function StatusPieChart({ counts, statuses, colorOf, totalLabel }) {
  // Берём только статусы с реальной долей (> 0); сортируем по убыванию.
  const entries = statuses
    .map(s => ({ name: s, value: +counts[s] || 0 }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .map(e => ({ ...e, color: colorOf(e.name) }))
  const total = entries.reduce((s, e) => s + e.value, 0)

  if (total === 0) {
    return (
      <div style={{marginTop:12,padding:'20px 16px',textAlign:'center',color:'var(--t3)',fontSize:12,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6}}>
        Нет данных за выбранный период
      </div>
    )
  }

  const W = 360, H = 240
  const cx = 120, cy = H / 2
  const rOuter = 95, rInner = 56

  // Строим секторы. Начинаем с 12 часов (угол -π/2), идём по часовой.
  // Для одной полной доли (один статус = 100%) рисуем кольцо двумя
  // полу-арками, иначе path с одинаковыми start/end не отрисуется.
  let cum = -Math.PI / 2
  const slices = entries.map(e => {
    const angle = (e.value / total) * Math.PI * 2
    const start = cum, end = cum + angle
    cum = end
    const pct = (e.value / total) * 100
    let path
    if (entries.length === 1) {
      // Полное кольцо: два полу-арка + соединение по внутреннему радиусу
      const top = `M ${cx} ${cy - rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx-0.01} ${cy - rOuter} Z`
      const hole = `M ${cx} ${cy - rInner} A ${rInner} ${rInner} 0 1 0 ${cx-0.01} ${cy - rInner} Z`
      path = top + ' ' + hole
    } else {
      const largeArc = angle > Math.PI ? 1 : 0
      const x1 = cx + rOuter * Math.cos(start),  y1 = cy + rOuter * Math.sin(start)
      const x2 = cx + rOuter * Math.cos(end),    y2 = cy + rOuter * Math.sin(end)
      const x3 = cx + rInner * Math.cos(end),    y3 = cy + rInner * Math.sin(end)
      const x4 = cx + rInner * Math.cos(start),  y4 = cy + rInner * Math.sin(start)
      path = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`
    }
    return { ...e, path, pct, fillRule: entries.length === 1 ? 'evenodd' : 'nonzero' }
  })

  return (
    <div style={{marginTop:12,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,padding:12,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:W,maxWidth:'100%',height:H,flexShrink:0}}>
        {slices.map((s, i) => (
          <path key={s.name+i} d={s.path} fill={s.color} fillRule={s.fillRule} stroke="var(--s2)" strokeWidth="1.5">
            <title>{`${s.name}: ${s.value} (${s.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
        {/* Центр: суммарное число + подпись */}
        <text x={cx} y={cy-2} textAnchor="middle" fontSize="22" fontWeight="500" fill="var(--t)" fontFamily="JetBrains Mono,monospace">{total}</text>
        <text x={cx} y={cy+14} textAnchor="middle" fontSize="9" fill="var(--t3)">{totalLabel || 'аккаунтов'}</text>
      </svg>
      {/* Легенда: статус N — P% */}
      <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:180,fontSize:12}}>
        {slices.map(s => (
          <div key={s.name} style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span style={{color:'var(--t)'}}>{s.name}</span>
            <span style={{color:'var(--t3)',marginLeft:'auto',fontFamily:'JetBrains Mono,monospace'}}>
              {s.value} — {s.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Аналитика ────────────────────────────────────────────────────────────
// Карточка с заголовком + содержимым. Серый паддинг-фон, тонкая рамка —
// единый стиль для всех 5 секций аналитики.
function AnaCard({ title, hint, children }) {
  return (
    <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,padding:14,marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:500,color:'var(--t)',textTransform:'uppercase',letterSpacing:'.05em'}}>{title}</div>
        {hint && <div style={{fontSize:10,color:'var(--t3)'}}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}
function BigNum({ value, sub, color }) {
  return (
    <div style={{display:'flex',alignItems:'baseline',gap:8}}>
      <span style={{fontSize:28,fontWeight:500,color:color||'var(--t)',fontFamily:'JetBrains Mono,monospace'}}>{value}</span>
      {sub && <span style={{fontSize:11,color:'var(--t3)'}}>{sub}</span>}
    </div>
  )
}
function StatRow({ items }) {
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:'4px 18px',marginTop:6,fontSize:11,color:'var(--t2)',fontFamily:'JetBrains Mono,monospace'}}>
      {items.map((it, i) => (
        <span key={i}><span style={{color:'var(--t3)'}}>{it.label}</span> {it.value}</span>
      ))}
    </div>
  )
}
// Простая горизонтальная bar-гистограмма по бакетам — SVG, как остальные графики
function MiniHistogram({ buckets, color = '#5b6ef5' }) {
  if (!buckets || buckets.length === 0) return null
  const max = Math.max(1, ...buckets.map(b => b.count))
  const W = 600, H = 90
  const padL = 4, padR = 4, padT = 4, padB = 18
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const barW = plotW / buckets.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:H,marginTop:8}}>
      {buckets.map((b, i) => {
        const h = (b.count / max) * plotH
        const x = padL + i * barW + 2
        const y = padT + plotH - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW - 4} height={h} fill={color} opacity={b.count>0?0.85:0.15} rx="2">
              <title>{`${b.label}: ${b.count}`}</title>
            </rect>
            {b.count > 0 && <text x={x + (barW-4)/2} y={y - 2} fontSize="8" textAnchor="middle" fill="var(--t2)" fontFamily="JetBrains Mono,monospace">{b.count}</text>}
            <text x={x + (barW-4)/2} y={H - 4} fontSize="8" textAnchor="middle" fill="var(--t3)" fontFamily="JetBrains Mono,monospace">{b.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
// Bar-chart по дням (для тренда банов внутри месяца)
function DayBars({ data }) {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.map(d => d.count))
  const W = 600, H = 80
  const padL = 4, padR = 4, padT = 4, padB = 16
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const barW = plotW / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:H,marginTop:8}}>
      {data.map((d, i) => {
        const h = (d.count / max) * plotH
        const x = padL + i * barW + 1
        const y = padT + plotH - h
        const isShownLabel = d.day === 1 || d.day === data.length || d.day % 5 === 0
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={barW - 2} height={Math.max(h, d.count > 0 ? 2 : 0)} fill="#f05555" opacity={d.count>0?0.85:0} rx="1">
              <title>{`${d.day}: ${d.count}`}</title>
            </rect>
            {isShownLabel && <text x={x + (barW-2)/2} y={H - 3} fontSize="8" textAnchor="middle" fill="var(--t3)" fontFamily="JetBrains Mono,monospace">{d.day}</text>}
          </g>
        )
      })}
    </svg>
  )
}
// Горизонтальные бары для воронки и причин
function HBar({ label, value, max, total, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const pctOfTotal = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{marginBottom:6}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--t2)',marginBottom:2}}>
        <span style={{color:'var(--t)'}}>{label}</span>
        <span style={{fontFamily:'JetBrains Mono,monospace'}}>{value} <span style={{color:'var(--t3)'}}>— {pctOfTotal.toFixed(0)}%</span></span>
      </div>
      <div style={{height:8,background:'var(--bd)',borderRadius:2,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:color||'#5b6ef5',transition:'width .2s'}}/>
      </div>
    </div>
  )
}

function AnalyticsView({ data, loading, statusKind, setStatusKind }) {
  // Переключатель Ручные/Технические виден прямо тут, чтобы юзер сразу видел
  // в каком режиме считаются метрики (источник банов разный — см. notes).
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:'var(--t3)'}}>Источник банов:</span>
        <button className={`btn${statusKind==='manual'?' act':''}`} onClick={()=>setStatusKind('manual')}>Ручные</button>
        <button className={`btn${statusKind==='tech'?' act':''}`} onClick={()=>setStatusKind('tech')}>Технические</button>
        <span style={{fontSize:11,color:'var(--t3)',marginLeft:'auto'}}>
          {statusKind === 'tech'
            ? 'баны = первый день в снимке daily_tech_status со статусом «Бан»'
            : 'баны = accounts.ban_date (когда статус перешёл в БАН / На смену / Отмена запуска)'}
        </span>
      </div>

      {loading && <div style={{textAlign:'center',padding:40,color:'var(--t3)',fontSize:12}}>Загрузка аналитики…</div>}

      {!loading && data && (() => {
        const { lifetime, ban_trend, burn, reasons, funnel, notes } = data
        return (
          <>
            {/* ── 1. Срок жизни ── */}
            <AnaCard title="Срок жизни аккаунта (до бана)" hint="дни от первого «Крутит» до бана">
              {lifetime?.insufficient ? (
                <div style={{fontSize:12,color:'var(--t3)'}}>Недостаточно банов для статистики (нужно ≥3, есть {lifetime.count ?? 0}). Метрика наполнится с накоплением банов.</div>
              ) : (
                <>
                  <BigNum value={`${lifetime.avg_days} д`} sub={`в среднем по ${lifetime.count} забаненным`}/>
                  <StatRow items={[
                    {label:'медиана:', value:`${lifetime.median} д`},
                    {label:'мин:', value:`${lifetime.min} д`},
                    {label:'макс:', value:`${lifetime.max} д`},
                  ]}/>
                  <MiniHistogram buckets={lifetime.histogram} color="#22d17a"/>
                </>
              )}
            </AnaCard>

            {/* ── 2. % банов + тренд ── */}
            <AnaCard title="Баны за период" hint="по дате бана соответствующего режима">
              <BigNum
                value={`${ban_trend.pct_in_period}%`}
                sub={`${ban_trend.banned_in_period} забанено в этом месяце из ${ban_trend.total_known_accounts} аккаунтов`}
                color="#f05555"
              />
              <StatRow items={[
                {label:'всего банов за всю историю:', value:ban_trend.banned_total},
                {label:'% от всех известных аккаунтов:', value:`${ban_trend.pct_total}%`},
              ]}/>
              {ban_trend.banned_in_period > 0 ? (
                <DayBars data={ban_trend.by_day}/>
              ) : (
                <div style={{fontSize:12,color:'var(--t3)',marginTop:8}}>Банов за этот месяц не было.</div>
              )}
            </AnaCard>

            {/* ── 3. Burn до бана ── */}
            <AnaCard title="Burn до бана (USD)" hint="сумма cost_usd × курс из настроек, до даты бана">
              {burn.count === 0 ? (
                <div style={{fontSize:12,color:'var(--t3)'}}>Burn посчитать не из чего — забаненных с метриками нет.</div>
              ) : burn.insufficient ? (
                <>
                  <BigNum value={`$${burn.total_usd?.toLocaleString('ru')||0}`} sub={`всего по ${burn.count} забаненным`} color="#22d17a"/>
                  <div style={{fontSize:12,color:'var(--t3)',marginTop:6}}>Недостаточно для распределения (нужно ≥3, есть {burn.count}). Накопится.</div>
                </>
              ) : (
                <>
                  <BigNum value={`$${burn.total_usd.toLocaleString('ru')}`} sub={`всего по ${burn.count} забаненным`} color="#22d17a"/>
                  <StatRow items={[
                    {label:'в среднем:', value:`$${burn.avg_usd.toLocaleString('ru')}`},
                    {label:'медиана:', value:`$${burn.median.toLocaleString('ru')}`},
                    {label:'макс:', value:`$${burn.max.toLocaleString('ru')}`},
                  ]}/>
                  <MiniHistogram buckets={burn.histogram} color="#22d17a"/>
                </>
              )}
            </AnaCard>

            {/* ── 4. Причины бана ── */}
            <AnaCard title="Причины бана" hint="ban_reason — ручное поле в карточке аккаунта">
              {reasons.length === 0 || (reasons.length === 1 && reasons[0].count === 0) ? (
                <div style={{fontSize:12,color:'var(--t3)'}}>Банов нет — причины показывать не из чего.</div>
              ) : (() => {
                const max = Math.max(...reasons.map(r => r.count))
                const total = reasons.reduce((s, r) => s + r.count, 0)
                return reasons.map(r => (
                  <HBar key={r.reason}
                    label={r.reason}
                    value={r.count}
                    max={max}
                    total={total}
                    color={r.reason === 'Не указано' ? 'var(--t3)' : '#f5a623'}
                  />
                ))
              })()}
            </AnaCard>

            {/* ── 5. Воронка ── */}
            <AnaCard title="Воронка из созданных в этом месяце" hint="когорта = created_at в текущем месяце">
              {funnel.created_in_period === 0 ? (
                <div style={{fontSize:12,color:'var(--t3)'}}>За этот месяц новых аккаунтов не создавалось.</div>
              ) : (
                <>
                  <HBar label="Создано" value={funnel.created_in_period} max={funnel.created_in_period} total={funnel.created_in_period} color="#5b6ef5"/>
                  <HBar label="Дошло до «Крутит»" value={funnel.reached_crut} max={funnel.created_in_period} total={funnel.created_in_period} color="#22d17a"/>
                  <HBar label="Забанено" value={funnel.banned} max={funnel.created_in_period} total={funnel.created_in_period} color="#f05555"/>
                </>
              )}
            </AnaCard>

            {/* ── Notes ── */}
            {notes && notes.length > 0 && (
              <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:6,padding:'8px 12px',fontSize:11,color:'var(--t3)',lineHeight:1.5}}>
                <div style={{fontWeight:500,marginBottom:4,color:'var(--t2)'}}>Дисклеймер:</div>
                <ul style={{margin:0,paddingLeft:18}}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            )}
          </>
        )
      })()}

      {!loading && !data && (
        <div style={{textAlign:'center',padding:40,color:'var(--t3)',fontSize:12}}>
          Не удалось загрузить аналитику. Проверь, что миграция analytics_indexes выполнена.
        </div>
      )}
    </div>
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
  // Какие метрики на графике в режиме «По метрикам». Дефолт — только Cost.
  const [enabledMetrics, setEnabledMetrics] = useState(() => new Set(['cost']))
  const toggleMetric = (k) => setEnabledMetrics(s => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n
  })
  const [techStats, setTechStats] = useState(null) // { by_day:{}, first_snapshot:null }
  const [manualStats, setManualStats] = useState(null) // зеркало для ручных снимков
  const [customStatuses, setCustomStatuses] = useState([]) // палитра ручных статусов из настроек
  const [currencyRates, setCurrencyRates] = useState({ USD: 1 }) // живой FX из настроек — для USD-нормализации cost
  const [metricsSummary, setMetricsSummary] = useState({}) // тот же источник, что на главной — для согласованного «Удалить» (#5)
  // Для расчёта effectiveTechStatus на клиенте (режим «Текущее» в круговой)
  const [watchdogHours, setWatchdogHours] = useState(2)
  const [moderationHours, setModerationHours] = useState(12)
  // Аналитика — данные эндпоинта по текущему режиму Ручные/Технические + месяц
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  // Параметры круговой диаграммы статусов
  const [pieScope, setPieScope] = useState('now')    // 'now' (текущее состояние) | 'date'
  const [pieDate, setPieDate] = useState(null)        // 'YYYY-MM-DD'; null = сегодня

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
    // Snapshot-sweep — закрывает дыру с потерей техбанов у молчащих неархивных
    // аккаунтов. Fire-and-forget, не блокируем загрузку страницы. Сработает
    // перед запросом статистики, чтобы свежезаписанные сегодня снимки попали
    // в by_day. Если упадёт — статистика всё равно подтянется (просто без
    // сегодняшних свежих снимков для молчащих).
    api('/api/snapshot-sweep', { method: 'POST' }).catch(() => {})
    // Сводка спенда today/yesterday — ТОТ ЖЕ источник, что на главной. Нужен,
    // чтобы критерий «Удалить» (#5) совпадал с главной (оба по metrics-summary),
    // а не считался по daily_metrics с другим определением «сегодня/вчера».
    api('/api/metrics-summary').then(r => setMetricsSummary(r.summary || {})).catch(() => {})
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
        if (r?.settings?.currency_rates && Object.keys(r.settings.currency_rates).length) {
          setCurrencyRates({ USD: 1, ...r.settings.currency_rates })
        }
        const wh = +r?.settings?.watchdog_hours
        const mh = +r?.settings?.moderation_hours
        if (Number.isFinite(wh) && wh > 0) setWatchdogHours(wh)
        if (Number.isFinite(mh) && mh > 0) setModerationHours(mh)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.body.className = dark ? 'dark' : 'light'
  }, [dark])

  // Кросс-полуночная актуальность: year/month/today/days считаются из new Date()
  // на каждый рендер. Раз в минуту (и при возврате фокуса) проверяем смену дня
  // и форсим ре-рендер, чтобы «сегодня» и подсветка обновились без ручной
  // перезагрузки. Данные за месяц не перезагружаем (лишнего трафика нет).
  const [, setDateTick] = useState(0)
  useEffect(() => {
    let last = new Date().toDateString()
    const check = () => { const d = new Date().toDateString(); if (d !== last) { last = d; setDateTick(t => t + 1) } }
    const iv = setInterval(check, 60000)
    const onVis = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Грузим аналитику при заходе на вкладку или смене режима Ручные/Технические.
  useEffect(() => {
    if (view !== 'analytics') return
    setAnalyticsLoading(true)
    api(`/api/stats/analytics?year=${year}&month=${month + 1}&mode=${statusKind}`)
      .then(r => setAnalytics(r))
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false))
  }, [view, statusKind, year, month])

  async function load() {
    setLoading(true)
    const data = await api('/api/accounts')
    const accs = data.accounts || []
    setAccounts(accs)

    // Метрики всех аккаунтов ОДНИМ батч-запросом (#6) вместо N запросов
    // /api/metrics/{id}. Батч воспроизводит ту же логику слияния (daily + overlay
    // из hourly, OFF/ON), поэтому числа идентичны — меняется только скорость.
    // Структура { accId: [rows] } — ровно та, что ждёт memo dayTotals.
    const mb = await api(`/api/metrics/batch?year=${year}&month=${month + 1}`)
    setMetrics(mb.metrics || {})
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

  // Курс валюты к USD (тот же резолвер, что на главной и в analytics-burn:
  // currencyRates[cur] || 1, USD=1). cost_usd в daily_metrics — НАТИВНАЯ валюта,
  // поэтому суммировать дневной cost можно только после × rate(валюта аккаунта).
  const rate = (cur) => currencyRates[cur] || 1

  // Один проход по всем метрикам → карта { 'YYYY-MM-DD': {costUSD, clicks, conv} }.
  // cost нормализован в USD НА УРОВНЕ АККАУНТА (у каждого своя валюта) перед
  // суммированием — иначе мультивалютные суммы складывали бы натив разных валют.
  // Решает и корректность (#1), и перф (#7): раньше getCostForDay/Clicks/Conv
  // пересчитывались каждый рендер и звались повторно (CPA/CPC снова дёргали cost).
  const dayTotals = useMemo(() => {
    const curOf = {}
    for (const a of accounts) curOf[a.id] = a.currency || 'USD'
    const map = {}
    for (const [accId, accMetrics] of Object.entries(metrics)) {
      const r = rate(curOf[accId] || 'USD')
      for (const m of (accMetrics || [])) {
        const d = m.metric_date
        if (!d) continue
        const bucket = map[d] || (map[d] = { costUSD: 0, clicks: 0, conv: 0 })
        bucket.costUSD += (+m.cost_usd || 0) * r   // натив × курс = USD
        bucket.clicks  += +m.clicks || 0
        bucket.conv    += +m.conversions || 0
      }
    }
    return map
  }, [metrics, accounts, currencyRates])

  const dateStrOf = (day) => `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  function getCostForDay(day)   { return dayTotals[dateStrOf(day)]?.costUSD || 0 }  // уже в USD
  function getClicksForDay(day) { return dayTotals[dateStrOf(day)]?.clicks  || 0 }
  function getConvForDay(day)   { return dayTotals[dateStrOf(day)]?.conv    || 0 }

  // Группы заливщиков
  const zalivshiki = [...new Set(accounts.map(a => a.zalivshik).filter(Boolean))]


  const totalCost = days.reduce((s, d) => s + getCostForDay(d), 0)
  const totalClicks = days.reduce((s, d) => s + getClicksForDay(d), 0)
  const totalConv = days.reduce((s, d) => s + getConvForDay(d), 0)
  const avgCpa = totalConv > 0 ? totalCost / totalConv : 0

  // Активные статусы для режима «Ручные» — динамически из РЕАЛЬНЫХ снимков и
  // текущих аккаунтов, плюс палитра custom_statuses + дефолтный STATUSES.
  // Пустые (нигде не встретились) — не показываем.
  // «Удалить» — клиентская группа: забаненный без спенда сегодня и вчера.
  // Источник — metricsSummary (today/yesterday от /api/metrics-summary) — ТОТ ЖЕ,
  // что на главной (index.js isDeleteCandidate), чтобы один аккаунт одинаково
  // классифицировался на обеих страницах (#5). Раньше /stats считал по
  // daily_metrics с другим определением «сегодня/вчера» (календарная дата
  // браузера) → рассинхрон около полуночи. В снимки daily_tech_status / в
  // аналитику /api/stats/* «Удалить» по-прежнему НЕ просачивается — там 'Бан'.
  function isDeleteCandidate(a) {
    if (effectiveTechStatus(a, watchdogHours, moderationHours) !== 'Бан') return false
    const m = metricsSummary[a.id]
    const today = +m?.today?.cost_usd || 0
    const yest  = +m?.yesterday?.cost_usd || 0
    return today === 0 && yest === 0
  }
  function sidebarTechOf(a) {
    if (isDeleteCandidate(a)) return 'Удалить'
    return effectiveTechStatus(a, watchdogHours, moderationHours)
  }
  // Текущие клиентские счётчики по тех-группам (для столбца «Сейчас» и donut-now).
  // Один аккаунт = одна группа, отгоревший «Бан» уходит в 'Удалить', не дублируется.
  const currentTechCounts = (() => {
    const out = {}
    for (const a of accounts) {
      const k = sidebarTechOf(a)
      if (k) out[k] = (out[k] || 0) + 1
    }
    return out
  })()

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
    // Клиентская группа 'Удалить' в снимках не существует — добавляем явно,
    // если есть текущие кандидаты. Порядок ниже ставит её в конец.
    if ((currentTechCounts['Удалить'] || 0) > 0) names.add('Удалить')
    const sorted = [...names].sort((a, b) => {
      const ia = TECH_STATUSES_FOR_STATS.indexOf(a)
      const ib = TECH_STATUSES_FOR_STATS.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    // Скрываем строки, где total за месяц = 0 (Сейчас тоже учитываем).
    // Для 'Удалить' total в снимках всегда 0 (его туда не пишем) — оставляем
    // строку, если есть текущие кандидаты, чтобы «Сейчас» был не пуст.
    return sorted.filter(ts => {
      if (ts === 'Удалить') return (currentTechCounts['Удалить'] || 0) > 0
      let total = 0
      if (techStats?.by_day) for (const d of Object.values(techStats.by_day)) total += d[ts] || 0
      if (ts === 'Бан') total += currentTechCounts['Бан'] || 0
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
        /* Первая строка tbody — увеличенный отступ сверху + явный border-top
           для гарантии видимого зазора: при скролле sticky шапка останавливается
           ровно над ней, эта пара (padding + border) исключает любой визуальный
           overlay, в т.ч. на «По метрикам» где первая ячейка cost-row под шапкой
           ранее визуально сливалась с подписью «23 сег.». */
        tbody tr:first-child td{padding-top:18px;border-top:1px solid var(--bd)}
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
          <button className={`btn${view==='analytics'?' act':''}`} onClick={()=>setView('analytics')}>🔬 Аналитика</button>
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

        {/* Summary cards. Статусные (Крутит / Бан) следуют за переключателем
            Ручные / Технические и считают теми же правилами, что таблица и
            круг: в техрежиме — через effectiveTechStatus (тот же импорт из
            lib/techStatus.js), в ручном — по a.status. Метрики (Cost / Клики /
            Конв / CPA) от статуса не зависят, они общие для обоих режимов. */}
        {(() => {
          const isTech = statusKind === 'tech'
          let krutit = 0, ban = 0
          for (const a of accounts) {
            if (isTech) {
              // sidebarTechOf: отгоревший Бан (нет спенда сегодня/вчера) уходит
              // в 'Удалить' и не считается тут — синхронно с главной (PR #93)
              // и с тех-таблицей ниже.
              const eff = sidebarTechOf(a)
              if (eff === 'Крутит') krutit++
              else if (eff === 'Бан') ban++
            } else {
              if (a.status && a.status.includes('Крутит')) krutit++
              else if (['БАН','На смену'].includes(a.status)) ban++
            }
          }
          return (
            <div className="summary-cards">
              <div className="sc"><div className="sc-l">Всего акк.</div><div className="sc-v">{accounts.length}</div></div>
              <div className="sc"><div className="sc-l">Крутит</div><div className="sc-v g">{krutit}</div></div>
              <div className="sc"><div className="sc-l">{isTech ? 'Бан' : 'БАН / На смену'}</div><div className="sc-v r">{ban}</div></div>
              <div className="sc"><div className="sc-l">Cost этот мес.</div><div className="sc-v g">{totalCost>0?'$'+Math.round(totalCost).toLocaleString('ru'):'—'}</div></div>
              <div className="sc"><div className="sc-l">Клики</div><div className="sc-v">{totalClicks>0?totalClicks.toLocaleString('ru'):'—'}</div></div>
              <div className="sc"><div className="sc-l">Конв. / CPA</div><div className="sc-v a">{totalConv>0?`${totalConv} / $${avgCpa.toFixed(0)}`:'—'}</div></div>
            </div>
          )
        })()}

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
                    {/* Общий итог — сумма снимков за день по всем статусам.
                        Дни без снимков (прошлое до запуска фичи / будущее) →
                        «—», в отличие от старой логики проекции по created_at
                        которая ошибочно заполняла будущие дни всеми аккаунтами. */}
                    <tr className="total-row">
                      <td><span className="status-label">Всего аккаунтов</span></td>
                      {days.map(d => {
                        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                        const dayMap = manualStats?.by_day?.[dateStr]
                        const cnt = (d > today || !dayMap) ? 0 : Object.values(dayMap).reduce((s,v)=>s+v, 0)
                        return <td key={d} className={d===today?'today-col':''}>{cnt||<span className="cell-zero">—</span>}</td>
                      })}
                      <td>{accounts.length}</td>
                    </tr>

                    {activeManualStatuses.map(name => {
                      const {color, bg} = colorOfManualStatus(name)
                      // «Сейчас» — живой клиентский счёт (как у тех-таблицы, #9): актуальнее
                      // снимка, который пишется раз в день. Историческая часть строки (дни
                      // месяца ниже) остаётся из снимков by_day — её не трогаем.
                      const nowCnt = accounts.filter(a=>a.status===name).length
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
                            // Defensive: будущие дни всегда пусты, даже если снимок случайно прилетел
                            const cnt = d > today ? 0 : (manualStats?.by_day?.[dateStr]?.[name] || 0)
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
                      // «Сейчас» считаем КЛИЕНТСКИ через sidebarTechOf — иначе
                      // отгоревшие баны застряли бы в строке «Бан» (снимок их
                      // пишет именно так), не уезжая в «Удалить». Историческая
                      // часть строки (дни месяца ниже) остаётся по снимкам — она
                      // и должна показывать «Бан», аналитика банов не страдает.
                      const nowCnt = currentTechCounts[ts] || 0
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
                            // Defensive: будущие дни всегда пусты
                            const cnt = d > today ? 0 : (techStats?.by_day?.[dateStr]?.[ts] || 0)
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

              {/* Круговая диаграмма долей статусов. Над ней — выбор периода
                  («Текущее» по списку активных аккаунтов / «За дату» по снимку
                  выбранного дня). Цвета секторов / таблицы — один resolver. */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:14,flexWrap:'wrap'}}>
                <span style={{fontSize:11,color:'var(--t3)'}}>Период:</span>
                {(() => {
                  const byDay = statusKind === 'tech' ? techStats?.by_day : manualStats?.by_day
                  const todayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(today).padStart(2,'0')}`
                  const availableDates = Object.keys(byDay || {})
                    .filter(d => d <= todayStr)
                    .sort((a,b) => b.localeCompare(a)) // свежие сверху
                  const currentDate = pieDate || availableDates[0] || todayStr
                  return (
                    <>
                      <button className={`btn${pieScope==='now'?' act':''}`} onClick={()=>setPieScope('now')} title="Текущее состояние всех активных аккаунтов">Текущее</button>
                      <button className={`btn${pieScope==='date'?' act':''}`} onClick={()=>setPieScope('date')} title="Снимок на выбранный день">За дату</button>
                      {pieScope === 'date' && (
                        availableDates.length > 0
                          ? <select className="btn" value={currentDate} onChange={e=>setPieDate(e.target.value)} style={{padding:'4px 6px'}}>
                              {availableDates.map(d => {
                                const [y,m,dd] = d.split('-')
                                return <option key={d} value={d}>{`${dd}.${m}.${y}${d===todayStr?' (сегодня)':''}`}</option>
                              })}
                            </select>
                          : <span style={{fontSize:11,color:'var(--t3)'}}>нет снимков</span>
                      )}
                    </>
                  )
                })()}
              </div>

              {(() => {
                // Источник данных круговой — два режима:
                //
                //   'now'  ТЕКУЩЕЕ состояние: считаем по списку активных
                //          аккаунтов клиентским способом — для tech это та же
                //          effectiveTechStatus, что показывает основная таблица
                //          (один аккаунт = один статус); для manual — просто
                //          a.status. Не зависит от того, был ли сегодня ингест.
                //
                //   'date' СНИМОК НА ДЕНЬ: уже-агрегированный by_day[date] из
                //          /api/stats/(manual|tech)-status. Каждый аккаунт
                //          присутствует один раз — по своему статусу в тот день.
                //
                // В обоих режимах ровно один сектор на статус, что и требуется.
                const byDay = statusKind === 'tech' ? techStats?.by_day : manualStats?.by_day
                const todayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(today).padStart(2,'0')}`
                const availableDates = Object.keys(byDay || {}).filter(d => d <= todayStr).sort((a,b)=>b.localeCompare(a))
                const currentDate = pieDate || availableDates[0] || todayStr
                let counts = {}
                let statusesForPie
                if (pieScope === 'date') {
                  counts = byDay?.[currentDate] || {}
                  statusesForPie = statusKind === 'tech' ? activeTechStatuses : activeManualStatuses
                } else {
                  // 'now' — считаем по активным аккаунтам
                  for (const a of accounts) {
                    let name = ''
                    if (statusKind === 'tech') name = sidebarTechOf(a)
                    else name = a.status
                    if (name) counts[name] = (counts[name] || 0) + 1
                  }
                  // Для статусов из текущих аккаунтов используем union: то, что в counts +
                  // активные из таблицы (на случай если custom-статус есть, но 0 аккаунтов).
                  const set = new Set(Object.keys(counts))
                  ;(statusKind === 'tech' ? activeTechStatuses : activeManualStatuses).forEach(s => set.add(s))
                  statusesForPie = [...set]
                }
                return (
                  <StatusPieChart
                    counts={counts}
                    statuses={statusesForPie}
                    colorOf={s => statusKind === 'tech'
                      ? (TECH_STATUS_MAP[s]?.c || '#6b7280')
                      : colorOfManualStatus(s).color}
                    totalLabel={pieScope === 'now' ? 'сейчас' : `${currentDate.split('-').reverse().join('.')}`}
                  />
                )
              })()}
            </>
          )}

          {view === 'cost' && (<>
            {/* Над таблицей — переключатель метрик для графика. Пользователь
                выбирает один-несколько чек-боксов, график обновляется в реалтайме. */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--t3)'}}>Метрики на графике:</span>
              {[
                {key:'cost',   label:'💰 Cost'},
                {key:'clicks', label:'👆 Клики'},
                {key:'conv',   label:'🎯 Конверсии'},
                {key:'cpa',    label:'📊 CPA'},
                {key:'cpc',    label:'⚡ CPC'},
              ].map(m => (
                <button key={m.key} className={`btn${enabledMetrics.has(m.key)?' act':''}`} onClick={()=>toggleMetric(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
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
            {/* График метрик под таблицей. Источник — те же getCostForDay/
                getClicksForDay/getConvForDay, что у таблицы. CPA и CPC
                вычисляем на лету из суммарных Cost / Conv / Clicks за день. */}
            <MetricsLineChart
              days={days}
              today={today}
              enabled={enabledMetrics}
              defs={[
                {key:'cost',   label:'Cost $',    color:'#22d17a', fmt:v => v>0?'$'+v.toFixed(0):'$0'},
                {key:'clicks', label:'Клики',     color:'#5b6ef5', fmt:v => v>0?v.toString():'0'},
                {key:'conv',   label:'Конверсии', color:'#f5a623', fmt:v => v>0?v.toString():'0'},
                {key:'cpa',    label:'CPA $',     color:'#f05555', fmt:v => v>0?'$'+v.toFixed(2):'—'},
                {key:'cpc',    label:'CPC $',     color:'#c084fc', fmt:v => v>0?'$'+v.toFixed(2):'—'},
              ]}
              dataOf={(k, d) => {
                const cost = getCostForDay(d)
                const clicks = getClicksForDay(d)
                const conv = getConvForDay(d)
                if (k === 'cost') return cost
                if (k === 'clicks') return clicks
                if (k === 'conv') return conv
                if (k === 'cpa') return conv > 0 ? cost / conv : 0
                if (k === 'cpc') return clicks > 0 ? cost / clicks : 0
                return 0
              }}
            />
          </>)}

          {view === 'analytics' && (
            <AnalyticsView
              data={analytics}
              loading={analyticsLoading}
              statusKind={statusKind}
              setStatusKind={setStatusKind}
            />
          )}

          {view === 'zalivshik' && (<>
            {/* Честный срез ТЕКУЩЕГО статуса по заливщикам. Раньше тут были
                колонки по дням, но они показывали сегодняшний статус задним
                числом (проекция a.status по created_at) — это фейковая «история».
                Реальную историю по заливщику из снимков собрать нельзя: эндпоинты
                /api/stats/* агрегируют daily_*_status БЕЗ account_id, поэтому
                разрез по заливщику недоступен (а трогать снимки/ingest нельзя).
                Поэтому показываем только «Сейчас» — без иллюзии истории. */}
            <div className="hint" style={{marginBottom:10}}>
              Текущий статус аккаунтов по заливщикам (на сейчас). Историю по дням см. во вкладке «По статусам».
            </div>
            <table>
              <thead>
                <tr>
                  <th>Заливщик / Статус</th>
                  <th>Сейчас</th>
                </tr>
              </thead>
              <tbody>
                {zalivshiki.map(z => {
                  // Статусы — из реальных значений a.status у аккаунтов заливщика
                  // (кастомные из настроек тоже подхватятся). Цвет — colorOfManualStatus.
                  const zStatuses = [...new Set(
                    accounts.filter(a => a.zalivshik === z && a.status).map(a => a.status)
                  )]
                  return (
                    <Fragment key={z}>
                      <tr className="section-header">
                        <td colSpan={2}>👤 {z}</td>
                      </tr>
                      {zStatuses.map(name => {
                        const {color} = colorOfManualStatus(name)
                        return (
                          <tr key={z+'|'+name}>
                            <td style={{paddingLeft:20}}>
                              <span className="status-label">
                                <span className="status-dot" style={{background:color}}/>
                                {name}
                              </span>
                            </td>
                            <td style={{color}}>
                              {accounts.filter(a=>a.zalivshik===z&&a.status===name).length||'—'}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </>)}
        </div>
      </div>
    </>
  )
}
