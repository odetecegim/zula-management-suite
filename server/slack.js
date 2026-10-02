/**
 * SLACK BILDIRIMLERI (server/slack.js)
 *
 * ONEMLI GUVENLIK KURALI:
 * Slack "Incoming Webhook" adresi bir SIRDIR (kimse girerse kanala
 * mesaj atabilir). Bu adres ASLA istemciye (tarayiciya) gonderilmez.
 * Tum bildirimler sunucu tarafindan yapilir; panel yalnizca
 * "ne oldu" bilgisini API'ye gonderir.
 *
 * Boylece biri tarayici gelistirici konsolundan webhook adresini
 * okuyamaz.
 *
 * KURULUM:
 *   1) Slack -> Apps -> Incoming Webhooks -> Add to Slack
 *   2) Bir kanal sec (ornegin #zula-bildirim)
 *   3) URL'yi Vercel'e environment variable olarak ekle:
 *        SLACK_WEBHOOK_URL = https://hooks.slack.com/services/...
 *
 * URL tanimli degilse modul sessizce bos gecer (panel calisir).
 */

/** Tum bildirimler icin ortak zaman asimi. */
const SLACK_TIMEOUT_MS = 8000;

/** Ortam degiskenlerinden okunan degerler (her cagrida taze). */
const webhookUrl = () => String(process.env.SLACK_WEBHOOK_URL || '').trim();
const botToken = () => String(process.env.SLACK_BOT_TOKEN || '').trim();
const channelId = () => String(process.env.SLACK_CHANNEL_ID || '').trim();

/* ==================================================================
   IKI YOL DESTEKLENIR
   ------------------------------------------------------------------
   A) INCOMING WEBHOOK  (basit)
      SLACK_WEBHOOK_URL = https://hooks.slack.com/services/...
      Kanal, webhook olusturulurken secilir.

   B) BOT TOKEN + KANAL ID  (Slack API)
      SLACK_BOT_TOKEN   = xoxb-...
      SLACK_CHANNEL_ID  = C0XXXXXXXX
      "chat.postMessage" API'sini kullanir; bot herhangi bir kanala
      yazabilir, kanal ID ortam degiskeninde sabit kalir.

   Ikisi birden tanimliysa B tercih edilir.
   Hicbiri tanimli degilse modul sessizce bos gecer.
   ================================================================== */

/** Webhook adresi tanimli mi? (Ayarlar ekraninda gosterilir) */
export function isSlackConfigured() {
  return Boolean(webhookUrl() || (botToken() && channelId()));
}

/** Hangi yol kullanilacak: 'bot' | 'webhook' | 'none' */
export function slackMode() {
  if (botToken() && channelId()) return 'bot';
  if (webhookUrl()) return 'webhook';
  return 'none';
}

/**
 * Bot token ile Slack API'ye mesaj gonderir (chat.postMessage).
 *
 * @param {string} text   duz metin
 * @param {Array} blocks  istege bagli blok yapisi
 * @returns {Promise<boolean>} basarili mi
 */
async function postViaBotApi(text, blocks) {
  const token = botToken();
  const channel = channelId();
  if (!token || !channel) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        channel,
        text: String(text).slice(0, 3000),
        ...(blocks ? { blocks } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    // Slack API yanit govdesi JSON olur; okunamazsa gonderilmemis sayilir
    const data = await res.json().catch(() => null);
    return Boolean(data && data.ok === true);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Slack'a metin mesaji gonderir.
 *
 * @param {string} text  mesaj metni
 * @returns {Promise<boolean>} gonderildi mi
 */
export async function sendSlackMessage(text) {
  if (!text) return false;
  const msg = String(text).slice(0, 3000);

  // Once bot token + kanal ID yolu (daha esnek yontem)
  if (botToken() && channelId()) return postViaBotApi(msg, null);

  const url = webhookUrl();
  if (!url || !text) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 3000) }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    // Bildirim hatasi ASLA ana akisi bozmamali; sessizce gec.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Zengin (blok) mesaj gonderir: baslik + alanlar + renk.
 * Slack'ta daha okunakli gorunur.
 *
 * @param {{title:string, fields?:{label:string,value:string}[], color?:string, footer?:string}} opts
 */
/**
 * Blok mesajin govdesini olusturur (webhook ve bot API ortak kullanim).
 * @returns {Array} Slack blok dizisi
 */
function buildBlocks(opts) {
  const fields = (opts.fields || []).slice(0, 10).map((f) => ({
    type: 'mrkdwn',
    text: '*' + f.label + '*\n' + f.value,
  }));
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: String(opts.title || '').slice(0, 150), emoji: true },
    },
    ...(fields.length ? [{ type: 'section', fields }] : []),
    ...(opts.footer
      ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: opts.footer }] }]
      : []),
  ];
}

export async function sendSlackBlock(opts) {
  // Bot token + kanal ID varsa Slack API üzerinden gönder
  if (botToken() && channelId()) {
    return postViaBotApi(String(opts.title || ''), buildBlocks(opts));
  }

  const url = webhookUrl();
  if (!url) return false;

  const fields = (opts.fields || []).slice(0, 10).map((f) => ({
    type: 'mrkdwn',
    text: `*${f.label}*\n${f.value}`,
  }));

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: String(opts.title || '').slice(0, 150), emoji: true },
    },
    ...(fields.length ? [{ type: 'section', fields }] : []),
    ...(opts.footer
      ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: opts.footer }] }]
      : []),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: String(opts.title || ''), // bildirim onizleme metni
        attachments: [
          {
            color: opts.color || '#4a9eff',
            blocks,
          },
        ],
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Renk kodlari (Slack attachment renkleri). */
export const SLACK_COLORS = {
  info: '#4a9eff', // mavi
  success: '#2eb886', // yesil
  warning: '#e8a33d', // sari
  danger: '#e05c5c', // kirmizi
};

/**
 * Uye degisiklikleri icin hazir bildirim.
 *
 * @param {'eklendi'|'guncellendi'|'silindi'} action
 * @param {object} member  degisikligi yapilan uye
 * @param {string} actor   islemi yapan kisi
 */
export async function notifyMemberChange(action, member, actor) {
  if (!isSlackConfigured()) return false;

  const name = member?.fullName || member?.username || 'Bilinmeyen üye';
  const id = member?.tagId || member?.username || '-';
  const role = member?.role || '-';

  const titles = {
    eklendi: ':heavy_plus_sign: Yeni üye eklendi',
    guncellendi: ':pencil2: Üye güncellendi',
    silindi: ':wastebasket: Üye silindi',
  };

  return sendSlackBlock({
    title: titles[action] || 'Üye değişikliği',
    color:
      action === 'silindi'
        ? SLACK_COLORS.danger
        : action === 'eklendi'
        ? SLACK_COLORS.success
        : SLACK_COLORS.info,
    fields: [
      { label: 'Üye', value: name },
      { label: 'Üye Kodu', value: `\`${id}\`` },
      { label: 'Rol', value: `\`${role}\`` },
      { label: 'İşlemi Yapan', value: actor || 'Bilinmiyor' },
    ],
    footer: 'Zula Teşkilat Yönetim Paneli',
  });
}

/** Test oturumu olaylari. */
export async function notifyTestSession(event, session, actor) {
  if (!isSlackConfigured()) return false;

  const titles = {
    baslatildi: ':rocket: Yeni test oturumu başlatıldı',
    tamamlandi: ':white_check_mark: Test oturumu tamamlandı',
    hata: ':bug: Yeni hata bildirimi',
  };

  return sendSlackBlock({
    title: titles[event] || 'Test oturumu',
    color: event === 'hata' ? SLACK_COLORS.warning : SLACK_COLORS.success,
    fields: [
      { label: 'Oturum', value: session?.title || '-' },
      { label: 'Oyun / Sürüm', value: `${session?.game || '-'} ${session?.version || ''}` },
      { label: 'İşlemi Yapan', value: actor || 'Bilinmiyor' },
    ],
    footer: 'Zula Teşkilat Yönetim Paneli',
  });
}

/** Guvenlik olaylari (basarisiz giris, yetkisiz yazma denemesi). */
export async function notifySecurity(title, detail) {
  if (!isSlackConfigured()) return false;
  return sendSlackBlock({
    title: `:lock: ${title}`,
    color: SLACK_COLORS.danger,
    fields: detail ? [{ label: 'Detay', value: detail }] : [],
    footer: 'Zula Teşkilat Yönetim Paneli — Güvenlik',
  });
}