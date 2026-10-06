/**
 * Google Sheets istemcisi (src/lib/sheets.ts) — SIFIRDAN YAZIM (2026-10-06)
 *
 * Servis hesabi anahtari SADECE sunucudadir; bu dosya yalnizca
 * /api/sheets/* uclarini cagirir.
 *
 * KRITIK: `post()` her istekte oturum belirtecini GONDERIR (authHeaders).
 * Belirtec gonderilmeden tum yazma istekleri sunucuda 401 (NO_SESSION) ile
 * reddedilir.
 */
import { authHeaders } from './session-token';

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

/** "01x2, 13x2" bicimindeki gun x carpan verisi */
export interface SheetDetail {
  day: number;
  multiplier: number;
}

/** Islenmis tek uye satiri (sunucunun dondugu sekil) */
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

/** Satir bazli uyari (bos satir, tekrar eden kod, hesap farki...) */
export interface SheetWarning {
  row: number;
  level: 'info' | 'warn';
  message: string;
}

/** Sayisal ozet */
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

/** /headers ucunun donusu: sutun basliklari + esleme onerisi */
export interface SheetHeadersResponse {
  headers: string[];
  columnMap: SheetColumnMap;
  fieldLabels: Record<string, string>;
  preview: string[][];
  rowCount: number;
}
/** /fetch ucunun donusu: tek sayfa islenmis hali */
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

/** /status ucunun donusu (herkese acik; sirlar dondurulmez) */
export interface SheetsStatus {
  /** Sunucuda Google kimlik bilgisi TANIMLI MI */
  configured: boolean;
  /**
   * Sunucuda varsayilan tablo kimligi TANIMLI MI.
   * Degerinin kendisi dondurulmez (guvenlik: bu uc herkese acik).
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
   */
  sessionSecretSet?: boolean;
  fieldLabels: Record<string, string>;
}

/** Tablodaki tek bir sayfa (sekme) */
export interface SheetTab {
  name: string;
  rows: number;
  cols: number;
  /** Sayfa adindan cikarilan donem (YYYY-AA) */
  period: string | null;
}

/** /sheets ucunun donusu */
export interface SheetsListResponse {
  spreadsheetId: string;
  count: number;
  sheets: SheetTab[];
}

/** Coklu sayfada tek sayfa blogu */
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

/** Atlanan sayfa (bos sayfa / okunamayan sayfa) */
export interface SheetSkipped {
  name: string;
  reason: string;
}

/** Coklu sayfa toplami (kac sayfa oldugu eklenir) */
export interface SheetMultiTotals extends SheetTotals {
  sheets: number;
}

/** /fetch-all ucunun donusu */
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

/** Panelde saklanan tablo ayarlari */
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
 * - Gelistirmede bos: Vite proxy '/api' isteklerini localhost:8787'ye yollar.
 * - Uretimde VITE_API_BASE_URL ile sunucu adresi verilir.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string): string => (API_BASE ? API_BASE + path : path);

/** Sunucudan gelen API hatasi (kod + mesaj birlikte tasinir). */
export class SheetsApiError extends Error {
  code: string;
  constructor(message: string, code = 'ERROR') {
    super(message);
    this.name = 'SheetsApiError';
    this.code = code;
  }
}

/**
 * Guvenli POST — oturum belirteci EKLENIR.
 *
 * Belirtec gonderilmeden yazma uclari sunucuda 401 (NO_SESSION) ile
 * reddedilir; bu yuzden header her zaman authHeaders() ile kurulur.
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: authHeaders(),
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
/** Guvenli GET (herkese acik tanilama uclari icin). */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  const text = await res.text();
  if (!res.ok) throw new SheetsApiError(text || 'Sunucuya ulaşılamadı');
  return (text ? JSON.parse(text) : null) as T;
}

/* ---------------- API cagrilari ---------------- */

export const sheetsApi = {
  /** Baglanti + alan etiketi durumu (herkese acik) */
  status: () => get<SheetsStatus>('/api/sheets/status'),

  /** Tablo baglanti testi: sayfa adlari + baslik sayisi doner */
  test: (s: SheetSettings) =>
    post<{ ok: boolean; title: string; sheetNames: string[]; headerCount: number; rowCount: number }>(
      '/api/sheets/test',
      { spreadsheetId: s.spreadsheetId, range: s.range }
    ),

  /** Basliklari oku + otomatik sutun esleme onerisi */
  headers: (s: SheetSettings) => post<SheetHeadersResponse>('/api/sheets/headers', s),

  /** Tablodaki tum sayfalari (sekme) listeler */
  sheetList: (s: SheetSettings & { defaultYear?: string | number }) =>
    post<SheetsListResponse>('/api/sheets/sheets', s),

  /** Birden fazla sayfayi cekip isle (her sayfa kendi donemine) */
  fetchAll: (
    s: SheetSettings & {
      sheetNames?: string[];
      columnMap?: SheetColumnMap;
      defaultYear?: string | number;
    }
  ) => post<SheetMultiResult>('/api/sheets/fetch-all', s),

  /** Tek sayfayi cekip isle */
  fetch: (s: SheetSettings & { columnMap?: SheetColumnMap }) =>
    post<SheetProcessResult>('/api/sheets/fetch', s),

  /** Hesaplanan Toplam / QA sutunlarini tabloya geri yazar */
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
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* depolama kapali olabilir */
  }
}