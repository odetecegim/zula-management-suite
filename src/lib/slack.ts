/**
 * Slack bildirim istemcisi (src/lib/slack.ts) — SIFIRDAN YAZIM (2026-10-06)
 *
 * GUVENLIK: Webhook adresi BURADA YOKTUR ve olmamalidir. Webhook/bot
 * token'i sirdir; yalnizca sunucu tarafindaki ortam degiskenlerinde tutulur.
 * Istemci sadece sunucuya "ne oldu" der; sunucu mesaji Slack'a iletir.
 *
 * UCLER:
 * - POST /api/sheets/slack-check  -> token tanilamasi (MESAJ GONDERMEZ, oturum gerekmez)
 * - POST /api/sheets/slack-test   -> gercek test mesaji (oturum + yonetici yetkisi)
 * - POST /api/sheets/slack-notify -> serbest metin bildirim (oturum + yetki)
 *
 * HATA YONETIMI: `describeFailure` tum non-2xx yanitlari KULLANICIYA
 * ANLATIR (401 oturum, 403 yetki, digerleri sunucu mesaji). Belirtec
 * ASLA silinmez ve otomatik cikis YAPILMAZ — cikis karari kullanicidir.
 */

import { apiUrl } from './sheets';
import { authHeaders } from './session-token';

/** Sunucu Slack'a bagli mi? (status ucundan ogrenilir) */
let serverConfigured = false;
export function setSlackConfigured(v: boolean): void {
  serverConfigured = v;
}
export function isSlackReady(): boolean {
  return serverConfigured;
}

interface SlackResult {
  ok: boolean;
  configured: boolean;
  message: string;
  /** Hangi ortam degiskenleri eksik? (yapilandirma hatasinda dolar) */
  missing?: string[];
  /** 'bot' | 'webhook' | 'none' */
  mode?: string;
  /** slack-check ucunun ayrintisi (message ile ayni) */
  detail?: string;
}

/**
 * Ortak hata ayristirici — HTTP durumunu KULLANICIYA ANLATIR.
 *
 * - 401: oturum gerekli (NO_SESSION ise kisa mesaj)
 * - 403: yetki yetersiz
 * - Digerleri: sunucunun kendi hata metni (varsa) + durum kodu
 *
 * Asla istisna firlatmaz; her zaman metin dondurur.
 */
async function describeFailure(res: Response): Promise<string> {
  let detail = '';
  let code = '';
  try {
    const raw = await res.text();
    detail = raw.slice(0, 300);
    try {
      code = ((JSON.parse(raw) as { code?: string }).code) ?? '';
    } catch {
      /* JSON degilse kod yok */
    }
  } catch {
    /* govde okunamadi */
  }

  // Sunucu gecerli JSON hata govdesi donduyse mesajini tercih et
  try {
    const parsed = JSON.parse(detail) as { error?: string; code?: string };
    if (parsed?.error && parsed.error.length > 3 && res.status !== 401) {
      return parsed.error;
    }
    if (parsed?.code) code = parsed.code;
  } catch {
    /* JSON degil */
  }

  if (res.status === 401) {
    // NOT: otomatik cikis YOK, belirtec SILINMIYOR. 401 arka plan
    // cagrisinda alinabilir (SESSION_SECRET degistiyorsa); belirteci
    // silmek sonraki istekleri de 401'e cevirip dongu yaratir.
    return code === 'NO_SESSION'
      ? 'Oturum gerekli. Panele yeniden giriş yapın.'
      : 'Sunucu isteği reddetti (401). Oturumunuz sona ermiş olabilir — yeniden giriş yapın.';
  }

  if (res.status === 403) {
    return 'Sunucu yetki vermedi (403). Bu işlem için yönetici yetkisi gerekiyor.';
  }

  return (
    'Sunucu isteği reddetti (' +
    res.status +
    ')' +
    (detail ? ': ' + detail.slice(0, 160) : '.')
  );
}
/**
 * Token tanilamasi — KANALA MESAJ GONDERMEZ.
 *
 * `slack-test` her denemede kanala gercek bir mesaj yaziyordu; ayar
 * yaparken kanala onlarca test mesaji birikiyordu. Bu yuzden ayri bir
 * "sadece kontrol et" yolu var: sunucu Slack `auth.test` ucu cagirir,
 * token gecerli mi diye bakar, kanala HICBIR sey yazmaz.
 *
 * Degerleri: { ok, mode, detail }  ->  SlackResult'a cevrilir.
 */
export async function checkSlackToken(): Promise<SlackResult> {
  try {
    const res = await fetch(apiUrl('/api/sheets/slack-check'));
    if (!res.ok) {
      return {
        ok: false,
        configured: serverConfigured,
        message: await describeFailure(res),
      };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      mode?: string;
      detail?: string;
    };
    const mode = data.mode || 'none';
    setSlackConfigured(mode !== 'none');
    const message = data.detail || 'Bilgi alınamadı.';
    return {
      ok: Boolean(data.ok),
      configured: mode !== 'none',
      message,
      detail: message,
      mode,
    };
  } catch {
    return {
      ok: false,
      configured: serverConfigured,
      message: 'Sunucuya ulaşılamadı.',
    };
  }
}

/**
 * Baglantiyi test eder: sunucu kanala kucuk bir mesaj gonderir.
 *
 * NOT: Bu GERCEKTEN kanala yazar. Tokeni sadece kontrol etmek icin
 * `checkSlackToken()` kullanin.
 */
export async function testSlackConnection(): Promise<SlackResult> {
  try {
    const res = await fetch(apiUrl('/api/sheets/slack-test'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      return {
        ok: false,
        configured: serverConfigured,
        message: await describeFailure(res),
      };
    }
    const data = (await res.json()) as SlackResult;
    setSlackConfigured(Boolean(data.configured));
    return data;
  } catch {
    return {
      ok: false,
      configured: false,
      message: 'Sunucuya ulaşılamadı.',
    };
  }
}

/**
 * Uye degisikligi bildirimi gonderir (eklendi / guncellendi / silindi).
 *
 * Mesaj sunucu tarafinda bicimlendirilir; burada yalnizca olay
 * bilgisi gonderilir. Hata olursa sessizce gecer — bildirim
 * panelin calismasini hicbir zaman bozmamali.
 */
export async function notifyMemberEvent(
  action: 'eklendi' | 'guncellendi' | 'silindi',
  member: { fullName?: string; username?: string; tagId?: string; role?: string },
  actor?: string
): Promise<void> {
  try {
    await fetch(apiUrl('/api/sheets/slack-notify'), {
      method: 'POST',
      // Oturum belirteci ZORUNLU: sunucu bu ucu herkese acik birakmiyor.
      // Belirtec eklenmeden istek 401 doner ve bildirim sessizce kaybolur.
      headers: authHeaders(),
      body: JSON.stringify({ text: buildMemberText(action, member, actor) }),
    });
  } catch {
    /* bildirim hatasi paneli etkilemesin */
  }
}

/** Uye olayini Slack bicimine cevirir. */
function buildMemberText(
  action: 'eklendi' | 'guncellendi' | 'silindi',
  member: { fullName?: string; username?: string; tagId?: string; role?: string },
  actor?: string
): string {
  const emoji =
    action === 'silindi' ? ':wastebasket:' : action === 'eklendi' ? ':heavy_plus_sign:' : ':pencil2:';
  const label =
    action === 'silindi' ? 'Üye silindi' : action === 'eklendi' ? 'Yeni üye eklendi' : 'Üye güncellendi';
  const name = member.fullName || member.username || 'Bilinmeyen';
  const code = member.tagId || member.username || '-';
  const role = member.role || '-';
  return (
    `${emoji} *${label}*\n• Üye: *${name}*\n• Üye Kodu: \`${code}\`\n• Rol: \`${role}\`\n• İşlemi yapan: ` +
    (actor || 'Bilinmiyor')
  );
}

/** Panelden el ile mesaj gonderir. */
export async function sendManualMessage(text: string): Promise<SlackResult> {
  try {
    const res = await fetch(apiUrl('/api/sheets/slack-notify'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      return {
        ok: false,
        configured: serverConfigured,
        message: await describeFailure(res),
      };
    }
    return (await res.json()) as SlackResult;
  } catch {
    return {
      ok: false,
      configured: serverConfigured,
      message: 'Sunucuya ulaşılamadı.',
    };
  }
}