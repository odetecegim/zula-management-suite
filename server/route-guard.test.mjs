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

/*
  OTURUM BELIRTECI KAYBI — REGRESYON TESTI
  -----------------------------------------
  Panel yerel listeden giris yaparken sunucuya hic gitmiyordu; bu
  yuzden imzali oturum belirteci (x-session-token) OLUSMUYORDU.

  Sonuc: panel girisli gorunuyor ama Slack uc noktalari 401 aliyor ve
  kullanici belirsiz bir "Sunucu istegi reddetti" mesaji goruyordu.

  Bu test, yerel giris yolunun da sunucudan dogrulama istedigini
  ve belirteci edinmesini gerektigini kilitler.
*/
const loginSrc = readFileSync(join(here, '..', 'src', 'components', 'LoginScreen.tsx'), 'utf8');
const slackSrc = readFileSync(join(here, '..', 'src', 'lib', 'slack.ts'), 'utf8');

console.log('\n== Oturum belirteci kaybi onlemi ==');

t('yerel giris de sunucudan dogrulama istiyor', () => {
  const idx = loginSrc.indexOf('local.password === cleanPass');
  assert.ok(idx !== -1, 'yerel giris blogu bulunamadi');
  const block = loginSrc.slice(idx, idx + 2000);
  assert.ok(
    /remoteLogin\(/.test(block),
    'YEREL GIRIS SUNUCUDAN DOGRULANMIYOR -> oturum belirteci olusmaz (asil hata)'
  );
});

t('yerel giris, sunucu dogrularsa belirteci aliyor', () => {
  const idx = loginSrc.indexOf('local.password === cleanPass');
  const block = loginSrc.slice(idx, idx + 2000);
  assert.ok(
    /remote\.status === 'ok'/.test(block),
    'sunucu dogrulandiginda giris tamamlanmiyor'
  );
});

t('pasif hesap engeli yerel yolda da korunuyor', () => {
  const idx = loginSrc.indexOf('local.password === cleanPass');
  const block = loginSrc.slice(idx, idx + 2000);
  assert.ok(
    /pasif/i.test(block),
    'yerel yolda pasif hesap kontrolu kalkmis olabilir'
  );
});

t('belirsiz hata mesaji kaldirilmis (gercek neden gosteriliyor)', () => {
  assert.ok(
    !/message: 'Sunucu isteği reddetti\.'/.test(slackSrc),
    'hata mesaji yine sabit metin; kullanici 401 nedenini ogrenemez'
  );
  assert.ok(
    /describeFailure/.test(slackSrc),
    'ortak hata ayristirici kullanilmiyor'
  );
});

t('401 alinca belirtec temizleniyor (dongu kirilmaz)', () => {
  assert.ok(
    /setSessionToken\(null\)/.test(slackSrc),
    '401 sonrasi belirtec silinmiyor; her denemede ayni hata tekrarlanir'
  );
});

console.log('\n' + d + ' koruma testi gecti, ' + f + ' kaldi.\n');

/*
  KULLANICI YOLU — "Nerden giris yapacagim?" sorusunun cevabi
  ------------------------------------------------------------
  Panel 401 dondugunde "Panele yeniden giriş yapin" mesaji gosteriyordu
  ama cikis dugmesi sol menusunun altinda gizliydi. Kullanici bu hatayi
  alinca nereden cikacagini bilmiyordu.

  Artik hata mesajinin altinda dogrudan "Oturumu Yenile" dugmesi var.
*/
const settingsSrc = readFileSync(join(here, '..', 'src', 'components', 'SettingsView.tsx'), 'utf8');
const appSrc = readFileSync(join(here, '..', 'src', 'App.tsx'), 'utf8');

console.log('\n== Oturum yenileme yolu ==');

t('Ayarlar ekraninda giris ekranina donen dugme var', () => {
  assert.ok(
    /onForceRelogin/.test(settingsSrc),
    'Ayarlar ekraninda oturum yenileme dugmesi yok'
  );
  assert.ok(
    /needsLogin/.test(settingsSrc),
    'hata metnine gore dugmenin gorunurlugu belirlenmiyor'
  );
});

t('App.tsx oturumu gercekten temizliyor', () => {
  const idx = appSrc.indexOf('handleForceRelogin');
  assert.ok(idx !== -1, 'handleForceRelogin tanimli degil');
  const block = appSrc.slice(idx, idx + 1200);
  assert.ok(/setSessionToken\(null\)/.test(block), 'oturum belirteci temizlenmiyor');
  assert.ok(/setCurrentUserId\(null\)/.test(block), 'kullanici oturumu kapatilmiyor');
});

t('SettingsViewa gerekli prop geciriliyor', () => {
  assert.ok(
    /onForceRelogin=\{handleForceRelogin\}/.test(appSrc),
    'App, SettingsViewa onForceRelogin gecirmiyor'
  );
});

console.log('\n' + d + ' koruma testi gecti, ' + f + ' kaldi.\n');
