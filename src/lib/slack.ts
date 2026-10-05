/**
 * Slack bildirim istemcisi (src/lib/slack.ts)
 *
 * GUVENLIK: Webhook adresi BURADA YOKTUR ve olmamalidir.
 * Webhook bir sirdir; yalnizca sunucu tarafinda (SLACK_WEBHOOK_URL
 * ortam degiskeni) tutulur. Istemci sadece sunucuya "ne oldu"
 * diyor, sunucu mesaji Slack'a iletiyor.
 */

import { apiUrl } from './sheets';
import { authHeaders, setSessionToken } from './session-token';

/** Sunucu Slack'a bagli mi? */
let serverConfigured = false;
export function setSlackConfigured(v: boolean) {
  serverConfigured = v;
}
export function isSlackReady() {
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
}

/**
 * Token tanilamasi — KANALA MESAJ GONDERMEZ.
 *
 * `slack-test` her denemede kanala gercek bir mesaj yaziyordu; ayar
 * yaparken kanala onlarca test mesaji birikiyordu. Bu yuzen ayri bir
 * "sadece kontrol et" yolu var: Slack `auth.test` ucu cagrilir,
 * token gecerli mi diye bakilir, kanala HICBIR sey yazilmaz.
 */
/**
 * Ortak hata ayristirici — HTTP durum kodunu KULLANICIYA ANLATIR.
 *
 * ONCEKI SURUMDE uc fonksiyon da `res.ok` false ise ayni belirsiz
 * mesaji donuyordu ("Sunucu isteği reddetti"). Kullanici 401 aldiginda
 * (oturum dolmus) bunun sebebini ogrenemiyor, saatlerce ayni tusa
 * basiyordu.
 *
 * @returns {string} kullaniciya gosterilecek mesaj
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

  // Sunucu, gecerli JSON hata govdesi donduyse onu tercih et
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
    // GUVENLIK NOTU: Burada otomatik cikis YOK. Arka plan Slack
    // cagrilari (bildirim, token kontrolu) de bu yolu kullanir;
    // bunlarda otomatik cikis, giris-sonrasi atilma dongusu yaratir
    // (ozellikle SESSION_SECRET tanimli degilken). Belirtec yine
    // de silinir, ama cikis karari kullanicidadir.
    setSessionToken(null);
    return code === 'NO_SESSION'
      ? 'Oturum gerekli. Panele yeniden giriş yapın.'
      : 'Sunucu isteği reddetti (401). Oturumunuz sona ermiş olabilir — yeniden giriş yapın.';
  }

  if (res.status === 403) {
    return 'Sunucu yetki vermedi (403). Bu işlem için yönetici yetkisi gerekiyor.';
  }

  return 'Sunucu isteği reddetti (' + res.status + ')' + (detail ? ': ' + detail.slice(0, 160) : '.');
}

/**
 * Token tanilamasi — KANALA MESAJ GONDERMEZ.
 *
 * `slack-test` her denemede kanala gercek bir mesaj yaziyordu; ayar
 * yaparken kanala onlarca test mesaji birikiyordu. Bu yuzen ayri bir
 * "sadece kontrol et" yolu var: Slack `auth.test` ucu cagrilir,
 * token gecerli mi diye bakilir, kanala HICBIR sey yazilmaz.
 */
export async function checkSlackToken(): Promise<SlackResult> {
  try {
    const res = await fetch(apiUrl('/api/sheets/slack-check'), {
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
    const data = (await res.json()) as { ok: boolean; mode: string; detail: string };
    setSlackConfigured(data.mode !== 'none');
    return {
      ok: Boolean(data.ok),
      configured: data.mode !== 'none',
      message: data.detail || 'Bilgi alinamadi.',
    };
  } catch {
    return {
      ok: false,
      configured: serverConfigured,
      message: 'Sunucuya ulasilamadi.',
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
      message: 'Sunucuya ulasilamadi.',
    };
  }
}

/**
 * Uye degisikligi bildirimi gonderir (eklendi / guncellendi / silindi).
 *
 * Mesaj sunucu tarafinda bicimlendirilir; burada yalnizca olay
 * bilgisi gonderilir. Hata olursa sessizce gecer — bildirim
 * panelin calismasini hicbir zaman bozmamalidir.
 */
export async function notifyMemberEvent(
  action: 'eklendi' | 'guncellendi' | 'silindi',
  member: { fullName?: string; username?: string; tagId?: string; role?: string },
  actor?: string
): Promise<void> {
  try {
    await fetch(apiUrl('/api/sheets/slack-notify'), {
      method: 'POST',
      // Oturum belirteci ZORUNLU: sunucu bu ucu herkese acik
      // birakmiyor. Belirtec eklenmeden istek 401 doner ve bildirim
      // sessizce kaybolur.
      headers: authHeaders(),
      body: JSON.stringify({ text: buildMemberText(action, member, actor) }),
    });
  } catch {
    /* bildirim hatasi paneli etkilemesin */
  }
}

/** Uye olayini Slack biçimine cevirir. */
function buildMemberText(
  action: 'eklendi' | 'guncellendi' | 'silindi',
  member: { fullName?: string; username?: string; tagId?: string; role?: string },
  actor?: string
): string {
  const emoji =
    action === 'silindi' ? ':wastebasket:' : action === 'eklendi' ? ':heavy_plus_sign:' : ':pencil2:';
  const label = action === 'silindi' ? 'Üye silindi' : action === 'eklendi' ? 'Yeni üye eklendi' : 'Üye güncellendi';
  const name = member.fullName || member.username || 'Bilinmeyen';
  const code = member.tagId || member.username || '-';
  const role = member.role || '-';
  return `${emoji} *${label}*\n• Üye: *${name}*\n• Üye Kodu: \`${code}\`\n• Rol: \`${role}\`\n• İşlemi yapan: ${
    actor || 'Bilinmiyor'
  }`;
}
/**
 * Panelden el ile mesaj gonderir.
 */
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
      message: 'Sunucuya ulasilamadi.',
    };
  }
}


