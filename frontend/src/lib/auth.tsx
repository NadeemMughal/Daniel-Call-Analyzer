import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:4000'
const TOKEN_KEY   = 'wbt_auth_token'
const PROFILE_KEY = 'wbt_profile'

export interface Profile {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'rep'
  department_id: string | null
  departments: { name: string } | null
}

interface AuthContextValue {
  profile:  Profile | null
  loading:  boolean
  signIn:   (email: string, password: string) => Promise<{ error: Error | null }>
  signOut:  () => void
  token:    string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStored(): { token: string | null; profile: Profile | null } {
  try {
    const token   = localStorage.getItem(TOKEN_KEY)
    const raw     = localStorage.getItem(PROFILE_KEY)
    const profile = raw ? (JSON.parse(raw) as Profile) : null
    return { token, profile }
  } catch {
    return { token: null, profile: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStored()
  const [token,   setToken]   = useState<string | null>(stored.token)
  const [profile, setProfile] = useState<Profile | null>(stored.profile)
  const [loading, setLoading] = useState(false)

  async function signIn(email: string, password: string): Promise<{ error: Error | null }> {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json() as { error?: string; access_token?: string; member?: Profile }
      if (!res.ok) {
        return { error: new Error(data.error || 'Invalid credentials') }
      }
      const t = data.access_token!
      const p = data.member!
      localStorage.setItem(TOKEN_KEY, t)
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
      setToken(t)
      setProfile(p)
      return { error: null }
    } catch {
      return { error: new Error('Cannot reach server — make sure the backend is running') }
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PROFILE_KEY)
    setToken(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ profile, loading, signIn, signOut, token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useProfile() {
  return useAuth().profile
}
