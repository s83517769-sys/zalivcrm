-- Защита истории + автоудаление архива.
-- Аддитивно, существующие данные не задеваются. Запустить в Supabase → SQL Editor.

-- ── 1. Снять ON DELETE CASCADE со снимков ───────────────────────────────────
-- После миграции снимки переживают реальное удаление аккаунта. account_id
-- остаётся в строке как обычное значение (без FK), PK (account_id, snapshot_date)
-- сохраняется. Stats-эндпоинты читают по user_id без JOIN с accounts, так что
-- «висячий» account_id не мешает.
alter table daily_tech_status   drop constraint if exists daily_tech_status_account_id_fkey;
alter table daily_manual_status drop constraint if exists daily_manual_status_account_id_fkey;

-- ── 2. archived_at — момент попадания аккаунта в архив ─────────────────────
-- Используется для автоудаления по сроку (см. п.3). Пишется только на переходе
-- is_archived false→true и сбрасывается на true→false (восстановление).
-- Старые архивные строки (созданные до миграции) останутся с NULL — это
-- БЕЗОПАСНО: условие автоудаления (archived_at < now()-N days) их не зацепит.
alter table accounts add column if not exists archived_at timestamptz;

-- ── 3. archive_autodelete_days — настройка per-user ────────────────────────
-- Через сколько дней архивный аккаунт удаляется навсегда автоматически.
-- Удаление триггерится при заходе на /archive. История в статистике сохраняется
-- благодаря п.1 (cascade убран).
alter table user_settings add column if not exists archive_autodelete_days integer default 30;
