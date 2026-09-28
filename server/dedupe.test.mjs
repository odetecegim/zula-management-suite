import assert from 'node:assert/strict';
import { dedupeByTag } from './members-store.js';

const real = (id) => ({ id, tagId: 'ZULA-004', fullName: 'Gercek' });
const demo = (id) => ({ id, tagId: 'ZULA-004', fullName: 'Ornek' });

let d = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

console.log('\n== Tekillestirme (dedupe) ==');
t('gercek kayit once gelirse ornek dusurulur', () => {
  const out = dedupeByTag([real('m-1790599861896'), demo('m-4')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'm-1790599861896');
});
t('ornek once gelirse gercek kayit onun yerine gecer', () => {
  const out = dedupeByTag([demo('m-4'), real('m-1790599861896')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'm-1790599861896');
});
t('iki gercek kayittan ilki kalir', () => {
  const out = dedupeByTag([real('m-1111111111111'), real('m-2222222222222')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'm-1111111111111');
});
t('farkli kodlar hic etkilenmez', () => {
  const list = [
    { id: 'm-1', tagId: 'ZULA-001' }, { id: 'm-2', tagId: 'ZULA-002' },
    { id: 'm-3', tagId: 'ZULA-003' },
  ];
  assert.equal(dedupeByTag(list).length, 3);
});
t('kodu bos olanlar korunur', () => {
  const out = dedupeByTag([{ id: 'a', tagId: '' }, { id: 'b', tagId: '' }]);
  assert.equal(out.length, 2);
});
t('buyuk/kucuk harf ayni kod sayilir', () => {
  const out = dedupeByTag([{ id: 'm-4', tagId: 'zula-004' }, { id: 'm-1790599861896', tagId: 'ZULA-004' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'm-1790599861896');
});
t('sira degismez (ilk sirada duren kalir)', () => {
  const list = [
    { id: 'x1', tagId: 'A' }, { id: 'x2', tagId: 'B' },
    { id: 'x3', tagId: 'A' }, { id: 'x4', tagId: 'C' },
  ];
  assert.deepEqual(dedupeByTag(list).map((m) => m.id), ['x1', 'x2', 'x4']);
});

console.log('\n' + d + ' dedupe testi gecti.\n');
