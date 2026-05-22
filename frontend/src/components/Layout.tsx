import { useEffect, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  PhoneCall, TrendingUp, BookOpen, Activity, Briefcase,
  Users as UsersIcon, Search, Wrench, Banknote, Megaphone, AlertTriangle,
  LayoutDashboard, TrendingDown, Building2, LogOut,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { useAuth, useProfile } from '@/lib/auth'
import { cn } from '@/lib/utils'
import ChatWidget from './ChatWidget'

const PRIMARY_NAV = [
  { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard, adminOnly: false },
  { to: '/calls',     label: 'All Calls',  icon: PhoneCall,        adminOnly: false },
  { to: '/clients',   label: 'Clients',    icon: Building2,        adminOnly: false },
  { to: '/teams',     label: 'Teams',      icon: UsersIcon,        adminOnly: false },
  { to: '/trends',    label: 'Trends',     icon: TrendingUp,       adminOnly: false },
  { to: '/coaching',  label: 'Coaching',   icon: TrendingDown,     adminOnly: false },
  { to: '/rubric',    label: 'Rubric',     icon: BookOpen,         adminOnly: true  },
  { to: '/failures',  label: 'Failures',   icon: AlertTriangle,    adminOnly: true  },
]

const ROLE_BADGE: Record<string, string> = {
  admin:   'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  manager: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  rep:     'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}

const DEPT_ICONS: Record<string, any> = {
  exec: Briefcase,
  sales: UsersIcon,
  seo: Search,
  ops: Wrench,
  finance: Banknote,
  content: Megaphone,
}

interface Dept {
  id: string
  name: string
  kind: string
  count?: number
}

export default function Layout() {
  const [depts, setDepts] = useState<Dept[]>([])
  const { signOut } = useAuth()
  const profile = useProfile()

  useEffect(() => {
    // Load departments from Supabase (anon read policy exists for departments)
    // Call counts come from the backend dashboard endpoint (bypasses RLS)
    Promise.all([
      supabase.from('departments').select('id, name, kind').order('name'),
      api.analytics.dashboard().catch(() => null),
    ]).then(([dRes, dash]) => {
      if (!dRes.data) return
      const byDept: Record<string, number> = {}
      for (const d of (dash?.byDept ?? [])) {
        // match by name since IDs aren't in dashboard response
        byDept[d.name] = d.count
      }
      setDepts((dRes.data as Dept[]).map(d => ({ ...d, count: byDept[d.name] || 0 })))
    })
  }, [])

  const visibleNav = PRIMARY_NAV.filter(n => {
    if (!n.adminOnly) return true
    return !profile || profile.role === 'admin'
  })

  const initials = profile?.name
    ? profile.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className="min-h-screen flex grid-bg">
      <aside className="w-64 bg-[hsl(222,47%,6%)] border-r border-[hsl(222,32%,15%)] flex flex-col shrink-0">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-[hsl(222,32%,15%)]">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <Activity className="text-white w-4 h-4" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-white font-semibold text-[13px]">Call Analyzer</span>
            <span className="text-gray-500 text-[10px] uppercase tracking-wider">WeBuildTrades</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) =>
                cn('flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors',
                  isActive
                    ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500 pl-[10px]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
              end={to === '/calls'}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} /> {label}
            </NavLink>
          ))}

          <div className="pt-5 pb-2 px-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Departments</span>
              <span className="text-[10px] text-gray-700">{depts.length}</span>
            </div>
          </div>

          {depts.length === 0 ? (
            <p className="px-3 text-[11px] text-gray-600">Run migration 0004 to seed departments.</p>
          ) : depts.map(d => {
            const Icon = DEPT_ICONS[d.kind] || Briefcase
            return (
              <NavLink
                key={d.id}
                to={`/calls?dept=${d.id}`}
                className={({ isActive }) => {
                  const path = window.location.search.includes(`dept=${d.id}`)
                  return cn('flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors group',
                    (isActive && path) || path
                      ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500 pl-[10px]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5')
                }}
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="flex-1">{d.name}</span>
                {d.count !== undefined && d.count > 0 && (
                  <span className="text-[10px] bg-[hsl(222,47%,12%)] text-gray-400 px-1.5 py-0.5 rounded font-mono">{d.count}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-[hsl(222,32%,15%)]">
          {profile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/25 flex items-center justify-center text-blue-400 text-[11px] font-bold shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white truncate">{profile.name}</p>
                  {profile.departments?.name && (
                    <p className="text-[10px] text-gray-500 truncate">{profile.departments.name}</p>
                  )}
                </div>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${ROLE_BADGE[profile.role] ?? ROLE_BADGE.rep}`}>
                  {profile.role}
                </span>
              </div>
              <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          ) : (
            <p className="text-gray-600 text-[10px] uppercase tracking-wider">v1 · internal</p>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <ChatWidget />
    </div>
  )
}
