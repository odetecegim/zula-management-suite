/**
 * SLACK BILDIRIMLERI (server/slack.js) — SIFIRDAN YAZIM (2026-10-06)
 *
 * GUVENLIK KURALI:
 * Slack "Incoming Webhook" adresi ve bot token'i SIRDIR; asla istemciye
 * (tarayiciya) gonderilmez. Tum bildirimler sunucu tarafindan yapilir;
 * panel yalnizca "ne oldu" bilgisini API'ye gonderir.
 *
 * IKI YOL DESTEKLENIR:
 *   A) INCOMING WEBHOOK  : SLACK_WEBHOOK_URL = https://hooks.slack.com/services/...
 *   B) BOT TOKEN + KANAL : SLACK_BOT_TOKEN (xoxb-...) + SLACK_CHANNEL_ID (C...)
 *      chat.postMessage kullanir. Ikisi birden varsa B tercih edilir.
 *   Hicbiri tanimli degilse modul sessizce bos gecer (panel calisir).
 *
 * KURULUM:
 *   1) Slack -> Apps -> Incoming Webhooks -> Add to Slack  (yol A)
 *      veya Slack -> Your Apps -> OAuth -> Bot User OAuth Token (yol B)
 *   2) Vercel > Environment Variables > Production altina ekleyin.
 *
 * HATA YONETIMI ILKESI:
 * - Bu modul ASLA istisna firlatmaz; hatalarda false + getSlackError()
 *   dondurur. Panel asla cozulmez.
 * - Slack API'si HTTP 200 ile `{"ok":false,"error":"..."}` donebilir;
 *   govde MUTLAKA okunur ve gercek hata kodu (channel_not_found,
 *   not_in_channel, missing_scope...) kullaniciya gosterilir.
 */

/** Tum Slack cagrilari icin ortak zaman asimi. */
const SLACK_TIMEOUT_MS = 8000;

/** Son Slack hata mesaji (panelde kullaniciya gosterilir). */
let lastError = '';

/** Son hata mesajini dondurur. */
export function getSlackError() {
  return lastError;
}

/** Son hata mesajini temizler. */
export function clearSlackError() {
  lastError = '';
}

/*
  TOKEN NORMALIZASYONU — Vercel'e yapistirma hatalarini onler.
  Kullanici dogru xoxb- token'ini alir ama ortam degiskenine yapistirirken
  bozulur: tirnak, "Bearer " oneki, bosluk ya da Slack ekranindaki baslik
  satiri. Bunlar TEK TEK tespit edilir ve kullaniciya NE YAPACAGI soylenir.
  GUVENLIK: token'in KENDISI hicbir mesajda gosterilmez; yalnizca
  on ek / uzunluk gibi sir olmayan bilgi verilir.
 */
function normalizeToken(raw) {
  let value = String(raw || '').trim();

  // Tirnak icine yapistirma: "xoxb-..." veya 'xoxb-...'
  const unquoted = value.replace(/^["']|["']$/g, '').trim();
  if (unquoted !== value) {
    return {
      value: unquoted,
      problem: 'Tırnak işaretleri (") yapıştırılmıştı; kaldırıldı.',
    };
  }

  // "Bearer xoxb-..." biciminde yapistirma
  if (/^bearer\s+/i.test(value)) {
    return {
      value: value.replace(/^bearer\s+/i, '').trim(),
      problem: 'Baştaki "Bearer " ifadesi kaldırıldı.',
    };
  }

  // Slack arayuzundeki baslik satiriyla birlikte yapistirma:
  // "Bot User OAuth Token: xoxb-..."
  if (/^xox[bp]-/.test(value) === false) {
    const m = value.match(/(xox[bap]-[A-Za-z0-9-]+)/);
    if (m) {
      return {
        value: m[1],
        problem: 'Metin içinden token çıkarıldı (başka karakterler vardı).',
      };
    }
  }

  return { value, problem: '' };
}

const webhookUrl = () => String(process.env.SLACK_WEBHOOK_URL || '').trim();
const botToken = () => String(process.env.SLACK_BOT_TOKEN || '').trim();
const channelId = () => String(process.env.SLACK_CHANNEL_ID || '').trim();

/** Webhook adresi tanimli mi? */
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
 * Slack API'ye POST atar (chat.postMessage, auth.test ...).
 *
 * DAVRANIS:
 * - POST + JSON govde + `Authorization: Bearer <token>` (GET ile query'de
 *   token tasimak yok).
 * - Slack her zaman HTTP 200 donebilir; asil bilgi govdedeki ok/error'dir.
 * - Asla istisna firlatmaz; { ok, data } veya { ok:false, error } dondurur.
 * - Token hicbir hata mesajina GECMEZ (sir sizmasin).
 */
async function callSlackApi(method, token, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch('https://slack.com/api/' + method, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: 'http_' + res.status };
    const data = await res.json().catch(() => null);
    if (data && data.ok === true) return { ok: true, data };
    return { ok: false, error: (data && data.error) || 'empty_response' };
  } catch (e) {
    return {
      ok: false,
      error: e && e.name === 'AbortError' ? 'timeout' : 'network_error',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Incoming Webhook'a duz metin POST eder. Istisna firlatmaz. */
async function postToWebhook(url, text) {
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
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Slack API hata kodunu insanca cevirir — MESAJA HAM KODU EKLER.
 * Panelde "Slack hatası: channel_not_found" gibi gercek kod gorunur;
 * kullanici (ve biz) neden mesaj gitmedigini aninda anlar.
 */
function describeSlackError(error) {
  const code = String(error || 'bilinmiyor');
  switch (code) {
    case 'not_in_channel':
      return (
        'Bot bu kanalın ÜYESİ DEĞİL (Slack: not_in_channel). Kanala sağ tık → ' +
        '“Uygulamalar” → botu kanala ekleyin (veya kanalda /invite @botadi yazın).'
      );
    case 'invalid_auth':
      return 'SLACK_BOT_TOKEN geçersiz (Slack: invalid_auth). Yeni bir bot token üretip Vercel’e tekrar ekleyin.';
    case 'channel_not_found':
      return (
        'SLACK_CHANNEL_ID bulunamadı (Slack: channel_not_found). Kanal adı (örn. #genel) değil, ' +
        'Slack kanal ID’si (C ile başlayan kod) kullanılmalıdır: kanala sağ tık → ' +
        '“Kanal bilgisini görüntüle” → en alttaki ID.'
      );
    case 'account_inactive':
    case 'token_revoked':
      return 'Bot token iptal edilmiş (Slack: ' + code + '). Yeni token üretin.';
    case 'no_permission':
      return 'Bot’un bu kanala mesaj atma yetkisi yok (Slack: no_permission).';
    case 'not_allowed_token_type':
      return (
        'SLACK_BOT_TOKEN bir BOT TOKENI degil (Slack: not_allowed_token_type). Değer “xoxb-” ile ' +
        'başlamalı: OAuth & Permissions → Bot Token Scopes → Install to Workspace ile yeni xoxb- token üretin.'
      );
    case 'missing_scope':
      return (
        'Bot token’ın “chat:write” yetkisi yok (Slack: missing_scope). ' +
        'OAuth & Permissions → Scopes → chat:write ekleyip uygulamayı yeniden kurun.'
      );
    case 'timeout':
      return 'Slack yanıt vermedi (zaman aşımı). Bir süre sonra tekrar deneyin.';
    case 'network_error':
      return 'Slack API’ye bağlanılamadı (ağ hatası).';
    case 'http_429':
      return 'Slack istek sınırına takıldık (HTTP 429). Biraz bekleyip tekrar deneyin.';
    default:
      return 'Slack hatası: ' + code;
  }
}

/**
 * KANAL DEGERI KANAL ADI MI, ID MI? (chat.postMessage ID ister)
 *
 * SIK YAPILAN HATA: SLACK_CHANNEL_ID alanina "#genel" gibi kanal ADI
 * yapistirilir; Slack channel_not_found dondurur ve mesaj gitmez.
 * Ag cagrisi YAPILMADAN, acik ve yonlendirici hata doner.
 */
function channelFormatProblem(channel) {
  if (String(channel).startsWith('#')) {
    return (
      'SLACK_CHANNEL_ID kanal ADI gibi görünüyor (' +
      String(channel).slice(0, 24) +
      '). Kanal adı (örn. #genel) değil, Slack kanal ID’si (C ile başlayan kod) kullanılmalıdır: ' +
      'kanala sağ tık → “Kanal bilgisini görüntüle” → en alttaki ID. (Slack: channel_not_found)'
    );
  }
  if (!/^[CGD][A-Z0-9]{8,}$/i.test(String(channel))) {
    return (
      'SLACK_CHANNEL_ID değeri geçersiz görünüyor (' +
      String(channel).slice(0, 24) +
      '). Slack kanal ID’si C/G/D ile başlayan bir koddur: kanala sağ tık → ' +
      '“Kanal bilgisini görüntüle” → en alttaki ID. (Slack: channel_not_found)'
    );
  }
  return '';
}
/**
 * Bot yolu ile mesaj gonderir: auth.test -> chat.postMessage.
 *
 * ADIMLAR (ve nedenleri):
 * 1) Kanal degeri gercek Slack ID mi? Degilse AGA CIKMA, acik hata don.
 * 2) auth.test: token gercekten gecerli mi? (token kontrolu — mesaj GONDERMEZ)
 * 3) chat.postMessage: asil gonderim. Slack `ok:false` donebilir; govde okunur,
 *    gercek hata kodu kullaniciya gosterilir.
 * 4) Yedek yol: yalnizca SLACK_WEBHOOK_URL TANIMLIYSA ve sorun token
 *    kaynakliysa (invalid_auth) webhook'a duser; kanal sorununda yedek
 *    YOKTUR — sebep acikca soylenir.
 */
async function postViaBotApi(text, blocks) {
  const { value: token } = normalizeToken(botToken());
  const channel = channelId();
  if (!token || !channel) {
    lastError = 'SLACK_BOT_TOKEN veya SLACK_CHANNEL_ID eksik.';
    return false;
  }

  // 1) Kanal degeri kontrolu (ag cagrisi olmadan)
  const channelProblem = channelFormatProblem(channel);
  if (channelProblem) {
    lastError = channelProblem;
    return false;
  }

  // 2) Token dogrulamasi — mesaj GONDERMEZ
  const who = await callSlackApi('auth.test', token, {});
  if (!who.ok) {
    const fallback = webhookUrl();
    if (fallback) {
      const fb = await postToWebhook(fallback, text);
      lastError = fb
        ? 'Bot tokeni doğrulanamadı (' +
          who.error +
          '); mesaj yedek yolla (Incoming Webhook) gönderildi.'
        : 'Bot tokeni doğrulanamadı (' + who.error + '); yedek yol da başarısız.';
      return fb;
    }
    lastError = describeSlackError(who.error);
    return false;
  }

  // 3) Asil gonderim
  const sent = await callSlackApi('chat.postMessage', token, {
    channel,
    text: String(text).slice(0, 3000),
    ...(blocks && blocks.length ? { blocks } : {}),
  });
  if (sent.ok) {
    lastError = '';
    return true;
  }

  // 4) Yedek yol — yalnizca token sorununda
  const fallback = webhookUrl();
  if (fallback && sent.error === 'invalid_auth') {
    const fb = await postToWebhook(fallback, text);
    lastError = fb
      ? 'Bot tokeni geçersizdi (invalid_auth); mesaj yedek yolla (Incoming Webhook) gönderildi.'
      : 'Bot tokeni geçersizdi (invalid_auth); yedek yol da başarısız.';
    return fb;
  }

  // Kanal/yetki sorunlarinda yedek YOK: gercek Slack hatasi gosterilir.
  lastError = describeSlackError(sent.error);
  return false;
}

/**
 * Duz metin mesaj gonderir. Asla istisna firlatmaz; false doner.
 */
export async function sendSlackMessage(text) {
  if (!isSlackConfigured()) return false;
  try {
    const mode = slackMode();
    if (mode === 'bot') return await postViaBotApi(text);
    if (mode === 'webhook') {
      const sent = await postToWebhook(webhookUrl(), text);
      lastError = sent
        ? ''
        : 'Webhook’a mesaj gönderilemedi (adres veya ağ hatası). SLACK_WEBHOOK_URL’i kontrol edin.';
      return sent;
    }
    return false;
  } catch (e) {
    lastError = 'Beklenmeyen Slack hatası: ' + (e && e.message ? e.message : 'bilinmiyor');
    return false;
  }
}
/**
 * TOKEN TANILAMASI — KANALA MESAJ GONDERMEZ.
 *
 * Ayarlar ekranindaki "Tokenı Kontrol Et" butonu bunu cagirir.
 * Slack `auth.test` ucu cagrilir; kanala HICBIR sey yazilmaz.
 * Sonuc asla token/webhook DEGERINI icermez (sir sizmasi engeli).
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
        'SLACK_BOT_TOKEN + SLACK_CHANNEL_ID veya SLACK_WEBHOOK_URL tanımlı değil. ' +
        'Vercel > Settings > Environment Variables altına ekleyip redeploy edin.',
    };
  }

  // Webhook yolunda Slack dogrulama ucu yok; yalnizca adres bicimi kontrolu.
  if (mode === 'webhook') {
    const url = webhookUrl();
    if (!/^https:\/\/hooks\.slack\.com\/services\//.test(url)) {
      return {
        ok: false,
        mode,
        detail:
          'SLACK_WEBHOOK_URL gecersiz görünüyor. Beklenen biçim: ' +
          'https://hooks.slack.com/services/T.../B.../...',
      };
    }
    return {
      ok: true,
      mode,
      detail: 'Webhook adresi biçimi doğru. Kanaldan görünüyorsa bağlantı kuruludur.',
    };
  }

  // --- Bot token yolu ---
  const { value: token, problem } = normalizeToken(botToken());

  // Yapistirma hatasi: token muhtemelen DOGRU; aga cikmadan soyle.
  if (problem) {
    return {
      ok: false,
      mode,
      detail:
        'Yapıştırma hatası: ' +
        problem +
        ' Değer otomatik düzeltildi; mevcut token kullanılabilir.',
    };
  }

  if (/^xoxp-/.test(token)) {
    return {
      ok: false,
      mode,
      detail:
        'SLACK_BOT_TOKEN bir USER TOKEN (xoxp-) — bot tokeni değil. xoxb- ile başlayan ' +
        '"Bot User OAuth Token" değerini kullanın: Slack > Your Apps > OAuth & Permissions.',
    };
  }

  if (!/^xoxb-/.test(token)) {
    return {
      ok: false,
      mode,
      detail:
        'Token biçimi tanınamadı: xoxb- ile başlamıyor (uzunluk: ' +
        token.length +
        ' karakter). Slack > Your Apps > OAuth & Permissions bölümündeki ' +
        '"Bot User OAuth Token" değerini kopyalayın.',
    };
  }

  // Format dogru -> gercek dogrulama (mesaj gonderilmez)
  const who = await callSlackApi('auth.test', token, {});
  if (!who.ok) {
    return {
      ok: false,
      mode,
      detail:
        'Slack API doğrulanamadı (' +
        who.error +
        '). Token değeri güvenlik için gösterilmez.',
    };
  }

  const botName = who.data && who.data.user;
  const team = who.data && who.data.team;
  return {
    ok: true,
    mode,
    detail:
      'Token geçerli' +
      (botName ? ' | Bot: "' + botName + '"' : '') +
      (team ? ' | Workspace: "' + team + '"' : '') +
      '. Mesaj gönderilmeden doğrulandı.',
  };
}

/**
 * Blok (zengin) mesaj gonderir. Asla istisna firlatmaz.
 *
 * Bot yolu: chat.postMessage + blocks. Webhook yolu: duz metne indirgenir
 * (webhook blocks desteklemez).
 */
export async function sendSlackBlock(opts) {
  if (!isSlackConfigured()) return false;
  try {
    const title = String(opts?.title || '').slice(0, 150);
    const fields = Array.isArray(opts?.fields) ? opts.fields : [];
    const footer = opts?.footer ? String(opts.footer) : '';

    if (slackMode() === 'bot') {
      const fieldBlocks = fields.slice(0, 10).map((f) => ({
        text: '*' + String(f.label || '') + '*\n' + String(f.value ?? '-'),
      }));
      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: title } },
        ...(fieldBlocks.length
          ? [{ type: 'section', fields: fieldBlocks }]
          : []),
        ...(footer
          ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: footer }] }]
          : []),
      ];
      return await postViaBotApi(title, blocks);
    }

    // Webhook: zengin bloklar yok; okunur duz metin kur.
    const flat = [
      title,
      ...fields.map((f) => String(f.label || '') + ': ' + String(f.value ?? '-')),
      footer,
    ]
      .filter(Boolean)
      .join('\n');
    return await sendSlackMessage(flat);
  } catch (e) {
    lastError = 'Beklenmeyen Slack hatası: ' + (e && e.message ? e.message : 'bilinmiyor');
    return false;
  }
}
/* Renk kodlari (Slack attachment renkleri). */
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