/**
 * Google Sheets ile iletisim (backend proxy uzerinden).
 * Servis hesabi anahtari SADECE backend'de kalir.
 */

export const SHEET_FIELDS = [
  'tagId',
  'fullName',
  'nickname',
  'game',
  'region',
  'role',
  'status',
  'testParticipation',
  'bugReports',
  'suggestions',
  'total',
  'details',
  'support',
  'referee',
  'qa',
  'period',
  'managerScore',
  'managerOpinion',
] as const;

export type SheetFieldKey = (typeof SHEET_FIELDS)[number];
export type SheetColumnMap = Partial<Record<SheetFieldKey, number>>;

export interface SheetDetail {
  day: number;
  multiplier: number;
}

export interface SheetRow {
  excelRow: number;
  name: string;
  tagId: string;
  nickname: string;
  game: string;
  region: string;
  role: string;
  status: string;
  testParticipation: number;
  bugReports: number;
  suggestions: number;
  base: number;
  qa: number;
  support: number;
  referee: number;
  managerScore: number;
  managerOpinion: number;
  details: SheetDetail[];
  detailsText: string;
  period: string | null;
  /** Coklu sayfa modunda kaynak sayfa adi */
  sheet?: string;
}

export interface SheetWarning {
  row: number;
  level: 'info' | 'warn';
  message: string;
}

export interface SheetTotals {
  rows: number;
  base: number;
  qa: number;
  support: number;
  referee: number;
  bugs: number;
  suggestions: number;
  testDays: number;
}

export interface SheetHeadersResponse {
  headers: string[];
  columnMap: SheetColumnMap;
  fieldLabels: Record<string, string>;
  preview: string[][];
  rowCount: number;
}

export interface SheetProcessResult {
  results: SheetRow[];
  warnings: SheetWarning[];
  totals: SheetTotals;
  period: string | null;
  columnMap: SheetColumnMap;
  headers: string[];
  spreadsheetId: string;
  range: string;
}

export interface SheetsStatus {
  configured: boolean;
  /**
   * Sunucuda varsayilan tablo kimligi TANIMLI MI.
   * Degerinin kendisi bilerek dondurulmez (guvenlik: bu uc nokta
   * herkese acik; tablo kimligi sizarsa biri tabloya erisme calisir).
   */
  hasDefaultSpreadsheet: boolean;
  defaultRange: string;
  /** Slack baglantisi kurulu mu */
  slackConfigured?: boolean;
  /** Hangi yol: 'bot' | 'webhook' | 'none' */
  slackMode?: string;
/**
   * SESSION_SECRET tanimli mi? Sadece "var/yok" — sirin kendisi ASLA
   * dondurulmez.
   *
   * false ise sunucu gecici bir anahtar uretir ve her deploy'da
   * degisir; kullanici oturumunu kaybedip "oturum suresi doldu"
   * gorur (12 saat dolmamis olmasina ragmen).
   */
  sessionSecretSet?: boolean;
  fieldLabels: Record<string, string>;
}

/** Tablodaki tek bir sayfa (sekme) */
export interface SheetTab {
  name: string;
  rows: number;
  cols: number;
  period: string | null; // sayfa adindan cikarilan donem (YYYY-AA)
}

export interface SheetsListResponse {
  spreadsheetId: string;
  count: number;
  sheets: SheetTab[];
}

/** Islenmis tek sayfa blogu */
export interface SheetBlock {
  name: string;
  period: string | null;
  headers: string[];
  columnMap: SheetColumnMap;
  results: SheetRow[];
  totals: SheetTotals;
  warnings: SheetWarning[];
  rowCount: number;
}

export interface SheetSkipped {
  name: string;
  reason: string;
}

export interface SheetMultiTotals extends SheetTotals {
  sheets: number;
}

export interface SheetMultiResult {
  sheets: SheetBlock[];
  results: SheetRow[];
  warnings: SheetWarning[];
  totals: SheetMultiTotals;
  skipped: SheetSkipped[];
  period: string | null;
  spreadsheetId: string;
  range: string;
  defaultYear: number;
}

export interface SheetSettings {
  spreadsheetId: string;
  range: string;
  period: string;
  /** Sayfa adinda yil yoksa kullanilacak yil (orn. "Eylul") */
  defaultYear: string;
}

const SETTINGS_KEY = 'zula_suite_sheet_settings';

/**
 * Backend adresi.
 * - Geliştirmede boş bırakılır: Vite proxy '/api' isteklerini localhost:8787'ye yollar.
 * - Üretimde VITE_API_BASE_URL ile Render (veya benzeri) servis adresi verilir.
 *   Örn: https://zula-sheets-api.onrender.com
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string): string => (API_BASE ? API_BASE + path : path);

export class SheetsApiError extends Error {
  code: string;
  constructor(message: string, code = 'ERROR') {
    super(message);
    this.code = code;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; code?: string };
    throw new SheetsApiError(obj.error || text || 'Bilinmeyen hata', obj.code || 'ERROR');
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  const text = await res.text();
  if (!res.ok) throw new SheetsApiError(text || 'Sunucuya ulasilamadi');
  return (text ? JSON.parse(text) : null) as T;
}

/* ---------------- API cagrilari ---------------- */

export const sheetsApi = {
  status: () => get<SheetsStatus>('/api/sheets/status'),

  test: (s: SheetSettings) =>
    post<{ ok: boolean; title: string; sheetNames: string[]; headerCount: number; rowCount: number }>(
      '/api/sheets/test',
      { spreadsheetId: s.spreadsheetId, range: s.range }
    ),

  headers: (s: SheetSettings) => post<SheetHeadersResponse>('/api/sheets/headers', s),

  /** Tablodaki tum sayfalari (sekme) listeler */
  sheetList: (s: SheetSettings & { defaultYear?: string | number }) =>
    post<SheetsListResponse>('/api/sheets/sheets', s),

  /** Birden fazla sayfayi cekip isle (her sayfa kendi donemine) */
  fetchAll: (
    s: SheetSettings & { sheetNames?: string[]; columnMap?: SheetColumnMap; defaultYear?: string | number }
  ) => post<SheetMultiResult>('/api/sheets/fetch-all', s),

  fetch: (s: SheetSettings & { columnMap?: SheetColumnMap }) =>
    post<SheetProcessResult>('/api/sheets/fetch', s),

  write: (payload: {
    spreadsheetId: string;
    range: string;
    columnMap: SheetColumnMap;
    results: SheetRow[];
    totalRow: { base: number } | null;
    writeTotal: boolean;
    writeQa: boolean;
  }) => post<{ ok: boolean; updated: number; total: number | null }>('/api/sheets/write', payload),
};

/* ---------------- Yerel ayarlar ---------------- */

export function loadSheetSettings(): SheetSettings {
  const fallback: SheetSettings = {
    spreadsheetId: '',
    range: 'A1:Z2000',
    period: '',
    defaultYear: String(new Date().getFullYear()),
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<SheetSettings>) };
  } catch {
    return fallback;
  }
}

export function saveSheetSettings(s: SheetSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
