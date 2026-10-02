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
/** Son Slack hata mesaji (panelde kullaniciya gosterilir). */
let lastError = '';

/** Son hata mesajini dondurur / temizler. */
export function getSlackError() {
  return lastError;
}
export function clearSlackError() {
  lastError = '';
}

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
 * ONCEKI SURUMUN HATASI: burada sadece `false` donuluyordu, Slack'in
 * gercek hata mesaji (or. "not_in_channel", "invalid_auth") yutuluyordu.
 * Bu yuzden panelde "Webhook adresine ulasilamadi" gorunuyordu ve
 * kullanici gercek nedeni ogrenemiyordu.
 *
 * Simdi: basarisizlikta son hata mesaji saklanir ve `slack-test`
 * ucu onu kullaniciya gosterir.
 *
 * @param {string} text   duz metin
 * @param {Array} blocks  istege bagli blok yapisi
 * @returns {Promise<boolean>} basarili mi
 */
async function postViaBotApi(text, blocks) {
  const token = botToken();
  const channel = channelId();
  if (!token || !channel) {
    lastError = 'SLACK_BOT_TOKEN veya SLACK_CHANNEL_ID eksik.';
    return false;
  }

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

    if (!res.ok) {
      lastError = 'Slack HTTP ' + res.status + ' — istek reddedildi.';
      return false;
    }

    const data = await res.json().catch(() => null);
    if (data && data.ok === true) {
      lastError = '';
      return true;
    }

    // Slack API her zaman HTTP 200 doner; hata govde icinde gelir.
    lastError = describeSlackError(data);
    return false;
  } catch (e) {
    lastError =
      e instanceof Error && e.name === 'AbortError'
        ? 'Slack yanit vermedi (zaman aşımı).'
        : 'Slack bağlantı hatası: ' + (e instanceof Error ? e.message : 'bilinmiyor');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Slack API hata kodunu insanca cevirir. */
function describeSlackError(data) {
  if (!data) return 'Slack bos yanıt döndü.';
  switch (data.error) {
    case 'not_in_channel':
      return 'Bot bu kanalın ÜYE DEĞİL. Slack → uygulaman → Install/Invite ile botu kanala ekleyin.';
    case 'invalid_auth':
      return 'SLACK_BOT_TOKEN geçersiz. Yeni bir bot token üretip Vercel’e tekrar ekleyin.';
    case 'channel_not_found':
      return 'SLACK_CHANNEL_ID bulunamadı. Kanal kimliğini kontrol edin.';
    case 'account_inactive':
    case 'token_revoked':
      return 'Bot token iptal edilmiş. Yeni token üretin.';
    case 'no_permission':
      return 'Bot’un bu kanala mesaj atma yetkisi yok.';

    /*
      not_allowed_token_type — EN SIK GORULEN HATA
      ------------------------------------------
      Bu hata, Authorization basligindaki degerin bot tokeni OLMADIGINI
      kanitlar. Yani gonderilen sey xoxb- degil; baska bir token turu.

      Sik gorulen sebepler:
        - User token (xoxp-) kullanilmis (bot token degil)
        - "xoxb-" oneki olmadan, yalniz tokenin kendisi yapistirilmis
        - App-level token (xapp-) kopyalanmis
        - Eski / iptal edilmis bir token yapistirilmis

      Kullaniciya NE YAPACAGINI soylemek icin ayri mesaj yazildi.
    */
    case 'not_allowed_token_type':
      return (
        'SLACK_BOT_TOKEN bir BOT TOKENI degil (Slack: not_allowed_token_type). ' +
        'Değer "xoxb-" ile başlamalı. OAuth & Permissions → Bot Token Scopes → ' +
        'Install to Workspace ile yeni xoxb- token üretip Vercel’e yapıştırın.'
      );
    case 'missing_scope':
      return (
        'Bot token’ın "chat:write" yetkisi yok (Slack: missing_scope). ' +
        'OAuth & Permissions → Scopes → chat:write ekleyip uygulamayı yeniden kurun.'
      );
    default:
      return 'Slack hatası: ' + (data.error || 'bilinmiyor');
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
 * Token ve kanal yapilandirmasini DIAGNOSTIK OLARAK dogrular.
 *
 * NEDEN GEREKLI:
 * Once kullanici yalnizca "Baglantiyi Test Et" tiklayabiliyordu; bu da
 * kanala GERCEKTEN bir mesaj atiyordu. Ayarlar yaparken kanala bir
 * suru "test mesaji" birikmesi hem kirletici hem de hatayi gormek
 * icin kotu bir yontemdi.
 *
 * `auth.test` ucu:
 *   - Mesaj GONDERMEZ (kanal temiz kalir)
 *   - Tokenin GECERLI OLUP OLMADIGINI soyler
 *   - Botun hangi workspace'e bagli oldugunu dondurur
 *
 * @returns {Promise<{ok:boolean, mode:string, detail:string}>}
 */
export async function diagnoseSlack() {
  const mode = slackMode();

  if (mode === 'none') {
    return {
      ok: false,
      mode,
      detail:
        'SLACK_BOT_TOKEN + SLACK_CHANNEL_ID veya SLACK_WEBHOOK_URL tanimli degil. ' +
        'Vercel > Settings > Environment Variables altina ekleyip redeploy edin.',
    };
  }

  // Webhook yolunda Slack dogrulama ucu sunmaz; ancak adresin bicimi
  // kontrol edilebilir.
  if (mode === 'webhook') {
    const url = webhookUrl();
    if (!/^https:\/\/hooks\.slack\.com\/services\//.test(url)) {
      return {
        ok: false,
        mode,
        detail:
          'SLACK_WEBHOOK_URL gecersiz gorunuyor. Beklenen bicim: ' +
          'https://hooks.slack.com/services/T.../B.../...',
      };
    }
    return {
      ok: true,
      mode,
      detail:
        'Webhook adresi bicimi dogru. Kanaldan gorunuyorsa baglanti kuruludur.',
    };
  }

  // --- Bot token yolu: gercek dogrulama ---
  const token = botToken();

  // Bicim kontrolu SUNUCUDA yapilir; token istemciye ASLA sizmaz.
  if (!token.startsWith('xoxb-')) {
    const tur = token.startsWith('xoxp-')
      ? 'Bu bir USER TOKEN (xoxp-); bot tokeni (xoxb-) gerekiyor.'
      : token.startsWith('xapp-')
        ? 'Bu bir APP-LEVEL TOKEN (xapp-); bot tokeni (xoxb-) gerekiyor.'
        : 'Deger "xoxb-" ile baslamiyor.';
    return {
      ok: false,
      mode,
      detail:
        'SLACK_BOT_TOKEN hatali bicimde. ' + tur +
        ' Slack > API Apps > OAuth & Permissions > Bot Token Scopes >' +
        ' "Add a Bot Token" ile yeni token uretin.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: 'Bearer ' + token,
      },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);

    if (data && data.ok === true) {
      const who = String(data.user || data.bot_id || 'bot').replace(/"/g, '');
      const team = String(data.team || '?').replace(/"/g, '');
      return {
        ok: true,
        mode,
        detail:
          'Token gecerli. Bot: "' + who + '" | Workspace: "' + team + '". ' +
          'Mesaj gondermeden dogrulandi.',
      };
    }

    return { ok: false, mode, detail: describeSlackError(data) };
  } catch (e) {
    return {
      ok: false,
      mode,
      detail:
        e instanceof Error && e.name === 'AbortError'
          ? 'Slack yanit vermedi (zaman asimi).'
          : 'Slack baglanti hatasi: ' + (e?.message || 'bilinmiyor'),
    };
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