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
 * OTURUM BELIRTECI — DURUMSUZ (STATELESS), IMZALI
 *
 * SORUN (2026-10-02): Oturumlar bir Map'te (bellekte) tutuluyordu.
 * Vercel serverless fonksiyonu her deploy'dan sonra veya birkac
 * dakika sessizlikten sonra KAPATIP yeniden basliyor. Boylece
 * bellek siliniyor ve kullanici "Oturumunuz sona erdi" hatasi
 * aliyordu — hatta hicbir sey yapmamisken.
 *
 * COZUM: Artik oturum veriyi TUTULMUYOR. Belirtec su bicimdedir:
 *
 *     <base64url(payload)>.<base64url(HMAC-SHA256 imzasi)>
 *
 *   payload = { id, exp }
 *
 * Sunucu her dogrulamada istemzinciri yeniden hesaplar. Anahtar
 * sunucuda (SESSION_SECRET) oldugu icin biri kendi belirtecini
 * uretemEZ. Surec yeniden baslasa bile belirtec gecerlidir.
 *
 * Guvenlik: HMAC -> kisi belirteci degistiremez; exp -> sure
 * dolunca gecersizlesir.
 */

/** Imzalama anahtari. Ortam degiskeninden gelir. */
/*
  İMZALAMA ANAHTARI

  SESSION_SECRET tanımlı OLMALI. Aksi halde iki sorun birden olur:

  1) GÜVENLİK: Sabit yazıya düşmek, anahtarı bilen birinin istedigi
     uye kimligiyle kendine gecerli oturum belirteci uretmesine izin
     verir. "zula-suite-gelistirme-anahtari-degistirin" gibi acik bir
     metin kaynak kodda durur — yani GUVENLI DEGILDIR.

  2) OTURUM SIFIRLANMASI: Google servis hesabi JSON'u icin yedek
     anahtar kullaniliyordu. O JSON'daki `private_key` her deploy'da
     degisirse (ornegin satir sonu/escaping farki) tum oturumlar
     aninda gecersizlesir — kullanici "oturumun suresi doldu" gorur
     ama 12 saati hic dolmamistir.

  Bu yuzden:
    - SESSION_SECRET tanimliysa SADECE o kullanilir (dogru yol).
    - Tanimli degilse uretilmis bir anahtar kullanilir (calisir ama
      her deploy'da degisir; uyari loglanir).
  Artik kaynak koda gomulu sabit anahtar YOKTUR.
*/
let ephemeralSecret = null;

function secret() {
  const configured = String(process.env.SESSION_SECRET || '').trim();
  if (configured) return configured;

  // SESSION_SECRET yok: surec ici uretilen gecici anahtar.
  // (Her deploy'da degisir -> oturumlar sifirlanir, ama GUVENLIK
  //  saglanir; kimse tahmin edip belirteci uretemez.)
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[auth] SESSION_SECRET tanimli degil! Oturumlar her deploy/surec ' +
        'yeniden basinda gecersizlesir. Vercel > Environment Variables > ' +
        'SESSION_SECRET ekleyip yeniden deploy edin.'
    );
  }
  return ephemeralSecret;
}

/** SESSION_SECRET tanimli mi? (tanilama ucu bunu bildirir) */
export function hasSessionSecret() {
  return Boolean(String(process.env.SESSION_SECRET || '').trim());
}

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

/** base64url encode (Node'da buffer'i URL-safe string'e cevirir). */
function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}

/** HMAC-SHA256 imzasi uretir. */
function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

/**
 * Durumsuz oturum belirteci uretir.
 *
 * Artik bellekte tutulan bir kayit YOK; belirtec kendi kendini
 * tasir ve sunucu yeniden baslasa da gecerli kalir.
 */
export function createSessionToken(memberId) {
  const payload = {
    id: String(memberId),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = b64u(JSON.stringify(payload));
  return payloadB64 + '.' + sign(payloadB64);
}

/**
 * Belirteci dogrular.
 *
 * @returns {string|null} uye id veya gecersizse null
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  // 1) Imza dogrulaması — kisi belirteci degistiremEZ
  const expected = sign(payloadB64);
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // 2) Payload dogrulaması
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.id !== 'string' || !payload.id) return null;

  // 3) Sure kontrolu
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;

  return payload.id;
}

/**
 * Durumsuz belirtecler "silinemez" (sunucuda kayit yok).
 *
 * Oturumu kapatmak istemcide belirteci silmek demektir; sunucuda
 * kayit tutulmadigi icin burada yapilacak bir sey yoktur. Ileride
 * kara liste (revoke listesi) eklenirse burasi kullanilir.
 */
export function revokeSession() {
  // Durumsuz mimaride gerek yok; imzali belirtec sure dolunca gecersizlesir.
}

/** Eski imzali (bellek ici) belirtecler icin uyumluluk fonksiyonu. */
export function pruneSessions() {
  // Artik bellekte oturum tutulmuyor; temizlik gerekmiyor.
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
