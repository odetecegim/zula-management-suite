/**
 * Slack bildirim istemcisi (src/lib/slack.ts)
 *
 * GUVENLIK: Webhook adresi BURADA YOKTUR ve olmamalidir.
 * Webhook bir sirdir; yalnizca sunucu tarafinda (SLACK_WEBHOOK_URL
 * ortam degiskeni) tutulur. Istemci sadece sunucuya "ne oldu"
 * diyor, sunucu mesaji Slack'a iletiyor.
 */

import { apiUrl } from './sheets';

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
}

/**
 * Panelden el ile mesaj gonderir.
 */
export async function sendManualMessage(text: string): Promise<SlackResult> {
  try {
    const res = await fetch(apiUrl('/api/sheets/slack-notify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      return { ok: false, configured: serverConfigured, message: 'Sunucu isteği reddetti.' };
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

/**
 * Baglantiyi test eder: sunucu kanala kucuk bir mesaj gonderir.
 */
export async function testSlackConnection(): Promise<SlackResult> {
  try {
    const res = await fetch(apiUrl('/api/sheets/slack-test'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
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
      headers: { 'Content-Type': 'application/json' },
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