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
    permissions: get('permissions')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  };
}

/** Uye nesnesi -> Sheets satiri. */
export function memberToRow(member) {
  return MEMBER_COLUMNS.map((col) => {
    if (col === 'permissions') {
      return Array.isArray(member.permissions) ? member.permissions.join(',') : '';
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

  // Eski satirlari temizle
  await sheets.spreadsheets.values.clear({ spreadsheetId, range, body: {} });

  const rows = members.map((m) => {
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
