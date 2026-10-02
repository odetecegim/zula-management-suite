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
 * Depolama `sessionStorage`dır: sekme kapanınca belirteç düşer.
 * Sunucu 12 saatlik imzalı belirteci kendisi doğrular.
 */
const TOKEN_KEY = 'zula_suite_session_token';

let sessionToken: string | null = null;

try {
  sessionToken = sessionStorage.getItem(TOKEN_KEY);
} catch {
  sessionToken = null;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
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