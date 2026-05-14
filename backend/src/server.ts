import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rubricRouter from './routes/rubric.js';
import trendsRouter from './routes/trends.js';
import assistRouter from './routes/assist.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const allowedOrigins = [
  process.env.PORTAL_URL || 'http://localhost:5173',
  'https://daniel-call-analyzer.vercel.app',
]
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.some(o => origin.startsWith(o))), credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'call-analyzer-backend' }));

app.use('/rubrics', rubricRouter);
app.use('/trends', trendsRouter);
app.use('/rubric/assist', assistRouter);

app.listen(PORT, () => {
  console.log(`Backend running on :${PORT}`);
});
