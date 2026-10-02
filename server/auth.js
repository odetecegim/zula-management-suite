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

/**
 * KABA KUVVET KORUMASI
 *
 * Iki KATMANLI:
 *   1) IP bazli  — hizli sinir; bir IP'den arka arkaya deneme.
 *   2) HESAP bazli — asil koruma. IP degistirilse bile (botnet,
 *      proxy, VPN) belirli bir kullanici adina yapilan denemeler
 *      sinirli kalir.
 *
 * NEDEN HESAP KORUMASI KRITIK:
 * IP korumasi tek basina yetersizdir. Saldirgan onlarca IP ile
 * (botnet, Tor, VPN) her birinden birkac deneme yapabilir; toplamda
 * IP limiti hic dolmaz. Hesap bazli koruma ise "huseyin" kullanici
 * adina yapilan denemeleri IP'lerden bagimsiz sayar; 10 denemeden
 * sonra o hesap kilitlenir. 7 haneli sifreler icin bile kullanici
 * adinin kesfi yavaslatilir.
 *
 * Onemli: parola OLMAYAN, kullanici adi OLMAYAN denemeler de sayilir
 * (kullanici adini yoklama / enumeration korumasi).
 */

const MAX_IP_ATTEMPTS = 8;
const IP_LOCKOUT_MS = 10 * 60 * 1000;

/** Hesap basina izin verilen basarisiz deneme sayisi. */
const MAX_ACCOUNT_ATTEMPTS = 10;
/** Hesap kilidi suresi: 15 dakika (sifirlanabilir degil, oturum acilmali). */
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;

/** IP -> { count, first } */
const loginAttempts = new Map();
/** kullaniciAdi -> { count, first } */
const accountAttempts = new Map();

/** ---- IP bazli katman ---- */
export function isRateLimited(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > IP_LOCKOUT_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return rec.count >= MAX_IP_ATTEMPTS;
}

export function registerFailedLogin(key) {
  const rec = loginAttempts.get(key);
  if (!rec || Date.now() - rec.first > IP_LOCKOUT_MS) {
    loginAttempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

export function clearFailedLogins(key) {
  loginAttempts.delete(key);
}

/**
 * ---- HESAP bazli katman ----
 *
 * @param {string} username dogrulanacak kullanici adi (normalize)
 */
export function isAccountLocked(username) {
  if (!username) return false;
  const rec = accountAttempts.get(normalizeKey(username));
  if (!rec) return false;
  if (Date.now() - rec.first > ACCOUNT_LOCKOUT_MS) {
    accountAttempts.delete(normalizeKey(username));
    return false;
  }
  return rec.count >= MAX_ACCOUNT_ATTEMPTS;
}

export function registerFailedAccount(username) {
  if (!username) return;
  const key = normalizeKey(username);
  const rec = accountAttempts.get(key);
  if (!rec || Date.now() - rec.first > ACCOUNT_LOCKOUT_MS) {
    accountAttempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

export function clearFailedAccount(username) {
  if (username) accountAttempts.delete(normalizeKey(username));
}

/** Kullanici adini karsilastirma icin normalize eder. */
function normalizeKey(username) {
  return String(username).trim().toLocaleLowerCase('tr-TR');
}

/** Kalan hak / kalan sure bilgisi (kullaniciya gostermek icin). */
export function accountRetryInfo(username) {
  if (!username) return null;
  const rec = accountAttempts.get(normalizeKey(username));
  if (!rec || rec.count < MAX_ACCOUNT_ATTEMPTS) return null;
  const elapsed = Date.now() - rec.first;
  if (elapsed > ACCOUNT_LOCKOUT_MS) return null;
  const remainMin = Math.ceil((ACCOUNT_LOCKOUT_MS - elapsed) / 60000);
  return { minutes: remainMin };
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

  const adminKey = ADMIN_API_KEY();
  const provided = String(h['x-api-key'] || h['X-Api-Key'] || '').trim();

  // Yonetici anahtarla yapilan istekler her zaman gecerlidir
  // (otomatik testler ve sunucu ici araclar icin).
  if (adminKey && provided && safeCompare(provided, adminKey)) {
    return { ok: true, memberId: 'admin', viaKey: true };
  }

  const token = String(h['x-session-token'] || h['X-Session-Token'] || '').trim();
  const memberId = verifySessionToken(token);

  // Yazma istekleri de oturum belirteciyle yapilabilir; ancak BU
  // durumda yazma yetkisi route-handler'da ayrica ROL kontroluyle
  // (super_admin) dogrulanir. Boylece:
  //   - ADMIN_API_KEY ortam degiskenini ayarlamaya GEREK KALMAZ
  //   - anahtar istemciye sizdirilmaz (en kritik nokta)
  //   - her giris yapan kullanici yazamaz; sadece yonetici yazar
  if (write) {
    if (!memberId) {
      return {
        ok: false,
        status: 401,
        error: 'Yazma yetkisi icin yonetici olarak giris yapmalisiniz.',
        code: 'NO_SESSION',
      };
    }
    // Rol kontrolu burada DEGIL: memberId doner, karar route-handler'da
    // verilir (rol bilgisi Google Sheets'ten okunmalidir).
    return { ok: true, memberId, needsAdminRole: true };
  }

  // Okuma istekleri: yalnizca gecerli oturum belirteci
  if (!memberId) {
    return {
      ok: false,
      status: 401,
      error: 'Oturum gerekli. Lutfen tekrar giris yapin.',
      code: 'NO_SESSION',
    };
  }
  return { ok: true, memberId };
}
