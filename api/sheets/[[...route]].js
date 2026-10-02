/**
 * Vercel serverless function — /api/sheets/*
 *
 * Ayni is mantigini Express sunucusu ile paylasir (server/route-handler.js).
 * Servis hesabi anahtari yalnizca sunucu tarafinda (environment variable)
 * okunur; istemciye hicbir kimlik bilgisi gonderilmez.
 */
import { handleApi } from '../../server/route-handler.js';

export default async function handler(req, res) {
  // Vercel govdeyi JSON olarak ayristirir; yine de string ise bir kez daha
  try {
    if (typeof req.body === 'string' && req.body.length > 0) {
      req.body = JSON.parse(req.body);
    }
  } catch {
    req.body = {};
  }

  // /api/sheets/<...>  ->  ['<...>']
  // (Ayrıca /api/<...> biçimi de desteklenir.)
  const raw = req.url || '';
  const pathOnly = raw.split('?')[0];
  const parts = pathOnly.split('/').filter(Boolean); // ['api','sheets',...]

  let segments = parts.slice(1); // 'api' at
  if (segments[0] === 'sheets') segments = segments.slice(1);
  if (segments.length === 1 && segments[0] === '') segments = [];

  const { status, body } = await handleApi(
    req.method || 'GET',
    segments,
    req.body || {}
  );

  res.status(status).json(body);
}

export const config = {
  // Vercel Hobby planinda fonksiyon suresi en fazla 60 saniyedir.
  // Google API cagrilari (kimlik dogrulama + okuma + yazma) normalde
  // 1-3 saniye surer; 15 saniye hem cold start'i karsilayacak kadar
  // genis, hem de platformun sert limitinin icinde kalir.
  //
  // ONCEDEN 60 idi. Istemcinin zaman asimi kaldirilmadan once bu deger
  // Vercel tarafindan reddediliyordu ve fonksiyon hic calismiyordu;
  // kullanici yalnizca "zaman asimina ugradi" goruyordu.
  maxDuration: 15,
};
