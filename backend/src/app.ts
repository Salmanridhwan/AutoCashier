import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env (backend/src → backend → root)
const envPath = path.resolve(__dirname, '../../.env');
const r = dotenv.config({ path: envPath });
if (r.error) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

const app = express();

// --- CORS Configuration ---
const configuredOrigin = process.env.CORS_ORIGIN || 'http://localhost:3010,http://localhost:3011,http://localhost:3012';
const allowedOrigins = configuredOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // In development, allow all origins
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// --- Body Parsers ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Logger ---
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Static files (uploads) ---
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// --- API Routes ---
import apiRouter from './routes/index.js';
app.use('/api', apiRouter);

// --- Health check ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'AutoCashier Backend', timestamp: new Date().toISOString() });
});

// --- Production static serving ---
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');

  // Serve static files from frontend dist folder
  app.use('/admin', express.static(frontendDist));

  // SPA fallback: any route under /admin/* that doesn't match a static file serves index.html
  app.get('/admin/*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  // Root landing page redirects to the admin dashboard
  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/admin');
  });
}

// --- 404 Handler ---
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
    return;
  }
  // For non-API routes, return an HTML 404 page
  res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Not Found | AutoCashier</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #334155; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 4rem; margin: 0; color: #3b5bdb; }
    p { font-size: 1.25rem; margin: 1rem 0; }
    a { color: #3b5bdb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .links { margin-top: 2rem; display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Halaman yang Anda cari tidak ditemukan.</p>
    <div class="links">
      <a href="/">Beranda</a>
      <a href="/admin">Admin Dashboard</a>
      <a href="/kasir">Kasir POS</a>
    </div>
  </div>
</body>
</html>`);
});

// --- Global Error Handler ---
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

export default app;
