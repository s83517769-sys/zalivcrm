-- Дневные снимки ручного статуса аккаунта.
-- Источник правды для /stats режима «По статусам — Ручные».
-- Аддитивно, существующие таблицы не задеваются. Запустить в Supabase → SQL Editor.

create table if not exists daily_manual_status (
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null,
  snapshot_date date not null,
  status        text not null,            -- accounts.status: Крутит / БАН / Вериф / любой custom-статус
  updated_at    timestamptz default now(),
  primary key (account_id, snapshot_date)
);

create index if not exists idx_dms_user_date on daily_manual_status(user_id, snapshot_date);

alter table daily_manual_status enable row level security;
create policy if not exists "users_own_dms" on daily_manual_status using (user_id = auth.uid());
