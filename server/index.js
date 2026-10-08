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
 * CORS: varsayilanda tum kaynaklara acik.
 *
 * GUVENLIK: Open CORS, API uc noktalarinin tarayicidan dogrudan
 * cagrilabilmesi demektir. Sifre gerektirmeyen bir uc noktaya
 * (or. /api/sheets/login) siteler arasi istek atilabilir ve kurbanin
 * tarayicisi kullanilarak kaba kuvvet denemesi yapilabilir.
 *
 * Guvenli varsayilan: yalnizca beyaz listedeki kaynaklara izin ver.
 * Liste yoksa hicbir dis kaynaga izin verilmez (API yalnizca panelin
 * kendi adresinden ve sunucudan cagrilabilir).
 */
const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
const ALLOWED_ORIGINS = corsOrigin
  ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin(origin, callback) {
      // Sunucu ici / curl isteklerinde Origin header yoktur
      if (!origin) return callback(null, true);

      // Ayni sunucudan gelen istekler (yayin adresi) serbest
      const selfOrigins = [
        'https://zula-teskilat.vercel.app',
        'https://odetecegim.github.io',
      ];

      if (selfOrigins.includes(origin)) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

      // Beyaz listede yoksa reddet
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    // Istemcinin sunucuya gonderdigi dogrulama basligi
    allowedHeaders: ['Content-Type', 'x-session-token', 'x-api-key'],
    credentials: false,
    maxAge: 600,
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
  // GET isteklerinde govde yoktur; musteriler query string ile
  // gonderir (spreadsheetId, tab ...). Bunlari body'ye birlestiririz
  // boylece route-handler ayni okuma dalini kullanmaya devam eder.
  const mergedBody = { ...req.query, ...(req.body || {}) };
  const { status, body } = await handleApi(
    req.method,
    segments,
    mergedBody,
    req.headers || {}
  );
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
