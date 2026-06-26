import { supabaseAdmin } from '../../../lib/supabase'
import { getUserIdFromRequest } from '../../../lib/auth'

// POST /api/fx/refresh
//
// Подтягивает живые курсы валют к USD и кладёт их в user_settings.currency_rates
// текущего юзера. Фронт уже читает currency_rates для нормализации спенда
// (натив × курс = USD) — мы только наполняем их свежими числами, формулу не трогаем.
//
// Источник: Frankfurter (ЕЦБ, без ключа). base=USD отдаёт «единиц валюты за 1 USD»
// (1 USD = 1.49 AUD). Нам нужно ОБРАТНОЕ — «USD за 1 единицу» (1 AUD = 0.67 USD),
// потому что нормализация = натив × rate. Значит rate = 1 / frankfurter_rate.
// Проверка направления: EUR ~0.92 за USD → 1/0.92 ≈ 1.087 (совпадает с ручным 1.08);
// AUD ~1.49 → 1/1.49 ≈ 0.671 (совпадает с ручным 0.66). USD остаётся 1.
//
// Идемпотентно и безопасно:
//  - сбой внешнего API → 200 { ok:false }, существующие курсы НЕ затираются;
//  - валюты, которые источник не вернул, сохраняются (ручной CAD и т.п. не пропадает);
//  - коды из fx_meta.manual (ручной оверрайд) авто-обновление не трогает;
//  - троттлинг: если уже обновляли сегодня и не force — внешний API не дёргаем.
//
// Запросы к БД — через getUserIdFromRequest, без хардкода user_id.

const FRANKFURTER = 'https://api.frankfurter.dev/v2/latest?base=USD'
const FALLBACK    = 'https://open.er-api.com/v6/latest/USD'

async function fetchUsdRates() {
  // Primary — Frankfurter
  try {
    const r = await fetch(FRANKFURTER, { headers: { accept: 'application/json' } })
    if (r.ok) {
      const j = await r.json()
      if (j?.rates && Object.keys(j.rates).length) {
        return { rates: j.rates, fx_date: j.date || null, source: 'frankfurter' }
      }
    }
  } catch {}
  // Fallback — open.er-api.com (тоже base=USD, то же направление)
  try {
    const r = await fetch(FALLBACK, { headers: { accept: 'application/json' } })
    if (r.ok) {
      const j = await r.json()
      if (j?.result === 'success' && j?.rates && Object.keys(j.rates).length) {
        const fx_date = j.time_last_update_utc
          ? new Date(j.time_last_update_utc).toISOString().slice(0, 10)
          : null
        return { rates: j.rates, fx_date, source: 'er-api' }
      }
    }
  } catch {}
  return null
}

export default async function handler(req, res) {
  const userId = await getUserIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const force = req.body?.force === true

  // Текущее состояние — чтобы не затереть ручные курсы и поддержать троттлинг
  const { data: row } = await supabaseAdmin
    .from('user_settings')
    .select('currency_rates, fx_meta')
    .eq('user_id', userId)
    .maybeSingle()

  const existing = (row?.currency_rates && typeof row.currency_rates === 'object') ? row.currency_rates : {}
  const meta     = (row?.fx_meta && typeof row.fx_meta === 'object') ? row.fx_meta : {}
  const manualSet = new Set((Array.isArray(meta.manual) ? meta.manual : []).map(c => String(c).toUpperCase()))

  const todayUTC = new Date().toISOString().slice(0, 10)

  // Троттлинг: курсы ЕЦБ обновляются раз в день — если уже обновили сегодня и не
  // форсим, внешний API не трогаем (но отдаём актуальные курсы из БД).
  if (!force && meta.updated_at && String(meta.updated_at).slice(0, 10) === todayUTC) {
    return res.status(200).json({
      ok: true, skipped: 'fresh', updated_at: meta.updated_at,
      source: meta.source || null, fx_date: meta.fx_date || null,
      rates: { USD: 1, ...existing },
    })
  }

  const fetched = await fetchUsdRates()
  if (!fetched) {
    // Внешний сбой — НИЧЕГО не пишем, существующие курсы целы
    return res.status(200).json({
      ok: false, reason: 'fx_unavailable', updated_at: meta.updated_at || null,
      rates: { USD: 1, ...existing },
    })
  }

  // Инверсия + мердж: ручные коды не трогаем, ненайденные сохраняем
  const next = { ...existing, USD: 1 }
  for (const [code, perUsd] of Object.entries(fetched.rates)) {
    const cur = code.toUpperCase()
    if (cur === 'USD') continue
    if (manualSet.has(cur)) continue           // ручной оверрайд — не трогаем
    const v = +perUsd
    if (!Number.isFinite(v) || v <= 0) continue
    next[cur] = Math.round((1 / v) * 1e6) / 1e6  // «USD за 1 единицу валюты»
  }

  const nextMeta = {
    ...meta,
    manual: [...manualSet],
    updated_at: new Date().toISOString(),
    source: fetched.source,
    fx_date: fetched.fx_date,
  }

  // Частичный upsert (как в /api/users/settings) — прочие настройки не трогаются.
  // Если колонки fx_meta ещё нет (миграция не выполнена) — повторяем без неё,
  // чтобы автообновление курсов всё равно работало.
  let { error } = await supabaseAdmin
    .from('user_settings')
    .upsert(
      { user_id: userId, currency_rates: next, fx_meta: nextMeta, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error && /fx_meta/i.test(error.message || '')) {
    const retry = await supabaseAdmin
      .from('user_settings')
      .upsert(
        { user_id: userId, currency_rates: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    error = retry.error
  }
  if (error) {
    return res.status(200).json({ ok: false, reason: error.message, rates: { USD: 1, ...existing } })
  }

  return res.status(200).json({
    ok: true, updated_at: nextMeta.updated_at, source: fetched.source,
    fx_date: fetched.fx_date, rates: next,
  })
}
