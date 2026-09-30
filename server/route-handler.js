/**
 * API istek yonlendiricisi.
 * Hem Express sunucusu (server/index.js) hem de Vercel serverless
 * function'i (api/sheets/[[...route]].js) bu modulu kullanir.
 *
 * Boylece is mantigi tek yerde durur; iki calistirma ortami da ayni davranir.
 */
import {
  isConfigured,
  testConnection,
  readValues,
  autoMapColumns,
  fetchAndProcess,
  fetchAllSheets,
  listSheets,
  writeComputedColumns,
  extractSpreadsheetId,
  periodFromSheetName,
  FIELD_LABELS,
  DEFAULT_RANGE,
} from './sheets-service.js';

import {
  readMembers,
  readMembersWithSecrets,
  writeMembers,
  verifyPassword,
  normalizeUsername,
  MEMBERS_TAB,
} from './members-store.js';

const DEFAULT_SPREADSHEET = extractSpreadsheetId(process.env.SHEETS_SPREADSHEET_ID || '');

/** Girdi (ID veya URL) guvenli sekilde tablo ID'sine cevrilir. */
function resolveId(body) {
  return extractSpreadsheetId(body?.spreadsheetId || DEFAULT_SPREADSHEET);
}

function rangeOf(body) {
  return body?.range || process.env.SHEETS_RANGE || DEFAULT_RANGE;
}

const ok = (payload) => ({ status: 200, body: payload });

const fail = (status, message, code = 'ERROR') => ({ status, body: { error: message, code } });

/**
 * @param {string} method   HTTP metodu
 * @param {string[]} segments  'status' | ['test'] gibi uc nokta parcalari
 * @param {object} body     JSON govdesi
 */
export async function handleApi(method, segments, body = {}) {
  const endpoint = String(segments?.[0] || '').toLowerCase();
  const get = method === 'GET' || method === 'HEAD';

  try {
    switch (endpoint) {
      case 'health':
        return ok({ ok: true, configured: isConfigured() });

      case 'status':
        return ok({
          configured: isConfigured(),
          defaultSpreadsheetId: DEFAULT_SPREADSHEET,
          defaultRange: rangeOf(),
          fieldLabels: FIELD_LABELS,
        });

      case 'test': {
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const range = rangeOf(body);
        const out = await testConnection({ spreadsheetId, range });
        return ok({ ...out, spreadsheetId, range });
      }

      case 'headers': {
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const { headers, rows } = await readValues({ spreadsheetId, range: rangeOf(body) });
        return ok({
          headers,
          columnMap: autoMapColumns(headers),
          fieldLabels: FIELD_LABELS,
          preview: rows.slice(0, 5),
          rowCount: rows.length,
        });
      }

      case 'fetch': {
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const range = rangeOf(body);
        const out = await fetchAndProcess({
          spreadsheetId,
          range,
          columnMap: body?.columnMap,
          period: body?.period,
        });
        return ok({ ...out, spreadsheetId, range });
      }

      case 'sheets': {
        // Tablodaki tum sayfalari (sekme) listeler + donem onayi
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const year = Number(body?.defaultYear) || new Date().getFullYear();
        const all = await listSheets({ spreadsheetId });
        return ok({
          spreadsheetId,
          count: all.length,
          sheets: all.map((s) => ({
            ...s,
            period: periodFromSheetName(s.name, year),
          })),
        });
      }

      case 'fetch-all': {
        // Birden fazla sayfayi okur; her sayfa kendi donemine atanir
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const range = rangeOf(body);
        const year = Number(body?.defaultYear) || new Date().getFullYear();
        const out = await fetchAllSheets({
          spreadsheetId,
          range,
          sheetNames: Array.isArray(body?.sheetNames) ? body.sheetNames : undefined,
          columnMap: body?.columnMap,
          defaultYear: year,
          fallbackPeriod: body?.period,
        });
        return ok({ ...out, spreadsheetId, range, defaultYear: year });
      }

      case 'write': {
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const out = await writeComputedColumns({
          spreadsheetId,
          range: body?.range,
          columnMap: body?.columnMap || {},
          results: body?.results || [],
          totalRow: body?.totalRow || null,
          writeTotal: body?.writeTotal !== false,
          writeQa: body?.writeQa !== false,
        });
        return ok({ ok: true, ...out });
      }

      case 'members': {
        // GET  -> uyeleri oku
        // POST -> uyeleri yaz
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const tabName = body?.tab || MEMBERS_TAB;

        if (get) {
          const members = await readMembers({ spreadsheetId, tabName });
          return ok({ ok: true, count: members.length, members, tab: tabName });
        }

        if (!Array.isArray(body?.members)) {
          return fail(400, 'members dizisi gerekli.');
        }

        // GUARD: Bos liste kabul edilmez.
        // writeMembers once satirlari temizleyip yeniden yazdigindan,
        // bos dizi gondermek TUM uye kayitlarini silerdi. Bu bir hata
        // durumunda (ya da bozuk bir istemcide) veri kaybi yaratir.
        if (body.members.length === 0) {
          return fail(400, 'members dizisi bos gonderilemez; tum kayitlar silinirdi.');
        }

        // GUARD 2: KISMEN SILME KORUMASI → KALDIRILDI
        //
        // Önceki sürüm, mevcut kayıtların yarısından azını içeren isteği
        // reddediyordu. Bu, "B yönetici yeni üye ekledi, A yönetici
        // güncelledi" senaryosunda A'nın isteğini engelliyordu.
        //
        // Artık gerek yok: writeMembers() `upsertOnly` ile çalıştığında
        // gelen listede olmayan üyeleri KORUR. Yalnızca panelde "Sil"
        // ile kaldırılan üye sunucuya gönderilmez ve sunucuda da
        // silinmiş olur. Böylece hem veri kaybı hem de yalnız çalışma
        // engeli ortadan kalkar.
        //
        // NOT: confirmSil bayrağı geriye dönük uyumluluk için bırakıldı.

        const out = await writeMembers({
          spreadsheetId,
          members: body.members,
          tabName,
          // Panel varsayılan olarak GÜVENLİ modda yazar: gelen listede
          // olmayan mevcut üyeler SİLİNMEZ. Böylece iki yönetici aynı
          // anda çalıştığında biri diğerinin eklediği üyeyi silemez.
          upsertOnly: body.upsertOnly !== false,
        });
        return ok({ ok: true, ...out });
      }

      // --- TEK ÜYE SİLME -------------------------------------------------
      // Panelde "Sil" düğmesi yalnızca bu uç noktayı çağırır; diğer
      // üyelerin kaydına hiç dokunulmaz. Toplu yazma her zaman
      // upsertOnly=true ile çalıştığı için, silinen üye listede
      // olmadığı için yanlışca korunmaz ve burada gerçekten silinir.
      case 'member-delete': {
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const id = String(body?.id || '').trim();
        if (!id) return fail(400, 'Silinecek üye id gerekli.');

        const all = await readMembers({ spreadsheetId, tabName: body?.tab || MEMBERS_TAB });
        const next = all.filter((m) => String(m.id || '').trim() !== id);
        if (next.length === all.length) {
          return fail(404, 'Üye bulunamadı (id: ' + id + ').', 'NOT_FOUND');
        }

        // Burada GERÇEKTEN silmek istiyoruz -> upsertOnly false
        const out = await writeMembers({
          spreadsheetId,
          members: next,
          tabName: body?.tab || MEMBERS_TAB,
          upsertOnly: false,
        });
        return ok({ ok: true, ...out, deletedId: id });
      }

      // --- TEK UYE SILME -------------------------------------------------
      // Panelde "Sil" dugmesi yalnizca bu uc noktayi cagirir; diger
      // uyelerin kaydina hic dokunulmaz. Toplu yazma her zaman
      // upsertOnly=true ile calistigi icin, silinen uye listede
      // olmadigi icin yanlisca korunmaz ve burada gercekten silinir.
      case 'member-delete': {
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const id = String(body?.id || '').trim();
        if (!id) return fail(400, 'Silinecek uye id gerekli.');

        const all = await readMembers({ spreadsheetId, tabName: body?.tab || MEMBERS_TAB });
        const next = all.filter((m) => String(m.id || '').trim() !== id);
        if (next.length === all.length) {
          return fail(404, 'Uye bulunamadi (id: ' + id + ').', 'NOT_FOUND');
        }

        // Burada GERCEKTEN silmek istiyoruz -> upsertOnly false
        const out = await writeMembers({
          spreadsheetId,
          members: next,
          tabName: body?.tab || MEMBERS_TAB,
          upsertOnly: false,
        });
        return ok({ ok: true, ...out, deletedId: id });
      }

      case 'login': {
        // Sifre dogrulamasi SUNUCUDA yapilir; sifre hicbir zaman istemciye gitmez.
        const spreadsheetId = resolveId(body);
        if (!spreadsheetId) return fail(400, 'Spreadsheet ID gerekli.');
        const tabName = body?.tab || MEMBERS_TAB;

        const rows = await readMembersWithSecrets({ spreadsheetId, tabName });
        const clean = normalizeUsername(body?.username);
        const found = rows.find(
          (m) =>
            normalizeUsername(m.username) === clean ||
            normalizeUsername(m.tagId) === clean ||
            normalizeUsername(m.email) === clean
        );

        if (!found || !verifyPassword(body?.password, found.passwordHash)) {
          return fail(401, 'Kullanıcı adı veya şifre hatalı.', 'BAD_CREDENTIALS');
        }

        // PASİF HESAP ENGELİ
        //
        // Önceki sürümde durum kontrolü YOKTU. Panele "Pasif" çekilen
        // bir kullanıcı şifresi doğru olduğu sürece sunucudan 200 alıp
        // panele girebiliyordu (yalnızca arayüz katmanı engelliyordu,
        // o da kolayca atlatılabiliyordu).
        //
        // Çözüm: durum kontrolü SUNUCUDA yapılır. Pasif hesap için
        // 403 ACCOUNT_INACTIVE döner; böylece engel istemciden bağımsız
        // ve atlatılamaz olur.
        const status = String(found.status || '').trim();
        if (status && status.toLocaleLowerCase('tr-TR') !== 'aktif') {
          return fail(
            403,
            'Hesabınız pasif durumda. Panele giriş yapamazsınız; yöneticinizle iletişime geçin.',
            'ACCOUNT_INACTIVE'
          );
        }

        // Sifre ozetini yanitta gonderme
        const { passwordHash, ...safe } = found;
        return ok({ ok: true, member: safe });
      }

      default:
        if (get && !endpoint) {
          return ok({
            service: 'Zula Suite Sheets API',
            endpoints: [
              'health', 'status', 'sheets', 'test', 'headers', 'fetch', 'fetch-all', 'write',
              'members', 'login',
            ],
          });
        }
        return fail(404, 'Bilinmeyen uç nokta: /api/sheets/' + (segments || []).join('/'));
    }
  } catch (err) {
    const status = err?.code === 'NO_CREDENTIALS' ? 503 : 500;
    return fail(status, err?.message || 'Bilinmeyen hata', err?.code || 'ERROR');
  }
}
