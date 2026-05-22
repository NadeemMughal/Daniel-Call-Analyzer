import { NextRequest, NextResponse } from 'next/server'

// Comma-separated list of allowed origins, e.g.:
//   PORTAL_URL=https://app.vercel.app,http://localhost:5173
const ALLOWED: string[] = (process.env.PORTAL_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Fallback: allow all *.vercel.app + localhost in dev when PORTAL_URL not set
function isAllowed(origin: string): boolean {
  if (ALLOWED.length === 0) return true          // no restriction configured
  return ALLOWED.some(a => a === origin)
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const allowed = isAllowed(origin)

  // Handle preflight
  if (req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    if (allowed && origin) res.headers.set('Access-Control-Allow-Origin', origin)
    else if (!origin)      res.headers.set('Access-Control-Allow-Origin', '*')
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.headers.set('Access-Control-Allow-Credentials', 'true')
    res.headers.set('Access-Control-Max-Age', '86400')
    return res
  }

  const res = NextResponse.next()
  if (allowed && origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Credentials', 'true')
  } else if (!origin) {
    res.headers.set('Access-Control-Allow-Origin', '*')
  }
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

export const config = {
  matcher: '/api/:path*',
}
