/**
 * Slack modulu testleri
 *
 * ONEMLI: Bu testler SLACK_WEBHOOK_URL tanimli DEGILKEN calisir ve
 * ag cagrisi yapmaz. Amac, "tanimli degilken sessizce gecmesi" ve
 * "webhook adresinin istemciye sizmamasi" davranislarini kilitlemek.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSlackConfigured,
  slackMode,
  sendSlackMessage,
  sendSlackBlock,
  notifyMemberChange,
  notifyTestSession,
  notifySecurity,
  SLACK_COLORS,
} from './slack.js';

test('hicbir kimlik bilgisi yoksa yapilandirilmamis sayilir', () => {
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  assert.equal(isSlackConfigured(), false);
  assert.equal(slackMode(), 'none');
});

test('yalnizca webhook varsa mod webhook olur', () => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T/B/X';
  assert.equal(isSlackConfigured(), true);
  assert.equal(slackMode(), 'webhook');
  delete process.env.SLACK_WEBHOOK_URL;
});

test('bot token + kanal ID varsa mod bot olur (KANAL DESTEGI)', () => {
  // Kullanicinin verdigi kanal ID'si bu yolda kullanilir
  delete process.env.SLACK_WEBHOOK_URL;
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  process.env.SLACK_CHANNEL_ID = 'C0C5W28LU6T';
  assert.equal(isSlackConfigured(), true);
  assert.equal(slackMode(), 'bot');
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
});

test('bot token var ama kanal ID yoksa YAPILANDIRILMIS sayilmaz', () => {
  // Kanal olmadan bot nereye yazacak? Bilinmiyor -> kapalı.
  delete process.env.SLACK_WEBHOOK_URL;
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  delete process.env.SLACK_CHANNEL_ID;
  assert.equal(isSlackConfigured(), false, 'kanal ID olmadan bagli sayilmamali');
  delete process.env.SLACK_BOT_TOKEN;
});

test('kanal ID var ama bot token yoksa YAPILANDIRILMIS sayilmaz', () => {
  // Kanal ID tek basina yetmez: kimlik bilgisi gerekir.
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_BOT_TOKEN;
  process.env.SLACK_CHANNEL_ID = 'C0C5W28LU6T';
  assert.equal(
    isSlackConfigured(),
    false,
    'kanal ID tek basina (kimliksiz) baglanma sayilmamali'
  );
  delete process.env.SLACK_CHANNEL_ID;
});

test('iki yol birden tanimliysa bot tercih edilir', () => {
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T/B/X';
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  process.env.SLACK_CHANNEL_ID = 'C0C5W28LU6T';
  assert.equal(slackMode(), 'bot', 'bot yolu daha esnek, oncelikli olmali');
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
});

test('yapilandirilmamisken mesaj gonderme sessizce basarisiz olur (ag cagrisi yok)', async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const ok = await sendSlackMessage('test');
  assert.equal(ok, false, 'hata firlatmamali, false donmeli');
});

test('yapilandirilmamisken blok mesaj sessizce gecer', async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const ok = await sendSlackBlock({ title: 'Test', fields: [{ label: 'a', value: 'b' }] });
  assert.equal(ok, false);
});

test('yapilandirilmamisken uye bildirimi sessizce gecer', async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const ok = await notifyMemberChange(
    'eklendi',
    { fullName: 'Test Üye', tagId: 'ZULA-999', role: 'academy_member' },
    'Hüseyin'
  );
  assert.equal(ok, false);
});

test('yapilandirilmamisken test oturumu bildirimi sessizce gecer', async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const ok = await notifyTestSession('baslatildi', { title: 'Oyuncu Testi', game: 'Zula PC' }, 'Hüseyin');
  assert.equal(ok, false);
});

test('yapilandirilmamisken guvenlik bildirimi sessizce gecer', async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const ok = await notifySecurity('Hesap kilitlendi', 'kullanici: huseyin');
  assert.equal(ok, false);
});

test('bildirim hatasi asla istisna firlatmaz (panel bozulmaz)', async () => {
  // Gecersiz URL tanimli: fetch hata firlatir; fonksiyon YUTMALI.
  process.env.SLACK_WEBHOOK_URL = 'bu-gecersiz-bir-url';
  const ok = await sendSlackMessage('test');
  assert.equal(ok, false, 'hata yakalanip false donmeli');
  delete process.env.SLACK_WEBHOOK_URL;
});

test('SLACK_COLORS gecerli hex renkler iceriyor', () => {
  for (const key of Object.keys(SLACK_COLORS)) {
    assert.match(
      SLACK_COLORS[key],
      /^#[0-9a-f]{6}$/i,
      key + ' gecerli hex renk olmali'
    );
  }
});