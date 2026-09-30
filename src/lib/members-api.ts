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
    lastSyncError =
      e instanceof DOMException && e.name === 'AbortError'
        ? 'Sunucu zaman asimina ugradi'
        : `Baglanti hatasi: ${e instanceof Error ? e.message : 'bilinmiyor'}`;
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
