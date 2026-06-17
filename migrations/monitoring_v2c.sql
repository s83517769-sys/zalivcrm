-- ЗаливCRM — Monitoring v2c: опциональный пересчёт спенда по поясу пользователя
-- Запустить в Supabase → SQL Editor. Аддитивно.

alter table user_settings
  add column if not exists spend_by_user_tz boolean default false;
