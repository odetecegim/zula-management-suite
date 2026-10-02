/**
 * Paylasilan uye deposu (Google Sheets) istemcisi.
 *
 * TASARIM: Bu modul ASLA hata firlatmaz. Ag, sunucu veya Google erisilemezse
 * `null` / `false` doner ve cagiran taraf mevcut yerel (localStorage) akisa
 * devam eder. Boylece backend kapaliyken panel calismaya devam eder.
 *
 * Guvenlik: Giris sifresi SUNUCUDA dogrulanir; duz sifre istemciye hicbir
 * zaman donmez.
 */
import type { Member } from '../types';
import { loadSheetSettings, apiUrl } from './sheets';

/**
 * Zaman asimi (ms).
 *
 * NEDEN 8 DEGIL:
 * Vercel gibi serverless ortamlarda "cold start" olur; fonksiyon
 * durdurulduktan sonraki ilk istekte yeniden ayakta kalkmasi 5-10
 * saniye surebilir. 8 saniyede yazma istegi iptal ediliyordu ve
 * kullanici "zaman asimina ugradi" goruyordu, halbuki sunucu 1-2
 * saniyede tamamlayabiliyordu.
 *
 * YAZMA istekleri icin daha genis bir pencere kullanilir; okuma
 * istekleri hizli dondugu icin biraz daha kisadir.
 */
const TIMEOUT_MS = 25000;
const READ_TIMEOUT_MS = 20000;

/** Son hata mesaji; panelde kullaniciya gosterilmek uzere saklanir. */
let lastSyncError = '';
export const getLastSyncError = () => lastSyncError;
export const clearLastSyncError = () => {
  lastSyncError = '';
};

/**
 * Guvenli POST/GET. Hata durumunda null doner.
 *
 * ONCEKI SURUM HATAYI TAMAMEN YUTUYORDU: ag hatasi, yetki hatasi ve
 * sunucu hatasi ayni sekilde "null" donerdi. Boylece uye panelde
 * kayitli gorunur ama Sheets'e hic yazilmamis oluyordu ve kullanici
 * nedenini hic ogrenemiyordu. Artik nedeni kaydediyoruz.
 */
async function call<T>(
  path: string,
  body: unknown,
  timeoutMs: number = TIMEOUT_MS
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* govde okunamadi */
      }
      lastSyncError = `Sunucu ${res.status}${detail ? `: ${detail}` : ''}`;
      return null;
    }
    const text = await res.text();
    if (!text) {
      lastSyncError = 'Sunucu bos yanit dondu';
      return null;
    }
    lastSyncError = '';
    return JSON.parse(text) as T;
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === 'AbortError';
    lastSyncError = isAbort
      ? 'Sunucu yanit vermedi (zaman aşımı). İnternet bağlantınızı kontrol edip tekrar deneyin.'
      : `Bağlantı hatası: ${e instanceof Error ? e.message : 'bilinmiyor'}`;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const currentSpreadsheetId = (): string => loadSheetSettings().spreadsheetId;

/* ------------------------------------------------------------------ */
/* Oturum belirteci (session token)                                    */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = 'zula_suite_session_token';

/**
 * Sunucu, basarili giriste bir belirtec verir. Tum veri isteklerinde
 * `x-session-token` basligi ile gonderilir.
 *
 * ONCEDEN YOKTU: /api/sheets/* uclari sifre istemeden calisiyordu,
 * yani internete acik herkes uye listesini okuyup istedigi rolu
 * yazabiliyordu. Artik belirtec olmadan istek 401 doner.
 *
 * Not: Yazma istekleri icin ayrica sunucudaki ADMIN_API_KEY gerekir.
 * O anahtar istemciye SIZDIRILMAZ; bu yuzden panel uzerinden yapilan
 * yazma istekleri sunucuya gonderilmeden once engellenir.
 */
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
    /* depolama kapali olabilir */
  }
}

export function getSessionToken(): string | null {
  return sessionToken;
}

/** Isteklere dogrulama basligi ekler. */
const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
  ...extra,
});

/* ------------------------------------------------------------------ */
/* Uye listesi                                                         */
/* ------------------------------------------------------------------ */

interface MembersResponse {
  ok: boolean;
  count: number;
  members: Member[];
}

/**
 * Sunucudan uye listesini ceker.
 * @returns uye listesi, ya da backend kullanilamiyorsa `null`
 */
export async function fetchRemoteMembers(): Promise<Member[] | null> {
  const data = await call<MembersResponse>(
    '/api/sheets/members',
    {
      spreadsheetId: currentSpreadsheetId(),
    },
    READ_TIMEOUT_MS
  );
  if (!data || !Array.isArray(data.members) || data.members.length === 0) return null;
  return data.members;
}

/**
 * Uye listesini sunucuya yazar.
 * Sifreler sunucuda hash'lenir; duz sifre tabloya yazilmaz.
 */
export async function pushRemoteMembers(
  members: Member[],
  opts: { confirmSil?: boolean } = {}
): Promise<boolean> {
  if (!Array.isArray(members) || members.length === 0) return false;
  const data = await call<{ ok: boolean }>('/api/sheets/members', {
    spreadsheetId: currentSpreadsheetId(),
    members,
    // Sunucudaki "kismen silme" korumasi: yalnizca liste mevcut
    // kayitlarin yarisindan azini iceriyorsa reddeder. Kullanici
    // panelden bilerek uye sildiginde bu bayrak gonderilir.
    confirmSil: opts.confirmSil === true,
  });
  return !!data?.ok;
}

/**
 * Tek bir üyeyi sunucudan SİLer.
 *
 * Neden ayrı uç nokta? Toplu yazma her zaman `upsertOnly: true`
 * ile çalışır (başka yöneticinin eklediği üyeleri korumak için).
 * Bu yüzden paneldeki "Sil" düğmesi bu uç noktayı çağırmalı.
 */
export async function deleteRemoteMember(id: string): Promise<boolean> {
  if (!id) return false;
  const data = await call<{ ok: boolean }>('/api/sheets/member-delete', {
    spreadsheetId: currentSpreadsheetId(),
    id,
  });
  return !!data?.ok;
}

/* ------------------------------------------------------------------ */
/* Giris                                                               */
/* ------------------------------------------------------------------ */

export type RemoteLoginResult =
  | { status: 'ok'; member: Member }
  | { status: 'invalid' } // kimlik bilgisi yanlış (sunucu erisilebilir)
  | { status: 'inactive'; message: string } // hesap pasif -> giris reddedildi
  | { status: 'unavailable' }; // backend kapali -> yerel dogrulamaya dus

/**
 * Giris bilgilerini SUNUCUDA dogrular.
 * - 'ok'          -> gecersiz, uye dondurulur
 * - 'invalid'     -> sifre/kullanici adi yanlis
 * - 'unavailable' -> backend'e ulasilamadi, yerel kontrole gecilmeli
 */
export async function remoteLogin(
  username: string,
  password: string
): Promise<RemoteLoginResult> {
  // 401 bilerek gelir; bu bir hata degil, gecersiz kimlik demektir.
  // Backend kapaliysa sonsuza kadar bekleme: 4 sn zaman asimi.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(apiUrl('/api/sheets/login'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ spreadsheetId: currentSpreadsheetId(), username, password }),
      signal: controller.signal,
    });
    if (res.status === 401) return { status: 'invalid' };

    // 403 ACCOUNT_INACTIVE: hesap pasif. Bu bir hata değil, net bir
    // engel; kullanıcıya doğru mesajı göstermemiz gerekir.
    if (res.status === 403) {
      try {
        const body = (await res.json()) as { error?: string };
        return {
          status: 'inactive',
          message:
            body?.error ||
            'Hesabınız pasif durumda. Panele giriş yapamazsınız.',
        };
      } catch {
        return {
          status: 'inactive',
          message: 'Hesabınız pasif durumda. Panele giriş yapamazsınız.',
        };
      }
    }

    if (res.status === 401) {
      setSessionToken(null);
      return { status: 'unavailable' };
    }

    if (!res.ok) return { status: 'unavailable' };

    const data = (await res.json()) as { ok: boolean; member?: Member; token?: string };
    if (data?.ok && data.member) {
      // Sunucu artik oturum belirteci donuyor; sonraki isteklerde
      // x-session-token basligi ile otomatik eklenir.
      if (data.token) setSessionToken(data.token);
      return { status: 'ok', member: data.member };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
