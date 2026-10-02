/**
 * Entegrasyon testi: yazma yetkisi kontrolu Google'a erisemediginde
 * istek COKMEMELI; 502/503 + GOOGLE_UNAVAILABLE donmelidir.
 *
 * GECMIS: route-handler'daki rol kontrolu try/catch disindaydi; Google
 * hatasi dogrudan firlatip endpoint'i cokertiyor, panel de nedensiz
 * bir hata kutusu gosteriyordu.
 */
process.env.SESSION_SECRET = 'test-secret-for-integration';
process.env.SHEETS_SPREADSHEET_ID = '';

const { handleApi } = await import('./route-handler.js');
const { createSessionToken } = await import('./auth.js');

let d = 0, f = 0;
const t = async (name, fn) => {
  try { await fn(); d++; console.log('  OK   ' + name); }
  catch (e) { f++; console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

console.log('\n== Yazma yetkisi kontrolu hata yollari ==');

// Oturum belirteci uret (yazma istegi icin gecerli sayilmali)
const token = createSessionToken('UYE-001');
const headers = { 'x-session-token': token };

await t('tablo kimligi yoksa 400 NO_SPREADSHEET doner (COKMEZ)', async () => {
  const r = await handleApi('POST', ['members'], { members: [{ id: 'a' }] }, headers);
  if (r.status !== 400) throw new Error('beklenen 400, gelen ' + r.status);
  if (r.body.code !== 'NO_SPREADSHEET') throw new Error('beklenen NO_SPREADSHEET, gelen ' + r.body.code);
});

await t('Google erisilemezse 502/503 doner ve mesaj icerir', async () => {
  // Var olmayan bir tablo kimligi: servis hesabi dogrulanir,
  // Sheets cagrisi NOT_FOUND / PERMISSION_DENIED doner.
  const r = await handleApi(
    'POST',
    ['members'],
    { spreadsheetId: 'BILINMEYEN_TABLO_KIMLIGI_0000', members: [{ id: 'a' }] },
    headers
  );
  if (r.status < 400 || r.status >= 600) {
    throw new Error('hata kodu bekleniyordu, gelen ' + r.status);
  }
  if (!r.body || !r.body.error) throw new Error('hata mesaji bos');
  if (!/Google/i.test(r.body.error)) {
    throw new Error('mesaj Google icinmi belirtmiyor: ' + r.body.error);
  }
});

await t('yetkisiz oturum 401 doner, veri yazilmaz', async () => {
  const r = await handleApi('POST', ['members'], { members: [{ id: 'a' }] }, {});
  if (r.status !== 401) throw new Error('beklenen 401, gelen ' + r.status);
  if (r.body.code !== 'NO_SESSION') throw new Error('beklenen NO_SESSION, gelen ' + r.body.code);
});

console.log('\n' + d + ' test gecti, ' + f + ' kaldi.\n');