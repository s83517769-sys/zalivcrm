# ЗаливCRM — Инструкция по деплою

## Шаг 1 — Supabase (база данных)

1. Заходи на **supabase.com** → создай аккаунт → New project
2. Имя: `zalivcrm`, пароль — сохрани его, регион: West EU
3. Жди ~2 минуты пока создаётся
4. Слева: **SQL Editor** → New query
5. Вставь весь код из файла `database_schema.sql` → Run
6. Должно написать "Success"

### Получить ключи Supabase:
- Слева: **Project Settings** → **API**
- Скопируй: `Project URL`, `anon public key`, `service_role key`

---

## Шаг 2 — GitHub (нужен для Vercel)

1. Заходи на **github.com** → создай аккаунт если нет
2. New repository → имя: `zalivcrm` → Create
3. Загрузи все файлы этой папки в репозиторий
   (или используй GitHub Desktop)

---

## Шаг 3 — Vercel (хостинг)

1. Заходи на **vercel.com** → войди через GitHub
2. New Project → выбери репозиторий `zalivcrm`
3. В разделе **Environment Variables** добавь три переменные:

```
NEXT_PUBLIC_SUPABASE_URL = https://ТВОЙ_ПРОЕКТ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...anon_key
SUPABASE_SERVICE_KEY = eyJ...service_key
```

4. Нажми **Deploy**
5. Получишь ссылку типа `zalivcrm.vercel.app`

---

## Шаг 4 — Скрипт мониторинга

Открой файл `monitoring_script.js` и вставь:
- `API_KEY` — твой ключ из настроек CRM (будет доступен после регистрации)
- `API_URL` — `https://zalivcrm.vercel.app/api/ingest`

Вставь скрипт в Google Ads → Tools → Bulk actions → Scripts
Настрой триггер: каждый час

---

## Шаг 5 — Watchdog скрипт

Открой файл `watchdog_script.js` и вставь:
- Тот же `API_KEY`
- `API_URL` — `https://zalivcrm.vercel.app/api/watchdog`

Вставь на ОТДЕЛЬНЫЙ аккаунт Google Ads.
Настрой триггер: каждый час.

---

## Структура проекта

```
zalivcrm/
├── pages/
│   ├── api/
│   │   ├── ingest.js      ← принимает данные от скриптов
│   │   ├── watchdog.js    ← принимает проверки watchdog
│   │   └── accounts/
│   │       └── [id].js    ← обновление аккаунтов
├── lib/
│   └── supabase.js        ← подключение к БД
├── .env.local             ← ключи (заполнить!)
├── package.json
└── database_schema.sql    ← SQL для Supabase
```

---

## API эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| POST | /api/ingest | Приём метрик от скрипта |
| POST | /api/watchdog | Приём watchdog проверок |
| GET | /api/accounts | Получить все аккаунты |
| PATCH | /api/accounts/[id] | Обновить аккаунт |
