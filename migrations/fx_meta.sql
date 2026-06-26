-- ЗаливCRM — живой FX: метаданные автообновления курсов валют
-- Запустить в Supabase → SQL Editor. Аддитивно, существующие данные не трогаются.
--
-- fx_meta хранит служебку для авто-курсов:
--   { "updated_at": ISO, "source": "frankfurter|er-api", "fx_date": "YYYY-MM-DD",
--     "manual": ["CAD", ...] }   -- коды с ручным оверрайдом: авто-обновление их не трогает
--
-- Сами курсы по-прежнему живут в user_settings.currency_rates ({код: число},
-- "USD за 1 единицу валюты", USD=1) — формат и нормализация на фронте не меняются.
alter table user_settings
  add column if not exists fx_meta jsonb default '{}'::jsonb;
