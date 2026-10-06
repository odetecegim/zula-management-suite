/**
 * Oturum belirteci — TEK KAYNAK.
 *
 * Neden ayrı modül: hem `members-api.ts` hem `slack.ts`, oturum
 * belirtecini `x-session-token` başlığı ile göndermek ZORUNDA
 * (sunucu bu uçları herkese açık bıraktıysa 401 döner; artık Slack
 * uçları da oturum + yönetici rolü istiyor).
 *
 * Belirteç yönetimi iki dosyaya kopyalanırsa birinde unutulur ve
 * kullanıcı sebebini anlamadan "Sunucu isteği reddetti" görür.
 *
 * Depolama `localStorage`dir: sayfa yenilense bile belirteç korunur.
 * Çıkışta (handleLogout / handleForceRelogin) belirteç silinir.
 * Sunucu 12 saatlik imzalı belirteci kendisi doğrular.
 */
const TOKEN_KEY = 'zula_suite_session_token';

/*
  BELIRTEC NEREDE SAKLANIR: kalici depoda (sekme deposu DEGIL).

  SORUN (2026-10-06): Belirtec sekme deposundaydi. Sekme yenilenince
  depo BOSALIYOR ama currentUserId kalici depodan geri
  geliyordu. Sonuc: panel girisli gorunuyor ama tum korumali istekler
  (slack-test, uyelik senkronu) belirtecsiz gidip 401 NO_SESSION
  aliyordu. Kullanici "Tokeni Kontrol Et"e basiyor (PUBLIC uc, calisiyor),
  "Baglantiyi Test Et"e basiyor (korumali uc, 401) — "Slack keyi
  dogruluyor test yapmiyor" gorunumu tam olarak buydu.

  COZUM: Belirtec de kalici depoda saklanir; cikista silinir.
  Sekme kapaninca dusme guvencesi kalkar ama giris zaten 12 saatliktir
  ve cikis dugmesi belirteci temizler.
*/
let sessionToken: string | null = null;

try {
  sessionToken = localStorage.getItem(TOKEN_KEY);
} catch {
  sessionToken = null;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* depolama kapalı olabilir (gizli sekme / kısıtlı izin) */
  }
}

export function getSessionToken(): string | null {
  return sessionToken;
}

/**
 * İsteklere doğrulama başlığı ekler — ortak yardımcı.
 *
 * Neden ayrı dosya: `members-api.ts` ve `slack.ts` ikisi de oturum
 * belirtecini göndermek zorunda. Yardımcı burada durur; her iki
 * istemci de buradan içe aktarır. Böylece başlığı unutmak imkânsız.
 */
/*
  OTURUM SONA ERDI BILDIRIMI — uygulama seviyesinde abonelik.

  SORUN: SESSION_SECRET degistiginde (ornegin kullanici Vercel'e
  eklediginde) TUM oturumlar aninda gecersizlesir. Panel "yeniden
  giris yapin" dese bile kullanici Ayarlar ekraninda oturur,
  Slack'a baska baska tiklar ve hep ayni hatayi alir; "baglanti
  testi yapamiyorum" diye kilitlenir.

  COZUM: Sunucu 401 dondugunde bu olay yayilir; App.tsx dinleyip
  kullaniciyi DOGRUDAN giris ekranina gecirir.
*/
type SessionExpiredListener = () => void;
const listeners = new Set<SessionExpiredListener>();

/** Oturum bittiginde uygulamayi bilgilendir. (App.tsx kullanir) */
export function onSessionExpired(fn: SessionExpiredListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Oturumun bittigini bildir. */
export function notifySessionExpired(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* bir dinleyici hata verirse digerleri calismaya devam etsin */
    }
  }
}
export const authHeaders = (
  extra: Record<string, string> = {}
): Record<string, string> => {
  const token = getSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'x-session-token': token } : {}),
    ...extra,
  };
};
