import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [slow, setSlow] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSlow(false)
    setLoading(true)
    const slowTimer = setTimeout(() => setSlow(true), 6000)
    const { error } = await signIn(email, password)
    clearTimeout(slowTimer)
    setSlow(false)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(222,47%,5%)] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 mx-auto mb-3 flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <h1 className="text-xl font-bold text-white">Call Analyzer</h1>
          <p className="text-gray-500 text-sm mt-1">WeBuildTrades · Command HQ</p>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-5">Sign in to your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[hsl(222,47%,8%)] border border-[hsl(222,32%,20%)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                placeholder="you@webuildtrades.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[hsl(222,47%,8%)] border border-[hsl(222,32%,20%)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}
            {slow && !error && (
              <p className="text-yellow-400 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                Taking longer than usual… if this keeps happening, try clearing your browser cache for this page.
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
