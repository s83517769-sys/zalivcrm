-- ЗаливCRM — Monitoring v2b: хранение детализации от скрипта v2 на аккаунте
-- Запустить в Supabase → SQL Editor. Аддитивно.

alter table accounts
  add column if not exists tech_note          text,    -- "2/5" или причина отклонения
  add column if not exists campaigns_snapshot jsonb,   -- детализация кампаний для карточки
  add column if not exists account_timezone   text;    -- пояс аккаунта (от скрипта)
