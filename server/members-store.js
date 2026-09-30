/**
 * Uye deposu — Google Sheets uzerinde ortak (paylasilan) uye listesi.
 *
 * Neden var? Uye listesi tarayicida tutuldugu surece her cihaz kendi
 * kopyasini gormekte ve yeni eklenen kisi diger cihazlarda gorunmemektedir.
 * Bu modul listeyi tek bir yerde (Google Sheets) tutar.
 *
 * Guvenlik: Sifreler HASH'lenerek saklanir (scrypt); duz metin sifre
 * hicbir zaman tabloya yazilmaz. Dogrulama sunucu tarafinda yapilir.
 */
import crypto from 'node:crypto';
import { getClient } from './sheets-service.js';

export const MEMBERS_TAB = 'UyeListesi';

/** Sheets sutun sirasi (degistirme!). */
export const MEMBER_COLUMNS = [
  'id',
  'tagId',
  'fullName',
  'gameNickname',
  'playerId',
  'discordTag',
  'email',
  'game',
  'region',
  'role',
  'status',
  'joinDate',
  'participationScore',
  'bugReportsCount',
  'notes',
  'username',
  'passwordHash',
  'permissions',
];

const LAST_COL = 'ABCDEFGHIJKLMNOPQR'[MEMBER_COLUMNS.length - 1];

/* ------------------------------------------------------------------ */
/* Sifre islemleri                                                     */
/* ------------------------------------------------------------------ */

/** Sifreyi scrypt ile hash'ler. Cikti: "scrypt$<salt>$<hash>" */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * Sifreyi dogrular.
 *  - "scrypt$salt$hash" bicimi -> sunucu tarafi dogrulama
 *  - duz metin (eski kayitlar) -> geriye donuk uyum
 */
export function verifyPassword(password, stored) {
  const value = String(stored || '');
  if (!value) return false;

  if (value.startsWith('scrypt$')) {
    const parts = value.split('$');
    const salt = parts[1];
    const expected = parts[2];
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, 32).toString('hex');
    const a = Buffer.from(actual, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Eski duz metin kayitlar
  return value === String(password);
}

/** Kullanici adini girise uygun hale getirir. */
export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Satir <-> uye donusumu                                              */
/* ------------------------------------------------------------------ */

const toNum = (v, fallback = 0) => {
  const n = Number(String(v ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

/** Sheets satiri -> uye nesnesi (sifre alani HARIC edilir). */
/** Rollerin varsayılan bölüm izinleri. */
const ROLE_DEFAULT_PERMISSIONS = {
  super_admin: [
    'dashboard','members','performance','reports','academy','referees',
    'roles','logs','tests','settings','sheets',
  ],
  company_manager: [
    'dashboard','members','performance','reports','academy','referees',
    'roles','logs','tests','settings','sheets',
  ],
  company_staff: ['dashboard','members','logs'],
  academy_lead: ['dashboard','academy','performance','tests','reports'],
  academy_member: ['dashboard','academy','performance','reports'],
  fedai_member: ['dashboard','academy'],
  referee_lead: ['dashboard','referees','performance','tests'],
  referee: ['dashboard','referees','performance'],
};

/**
 * Izin alanini her zaman gecerli bir diziye cevirir.
 * Sheets'te izinler virgullu METIN olarak saklanir; metni diziye
 * cevirmeden okumak uyeyi "yetkisiz" yapar ve giris reddedilir.
 */
function normalizePermissionList(raw, role) {
  const list =
    typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(raw)
        ? raw.map(String).filter(Boolean)
        : [];
  if (list.length > 0) return list;
  return ROLE_DEFAULT_PERMISSIONS[role] || ['dashboard'];
}

export function rowToMember(row) {
  const get = (name) => {
    const i = MEMBER_COLUMNS.indexOf(name);
    return row[i] == null ? '' : String(row[i]).trim();
  };
  return {
    id: get('id'),
    tagId: get('tagId'),
    fullName: get('fullName'),
    gameNickname: get('gameNickname'),
    playerId: get('playerId'),
    discordTag: get('discordTag'),
    email: get('email'),
    game: get('game'),
    region: get('region'),
    role: get('role'),
    status: get('status'),
    joinDate: get('joinDate'),
    participationScore: toNum(get('participationScore')),
    bugReportsCount: toNum(get('bugReportsCount')),
    notes: get('notes'),
    username: get('username'),
    permissions: normalizePermissionList(get('permissions'), get('role')),
  };
}

/** Uye nesnesi -> Sheets satiri. */
export function memberToRow(member) {
  return MEMBER_COLUMNS.map((col) => {
    if (col === 'permissions') {
      // Izinler dizi olabilecegi gibi virgüllü METIN de olabilir.
      // Iki bicimi de kabul ediyoruz; aksi halde izin alani sessizce
      // BOS yazilir ve uye "yetkisiz" sayilip giremez.
      const value = member.permissions;
      const text = Array.isArray(value)
        ? value.join(',')
        : value == null
          ? ''
          : String(value);
      return text.trim();
    }
    if (col === 'passwordHash') return member.passwordHash || '';
    if (col === 'participationScore') return Number(member.participationScore) || 0;
    if (col === 'bugReportsCount') return Number(member.bugReportsCount) || 0;
    return member[col] == null ? '' : String(member[col]);
  });
}


/* ------------------------------------------------------------------ */
/* Sheets islemleri                                                    */
/* ------------------------------------------------------------------ */

/** Uye sekmesi yoksa olusturur. */
export async function ensureMembersTab({ spreadsheetId, tabName = MEMBERS_TAB }) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const exists = (res.data.sheets || []).some((s) => s.properties?.title === tabName);
  if (exists) return tabName;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  return tabName;
}

/** Satirlari ham haliyle okur (baslik satiri haric). */
async function readRows({ spreadsheetId, tabName = MEMBERS_TAB }) {
  const sheets = await getClient();
  const tab = await ensureMembersTab({ spreadsheetId, tabName });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:${LAST_COL}1000`,
  });
  const values = res.data.values || [];
  if (values.length === 0) return [];
  return values.slice(1).filter((r) => r && r.some((c) => c !== '' && c != null));
}

/** Tum uyeleri okur (sifre OZETI OLMAZ). */
export async function readMembers({ spreadsheetId, tabName = MEMBERS_TAB }) {
  const rows = await readRows({ spreadsheetId, tabName });
  return rows.map((row) => rowToMember(row));
}

/** Sifre OZETIYLE okur — yalnizca sunucu tarafi dogrulama icin. */
export async function readMembersWithSecrets({ spreadsheetId, tabName = MEMBERS_TAB }) {
  const rows = await readRows({ spreadsheetId, tabName });
  const idx = MEMBER_COLUMNS.indexOf('passwordHash');
  return rows.map((row) => ({ ...rowToMember(row), passwordHash: row[idx] ?? '' }));
}

/**
 * Ayni uye kodunu tasiyan satirlari temizler.
 *
 * Arayuz benzersizlik kontrolu yaptigi icin ayni kod normalde iki kez
 * olusmaz. Ancak eski (ornek) kayitlar tarayicida kalirsa ayni kod
 * hem gercek kayitta hem ornekte bulunur ve "zaten kullaniliyor"
 * hatasiyle tum kayitlari engeller. Burada gercek kayit (13 haneli
 * zaman damgali id) korunur, ornek kayit dusurulur.
 */
export function dedupeByTag(members) {
  const seen = new Map();
  const out = [];
  for (const m of members) {
    const tag = String(m.tagId || '').trim().toUpperCase();
    if (!tag) {
      out.push(m);
      continue;
    }
    if (!seen.has(tag)) {
      seen.set(tag, m);
      out.push(m);
      continue;
    }
    // Ayni kod tekrar ediyor: hangisinin secilecegini belirle
    const first = seen.get(tag);
    const firstReal = /^m-\d{13}$/.test(String(first.id || ''));
    const curReal = /^m-\d{13}$/.test(String(m.id || ''));
    if (firstReal && !curReal) continue; // gercek kayit korunur
    if (!firstReal && curReal) {
      // gercek kayitla degistir
      const idx = out.indexOf(first);
      out[idx] = m;
      seen.set(tag, m);
    }
    // ikisi de ayni turdense ilkini birak
  }
  return out;
}

/**
 * Tum uyeleri yazar (baslik dahil, eski satirlar temizlenir).
 *
 * Sifre guvenligi:
 *  - Gelen uyede `password` (duz metin) varsa SUNUCUDA hash'lenir.
 *  - `password` ve `passwordHash` yoksa, tabloda zaten olan hash KORUNUR
 *    (boylece sunucudan okunmus uyeler tekrar yazildiginda sifre silinmez).
 */
export async function writeMembers({ spreadsheetId, members = [], tabName = MEMBERS_TAB }) {
  const sheets = await getClient();
  const tab = await ensureMembersTab({ spreadsheetId, tabName });
  const range = `${tab}!A1:${LAST_COL}1000`;

  // Once mevcut sifre ozetlerini sakla (koruma icin)
  const existing = await readRows({ spreadsheetId, tabName });
  const ID_IDX = MEMBER_COLUMNS.indexOf('id');
  const HASH_IDX = MEMBER_COLUMNS.indexOf('passwordHash');
  const hashById = new Map(
    existing.map((r) => [String(r[ID_IDX] ?? '').trim(), String(r[HASH_IDX] ?? '')])
  );

  // Ayni uye kodunu tasiyan satirlari temizle
  const cleaned = dedupeByTag(members);

  // Eski satirlari temizle
  await sheets.spreadsheets.values.clear({ spreadsheetId, range, body: {} });

  const rows = cleaned.map((m) => {
    const member = { ...m };
    const plain = String(m.password || '');
    delete member.password;

    if (plain) {
      member.passwordHash = hashPassword(plain);
    } else if (!member.passwordHash) {
      member.passwordHash = hashById.get(String(m.id || '').trim()) || '';
    }
    return memberToRow(member);
  });

  const values = [MEMBER_COLUMNS, ...rows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    // valueInputOption requestBody'nin ICINDE olmaz; ust seviyede verilir
    requestBody: { values },
  });

  return { written: members.length, tab };
}
