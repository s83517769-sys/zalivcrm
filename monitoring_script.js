/**
 * ЗаливCRM — Скрипт мониторинга (MCC уровень)
 * Запускать каждый час через триггер в Google Apps Script
 * 
 * НАСТРОЙКА:
 * 1. Зарегистрируйся на zaliv.app
 * 2. Скопируй свой API ключ из настроек
 * 3. Вставь в API_KEY ниже
 */

const API_KEY     = 'YOUR_API_KEY_HERE';   // ← вставь свой ключ
const API_URL     = 'https://zaliv.app/api/ingest';
const DEAD_HOURS  = 2;                      // часов без данных = НЕТ СВЯЗИ
const TIMEZONE    = 'Europe/Moscow';        // твой часовой пояс

function main() {
  const now         = new Date();
  const accounts    = AdsManagerApp.accounts().get();
  const results     = [];
  const errors      = [];

  while (accounts.hasNext()) {
    const account = accounts.next();

    try {
      AdsManagerApp.select(account);

      const accName   = account.getName();
      const accId     = account.getCustomerId();
      const currency  = account.getCurrencyCode();

      // ── Метрики СЕГОДНЯ ──────────────────────────────────
      const todayStats  = getStats('TODAY');
      // ── Метрики ВЧЕРА ────────────────────────────────────
      const yesterStats = getStats('YESTERDAY');
      // ── Метрики ВСЁ ВРЕМЯ ────────────────────────────────
      const allStats    = getStats('ALL_TIME');

      // ── Статус аккаунта ──────────────────────────────────
      const techStatus  = getTechStatus();

      results.push({
        name:           accName,
        google_ads_id:  accId,
        currency:       currency,
        tech_status:    techStatus,
        updated_at:     formatDateTime(now),

        // Сегодня
        today_cost:     todayStats.cost,
        today_clicks:   todayStats.clicks,
        today_cpc:      todayStats.cpc,
        today_ctr:      todayStats.ctr,
        today_conv:     todayStats.conv,
        today_impr:     todayStats.impr,

        // Вчера
        yest_cost:      yesterStats.cost,
        yest_clicks:    yesterStats.clicks,
        yest_cpc:       yesterStats.cpc,
        yest_ctr:       yesterStats.ctr,
        yest_conv:      yesterStats.conv,
        yest_impr:      yesterStats.impr,

        // Всё время
        all_cost:       allStats.cost,
        all_clicks:     allStats.clicks,
        all_cpc:        allStats.cpc,
        all_ctr:        allStats.ctr,
        all_conv:       allStats.conv,
        all_impr:       allStats.impr,
      });

    } catch (e) {
      errors.push({ name: account.getName(), error: e.message });
      Logger.log('ERROR [' + account.getName() + ']: ' + e.message);
    }
  }

  // ── Отправляем всё одним батчем ──────────────────────────
  if (results.length > 0) {
    sendToAPI(results);
  }

  if (errors.length > 0) {
    Logger.log('Ошибки: ' + JSON.stringify(errors));
  }

  Logger.log('Готово. Отправлено: ' + results.length + ', ошибок: ' + errors.length);
}


// ─────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────

function getStats(period) {
  try {
    const report = AdsApp.report(
      'SELECT Cost, Clicks, AverageCpc, Ctr, Conversions, Impressions ' +
      'FROM ACCOUNT_PERFORMANCE_REPORT ' +
      'DURING ' + period
    );
    const row = report.rows().next();
    if (!row) return emptyStats();
    return {
      cost:   parseFloat((row['Cost']        || '0').replace(/,/g, '')) || 0,
      clicks: parseInt(  (row['Clicks']      || '0').replace(/,/g, '')) || 0,
      cpc:    parseFloat((row['AverageCpc']  || '0').replace(/,/g, '')) || 0,
      ctr:    parseFloat((row['Ctr']         || '0').replace(/%/g, '')) || 0,
      conv:   parseFloat((row['Conversions'] || '0').replace(/,/g, '')) || 0,
      impr:   parseInt(  (row['Impressions'] || '0').replace(/,/g, '')) || 0,
    };
  } catch (e) {
    return emptyStats();
  }
}

function emptyStats() {
  return { cost: 0, clicks: 0, cpc: 0, ctr: 0, conv: 0, impr: 0 };
}

function getTechStatus() {
  try {
    // Проверяем есть ли активные кампании
    const campaigns = AdsApp.campaigns()
      .withCondition('Status = ENABLED')
      .get();

    if (!campaigns.hasNext()) {
      return 'ВСЕ НА ПАУЗЕ';
    }

    // Есть ли расход сегодня
    const stats = getStats('TODAY');
    if (stats.cost > 0 || stats.clicks > 0) {
      return 'РАБОТАЕТ';
    }

    // Кампании есть, но расхода нет — ПРОВЕРЬ АККАУНТ
    return 'ПРОВЕРЬ АККАУНТ';

  } catch (e) {
    return 'ПРОВЕРЬ АККАУНТ';
  }
}

function sendToAPI(data) {
  const payload = JSON.stringify({
    api_key:  API_KEY,
    batch:    data,
    sent_at:  new Date().toISOString(),
  });

  const options = {
    method:      'POST',
    contentType: 'application/json',
    payload:     payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(API_URL, options);
    const code     = response.getResponseCode();
    const body     = response.getContentText();

    if (code === 200) {
      Logger.log('API OK: ' + body);
    } else {
      Logger.log('API ERROR ' + code + ': ' + body);
    }
  } catch (e) {
    Logger.log('FETCH ERROR: ' + e.message);
  }
}

function formatDateTime(date) {
  const pad = n => String(n).padStart(2, '0');
  return pad(date.getDate()) + '.' +
         pad(date.getMonth() + 1) + '.' +
         date.getFullYear() + ' ' +
         pad(date.getHours()) + ':' +
         pad(date.getMinutes());
}
