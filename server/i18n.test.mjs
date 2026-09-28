import assert from 'node:assert/strict';
import tr from '../src/i18n/tr.ts';
import en from '../src/i18n/en.ts';

let d = 0, f = 0;
const t = (name, fn) => {
  try { fn(); d++; console.log('  OK   ' + name); }
  catch (e) { f++; console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

const tk = Object.keys(tr);
const ek = Object.keys(en);

console.log('\n== Sozluk butunlugu ==');
t('TR/en anahtar sayisi esit (' + tk.length + ')', () => assert.equal(ek.length, tk.length));

t('EN icinde TR olmayan anahtar yok', () => {
  const extra = ek.filter((k) => !(k in tr));
  assert.equal(extra.length, 0, 'fazla anahtar: ' + extra.join(', '));
});
t('TR icinde EN olmayan anahtar yok', () => {
  const missing = tk.filter((k) => !(k in en));
  assert.equal(missing.length, 0, 'eksik anahtar: ' + missing.join(', '));
});

console.log('\n== Icerik dogrulugu ==');
t(' hicbir deger bos degil', () => {
  const bad = [...tk, ...ek].filter((k) => {
    const v = tr[k] ?? en[k];
    return typeof v !== 'string' || v.trim() === '';
  });
  assert.equal(bad.length, 0, 'bos deger: ' + bad.join(', '));
});
t('TR kisa/ortak kelimeler disinda Turkce karakter iceriyor', () => {
  // "Kaydet", "Ekle", "Sil" gibi diyakritiksiz kelimelerde kontrol yapilamaz.
  // Yalnizca en az 6 karakterli ve *dokunulmamis* kalanlari denetle.
  const suspects = tk.filter((k) => {
    const v = tr[k];
    return v.length >= 6 && !/[çğıöşüÇĞİÖŞÜâîî]/.test(v) && !/[A-ZÇĞİÖŞÜ]/.test(v[0]);
  });
  // Buraya yalnizca gercekten cevrilmemis Turkce metinler duser
  assert.equal(suspects.length, 0, 'suphecli: ' + suspects.join(', '));
});
t('EN degerleri TR ile birebir ayni degil (ozel adlar haric)', () => {
  // Marka / ozel ad oldugu icin cevrilmesi dogru olmayanlar
  const properNouns = new Set(['languageSelection', 'navSheets', 'discordTag', 'perm_sheets', 'sheetsTabMembers']);
  const same = tk.filter((k) => tr[k] === en[k] && !properNouns.has(k));
  assert.equal(same.length, 0, 'cevrilmemis: ' + same.join(', '));
});
t('ozel adlar gercekten ayni kalmis', () => {
  for (const k of ['navSheets', 'discordTag', 'perm_sheets']) {
    assert.equal(en[k], tr[k], k + ' ozel ad olarak degismemeli');
  }
  assert.equal(en.sheetsTabMembers, 'UyeListesi', 'Sheets sekme adi degistirilemez');
});
t('anahtar adlari kisa ve anlamli', () => {
  const bad = tk.filter((k) => !/^[a-z][a-zA-Z0-9_]{1,40}$/.test(k));
  assert.equal(bad.length, 0, 'gecersiz anahtar: ' + bad.join(', '));
});

console.log('\n== Kritik terimler (ayni kavrami cevirmemek icin) ==');
t('Uye Kodu / Member Code eslesiyor', () => {
  assert.equal(en.tagId, 'Member Code');
});
t('Oyuncu ID / Player ID eslesiyor', () => {
  assert.equal(en.playerId, 'Player ID');
});

console.log('\n' + d + ' gecti, ' + f + ' kaldi.\n');
