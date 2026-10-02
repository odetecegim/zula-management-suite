/**
 * API KIMLIK DOGRULAMA (server/auth.js)
 *
 * GUVENLIK ACIGI — 2026-10-02 testinde bulundu:
 * Onceki surumde /api/sheets/* uclarinin HICBIR biri sifre istiyordu.
 * Yani internete acik herkes:
 *   - GET  /members  -> tum uye listesini (e-posta, oyuncu id, roller) okuyabildi
 *   - POST /members  -> istedigi rolu (super_admin dahil) yazabiliyordu
 *   - POST /member-delete -> uye silebiliyordu
 * Panelin icindeki "yetki kontrolleri" yalnizca ARAYUZ katmaninda
 * calisiyordu; dogrudan HTTP istegi atmak hepsini atliyordu.
 *
 * COZUM:
 * 1) Uc noktalar artik `x-api-key` basligi ister (ADMIN_API_KEY).
 * 2) Istemci, giris sirasinda sunucudan alinan oturum belirtecini
 *    (session token) her istekte gonderir.
 * 3) Belirtecin omru kisitlidir ve sunucuda tutulur.
 *
 * Ayrica:
 * - Yazma uc noktalari yalnizca yonetici (super_admin) belirteciyle.
 * - CORS yalnizca beyaz listedeki kaynaklara acik.
 */

import crypto from 'node:crypto';

/** Yonetim anahtari; ortam degiskeninden gelir. */
const ADMIN_API_KEY = () => String(process.env.ADMIN_API_KEY || '').trim();

/**
 * Oturum belirtecleri. Bellek ici (Map) tutulur; surec yeniden
 * basladiginda hepsi gecersizlesir — bu bilerek: sunucu olusten
 * sonra tum oturumlarin yeniden giris yapmasini zorunlu kilar.
 */
const sessions = new Map();

/** Belirtecin gecerlilik suresi: 12 saat. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Art arda hatali giris denemelerini yavaslatmak icin basit kova. */
const loginAttempts = new Map();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

/** Bir IP'nin su an kilitli olup olmadigini dondurur. */
export function isRateLimited(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > LOCKOUT_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

export function registerFailedLogin(key) {
  const rec = loginAttempts.get(key);
  if (!rec || Date.now() - rec.first > LOCKOUT_MS) {
    loginAttempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

export function clearFailedLogins(key) {
  loginAttempts.delete(key);
}

/** Guvenli rastgele belirtec uretir. */
export function createSessionToken(memberId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { memberId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

export function revokeSession(token) {
  sessions.delete(token);
}

/** Belirteci dogrular; gecersizse null. */
export function verifySessionToken(token) {
  if (!token) return null;
  const rec = sessions.get(token);
  if (!rec) return null;
  if (Date.now() > rec.expires) {
    sessions.delete(token);
    return null;
  }
  return rec.memberId;
}

/** Zaman asiminda kalan oturumlari temizler (bellek siskinligi icin). */
export function pruneSessions() {
  const now = Date.now();
  for (const [token, rec] of sessions) {
    if (now > rec.expires) sessions.delete(token);
  }
}

/**
 * Sifreli karsilastirma (zamanlara karsi).
 * Uzunluklar farkliysa bile surekli zaman sarf eder.
 */
export function safeCompare(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Istek dogrulamasi.
 *
 * @returns {{ok:true, memberId:string}|{ok:false, status:number, error:string, code:string}}
 */
export function requireAuth(headers, { write = false } = {}) {
  const h = headers || {};

  // Yazma istekleri yalnizca yonetici anahtari ile yapilabilir.
  // Bu anahtar sunucuda kalir; istemciye SIZDIRILMAZ.
  if (write) {
    const adminKey = ADMIN_API_KEY();
    if (!adminKey) {
      // Anahtar tanimli degilse yazma tamamen kapatilir (fail-closed).
      return {
        ok: false,
        status: 503,
        error: 'Sunucu yazma icin yapilandirilmadi (ADMIN_API_KEY eksik).',
        code: 'NO_ADMIN_KEY',
      };
    }
    const provided = String(h['x-api-key'] || h['X-Api-Key'] || '').trim();
    if (!provided || !safeCompare(provided, adminKey)) {
      return {
        ok: false,
        status: 401,
        error: 'Yetkisiz istek.',
        code: 'UNAUTHORIZED',
      };
    }
    return { ok: true, memberId: 'admin' };
  }

  // Okuma istekleri: yonetici anahtari VEYA gecerli oturum belirteci
  const adminKey = ADMIN_API_KEY();
  const provided = String(h['x-api-key'] || h['X-Api-Key'] || '').trim();
  if (adminKey && provided && safeCompare(provided, adminKey)) {
    return { ok: true, memberId: 'admin' };
  }

  const token = String(h['x-session-token'] || h['X-Session-Token'] || '').trim();
  const memberId = verifySessionToken(token);
  if (!memberId) {
    return {
      ok: false,
      status: 401,
      error: 'Oturum gerekli. Lütfen tekrar giriş yapın.',
      code: 'NO_SESSION',
    };
  }
  return { ok: true, memberId };
}