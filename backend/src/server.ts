import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rubricRouter from './routes/rubric.js';
import trendsRouter from './routes/trends.js';
import assistRouter from './routes/assist.js';
import analyticsRouter from './routes/analytics.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

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
}));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'call-analyzer-backend' }));

app.use('/rubrics', rubricRouter);
app.use('/trends', trendsRouter);
app.use('/rubric/assist', assistRouter);
app.use('/analytics', analyticsRouter);

app.listen(PORT, () => {
  console.log(`Backend running on :${PORT}`);
});
