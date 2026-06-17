import { useEffect, useState, useRef, Fragment } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api } from '../lib/api'
import { useAuth } from '../lib/useAuth'
import { DEFAULT_STATUSES, DEFAULT_ROW_RULES } from '../lib/defaults'

// hex → rgba с прозрачностью (для фона бейджа)
function hexBg(hex, a = 0.13) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return 'rgba(107,114,128,.1)'
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`
}

const GROUPS = ['SL-USA','GS-USA','MM-NZ','OTHER']

function groupOf(name) {
  if (!name) return 'OTHER'
  if (name.startsWith('SL-USA')) return 'SL-USA'
  if (name.startsWith('GS-USA')) return 'GS-USA'
  if (name.startsWith('MM-NZ')) return 'MM-NZ'
  return 'OTHER'
}

// Поля, редактируемые инлайн (двойной клик по ячейке). combo = input + datalist
const EDITABLE = {
  name:{ t:'text' }, google_ads_id:{ t:'text' },
  geo:{ t:'combo' }, funnel:{ t:'combo' }, creo:{ t:'combo' }, card:{ t:'combo' },
  zalivshik:{ t:'combo' }, google_tag:{ t:'text' }, comment:{ t:'text' },
  format:{ t:'select', opts:['Фото','Видео'] },
  launch_date:{ t:'date' }, crut_date:{ t:'date' }, ban_date:{ t:'date' },
}
const COMBO_FIELDS = ['geo','funnel','creo','card','zalivshik']

// Реестр всех колонок таблицы
const ALL_COLUMNS = [
  { key:'name',       label:'Аккаунт',    width:150, align:'l' },
  { key:'status',     label:'Статус',     width:130, align:'l' },
  { key:'tech_status',label:'Тех. статус',width:110, align:'l' },
  { key:'geo',        label:'Гео',        width:80,  align:'l' },
  { key:'funnel',     label:'Воронка',    width:80,  align:'l' },
  { key:'creo',       label:'Крео',       width:100, align:'l' },
  { key:'today_cost', label:'Сегодня $',  width:75,  align:'r' },
  { key:'yest_cost',  label:'Вчера $',    width:75,  align:'r' },
  { key:'clicks',     label:'Клики',      width:55,  align:'r' },
  { key:'conv',       label:'Конверсии',  width:60,  align:'r' },
  { key:'cpa',        label:'CPA',        width:70,  align:'r' },
  { key:'card',       label:'Карта',      width:80,  align:'l' },
  { key:'zalivshik',  label:'Заливщик',   width:80,  align:'l' },
  { key:'format',     label:'Формат',     width:70,  align:'l' },
  { key:'launch_date',label:'Дата пуска', width:100, align:'l' },
  { key:'crut_date',  label:'Дата крута', width:100, align:'l' },
  { key:'ban_date',   label:'Дата бана',  width:100, align:'l' },
  { key:'last_seen',  label:'Активность', width:120, align:'l' },
  { key:'dis',        label:'Дизапрув',   width:160, align:'l' },
  { key:'comment',    label:'Комментарий',width:120, align:'l' },
  { key:'google_tag', label:'Google Tag', width:120, align:'l' },
]
const COLMAP = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c]))
const ALL_KEYS = ALL_COLUMNS.map(c => c.key)
const DEFAULT_ORDER = [
  'zalivshik','name','status','geo','today_cost','yest_cost','cpa','last_seen',
  'tech_status','funnel','creo','clicks','conv','card','format','launch_date','crut_date','ban_date','dis','comment','google_tag'
]
const DEFAULT_VISIBLE = ['zalivshik','name','status','geo','today_cost','yest_cost','cpa','last_seen']
const defaultVisibleMap = () => Object.fromEntries(ALL_KEYS.map(k => [k, DEFAULT_VISIBLE.includes(k)]))

// Поля для расширенного поиска
const SEARCH_FIELDS = [
  { key:'name',       label:'название',           get:a=>a.name },
  { key:'google_ads_id', label:'Google Ads ID',   get:a=>a.google_ads_id },
  { key:'card',       label:'карта',              get:a=>a.card },
  { key:'geo',        label:'гео',                get:a=>a.geo },
  { key:'zalivshik',  label:'заливщик',           get:a=>a.zalivshik },
  { key:'link',       label:'White ссылка',       get:a=>a.link },
  { key:'black',      label:'Black UTM',          get:a=>a.black },
  { key:'google_tag', label:'Google Tag',         get:a=>a.google_tag },
  { key:'clo_url',    label:'CLO',                get:a=>a.clo_url },
  { key:'comment',    label:'комментарий',        get:a=>a.comment },
  { key:'dis_reason', label:'причина дизапрува',  get:a=>a.dis_reason },
]
function matchField(a, f, s) { const v = f.get(a); return v && String(v).toLowerCase().includes(s) }

const EMPTY_FORM = {
  name:'', google_ads_id:'', currency:'USD', status:'Пуск', zalivshik:'',
  geo:'', interests:'', funnel:'', link:'', black:'', clo_url:'', white_id:'',
  format:'Фото', creo:'', txt_variant:'', google_tag:'', language:'', devices:'all',
  comment:'', card:'', dis_date:'', dis_reason:'', dis_solution:'',
  launch_date:'', crut_date:'', ban_date:'', ban_reason:''
}

function money(v) { const n=+v||0; if(!n) return '—'; return n>=1000?'$'+Math.round(n).toLocaleString('ru'):'$'+n.toFixed(0) }

function metricsOf(a, summary) {
  const m = summary[a.id] || {}
  const t = m.today || {}, y = m.yesterday || {}
  return {
    today_cost: +t.cost_usd || 0,
    yest_cost: +y.cost_usd || 0,
    clicks: +t.clicks || 0,
    conv: +t.conversions || 0,
    cpa: +t.cpa || 0,
  }
}

function sortVal(key, a, summary) {
  const mt = metricsOf(a, summary)
  switch (key) {
    case 'created_at': return new Date(a.created_at).getTime() || 0
    case 'today_cost': return mt.today_cost
    case 'yest_cost': return mt.yest_cost
    case 'clicks': return mt.clicks
    case 'conv': return mt.conv
    case 'cpa': return mt.cpa
    case 'name': return a.name || ''
    case 'status': return a.status || ''
    case 'tech_status': return a.tech_status || ''
    case 'geo': return a.geo || ''
    case 'funnel': return a.funnel || ''
    case 'creo': return a.creo || ''
    case 'format': return a.format || ''
    case 'card': return a.card || ''
    case 'zalivshik': return a.zalivshik || ''
    case 'launch_date': return a.launch_date || ''
    case 'crut_date': return a.crut_date || ''
    case 'ban_date': return a.ban_date || ''
    case 'last_seen': return a.last_seen_at || ''
    case 'dis': return a.dis_reason || ''
    case 'comment': return a.comment || ''
    case 'google_tag': return a.google_tag || ''
    default: return ''
  }
}

export default function Home() {
  const { user, signOut } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [theme, setTheme] = useState('dark')     // light|dark|system
  const [density, setDensity] = useState('cozy') // cozy|compact
  const [activeId, setActiveId] = useState(null)  // навигация стрелками
  const [showHelp, setShowHelp] = useState(false)
  const searchRef = useRef(null)
  const hkRef = useRef({})
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const [drawerMetrics, setDrawerMetrics] = useState([])
  const [drawerHistory, setDrawerHistory] = useState([])
  const [drawerTab, setDrawerTab] = useState('info')
  const [editForm, setEditForm] = useState(null)
  const [toast, setToast] = useState('')
  const [toastBtn, setToastBtn] = useState(null) // { label, onClick }
  const undoRef = useRef([])
  const redoRef = useRef([])
  const [syncTime, setSyncTime] = useState('')
  const [statusPopup, setStatusPopup] = useState(null)
  const [metricsSummary, setMetricsSummary] = useState({})
  const [copyPopup, setCopyPopup] = useState(null)
  const [statusDefs, setStatusDefs] = useState(DEFAULT_STATUSES)
  const [currencyRates, setCurrencyRates] = useState({ USD:1 })
  const [rowRules, setRowRules] = useState(DEFAULT_ROW_RULES)
  const [userTz, setUserTz] = useState(null) // часовой пояс пользователя (из настроек)

  // ── Сводная панель ──
  const [catFilter, setCatFilter] = useState(null) // 'active'|'problem'|'terminal'|'no_signal'|null
  const [panelOpen, setPanelOpen] = useState(true)

  // ── Группировка ──
  const [groupBy, setGroupBy] = useState('none') // none|geo|zalivshik|category
  const [collapsedGroups, setCollapsedGroups] = useState([])

  // ── Выделение / массовые действия ──
  const [selectedIds, setSelectedIds] = useState([])
  const [selAnchorId, setSelAnchorId] = useState(null)   // якорь для Shift+click (последняя «не-shift» строка)
  const [bulkBar, setBulkBar] = useState({ zalivshik:'', geo:'' })
  const [confirmDialog, setConfirmDialog] = useState(null) // { msg, onYes }

  // ── Инлайн-редактирование ──
  const [editCell, setEditCell] = useState(null) // { id, key, t, opts }
  const [editVal, setEditVal] = useState('')
  const openTimer = useRef(null)

  // Статусы из настроек пользователя (custom_statuses)
  const STATUSES = statusDefs.map(s => s.name)
  const STATUS_COLOR = Object.fromEntries(statusDefs.map(s => [s.name, s.color]))
  const STATUS_BG = Object.fromEntries(statusDefs.map(s => [s.name, hexBg(s.color)]))
  const FROZEN = statusDefs.filter(s => s.category === 'terminal').map(s => s.name)

  // ── Массовое добавление ──
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkRows, setBulkRows] = useState([])
  const [bulkAll, setBulkAll] = useState({ geo:'', zalivshik:'', funnel:'' })
  const [bulkSaving, setBulkSaving] = useState(false)

  // ── Фильтры ──
  const [statusSel, setStatusSel] = useState([])
  const [geoSel, setGeoSel] = useState([])
  const [zalivSel, setZalivSel] = useState([])
  const [groupSel, setGroupSel] = useState([])
  const [funnelSel, setFunnelSel] = useState([])
  const [formatSel, setFormatSel] = useState('all')
  const [launchFrom, setLaunchFrom] = useState('')
  const [launchTo, setLaunchTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // ── Колонки ──
  const [colOrder, setColOrder] = useState(DEFAULT_ORDER)
  const [colVisible, setColVisible] = useState(defaultVisibleMap())
  const [colWidths, setColWidths] = useState({}) // { key: px } override
  const [showCols, setShowCols] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [thDrag, setThDrag] = useState(null)
  const [thOver, setThOver] = useState(null) // { key, side: 'left'|'right' }
  const resizingRef = useRef(null) // { key, startX, startW }
  const colCfgTimer = useRef(null)
  const dbReady = useRef(false) // не писать column_config в БД до применения значений из БД

  // ── Сортировка / страницы ──
  const [sort, setSort] = useState({ key:'created_at', dir:'desc' })
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)

  // ── Перетаскивание строк ──
  const [rowOrder, setRowOrder] = useState([])
  const [rowDrag, setRowDrag] = useState(null)
  const [rowOver, setRowOver] = useState(null) // { id, side: 'top'|'bottom' }

  const loaded = useRef(false)

  useEffect(() => {
    const t = localStorage.getItem('zcrm_theme')
    if (t === 'light' || t === 'dark' || t === 'system') setTheme(t)
    else if (t) setTheme(t === 'dark' ? 'dark' : 'light')
    const d = localStorage.getItem('zcrm_density')
    if (d === 'compact' || d === 'cozy') setDensity(d)
    try {
      const s = JSON.parse(localStorage.getItem('zcrm_table_settings') || '{}')
      if (Array.isArray(s.statusSel)) setStatusSel(s.statusSel)
      if (Array.isArray(s.geoSel)) setGeoSel(s.geoSel)
      if (Array.isArray(s.zalivSel)) setZalivSel(s.zalivSel)
      if (Array.isArray(s.groupSel)) setGroupSel(s.groupSel)
      if (Array.isArray(s.funnelSel)) setFunnelSel(s.funnelSel)
      if (s.formatSel) setFormatSel(s.formatSel)
      if (s.launchFrom) setLaunchFrom(s.launchFrom)
      if (s.launchTo) setLaunchTo(s.launchTo)
      if (Array.isArray(s.colOrder)) {
        const merged = [...s.colOrder.filter(k => COLMAP[k]), ...ALL_KEYS.filter(k => !s.colOrder.includes(k))]
        setColOrder(merged)
      }
      if (s.colVisible) setColVisible({ ...defaultVisibleMap(), ...s.colVisible })
      if (s.colWidths) setColWidths(s.colWidths)
      if (s.pageSize) setPageSize(s.pageSize)
      if (s.sort && s.sort.key) setSort(s.sort)
      if (typeof s.panelOpen === 'boolean') setPanelOpen(s.panelOpen)
      if (s.groupBy) setGroupBy(s.groupBy)
      if (Array.isArray(s.collapsedGroups)) setCollapsedGroups(s.collapsedGroups)
    } catch {}
    try {
      const ro = JSON.parse(localStorage.getItem('zcrm_row_order') || '[]')
      if (Array.isArray(ro)) setRowOrder(ro)
    } catch {}
    loaded.current = true
    load()
  }, [])

  // Тема: light/dark/system → эффективный dark (с подпиской на системную)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setDark(theme === 'system' ? mq.matches : theme === 'dark')
    apply()
    if (theme === 'system') { mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply) }
  }, [theme])

  useEffect(() => { document.body.className = dark ? 'dark' : 'light' }, [dark])

  // Автоскролл .tbl-wrap при drag&drop СТРОК (rowDrag), не колонок.
  // Активен только пока тащим строку и курсор у верхнего/нижнего края области таблицы
  // (зона ~60px, шире у самого края — быстрее). Зона верха отсчитывается ПОД sticky-шапкой,
  // чтобы автоскролл не конфликтовал с закреплённым thead. dropRow/zcrm_row_order не трогаем.
  useEffect(() => {
    if (!rowDrag) return
    const wrap = document.querySelector('.tbl-wrap')
    if (!wrap) return
    const EDGE = 60     // px от края — зона активации
    const MAX = 18      // макс шаг (px/кадр), ~60 fps → плавно
    let mouseY = null
    let raf = null
    const onMove = (e) => { mouseY = e.clientY }
    const tick = () => {
      if (mouseY != null) {
        const rect = wrap.getBoundingClientRect()
        const head = wrap.querySelector('thead')
        const headerH = head ? head.getBoundingClientRect().height : 0
        const topZone = rect.top + headerH
        const botZone = rect.bottom
        if (mouseY < topZone + EDGE) {
          const k = (topZone + EDGE - mouseY) / EDGE         // 0..1, чем ближе к краю — тем больше
          wrap.scrollTop -= Math.max(2, Math.min(MAX, k * MAX))
        } else if (mouseY > botZone - EDGE) {
          const k = (mouseY - (botZone - EDGE)) / EDGE
          wrap.scrollTop += Math.max(2, Math.min(MAX, k * MAX))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    document.addEventListener('dragover', onMove)
    raf = requestAnimationFrame(tick)
    return () => {
      document.removeEventListener('dragover', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [rowDrag])

  // Горячие клавиши. Ловим ТОЛЬКО вне текстовых полей (иначе «/» печаталось бы в инпут).
  useEffect(() => {
    const TEXT_TYPES = ['text','search','number','email','url','password','tel','date','datetime-local','month','week','time']
    function isTextField(t) {
      if (!t) return false
      if (t.isContentEditable) return true
      const tag = (t.tagName || '').toLowerCase()
      if (tag === 'textarea') return true
      if (tag === 'input') return TEXT_TYPES.includes((t.type || 'text').toLowerCase())
      return false // <select>, checkbox, button и пр. — не текстовые
    }
    function onKey(e) {
      if (isTextField(e.target)) return
      const k = e.key
      if (e.metaKey || e.ctrlKey) {
        const lk = k.toLowerCase()
        if (lk === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
        else if ((lk === 'z' && e.shiftKey) || lk === 'y') { e.preventDefault(); doRedo() }
        return
      }
      const s = hkRef.current
      if (k === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (k === '?') { e.preventDefault(); setShowHelp(h => !h); return }
      if (k === 'Escape') {
        if (s.drawerOpen) setDrawer(null)
        else if (s.hasSelection) clearSelection()
        else setShowHelp(false)
        return
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        if (!s.navRows.length) return
        e.preventDefault()
        const idx = s.navRows.findIndex(a => a.id === s.activeId)
        let ni = idx < 0 ? 0 : idx + (k === 'ArrowDown' ? 1 : -1)
        ni = Math.max(0, Math.min(s.navRows.length - 1, ni))
        const nid = s.navRows[ni].id
        setActiveId(nid)
        requestAnimationFrame(() => document.getElementById('row-' + nid)?.scrollIntoView({ block: 'nearest' }))
        return
      }
      if (k === 'Enter') { const row = s.navRows.find(a => a.id === s.activeId); if (row) openDrawer(row) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    localStorage.setItem('zcrm_table_settings', JSON.stringify({
      statusSel, geoSel, zalivSel, groupSel, funnelSel, formatSel,
      launchFrom, launchTo, colOrder, colVisible, colWidths, pageSize, sort, panelOpen, groupBy, collapsedGroups,
    }))
  }, [statusSel, geoSel, zalivSel, groupSel, funnelSel, formatSel, launchFrom, launchTo, colOrder, colVisible, colWidths, pageSize, sort, panelOpen, groupBy, collapsedGroups])

  // Сохранение конфигурации колонок в БД (column_config) — переживает смену устройства. localStorage выше = кэш.
  useEffect(() => {
    if (!dbReady.current) return
    clearTimeout(colCfgTimer.current)
    colCfgTimer.current = setTimeout(() => {
      api('/api/users/settings', { method:'POST', body: JSON.stringify({ column_config: { order: colOrder, visible: colVisible, widths: colWidths } }) }).catch(()=>{})
    }, 600)
  }, [colOrder, colVisible, colWidths])

  useEffect(() => { setPage(1) }, [statusSel, geoSel, zalivSel, groupSel, funnelSel, formatSel, launchFrom, launchTo, search, pageSize, catFilter])

  function cycleTheme() {
    const order = ['light', 'dark', 'system']
    const next = order[(order.indexOf(theme) + 1) % 3]
    setTheme(next)
    localStorage.setItem('zcrm_theme', next)
    if (dbReady.current) api('/api/users/settings', { method:'POST', body: JSON.stringify({ ui_theme: next }) }).catch(()=>{})
  }
  function toggleDensity() {
    const next = density === 'cozy' ? 'compact' : 'cozy'
    setDensity(next)
    localStorage.setItem('zcrm_density', next)
    if (dbReady.current) api('/api/users/settings', { method:'POST', body: JSON.stringify({ ui_density: next }) }).catch(()=>{})
  }

  async function load() {
    setLoading(true)
    const [data, mData, sData] = await Promise.all([
      api('/api/accounts'),
      api('/api/metrics-summary'),
      api('/api/users/settings'),
    ])
    const accs = data.accounts || []
    setAccounts(accs)
    // Если у пользователя есть ручной порядок — дописать в конец новые id, которых там ещё нет.
    // Стабильный порядок дописывания: по created_at, затем id. Сам ручной порядок не трогаем.
    setRowOrder(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev
      const known = new Set(prev)
      const tail = accs
        .filter(a => !known.has(a.id))
        .sort((a, b) => {
          const ta = a.created_at || '', tb = b.created_at || ''
          if (ta !== tb) return ta < tb ? -1 : 1
          return String(a.id).localeCompare(String(b.id))
        })
        .map(a => a.id)
      if (tail.length === 0) return prev
      const next = [...prev, ...tail]
      try { localStorage.setItem('zcrm_row_order', JSON.stringify(next)) } catch {}
      return next
    })
    setMetricsSummary(mData.summary || {})
    if (Array.isArray(sData?.settings?.custom_statuses) && sData.settings.custom_statuses.length) {
      setStatusDefs(sData.settings.custom_statuses)
    }
    if (sData?.settings?.currency_rates && Object.keys(sData.settings.currency_rates).length) {
      setCurrencyRates({ USD:1, ...sData.settings.currency_rates })
    }
    if (Array.isArray(sData?.settings?.row_rules)) {
      setRowRules(sData.settings.row_rules)
    }
    if (sData?.settings?.user_timezone) setUserTz(sData.settings.user_timezone)
    // column_config из БД важнее localStorage (переживает смену устройства)
    const cc = sData?.settings?.column_config
    if (cc && Object.keys(cc).length) {
      if (Array.isArray(cc.order) && cc.order.length) {
        setColOrder([...cc.order.filter(k => COLMAP[k]), ...ALL_KEYS.filter(k => !cc.order.includes(k))])
      }
      if (cc.visible) setColVisible({ ...defaultVisibleMap(), ...cc.visible })
      if (cc.widths) setColWidths(cc.widths)
    }
    const ut = sData?.settings?.ui_theme
    if (ut === 'light' || ut === 'dark' || ut === 'system') { setTheme(ut); localStorage.setItem('zcrm_theme', ut) }
    const ud = sData?.settings?.ui_density
    if (ud === 'compact' || ud === 'cozy') { setDensity(ud); localStorage.setItem('zcrm_density', ud) }
    dbReady.current = true // теперь правки колонок можно писать в БД
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
    const prev = accounts.find(a => a.id === accId)?.status ?? null
    const next = newStatus === '' ? null : newStatus
    if (prev === next) return
    await api(`/api/accounts/${accId}`, { method:'PATCH', body: JSON.stringify({ status: next }) })
    await load()
    pushAction({
      label: 'статус',
      undo: () => applyRestore([{ id: accId, status: prev }]),
      redo: () => applyRestore([{ id: accId, status: next }]),
    })
    showToast(next ? 'Статус → ' + next : 'Статус снят', { label: '↺ Отмена', onClick: doUndo })
  }

  async function archiveAcc(id) {
    await api(`/api/accounts/${id}`, { method:'DELETE' })
    await load()
    setDrawer(null)
    pushAction({
      label: 'архив',
      undo: () => applyRestore([{ id, is_archived: false }]),
      redo: () => applyPatch(id, { is_archived: true }),
    })
    showToast('Аккаунт в архиве', { label: '↺ Отмена', onClick: doUndo })
  }

  async function addMetric(accountId, row) {
    await api(`/api/metrics/${accountId}`, { method:'POST', body: JSON.stringify(row) })
    const m = await api(`/api/metrics/${accountId}`)
    setDrawerMetrics(m.metrics || [])
    showToast('Метрики сохранены ✓')
  }

  function showToast(msg, btn = null) {
    setToast(msg)
    setToastBtn(btn)
    clearTimeout(showToast._t)
    showToast._t = setTimeout(() => { setToast(''); setToastBtn(null) }, btn ? 5000 : 2200)
  }

  // ── Undo / Redo ──
  function pushAction(action) {
    undoRef.current.push(action)
    if (undoRef.current.length > 20) undoRef.current.shift()
    redoRef.current = []
  }
  async function applyPatch(id, fields) {
    setAccounts(list => list.map(x => x.id === id ? { ...x, ...fields } : x))
    await api(`/api/accounts/${id}`, { method:'PATCH', body: JSON.stringify(fields) })
  }
  async function applyRestore(before) {
    let needsReload = false
    for (const row of before) {
      const { id, ...fields } = row
      if ('is_archived' in fields) needsReload = true // меняется членство в списке → рефетч
      await api(`/api/accounts/${id}`, { method:'PATCH', body: JSON.stringify(fields) })
    }
    if (needsReload) { await load(); return }
    // точечное обновление строк без полного рефетча
    setAccounts(list => list.map(x => {
      const r = before.find(b => b.id === x.id)
      if (!r) return x
      const { id, ...fields } = r
      return { ...x, ...fields }
    }))
  }
  async function applyBulk(ids, changes) {
    await api('/api/accounts/bulk-update', { method:'POST', body: JSON.stringify({ ids, changes }) })
    if ('is_archived' in changes && changes.is_archived) {
      setAccounts(list => list.filter(a => !ids.includes(a.id)))
    } else {
      setAccounts(list => list.map(a => ids.includes(a.id) ? { ...a, ...changes } : a))
    }
  }
  async function doUndo() {
    const a = undoRef.current.pop()
    if (!a) return showToast('Нечего отменять')
    await a.undo()
    redoRef.current.push(a)
    showToast('Отменено: ' + a.label, { label: '↻ Повтор', onClick: doRedo })
  }
  async function doRedo() {
    const a = redoRef.current.pop()
    if (!a) return showToast('Нечего повторять')
    await a.redo()
    undoRef.current.push(a)
    showToast('Повторено: ' + a.label)
  }

  // ── Инлайн-редактирование ячеек ──
  function distinctVals(key) {
    return [...new Set(accounts.map(x => x[key]).filter(v => v != null && String(v).trim() !== ''))]
      .sort((a, b) => String(a).localeCompare(String(b)))
  }
  function startEdit(a, key) {
    const cfg = EDITABLE[key]
    if (!cfg) return
    setEditCell({ id: a.id, key, t: cfg.t, opts: cfg.opts })
    setEditVal(a[key] == null ? '' : String(a[key]))
  }
  function cancelEdit() { setEditCell(null); setEditVal('') }
  async function commitEdit() {
    if (!editCell) return
    const { id, key } = editCell
    setEditCell(null)
    const acc = accounts.find(x => x.id === id)
    if (!acc) return
    const prev = acc[key]
    const nextVal = editVal === '' ? null : editVal
    if (String(prev ?? '') === String(nextVal ?? '')) return // не изменилось
    // оптимистично
    setAccounts(list => list.map(x => x.id === id ? { ...x, [key]: nextVal } : x))
    const r = await api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ [key]: nextVal }) })
    if (r && r.error) {
      setAccounts(list => list.map(x => x.id === id ? { ...x, [key]: prev } : x)) // откат
      showToast('Ошибка: ' + r.error)
    } else {
      pushAction({
        label: key,
        undo: () => applyPatch(id, { [key]: prev ?? null }),
        redo: () => applyPatch(id, { [key]: nextVal }),
      })
      showToast('Сохранено ✓', { label: '↺ Отмена', onClick: doUndo })
    }
  }

  // ── Выделение строк + массовые действия ──
  function toggleSelect(id) {
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  function toggleSelectPage(ids) {
    const allSel = ids.length > 0 && ids.every(id => selectedIds.includes(id))
    setSelectedIds(s => allSel ? s.filter(id => !ids.includes(id)) : [...new Set([...s, ...ids])])
  }
  function selectAllFiltered(ids) { setSelectedIds(ids); setSelAnchorId(ids[ids.length - 1] || null) }
  function clearSelection() { setSelectedIds([]); setSelAnchorId(null) }

  // Клик по чекбоксу строки. Поддерживает Shift (диапазон) и Cmd/Ctrl (toggle одной строки).
  // Диапазон считается ПО ВИЗУАЛЬНОМУ порядку (displayed) — с учётом текущей сортировки/фильтра/группировки.
  function handleSelectClick(e, id) {
    const isShift = e.shiftKey
    const isMeta  = e.metaKey || e.ctrlKey
    if (isShift && selAnchorId && selAnchorId !== id) {
      const order = displayed.map(a => a.id)
      const idxA = order.indexOf(selAnchorId)
      const idxB = order.indexOf(id)
      if (idxA < 0 && idxB < 0) {
        // оба конца невидимы → откатываемся на обычный toggle
        toggleSelect(id); setSelAnchorId(id); return
      }
      // Если виден только один конец, считаем диапазон от него же до него же (плюс explicit add ниже).
      const a1 = idxA < 0 ? idxB : idxA
      const a2 = idxB < 0 ? idxA : idxB
      const lo = Math.min(a1, a2)
      const hi = Math.max(a1, a2)
      const range = order.slice(lo, hi + 1)            // inclusive с обоих концов
      setSelectedIds(s => {
        const set = new Set(s)
        const next = s.slice()
        const push = (rid) => { if (rid && !set.has(rid)) { next.push(rid); set.add(rid) } }
        for (const rid of range) push(rid)
        // Защита от любых off-by-one / устаревшего displayed: оба клик-конца гарантированно в выделении.
        push(selAnchorId)
        push(id)
        return next
      })
      // Якорь не обновляем — расширяем/сужаем диапазон следующим Shift+click от той же исходной точки.
      return
    }
    // Cmd/Ctrl или обычный клик — toggle одиночный (как раньше). Якорь обновляется в обоих случаях.
    toggleSelect(id)
    setSelAnchorId(id)
  }

  async function bulkUpdate(changes, { confirm: confirmMsg, label } = {}) {
    if (selectedIds.length === 0) return
    if (confirmMsg && !window.confirm(confirmMsg)) return
    const ids = [...selectedIds]
    const r = await api('/api/accounts/bulk-update', { method:'POST', body: JSON.stringify({ ids, changes }) })
    if (r.error) return showToast('Ошибка: ' + r.error)
    // Точечное обновление без полного reload (без оверлея «Загрузка…»)
    if ('is_archived' in changes && changes.is_archived) {
      setAccounts(list => list.filter(a => !ids.includes(a.id)))
    } else {
      setAccounts(list => list.map(a => ids.includes(a.id) ? { ...a, ...changes } : a))
    }
    if (Array.isArray(r.before) && r.before.length) {
      pushAction({
        label: label || 'массовое',
        undo: () => applyRestore(r.before),                 // у каждого id — его прежние значения
        redo: () => applyBulk(r.before.map(b => b.id), changes),
      })
    }
    if (typeof document !== 'undefined') document.activeElement?.blur?.() // снять фокус с селекта, чтобы Ctrl+Z ловился
    showToast(label || `Обновлено: ${r.updated}`, { label: '↺ Отмена', onClick: doUndo })
  }
  async function bulkArchive() {
    setConfirmDialog({
      msg: `Заархивировать ${selectedIds.length} аккаунт(ов)? Их можно вернуть из архива.`,
      onYes: async () => {
        setConfirmDialog(null)
        await bulkUpdate({ is_archived: true }, { label: 'В архив ✓' })
        clearSelection()
      },
    })
  }
  // Унифицированное копирование: если ctx (строка из попапа) есть и она в выделении,
  // или ctx нет (вызов из bulkbar) — работаем по selectedIds. Иначе по одной ctx-строке.
  function copyTargets(ctx) {
    const ids = (ctx && selectedIds.includes(ctx.id)) || !ctx
      ? selectedIds
      : [ctx.id]
    return ids.map(id => accounts.find(x => x.id === id)).filter(Boolean)
  }
  function copyField(field, label, ctx) {
    const accs = copyTargets(ctx)
    if (accs.length === 0) return
    const vals = accs.map(a => a[field] || '').filter(Boolean).join('\n')
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(vals)
    setCopyPopup(null)
    if (!vals) { showToast('Пусто: ' + label); return }
    showToast(accs.length > 1 ? `Скопировано ${accs.length}: ${label}` : 'Скопировано: ' + label)
  }
  // Совместимость: оставляю copySelected как обёртку для существующих вызовов из bulkbar
  function copySelected(field, label) { copyField(field, label, null) }

  function copyPack(ctx) {
    const accs = copyTargets(ctx)
    if (accs.length === 0) return
    const HEADERS = ['Название','Google Ads ID','White','Black UTM','Google Tag','CLO']
    const FIELDS  = ['name','google_ads_id','link','black','google_tag','clo_url']
    let text
    if (accs.length === 1) {
      // Одна строка → блок «поле: значение» как раньше
      const a = accs[0]
      text = HEADERS.map((h, i) => `${h}: ${a[FIELDS[i]] || ''}`).join('\n')
    } else {
      // Пачка → TSV-таблица для Sheets/Excel (ячейки через TAB, строки через перенос)
      const safe = (v) => String(v || '').replace(/[\t\r\n]/g, ' ')
      const lines = [HEADERS.join('\t'), ...accs.map(a => FIELDS.map(f => safe(a[f])).join('\t'))]
      text = lines.join('\n')
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text)
    setCopyPopup(null)
    showToast(accs.length > 1 ? `Скопировано ${accs.length}: всё (таблица)` : 'Скопировано: всё')
  }
  function exportCSV(cols) {
    const rows = accounts.filter(a => selectedIds.includes(a.id))
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const metricKeys = { today_cost:'today_cost', yest_cost:'yest_cost', clicks:'clicks', conv:'conv', cpa:'cpa' }
    const header = cols.map(c => esc(c.label)).join(',')
    const lines = rows.map(a => {
      const mt = metricsOf(a, metricsSummary)
      return cols.map(c => {
        let v
        if (c.key in metricKeys) v = mt[metricKeys[c.key]]
        else if (c.key === 'dis') v = a.dis_reason
        else v = a[c.key]
        return esc(v)
      }).join(',')
    })
    const csv = '﻿' + [header, ...lines].join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zalivcrm_export_${new Date().toISOString().slice(0,10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`CSV: ${rows.length} строк`)
  }


  // ── Массовое добавление ──
  function bulkParse() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    setBulkRows(lines.map(name => ({ name, status:'Пуск', geo:'', zalivshik:'', funnel:'' })))
  }
  function bulkApplyAll() {
    setBulkRows(rows => rows.map(r => ({
      ...r,
      geo: bulkAll.geo || r.geo,
      zalivshik: bulkAll.zalivshik || r.zalivshik,
      funnel: bulkAll.funnel || r.funnel,
    })))
    showToast('Применено ко всем ✓')
  }
  function bulkSetRow(i, patch) {
    setBulkRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function bulkClose() {
    setShowBulk(false); setBulkText(''); setBulkRows([]); setBulkAll({ geo:'', zalivshik:'', funnel:'' })
  }
  async function bulkAddAll() {
    if (bulkRows.length === 0) return
    setBulkSaving(true)
    const res = await api('/api/accounts/bulk', { method:'POST', body: JSON.stringify({ accounts: bulkRows }) })
    setBulkSaving(false)
    if (res.error) { showToast('Ошибка: ' + res.error); return }
    await load()
    bulkClose()
    showToast(`Добавлено: ${res.created} ✓`)
  }

  function toggleArr(val, arr, setArr) {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  function resetFilters() {
    setStatusSel([]); setGeoSel([]); setZalivSel([]); setGroupSel([])
    setFunnelSel([]); setFormatSel('all'); setLaunchFrom(''); setLaunchTo('')
    setCatFilter(null)
  }

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function moveCol(from, to) {
    if (from == null || from === to) return
    const next = [...colOrder]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    setColOrder(next)
    setDragIdx(null)
  }

  function resetCols() {
    setColOrder(DEFAULT_ORDER)
    setColVisible(defaultVisibleMap())
    setColWidths({})
  }

  function persistRowOrder(order) {
    setRowOrder(order)
    localStorage.setItem('zcrm_row_order', JSON.stringify(order))
  }

  // Перетаскивание строк: фиксирует текущий видимый порядок и переставляет
  function dropRow(toId) {
    const fromId = rowDrag
    const side = rowOver?.side || 'top'
    setRowDrag(null); setRowOver(null)
    if (!fromId) return

    // Групповой drag: если за отмеченную строку — тащим ВСЕ отмеченные в порядке отметки
    // (selectedIds хранит порядок кликов по чекбоксам). Если за неотмеченную — одиночный drag.
    const fromIds = selectedIds.includes(fromId) ? selectedIds.slice() : [fromId]
    const fromSet = new Set(fromIds)

    // База: текущий отображаемый порядок + остальные id из сохранённого rowOrder в конец.
    // Это гарантирует, что НИ ОДИН аккаунт не теряется (как чинили в баге с пропадающими строками).
    const visibleIds = filtered.map(a => a.id)
    const base = [...visibleIds, ...rowOrder.filter(id => !visibleIds.includes(id))]

    // Позиция вставки относительно toId считается в базовом массиве, ДО удаления fromIds.
    let baseIdx = base.indexOf(toId)
    if (baseIdx < 0) return
    if (side === 'bottom') baseIdx += 1
    // Сколько fromIds лежит до baseIdx — на столько индекс сместится после удаления.
    let removedBefore = 0
    for (let i = 0; i < baseIdx; i++) if (fromSet.has(base[i])) removedBefore++

    const next = base.filter(id => !fromSet.has(id))
    const insertAt = baseIdx - removedBefore
    next.splice(insertAt, 0, ...fromIds)
    persistRowOrder(next)
    setSort({ key: 'custom', dir: 'asc' }) // ручной порядок сбрасывает сортировку
  }

  // Перетаскивание колонок за заголовок таблицы
  function dropTh(toKey) {
    const fromKey = thDrag
    const side = thOver?.side || 'left'
    setThDrag(null); setThOver(null)
    if (!fromKey || fromKey === toKey) return
    const next = colOrder.filter(k => k !== fromKey)
    let toI = next.indexOf(toKey)
    if (toI < 0) return
    if (side === 'right') toI += 1
    next.splice(toI, 0, fromKey)
    setColOrder(next)
  }

  // Ширина колонки: пользовательский override или дефолт
  const colW = (c) => colWidths[c.key] || c.width

  // Изменение ширины колонки перетаскиванием правого края заголовка
  function startResize(e, c) {
    e.stopPropagation(); e.preventDefault()
    resizingRef.current = { key: c.key, startX: e.clientX, startW: colW(c) }
    const onMove = (ev) => {
      const r = resizingRef.current; if (!r) return
      const w = Math.max(50, r.startW + (ev.clientX - r.startX))
      setColWidths(prev => ({ ...prev, [r.key]: w }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setTimeout(() => { resizingRef.current = null }, 0) // дать onDragStart увидеть флаг
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Уникальные значения для мультиселектов
  const uniq = (key) => [...new Set(accounts.map(a => a[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))
  const geoOptions = uniq('geo')
  const zalivOptions = uniq('zalivshik')
  const funnelOptions = uniq('funnel')

  const s = search.toLowerCase()
  const categoryOf = (status) => statusDefs.find(d => d.name === status)?.category || 'neutral'

  // Базовый набор — все фильтры, КРОМЕ категорийного быстрого фильтра панели
  const filteredBase = accounts.filter(a => {
    if (search && !SEARCH_FIELDS.some(f => matchField(a, f, s))) return false
    if (statusSel.length && !statusSel.includes(a.status)) return false
    if (geoSel.length && !geoSel.includes(a.geo)) return false
    if (zalivSel.length && !zalivSel.includes(a.zalivshik)) return false
    if (groupSel.length && !groupSel.includes(groupOf(a.name))) return false
    if (funnelSel.length && !funnelSel.includes(a.funnel)) return false
    if (formatSel !== 'all' && a.format !== formatSel) return false
    if (launchFrom && (!a.launch_date || a.launch_date < launchFrom)) return false
    if (launchTo && (!a.launch_date || a.launch_date > launchTo)) return false
    return true
  })

  const filtered = filteredBase.filter(a => {
    if (!catFilter) return true
    if (catFilter === 'no_signal') return a.tech_status === 'НЕТ СВЯЗИ'
    return categoryOf(a.status) === catFilter
  }).sort((a, b) => {
    if (sort.key === 'custom') {
      // 1) Ручной порядок (rowOrder): кто в нём — впереди по своему индексу.
      // 2) Фолбэк для «бездомных» (нет в rowOrder, sort_order=null): детерминированно
      //    по created_at, затем по id — total-order без равных ключей, ни одна строка
      //    не «дрейфует» и не пропадает на пагинации.
      const ia = rowOrder.indexOf(a.id), ib = rowOrder.indexOf(b.id)
      const inA = ia >= 0, inB = ib >= 0
      if (inA && inB) return ia - ib
      if (inA) return -1
      if (inB) return 1
      const ta = a.created_at || '', tb = b.created_at || ''
      if (ta !== tb) return ta < tb ? -1 : 1
      return String(a.id).localeCompare(String(b.id))
    }
    const va = sortVal(sort.key, a, metricsSummary)
    const vb = sortVal(sort.key, b, metricsSummary)
    let r
    if (typeof va === 'number' && typeof vb === 'number') r = va - vb
    else r = String(va).localeCompare(String(vb))
    return sort.dir === 'asc' ? r : -r
  })

  // ── Метрики сводной панели (по базовому набору) ──
  const rate = (cur) => currencyRates[cur] || 1
  const panel = (() => {
    let active = 0, problem = 0, terminal = 0, noSignal = 0, spendToday = 0, spendYest = 0
    for (const a of filteredBase) {
      const cat = categoryOf(a.status)
      if (cat === 'active') active++
      else if (cat === 'problem') problem++
      else if (cat === 'terminal') terminal++
      if (a.tech_status === 'НЕТ СВЯЗИ') noSignal++
      const m = metricsSummary[a.id]
      if (m) {
        const r = rate(m.currency || a.currency || 'USD')
        spendToday += (+m.today?.cost_usd || 0) * r
        spendYest += (+m.yesterday?.cost_usd || 0) * r
      }
    }
    return { total: filteredBase.length, active, problem, terminal, noSignal, spendToday, spendYest }
  })()

  // ── Правила подсветки строк (row_rules) ──
  function ruleHits(a) {
    const m = metricsSummary[a.id] || {}
    const t = m.today || {}, y = m.yesterday || {}
    const v = {
      tech_status: a.tech_status,
      today_cost: +t.cost_usd || 0,
      yest_cost: +y.cost_usd || 0,
      today_conv: +t.conversions || 0,
      cpa: +t.cpa || 0,
      today_cpc: +t.cpc_usd || 0,
      yest_cpc: +y.cpc_usd || 0,
    }
    const matches = (r) => {
      switch (r.field) {
        case 'tech_status':   return v.tech_status === (r.value || 'НЕТ СВЯЗИ')
        case 'maybe_ban':     return v.tech_status === 'НЕТ СВЯЗИ' && (v.today_cost > 0 || v.yest_cost > 0)
        case 'spend_no_conv': return v.today_cost > 0 && v.today_conv === 0
        case 'cpa':           return v.cpa > (+r.value || 70)
        case 'cpc_jump_pct':  return v.yest_cpc > 0 && ((v.today_cpc - v.yest_cpc) / v.yest_cpc * 100) > (+r.value || 50)
        default: return false
      }
    }
    let stripe = null
    const cellColor = {}
    for (const r of rowRules) {
      if (r.enabled === false) continue
      if (!matches(r)) continue
      // CPA-правило красит только ячейку CPA, не полосу
      if (r.field === 'cpa') { if (!cellColor.cpa) cellColor.cpa = r.color; continue }
      // остальные (НЕТ СВЯЗИ / спенд без конверсий / скачок CPC) — полоса слева, первое по приоритету
      if (!stripe) stripe = r.color
    }
    return { stripe, cellColor }
  }

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize))
  const curPage = Math.min(page, totalPages)
  const pageRows = pageSize === 'all' ? filtered : filtered.slice((curPage-1)*pageSize, curPage*pageSize)

  // ── Группировка ──
  const CAT_LABEL = { active:'Актив', problem:'Проблема', terminal:'Терминал', neutral:'Нейтр.' }
  function groupKeyOf(a) {
    if (groupBy === 'geo') return a.geo || '— без гео —'
    if (groupBy === 'zalivshik') return a.zalivshik || '— без заливщика —'
    if (groupBy === 'category') return CAT_LABEL[categoryOf(a.status)] || '—'
    return ''
  }
  function groupSpend(rows) {
    return rows.reduce((s, a) => {
      const m = metricsSummary[a.id]
      return s + (m ? (+m.today?.cost_usd || 0) * rate(m.currency || a.currency || 'USD') : 0)
    }, 0)
  }
  const groupList = (() => {
    if (groupBy === 'none') return null
    const map = new Map()
    for (const a of filtered) { const k = groupKeyOf(a); if (!map.has(k)) map.set(k, []); map.get(k).push(a) }
    return [...map.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0])))
  })()
  const displayed = groupBy === 'none' ? pageRows : filtered
  function toggleGroup(k) {
    setCollapsedGroups(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])
  }

  // Текущее состояние для обработчика хоткеев (читается через ref, без устаревших замыканий)
  hkRef.current = { navRows: displayed, activeId, drawerOpen: !!drawer, hasSelection: selectedIds.length > 0 }

  let matchedFields = []
  if (search) {
    const set = new Set()
    for (const a of filtered) for (const f of SEARCH_FIELDS) if (matchField(a, f, s)) set.add(f.label)
    matchedFields = [...set]
  }

  const statusGroups = {}
  STATUSES.forEach(st => { statusGroups[st] = accounts.filter(a => a.status === st).length })

  const totalAccounts = accounts.length
  const working = accounts.filter(a => a.status && a.status.toLowerCase().includes('крутит')).length
  const problems = accounts.filter(a => ['БАН','На смену','отклон','Дизапрув'].includes(a.status)).length

  const activeFilterCount = statusSel.length + geoSel.length + zalivSel.length + groupSel.length +
    funnelSel.length + (formatSel !== 'all' ? 1 : 0) + (launchFrom ? 1 : 0) + (launchTo ? 1 : 0)

  const visibleCols = colOrder.map(k => COLMAP[k]).filter(c => c && colVisible[c.key])

  function cellContent(key, a, mt, marks) {
    switch (key) {
      case 'name': return (
        <div className="name-cell">
          <span className="row-handle" title="Перетащить строку"
                draggable
                onClick={e=>e.stopPropagation()}
                onDragStart={e=>{e.stopPropagation();setRowDrag(a.id)}}
                onDragEnd={()=>{setRowDrag(null);setRowOver(null)}}>⠿</span>
          <div style={{minWidth:0,flex:1}}>
            <div className="acc-name">{a.name||'—'}</div>
            <div className="acc-sub">{a.google_ads_id||''}</div>
          </div>
          <button className="copy-btn" title="Копировать..." onClick={e=>{e.stopPropagation();setCopyPopup({id:a.id,x:e.clientX,y:e.clientY})}}>⎘</button>
        </div>
      )
      case 'status': return (
        <span className="badge" style={{background:STATUS_BG[a.status]||'rgba(107,114,128,.1)',color:STATUS_COLOR[a.status]||'#6b7280'}}>
          <span className="badge-dot" style={{background:STATUS_COLOR[a.status]||'#6b7280'}}/>{a.status||'—'}
        </span>
      )
      case 'tech_status': {
        // системные цвета: Крутит зелёный, Отклонены/Бюджет оранжевый, Пауза серый, Нет связи красный
        const TS = {
          'Крутит':{l:'Крутит',c:'#22d17a'},
          'Отклонены':{l:'Отклонены',c:'#f5a623'},
          'Бюджет':{l:'Бюджет',c:'#f5a623'},
          'Пауза':{l:'Пауза',c:'#6b7280'},
          // легаси-статусы старого скрипта
          'РАБОТАЕТ':{l:'РАБОТАЕТ',c:'#22d17a'},
          'ВСЕ НА ПАУЗЕ':{l:'ПАУЗЕ',c:'#6b7280'},
          'ПАУЗЕ':{l:'ПАУЗЕ',c:'#6b7280'},
          'ПРОВЕРЬ АККАУНТ':{l:'ПРОВЕРЬ',c:'#f5a623'},
          'ПРОВЕРЬ':{l:'ПРОВЕРЬ',c:'#f5a623'},
          'НЕТ СВЯЗИ':{l:'НЕТ СВЯЗИ',c:'#f05555'},
        }
        const info = TS[a.tech_status]
        const frozen = FROZEN.includes(a.status)
        const hasMetrics = mt.today_cost>0 || mt.clicks>0
        const note = a.tech_note || ''
        const isRatio = /^\d+\/\d+$/.test(note)         // "2/5" у Крутит
        const maybeBan = a.tech_status==='НЕТ СВЯЗИ' && (mt.today_cost>0 || mt.yest_cost>0)
        return (
          <span className="cell-sm" style={{color:info?info.c:'var(--t3)',fontFamily:'JetBrains Mono'}}
                title={note && !isRatio ? note : undefined}>
            {info?info.l:(a.tech_status||'—')}
            {note && isRatio && <span style={{opacity:.8}}> {note}</span>}
            {note && !isRatio && <span style={{opacity:.8,fontSize:10}}> ({note.length>22?note.slice(0,22)+'…':note})</span>}
            {maybeBan && <span className="ban-chip" title="Тратил и замолчал — возможно бан, проверь аккаунт">возможно бан</span>}
            {frozen && hasMetrics && <span title="Метрики приходят на замороженный аккаунт"> ⚠️</span>}
          </span>
        )
      }
      case 'geo': return <span className="cell-sm">{a.geo||'—'}</span>
      case 'funnel': return <span className="cell-sm">{a.funnel||'—'}</span>
      case 'creo': return <span className="cell-sm">{a.creo||'—'}</span>
      case 'format': return <span className="cell-sm">{a.format||'—'}</span>
      case 'card': return <span className="cell-sm">{a.card||'—'}</span>
      case 'zalivshik': return <span className="cell-sm">{a.zalivshik||'—'}</span>
      case 'launch_date': return <span className="cell-sm">{a.launch_date||'—'}</span>
      case 'crut_date': return <span className="cell-sm">{a.crut_date||'—'}</span>
      case 'ban_date': return <span className="cell-sm">{a.ban_date||'—'}</span>
      case 'last_seen': {
        if (!a.last_seen_at) return <span className="cell-sm muted">—</span>
        const d = new Date(a.last_seen_at)
        let txt
        try {
          txt = d.toLocaleString('ru', { timeZone: userTz || undefined, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        } catch {
          txt = d.toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        }
        const stale = (Date.now() - d.getTime()) > 2*3600*1000
        return <span className="cell-sm" style={{color:stale?'#f5a623':'var(--t2)',fontFamily:'JetBrains Mono'}} title={userTz?`по поясу ${userTz}`:undefined}>{txt}</span>
      }
      case 'google_tag': return <span className="cell-sm muted">{a.google_tag||'—'}</span>
      case 'today_cost': return <span style={{color:mt.today_cost>0?'#22d17a':'var(--t3)',fontWeight:mt.today_cost>0?500:400}}>{money(mt.today_cost)}</span>
      case 'yest_cost': return <span style={{color:mt.yest_cost>0?'var(--t2)':'var(--t3)'}}>{money(mt.yest_cost)}</span>
      case 'clicks': return <span style={{color:mt.clicks>0?'var(--t)':'var(--t3)'}}>{mt.clicks||'—'}</span>
      case 'conv': return <span style={{color:mt.conv>0?'#f5a623':'var(--t3)'}}>{mt.conv||'—'}</span>
      case 'cpa': return <span style={{color: marks?.cellColor?.cpa || (mt.cpa>0?'#22d17a':'var(--t3)')}}>{money(mt.cpa)}</span>
      case 'dis': return a.dis_reason ? (
        <div>
          <div className="cell-sm" style={{color:'#f5a623'}}>{a.dis_date||''}</div>
          <div className="cell-sm muted" style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis'}}>{a.dis_reason}</div>
        </div>
      ) : <span className="cell-sm muted">—</span>
      case 'comment': return <span className="cell-sm muted">{a.comment||'—'}</span>
      default: return null
    }
  }

  // Какие id сейчас «в воздухе» при drag: пачка, если хват за отмеченную; иначе одна строка.
  const dragFromIds = rowDrag
    ? (selectedIds.includes(rowDrag) ? selectedIds : [rowDrag])
    : []
  const draggedSet = new Set(dragFromIds)

  function renderRow(a) {
    const mt = metricsOf(a, metricsSummary)
    const marks = ruleHits(a)
    const rOver = rowOver && rowOver.id===a.id
    const trStyle = {
      opacity: draggedSet.has(a.id) ? 0.4 : undefined,   // вся пачка в полупрозрачности при групповом drag
      boxShadow: rOver
        ? (rowOver.side==='top' ? 'inset 0 2px 0 var(--acc)' : 'inset 0 -2px 0 var(--acc)')
        : (marks.stripe ? `inset 3px 0 0 ${marks.stripe}` : undefined),
    }
    return (
      <tr key={a.id} id={'row-'+a.id} className={`${a.is_frozen?'frozen-row':''}${activeId===a.id?' active-row':''}`} style={trStyle}
          onClick={()=>{ if(rowDrag||editCell) return; setActiveId(a.id); clearTimeout(openTimer.current); openTimer.current=setTimeout(()=>openDrawer(a),180) }}
          onDragOver={rowDrag ? (e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect();const side=(e.clientY-r.top)<r.height/2?'top':'bottom';if(!rowOver||rowOver.id!==a.id||rowOver.side!==side)setRowOver({id:a.id,side})}) : undefined}
          onDrop={rowDrag ? (e=>{e.preventDefault();dropRow(a.id)}) : undefined}>
        <td className="chk-td"
            onClick={e => { e.stopPropagation(); handleSelectClick(e, a.id) }}>
          {/* input — только визуал; всё взаимодействие на <td>, иначе native click checkbox
              + preventDefault даёт состояние гонки между нативным change и React state */}
          <input type="checkbox" checked={selectedIds.includes(a.id)} readOnly tabIndex={-1}/>
        </td>
        {visibleCols.map(c=>{
          const isStatus = c.key==='status'
          const cfg = EDITABLE[c.key]
          const editing = editCell && editCell.id===a.id && editCell.key===c.key
          return (
            <td key={c.key} className={c.align==='r'?'r':undefined}
                onClick={isStatus ? (e=>{e.stopPropagation();setStatusPopup({id:a.id,x:e.clientX,y:e.clientY})}) : undefined}
                onDoubleClick={cfg && !isStatus ? (e=>{e.stopPropagation();clearTimeout(openTimer.current);startEdit(a,c.key)}) : undefined}>
              {editing ? (
                cfg.t==='select' ? (
                  <select autoFocus className="cell-edit" value={editVal}
                          onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')cancelEdit()}}
                          onClick={e=>e.stopPropagation()}>
                    {cfg.opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input autoFocus className="cell-edit" type={cfg.t==='date'?'date':'text'} value={editVal}
                         list={cfg.t==='combo'?`dl-${c.key}`:undefined}
                         onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                         onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape'){e.preventDefault();cancelEdit()}}}
                         onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}/>
                )
              ) : cellContent(c.key, a, mt, marks)}
            </td>
          )
        })}
      </tr>
    )
  }

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
        .srch-hint{position:absolute;top:calc(100% + 3px);left:0;font-size:10px;color:var(--acc);background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:2px 7px;white-space:nowrap;z-index:30;max-width:320px;overflow:hidden;text-overflow:ellipsis}
        .name-cell{display:flex;align-items:center;gap:6px}
        .row-handle{opacity:0;cursor:grab;color:var(--t3);font-size:13px;flex-shrink:0;user-select:none;line-height:1}
        .row-handle:hover{color:var(--acc)}
        .row-handle:active{cursor:grabbing}
        tbody tr:hover .row-handle{opacity:1}
        .copy-btn{opacity:0;background:var(--s3);border:1px solid var(--bd);border-radius:4px;color:var(--t2);cursor:pointer;font-size:12px;padding:1px 6px;flex-shrink:0;transition:opacity .1s}
        .copy-btn:hover{color:var(--acc);border-color:var(--acc)}
        tbody tr:hover .copy-btn{opacity:1}
        .tb-stats{display:flex;gap:14px;margin-left:auto}
        .tbs{font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace;white-space:nowrap}
        .tbs b{color:var(--t);font-weight:500}
        .tbs.g b{color:#22d17a}.tbs.r b{color:#f05555}.tbs.a b{color:#f5a623}
        .tb-acts{display:flex;gap:5px;align-items:center}
        .btn{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--t2);cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;outline:none;transition:all .1s}
        .btn:hover{background:var(--s3);color:var(--t)}
        .btn.act{background:rgba(91,110,245,.12);border-color:rgba(91,110,245,.3);color:var(--acc)}
        .btn-acc{background:var(--acc2);border-color:var(--acc);color:#fff;font-weight:500}
        .btn-acc:hover{background:var(--acc);color:#fff}
        .badge-cnt{background:var(--acc);color:#fff;border-radius:8px;font-size:9px;padding:0 5px;margin-left:2px}
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
        .toolbar{display:flex;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid var(--bd);flex-shrink:0;background:var(--s1);flex-wrap:wrap}
        .ssel{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 7px;font-size:11px;color:var(--t2);outline:none;cursor:pointer;font-family:'Inter',sans-serif}
        .filters-panel{padding:10px 14px;border-bottom:1px solid var(--bd);background:var(--s1);display:flex;flex-direction:column;gap:8px;flex-shrink:0;max-height:42vh;overflow-y:auto}
        .dash{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--bd);background:var(--s1);flex-shrink:0}
        .dash-toggle{background:var(--s2);border:1px solid var(--bd);border-radius:4px;color:var(--t2);cursor:pointer;font-size:12px;padding:2px 7px;flex-shrink:0}
        .dash-toggle:hover{color:var(--t)}
        .dash-cards{display:flex;gap:8px;flex-wrap:wrap;flex:1}
        .dcard{background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:5px 12px;min-width:90px;cursor:pointer;transition:all .1s}
        .dcard:hover:not(.no-click){border-color:var(--bd2)}
        .dcard.act{border-color:var(--acc);background:rgba(91,110,245,.1)}
        .dcard.no-click{cursor:default}
        .dc-l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
        .dc-v{font-size:16px;font-weight:500;font-family:'JetBrains Mono',monospace;color:var(--t);margin-top:1px}
        .dc-sub{font-size:10px;color:var(--t3);font-weight:400}
        .dash-mini{font-size:12px;color:var(--t2);font-family:'JetBrains Mono',monospace}
        .dash-mini b{color:var(--t);font-weight:500}
        .bulkbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 14px;border-bottom:1px solid var(--bd);background:rgba(91,110,245,.08);flex-shrink:0}
        .bb-count{font-size:12px;color:var(--t)}
        .bb-count b{color:var(--acc)}
        .bb-sep{width:1px;height:18px;background:var(--bd2)}
        .bb-inp{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 7px;font-size:11px;color:var(--t);outline:none;width:100px;font-family:'Inter',sans-serif}
        .bb-inp:focus{border-color:var(--acc)}
        .chk-th,.chk-td{text-align:center;padding:0 4px!important;cursor:pointer}
        .chk-th input,.chk-td input{cursor:pointer;pointer-events:none}
        .fp-row{display:flex;align-items:flex-start;gap:8px}
        .fp-lbl{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;width:80px;flex-shrink:0;padding-top:4px}
        .chips{display:flex;flex-wrap:wrap;gap:4px}
        .chip{font-size:11px;padding:2px 9px;border-radius:11px;border:1px solid var(--bd);background:var(--s2);color:var(--t2);cursor:pointer;user-select:none;transition:all .1s}
        .chip:hover{border-color:var(--bd2);color:var(--t)}
        .chip.act{background:rgba(91,110,245,.15);border-color:var(--acc);color:var(--acc)}
        .date-inp{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:3px 6px;font-size:11px;color:var(--t);outline:none;font-family:'Inter',sans-serif}
        .tbl-wrap{flex:1;overflow:auto}
        table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;table-layout:fixed}
        .col-resize{position:absolute;top:0;right:0;width:6px;height:100%;cursor:col-resize;user-select:none}
        .col-resize:hover{background:var(--acc)}
        thead th{position:sticky;top:0;background:var(--s2);padding:7px 9px;text-align:left;font-size:10px;color:var(--t3);font-weight:500;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--bd);white-space:nowrap;z-index:20;cursor:grab;user-select:none}
        thead th:hover{color:var(--t)}
        thead th:active{cursor:grabbing}
        thead th.r{text-align:right}
        thead th .arr{color:var(--acc);margin-left:3px}
        tbody tr{cursor:pointer;transition:background .07s}
        tbody tr:hover td{background:var(--s2)}
        .tbl-wrap tbody td{border-bottom:1px solid var(--bd)}
        td{padding:6px 9px;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
        /* Внутри инлайн-редактирования текст должен выделяться нормально */
        .tbl-wrap tbody input,.tbl-wrap tbody textarea,.tbl-wrap tbody select,.cell-edit{user-select:text}
        td.r{text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px}
        .acc-name{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:12px;color:var(--t)}
        .acc-sub{font-size:10px;color:var(--t3);margin-top:1px}
        .badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:500;font-family:'JetBrains Mono',monospace;cursor:pointer;white-space:nowrap}
        .badge-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .cell-sm{font-size:11px;color:var(--t2);max-width:120px;overflow:hidden;text-overflow:ellipsis;display:inline-block}
        .cell-edit{width:100%;background:var(--s1);border:1px solid var(--acc);border-radius:4px;padding:3px 6px;color:var(--t);font-size:12px;font-family:'Inter',sans-serif;outline:none}
        .ban-chip{margin-left:6px;background:rgba(240,85,85,.15);border:1px solid rgba(240,85,85,.4);color:#f05555;font-size:9px;padding:1px 6px;border-radius:8px;font-family:'Inter',sans-serif;white-space:nowrap}
        .camp-list{display:flex;flex-direction:column;gap:2px;margin-bottom:4px}
        .camp-row{display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--s2);border:1px solid var(--bd);border-radius:5px;font-size:12px}
        .camp-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .camp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t);font-family:'JetBrains Mono',monospace;font-size:11px}
        .camp-st{font-size:11px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
        .camp-cost{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--t2);min-width:54px;text-align:right}
        .cell-sm.muted{color:var(--t3)}
        .frozen-row td{opacity:.6}
        tbody tr.active-row td{background:rgba(91,110,245,.12)}
        .app.compact td{padding:2px 8px}
        .app.compact thead th{padding:4px 8px}
        .app.compact .acc-sub{display:none}
        .app.compact td{font-size:11px}
        .hk-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
        .hk-row{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--t2)}
        .hk-row kbd{font-family:'JetBrains Mono',monospace;font-size:11px;background:var(--s2);border:1px solid var(--bd2);border-radius:4px;padding:2px 8px;color:var(--t);min-width:96px;text-align:center}
        .hk-note{font-size:11px;color:var(--t3);line-height:1.5}
        .group-row{cursor:pointer;background:var(--s2)}
        .tbl-wrap tbody .group-row td{padding:6px 10px!important;border-bottom:1px solid var(--bd2)}
        .group-row:hover td{background:var(--s3)}
        .grp-tog{display:inline-block;width:14px;color:var(--t3)}
        .group-row b{color:var(--t);font-size:12px}
        .grp-cnt{margin-left:8px;font-family:'JetBrains Mono',monospace;font-size:10px;background:var(--s3);padding:1px 6px;border-radius:8px;color:var(--t3)}
        .grp-sum{margin-left:12px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#22d17a}
        .pager{display:flex;align-items:center;gap:6px;margin-left:auto;font-size:11px;color:var(--t3)}
        .pager button{background:var(--s2);border:1px solid var(--bd);border-radius:4px;padding:2px 8px;color:var(--t2);cursor:pointer;font-size:11px}
        .pager button:disabled{opacity:.4;cursor:default}
        .panel-overlay{position:fixed;inset:0;z-index:410}
        .cols-panel{position:absolute;top:42px;right:14px;width:230px;background:var(--s1);border:1px solid var(--bd2);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.4);z-index:420;padding:8px;max-height:70vh;overflow-y:auto}
        .cp-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;padding:4px 6px 8px}
        .cp-reset{font-size:10px;color:var(--acc);cursor:pointer;background:none;border:none}
        .col-item{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;cursor:grab;font-size:12px;color:var(--t2)}
        .col-item:hover{background:var(--s2)}
        .col-item.drag{opacity:.4}
        .col-item label{display:flex;align-items:center;gap:6px;cursor:pointer;flex:1}
        .drag-handle{color:var(--t3);font-size:11px;cursor:grab}
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
        .modal-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--bd)}
        .status-popup{position:fixed;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:5px;z-index:400;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:60vh;overflow-y:auto}
        .sp-item{display:flex;align-items:center;gap:7px;padding:5px 10px;font-size:12px;color:var(--t2);cursor:pointer;border-radius:3px}
        .sp-item:hover{background:var(--s3);color:var(--t)}
        .overlay{position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;gap:14px}
        .spin{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .drag-badge{position:fixed;top:60px;left:50%;transform:translateX(-50%);background:var(--acc2);border:1px solid var(--acc);color:#fff;border-radius:14px;padding:5px 14px;font-size:12px;font-weight:500;z-index:650;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.3);font-family:'Inter',sans-serif}
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:8px 16px;font-size:12px;color:var(--t);opacity:0;transition:all .2s;z-index:600;pointer-events:none;white-space:nowrap}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
        .toast-btn{margin-left:10px;background:var(--acc2);border:1px solid var(--acc);border-radius:4px;color:#fff;font-size:11px;padding:2px 9px;cursor:pointer;font-family:'Inter',sans-serif}
        .toast-btn:hover{background:var(--acc)}
        .btn-del{background:rgba(240,85,85,.1);border-color:rgba(240,85,85,.3);color:#f05555}
        .btn-del:hover{background:rgba(240,85,85,.2)}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
      `}</style>

      {loading && <div className="overlay"><div className="spin"></div><div style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--t3)'}}>Загрузка...</div></div>}

      <div className={`app${density==='compact'?' compact':''}`}>
        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo">Залив<em>CRM</em><span className="live">● live</span></div>
          <div className="sep"/>
          <Link href="/" style={{fontSize:12,color:'var(--acc)',fontWeight:500,textDecoration:'none',padding:'4px 10px',background:'rgba(91,110,245,.1)',borderRadius:4}}>Аккаунты</Link>
          <Link href="/stats" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>📊 Статистика</Link>
          <Link href="/proxy" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>🌐 Прокси</Link>
          <Link href="/urls" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>🔗 URL / CLO</Link>
          <Link href="/heavy" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>💪 Heavy</Link>
          <Link href="/archive" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>🗄 Архив</Link>
          <Link href="/settings" style={{fontSize:12,color:"var(--t3)",textDecoration:"none",padding:"4px 10px",borderRadius:4}}>⚙️ Настройки</Link>
          <div className="sep"/>
          <div className="srch">
            <span className="srch-ic">⌕</span>
            <input ref={searchRef} placeholder="Поиск по всем полям...  ( / )" value={search} onChange={e=>setSearch(e.target.value)}/>
            {search && (
              <div className="srch-hint">
                {matchedFields.length ? `найдено по: ${matchedFields.join(', ')}` : 'ничего не найдено'}
              </div>
            )}
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
            <button className="btn" onClick={cycleTheme} title={`Тема: ${theme==='light'?'светлая':theme==='dark'?'тёмная':'системная'}`}>{theme==='light'?'☀️':theme==='dark'?'🌙':'🖥'}</button>
            <button className="btn" onClick={toggleDensity} title={`Плотность: ${density==='compact'?'компактная':'обычная'}`}>{density==='compact'?'≣':'≡'}</button>
            <button className="btn" onClick={()=>setShowHelp(true)} title="Горячие клавиши (?)">⌨</button>
            <button className="btn" onClick={()=>setShowBulk(true)}>📋 Массовое</button>
            <button className="btn btn-acc" onClick={()=>setShowAdd(true)}>+ Аккаунт</button>
            <div className="sep"/>
            {user && <span style={{fontSize:11,color:'var(--t2)',whiteSpace:'nowrap'}}>{user.user_metadata?.name || user.email}</span>}
            <button className="btn" onClick={signOut}>Выйти</button>
          </div>
        </div>

        <div className="body">
          {/* SIDEBAR */}
          <div className="sidebar">
            <div className="sb-sec">
              <div className="sb-lbl">Статус</div>
              <div className={`sbi${statusSel.length===0?' act':''}`} onClick={()=>setStatusSel([])}>
                <span className="sb-dot" style={{background:'var(--t3)'}}/>Все<span className="sb-cnt">{totalAccounts}</span>
              </div>
              {STATUSES.filter(st=>statusGroups[st]>0).map(st=>(
                <div key={st} className={`sbi${statusSel.includes(st)?' act':''}`} onClick={()=>toggleArr(st,statusSel,setStatusSel)}>
                  <span className="sb-dot" style={{background:STATUS_COLOR[st]||'#6b7280'}}/>
                  {st}<span className="sb-cnt">{statusGroups[st]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MAIN */}
          <div className="main" style={{position:'relative'}}>
            <div className="toolbar">
              <button className={`btn${showFilters?' act':''}`} onClick={()=>setShowFilters(v=>!v)}>
                ⚲ Фильтры{activeFilterCount>0 && <span className="badge-cnt">{activeFilterCount}</span>}
              </button>
              <button className="btn" onClick={()=>setShowCols(true)}>⚙️ Колонки</button>
              <select className="ssel" value={groupBy} onChange={e=>{setGroupBy(e.target.value);setCollapsedGroups([])}} title="Группировка">
                <option value="none">Группы: нет</option>
                <option value="geo">по гео</option>
                <option value="zalivshik">по заливщику</option>
                <option value="category">по категории</option>
              </select>
              <span style={{fontSize:11,color:'var(--t3)',marginLeft:6}}>{filtered.length} акк.</span>
              <div className="pager">
                {groupBy !== 'none' ? (
                  <span style={{color:'var(--t3)'}}>группировка — показаны все</span>
                ) : (
                  <>
                    <span>На странице:</span>
                    <select className="ssel" value={pageSize} onChange={e=>setPageSize(e.target.value==='all'?'all':+e.target.value)}>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value="all">Все</option>
                    </select>
                    {pageSize!=='all' && (
                      <>
                        <button disabled={curPage<=1} onClick={()=>setPage(curPage-1)}>← Назад</button>
                        <span>Стр. {curPage} из {totalPages}</span>
                        <button disabled={curPage>=totalPages} onClick={()=>setPage(curPage+1)}>Вперёд →</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* FILTERS PANEL */}
            {showFilters && (
              <div className="filters-panel">
                <div className="fp-row">
                  <span className="fp-lbl">Статус</span>
                  <div className="chips">
                    {STATUSES.map(st=>(
                      <span key={st} className={`chip${statusSel.includes(st)?' act':''}`} onClick={()=>toggleArr(st,statusSel,setStatusSel)}>{st}</span>
                    ))}
                  </div>
                </div>
                {geoOptions.length>0 && (
                  <div className="fp-row">
                    <span className="fp-lbl">Гео</span>
                    <div className="chips">
                      {geoOptions.map(g=>(
                        <span key={g} className={`chip${geoSel.includes(g)?' act':''}`} onClick={()=>toggleArr(g,geoSel,setGeoSel)}>{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {zalivOptions.length>0 && (
                  <div className="fp-row">
                    <span className="fp-lbl">Заливщик</span>
                    <div className="chips">
                      {zalivOptions.map(z=>(
                        <span key={z} className={`chip${zalivSel.includes(z)?' act':''}`} onClick={()=>toggleArr(z,zalivSel,setZalivSel)}>{z}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="fp-row">
                  <span className="fp-lbl">Группа</span>
                  <div className="chips">
                    {GROUPS.map(g=>(
                      <span key={g} className={`chip${groupSel.includes(g)?' act':''}`} onClick={()=>toggleArr(g,groupSel,setGroupSel)}>{g}</span>
                    ))}
                  </div>
                </div>
                {funnelOptions.length>0 && (
                  <div className="fp-row">
                    <span className="fp-lbl">Воронка</span>
                    <div className="chips">
                      {funnelOptions.map(f=>(
                        <span key={f} className={`chip${funnelSel.includes(f)?' act':''}`} onClick={()=>toggleArr(f,funnelSel,setFunnelSel)}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="fp-row">
                  <span className="fp-lbl">Формат</span>
                  <div className="chips">
                    {[{k:'all',l:'Все'},{k:'Фото',l:'Фото'},{k:'Видео',l:'Видео'}].map(f=>(
                      <span key={f.k} className={`chip${formatSel===f.k?' act':''}`} onClick={()=>setFormatSel(f.k)}>{f.l}</span>
                    ))}
                  </div>
                </div>
                <div className="fp-row">
                  <span className="fp-lbl">Дата пуска</span>
                  <div className="chips" style={{alignItems:'center'}}>
                    <input type="date" className="date-inp" value={launchFrom} onChange={e=>setLaunchFrom(e.target.value)}/>
                    <span style={{color:'var(--t3)',fontSize:11}}>—</span>
                    <input type="date" className="date-inp" value={launchTo} onChange={e=>setLaunchTo(e.target.value)}/>
                  </div>
                </div>
                <div className="fp-row">
                  <span className="fp-lbl"></span>
                  <button className="btn" onClick={resetFilters}>✕ Сбросить всё</button>
                </div>
              </div>
            )}

            {/* СВОДНАЯ ПАНЕЛЬ */}
            <div className="dash">
              <button className="dash-toggle" onClick={()=>setPanelOpen(v=>!v)} title={panelOpen?'Свернуть':'Развернуть'}>{panelOpen?'▾':'▸'}</button>
              {panelOpen ? (
                <div className="dash-cards">
                  <div className={`dcard${catFilter===null?' act':''}`} onClick={()=>setCatFilter(null)}>
                    <div className="dc-l">Всего</div>
                    <div className="dc-v">{panel.total}<span className="dc-sub"> из {totalAccounts}</span></div>
                  </div>
                  <div className={`dcard${catFilter==='active'?' act':''}`} onClick={()=>setCatFilter(c=>c==='active'?null:'active')}>
                    <div className="dc-l">Актив</div><div className="dc-v" style={{color:'#22d17a'}}>{panel.active}</div>
                  </div>
                  <div className={`dcard${catFilter==='problem'?' act':''}`} onClick={()=>setCatFilter(c=>c==='problem'?null:'problem')}>
                    <div className="dc-l">Проблема</div><div className="dc-v" style={{color:'#f5a623'}}>{panel.problem}</div>
                  </div>
                  <div className={`dcard${catFilter==='terminal'?' act':''}`} onClick={()=>setCatFilter(c=>c==='terminal'?null:'terminal')}>
                    <div className="dc-l">Терминал</div><div className="dc-v" style={{color:'#f05555'}}>{panel.terminal}</div>
                  </div>
                  <div className={`dcard${catFilter==='no_signal'?' act':''}`} onClick={()=>setCatFilter(c=>c==='no_signal'?null:'no_signal')}>
                    <div className="dc-l">НЕТ СВЯЗИ</div><div className="dc-v" style={{color:panel.noSignal>0?'#f05555':'var(--t3)'}}>{panel.noSignal}</div>
                  </div>
                  <div className="dcard no-click">
                    <div className="dc-l">Спенд сегодня</div><div className="dc-v" style={{color:'#22d17a'}}>{panel.spendToday>0?'$'+Math.round(panel.spendToday).toLocaleString('ru'):'—'}</div>
                  </div>
                  <div className="dcard no-click">
                    <div className="dc-l">Спенд вчера</div><div className="dc-v">{panel.spendYest>0?'$'+Math.round(panel.spendYest).toLocaleString('ru'):'—'}</div>
                  </div>
                </div>
              ) : (
                <div className="dash-mini">
                  Всего <b>{panel.total}</b> · <span style={{color:'#22d17a'}}>{panel.active}</span> · <span style={{color:'#f5a623'}}>{panel.problem}</span> · <span style={{color:'#f05555'}}>{panel.terminal}</span> · НЕТ СВЯЗИ <b style={{color:panel.noSignal>0?'#f05555':'inherit'}}>{panel.noSignal}</b> · сегодня <b style={{color:'#22d17a'}}>{panel.spendToday>0?'$'+Math.round(panel.spendToday).toLocaleString('ru'):'—'}</b>
                </div>
              )}
            </div>

            {/* ПАНЕЛЬ МАССОВЫХ ДЕЙСТВИЙ */}
            {selectedIds.length > 0 && (
              <div className="bulkbar">
                <span className="bb-count">Выбрано <b>{selectedIds.length}</b>{selectedIds.length===filtered.length?' (все по фильтру)':''}</span>
                {selectedIds.length < filtered.length && (
                  <button className="btn" onClick={()=>selectAllFiltered(filtered.map(a=>a.id))}>Выделить все по фильтру ({filtered.length})</button>
                )}
                <div className="bb-sep"/>
                <select className="ssel" value="" onChange={e=>{ const v=e.target.value; if(v==='__none__'){ bulkUpdate({status:null},{label:'Статус снят'}); } else if(v){ bulkUpdate({status:v},{label:'Статус → '+v}); } }}>
                  <option value="">Статус всем…</option>
                  <option value="__none__">— без статуса —</option>
                  {STATUSES.map(st=><option key={st} value={st}>{st}</option>)}
                </select>
                <input className="bb-inp" placeholder="Заливщик…" value={bulkBar.zalivshik} onChange={e=>setBulkBar({...bulkBar,zalivshik:e.target.value})}
                       onKeyDown={e=>{if(e.key==='Enter'&&bulkBar.zalivshik.trim()){bulkUpdate({zalivshik:bulkBar.zalivshik.trim()},{label:'Заливщик обновлён'});setBulkBar({...bulkBar,zalivshik:''})}}}/>
                <input className="bb-inp" placeholder="Гео…" value={bulkBar.geo} onChange={e=>setBulkBar({...bulkBar,geo:e.target.value})}
                       onKeyDown={e=>{if(e.key==='Enter'&&bulkBar.geo.trim()){bulkUpdate({geo:bulkBar.geo.trim()},{label:'Гео обновлено'});setBulkBar({...bulkBar,geo:''})}}}/>
                <div className="bb-sep"/>
                <button className="btn" onClick={()=>copyField('name','названия',null)}>⎘ Названия</button>
                <button className="btn" onClick={()=>copyField('google_ads_id','Google Ads ID',null)}>⎘ ID</button>
                <select className="ssel" value="" onChange={e=>{
                  const v = e.target.value; if (!v) return
                  if (v === 'link')        copyField('link','White ссылки',null)
                  else if (v === 'black')  copyField('black','Black UTM',null)
                  else if (v === 'tag')    copyField('google_tag','Google Tag',null)
                  else if (v === 'clo')    copyField('clo_url','CLO',null)
                  else if (v === 'all')    copyPack(null)
                  e.target.value = ''
                }} title="Скопировать другое поле">
                  <option value="">⎘ Ещё…</option>
                  <option value="link">White ссылки</option>
                  <option value="black">Black UTM</option>
                  <option value="tag">Google Tag</option>
                  <option value="clo">CLO</option>
                  <option value="all">Всё (таблица для Sheets)</option>
                </select>
                <button className="btn" onClick={()=>exportCSV(visibleCols)}>⬇ CSV</button>
                <div className="bb-sep"/>
                <button className="btn btn-del" onClick={bulkArchive}>🗄 В архив</button>
                <button className="btn" style={{marginLeft:'auto'}} onClick={clearSelection}>✕ Снять</button>
              </div>
            )}

            <div className="tbl-wrap">
              {filtered.length === 0 && !loading ? (
                accounts.length === 0 ? (
                  <div style={{maxWidth:460,margin:'48px auto',padding:'0 20px'}}>
                    <div style={{fontSize:16,color:'var(--t)',fontWeight:600,marginBottom:4,textAlign:'center'}}>Добро пожаловать в ЗаливCRM 👋</div>
                    <div style={{fontSize:12,color:'var(--t3)',textAlign:'center',marginBottom:20}}>Три шага, чтобы начать</div>
                    <div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid var(--bd)'}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(91,110,245,.15)',color:'var(--acc)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontFamily:'JetBrains Mono',flexShrink:0}}>1</div>
                      <div>
                        <div style={{fontSize:13,color:'var(--t)',fontWeight:500,marginBottom:3}}>Добавь первый аккаунт</div>
                        <div style={{fontSize:12,color:'var(--t3)',lineHeight:1.5}}>Нажми кнопку ниже или загрузи список через «📋 Массовое».</div>
                        <button className="btn btn-acc" style={{marginTop:8}} onClick={()=>setShowAdd(true)}>+ Аккаунт</button>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid var(--bd)'}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(91,110,245,.15)',color:'var(--acc)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontFamily:'JetBrains Mono',flexShrink:0}}>2</div>
                      <div>
                        <div style={{fontSize:13,color:'var(--t)',fontWeight:500,marginBottom:3}}>Установи скрипт мониторинга</div>
                        <div style={{fontSize:12,color:'var(--t3)',lineHeight:1.5}}>Вставь monitoring_script.js в Google Ads → Tools → Scripts со своим API-ключом. <a href="https://github.com/s83517769-sys/zalivcrm#readme" target="_blank" rel="noreferrer" style={{color:'var(--acc)',textDecoration:'none'}}>Инструкция →</a></div>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 0'}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(91,110,245,.15)',color:'var(--acc)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontFamily:'JetBrains Mono',flexShrink:0}}>3</div>
                      <div>
                        <div style={{fontSize:13,color:'var(--t)',fontWeight:500,marginBottom:3}}>Готово!</div>
                        <div style={{fontSize:12,color:'var(--t3)',lineHeight:1.5}}>Данные начнут появляться автоматически каждый час.</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{padding:'60px',textAlign:'center',color:'var(--t3)',lineHeight:2}}>
                    <div style={{fontSize:14,color:'var(--t)',marginBottom:8}}>Ничего не найдено</div>
                    <div>Измени фильтры или нажми <b style={{color:'var(--acc)'}}>+ Аккаунт</b></div>
                  </div>
                )
              ) : (
                <table>
                  <thead><tr>
                    <th className="chk-th" style={{width:32}}
                        onClick={e=>{e.stopPropagation(); toggleSelectPage(displayed.map(a=>a.id))}}>
                      <input type="checkbox" readOnly tabIndex={-1}
                             checked={displayed.length>0 && displayed.every(a=>selectedIds.includes(a.id))}
                             ref={el=>{ if(el){ const some=displayed.some(a=>selectedIds.includes(a.id)); const all=displayed.length>0&&displayed.every(a=>selectedIds.includes(a.id)); el.indeterminate=some&&!all } }}/>
                    </th>
                    {visibleCols.map(c=>{
                      const over = thOver && thOver.key===c.key
                      const thStyle = {
                        width:colW(c), minWidth:colW(c), maxWidth:colW(c),
                        opacity: thDrag===c.key ? 0.5 : 1,
                        boxShadow: over ? (thOver.side==='left' ? 'inset 2px 0 0 var(--acc)' : 'inset -2px 0 0 var(--acc)') : undefined,
                        // НЕ задаём position инлайном — иначе перебивает CSS `thead th{position:sticky}`.
                        // sticky-th сам по себе создаёт positioning context для .col-resize (так же, как relative).
                      }
                      return (
                        <th key={c.key} style={thStyle} className={c.align==='r'?'r':undefined}
                            draggable
                            onClick={()=>{ if(resizingRef.current) return; toggleSort(c.key) }}
                            onDragStart={e=>{ if(resizingRef.current){e.preventDefault();return} setThDrag(c.key) }}
                            onDragEnd={()=>{setThDrag(null);setThOver(null)}}
                            onDragOver={e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect();const side=(e.clientX-r.left)<r.width/2?'left':'right';if(!thOver||thOver.key!==c.key||thOver.side!==side)setThOver({key:c.key,side})}}
                            onDrop={e=>{e.preventDefault();dropTh(c.key)}}>
                          {c.label}
                          {sort.key===c.key && <span className="arr">{sort.dir==='asc'?'↑':'↓'}</span>}
                          <span className="col-resize" onMouseDown={e=>startResize(e,c)} onClick={e=>e.stopPropagation()} draggable={false} title="Изменить ширину"/>
                        </th>
                      )
                    })}
                  </tr></thead>
                  <tbody>
                    {groupBy === 'none'
                      ? pageRows.map(renderRow)
                      : groupList.map(([key, rows]) => {
                          const collapsed = collapsedGroups.includes(key)
                          return (
                            <Fragment key={key}>
                              <tr className="group-row" onClick={()=>toggleGroup(key)}>
                                <td colSpan={visibleCols.length+1}>
                                  <span className="grp-tog">{collapsed?'▸':'▾'}</span>
                                  <b>{key}</b>
                                  <span className="grp-cnt">{rows.length}</span>
                                  <span className="grp-sum">спенд ${Math.round(groupSpend(rows)).toLocaleString('ru')}</span>
                                </td>
                              </tr>
                              {!collapsed && rows.map(renderRow)}
                            </Fragment>
                          )
                        })}
                  </tbody>
                </table>
              )}
            </div>

            {/* COLUMNS PANEL */}
            {showCols && (
              <>
                <div className="panel-overlay" onClick={()=>setShowCols(false)}/>
                <div className="cols-panel">
                  <div className="cp-head">
                    <span>Колонки</span>
                    <button className="cp-reset" onClick={resetCols}>Сбросить</button>
                  </div>
                  {colOrder.map((k,i)=>{
                    const c = COLMAP[k]; if(!c) return null
                    return (
                      <div key={k} className={`col-item${dragIdx===i?' drag':''}`}
                           draggable
                           onDragStart={()=>setDragIdx(i)}
                           onDragOver={e=>e.preventDefault()}
                           onDrop={()=>moveCol(dragIdx,i)}>
                        <span className="drag-handle">⋮⋮</span>
                        <label>
                          <input type="checkbox" checked={!!colVisible[k]} onChange={()=>setColVisible({...colVisible,[k]:!colVisible[k]})}/>
                          {c.label}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* STATUS POPUP */}
      {statusPopup && (
        <div style={{position:'fixed',inset:0,zIndex:399}} onClick={()=>setStatusPopup(null)}>
          <div className="status-popup" style={{left:Math.min(statusPopup.x,window.innerWidth-190),top:Math.min(statusPopup.y+4,window.innerHeight-300)}}>
            <div className="sp-item" onClick={e=>{e.stopPropagation();quickStatus(statusPopup.id,'')}} style={{color:'var(--t3)'}}>
              <span style={{width:7,height:7,borderRadius:'50%',border:'1px solid var(--t3)',display:'inline-block',flexShrink:0}}/>
              — без статуса —
            </div>
            {STATUSES.map(st=>(
              <div key={st} className="sp-item" onClick={e=>{e.stopPropagation();quickStatus(statusPopup.id,st)}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:STATUS_COLOR[st]||'#6b7280',display:'inline-block',flexShrink:0}}/>
                {st}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COPY POPUP */}
      {copyPopup && (() => {
        const a = accounts.find(x => x.id === copyPopup.id) || {}
        // Если строка отмечена — копируем по всем выделенным; иначе по одной.
        const bulk = selectedIds.includes(a.id) && selectedIds.length > 1
        const N = bulk ? selectedIds.length : 1
        const suffix = bulk ? ` (${N})` : ''
        return (
          <div style={{position:'fixed',inset:0,zIndex:399}} onClick={()=>setCopyPopup(null)}>
            <div className="status-popup" style={{left:Math.min(copyPopup.x,window.innerWidth-220),top:Math.min(copyPopup.y+4,window.innerHeight-320)}}>
              {bulk && <div style={{padding:'4px 10px 6px',fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{N} выделенных</div>}
              <div className="sp-item" onClick={e=>{e.stopPropagation();copyField('name','название'+suffix,a)}}>Копировать название{suffix}</div>
              <div className="sp-item" onClick={e=>{e.stopPropagation();copyField('google_ads_id','Google Ads ID'+suffix,a)}}>Копировать Google Ads ID{suffix}</div>
              <div className="sp-item" onClick={e=>{e.stopPropagation();copyField('link','White ссылку'+suffix,a)}}>Копировать White ссылку{suffix}</div>
              <div className="sp-item" onClick={e=>{e.stopPropagation();copyField('black','Black UTM'+suffix,a)}}>Копировать Black UTM{suffix}</div>
              <div className="sp-item" onClick={e=>{e.stopPropagation();copyField('google_tag','Google Tag'+suffix,a)}}>Копировать Google Tag{suffix}</div>
              <div className="sp-item" onClick={e=>{e.stopPropagation();copyField('clo_url','CLO'+suffix,a)}}>Копировать CLO{suffix}</div>
              <div className="sp-item" style={{borderTop:'1px solid var(--bd)',marginTop:3,paddingTop:7,color:'var(--acc)'}} onClick={e=>{e.stopPropagation();copyPack(a)}}>⎘ Копировать всё{bulk ? ' (таблица)' : ''}</div>
            </div>
          </div>
        )
      })()}

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
                  {Array.isArray(drawer.campaigns_snapshot) && drawer.campaigns_snapshot.length > 0 && (
                    <>
                      <div className="dr-sec">Состояние кампаний{drawer.tech_status ? ` — ${drawer.tech_status}${drawer.tech_note?` (${drawer.tech_note})`:''}` : ''}</div>
                      <div className="camp-list">
                        {drawer.campaigns_snapshot.map((c, i) => {
                          // приоритет вердикта: отклонено → пауза → крутит → бюджет → не крутит
                          let st, col
                          if (c.approval === 'DISAPPROVED') { st = 'отклонено'; col = '#f5a623' }
                          else if (c.status === 'PAUSED') { st = 'пауза'; col = '#6b7280' }
                          else if ((c.impressions_today > 0 || c.cost_today > 0)) { st = 'крутит'; col = '#22d17a' }
                          else if ((c.primary_reasons || []).join(',').indexOf('BUDGET') >= 0) { st = 'бюджет'; col = '#f5a623' }
                          else { st = 'не крутит'; col = 'var(--t3)' }
                          return (
                            <div key={i} className="camp-row">
                              <span className="camp-dot" style={{background: col === 'var(--t3)' ? '#6b7280' : col}}/>
                              <span className="camp-name" title={c.name}>{c.name}</span>
                              <span className="camp-st" style={{color: col}}>{st}{c.approval==='DISAPPROVED' && c.reason ? ` · ${c.reason}` : ''}</span>
                              <span className="camp-cost">{c.cost_today > 0 ? '$' + (+c.cost_today).toFixed(2) : '—'}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  <div className="dr-sec">Идентификация</div>
                  <div className="dr-grid">
                    <div className="fi"><label>Название</label><input value={editForm.name||''} onChange={e=>setEditForm({...editForm,name:e.target.value})}/></div>
                    <div className="fi"><label>Google Ads ID</label><input value={editForm.google_ads_id||''} onChange={e=>setEditForm({...editForm,google_ads_id:e.target.value})}/></div>
                    <div className="fi"><label>Статус</label>
                      <select value={editForm.status||''} onChange={e=>setEditForm({...editForm,status:e.target.value})}>
                        <option value="">— без статуса —</option>
                        {STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="fi"><label>Заливщик</label><input value={editForm.zalivshik||''} onChange={e=>setEditForm({...editForm,zalivshik:e.target.value})}/></div>
                    <div className="fi"><label>Карта</label><input value={editForm.card||''} onChange={e=>setEditForm({...editForm,card:e.target.value})}/></div>
                    <div className="fi"><label>Валюта</label>
                      <select value={editForm.currency||'USD'} onChange={e=>setEditForm({...editForm,currency:e.target.value})}>
                        <option>USD</option><option>EUR</option><option>AUD</option><option>GBP</option>
                      </select>
                    </div>
                  </div>

                  <div className="dr-sec">Запуск</div>
                  <div className="dr-grid">
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
                    <div className="fi fi-full"><label>Причина</label><input list="dl-dis_reason" value={editForm.dis_reason||''} onChange={e=>setEditForm({...editForm,dis_reason:e.target.value})} placeholder="выбери или впиши"/></div>
                  </div>

                  <div className="dr-sec">Бан</div>
                  <div className="dr-grid">
                    <div className="fi fi-full"><label>Причина бана</label><input list="dl-ban_reason" value={editForm.ban_reason||''} onChange={e=>setEditForm({...editForm,ban_reason:e.target.value})} placeholder="выбери или впиши"/></div>
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
                <select value={form.status||''} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option value="">— без статуса —</option>
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

      {/* BULK ADD MODAL */}
      {showBulk && (
        <div className="modal-bg" onClick={bulkClose}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:760}}>
            <h2>📋 Массовое добавление аккаунтов</h2>
            {bulkRows.length === 0 ? (
              <>
                <div style={{fontSize:11,color:'var(--t3)',marginBottom:6}}>Вставь список названий — каждое с новой строки</div>
                <textarea
                  value={bulkText}
                  onChange={e=>setBulkText(e.target.value)}
                  placeholder={"SL-USA-201\nSL-USA-202\nGS-USA-15"}
                  style={{width:'100%',minHeight:200,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,padding:10,color:'var(--t)',fontSize:13,fontFamily:'JetBrains Mono',outline:'none',resize:'vertical'}}
                />
                <div className="modal-acts">
                  <button className="btn" onClick={bulkClose}>Отмена</button>
                  <button className="btn btn-acc" onClick={bulkParse} disabled={!bulkText.trim()}>Распарсить →</button>
                </div>
              </>
            ) : (
              <>
                <div style={{display:'flex',alignItems:'flex-end',gap:8,padding:'10px',background:'var(--s2)',borderRadius:6,marginBottom:12,flexWrap:'wrap'}}>
                  <span style={{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',width:'100%'}}>Применить ко всем</span>
                  <div className="fi" style={{flex:1,minWidth:120}}><label>Гео</label><input value={bulkAll.geo} onChange={e=>setBulkAll({...bulkAll,geo:e.target.value})} placeholder="KR"/></div>
                  <div className="fi" style={{flex:1,minWidth:120}}><label>Заливщик</label><input value={bulkAll.zalivshik} onChange={e=>setBulkAll({...bulkAll,zalivshik:e.target.value})} placeholder="Имя"/></div>
                  <div className="fi" style={{flex:1,minWidth:120}}><label>Воронка</label><input value={bulkAll.funnel} onChange={e=>setBulkAll({...bulkAll,funnel:e.target.value})} placeholder="281"/></div>
                  <button className="btn" onClick={bulkApplyAll}>Применить</button>
                </div>

                <div style={{maxHeight:'45vh',overflowY:'auto',border:'1px solid var(--bd)',borderRadius:6}}>
                  <table className="metric-table" style={{marginBottom:0}}>
                    <thead><tr>
                      <th style={{textAlign:'left'}}>Название</th>
                      <th>Статус</th><th>Гео</th><th>Заливщик</th><th>Воронка</th><th></th>
                    </tr></thead>
                    <tbody>
                      {bulkRows.map((r,i)=>(
                        <tr key={i}>
                          <td style={{textAlign:'left'}}>
                            <input value={r.name} onChange={e=>bulkSetRow(i,{name:e.target.value})} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:3,padding:'3px 6px',color:'var(--t)',fontSize:11,fontFamily:'JetBrains Mono',outline:'none',width:'100%'}}/>
                          </td>
                          <td>
                            <select value={r.status} onChange={e=>bulkSetRow(i,{status:e.target.value})} className="ssel" style={{width:'100%'}}>
                              {STATUSES.map(st=><option key={st}>{st}</option>)}
                            </select>
                          </td>
                          <td><input value={r.geo} onChange={e=>bulkSetRow(i,{geo:e.target.value})} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:3,padding:'3px 6px',color:'var(--t)',fontSize:11,outline:'none',width:'100%',textAlign:'center'}}/></td>
                          <td><input value={r.zalivshik} onChange={e=>bulkSetRow(i,{zalivshik:e.target.value})} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:3,padding:'3px 6px',color:'var(--t)',fontSize:11,outline:'none',width:'100%',textAlign:'center'}}/></td>
                          <td><input value={r.funnel} onChange={e=>bulkSetRow(i,{funnel:e.target.value})} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:3,padding:'3px 6px',color:'var(--t)',fontSize:11,outline:'none',width:'100%',textAlign:'center'}}/></td>
                          <td><button className="btn btn-del" style={{padding:'2px 7px'}} onClick={()=>setBulkRows(rows=>rows.filter((_,idx)=>idx!==i))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="modal-acts">
                  <button className="btn" onClick={()=>setBulkRows([])}>← Назад</button>
                  <button className="btn btn-acc" onClick={bulkAddAll} disabled={bulkSaving||bulkRows.length===0}>
                    {bulkSaving?'Добавляем...':`Добавить все (${bulkRows.length})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* HOTKEYS HELP */}
      {showHelp && (
        <div className="modal-bg" onClick={()=>setShowHelp(false)} style={{zIndex:700}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:420}}>
            <h2>Горячие клавиши</h2>
            <div className="hk-list">
              {[
                ['/', 'Фокус в поиск'],
                ['↑ / ↓', 'Навигация по строкам'],
                ['Enter', 'Открыть карточку активной строки'],
                ['Esc', 'Закрыть карточку / снять выделение / подсказку'],
                ['Ctrl/⌘ + Z', 'Отменить'],
                ['Ctrl/⌘ + ⇧ + Z', 'Повторить'],
                ['?', 'Показать/скрыть эту подсказку'],
              ].map(([k,d])=>(
                <div key={k} className="hk-row"><kbd>{k}</kbd><span>{d}</span></div>
              ))}
            </div>
            <div className="hk-note">Хоткеи работают вне текстовых полей — в инпуте они печатаются как обычно.</div>
            <div className="modal-acts" style={{borderTop:'none',paddingTop:4}}>
              <button className="btn" onClick={()=>setShowHelp(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="modal-bg" onClick={()=>setConfirmDialog(null)} style={{zIndex:700}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:380}}>
            <div style={{fontSize:14,color:'var(--t)',lineHeight:1.5,marginBottom:18}}>{confirmDialog.msg}</div>
            <div className="modal-acts" style={{borderTop:'none',paddingTop:0}}>
              <button className="btn" onClick={()=>setConfirmDialog(null)}>Отмена</button>
              <button className="btn btn-del" onClick={confirmDialog.onYes}>Подтвердить</button>
            </div>
          </div>
        </div>
      )}

      {/* DATALISTS для combobox-ячеек и причин */}
      {COMBO_FIELDS.map(k => (
        <datalist key={k} id={`dl-${k}`}>
          {distinctVals(k).map(v => <option key={v} value={v}/>)}
        </datalist>
      ))}
      <datalist id="dl-dis_reason">{distinctVals('dis_reason').map(v => <option key={v} value={v}/>)}</datalist>
      <datalist id="dl-ban_reason">{distinctVals('ban_reason').map(v => <option key={v} value={v}/>)}</datalist>

      {dragFromIds.length > 1 && (
        <div className="drag-badge">⇅ перетаскивается {dragFromIds.length} аккаунт{dragFromIds.length%10===1&&dragFromIds.length%100!==11?'':dragFromIds.length%10>=2&&dragFromIds.length%10<=4&&(dragFromIds.length%100<10||dragFromIds.length%100>=20)?'а':'ов'}</div>
      )}
      <div className={`toast${toast?' show':''}`}>
        {toast}
        {toastBtn && <button className="toast-btn" onClick={()=>{ toastBtn.onClick(); setToast(''); setToastBtn(null) }}>{toastBtn.label}</button>}
      </div>
    </>
  )
}

function MetricsTab({ accountId, metrics, onAdd, onRefresh }) {
  const today = new Date().toISOString().split('T')[0]
  const [row, setRow] = useState({ metric_date: today, clicks:'', cpc_local:'', cpc_usd:'', cost_usd:'', conversions:'' })
  const [period, setPeriod] = useState('30')

  const sortedAsc = [...metrics].sort((a,b)=> a.metric_date < b.metric_date ? -1 : 1)
  const n = period==='7' ? 7 : period==='30' ? 30 : sortedAsc.length
  const view = sortedAsc.slice(-n)
  const viewDesc = [...view].reverse()

  const totalCost = view.reduce((s,m)=>s+(+m.cost_usd||0),0)
  const totalClicks = view.reduce((s,m)=>s+(+m.clicks||0),0)
  const totalConv = view.reduce((s,m)=>s+(+m.conversions||0),0)
  const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0

  // SVG-график: спенд столбцами + конверсии линией
  const W=520, H=120, pad=16
  const maxCost = Math.max(1, ...view.map(m=>+m.cost_usd||0))
  const maxConv = Math.max(1, ...view.map(m=>+m.conversions||0))
  const barW = view.length ? (W-2*pad)/view.length : 0
  const convPts = view.map((m,i)=>{
    const cx = pad + i*barW + barW/2
    const cy = H-pad - ((+m.conversions||0)/maxConv)*(H-2*pad)
    return `${cx.toFixed(1)},${cy.toFixed(1)}`
  }).join(' ')

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        {[['7','7 дней'],['30','30 дней'],['all','Всё']].map(([k,l])=>(
          <button key={k} className={`btn${period===k?' btn-acc':''}`} style={{padding:'3px 9px',fontSize:11}} onClick={()=>setPeriod(k)}>{l}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:14,fontFamily:'JetBrains Mono',fontSize:11,color:'var(--t3)'}}>
          <span>Спенд: <b style={{color:'#22d17a'}}>${totalCost.toFixed(0)}</b></span>
          <span>Конв.: <b style={{color:'#f5a623'}}>{totalConv}</b></span>
          <span>Ср.CPC: <b style={{color:'var(--t)'}}>${avgCpc.toFixed(2)}</b></span>
        </div>
      </div>

      {view.length > 0 ? (
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:130,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,marginBottom:10}}>
          {view.map((m,i)=>{
            const h = ((+m.cost_usd||0)/maxCost)*(H-2*pad)
            return <rect key={i} x={(pad+i*barW+1).toFixed(1)} y={(H-pad-h).toFixed(1)} width={Math.max(1,barW-2).toFixed(1)} height={h.toFixed(1)} fill="rgba(34,209,122,.45)"/>
          })}
          {maxConv>0 && <polyline points={convPts} fill="none" stroke="#f5a623" strokeWidth="1.5"/>}
          {view.map((m,i)=>{
            const cx = pad + i*barW + barW/2
            const cy = H-pad - ((+m.conversions||0)/maxConv)*(H-2*pad)
            return (+m.conversions||0)>0 ? <circle key={i} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="2" fill="#f5a623"/> : null
          })}
        </svg>
      ) : (
        <div style={{padding:'24px',textAlign:'center',color:'var(--t3)',fontSize:12,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,marginBottom:10}}>Нет данных за период</div>
      )}

      <table className="metric-table">
        <thead><tr>
          <th>Дата</th><th>Клики</th><th>CPC (лок.)</th><th>CPC $</th><th>Cost $</th><th>Конв.</th><th>CPA $</th>
        </tr></thead>
        <tbody>
          {viewDesc.map(m=>(
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
          {viewDesc.length === 0 && <tr><td colSpan={7} style={{color:'var(--t3)',textAlign:'center',padding:'16px'}}>Нет данных</td></tr>}
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
