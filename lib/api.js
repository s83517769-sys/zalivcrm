import { supabaseClient } from './supabase'

// Клиентский fetch для UI: добавляет Bearer-токен текущей сессии Supabase Auth
export async function api(path, opts = {}) {
  const { data } = await supabaseClient.auth.getSession()
  const token = data?.session?.access_token
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  return res.json()
}
