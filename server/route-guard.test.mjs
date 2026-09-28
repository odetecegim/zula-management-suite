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

console.log('\n' + d + ' koruma testi gecti, ' + f + ' kaldi.\n');
