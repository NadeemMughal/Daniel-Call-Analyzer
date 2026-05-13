import { useEffect, useState } from 'react'
import { Outlet, NavLink, useSearchParams } from 'react-router-dom'
import {
  PhoneCall, TrendingUp, BookOpen, Activity, Briefcase,
  Users as UsersIcon, Search, Wrench, Banknote, Megaphone, AlertTriangle,
  LayoutDashboard, TrendingDown
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const PRIMARY_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calls', label: 'All Calls', icon: PhoneCall },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/coaching', label: 'Coaching', icon: TrendingDown },
  { to: '/rubric', label: 'Rubric', icon: BookOpen },
  { to: '/failures', label: 'Failures', icon: AlertTriangle },
]

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

  useEffect(() => {
    Promise.all([
      supabase.from('departments').select('id, name, kind').order('name'),
      supabase.from('calls').select('department_id'),
    ]).then(([dRes, cRes]) => {
      if (!dRes.data) return
      const counts: Record<string, number> = {}
      for (const c of (cRes.data || [])) {
        if (c.department_id) counts[c.department_id] = (counts[c.department_id] || 0) + 1
      }
      setDepts((dRes.data as Dept[]).map(d => ({ ...d, count: counts[d.id] || 0 })))
    })
  }, [])

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
          {PRIMARY_NAV.map(({ to, label, icon: Icon }) => (
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

        <div className="px-5 py-4 border-t border-[hsl(222,32%,15%)]">
          <p className="text-gray-600 text-[10px] uppercase tracking-wider">v1 · internal</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
