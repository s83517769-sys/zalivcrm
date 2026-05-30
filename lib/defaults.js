// ЗаливCRM — общие дефолты пользовательских настроек (PR A)
// Используются на сервере (сид при пустых настройках) и на клиенте.

// Дефолтные статусы с категориями. category ∈ active|problem|terminal|neutral
export const DEFAULT_STATUSES = [
  { id: 'pusk',        name: 'Пуск',            color: '#4ea8de', category: 'active'  },
  { id: 'moderation',  name: 'Модерация',       color: '#f5a623', category: 'active'  },
  { id: 'krutit',      name: 'Крутит',          color: '#22d17a', category: 'active'  },
  { id: 'krutit_ogr',  name: 'Крутит (огран)',  color: '#22d17a', category: 'active'  },
  { id: 'disapprove',  name: 'Дизапрув',        color: '#f5a623', category: 'problem' },
  { id: 'razlog',      name: 'Разлог',          color: '#f5a623', category: 'problem' },
  { id: 'apila',       name: 'Апила',           color: '#f5a623', category: 'problem' },
  { id: 'verif',       name: 'Вериф',           color: '#c084fc', category: 'problem' },
  { id: 'verif_bov',   name: 'Вериф BOV',       color: '#c084fc', category: 'problem' },
  { id: 'pause',       name: 'Пауза',           color: '#4ea8de', category: 'neutral' },
  { id: 'oplata',      name: 'Оплата',          color: '#f472b6', category: 'neutral' },
  { id: 'na_smenu',    name: 'На смену',        color: '#f05555', category: 'terminal'},
  { id: 'otmena',      name: 'Отмена запуска',  color: '#f05555', category: 'terminal'},
  { id: 'ban',         name: 'БАН',             color: '#f05555', category: 'terminal'},
  { id: 'waiting',     name: 'В ожидании',      color: '#6b7280', category: 'neutral' },
]

export const DEFAULT_GROUPS = [
  { prefix: 'SL-USA', color: '#4ea8de' },
  { prefix: 'GS-USA', color: '#22d17a' },
  { prefix: 'MM-NZ',  color: '#c084fc' },
]

export const DEFAULT_CURRENCY_RATES = { USD: 1, EUR: 1.08, AUD: 0.66, GBP: 1.27 }

export const DEFAULT_ROW_RULES = [
  { id: 'no_signal', field: 'tech_status', operator: '=',  value: 'НЕТ СВЯЗИ', color: '#f05555', scope: 'row',  enabled: true },
  { id: 'spend_no_conv', field: 'spend_no_conv', operator: 'true', value: '', color: '#f5a623', scope: 'row', enabled: true },
  { id: 'cpa_high', field: 'cpa', operator: '>', value: 70, color: '#f05555', scope: 'cell', enabled: true },
  { id: 'cpc_jump', field: 'cpc_jump_pct', operator: '>', value: 50, color: '#f5a623', scope: 'cell', enabled: true },
]

export const DEFAULT_STATUS_AUTOMATIONS = {
  ban_reason_to_na_smenu: true,
  pusk_sets_start_date: true,
  krutit_sets_crut_date: true,
  freeze_terminal_tech_status: true,
}

// Терминальные статусы по умолчанию (для заморозки tech_status в ingest).
// Берём имена из дефолтного набора + это же дублируется логикой category==='terminal'.
export const TERMINAL_STATUS_NAMES = DEFAULT_STATUSES
  .filter(s => s.category === 'terminal')
  .map(s => s.name)
