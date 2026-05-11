import { Outlet, NavLink } from 'react-router-dom'
import { PhoneCall, TrendingUp, BookOpen, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/calls',  label: 'Calls',   icon: PhoneCall  },
  { to: '/trends', label: 'Trends',  icon: TrendingUp },
  { to: '/rubric', label: 'Rubric',  icon: BookOpen   },
]

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-brand flex flex-col shrink-0">
        <div className="px-5 py-6 flex items-center gap-2 border-b border-white/10">
          <BarChart2 className="text-white w-5 h-5" />
          <span className="text-white font-semibold text-sm tracking-wide">Call Analyzer</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-white/40 text-xs">WeBuildTrades</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
