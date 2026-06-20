/**
 * ЗаливCRM — диагностический скрипт «Нет оплаты / Долг»
 *
 * Назначение: РАЗОВЫЙ ПРОГОН на двух проблемных аккаунтах (GS-USA-165 и GS-USA-527),
 * у которых Google показывает «Your ads aren't running — make a payment / overdue
 * balance», чтобы увидеть точные значения campaign.primary_status и
 * primary_status_reasons. Никаких изменений данных, никаких HTTP-запросов в CRM —
 * только Logger.log.
 *
 * Что собирает:
 *   1. Шапку аккаунта: customerId, валюта, пояс, customer.status.
 *   2. По каждой не-удалённой кампании: name, advertisingChannelType (тип),
 *      status, primary_status, primary_status_reasons (одной строкой через запятую).
 *   3. billing_setup-ы (статус, payments_account) — на случай, если billing-сигнал
 *      приходит оттуда.
 *   4. account_budget-ы (статус, period) — на случай, если overdue-индикация там.
 *
 * Что НЕ делает: не вычисляет тех-статус, не отправляет в /api/ingest, не пишет
 * в Sheets. Только пишет в журнал выполнения скрипта.
 *
 * Установка: см. инструкцию ниже файла (или README рядом).
 */

function main() {
  var sep = '────────────────────────────────────────────────────────';
  try {
    var acc = AdsApp.currentAccount();
    Logger.log(sep);
    Logger.log('ACCOUNT: ' + acc.getName());
    Logger.log('  customerId = ' + acc.getCustomerId());
    Logger.log('  currency   = ' + acc.getCurrencyCode());
    Logger.log('  timezone   = ' + acc.getTimeZone());

    // customer.status через GAQL — ENABLED/CANCELED/SUSPENDED/CLOSED
    try {
      var itCust = AdsApp.search('SELECT customer.status FROM customer LIMIT 1');
      while (itCust.hasNext()) {
        var rc = itCust.next();
        Logger.log('  customer.status = ' + String(rc.customer.status));
      }
    } catch (e) { Logger.log('  customer.status query error: ' + e); }

    Logger.log(sep);
    Logger.log('CAMPAIGNS (all non-removed):');

    // 1) основной запрос с primary_status и причинами
    var fetched = false;
    try {
      var q1 =
        "SELECT campaign.name, campaign.advertising_channel_type, campaign.status, " +
        "campaign.primary_status, campaign.primary_status_reasons " +
        "FROM campaign WHERE campaign.status != 'REMOVED'";
      var it1 = AdsApp.search(q1);
      while (it1.hasNext()) {
        var r = it1.next();
        var reasons = (r.campaign.primaryStatusReasons || []).map(String).join(',');
        Logger.log(
          '  • ' + r.campaign.name +
          '\n      type            = ' + r.campaign.advertisingChannelType +
          '\n      status          = ' + r.campaign.status +
          '\n      primary_status  = ' + (r.campaign.primaryStatus || '(пусто)') +
          '\n      primary_reasons = [' + reasons + ']'
        );
      }
      fetched = true;
    } catch (e) {
      Logger.log('  primary_status query error (вероятно поле недоступно в API-версии скрипта): ' + e);
    }

    // 2) фолбэк — без primary_status (если не поддерживается в этой версии Ads Script)
    if (!fetched) {
      try {
        var q1b = "SELECT campaign.name, campaign.advertising_channel_type, campaign.status " +
                  "FROM campaign WHERE campaign.status != 'REMOVED'";
        var it1b = AdsApp.search(q1b);
        while (it1b.hasNext()) {
          var rb = it1b.next();
          Logger.log(
            '  • ' + rb.campaign.name +
            '\n      type     = ' + rb.campaign.advertisingChannelType +
            '\n      status   = ' + rb.campaign.status +
            '\n      (primary_status недоступен в этой версии Ads Script API)'
          );
        }
      } catch (e2) { Logger.log('  fallback campaign query error: ' + e2); }
    }

    // 3) billing_setup — есть ли активная настройка биллинга, в каком статусе
    Logger.log(sep);
    Logger.log('BILLING_SETUPS:');
    try {
      var qb =
        "SELECT billing_setup.id, billing_setup.status, billing_setup.payments_account, " +
        "billing_setup.start_date_time, billing_setup.end_date_time FROM billing_setup";
      var itb = AdsApp.search(qb);
      var n = 0;
      while (itb.hasNext()) {
        var rbs = itb.next();
        n++;
        Logger.log(
          '  • id=' + rbs.billingSetup.id +
          ' status=' + rbs.billingSetup.status +
          ' payments_account=' + rbs.billingSetup.paymentsAccount +
          ' start=' + (rbs.billingSetup.startDateTime || '') +
          ' end=' + (rbs.billingSetup.endDateTime || '')
        );
      }
      if (n === 0) Logger.log('  (нет billing_setup-ов)');
    } catch (e) { Logger.log('  billing_setup query error: ' + e); }

    // 4) account_budget — бюджет-ордера, статусы
    Logger.log(sep);
    Logger.log('ACCOUNT_BUDGETS:');
    try {
      var qab =
        "SELECT account_budget.id, account_budget.status, account_budget.name, " +
        "account_budget.approved_start_date_time, account_budget.approved_end_date_time, " +
        "account_budget.proposed_end_date_time, account_budget.amount_served_micros, " +
        "account_budget.total_adjustments_micros FROM account_budget";
      var itab = AdsApp.search(qab);
      var na = 0;
      while (itab.hasNext()) {
        var rab = itab.next();
        na++;
        Logger.log(
          '  • id=' + rab.accountBudget.id +
          ' name=' + (rab.accountBudget.name || '') +
          ' status=' + rab.accountBudget.status +
          ' served=' + (Number(rab.accountBudget.amountServedMicros || 0) / 1e6).toFixed(2) +
          ' adjustments=' + (Number(rab.accountBudget.totalAdjustmentsMicros || 0) / 1e6).toFixed(2) +
          ' approvedStart=' + (rab.accountBudget.approvedStartDateTime || '') +
          ' approvedEnd=' + (rab.accountBudget.approvedEndDateTime || '') +
          ' proposedEnd=' + (rab.accountBudget.proposedEndDateTime || '')
        );
      }
      if (na === 0) Logger.log('  (нет account_budget)');
    } catch (e) { Logger.log('  account_budget query error: ' + e); }

    Logger.log(sep);
    Logger.log('DONE. Скопируй ВЕСЬ журнал и пришли в чат.');

  } catch (e) {
    Logger.log('FATAL: ' + e + '\n' + (e.stack || ''));
  }
}
