/**
 * Zula Suite - Google Sheets API (Express sunucusu).
 *
 * Servis hesabi anahtari yalnizca bu surecte tutulur; frontend'e sizmaz.
 *
 * Kullanim:
 *   npm run server
 *   veya:  npm start
 *
 * NOT: Vercel'de ayni API /api/sheets/* adresinden serverless function olarak
 * da sunulur (api/sheets/[[...route]].js). Ikisi ayni is mantigini paylasir.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { handleApi } from './route-handler.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);

const app = express();

/**
 * CORS: varsayilanda tum kaynaklara acik. Isterseniz kisitleyin:
 *   CORS_ORIGIN=https://<uygulama-adresiniz>
 */
const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
app.use(
  cors({
    origin: corsOrigin || true,
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

app.use(express.json({ limit: '10mb' }));

/**
 * /api/... isteklerini ortak yonlendiriciye aktarir.
 * Hem /api/sheets/status hem /api/status kabul edilir.
 */
app.all(/^\/api\/(.*)$/, async (req, res) => {
  let segments = (req.params[0] || '').split('/').filter(Boolean);
  if (segments[0] === 'sheets') segments = segments.slice(1);
  const { status, body } = await handleApi(req.method, segments, req.body || {});
  res.status(status).json(body);
});

/** Derlenmis paneli sun (production) */
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  const hasCreds =
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
    fs.existsSync(path.join(__dirname, 'service-account.json'));
  console.log('Zula Suite Sheets API  ->  http://localhost:' + PORT);
  console.log('Kimlik bilgisi:', hasCreds ? 'bulundu' : 'YOK (service-account.json veya .env gerekli)');
});
