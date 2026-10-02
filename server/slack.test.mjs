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
  sendSlackMessage,
  sendSlackBlock,
  notifyMemberChange,
  notifyTestSession,
  notifySecurity,
  SLACK_COLORS,
} from './slack.js';

test('SLACK_WEBHOOK_URL tanimli degilse yapilandirilmamis sayilir', () => {
  delete process.env.SLACK_WEBHOOK_URL;
  assert.equal(isSlackConfigured(), false);
});

test('SLACK_WEBHOOK_URL tanimliysa yapilandirilmis sayilir', () => {
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/TEST/BASE/XYZ';
  assert.equal(isSlackConfigured(), true);
  delete process.env.SLACK_WEBHOOK_URL;
});

test('bos (beyaz karakterli) webhook tanimli sayilmaz', () => {
  process.env.SLACK_WEBHOOK_URL = '   ';
  assert.equal(isSlackConfigured(), false, 'bos deger ayar sayilmamali');
  delete process.env.SLACK_WEBHOOK_URL;
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