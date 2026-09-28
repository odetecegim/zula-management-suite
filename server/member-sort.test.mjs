import assert from 'node:assert/strict';
import { naturalCompare, sortMembers } from '../src/lib/member-sort.ts';

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

console.log('\n== Oyuncu siralamasi (uye kodu > kullanici > isim > puan) ==');
t('once uye koduna gore siralanir', () => {
  const out = sortMembers([
    m({ tagId: 'ZULA-010', fullName: 'Z' }),
    m({ tagId: 'ZULA-002', fullName: 'A' }),
    m({ tagId: 'ZULA-001', fullName: 'B' }),
  ]);
  assert.deepEqual(out.map((x) => x.tagId), ['ZULA-001', 'ZULA-002', 'ZULA-010']);
});
t('ayni kodda kullanici adi belirleyici', () => {
  const out = sortMembers([
    m({ tagId: 'ZULA-001', username: 'zeta', fullName: 'A' }),
    m({ tagId: 'ZULA-001', username: 'alpha', fullName: 'B' }),
  ]);
  assert.deepEqual(out.map((x) => x.username), ['alpha', 'zeta']);
});
t('kod ve kullanici ayniysa isim soyisim belirleyici', () => {
  const out = sortMembers([
    m({ tagId: 'ZULA-001', username: 'x', fullName: 'Zeynep' }),
    m({ tagId: 'ZULA-001', username: 'x', fullName: 'Ali' }),
  ]);
  assert.deepEqual(out.map((x) => x.fullName), ['Ali', 'Zeynep']);
});
t('ilk ucu ayniysa yuksek puan once', () => {
  const out = sortMembers([
    m({ tagId: 'Z', username: 'u', fullName: 'n', participationScore: 40 }),
    m({ tagId: 'Z', username: 'u', fullName: 'n', participationScore: 90 }),
  ]);
  assert.deepEqual(out.map((x) => x.participationScore), [90, 40]);
});
t('orijinal dizi degistirilmez', () => {
  const src = [m({ tagId: 'ZULA-009' }), m({ tagId: 'ZULA-001' })];
  sortMembers(src);
  assert.equal(src[0].tagId, 'ZULA-009');
});

console.log('\n' + d + ' test gecti.\n');
