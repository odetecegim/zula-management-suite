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
  diagnoseSlack,
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

/*
  TOKEN TANILAMASI — KANALA MESAJ GONDERMEZ
  -------------------------------------------
  Ayarlar ekraninda tek secenek vardi: "Baglantiyi Test Et" tiklamak,
  o da kanala GERCEK bir mesaj atiyordu. Ayar yaparken kanala onlarca
  test mesaji birikiyor ve token gecerli mi anlamak zor oluyordu.

  Bu testler diagnoseSlack()'in dogru tani verdigini ve HICBIR ortam
  degerini (token/webhook) istemciye sizdirmadigini kanitlar.
*/

test('yapilandirilmamisken token tanilamasi ne yapacagini soyler', async () => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  delete process.env.SLACK_WEBHOOK_URL;
  const r = await diagnoseSlack();
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'none');
  assert.match(r.detail, /Environment Variables/);
});

test('xoxp- (user token) tespit edilir, xoxb- gerekir', async () => {
  process.env.SLACK_BOT_TOKEN = 'xoxp-1234-abc';
  process.env.SLACK_CHANNEL_ID = 'C123';
  const r = await diagnoseSlack();
  assert.equal(r.ok, false);
  assert.match(r.detail, /USER TOKEN/);
  assert.match(r.detail, /xoxb-/);
});

test('xoxb- oneki olmayan deger erken reddedilir (ag cagrisi yapilmaz)', async () => {
  process.env.SLACK_BOT_TOKEN = 'rastgele-bir-metin';
  process.env.SLACK_CHANNEL_ID = 'C123';
  const r = await diagnoseSlack();
  assert.equal(r.ok, false);
  assert.match(r.detail, /tanınamadı/);
  assert.match(r.detail, /18 karakter/);
});

test('webhook adresi bicimi dogrulanir', async () => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  process.env.SLACK_WEBHOOK_URL = 'https://example.com/yanlis';
  const r = await diagnoseSlack();
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'webhook');
  assert.match(r.detail, /gecersiz/);
});

test('gecerli webhook adresi tanilamadan gecer', async () => {
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T000/B000/xxx';
  const r = await diagnoseSlack();
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'webhook');
});

test('ONEMLI: tanilama hicbir sirri istemciye sizdirmaz', async () => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-GIZLI-DEGER-123456';
  process.env.SLACK_CHANNEL_ID = 'C123';
  delete process.env.SLACK_WEBHOOK_URL;
  const r = await diagnoseSlack();
  assert.ok(
    !JSON.stringify(r).includes('GIZLI-DEGER'),
    'SONUC: token degeri istemciye sizdi!'
  );
});

/*
  YAPISTIRMA HATALARI — ASIL SIK KARSILASILAN SORUN
  ---------------------------------------------------
  Kullanici dogru xoxb- token'i aliyor, ama Vercel ortam degiskenine
  yapistirirken bozuluyor: tirnak, "Bearer " on eki, bosluk ya da
  Slack ekranindaki baslik satiri. Onceki surumde bunlar fark edilmiyor
  ve kullaniciya "yeni token uretin" deniyordu — oysa token dogruydu.
*/

test('tirnak icine yapistirilan token duzeltilir', async () => {
  process.env.SLACK_BOT_TOKEN = '"xoxb-1234-5678-abc"';
  process.env.SLACK_CHANNEL_ID = 'C123';
  delete process.env.SLACK_WEBHOOK_URL;
  const r = await diagnoseSlack();
  assert.equal(r.ok, false, 'ag cagrisi yapmadan hata vermeli');
  assert.match(r.detail, /Yapıştırma hatası/);
  assert.match(r.detail, /Tırnak/);
  // "Yeni token üretin" önerisi YAPILMAMALI — mevcut token geçerli.
  assert.ok(
    !/yeni token üret/i.test(r.detail),
    'Yapıştırma hatası varken yeni token üretmek gereksiz'
  );
});

test('"Bearer " oneki olan deger duzeltilir', async () => {
  process.env.SLACK_BOT_TOKEN = 'Bearer xoxb-1234-5678-abc';
  process.env.SLACK_CHANNEL_ID = 'C123';
  const r = await diagnoseSlack();
  assert.match(r.detail, /Yapıştırma hatası/);
  assert.match(r.detail, /Bearer/);
});

test('bosluklu deger duzeltilir', async () => {
  process.env.SLACK_BOT_TOKEN = '   xoxb-1234-5678-abc   ';
  process.env.SLACK_CHANNEL_ID = 'C123';
  const r = await diagnoseSlack();
  // Bosluk temizlenince gecerli token Slack'a gider; ag hatasi olabilir
  // ama "Yapıştırma hatası" DEMEMELI (onceki hatayi tekrarlamamali).
  assert.ok(
    !/Yapıştırma hatası/.test(r.detail),
    'sadece bosluk sorunu yapıştırma hatası sayılmamalı (trim zaten vardı)'
  );
});

test('baslik satiriyla birlikte yapistirilan degerden token cikarilir', async () => {
  process.env.SLACK_BOT_TOKEN = 'Bot User OAuth Token: xoxb-1234-5678-abc';
  process.env.SLACK_CHANNEL_ID = 'C123';
  const r = await diagnoseSlack();
  assert.match(r.detail, /Yapıştırma hatası/);
  assert.match(r.detail, /çıkarıldı/);
});

test('ONEMLI: tanilama yapistirma hatasinda da siri sizdirmaz', async () => {
  process.env.SLACK_BOT_TOKEN = '"xoxb-GIZLI-DEGER-9876"';
  process.env.SLACK_CHANNEL_ID = 'C123';
  const r = await diagnoseSlack();
  assert.ok(
    !JSON.stringify(r).includes('GIZLI-DEGER'),
    'SONUC: token degeri istemciye sizdi!'
  );
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
