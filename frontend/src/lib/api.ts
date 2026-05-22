const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:4000'
const TOKEN_KEY   = 'wbt_auth_token'

async function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export const api = {
  analytics: {
    overview:    (weeks = 8) => authFetch(`/analytics/overview?weeks=${weeks}`),
    leaderboard: () => authFetch('/analytics/leaderboard'),
    memberCards: () => authFetch('/analytics/member-cards'),
    clients:     () => authFetch('/analytics/clients'),
    dashboard:   () => authFetch('/analytics/dashboard'),
  },
  members: {
    list:       () => authFetch('/members') as Promise<any[]>,
    me:         () => authFetch('/members/me'),
    get:        (id: string) => authFetch(`/members/${id}`),
    notes:      (id: string) => authFetch(`/members/${id}/notes`),
    addNote:    (id: string, content: string) => authFetch(`/members/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
    deleteNote: (memberId: string, noteId: string) => authFetch(`/members/${memberId}/notes/${noteId}`, { method: 'DELETE' }),
  },
  calls: {
    list: (params: { type?: string; status?: string; dept?: string; limit?: number } = {}) => {
      const qs = new URLSearchParams()
      if (params.type)   qs.set('type',   params.type)
      if (params.status) qs.set('status', params.status)
      if (params.dept)   qs.set('dept',   params.dept)
      if (params.limit)  qs.set('limit',  String(params.limit))
      const q = qs.toString()
      return authFetch(`/calls${q ? '?' + q : ''}`) as Promise<any[]>
    },
    get: (id: string) => authFetch(`/calls/${id}`),
  },
  clients: {
    get: (id: string) => authFetch(`/clients/${id}`),
  },
  rubric: {
    list:   () => authFetch('/rubrics'),
    active: () => authFetch('/rubrics/active'),
    create: (body: unknown) => authFetch('/rubrics', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => authFetch(`/rubrics/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  trends: {
    member: (memberId: string) => authFetch(`/trends/${memberId}`),
  },
  chat: {
    send: (messages: { role: string; content: string }[]) =>
      authFetch('/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  },
}
