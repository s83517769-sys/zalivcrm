-- ================================================================
-- ЗаливCRM — Схема базы данных (Supabase / PostgreSQL)
-- Вставить в SQL Editor в Supabase и выполнить
-- ================================================================

-- ── Расширения ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Пользователи ─────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  api_key         TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  timezone        TEXT DEFAULT 'Europe/Moscow',  -- каждый юзер настраивает сам
  plan            TEXT DEFAULT 'trial',          -- trial | solo | team | agency
  trial_ends_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Аккаунты Google Ads ──────────────────────────────────────────
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Идентификация
  name            TEXT NOT NULL,              -- SL-USA-122
  google_ads_id   TEXT,                       -- 778-546-0052 (заполняется скриптом)

  -- ДВУХСЛОЙНЫЕ СТАТУСЫ
  tech_status     TEXT DEFAULT NULL,          -- от скрипта: РАБОТАЕТ / ПРОВЕРЬ АККАУНТ / ВСЕ НА ПАУЗЕ / НЕТ СВЯЗИ
  manual_status   TEXT DEFAULT 'Пуск',        -- ручной: БАН / Пауза / Отклон / Вериф / Оплата / Крутит / Модерация...
  
  -- Отображаемый статус (вычисляется): manual_status приоритетнее если стоит БАН/Отклон/Вериф
  -- Логика: если manual_status IN (БАН, Отклон, Вериф, Оплата) → показываем его
  --         иначе показываем tech_status (РАБОТАЕТ → Крутит, etc.)

  -- Технические данные
  domain          TEXT,                       -- knalav.digital
  format          TEXT,                       -- Фото / Видео
  crea            TEXT,                       -- 3экрана, синий, TV kor...
  voronka         TEXT,                       -- 281, 243.2
  geo             TEXT DEFAULT 'KR',
  lang            TEXT DEFAULT 'KR',
  devices         TEXT DEFAULT 'All',
  interests       TEXT DEFAULT 'Segment',

  -- Ссылки
  black_utm       TEXT,                       -- utm_campaign=SL-USA-122&...
  clo_url         TEXT,                       -- https://secure-appdesktop.com/...
  white_id        TEXT,                       -- whitepage ID
  google_tag      TEXT,                       -- AW-18089739696/IOL6CNnQ9KscELCL7rFD

  -- Карта
  card            TEXT,                       -- "мультик 9137" / "1234" / etc.

  -- Дизапрув
  dis_date        TEXT,                       -- 15.05.26
  dis_reason      TEXT,                       -- Проверка для показа рекламы...
  dis_solution    TEXT,                       -- сменил крео

  -- Метаданные
  comment         TEXT,
  txt_variant     TEXT,                       -- 111 / 131 / 1 1 10
  launch_date     DATE,

  -- Управление
  is_archived     BOOLEAN DEFAULT FALSE,      -- в архиве
  is_hidden       BOOLEAN DEFAULT FALSE,      -- скрыт

  -- Watchdog
  last_seen_at    TIMESTAMPTZ,               -- когда скрипт последний раз слал данные
  watchdog_status TEXT DEFAULT 'unknown',    -- alive / dead / checking

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_accounts_user_id      ON accounts(user_id);
CREATE INDEX idx_accounts_name         ON accounts(name);
CREATE INDEX idx_accounts_google_ads_id ON accounts(google_ads_id);
CREATE INDEX idx_accounts_manual_status ON accounts(manual_status);
CREATE INDEX idx_accounts_tech_status  ON accounts(tech_status);
CREATE INDEX idx_accounts_domain       ON accounts(domain);

-- ── Метрики по дням ──────────────────────────────────────────────
CREATE TABLE metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  metric_date     DATE NOT NULL,             -- дата метрик (вчера/сегодня)
  period          TEXT NOT NULL,             -- 'today' | 'yesterday' | 'all_time'

  cost            NUMERIC(12, 2) DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  cpc             NUMERIC(8, 4) DEFAULT 0,
  ctr             NUMERIC(8, 4) DEFAULT 0,   -- в % (0.15 = 0.15%)
  conversions     NUMERIC(10, 2) DEFAULT 0,
  impressions     INTEGER DEFAULT 0,

  currency        TEXT DEFAULT 'USD',
  source          TEXT DEFAULT 'script',     -- script | manual

  recorded_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Уникальность: один набор метрик на аккаунт+дата+период
  UNIQUE (account_id, metric_date, period)
);

CREATE INDEX idx_metrics_account_id  ON metrics(account_id);
CREATE INDEX idx_metrics_metric_date ON metrics(metric_date);
CREATE INDEX idx_metrics_period      ON metrics(period);

-- ── Watchdog события ─────────────────────────────────────────────
CREATE TABLE watchdog_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  event_type      TEXT NOT NULL,             -- 'died' | 'revived' | 'no_data'
  old_status      TEXT,
  new_status      TEXT,
  hours_dead      NUMERIC(6, 2),             -- сколько часов не было данных
  message         TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchdog_account_id ON watchdog_events(account_id);
CREATE INDEX idx_watchdog_created_at ON watchdog_events(created_at);

-- ── История изменений ────────────────────────────────────────────
CREATE TABLE account_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  change_type     TEXT NOT NULL,             -- 'status' | 'card' | 'comment' | 'field' | 'note'
  field_name      TEXT,                      -- 'manual_status' | 'card' | 'dis_reason' | ...
  old_value       TEXT,
  new_value       TEXT,
  note            TEXT,                      -- свободная заметка (дневник)

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_history_account_id ON account_history(account_id);
CREATE INDEX idx_history_created_at ON account_history(created_at);

-- ── Карты ────────────────────────────────────────────────────────
CREATE TABLE cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  label           TEXT NOT NULL,             -- "мультик 9137" / "Тинькофф *1234"
  last4           TEXT,                      -- последние 4 цифры
  bank            TEXT,                      -- Тинькофф / Сбер / ...
  is_active       BOOLEAN DEFAULT TRUE,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Привязка карт к аккаунтам (многие-ко-многим) ─────────────────
CREATE TABLE account_cards (
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at   TIMESTAMPTZ,              -- NULL = текущая привязка
  PRIMARY KEY (account_id, card_id, assigned_at)
);

-- ── Сохранённые фильтры ──────────────────────────────────────────
CREATE TABLE saved_filters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,             -- "Только баны", "Активные SL-USA"
  filter_json     JSONB NOT NULL,            -- {status: ['БАН'], group: ['SL-USA']}
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Настройки колонок таблицы ────────────────────────────────────
CREATE TABLE user_settings (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  columns_config  JSONB DEFAULT '[]',        -- порядок и видимость колонок
  table_density   TEXT DEFAULT 'normal',     -- normal | compact
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- Триггеры
-- ================================================================

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- Row Level Security (RLS) — каждый видит только своё
-- ================================================================

ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchdog_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_cards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_filters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings   ENABLE ROW LEVEL SECURITY;

-- Политики: пользователь видит только свои данные
CREATE POLICY "users_own_accounts"    ON accounts        USING (user_id = auth.uid());
CREATE POLICY "users_own_metrics"     ON metrics         USING (user_id = auth.uid());
CREATE POLICY "users_own_watchdog"    ON watchdog_events USING (user_id = auth.uid());
CREATE POLICY "users_own_history"     ON account_history USING (user_id = auth.uid());
CREATE POLICY "users_own_cards"       ON cards           USING (user_id = auth.uid());
CREATE POLICY "users_own_filters"     ON saved_filters   USING (user_id = auth.uid());
CREATE POLICY "users_own_settings"    ON user_settings   USING (user_id = auth.uid());

-- account_cards через accounts
CREATE POLICY "users_own_account_cards" ON account_cards
  USING (account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid()));

-- ================================================================
-- Логика двухслойных статусов (view для удобства)
-- ================================================================

CREATE OR REPLACE VIEW accounts_with_status AS
SELECT
  a.*,
  CASE
    -- Ручной статус приоритетнее если он "финальный"
    WHEN a.manual_status IN ('БАН', 'отклон', 'Вериф', 'Вериф BOV', 'Ком Вериф',
                              'Оплата 20', 'Оплата 40', 'Оплата 50', 'Оплата 200',
                              'На смену', 'Модерация')
      THEN a.manual_status
    -- Технический статус НЕТ СВЯЗИ — watchdog override
    WHEN a.watchdog_status = 'dead'
      THEN 'НЕТ СВЯЗИ'
    -- Скрипт говорит что работает — показываем Крутит
    WHEN a.tech_status = 'РАБОТАЕТ'
      THEN 'Крутит'
    WHEN a.tech_status = 'ВСЕ НА ПАУЗЕ'
      THEN 'Пауза'
    WHEN a.tech_status = 'ПРОВЕРЬ АККАУНТ'
      THEN 'Проверь'
    -- Fallback на ручной
    ELSE COALESCE(a.manual_status, 'Неизвестно')
  END AS display_status
FROM accounts a;

-- ================================================================
-- Комментарий: API endpoint для скрипта
-- POST /api/ingest
-- Headers: { "Content-Type": "application/json" }
-- Body: {
--   "api_key": "...",
--   "batch": [{
--     "name": "SL-USA-122",
--     "google_ads_id": "778-546-0052",
--     "tech_status": "РАБОТАЕТ",
--     "today_cost": 1.19, "today_clicks": 3, ...
--     "yest_cost": 71.57, "yest_clicks": 183, ...
--   }]
-- }
-- ================================================================
