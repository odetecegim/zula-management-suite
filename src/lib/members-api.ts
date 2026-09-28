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

const TIMEOUT_MS = 8000;

/** Guvenli POST/GET. Hata durumunda null doner. */
async function call<T>(path: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const currentSpreadsheetId = (): string => loadSheetSettings().spreadsheetId;

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
  const data = await call<MembersResponse>('/api/sheets/members', {
    spreadsheetId: currentSpreadsheetId(),
  });
  if (!data || !Array.isArray(data.members) || data.members.length === 0) return null;
  return data.members;
}

/**
 * Uye listesini sunucuya yazar.
 * Sifreler sunucuda hash'lenir; duz sifre tabloya yazilmaz.
 */
export async function pushRemoteMembers(members: Member[]): Promise<boolean> {
  if (!Array.isArray(members) || members.length === 0) return false;
  const data = await call<{ ok: boolean }>('/api/sheets/members', {
    spreadsheetId: currentSpreadsheetId(),
    members,
  });
  return !!data?.ok;
}

/* ------------------------------------------------------------------ */
/* Giris                                                               */
/* ------------------------------------------------------------------ */

export type RemoteLoginResult =
  | { status: 'ok'; member: Member }
  | { status: 'invalid' } // kimlik bilgisi yanlış (sunucu erisilebilir)
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
  // 401 "bilerek" gelir; bu bir hata degil, gecersiz kimlik demektir.
  try {
    const res = await fetch(apiUrl('/api/sheets/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: currentSpreadsheetId(), username, password }),
    });
    if (res.status === 401) return { status: 'invalid' };
    if (!res.ok) return { status: 'unavailable' };

    const data = (await res.json()) as { ok: boolean; member?: Member };
    if (data?.ok && data.member) return { status: 'ok', member: data.member };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
