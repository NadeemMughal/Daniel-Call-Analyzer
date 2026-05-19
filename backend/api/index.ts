import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rubricRouter from '../src/routes/rubric.js'
import trendsRouter from '../src/routes/trends.js'
import assistRouter from '../src/routes/assist.js'
import analyticsRouter from '../src/routes/analytics.js'

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const allowed =
      origin === (process.env.PORTAL_URL || 'http://localhost:5173') ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com') ||
      origin.startsWith('http://localhost')
    cb(null, allowed)
  },
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'call-analyzer-backend' }))
app.use('/rubrics', rubricRouter)
app.use('/trends', trendsRouter)
app.use('/rubric/assist', assistRouter)
app.use('/analytics', analyticsRouter)

export default app
