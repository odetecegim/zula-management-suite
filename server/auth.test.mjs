/**
 * Guvenlik regresyon testleri (server/auth.js)
 *
 * 2026-10-02 tarihinde yapilan testte /api/sheets/* uclarinin hicbiri
 * dogrulama istemedigi tespit edildi. Bu testler o acigin kapandigini
 * ve yeniden acilmadigini dogrular.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requireAuth,
  createSessionToken,
  verifySessionToken,
  revokeSession,
  safeCompare,
  isRateLimited,
  registerFailedLogin,
  clearFailedLogins,
  isAccountLocked,
  registerFailedAccount,
  clearFailedAccount,
  accountRetryInfo,
} from './auth.js';

test('kimliksiz okuma istegi reddedilir (401)', () => {
  const r = requireAuth({});
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.code, 'NO_SESSION');
});

test('gecersiz oturum belirteci reddedilir', () => {
  const r = requireAuth({ 'x-session-token': 'sahte-belirtec' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('gecerli oturum belirteci kabul edilir', () => {
  const token = createSessionToken('m-1');
  const r = requireAuth({ 'x-session-token': token });
  assert.equal(r.ok, true);
  assert.equal(r.memberId, 'm-1');
  revokeSession(token); // temizlik
});

test('durumsuz belirtec sunucu yeniden baslasa da gecerli kalir', () => {
  // ESKI MODEL: belirtecler Map'te tutuluyordu; surec yeniden baslayinca
  // (Vercel cold start) hepsi siliniyordu -> "Oturumunuz sona erdi".
  // YENI MODEL: belirtec kendi kendini tasir ve imzalidir; bellek gerekmez.
  const token = createSessionToken('m-1');

  // Her dogrulamada yeniden imza hesaplanir
  for (let i = 0; i < 5; i++) {
    assert.equal(verifySessionToken(token), 'm-1', 'belirtec her dogrulamada gecerli olmali');
  }

  // cikis cagrisi imzali modelde sunucuda kayit olmadigi icin bir sey yapmaz
  revokeSession(token);
  assert.equal(verifySessionToken(token), 'm-1', 'cikis cagrisi belirteci gecersiz kilmamali');
});

test('kurcalanmis belirtec reddedilir', () => {
  const token = createSessionToken('m-1');
  const [payload, sig] = token.split('.');

  // Imza degistirilmis
  assert.equal(
    verifySessionToken(payload + '.' + 'A'.repeat(sig.length)),
    null,
    'degistirilmis imza reddedilmeli'
  );

  // Payload degistirilmis: baska kullaniciyi taklit etme denemesi
  const evilPayload = Buffer.from(
    JSON.stringify({ id: 'admin-1', exp: Date.now() + 99999999 })
  ).toString('base64url');
  assert.equal(
    verifySessionToken(evilPayload + '.' + sig),
    null,
    'imzasiz payload reddedilmeli'
  );

  // Orijinal hala gecerli
  assert.equal(verifySessionToken(token), 'm-1');
});

test('ADMIN_API_KEY tanimli degilse yazma OTURUMSUZ istegi kapatir', () => {
  // Artik yazma icin ortam degiskeni GEREKMIYOR; oturum belirteci
  // yeterlidir (rol kontrolu route-handler'da yapilir).
  delete process.env.ADMIN_API_KEY;
  const r = requireAuth({}, { write: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.code, 'NO_SESSION');
});

test('yazma icin gecerli oturum belirteci kabul edilir, rol sunucuda dogrulanir', () => {
  delete process.env.ADMIN_API_KEY;
  const token = createSessionToken('m-1');
  const r = requireAuth({ 'x-session-token': token }, { write: true });
  assert.equal(r.ok, true);
  assert.equal(r.memberId, 'm-1');
  assert.equal(r.needsAdminRole, true, 'rol kontrolu isaretlenmeli');
  revokeSession(token);
});

test('yanlis admin anahtari ile yazma reddedilir', () => {
  process.env.ADMIN_API_KEY = 'dogru-anahtar';
  const r = requireAuth({ 'x-api-key': 'yanlis-anahtar' }, { write: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('dogru admin anahtari ile yazma kabul edilir', () => {
  process.env.ADMIN_API_KEY = 'dogru-anahtar';
  const r = requireAuth({ 'x-api-key': 'dogru-anahtar' }, { write: true });
  assert.equal(r.ok, true);
  delete process.env.ADMIN_API_KEY;
});

test('oturum belirteci yazma istegi role mu olur (ayrim güvenliği)', () => {
  // Güvenlik modeli DEĞİŞTİ: yazma artık ortam değişkeni değil,
  // oturum belirteci + SUNUCUDA doğrulanan rol ile korunuyor.
  //
  // requireAuth yalnızca "bu bir oturum" der ve needsAdminRole işaretler.
  // Asıl karar route-handler'da: uyenin GERÇEK rolü Google Sheets'ten
  // okunur; super_admin değilse 403 döner. Bu yüzden istemcideki rol
  // alanı değiştirilerek yetki alınamaz.
  //
  // Bu test, korumanın "needsAdminRole" işaretinin kalkmadığını ve
  // route-handler'ın bunu beklediğini doğrular.
  delete process.env.ADMIN_API_KEY;
  const token = createSessionToken('m-5'); // academy_member olabilir
  const r = requireAuth({ 'x-session-token': token }, { write: true });
  assert.equal(r.ok, true, 'oturum geçerli, istek role kadar ilerlemeli');
  assert.equal(
    r.needsAdminRole,
    true,
    'route-handger rolü doğrulayana kadar güvenmemeli'
  );
  // needsAdminRole olmadan yazmaya izin verilirse bu bir regresyon olur
  assert.notEqual(r.memberId, 'admin', 'admin muamelcesi yapılmamalı');
  revokeSession(token);
});

test('safeCompare farkli ve esit degerler icin dogru sonuc verir', () => {
  assert.equal(safeCompare('abc', 'abc'), true);
  assert.equal(safeCompare('abc', 'abd'), false);
  assert.equal(safeCompare('abc', 'abcd'), false); // farkli uzunluk
});

test('kaba kuvvet korumasi 8 denemeden sonra kilitler', () => {
  const key = '1.2.3.4';
  clearFailedLogins(key);
  assert.equal(isRateLimited(key), false);
  for (let i = 0; i < 7; i++) registerFailedLogin(key);
  assert.equal(isRateLimited(key), false, '7 deneme sonrasi hâlâ açık olmalı');
  registerFailedLogin(key); // 8. deneme
  assert.equal(isRateLimited(key), true, '8. denemeden sonra kilitlenmeli');
  clearFailedLogins(key);
  assert.equal(isRateLimited(key), false, 'basarili giriş kilidi kaldırmalı');
});

/* ------------------------------------------------------------------ */
/* HESAP bazli koruma — IP degistirilse bile gecerli                  */
/* ------------------------------------------------------------------ */

test('hesap 10 hatali denemeden sonra kilitlenir', () => {
  const user = 'kaba-kuvvet-testi';
  clearFailedAccount(user);
  assert.equal(isAccountLocked(user), false);
  for (let i = 0; i < 9; i++) registerFailedAccount(user);
  assert.equal(isAccountLocked(user), false, '9 deneme sonrasi hâlâ açık');
  registerFailedAccount(user); // 10.
  assert.equal(isAccountLocked(user), true, '10. denemeden sonra kilitlenmeli');
  clearFailedAccount(user);
  assert.equal(isAccountLocked(user), false);
});

test('hesap kilidi IP degistirilse de gecerlidir (botnet korumasi)', () => {
  // ASIL TEST: her deneme farkli "IP" ile yapilsa bile hesap sayaci artar
  const user = 'botnet-testi';
  clearFailedAccount(user);
  for (let i = 0; i < 10; i++) {
    // Her seferinde farkli IP: registerFailedLogin IP'ye göre sayıyor,
    // registerFailedAccount hesaba göre sayıyor.
    registerFailedLogin('farkli-ip-' + i);
    registerFailedAccount(user);
  }
  assert.equal(
    isAccountLocked(user),
    true,
    'IP degisse bile hesap kilitlenmeli'
  );
  // ...ve hicbir IP de kilitlenmemis olmali (korumanin sızdırmadığı kanıtı)
  for (let i = 0; i < 10; i++) {
    assert.equal(isRateLimited('farkli-ip-' + i), false);
  }
  clearFailedAccount(user);
});

test('hesap adi buyuk/kucuk harf ve bosluk duyarsiz sayilir', () => {
  const user = 'Test-Kullanici';
  clearFailedAccount(user);
  for (let i = 0; i < 10; i++) registerFailedAccount('  test-kullanici  ');
  assert.equal(isAccountLocked(user), true, 'normalize edilmiş ad kilitlenmeli');
  clearFailedAccount(user);
});

test('kilit suresi hesaplanabilir', () => {
  const user = 'sure-testi';
  clearFailedAccount(user);
  for (let i = 0; i < 10; i++) registerFailedAccount(user);
  const info = accountRetryInfo(user);
  assert.ok(info, 'kilit suresi bilgisi donmeli');
  assert.ok(info.minutes > 0 && info.minutes <= 15, 'kalan sure 1-15 dakika arasi olmali');
  clearFailedAccount(user);
  assert.equal(accountRetryInfo(user), null, 'basarili giriş sonrasi bilgi silinmeli');
});

test('bilinmeyen kullanici adi da sayilir (enumeration korumasi)', () => {
  // Olmayan kullanici adi denemeleri de hesap sayacini artirmali;
  // aksi halde saldırgan var/yok ayrimi yapabilirdi.
  const ghost = 'boyle-bir-kullanici-yok';
  clearFailedAccount(ghost);
  for (let i = 0; i < 10; i++) registerFailedAccount(ghost);
  assert.equal(isAccountLocked(ghost), true);
  clearFailedAccount(ghost);
});