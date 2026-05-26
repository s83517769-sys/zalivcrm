/**
 * ЗаливCRM — Watchdog скрипт (MCC уровень)
 * Запускать каждый час (можно объединить с мониторингом)
 * 
 * Логика:
 * - Если аккаунт не обновлялся 2+ часов → НЕТ СВЯЗИ
 * - Если аккаунт ожил → РАБОТАЕТ (только если не стоит ручной статус БАН/Отклон)
 */

const API_KEY   = 'YOUR_API_KEY_HERE';   // ← тот же ключ
const API_URL   = 'https://zalivcrm.vercel.app/api/watchdog';
const DEAD_HOURS = 2;

function watchdogMain() {
  const now      = new Date();
  const events   = [];
  const accounts = AdsManagerApp.accounts().get();

  while (accounts.hasNext()) {
    const account = accounts.next();

    try {
      AdsManagerApp.select(account);

      const accName  = account.getName();
      const accId    = account.getCustomerId();

      // Последнее время активности через AWQL
      const report = AdsApp.report(
        'SELECT Date FROM ACCOUNT_PERFORMANCE_REPORT DURING TODAY'
      );

      const hasData = report.rows().hasNext();

      events.push({
        name:          accName,
        google_ads_id: accId,
        has_data_today: hasData,
        checked_at:    now.toISOString(),
      });

    } catch (e) {
      Logger.log('WATCHDOG ERROR [' + account.getName() + ']: ' + e.message);
    }
  }

  if (events.length > 0) {
    sendWatchdogToAPI(events);
  }
}

function sendWatchdogToAPI(events) {
  const payload = JSON.stringify({
    api_key: API_KEY,
    events:  events,
    dead_hours: DEAD_HOURS,
  });

  const options = {
    method:      'POST',
    contentType: 'application/json',
    payload:     payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(API_URL, options);
    Logger.log('Watchdog sent: ' + response.getResponseCode());
  } catch (e) {
    Logger.log('WATCHDOG FETCH ERROR: ' + e.message);
  }
}
