-- Индексы для аналитического эндпоинта /api/stats/analytics.
-- Аддитивно, IF NOT EXISTS — повторный запуск безопасен.
-- Запустить в Supabase → SQL Editor.

-- Партиал-индекс для горячего запроса «первый день Бан per account»
-- в техрежиме. tech_status=Бан — селективное условие, индекс маленький.
create index if not exists idx_dts_tech_ban
  on daily_tech_status(user_id, account_id, snapshot_date)
  where tech_status = 'Бан';

-- Тренд банов по дате — нужен для аналитики (% банов + по неделям).
create index if not exists idx_accounts_user_ban_date
  on accounts(user_id, ban_date) where ban_date is not null;
