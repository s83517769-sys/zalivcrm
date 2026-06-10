/**
 * ЗаливCRM — Скрипт мониторинга v2 (одиночный аккаунт)
 *
 * УСТАНОВКА:
 * 1. Google Ads → нужный аккаунт → Инструменты → Массовые действия → Скрипты
 * 2. Создать скрипт → вставить весь этот код
 * 3. Вписать ACCOUNT_NAME (как в ЗаливCRM) и API_KEY
 * 4. Авторизовать → Сохранить → Триггер: каждый час
 *
 * Что шлёт:
 *  - точный тех.статус (Крутит N/M, Отклонены+причина, Бюджет, Пауза)
 *  - почасовой спенд за сегодня+вчера по поясу аккаунта + сам пояс
 *  - детализацию по кампаниям (для раскрытия в карточке)
 *  - нативную валюту
 * «Бан» скрипт НЕ определяет (Google его не отдаёт) — это ручной статус,
 * плюс CRM ловит «тратил → замолчал» как подсказку.
 */

var API_KEY      = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a';
var API_URL      = 'https://zalivcrm.vercel.app/api/ingest';
var ACCOUNT_NAME = 'SL-USA-159';   // ← как в ЗаливCRM

function main() {
  try {
    var acc      = AdsApp.currentAccount();
    var accId    = acc.getCustomerId();
    var currency = acc.getCurrencyCode();
    var tz       = acc.getTimeZone();              // напр. "America/New_York"

    var now   = new Date();
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    var yest  = Utilities.formatDate(new Date(now.getTime() - 86400000), tz, 'yyyy-MM-dd');

    var hourly    = getHourly(yest, today);
    var campaigns = getCampaigns(today);
    var status    = computeStatus(campaigns);

    // Легаси-поля (для совместимости со старым ingest на время перехода)
    var todayAgg = aggregate(hourly, today);
    var yestAgg  = aggregate(hourly, yest);

    var payload = {
      api_key: API_KEY,
      batch: [{
        name:             ACCOUNT_NAME,
        google_ads_id:    accId,
        currency:         currency,
        account_timezone: tz,

        tech_status: status.status,   // Крутит | Отклонены | Бюджет | Пауза
        tech_note:   status.note,     // "2/5" или причина отклонения, иначе ""

        campaigns: campaigns,         // детализация для карточки
        hourly:    hourly,            // [{date,hour,cost,clicks,conversions,impressions}]

        // ── совместимость со старым форматом ──
        today_cost:   todayAgg.cost,
        today_clicks: todayAgg.clicks,
        today_conv:   todayAgg.conversions,
        today_cpc:    todayAgg.clicks > 0 ? todayAgg.cost / todayAgg.clicks : 0,
        yest_cost:    yestAgg.cost,
        yest_clicks:  yestAgg.clicks,
        yest_conv:    yestAgg.conversions,
        yest_cpc:     yestAgg.clicks > 0 ? yestAgg.cost / yestAgg.clicks : 0
      }]
    };

    send(payload);
    Logger.log('OK | ' + ACCOUNT_NAME + ' | ' + status.status +
      (status.note ? ' (' + status.note + ')' : '') +
      ' | hourly rows: ' + hourly.length + ' | today $' + todayAgg.cost.toFixed(2));

  } catch (e) {
    Logger.log('ERROR: ' + e + '\n' + (e.stack || ''));
  }
}

/** Почасовой спенд за [yest..today] по поясу аккаунта */
function getHourly(yest, today) {
  var out = [];
  try {
    var q =
      "SELECT segments.date, segments.hour, metrics.cost_micros, metrics.clicks, " +
      "metrics.conversions, metrics.impressions " +
      "FROM customer " +
      "WHERE segments.date BETWEEN '" + yest + "' AND '" + today + "'";
    var it = AdsApp.search(q);
    while (it.hasNext()) {
      var r = it.next();
      out.push({
        date:        r.segments.date,
        hour:        Number(r.segments.hour),
        cost:        Number(r.metrics.costMicros) / 1000000,
        clicks:      Number(r.metrics.clicks) || 0,
        conversions: Number(r.metrics.conversions) || 0,
        impressions: Number(r.metrics.impressions) || 0
      });
    }
  } catch (e) {
    Logger.log('getHourly error: ' + e);
  }
  return out;
}

/** Кампании: статус, serving, бюджет-лимит, расход/показы за сегодня, отклонения */
function getCampaigns(today) {
  var byName = {};

  // 1) все не-removed кампании + статус (+ primary_status, если доступен)
  var fetched = false;
  try {
    var q1 =
      "SELECT campaign.name, campaign.status, campaign.primary_status, " +
      "campaign.primary_status_reasons FROM campaign WHERE campaign.status != 'REMOVED'";
    var it1 = AdsApp.search(q1);
    while (it1.hasNext()) {
      var r = it1.next();
      byName[r.campaign.name] = {
        name: r.campaign.name,
        status: String(r.campaign.status),
        primary_status: r.campaign.primaryStatus ? String(r.campaign.primaryStatus) : '',
        primary_reasons: r.campaign.primaryStatusReasons || [],
        cost_today: 0, impressions_today: 0, approval: 'OK', reason: ''
      };
    }
    fetched = true;
  } catch (e) {
    Logger.log('campaign primary_status not available, fallback: ' + e);
  }
  if (!fetched) {
    try {
      var q1b = "SELECT campaign.name, campaign.status FROM campaign WHERE campaign.status != 'REMOVED'";
      var it1b = AdsApp.search(q1b);
      while (it1b.hasNext()) {
        var rb = it1b.next();
        byName[rb.campaign.name] = {
          name: rb.campaign.name, status: String(rb.campaign.status),
          primary_status: '', primary_reasons: [],
          cost_today: 0, impressions_today: 0, approval: 'OK', reason: ''
        };
      }
    } catch (e2) { Logger.log('campaign fallback error: ' + e2); }
  }

  // 2) метрики за сегодня по кампаниям
  try {
    var q2 =
      "SELECT campaign.name, metrics.cost_micros, metrics.impressions " +
      "FROM campaign WHERE segments.date DURING TODAY";
    var it2 = AdsApp.search(q2);
    while (it2.hasNext()) {
      var r2 = it2.next();
      var c = byName[r2.campaign.name];
      if (c) {
        c.cost_today = Number(r2.metrics.costMicros) / 1000000;
        c.impressions_today = Number(r2.metrics.impressions) || 0;
      }
    }
  } catch (e) { Logger.log('campaign metrics error: ' + e); }

  // 3) отклонённые объявления + причина (топ policy topic)
  try {
    var q3 =
      "SELECT campaign.name, ad_group_ad.policy_summary.approval_status, " +
      "ad_group_ad.policy_summary.policy_topic_entries " +
      "FROM ad_group_ad WHERE ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'";
    var it3 = AdsApp.search(q3);
    while (it3.hasNext()) {
      var r3 = it3.next();
      var c3 = byName[r3.campaign.name];
      if (c3) {
        c3.approval = 'DISAPPROVED';
        if (!c3.reason) {
          var entries = r3.adGroupAd.policySummary.policyTopicEntries || [];
          if (entries.length && entries[0].topic) c3.reason = String(entries[0].topic);
        }
      }
    }
  } catch (e) { Logger.log('disapproval error: ' + e); }

  var list = [];
  for (var k in byName) list.push(byName[k]);
  return list;
}

/** Тех.статус по приоритету: Крутит → Отклонены → Бюджет → Пауза */
function computeStatus(campaigns) {
  var M = campaigns.length;
  var serving = 0, disapproved = 0, budgetLimited = false, topReason = '';

  for (var i = 0; i < campaigns.length; i++) {
    var c = campaigns[i];
    var isEnabled = c.status === 'ENABLED';
    if (isEnabled && (c.impressions_today > 0 || c.cost_today > 0)) serving++;
    if (c.approval === 'DISAPPROVED') { disapproved++; if (!topReason) topReason = c.reason; }
    var reasons = (c.primary_reasons || []).join(',');
    if (isEnabled && reasons.indexOf('BUDGET') >= 0) budgetLimited = true;
  }

  if (serving > 0)       return { status: 'Крутит',    note: serving < M ? (serving + '/' + M) : '' };
  if (disapproved > 0)   return { status: 'Отклонены', note: topReason || '' };
  if (budgetLimited)     return { status: 'Бюджет',    note: '' };
  return { status: 'Пауза', note: '' };
}

/** Сумма почасовых за конкретную дату (для легаси today/yest) */
function aggregate(hourly, date) {
  var s = { cost: 0, clicks: 0, conversions: 0, impressions: 0 };
  for (var i = 0; i < hourly.length; i++) {
    if (hourly[i].date !== date) continue;
    s.cost += hourly[i].cost; s.clicks += hourly[i].clicks;
    s.conversions += hourly[i].conversions; s.impressions += hourly[i].impressions;
  }
  return s;
}

function send(payload) {
  var options = {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };
  try {
    var resp = UrlFetchApp.fetch(API_URL, options);
    Logger.log('API ' + resp.getResponseCode() + ' — ' + resp.getContentText());
  } catch (e) {
    Logger.log('send error: ' + e);
  }
}
