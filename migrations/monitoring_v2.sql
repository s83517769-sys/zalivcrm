-- ЗаливCRM — Monitoring v2: почасовой спенд + часовой пояс пользователя
-- Запустить в Supabase → SQL Editor. Всё аддитивно, существующие данные не трогаются.

-- ── Почасовые метрики (источник истины для спенда под пояс пользователя) ──
create table if not exists hourly_metrics (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
  user_id          uuid not null,
  metric_date      date not null,            -- дата по поясу АККАУНТА
  hour             smallint not null,        -- 0..23 по поясу аккаунта
  account_timezone text,                     -- напр. "America/New_York"
  cost_native      numeric(14,4) default 0,  -- расход в нативной валюте аккаунта
  currency         text default 'USD',
  clicks           integer default 0,
  conversions      numeric(12,2) default 0,
  impressions      integer default 0,
  updated_at       timestamptz default now(),
  unique (account_id, metric_date, hour)
);

create index if not exists idx_hourly_account    on hourly_metrics(account_id);
create index if not exists idx_hourly_user_date   on hourly_metrics(user_id, metric_date);

-- ── Часовой пояс пользователя (спенд/время показываются по нему) ──
alter table user_settings
  add column if not exists user_timezone text default 'Europe/Nicosia';
