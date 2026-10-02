import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(here, 'route-handler.js'), 'utf8');

let d = 0, f = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { f++; console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

console.log('\n== Veri kaybi korumasi ==');
t('POST /members bos dizi reddeder', () => {
  // writeMembers once satirlari temizler; bos dizi tum tabloyu silerdi
  const idx = routeSrc.indexOf('case \'members\'');
  const block = routeSrc.slice(idx, idx + 1400);
  assert.ok(
    /body\.members\.length\s*===\s*0/.test(block),
    'members.length === 0 kontrolu yok'
  );
  assert.ok(/fail\(400/.test(block), 'bos dizi icin 400 donulmuyor');
});
t('bos dizi kontrolu yazma isleminden ONCE gelir', () => {
  const idx = routeSrc.indexOf('case \'members\'');
  const block = routeSrc.slice(idx, idx + 1400);
  const guard = block.indexOf('body.members.length === 0');
  const write = block.indexOf('writeMembers(');
  assert.ok(guard !== -1 && write !== -1, 'guard veya write bulunamadi');
  assert.ok(guard < write, 'guard write sonrasinda kalmis - koruma ise yaramaz');
});
t('bos dizi icin anlamli hata mesaji var', () => {
  const idx = routeSrc.indexOf('case \'members\'');
  const block = routeSrc.slice(idx, idx + 1400);
  assert.ok(/silinirdi|silinir/.test(block), 'uyari mesaji eksik');
});

/*
  ROL KONTROLU HATA YOLU
  ----------------------
  Yazma yetkisi kontrolu (readMembers) route-handler'in try/catch
  DISINDAYDY. Google'a erisilemezse istek TAMAMEN cokuyor ve panel
  nedensiz bos bir hata kutusu gosteriyordu. Artik hata 502/503
  + GOOGLE_UNAVAILABLE olarak DONMELI.
*/
console.log('\n== Google erisim hatasi yonetimi ==');
t('rol kontrolu try/catch icinde', () => {
  const idx = routeSrc.indexOf('auth.needsAdminRole');
  assert.ok(idx !== -1, 'rol kontrolu bulunamadi');
  const block = routeSrc.slice(idx, idx + 2200);
  const tryIdx = block.indexOf('try {');
  const readIdx = block.indexOf('await readMembers(');
  const catchIdx = block.indexOf('catch (readErr)');
  assert.ok(tryIdx !== -1, 'rol kontrolunu saran try yok');
  assert.ok(catchIdx !== -1, 'catch (readErr) yok - Google hatasi istegi cokertir');
  assert.ok(
    tryIdx < readIdx && readIdx < catchIdx,
    'readMembers try ve catch arasi kalmis'
  );
});
t('Google erisim hatasi anlamli kod donuyor', () => {
  const idx = routeSrc.indexOf('auth.needsAdminRole');
  const block = routeSrc.slice(idx, idx + 2200);
  assert.ok(/GOOGLE_UNAVAILABLE/.test(block), 'GOOGLE_UNAVAILABLE kodu yok');
  assert.ok(/NO_SPREADSHEET/.test(block), 'spreadsheetId bosken 400 donulmuyor');
});
t('kayitli olmayan kullanici icin ayri kod var', () => {
  const idx = routeSrc.indexOf('auth.needsAdminRole');
  const block = routeSrc.slice(idx, idx + 2600);
  assert.ok(
    /ACTOR_NOT_FOUND/.test(block),
    'ACTOR_NOT_FOUND kodu yok - kullanici tabloda yoksa nedeni belirtilmiyor'
  );
});

console.log('\n' + d + ' koruma testi gecti, ' + f + ' kaldi.\n');
