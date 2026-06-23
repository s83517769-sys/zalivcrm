-- Окно «свежий аккаунт без активности → Модерация» — настройка per-user.
-- Запустить в Supabase → SQL Editor. Аддитивно, прежние строки не задеваются.

alter table user_settings
  add column if not exists moderation_hours integer default 12;
