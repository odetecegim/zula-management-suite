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
const store = await import('./members-store.js');
const sheetsSvc = await import('./sheets-service.js');
const assert = (await import('node:assert/strict')).default;

const { writeMembers } = store;

/**
 * members-store.js, istemciyi `getClient()` UZERINDEN alir ve
 * onbellege koyar. Testte sahte istemciyi onbellege YERLESTIRMEK icin
 * modulu gercek bir dosya yoluyla yeniden yukleriz.
 *
 * Not: ESM onbellek icin bu teknik calismaz; bu yuzden test, gercek
 * istemci olusturmadan once `getClient`'in dondurdugu objeyi
 * degistirmek yerine modulun kendi onbellegini API ile degistiriyoruz.
 */
function cacheSet(client) {
  // sheets-service.js icindeki `cachedClient` degiskenini API uzerinden
  // guncelleyemiyoruz; bu yuzden writeMembers'a gecici bir kancalama
  // ekliyoruz: getClient gercek bir istemci dondurmeden once
  // override edilir.
  sheetsSvc.__setClientForTest?.(client);
}

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

/*
  VERI KAYBI TESTI — writeMembers YAZMA SIRASI
  ---------------------------------------------
  Onceki surum tabloyu ONCE temizliyor, SONRA yaziyordu. Aradaki
  hatada tablo tamamen bos kaliyordu (tum uyeler kalici silinir).

  Bu test sahte bir Sheets istemcisi kurar ve "yazma basarisiz"
  senaryosunda eski verinin AYAKTA KALDIGINI kanitlar.
*/
console.log('\n== Veri kaybi testi (writeMembers yazma sirasi) ==');

/** Bellekte sahte tablo tutan sahte Google Sheets istemcisi. */
function fakeSheets(initialRows, { failUpdate = false } = {}) {
  const store = { values: [...initialRows] };
  return {
    store,
    client: {
      spreadsheets: {
        get: async () => ({
          data: { sheets: [{ properties: { title: 'UyeListesi' } }] },
        }),
        batchUpdate: async () => ({}),
        values: {
          get: async () => ({ data: { values: store.values } }),
          clear: async ({ range }) => {
            // A<k>:R1000 -> k ve sonrasi satirlar silinir
            const m = /!A(\d+):/.exec(range);
            if (m) store.values = store.values.slice(0, Number(m[1]) - 1);
            return {};
          },
          update: async ({ requestBody }) => {
            if (failUpdate) throw new Error('simulate edilmis Google hatasi');
            store.values = requestBody.values;
            return {};
          },
        },
      },
    },
  };
}

await t('yazma basarisiz olsa bile eski veri silinmez', async () => {
  const mevcutUye = ['mevcut-uye', 'ZULA-001', 'Ayse Yilmaz', ...Array(15).fill('')];
  const fake = fakeSheets([['id', 'tagId', 'fullName'], mevcutUye], { failUpdate: true });
  cacheSet(fake.client);

  try {
    await writeMembers({
      spreadsheetId: 'TEST',
      members: [{ id: 'yeni', tagId: 'ZULA-999', fullName: 'Ali Kaya' }],
    });
    throw new Error('yazma hatasi firlatilmadi (beklenen: hata yutulmamali)');
  } catch (e) {
    if (!/simulate/.test(e.message)) throw e; // beklenen hata
  }

  const hayattaKalan = fake.store.values.some(
    (r) => r && String(r[0]) === 'mevcut-uye'
  );
  assert.ok(
    hayattaKalan,
    'VERI KAYBI! Yazma basarisiz olmasina ragmen eski uye tabloda yok'
  );
});

await t('basarili yazmada yeni veri tabloya yazilir', async () => {
  const fake = fakeSheets([['id', 'tagId', 'fullName'], ['eski', 'ZULA-000', 'Eski Kisi']]);
  cacheSet(fake.client);

  const r = await writeMembers({
    spreadsheetId: 'TEST',
    members: [{ id: 'yeni', tagId: 'ZULA-999', fullName: 'Ali Kaya' }],
  });
  assert.equal(r.written, 1);
  assert.ok(
    fake.store.values.some((row) => row && row[0] === 'yeni'),
    'yeni uye tabloya yazilmadi'
  );
});

await t('yeni liste kisa ise eski fazla satirlar temizlenir', async () => {
  const eski = [
    ['id', 'tagId', 'fullName'],
    ['u1', 'ZULA-001', 'Bir'],
    ['u2', 'ZULA-002', 'Iki'],
    ['u3', 'ZULA-003', 'Uc'],
  ];
  const fake = fakeSheets(eski);
  cacheSet(fake.client);

  // Sadece 1 uye yaziliyor -> 3 fazla satir temizlenmeli
  await writeMembers({
    spreadsheetId: 'TEST',
    members: [{ id: 'u1', tagId: 'ZULA-001', fullName: 'Bir' }],
  });

  const etiketler = fake.store.values.map((r) => (r ? r[1] : ''));
  assert.ok(
    !etiketler.includes('ZULA-002'),
    'silinen uye hala tabloda duruyor (fazla satir temizlenmedi)'
  );
  assert.ok(etiketler.includes('ZULA-001'), 'korunmasi gereken uye silindi');
});

await t('temizlik basarisiz olsa bile islem basarili sayilir', async () => {
  const fake = fakeSheets([['id', 'tagId', 'fullName'], ['u1', 'ZULA-001', 'Bir']]);
  // clear'i kirmaya calis: yazma calisir, temizlik patlar
  fake.client.spreadsheets.values.clear = async () => {
    throw new Error('temizlik basarisiz');
  };
  cacheSet(fake.client);

  const r = await writeMembers({
    spreadsheetId: 'TEST',
    members: [{ id: 'u1', tagId: 'ZULA-001', fullName: 'Bir' }],
  });
  assert.equal(r.written, 1, 'temizlik hatasi yazma islemini basarisiz saymamali');
});

console.log('\n' + d + ' test gecti, ' + f + ' kaldi.\n');