import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const seedSrc = readFileSync(join(here, '..', 'src', 'data', 'initialData.ts'), 'utf8');
const appSrc = readFileSync(join(here, '..', 'src', 'App.tsx'), 'utf8');

let d = 0, f = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { f++; console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

console.log('\n== Uye listesi: ornek/tohum kayit olmamali ==');

t('yalnizca kurucu hesap tanimli', () => {
  const n = (seedSrc.match(/id: FOUNDER_MEMBER_ID/g) || []).length;
  assert.equal(n, 1, 'kurucu blogu sayisi ' + n);
  assert.ok(/FOUNDER_MEMBER_ID = 'm-1'/.test(seedSrc), 'kurucu kimligi tanimli degil');
});

t('eski ornek kullanicilar tohumda kalmamis', () => {
  for (const gone of ['burak', 'can', 'lucas', 'elena', 'tariq', 'zorba', 'merve']) {
    assert.ok(!seedSrc.includes("'" + gone + "'"), gone + ' hala tohumda');
  }
});

t('tohumda uydurma puan/sayac yok', () => {
  assert.ok(/participationScore: 0,/.test(seedSrc), 'katilim puani sifirdan farkli');
  assert.ok(/bugReportsCount: 0,/.test(seedSrc), 'hata sayaci sifirdan farkli');
});

t('tarayiciya tohum enjeksiyonu kalmamis', () => {
  assert.ok(!/for \(const seed of INITIAL_MEMBERS\)/.test(appSrc), 'tohum dongusu hala var');
  assert.ok(!/SEED_FLAG/.test(appSrc), 'SEED_FLAG mantigi hala var');
});

t('hydration kilidi mevcut (fetch once yazma sonra)', () => {
  assert.ok(/hydrated/.test(appSrc), 'hydration kilidi yok');
  assert.ok(/setHydrated\(true\)/.test(appSrc), 'kilit acma cagrisi yok');
});

t('odak denetimi mevcut (bayat sekme geri yazmasin)', () => {
  assert.ok(/visibilitychange/.test(appSrc), 'visibilitychange dinleyicisi yok');
});

console.log('\n' + d + ' gecti, ' + f + ' kaldi.\n');
