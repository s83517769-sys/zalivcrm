-- ЗаливCRM — PR A: миграция БД (запустить в Supabase → SQL Editor)
-- Все изменения аддитивные, существующие имена полей НЕ меняются.

-- ── accounts: новые служебные поля ──────────────────────────────
alter table accounts
  add column if not exists sort_order              integer,
  add column if not exists metrics_manual_override jsonb default '[]'::jsonb,
  -- авто/служебное (могли быть добавлены ранее — оставляем для надёжности)
  add column if not exists tech_status             text,
  add column if not exists watchdog_status         text default 'unknown',
  add column if not exists last_seen_at            timestamptz,
  add column if not exists crut_date               date;

-- ── user_settings: новые per-user настройки ─────────────────────
alter table user_settings
  add column if not exists custom_statuses    jsonb default '[]'::jsonb,
  add column if not exists custom_groups      jsonb default '[]'::jsonb,
  add column if not exists watchdog_hours     integer default 2,
  add column if not exists column_config      jsonb default '{}'::jsonb,
  add column if not exists row_rules          jsonb default '[]'::jsonb,
  add column if not exists currency_rates     jsonb default '{}'::jsonb,
  add column if not exists ui_density         text default 'cozy',
  add column if not exists ui_theme           text default 'dark',
  add column if not exists status_automations jsonb default '{}'::jsonb,
  add column if not exists default_sort       jsonb;
