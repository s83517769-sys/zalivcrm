-- Дневные снимки вычисленного технического статуса.
-- Источник правды для /stats режима «По тех-статусам».
-- Аддитивно, существующие таблицы не задеваются. Запустить в Supabase → SQL Editor.

create table if not exists daily_tech_status (
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null,
  snapshot_date date not null,
  tech_status   text not null,            -- канонический: Модерация/Крутит/Отклонены/Бюджет/Пауза/Оплата/Бан/НЕТ СВЯЗИ/ПРОВЕРЬ
  updated_at    timestamptz default now(),
  primary key (account_id, snapshot_date)
);

create index if not exists idx_dts_user_date on daily_tech_status(user_id, snapshot_date);

-- RLS — закрываем доступ по user_id, как и у остальных таблиц.
alter table daily_tech_status enable row level security;
create policy if not exists "users_own_dts" on daily_tech_status using (user_id = auth.uid());
