import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

// Клиент для фронтенда
export const supabase = createClient(supabaseUrl, supabaseKey)

// Клиент для API (с полным доступом, только на сервере)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseKey)
