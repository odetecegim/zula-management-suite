import assert from 'node:assert/strict';
import { naturalCompare, playerIdCompare, sortMembers } from '../src/lib/member-sort.ts';

let d = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

const m = (o) => ({ participationScore: 0, username: '', fullName: '', ...o });

console.log('\n== Dogal karsilastirma ==');
t('ZULA-2 < ZULA-10 (sayisal, alfabetik degil)', () => {
  assert.ok(naturalCompare('ZULA-2', 'ZULA-10') < 0);
});
t('ZULA-001 < ZULA-002', () => assert.ok(naturalCompare('ZULA-001', 'ZULA-002') < 0));
t('buyuk/kucuk harf duyarsiz', () => assert.equal(naturalCompare('zula', 'ZULA'), 0));
t('bos degerler sona gider', () => assert.ok(naturalCompare('', 'A') < 0));

console.log('\n== Oyuncu Member ID karsilastirmasi ==');
t('sayisal: 999, 10248571 den KUCUK', () => {
  // Metin karsilastirmasi burada yanlis verirdi: "999" > "10248571" sanilir
  assert.ok(playerIdCompare('999', '10248571') < 0);
});
t('sayisal: 2, 10 dan kucuk', () => assert.ok(playerIdCompare('2', '10') < 0));
t('esit degerler 0 doner', () => assert.equal(playerIdCompare('500', '500'), 0));
t('bos deger her zaman sona gider', () => {
  assert.ok(playerIdCompare('', '500') > 0);
  assert.ok(playerIdCompare('500', '') < 0);
  assert.equal(playerIdCompare('', ''), 0);
});

console.log('\n== Sıralama: OYUNCU ID > kullanici > isim > puan ==');
const mm = (tag, user, name, pid, score = 0) => ({
  tagId: tag, username: user, fullName: name, playerId: pid, participationScore: score,
});

t('siralamada UYE KODU degil OYUNCU ID kullanilir', () => {
  // Uye kodlari sirali degil, oyuncu IDleri sirali: ID esas alinmali
  const out = sortMembers([
    mm('ZULA-001', 'aaa', 'Ali', '999'),
    mm('ZULA-009', 'bbb', 'Bora', '10248571'),
  ]);
  assert.deepEqual(out.map((x) => x.playerId), ['999', '10248571']);
});
t('uye kodu sirasi ETKISIZ olmali', () => {
  const out = sortMembers([mm('ZULA-001', 'a', 'A', '500'), mm('ZULA-009', 'b', 'B', '100')]);
  assert.deepEqual(out.map((x) => x.playerId), ['100', '500']);
});
t('ayni oyuncu ID -> kullanici adi belirleyici', () => {
  const out = sortMembers([
    mm('ZULA-001', 'zeta', 'Ali', '500'),
    mm('ZULA-002', 'alpha', 'Veli', '500'),
  ]);
  assert.deepEqual(out.map((x) => x.username), ['alpha', 'zeta']);
});
t('ID + kullanici ayni -> isim soyisim belirleyici', () => {
  const out = sortMembers([
    mm('Z', 'u', 'Zeynep', '500'),
    mm('Z', 'u', 'Ali', '500'),
  ]);
  assert.deepEqual(out.map((x) => x.fullName), ['Ali', 'Zeynep']);
});
t('ilk ucu ayniysa yuksek puan once', () => {
  const out = sortMembers([
    mm('Z', 'u', 'n', '500', 40),
    mm('Z', 'u', 'n', '500', 90),
  ]);
  assert.deepEqual(out.map((x) => x.participationScore), [90, 40]);
});
t('Oyuncu ID girmemis uyeler en sonda', () => {
  const out = sortMembers([mm('ZULA-001', 'a', 'A', ''), mm('ZULA-002', 'b', 'B', '500')]);
  assert.deepEqual(out.map((x) => x.username), ['b', 'a']);
});
t('getScore ile donem puani kullanilir', () => {
  const out = sortMembers(
    [{ ...mm('Z', 'u', 'n', '500'), id: 0 }, { ...mm('Z', 'u', 'n', '500'), id: 1 }],
    (x) => (x.id === 0 ? 10 : 80)
  );
  assert.deepEqual(out.map((x) => x.id), [1, 0]);
});
t('orijinal dizi degistirilmez', () => {
  const src = [mm('ZULA-002', 'a', 'A', '200'), mm('ZULA-001', 'b', 'B', '100')];
  sortMembers(src);
  assert.equal(src[0].playerId, '200');
});

console.log('\n' + d + ' sıralama testi gecti.\n');
