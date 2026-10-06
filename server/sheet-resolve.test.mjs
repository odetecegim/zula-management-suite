/**
 * PANO VERISI COZUMLEME TESTLERI (Google'a baglanmadan calisir)
 *
 * Yasanan hata (2026-10-06): aralikta sayfa adi olmadiginda Google
 * CALIMA KITABININ ILK SEKMESINI okuyordu. Ilk sekmeler gunluk
 * (Sayfa1 / ModBot.log / İşlem Logları) oldugu icin panelde:
 *   - baglanti testi: 0 baslik + log satirlari
 *   - sutun esleme: bos baslik + bot logu onizlemesi
 * gorunuyordu. Uye verisi 'UyeListesi' sekmesindeydi.
 *
 * Ayrica herkese acik /test ucu sunucunun VARSAYILAN tablo
 * kimligini aciga vuruyordu (status ucunda bilerek gizlenir).
 *
 * Calistirma: node server/sheet-resolve.test.mjs
 */
process.env.SESSION_SECRET = 'test-secret-sheet-resolve';
process.env.SHEETS_SPREADSHEET_ID = '1VARSAYILAN_TABLO_KIMLIGI';

const { handleApi } = await import('./route-handler.js');
const svc = await import('./sheets-service.js');
const assert = (await import('node:assert/strict')).default;

let d = 0,
  f = 0;
const t = async (name, fn) => {
  try {
    await fn();
    d++;
    console.log('  OK   ' + name);
  } catch (e) {
    f++;
    console.log('  FAIL ' + name + ' -> ' + e.message);
    process.exitCode = 1;
  }
};

/* --- Sahte calisma kitabi: gunluk sekmeleri onde, uye tablosu sonda --- */
const MEMBER_HEADERS = [
  'id', 'tagId', 'fullName', 'gameNickname', 'playerId', 'discordTag',
  'email', 'game', 'region', 'role', 'status', 'joinDate',
];
const MEMBER_ROW = [
  'm-1', 'ZULA-001', 'Hüseyin Çalışkan', 'Odetecegim', '758547576',
  'odetecegim#0001', 'huseyin@odetecegim.dev', 'Zula PC', 'TR',
  'super_admin', 'Aktif', '2025-01-10',
];

const BOOK = {
  sheets: ['Sayfa1', 'ModBot.log', 'İşlem Logları', 'UyeListesi'],
  data: {
    // Sayfa1: 1. satir BOS, altinda log satirlari (canlida aynisi)
    sayfa1: [
      [],
      ['2026-08-05 07:55:19', 'Admin', 'Error Reporting ENG', 'Global Perf Tablosu', 'Temmuz', '2026', 'Başarılı ✅'],
      ['2026-08-05 07:56:05', 'Admin', 'Error al reportar ESP', 'Global Perf Tablosu', 'Temmuz', '2026', 'Başarılı ✅'],
    ],
    modbotlog: [
      ['Tarih / Saat', 'Oturum Açan Kullanıcı', 'İşlem Türü', 'Detaylar'],
      ['2026-08-05 11:05:23', 'Merve', 'ZA MİKTARLARI İŞLENDİ', 'Hedef Ay: Temmuz'],
    ],
    islemloglari: [
      ['Tarih', 'Kullanıcı', 'İşlem', 'Detay', 'Durum', 'Tablo ID', 'Sekme'],
      ['2026-09-04 09:07:41', 'Bilinmeyen', 'Başarısız giriş denemesi', '', 'Başarısız', '1WMy...', 'İşlem Logları'],
    ],
    uyelistesi: [MEMBER_HEADERS, MEMBER_ROW],
  },
};

function sheetNameOf(range) {
  return String(range).split('!')[0].replace(/'/g, '');
}

function makeClient(book) {
  return {
    spreadsheets: {
      get: async ({ fields }) => {
        const sheets = book.sheets.map((n) => ({
          properties: { title: n, gridProperties: { rowCount: 500, columnCount: 26 } },
        }));
        if (String(fields || '').includes('properties.title')) {
          return { data: { properties: { title: 'ModBot.log' }, sheets } };
        }
        return { data: { sheets } };
      },
      values: {
        get: async ({ range }) => {
          const key = svc.normalizeHeader(sheetNameOf(range));
          return { data: { values: book.data[key] || [] } };
        },
      },
    },
  };
}

svc.__setClientForTest(makeClient(BOOK));
console.log('\n== Sekme cozumleme (resolveDataSheet) ==');

await t('sayfa adi yoksa UyeListesi secilir (gecmisteki dogru kaynak)', async () => {
  const r = await svc.resolveDataSheet({ spreadsheetId: 'T', range: 'A1:Z2000' });
  assert.equal(r, 'UyeListesi!A1:Z2000');
});

await t('sayfa adi verilmis aralik oldugu gibi birakilir', async () => {
  const r = await svc.resolveDataSheet({ spreadsheetId: 'T', range: "'UyeListesi'!A1:Z50" });
  assert.equal(r, "'UyeListesi'!A1:Z50");
});

await t('UyeListesi yoksa bos ve gunluk sekmeler atlanip baslikli sayfa secilir', async () => {
  svc.__setClientForTest(
    makeClient({
      sheets: ['Bos', 'Gunlukler', 'Veri'],
      data: {
        bos: [[]],
        gunlukler: [['Tarih', 'Mesaj'], ['2026-01-01', 'x']],
        veri: [['Ad Soyad', 'Rol'], ['Ali Veli', 'Uye']],
      },
    })
  );
  try {
    const r = await svc.resolveDataSheet({ spreadsheetId: 'T', range: 'A1:Z2000' });
    assert.equal(r, 'Veri!A1:Z2000');
  } finally {
    svc.__setClientForTest(makeClient(BOOK));
  }
});

await t('gunluk adi tespiti Katalog gibi adlari kismaz', () => {
  assert.equal(svc.isLogSheetName('ModBot.log'), true);
  assert.equal(svc.isLogSheetName('İşlem Logları'), true);
  assert.equal(svc.isLogSheetName('Gunlukler'), true);
  assert.equal(svc.isLogSheetName('Katalog'), false, 'Katalog LOG sayilmamali');
  assert.equal(svc.isLogSheetName('UyeListesi'), false);
});

console.log('\n== /test ve /headers uclari (herkese acik) ==');

await t('/test dogru sekmeyi okur ve varsayilan tablo kimligini DONDURMEZ', async () => {
  const r = await handleApi('POST', ['test'], {}, {});
  assert.equal(r.status, 200, 'status ' + r.status);
  assert.ok(
    !('spreadsheetId' in r.body),
    'herkese acik /test sunucunun varsayilan tablo kimligini sizdirmamali'
  );
  assert.ok(String(r.body.range).startsWith('UyeListesi!'), 'yanlis sekme: ' + r.body.range);
  assert.equal(r.body.headerCount, MEMBER_HEADERS.length, 'baslik sayisi uye tablosundan gelmeli');
});

await t('/headers uye basliklarini dondurur (log onizlemesi degil)', async () => {
  const r = await handleApi('POST', ['headers'], {}, {});
  assert.equal(r.status, 200, 'status ' + r.status);
  assert.ok(r.body.headers.includes('fullName'), 'fullName basligi yok');
  assert.ok(r.body.headers.length > 0, 'basliklar bos');
  assert.equal(r.body.preview[0][2], 'Hüseyin Çalışkan', 'onizleme uye satiri olmali');
});

await t('istemci kendi tablo kimligini gonderirse echo devam eder', async () => {
  const r = await handleApi('POST', ['test'], { spreadsheetId: 'MUSTERI_TABLO' }, {});
  assert.equal(r.status, 200);
  assert.equal(r.body.spreadsheetId, 'MUSTERI_TABLO');
});

console.log('\n== fetchAllSheets cop eleme ==');

await t('gunluk ve basliksiz sekmeler atlanir, uye tablosu islennir', async () => {
  const out = await svc.fetchAllSheets({
    spreadsheetId: 'T',
    range: 'A1:Z2000',
    sheetNames: ['Sayfa1', 'ModBot.log', 'UyeListesi'],
  });
  const skipped = Object.fromEntries(out.skipped.map((s) => [s.name, s.reason]));
  assert.ok(skipped['ModBot.log'], 'ModBot.log atlanmali');
  assert.match(skipped['ModBot.log'], /log/i);
  assert.ok(skipped['Sayfa1'], 'Sayfa1 (basliksiz) atlanmali');
  assert.match(skipped['Sayfa1'], /tanınmadı|başlık/i);
  assert.equal(out.results.length, 1, 'yalnizca uye satiri kalmali');
  assert.equal(out.results[0].tagId, 'ZULA-001');
  assert.equal(out.results[0].name, 'Hüseyin Çalışkan');
});

console.log('\n' + d + ' cozumleme testi gecti, ' + f + ' kaldi.\n');