/**
 * Google Sheets servis katmani (server/sheets-service.js)
 * — SIFIRDAN YAZIM (2026-10-06)
 *
 * Servis hesabi (service account) anahtari SADECE bu sunucuda tutulur;
 * frontend'e hicbir kimlik bilgisi gonderilmez.
 *
 * Kimlik bilgisi kaynaklari (oncelik sirasiyla):
 *   1) GOOGLE_SERVICE_ACCOUNT_JSON  -> JSON metni (tek satir)
 *   2) GOOGLE_SERVICE_ACCOUNT_PATH  -> JSON dosya yolu
 *   3) server/service-account.json  -> varsayilan dosya
 *
 * HATA YONETIMI:
 * - Kimlik yoksa err.code = 'NO_CREDENTIALS' -> route-handler 503 dondurur.
 * - Yanlis deger yapistirilan ortam degiskeni (ornegin Slack token'i)
 *   ERKEN ve ACIK soylemlidir; kriptik "Unexpected token 'x" hatasi yok.
 */
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Varsayilan A1 araligi (baslik satiri + 2000 veri satiri). */
export const DEFAULT_RANGE = 'A1:Z2000';

/** Onbellekli Google Sheets istemcisi (testler tarafindan degistirilebilir). */
let cachedClient = null;

/** ID ya da URL girdisinden saf tablo ID'sini cikarir. */
export function extractSpreadsheetId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (!raw.includes('/')) return raw; // zaten ID

  // /spreadsheets/d/<ID>...  veya  /spreadsheets/u/0/d/<ID>/...
  const m = raw.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];

  // Genel yedek: URL icinde /d/<ID>/
  const m2 = raw.match(/\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m2) return m2[1];

  return raw;
}

/**
 * Ham servis hesabi nesnesini yukler (yoksa null doner).
 *
 * YANLIS ANAHTAR TESPITI (2026-10-06):
 * Canlida GOOGLE_SERVICE_ACCOUNT_JSON alanina Slack token'i (xoxb-...)
 * yapistirildigi goruldu. Klasik JSON parse hatasi ("Unexpected token 'x'")
 * hangi degiskenin bozuk oldugunu soylemiyordu; kullanici saatlerce
 * ayni hatayi ariyordu. Simdi degerin tipi erken ve acik soylemlidir.
 */
function loadServiceAccount() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) {
    const text = inline.trim();

    if (/^xox[abp]-/.test(text) || /^Bearer\s+/i.test(text)) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON alanına yanlış değer yapıştırılmış: bu bir Slack ' +
          "token'ına benziyor (xox...). Buraya Google Cloud > IAM > Service Accounts > " +
          'Keys > "Add key > JSON" ile indirilen JSON dosyasının TAM İÇERİĞİ tek satır ' +
          'olarak yapıştırılmalıdır. (Slack token\'ı SLACK_BOT_TOKEN alanına gider.)'
      );
    }
    if (text.length < 50) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON çok kısa/geçersiz görünüyor (' +
          text.length +
          ' karakter). Google Cloud > Service Accounts > Keys bölümünden indirilen JSON ' +
          'dosyasının TAM İÇERİĞİNİ tek satır olarak yapıştırın.'
      );
    }

    try {
      return JSON.parse(inline);
    } catch (err) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON geçersiz JSON: ' + err.message);
    }
  }

  const filePath =
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, 'service-account.json');

  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

/** Sunucuda Google kimligi tanimli mi? (status ucu icin) */
export function isConfigured() {
  try {
    return loadServiceAccount() !== null;
  } catch {
    return false;
  }
}

/**
 * Google Sheets API istemcisini olusturur (onbellekli).
 * Kimlik yoksa err.code = 'NO_CREDENTIALS' ile hata firlatir.
 */
export async function getClient() {
  if (cachedClient) return cachedClient;

  const creds = loadServiceAccount();
  if (!creds) {
    const err = new Error(
      'Google servis hesabi yapılandırılmadı. GOOGLE_SERVICE_ACCOUNT_JSON veya ' +
        'GOOGLE_SERVICE_ACCOUNT_PATH (ya da server/service-account.json) ayarlayın.'
    );
    err.code = 'NO_CREDENTIALS';
    throw err;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: String(creds.private_key || '').replace(/\\n/g, '\n'),
    },
    // Uyeleri Sheets'e yazabilmek icin salt-okunur degil, tam erisim gerekir.
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  await auth.getClient();
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

/**
 * TEST KANCASI: onbellekteki istemciyi degistirir.
 * SADECE birim testlerinde kullanilir (sahte istemciyle yazma
 * senaryolari Google'a baglanmadan denetlenir).
 *
 * @param {object|null} client  null verilirse onbellek temizlenir.
 */
export function __setClientForTest(client) {
  cachedClient = client;
}
/** Baglanti testi: dosya okunabiliyor ve erisim var mi? */
export async function testConnection({ spreadsheetId, range }) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties',
  });

  const title = res.data.properties?.title ?? '(başlık yok)';
  const sheetNames = (res.data.sheets || []).map((s) => s.properties?.title);

  // Ilk sayfadan baslik satiri + ornek veri
  const probe = await readValues({ spreadsheetId, range });

  return {
    ok: true,
    title,
    sheetNames,
    headerCount: probe.headers.length,
    rowCount: probe.rows.length,
  };
}

/** Ham hucre degerlerini okur; ilk satir baslik kabul edilir. */
export async function readValues({ spreadsheetId, range = DEFAULT_RANGE }) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range || DEFAULT_RANGE,
  });

  const values = res.data.values || [];
  if (values.length === 0) {
    return { headers: [], rows: [], values: [] };
  }

  const headers = (values[0] || []).map((h) => (h == null ? '' : String(h).trim()));
  const rows = values.slice(1).filter((r) => r && r.some((c) => c !== '' && c != null));

  return { headers, rows, values };
}

/* ------------------------------------------------------------------ */
/* Sayisal / metin ayristirma yardimcilari                             */
/* ------------------------------------------------------------------ */

/**
 * "1.500" / "1,500" / "37.000" / "8,5" / "-" / "" -> sayi
 *
 * TR ve EN ayraç bicimleri birlikte kabul edilir:
 * - "1.234,56" (TR) ve "1,234.56" (EN) ayirt edilir
 * - Tek virgul/nokta: ondalik mi binlik mi bagliliga gore karar verilir
 * - "%37" / "12 puan" gibi ekler atilir
 */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  let s = String(value).trim();
  if (s === '' || s === '-' || s === '—' || s === 'N/A' || s.toLowerCase() === 'n/a') return 0;

  // Yuzde / adet eklerini at
  s = s.replace(/[^\d.,\-+]/g, '');
  if (s === '') return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // 1.234,56 (TR) veya 1,234.56 (EN): son hangisiyse ONU ondalik say
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (hasComma) {
    // Tek virgul: ondalik mi binlik mi? "1,5" ondalik; "1,500" binlik
    const parts = s.split(',');
    if (parts.length > 2 || (parts[0].length <= 3 && parts[1].length === 3)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    // "37.000" -> binlik ayraci (TR); "1.5" -> ondalik
    const parts = s.split('.');
    if (parts.length > 2 || (parts[0].length <= 3 && parts[1].length === 3)) {
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
/**
 * "Detay" sutununu gun x carpan serisine cevirir.
 * "01x2, 13x2,14x2, 20x2," -> [{day:1,multiplier:2}, ...]
 */
export function parseDetails(detail) {
  if (detail == null) return [];
  const text = String(detail);
  const out = [];
  const re = /(\d{1,2})\s*[x*]\s*(\d{1,2})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const day = Number(m[1]);
    const multiplier = Number(m[2]);
    if (day >= 1 && day <= 31 && multiplier >= 1) {
      out.push({ day, multiplier });
    }
  }
  return out;
}

/** Turkce/Ingilizce ay adlari -> ay numarasi */
const AYLAR = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Turkce karakterleri sadelestirip karsilastirma icin hazirlar. */
function foldTr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ç/g, 'c');
}

/** "2026-09" / "Eylül 2026" / "09.2026" -> "YYYY-MM" (bulunamazsa null) */
export function parsePeriod(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  const iso = s.match(/(\d{4})[-/](\d{1,2})/);
  if (iso) return iso[1] + '-' + String(iso[2]).padStart(2, '0');

  const tr = s.match(/(\d{1,2})[.\-/](\d{4})/);
  if (tr) return tr[2] + '-' + String(tr[1]).padStart(2, '0');

  const ay = foldTr(s).replace(/[^\p{L}]+/gu, ' ').trim();
  for (const [ad, no] of Object.entries(AYLAR)) {
    if (ay.includes(ad)) {
      const yil = s.match(/(20\d{2})/);
      if (yil) return yil[1] + '-' + String(no).padStart(2, '0');
    }
  }
  return null;
}

/**
 * Sayfa (sekme) adindan donem cikarir.
 * "Eylül 2026" -> 2026-09 | "Eylül" -> <defaultYear>-09 | "2026-09" -> 2026-09
 */
export function periodFromSheetName(sheetName, defaultYear) {
  const direct = parsePeriod(sheetName);
  if (direct) return direct;

  const s = foldTr(sheetName);
  for (const [ad, no] of Object.entries(AYLAR)) {
    if (s.includes(ad)) {
      const yil = String(sheetName).match(/(20\d{2})/);
      const year = yil ? yil[1] : String(defaultYear || new Date().getFullYear());
      return year + '-' + String(no).padStart(2, '0');
    }
  }
  return null;
}

/**
 * Sayfa adini A1 araligina baglar:
 * "Eylül 2026" + "A1:Z2000" -> 'Eylül 2026'!A1:Z2000
 * Kullanici tam aralik girdiyse ("Sayfa1!A1:Z9") yalnizca hucre kismi alinir.
 */
export function buildSheetRange(sheetName, range = DEFAULT_RANGE) {
  const r = String(range || DEFAULT_RANGE);
  const cellPart = r.includes('!') ? r.split('!').slice(1).join('!') : r;
  const quoted = /^[A-Za-z0-9_]+$/.test(sheetName)
    ? sheetName
    : "'" + String(sheetName).replace(/'/g, "''") + "'";
  return quoted + '!' + cellPart;
}

/** Tablodaki tum sayfa (sekme) adlarini dondurur. */
export async function listSheets({ spreadsheetId }) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  return (res.data.sheets || [])
    .map((s) => ({
      name: s.properties?.title ?? '',
      rows: Number(s.properties?.gridProperties?.rowCount ?? 0),
      cols: Number(s.properties?.gridProperties?.columnCount ?? 0),
    }))
    .filter((s) => s.name);
}

/** Baslik metnini karsilastirma icin sadelestirir. */
export function normalizeHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Sekme adi gunluk (log) sekmesi mi?
 *
 * PANO HATASI (2026-10-06): calisma kitabinda ilk sekmeler gunluk
 * (Sayfa1 / ModBot.log / İşlem Logları) olabiliyor. Aralikta sayfa adi
 * olmadiginda Google ILK sekmeyi okudugu icin panelde baglanti testi
 * "0 baslik", onizleme olarak da bot loglari gosteriyordu; uye verisi
 * ise 'UyeListesi' sekmesindeydi.
 *
 * Not: 'Katalog' / 'Blog' gibi adlar YANLISLIKLA log sayilmasin diye
 * onceden kelime siniri kullanilir; govde Turkce karakterlerden
 * arindirilir ('Günlükler' -> 'gunlukler' bulunur).
 */
export function isLogSheetName(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ç/g, 'c');
  return /(?<![a-z])(log|gunluk|yedek|backup|arsiv|archive)/.test(s);
}

/**
 * Sayfa adi belirtilmemis aralik icin HEDEF SEKMEYI COZER.
 *
 * Oncelik:
 *   1) 'UyeListesi' (panelin bilinen ana veri kaynagi — gecmis karari)
 *   2) gunluk olmayan, ilk satiri BASLIKLI ilk sayfa
 *   3) hicbiri yoksa eski davranis (ham aralik)
 *
 * Sayfa adi zaten araliktaysa (`'UyeListesi'!A1:Z2000`) oldugu gibi doner.
 */
export async function resolveDataSheet({ spreadsheetId, range }) {
  const r = String(range || DEFAULT_RANGE);
  if (r.includes('!')) return r;

  let tabs = [];
  try {
    tabs = await listSheets({ spreadsheetId });
  } catch {
    return r; // sekme listesi alinamadi -> eski davranis
  }
  if (tabs.length === 0) return r;

  // 1) Bilinen uye tablosu
  const member = tabs.find((t) => normalizeHeader(t.name) === 'uyelistesi');
  if (member) return buildSheetRange(member.name, r);

  // 2) Gunluk olmayan, baslikli ilk sayfa
  for (const t of tabs) {
    if (isLogSheetName(t.name)) continue;
    try {
      const { headers } = await readValues({
        spreadsheetId,
        range: buildSheetRange(t.name, r),
      });
      if (headers.length > 0) return buildSheetRange(t.name, r);
    } catch {
      /* bu sayfa okunamadi -> sonrakini dene */
    }
  }

  return r;
}
/* ------------------------------------------------------------------ */
/* Sutun eslestirme (otomatik algilama)                                */
/* ------------------------------------------------------------------ */

/** Alan -> kabul edilen baslik takma adlari (once kucuk harfe cevrilir) */
export const COLUMN_ALIASES = {
  tagId: ['id', 'uyeid', 'kullaniciid', 'tagid', 'kod', 'uyekodu', 'no', 'sira'],
  fullName: ['adsoyad', 'ad', 'isim', 'adsoyadi', 'adresadsoyad', 'name', 'fullname', 'kullanici', 'uyeadi', 'adadsoyad'],
  nickname: ['nick', 'nickname', 'oyuniciad', 'oyunadinick', 'oyunad', 'ingameusername', 'kullaniciadi'],
  game: ['oyun', 'game', 'oyunadi'],
  region: ['bolge', 'region', 'bolgeadi'],
  role: ['rol', 'role', 'yetki', 'gorev'],
  status: ['durum', 'status', 'stat'],
  testParticipation: ['testkatilimi', 'testkatilim', 'katilim', 'katilimgun', 'testgun', 'testgunleri', 'testparticipation'],
  bugReports: ['hatabildirimi', 'hataraporu', 'hata', 'hataraporlari', 'bugreports', 'bug', 'hataadet'],
  suggestions: ['oneribildirimi', 'oneribildirim', 'oneri', 'oneriler', 'suggestions', 'suggestion'],
  total: ['toplam', 'total', 'toplampir', 'geneltoplam'],
  details: ['detay', 'detail', 'detaylar', 'katilimdetay', 'gunler'],
  support: ['support', 'destek', 'destekpuani', 'supportpuani'],
  referee: ['hakemperformans', 'hakemperformansi', 'hakem', 'referee', 'hakemligi', 'hakempuani'],
  qa: ['qa', 'qapuani', 'qascore', 'qatoplam', 'qaskor'],
  period: ['donem', 'period', 'ay', 'ayyil', 'donemadi'],
  managerScore: ['yoneticipuani', 'yoneticipuan', 'yonetici', 'manager', 'yoneticiskor'],
  managerOpinion: ['yoneticigoru', 'goru', 'yorum', 'yoneticigorusu', 'opinion'],
};

/** Alan -> tablodaki gorunur baslik (status ucu / panel etiketleri) */
export const FIELD_LABELS = {
  tagId: 'Üye Kodu (ID)',
  fullName: 'Ad Soyad',
  nickname: 'Oyun Nick',
  game: 'Oyun',
  region: 'Bölge',
  role: 'Rol',
  status: 'Durum',
  testParticipation: 'Test Katılımı',
  bugReports: 'Hata Bildirimi',
  suggestions: 'Öneri Bildirimi',
  total: 'Toplam (hesaplanan)',
  details: 'Detay (gün x çarpan)',
  support: 'Support',
  referee: 'Hakem Performansı',
  qa: 'QA (hesaplanan)',
  period: 'Dönem',
  managerScore: 'Yönetici Puanı',
  managerOpinion: 'Yönetici Görüşü',
};

/**
 * Sutun adlarini alanlara eslestirir.
 * Once TAM eslesme, sonra "icerir" eslesmesi denenir; ayni sutun
 * iki alan icin kullanilamaz (used seti).
 */
export function autoMapColumns(headers) {
  const norm = headers.map(normalizeHeader);
  const map = {};
  const used = new Set();

  // 1) Tam eslesme
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = norm.findIndex((h, i) => h === alias && !used.has(i));
      if (idx > -1) { map[field] = idx; used.add(idx); break; }
    }
  }
  // 2) Icerir eslesmesi
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (map[field] != null) continue;
    for (const alias of aliases) {
      const idx = norm.findIndex((h, i) => h.includes(alias) && !used.has(i));
      if (idx > -1) { map[field] = idx; used.add(idx); break; }
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Satir isleme: Toplam ve QA hesaplama                               */
/* ------------------------------------------------------------------ */

const QA_MULTIPLIER = 1000;

/**
 * Ham satirlari okur ve panelin anlayacagi kayitlara donusturur.
 * - Toplam (base) = Test Katilimi + Hata Bildirimi + Oneri Bildirimi
 * - QA            = Toplam x 1000
 * - Detay         -> gun x carpan serisi
 * - Tablodaki hesaplanmis Toplam/QA ile fark varsa uyari uretilir
 *   (hesaplanan deger esas alinir).
 */
export function processRows({ headers, rows, columnMap, period, defaultPeriod }) {
  const map = { ...columnMap };
  const usePeriod = period || defaultPeriod || null;

  const cell = (row, field) => {
    const idx = map[field];
    if (idx == null) return null;
    const v = row[idx];
    return v == null || v === '' ? null : v;
  };

  const results = [];
  const warnings = [];
  const seen = new Map();
  let usedTag = 0;

  rows.forEach((row, i) => {
    const rowNo = i + 2; // 1 = baslik satiri
    const nameRaw = cell(row, 'fullName');
    const tagRaw = cell(row, 'tagId');

    const name = nameRaw ? String(nameRaw).trim() : '';
    if (!name && !tagRaw) {
      warnings.push({ row: rowNo, level: 'warn', message: 'Ad Soyad ve Üye Kodu boş - satır atlandı.' });
      return;
    }

    // --- Kimlik ---
    let tagId = tagRaw ? String(tagRaw).trim() : '';
    if (tagId && !/^zula-/i.test(tagId)) tagId = 'ZULA-' + tagId.replace(/\D+/g, '').padStart(3, '0');
    if (!tagId) {
      usedTag += 1;
      tagId = 'ZULA-' + String(usedTag + 1000).padStart(4, '0');
    }
    if (seen.has(tagId)) {
      warnings.push({ row: rowNo, level: 'warn', message: 'Tekrar eden üye kodu: ' + tagId });
    }
    seen.set(tagId, true);

    // --- Detay (gun x carpan) ---
    const details = parseDetails(cell(row, 'details'));

    // --- Temel degerler ---
    let testParticipation = parseNumber(cell(row, 'testParticipation'));
    if (!testParticipation && details.length > 0) {
      testParticipation = details.reduce((s, d) => s + d.multiplier, 0);
    }
    const bugReports = parseNumber(cell(row, 'bugReports'));
    const suggestions = parseNumber(cell(row, 'suggestions'));

    // --- Hesaplanan sutunlar ---
    const base = testParticipation + bugReports + suggestions;
    const qa = base * QA_MULTIPLIER;

    const support = parseNumber(cell(row, 'support'));
    const referee = parseNumber(cell(row, 'referee'));
    const managerScore = parseNumber(cell(row, 'managerScore'));
    const managerOpinion = parseNumber(cell(row, 'managerOpinion'));

    const label = name || tagId;

    // --- Tablodaki hesaplanmis sutunlarla tutarlilik kontrolu ---
    const sheetTotal = cell(row, 'total') != null ? parseNumber(cell(row, 'total')) : null;
    if (sheetTotal != null && sheetTotal !== base) {
      warnings.push({
        row: rowNo, level: 'info',
        message: label + ': tablodaki Toplam ' + sheetTotal.toLocaleString('tr-TR') +
          ' ≠ hesaplanan ' + base + ' (Katılım+Hata+Öneri). Hesaplanan kullanıldı.',
      });
    }
    const sheetQa = cell(row, 'qa') != null ? parseNumber(cell(row, 'qa')) : null;
    if (sheetQa != null && sheetQa !== qa) {
      warnings.push({
        row: rowNo, level: 'info',
        message: label + ': tablodaki QA ' + sheetQa.toLocaleString('tr-TR') +
          ' ≠ hesaplanan ' + qa.toLocaleString('tr-TR') + ' (Toplam × 1000). Hesaplanan kullanıldı.',
      });
    }

    results.push({
      excelRow: rowNo,
      name: name || '(isimsiz)',
      tagId,
      nickname: cell(row, 'nickname') ? String(cell(row, 'nickname')).trim() : '',
      game: cell(row, 'game') ? String(cell(row, 'game')).trim() : '',
      region: cell(row, 'region') ? String(cell(row, 'region')).trim() : '',
      role: cell(row, 'role') ? String(cell(row, 'role')).trim() : '',
      status: cell(row, 'status') ? String(cell(row, 'status')).trim() : '',
      testParticipation,
      bugReports,
      suggestions,
      base,
      qa,
      support,
      referee,
      managerScore,
      managerOpinion,
      details,
      detailsText: details.map((d) => String(d.day).padStart(2, '0') + 'x' + d.multiplier).join(', '),
      period: parsePeriod(cell(row, 'period')) || usePeriod,
    });
  });

  const totals = results.reduce(
    (acc, r) => ({
      rows: acc.rows + 1,
      base: acc.base + r.base,
      qa: acc.qa + r.qa,
      support: acc.support + r.support,
      referee: acc.referee + r.referee,
      bugs: acc.bugs + r.bugReports,
      suggestions: acc.suggestions + r.suggestions,
      testDays: acc.testDays + r.testParticipation,
    }),
    { rows: 0, base: 0, qa: 0, support: 0, referee: 0, bugs: 0, suggestions: 0, testDays: 0 }
  );

  return { results, warnings, totals, period: usePeriod, columnMap: map, headers };
}

/**
 * Birden fazla sayfayi (sekme) okur ve isle.
 * Her sayfa kendi donemine atanir:
 *   1) sayfadaki "Donem" sutunu varsa
 *   2) sayfa adi ("Eylül 2026" / "2026-09")
 *   3) sayfa adindan (yil yoksa) varsayilan yil
 *   4) son care: verilen fallbackPeriod
 * Okunamayan sayfalar atlanir (skipped listesi) — tek sayfa hatasi
 * tum aktarimi cokertmez.
 */
export async function fetchAllSheets({
  spreadsheetId,
  range = DEFAULT_RANGE,
  sheetNames,
  columnMap,
  defaultYear,
  fallbackPeriod,
}) {
  const names = Array.isArray(sheetNames) && sheetNames.length > 0
    ? sheetNames
    : (await listSheets({ spreadsheetId })).map((s) => s.name);

  const sheets = [];
  const skipped = [];

  for (const name of names) {
    try {
      // Gunluk (log) sekmeleri veri DEGILDIR: uye/test verisi sanilip
      // paneli sahte kayitlarla dolduruyordu (2026-10-06 raporu).
      if (isLogSheetName(name)) {
        skipped.push({ name, reason: 'Günlük (log) sekmesi — üye/test verisi değil.' });
        continue;
      }

      const { headers, rows } = await readValues({
        spreadsheetId,
        range: buildSheetRange(name, range),
      });

      if (rows.length === 0) {
        skipped.push({ name, reason: 'Sayfada veri yok.' });
        continue;
      }

      const auto = autoMapColumns(headers);
      const map =
        columnMap && Object.keys(columnMap).length > 0 ? columnMap : auto;

      // Basliklar hicbir alana eslesmiyorsa bu sayfa panel verisi degil
      // (ellerle eslestirme verilmemisken islemek yalnizca cop uretir).
      if (Object.keys(map).length === 0) {
        skipped.push({
          name,
          reason: 'Sütun başlıkları tanınmadı (otomatik eşleşme yok) — atlandı.',
        });
        continue;
      }

      // Sayfa adindan donem (yil yoksa defaultYear)
      const sheetPeriod =
        periodFromSheetName(name, defaultYear) || fallbackPeriod || null;

      const out = processRows({
        headers,
        rows,
        columnMap: map,
        period: sheetPeriod,
      });

      // Satirdaki "Donem" sutunu tekse onu tercih et
      const rowPeriods = new Set(out.results.map((r) => r.period).filter(Boolean));
      const finalPeriod = rowPeriods.size === 1 ? [...rowPeriods][0] : out.period;

      sheets.push({
        name,
        period: finalPeriod,
        headers,
        columnMap: out.columnMap,
        results: out.results.map((r) => ({ ...r, period: finalPeriod, sheet: name })),
        totals: out.totals,
        warnings: out.warnings,
        rowCount: rows.length,
      });
    } catch (err) {
      skipped.push({ name, reason: err?.message || 'Sayfa okunamadı.' });
    }
  }

  const totals = sheets.reduce(
    (acc, s) => ({
      sheets: acc.sheets + 1,
      rows: acc.rows + s.results.length,
      base: acc.base + s.totals.base,
      qa: acc.qa + s.totals.qa,
      support: acc.support + s.totals.support,
      referee: acc.referee + s.totals.referee,
      bugs: acc.bugs + s.totals.bugs,
      suggestions: acc.suggestions + s.totals.suggestions,
      testDays: acc.testDays + s.totals.testDays,
    }),
    { sheets: 0, rows: 0, base: 0, qa: 0, support: 0, referee: 0, bugs: 0, suggestions: 0, testDays: 0 }
  );

  // Tum satirlar tek listede (sayfa adiyla birlikte)
  const results = sheets.flatMap((s) => s.results);
  const warnings = sheets.flatMap((s) =>
    s.warnings.map((w) => ({ ...w, sheet: s.name, period: s.period }))
  );

  // Ayni sayfada ayni uye iki kez varsa uyari
  const seen = new Map();
  for (const r of results) {
    const key = (r.period || '') + '|' + r.tagId.toLowerCase();
    if (seen.has(key)) {
      warnings.push({
        row: r.excelRow, level: 'warn', sheet: r.sheet, period: r.period,
        message: r.name + ': aynı dönemde ikinci kayıt bulundu — sonraki satır geçersiz kılınmış olabilir.',
      });
    }
    seen.set(key, true);
  }

  return { sheets, results, warnings, totals, skipped, period: fallbackPeriod || null };
}
/** Oku + otomatik eslestir + isle: tek cagrida her seyi dondurur. */
export async function fetchAndProcess({ spreadsheetId, range, columnMap, period }) {
  const { headers, rows } = await readValues({ spreadsheetId, range });
  const map =
    columnMap && Object.keys(columnMap).length > 0 ? columnMap : autoMapColumns(headers);
  return processRows({ headers, rows, columnMap: map, period, defaultPeriod: period });
}

/** 0 tabanli sutun indeksi -> A1 hucre referansi ("Sayfa1!D2") */
function colToRange(sheet, row1Based, col0Based) {
  let col = '';
  let n = col0Based + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  const cellRef = col + row1Based;
  return sheet ? sheet + '!' + cellRef : cellRef;
}

/**
 * Hesaplanan Toplam / QA degerlerini tabloya geri yazar.
 *
 * - Yalnizca eslestirilmis hedef sutunlar varsa yazilir; ikisi de yoksa
 *   NO_TARGET_COLUMNS hatasi firlatilir (kullanici eslestirmeyi kurar).
 * - Yalnizca SAYI degerleri yazilir (formula enjeksiyonu imkansiz).
 */
export async function writeComputedColumns({
  spreadsheetId, range, columnMap, results, totalRow, writeTotal, writeQa,
}) {
  const sheets = await getClient();
  const totalIdx = writeTotal ? columnMap.total : null;
  const qaIdx = writeQa ? columnMap.qa : null;

  if (totalIdx == null && qaIdx == null) {
    const err = new Error(
      'Toplam veya QA sütunu eşleştirilemedi; yazma yapılmadı. ' +
        'Sütun eşleştirmeyi elle ayarlayın.'
    );
    err.code = 'NO_TARGET_COLUMNS';
    throw err;
  }

  const rangeStart = String(range || DEFAULT_RANGE).split(':')[0];
  const sheet = rangeStart.includes('!') ? rangeStart.split('!')[0] : null;

  const targets = [];
  if (totalIdx != null) targets.push({ idx: totalIdx, pick: (r) => r.base });
  if (qaIdx != null) targets.push({ idx: qaIdx, pick: (r) => r.qa });

  const data = [];
  for (const r of results) {
    for (const t of targets) {
      data.push({ range: colToRange(sheet, r.excelRow, t.idx), values: [[t.pick(r)]] });
    }
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    valueInputOption: 'RAW',
    requestBody: { valueInputOption: 'RAW', data },
  });

  let totalWritten = null;
  if (totalRow && totalIdx != null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: colToRange(sheet, totalRow, totalIdx),
      valueInputOption: 'RAW',
      requestBody: {
        valueInputOption: 'RAW',
        values: [[totalRow.base]],
      },
    });
    totalWritten = totalRow.base;
  }

  return { updated: results.length, total: totalWritten };
}