import { supabaseAdmin } from './supabase'

// Достаёт user_id из Bearer-токена (UI-эндпоинты)
export async function getUserIdFromRequest(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

// Достаёт user_id по api_key из таблицы users (скрипты Google Ads)
export async function getUserIdByApiKey(apiKey) {
  if (!apiKey) return null
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, plan, trial_ends_at')
    .eq('api_key', apiKey)
    .single()
  return data || null
}
