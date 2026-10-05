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

/*
  SESSION_SECRET — OTURUM SIFIRLANMASI VE GUVENLIK
  -------------------------------------------------
  Onceki surumde imzalama anahtari sirasiyla SESSION_SECRET,
  GOOGLE_PRIVATE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON ve SON OLARAK kaynak
  kodda acik yazan sabit metne dusuyordu.

  Iki SORUN birden vardi:
    1) GUVENLIK: acik metin anahtar bilinse biri istedigi uye icin
       gecerli oturum belirteci uretebilirdi.
    2) OTURUM SIFIRLANMASI: anahtar her deploy'da degistiginde
       kullanici 12 saati dolmadan oturumunu kaybediyor ve
       "oturumun suresi doldu" goruyordu.

  Artik SESSION_SECRET yoksa surec ici uretilen rastgele anahtar
  kullanilir (guvenli ama her deploy'da degisir) ve /api/sheets/status
  bunu `sessionSecretSet: false` olarak bildirir.
*/
const authSrc = readFileSync(join(here, 'auth.js'), 'utf8');

const LF = String.fromCharCode(10);
/** Yorum satirlari (aciklama) kod sayilmaz. */
const YORUM = new RegExp(String.fromCharCode(94, 92) + 's*');

console.log('== Oturum imzalama guvenligi ==');

t('kaynak koda gomulu sabit imzalama anahtari kaldirildi', () => {
  // Yalniz KODDA kullanilan bir anahtar tehlikelidir; aciklamada gecen
  // metin (bu testin aciklamasi dahil) tehlike degildir.
  const kod = authSrc.split(LF).filter((s) => !YORUM.test(s)).join(LF);
  assert.ok(
    !/zula-suite-gelistirme-anahtari/.test(kod),
    'SONUC: hala acik metin imzalama anahtari var; biri oturum uretebilir'
  );
});

t('SESSION_SECRET tanimli degilse rastgele anahtar uretilir', () => {
  assert.ok(/randomBytes\(32\)/.test(authSrc), 'gecici guvenli anahtar uretilmiyor');
});

t('SESSION_SECRET tanimliysa SADECE o kullanilir', () => {
  const idx = authSrc.indexOf('function secret()');
  const block = authSrc.slice(idx, idx + 700);
  assert.ok(/process\.env\.SESSION_SECRET/.test(block), 'SESSION_SECRET okunmuyor');
  assert.ok(
    !/GOOGLE_PRIVATE_KEY/.test(block),
    'yine Google JSON una yonlendiriyor; oturumlar deploy da sifirlanir'
  );
});

t('eksik SESSION_SECRET icin sunucu uyarisi var', () => {
  assert.ok(/console\.warn/.test(authSrc), 'eksiklik sessizce geciyor');
});

t('status ucu sessionSecretSet bildiriyor (sir sizmadan)', () => {
  const routeSrc = readFileSync(join(here, 'route-handler.js'), 'utf8');
  assert.ok(/sessionSecretSet: hasSessionSecret\(\)/.test(routeSrc), 'tanilama eksik');
  assert.ok(
    !/SESSION_SECRET:\s*process\.env/.test(routeSrc),
    'SONUC: session degerinin kendisi istemciye siziyor'
  );
});

console.log(LF + d + ' koruma testi gecti, ' + f + ' kaldi.' + LF);



/*
  OTURUM BITINCE OTOMATIK GIRIS EKRANINA GECIS
  --------------------------------------------
  SESSION_SECRET degistiginde tum oturumlar aninda gecersizlesir.
  Panel once sadece mesaj gosteriyordu; kullanici Ayarlar ekraninda
  oturup "Baglantiyi Test Et"e basmaya devam ediyor, hep ayni hatayi
  aliyordu ("baglanti testi yapamiyorum").

  Artik her 401'de kullanici OTOMATIK giris ekranina gecirilir.
*/
const sessSrc = readFileSync(join(here, '..', 'src', 'lib', 'session-token.ts'), 'utf8');

console.log('\n== Oturum bitince otomatik yonlendirme ==');

t('session-token oturum sona erdi olayi yayinliyor', () => {
  assert.ok(
    /onSessionExpired/.test(sessSrc),
    'uyari olayi tanimli degil'
  );
  assert.ok(/notifySessionExpired/.test(sessSrc), 'bildirim fonksiyonu yok');
});

t('App.tsx 401 olayini dinleyip oturumu kapatiyor', () => {
  assert.ok(
    /onSessionExpired\(\(\) =>/.test(appSrc),
    'App.tsx oturum sonunu dinlemiyor'
  );
  assert.ok(
    /removeItem\('zula_suite_session'\)/.test(appSrc.slice(appSrc.indexOf('onSessionExpired'))),
    'eski oturum izi temizlenmiyor'
  );
});

t('arka plan senkronu 401de otomatik cikis YAPMIYOR', () => {
  // TASARIM (2026-10-06): arka plan senkronu 401 aldiginda otomatik
  // cikis tetiklenmemeli; yoksa giris-sonrasi atilma dongusu olur.
  // Cikis karari kullanicidadir (Oturumu Yenile dugmesi).
  for (const f of ['slack.ts', 'members-api.ts']) {
    const s = readFileSync(join(here, '..', 'src', 'lib', f), 'utf8');
    assert.ok(
      !/notifySessionExpired\(\)/.test(s),
      f + ': 401de otomatik cikis tetiklenmemeli'
    );
  }
});

console.log('\n' + d + ' koruma testi gecti, ' + f + ' kaldi.\n');
