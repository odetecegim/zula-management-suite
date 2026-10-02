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

test('iptal edilen belirteci artik gecerli degildir', () => {
  const token = createSessionToken('m-1');
  revokeSession(token);
  const r = requireAuth({ 'x-session-token': token });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('ADMIN_API_KEY tanimli degilse yazma tamamen kapanir (fail-closed)', () => {
  delete process.env.ADMIN_API_KEY;
  const r = requireAuth({}, { write: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(r.code, 'NO_ADMIN_KEY');
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

test('okuma belirteci yazma icin YETMEZ (ayrim guvenligi)', () => {
  // Bu, asil acik olan yoldu: giris belirteci olan biri
  // veri yazabiliyordu. Artik yazma icin ayri anahtar gerekir.
  process.env.ADMIN_API_KEY = 'gizli-anahtar';
  const token = createSessionToken('m-1');
  const r = requireAuth({ 'x-session-token': token }, { write: true });
  assert.equal(r.ok, false, 'oturum belirteci yazma yetkisi vermemeli');
  revokeSession(token);
  delete process.env.ADMIN_API_KEY;
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