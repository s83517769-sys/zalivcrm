import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabaseClient } from './supabase'

// Защита страниц: если нет сессии — редирект на /login
export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    function ensureUserRow(session) {
      if (!session) return
      fetch('/api/users/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: session.user?.email || '' }),
      }).catch(() => {})
    }

    supabaseClient.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (!data.session) { router.replace('/login'); return }
      setUser(data.session.user)
      setLoading(false)
      ensureUserRow(data.session)
    })

    const { data: sub } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (!session) { setUser(null); router.replace('/login') }
      else {
        setUser(session.user); setLoading(false)
        if (event === 'SIGNED_IN') ensureUserRow(session)
      }
    })

    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  async function signOut() {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  return { user, loading, signOut }
}
