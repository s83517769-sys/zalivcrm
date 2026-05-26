import { supabaseAdmin } from '../../../lib/supabase'

const API_KEY = 'c4194b8cb195929b2a8a1284d65b4347ddded7171af69efd6a51d204eb03f98a'
const USER_ID = '6c5ac05d-b307-46dc-a162-00a09a1e020a'

const FROZEN = ['БАН', 'На смену', 'Отмена запуска']

export default async function handler(req, res) {
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { accounts } = req.body
  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: 'accounts array required' })
  }

  const today = new Date().toISOString().split('T')[0]

  const rows = accounts
    .filter(a => (a.name || '').trim())
    .map(a => {
      const row = { ...a, user_id: USER_ID }
      const status = row.status || 'Пуск'
      row.status = status

      if (status === 'Пуск' && !row.launch_date) row.launch_date = today
      if (status.toLowerCase().includes('крутит') && !row.crut_date) row.crut_date = today
      if (FROZEN.includes(status)) {
        row.is_frozen = true
        if (!row.ban_date) row.ban_date = today
      }

      // Пустые строки → null
      Object.keys(row).forEach(k => { if (row[k] === '') row[k] = null })
      return row
    })

  if (rows.length === 0) return res.status(400).json({ error: 'No valid rows' })

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .insert(rows)
    .select()

  if (error) {
    console.error('BULK INSERT ERROR:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ ok: true, created: data.length, accounts: data })
}
