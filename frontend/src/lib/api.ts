import { supabase } from './supabase'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:4000'

async function authFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export const api = {
  analytics: {
    overview: (weeks = 8) => authFetch(`/analytics/overview?weeks=${weeks}`),
    leaderboard: () => authFetch('/analytics/leaderboard'),
    memberCards: () => authFetch('/analytics/member-cards'),
    clients: () => authFetch('/analytics/clients'),
  },
  rubric: {
    list: () => authFetch('/rubrics'),
    active: () => authFetch('/rubrics/active'),
    create: (body: unknown) => authFetch('/rubrics', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => authFetch(`/rubrics/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  trends: {
    member: (memberId: string) => authFetch(`/trends/${memberId}`),
  },
}
