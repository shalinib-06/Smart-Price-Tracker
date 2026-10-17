import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pool from './db';
import { requireApiKey, requireInternalKey } from './middleware/auth';
import trackRouter from './routes/track';
import itemsRouter from './routes/items';
import historyRouter from './routes/history';
import fanoutRouter from './scheduler/fanout';
import workerRouter from './scheduler/worker';
import simulateRouter from './routes/simulate';
import { initTelegramBot } from './notify/bot';

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 8083;

// ---- Middleware ----
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Api-Key'],
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiter (extension-facing endpoints)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
app.use(limiter);

// ---- Health check (no auth) ----
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Public API (extension-facing) ----
app.use('/track', requireApiKey, trackRouter);
app.use('/items', requireApiKey, itemsRouter);
app.use('/items', requireApiKey, historyRouter);
app.use('/simulate', requireApiKey, simulateRouter);
// DELETE /items/:id is on track router but mounted under /
app.use('/', requireApiKey, trackRouter);

// ---- Internal routes (Cloud Scheduler / Cloud Tasks) ----
app.use('/scrape', requireInternalKey, fanoutRouter);
app.use('/scrape', requireInternalKey, workerRouter);

// ---- Error handler ----
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
});

// ---- Start ----
async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('[db] Connected to Postgres');
    initTelegramBot();
  } catch (err) {
    console.error('[db] Cannot connect to Postgres:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('[server] Price Tracker backend running on http://localhost:' + PORT);
    console.log('[server] Routes:');
    console.log('  POST   /track');
    console.log('  GET    /items');
    console.log('  GET    /items/:id/history');
    console.log('  DELETE /items/:id');
    console.log('  POST   /scrape/fanout  (internal)');
    console.log('  POST   /scrape/work   (internal)');
    console.log('  GET    /health');
  });
}

start();
