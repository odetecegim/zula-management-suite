import React, { useEffect, useMemo, useState } from 'react';
import {
  Sheet, CloudDownload, RefreshCw, Plug, AlertTriangle, CheckCircle2, Loader2,
  Upload, Table2, Link2, Info, X, Layers,
} from 'lucide-react';
import { currentPeriod, periodLabel } from '../lib/time';
import {
  sheetsApi, loadSheetSettings, saveSheetSettings, SheetsApiError, SHEET_FIELDS,
} from '../lib/sheets';
import type {
  SheetSettings, SheetColumnMap, SheetProcessResult, SheetRow, SheetFieldKey, SheetsStatus,
  SheetTab, SheetMultiResult,
} from '../lib/sheets';
import type { Member, Performance, GameType, RegionType, StatusType, RoleId, PerfEntry } from '../types';

interface SheetsViewProps {
  members: Member[];
  performances: Performance[];
  onApplyImport: (payload: { members: Member[]; performances: Performance[]; summary: string }) => void;
}

const FIELD_LABELS: Record<SheetFieldKey, string> = {
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
  details: 'Detay (gün × çarpan)',
  support: 'Support',
  referee: 'Hakem Performansı',
  qa: 'QA (hesaplanan)',
  period: 'Dönem',
  managerScore: 'Yönetici Puanı',
  managerOpinion: 'Yönetici Görüşü',
};

const norm = (s: string) =>
  s.toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '');

const matchFrom = <T extends string>(raw: string, allowed: readonly T[]): T | null => {
  const n = norm(raw);
  if (!n) return null;
  const hit = allowed.find((a) => {
    const an = norm(a);
    return an === n || an.includes(n) || n.includes(an);
  });
  return hit ?? null;
};

const GAMES: GameType[] = ['Zula PC', 'Zula Strike', 'Wolfteam'];
const REGIONS: RegionType[] = ['TR', 'EU', 'LATAM', 'MENA'];
const STATUSES: StatusType[] = ['Aktif', 'Pasif', 'İncelemede'];
const ROLES: RoleId[] = ['super_admin', 'company_manager', 'academy_lead', 'academy_member', 'fedai_member', 'referee_lead', 'referee'];

const fmt = (n: number) => n.toLocaleString('tr-TR');

export const SheetsView: React.FC<SheetsViewProps> = ({ members, performances, onApplyImport }) => {
  const [settings, setSettings] = useState<SheetSettings>(() => loadSheetSettings());
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [busy, setBusy] = useState<
    '' | 'status' | 'test' | 'headers' | 'sheets' | 'fetch' | 'fetchAll' | 'write' | 'import'
  >('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [map, setMap] = useState<SheetColumnMap>({});
  const [result, setResult] = useState<SheetProcessResult | null>(null);
  const [previewLimit, setPreviewLimit] = useState(15);

  // Coklu sayfa (sekme) destegi
  const [sheetList, setSheetList] = useState<SheetTab[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [multi, setMulti] = useState<SheetMultiResult | null>(null);

  useEffect(() => {
    sheetsApi.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  const period = settings.period || currentPeriod();

  const effectivePeriod = useMemo(() => {
    if (result?.period) return result.period;
    return period;
  }, [result, period]);

  const update = (patch: Partial<SheetSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSheetSettings(next);
  };

  const handleError = (e: unknown) => {
    if (e instanceof SheetsApiError) setError(e.message);
    else setError('Beklenmeyen bir hata oluştu.');
    setInfo(null);
  };

  const doTest = async () => {
    setBusy('test'); setError(null); setInfo(null);
    try {
      const r = await sheetsApi.test({ ...settings, range: settings.range });
      setInfo(
        'Bağlantı başarılı: "' + r.title + '" · ' + r.headerCount + ' sütun, ' +
        r.rowCount + ' satır veri okundu.'
      );
    } catch (e) { handleError(e); } finally { setBusy(''); }
  };

  /** Sayfalari (sekme) listeler; secim varsayilan olarak tumu. */
  const loadSheetList = async () => {
    setBusy('sheets'); setError(null); setInfo(null);
    try {
      const r = await sheetsApi.sheetList(settings);
      setSheetList(r.sheets);
      setSelected((prev) =>
        prev.length > 0 ? prev.filter((n) => r.sheets.some((s) => s.name === n)) : r.sheets.map((s) => s.name)
      );
      setInfo(r.count + ' sayfa bulundu. İstediğiniz sayfaları seçip çekebilirsiniz.');
    } catch (e) { handleError(e); } finally { setBusy(''); }
  };

  const toggleSheet = (name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  /** Secili tum sayfalari cekip her birini kendi donemine isle. */
  const doFetchAll = async () => {
    setBusy('fetchAll'); setError(null); setInfo(null);
    try {
      const r = await sheetsApi.fetchAll({
        ...settings,
        period,
        sheetNames: selected.length > 0 ? selected : undefined,
        columnMap: Object.keys(map).length > 0 ? map : undefined,
        defaultYear: settings.defaultYear,
      });
      setMulti(r);
      setResult(null);
      const t = r.totals;
      setInfo(
        t.sheets + ' sayfa · ' + t.rows + ' satır çekildi ve işlendi · QA toplamı ' +
        fmt(t.qa) + ' · Support ' + fmt(t.support) + '.'
      );
    } catch (e) { handleError(e); } finally { setBusy(''); }
  };

  const loadHeaders = async () => {
    setBusy('headers'); setError(null); setInfo(null);
    try {
      const r = await sheetsApi.headers(settings);
      setHeaders(r.headers);
      setRowCount(r.rowCount);
      setMap(r.columnMap);
      setInfo(r.headers.length + ' sütun bulundu, ' + r.rowCount + ' satır hazır.');
    } catch (e) { handleError(e); } finally { setBusy(''); }
  };

  const doFetch = async () => {
    setBusy('fetch'); setError(null); setInfo(null);
    try {
      const r = await sheetsApi.fetch({ ...settings, period, columnMap: map });
      setResult(r);
      setHeaders(r.headers);
      setMap(r.columnMap);
      setInfo(
        r.results.length + ' satır çekildi ve işlendi · QA toplamı ' + fmt(r.totals.qa) +
        ' · Support ' + fmt(r.totals.support) + '.'
      );
    } catch (e) { handleError(e); } finally { setBusy(''); }
  };

  const doWrite = async () => {
    // Coklu sayfa: her sayfayi kendi araligi ve sutun eslestirmesiyle yaz
    if (multi && multi.sheets.length > 0) {
      setBusy('write'); setError(null); setInfo(null);
      try {
        let total = 0;
        for (const s of multi.sheets) {
          const r = await sheetsApi.write({
            spreadsheetId: multi.spreadsheetId,
            range: settings.range,
            columnMap: s.columnMap,
            results: s.results,
            totalRow: { base: s.totals.base },
            writeTotal: true,
            writeQa: true,
          });
          total += r.updated;
        }
        setInfo(multi.sheets.length + ' sayfanın Toplam ve QA değeri tabloya yazıldı (' + total + ' hücre).');
      } catch (e) { handleError(e); } finally { setBusy(''); }
      return;
    }

    if (!result) return;
    setBusy('write'); setError(null); setInfo(null);
    try {
      const r = await sheetsApi.write({
        spreadsheetId: result.spreadsheetId,
        range: result.range,
        columnMap: result.columnMap,
        results: result.results,
        totalRow: { base: result.totals.base },
        writeTotal: true,
        writeQa: true,
      });
      setInfo(r.updated + ' satırın Toplam ve QA değeri tabloya yazıldı.');
    } catch (e) { handleError(e); } finally { setBusy(''); }
  };

  /** Coklu sayfa sonucu varsa onu, yoksa tek sayfa sonucunu kullanir. */
  const activeRows: SheetRow[] = (multi?.results ?? result?.results ?? []) as SheetRow[];

  type Warn = { row: number; level: 'info' | 'warn'; message: string; sheet?: string; period?: string | null };
  const activeWarnings: Warn[] = (multi?.warnings ?? result?.warnings ?? []) as Warn[];

  /** Panele aktarilacak veri (coklu sayfa oncelikli). */
  const doImport = () => {
    if (activeRows.length === 0) return;
    setBusy('import'); setError(null); setInfo(null);
    try {
      const nextMembers = [...members];
      const newPerfs: Performance[] = [];
      const periods = new Set<string>();
      let added = 0;
      let updated = 0;

      activeRows.forEach((row, idx) => {
        // Her satir kendi sayfasindan gelen donemi tasir
        const p = row.period || effectivePeriod;
        if (p) periods.add(p);
        const tagKey = row.tagId.toLowerCase();
        const foundIdx = nextMembers.findIndex((m) => m.tagId.toLowerCase() === tagKey);
        let member: Member;

        const game = matchFrom(row.game, GAMES);
        const region = matchFrom(row.region, REGIONS);
        const role = matchFrom(row.role, ROLES);
        const status = matchFrom(row.status, STATUSES);

        if (foundIdx > -1) {
          const base = nextMembers[foundIdx];
          member = {
            ...base,
            fullName: row.name,
            gameNickname: row.nickname || base.gameNickname,
            game: game ?? base.game,
            region: region ?? base.region,
            role: role ?? base.role,
            status: status ?? base.status,
            bugReportsCount: row.bugReports,
          };
          nextMembers[foundIdx] = member;
          updated += 1;
        } else {
          member = {
            id: 'm-sheet-' + idx + '-' + row.excelRow,
            tagId: row.tagId,
            fullName: row.name,
            gameNickname: row.nickname || row.name.split(' ')[0] || 'Oyuncu',
            playerId: '',
            discordTag: '',
            email: '',
            game: game ?? 'Zula PC',
            region: region ?? 'TR',
            role: role ?? 'academy_member',
            status: status ?? 'Aktif',
            joinDate: new Date().toISOString().split('T')[0],
            participationScore: 80,
            bugReportsCount: row.bugReports,
            notes: 'Google Sheets üzerinden aktarıldı.',
            username: '',
            password: '',
            permissions: ['dashboard', 'performance', 'reports'],
          };
          nextMembers.push(member);
          added += 1;
        }

        // Discord ayrıntıları tabloda yok -> mevcut kayıttan korunur
        const existing = performances.find((x) => x.memberId === member.id && x.period === p);
        const entries: PerfEntry[] = row.details.map((d, i) => ({
          id: 'se-' + row.excelRow + '-' + i + '-' + d.day,
          day: d.day,
          multiplier: d.multiplier,
        }));

        newPerfs.push({
          memberId: member.id,
          period: p,
          testParticipation: row.testParticipation,
          testDays: row.details.map((d) => d.day),
          bugReports: row.bugReports,
          suggestions: row.suggestions,
          refereeMatches: row.referee,
          refereeDays: existing?.refereeDays ?? [],
          qaReviews: existing?.qaReviews ?? 0,
          discordActions: existing?.discordActions ?? 0,
          managerScore: row.managerScore,
          notes: existing?.notes ?? '',
          participationEntries: entries,
          participationDetails: row.detailsText,
          supportPoints: row.support,
          managerOpinion: row.managerOpinion,
          refereeEntries: existing?.refereeEntries ?? [],
          refereeEveryoneX: existing?.refereeEveryoneX ?? 0,
          refereeSabotage: existing?.refereeSabotage ?? 0,
          discordTimeout: existing?.discordTimeout ?? 0,
          discordBan: existing?.discordBan ?? 0,
          discordMessageDelete: existing?.discordMessageDelete ?? 0,
        });
      });

      const summary =
        added + ' yeni üye, ' + updated + ' üye güncellendi, ' +
        newPerfs.length + ' performans kaydı yazıldı (' +
        (periods.size > 0 ? [...periods].join(', ') : effectivePeriod) + ').';

      onApplyImport({ members: nextMembers, performances: newPerfs, summary });
      setInfo('Panele aktarıldı: ' + summary);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy('');
    }
  };

  const notConfigured = status !== null && !status.configured;
  const missingIdentity = !map.fullName && !map.tagId;


  return (
    <div className="space-y-6">
      {/* Baslik */}
      <div className="bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
              <Sheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Google Sheets Entegrasyonu
                {status === null ? (
                  <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                ) : status.configured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tüm veriyi tablodan çekip işler: Toplam ve QA otomatik hesaplanır.
              </p>
            </div>
          </div>
          {status && !status.configured && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Servis hesabı yok
            </span>
          )}
        </div>

        {notConfigured && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Backend yapılandırılmamış.</p>
              <p>
                <code className="font-mono">server/.env.example</code> dosyasını{' '}
                <code className="font-mono">server/.env</code> olarak kopyalayıp servis hesabını
                tanımlayın, sonra <code className="font-mono">npm run server</code> ile
                başlatın. Anahtar tarayıcıya hiç taşınmaz.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Spreadsheet ID veya URL
            </label>
            <input
              type="text"
              value={settings.spreadsheetId}
              onChange={(e) => update({ spreadsheetId: e.target.value.trim() })}
              placeholder="1AbC...  veya  https://docs.google.com/spreadsheets/d/1AbC.../edit"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">URL yapıştırdıysanız ID otomatik çıkarılır.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Aralık (Range)</label>
            <input
              type="text"
              value={settings.range}
              onChange={(e) => update({ range: e.target.value.trim() })}
              placeholder="A1:Z2000"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500"
            />
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Dönem (YYYY-AA)</label>
            <input
              type="text"
              value={settings.period}
              onChange={(e) => update({ period: e.target.value.trim() })}
              placeholder={currentPeriod()}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Sayfa adından dönem bulunamazsa kullanılır.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Varsayılan Yıl</label>
            <input
              type="text"
              value={settings.defaultYear}
              onChange={(e) => update({ defaultYear: e.target.value.trim() })}
              placeholder="2026"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">"Eylül" gibi yılsız sayfa adları için.</p>
          </div>
          <div className="lg:col-span-2 flex flex-wrap items-end gap-2">
            <button
              onClick={doTest}
              disabled={busy !== '' || !settings.spreadsheetId}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Bağlantıyı Test Et
            </button>
            <button
              onClick={loadSheetList}
              disabled={busy !== '' || !settings.spreadsheetId}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === 'sheets' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Sayfaları Listele
            </button>
            <button
              onClick={loadHeaders}
              disabled={busy !== '' || !settings.spreadsheetId}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === 'headers' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table2 className="w-4 h-4" />}
              Sütunları Oku
            </button>
            <button
              onClick={doFetchAll}
              disabled={busy !== '' || !settings.spreadsheetId}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === 'fetchAll' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              Sayfaları Çek ve İşle
            </button>
            <button
              onClick={doFetch}
              disabled={busy !== '' || !settings.spreadsheetId || missingIdentity}
              className="px-3 py-2.5 rounded-xl text-[11px] font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Seçili sayfaları tek seferde, aralık önizlemesiyle çek"
            >
              {busy === 'fetch' ? <Loader2 className="w-3.5 h-3.5 inline animate-spin" /> : <Table2 className="w-3.5 h-3.5 inline" />}{' '}
              Tek Sayfa Önizle
            </button>
          </div>
        </div>

        {(error || info) && (
          <div
            className={
              'flex items-start gap-2 p-3 rounded-xl text-xs border ' +
              (error
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200')
            }
          >
            {error ? (
              <X className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="break-words">{error ?? info}</span>
          </div>
        )}
      </div>

      {/* Sayfa (sekme) secimi */}
      {sheetList.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Sayfalar (Sekmeler)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Her sayfa kendi dönemine yazılır. Dönem sayfa adından okunur
                (örn. "Eylül 2026" → 2026-09).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-emerald-300">
                {selected.length}/{sheetList.length} seçili
              </span>
              <button
                onClick={() => setSelected(sheetList.map((s) => s.name))}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
              >
                Tümünü Seç
              </button>
              <button
                onClick={() => setSelected([])}
                className="text-[11px] text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
              >
                Temizle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sheetList.map((s) => {
              const on = selected.includes(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => toggleSheet(s.name)}
                  className={
                    'flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ' +
                    (on
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700')
                  }
                >
                  <span
                    className={
                      'mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center border ' +
                      (on ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-900 border-slate-700')
                    }
                  >
                    {on && <CheckCircle2 className="w-3 h-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-200 truncate">{s.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-1">
                      {s.period ? (
                        <span className="text-[10px] font-mono font-bold text-emerald-400">
                          {periodLabel(s.period)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-400">
                          dönem yok → {effectivePeriod}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">{s.rows} satır</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sutun eslestirme */}
      {headers.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
            <Table2 className="w-4 h-4 text-emerald-400" />
            Sütun Eşleştirme
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            {headers.length} sütun · {rowCount || result?.results.length || 0} satır bulundu.
            Eşleşmeleri elle düzenleyebilirsiniz.
          </p>

          {missingIdentity && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Üye tanımlamak için <b>Ad Soyad</b> veya <b>Üye Kodu</b> sütunlarından birini eşleştirin.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {SHEET_FIELDS.map((field) => (
              <div key={field} className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                  {FIELD_LABELS[field]}
                </div>
                <select
                  value={map[field] ?? -1}
                  onChange={(e) => {
                    const v = e.target.value === '-1' ? undefined : Number(e.target.value);
                    setMap((prev) => {
                      const next = { ...prev };
                      if (v === undefined) delete next[field];
                      else next[field] = v;
                      return next;
                    });
                  }}
                  className={
                    'w-full bg-slate-900 border rounded-lg px-2 py-1.5 text-[11px] outline-none cursor-pointer ' +
                    (map[field] != null
                      ? 'border-emerald-500/40 text-emerald-300'
                      : 'border-slate-800 text-slate-500')
                  }
                >
                  <option value={-1}>— eşleştirilmedi —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {String.fromCharCode(65 + (i % 26)) + (i >= 26 ? i : '')} · {h || '(boş)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Sonuclar */}
      {(multi || result) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: multi ? 'Sayfa' : 'Satır', value: fmt(multi ? multi.totals.sheets : (result?.totals.rows ?? 0)), tone: 'text-white' },
              { label: 'Satır', value: fmt(multi ? multi.totals.rows : (result?.totals.rows ?? 0)), tone: 'text-white' },
              { label: 'Toplam', value: fmt(multi ? multi.totals.base : (result?.totals.base ?? 0)), tone: 'text-emerald-300' },
              { label: 'QA Toplamı', value: fmt(multi ? multi.totals.qa : (result?.totals.qa ?? 0)), tone: 'text-emerald-300' },
              { label: 'Support', value: fmt(multi ? multi.totals.support : (result?.totals.support ?? 0)), tone: 'text-cyan-300' },
            ].map((k) => (
              <div key={k.label} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k.label}</div>
                <div className={'text-xl font-black mt-1 ' + k.tone}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Sayfa bazli ozet */}
          {multi && multi.sheets.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 text-xs font-bold text-white">
                Sayfa Bazlı Özet
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Sayfa</th>
                      <th className="px-4 py-3">Dönem</th>
                      <th className="px-4 py-3 text-center">Satır</th>
                      <th className="px-4 py-3 text-center">Toplam</th>
                      <th className="px-4 py-3 text-center">QA</th>
                      <th className="px-4 py-3 text-center">Support</th>
                      <th className="px-4 py-3 text-center">Hakem</th>
                      <th className="px-4 py-3 text-center">Uyarı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {multi.sheets.map((s) => (
                      <tr key={s.name} className="hover:bg-slate-800/20">
                        <td className="px-4 py-3 text-xs font-bold text-slate-200">{s.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-mono text-emerald-400">
                            {s.period ? periodLabel(s.period) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-200">{s.results.length}</td>
                        <td className="px-4 py-3 text-center text-xs font-black text-emerald-300">{s.totals.base}</td>
                        <td className="px-4 py-3 text-center text-xs font-black text-emerald-300">
                          {fmt(s.totals.qa)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-cyan-300">
                          {fmt(s.totals.support)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-200">{s.totals.referee}</td>
                        <td className="px-4 py-3 text-center text-xs">
                          {s.warnings.length > 0 ? (
                            <span className="text-amber-400 font-bold">{s.warnings.length}</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {multi.skipped.length > 0 &&
                      multi.skipped.map((s) => (
                        <tr key={'skip-' + s.name} className="bg-rose-500/5">
                          <td className="px-4 py-3 text-xs font-bold text-rose-300">{s.name}</td>
                          <td className="px-4 py-3 text-[11px] text-slate-500" colSpan={7}>
                            Atlandı: {s.reason}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">İşlenmiş Veri Önizleme</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {multi
                    ? 'Her satır kendi sayfa döneminde kaydedilir · Toplam ve QA yeniden hesaplandı'
                    : 'Dönem: '}
                  {!multi && (
                    <span className="font-mono text-emerald-400">{effectivePeriod}</span>
                  )}
                  {!multi && ' · Toplam ve QA panelde yeniden hesaplandı'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={doWrite}
                  disabled={busy !== ''}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-40"
                >
                  {busy === 'write' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Tabloya Geri Yaz
                </button>
                <button
                  onClick={doImport}
                  disabled={busy !== '' || activeRows.length === 0}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Panele Aktar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Satır</th>
                    {multi && <th className="px-4 py-3">Sayfa</th>}
                    {multi && <th className="px-4 py-3">Dönem</th>}
                    <th className="px-4 py-3">Üye</th>
                    <th className="px-4 py-3">Kod</th>
                    <th className="px-4 py-3 text-center">Katılım</th>
                    <th className="px-4 py-3 text-center">Hata</th>
                    <th className="px-4 py-3 text-center">Öneri</th>
                    <th className="px-4 py-3 text-center">Toplam</th>
                    <th className="px-4 py-3 text-center">QA</th>
                    <th className="px-4 py-3 text-center">Support</th>
                    <th className="px-4 py-3 text-center">Hakem</th>
                    <th className="px-4 py-3">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeRows.slice(0, previewLimit).map((r: SheetRow) => (
                    <tr
                      key={(r.sheet ?? '') + '-' + r.excelRow}
                      className="hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-500">{r.excelRow}</td>
                      {multi && (
                        <td className="px-4 py-3 text-[11px] text-slate-400 truncate max-w-[140px]">
                          {r.sheet ?? '—'}
                        </td>
                      )}
                      {multi && (
                        <td className="px-4 py-3 text-[11px] font-mono text-emerald-400 whitespace-nowrap">
                          {r.period ? periodLabel(r.period) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs font-semibold text-slate-100">{r.name}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-indigo-400">{r.tagId}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-200">{r.testParticipation}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-200">{r.bugReports}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-200">{r.suggestions}</td>
                      <td className="px-4 py-3 text-center text-xs font-black text-emerald-300">{r.base}</td>
                      <td className="px-4 py-3 text-center text-xs font-black text-emerald-300">
                        {fmt(r.qa)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-cyan-300">{fmt(r.support)}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-200">{r.referee}</td>
                      <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{r.detailsText || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activeRows.length > previewLimit && (
              <div className="p-3 border-t border-slate-800 text-center">
                <button
                  onClick={() => setPreviewLimit((n) => n + 25)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  Daha fazla göster ({activeRows.length - previewLimit} satır kaldı)
                </button>
              </div>
            )}
          </div>


          {/* Uyarilar */}
          {activeWarnings.length > 0 && (
            <div className="bg-slate-900/40 border border-amber-500/20 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                İşleme Notları ({activeWarnings.length})
              </h3>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {activeWarnings.slice(0, 100).map((w, i) => (
                  <div
                    key={i}
                    className={
                      'flex items-start gap-2 text-[11px] p-2 rounded-lg border ' +
                      (w.level === 'warn'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400')
                    }
                  >
                    <span className="font-mono shrink-0">
                      {w.sheet ? w.sheet + '·' : ''}S{w.row}
                    </span>
                    <span className="break-words">{w.message}</span>
                  </div>
                ))}
              </div>
              {activeWarnings.length > 100 && (
                <p className="text-[10px] text-slate-500 mt-2">
                  İlk 100 kayıt gösteriliyor ({activeWarnings.length} toplam).
                </p>
              )}
            </div>
          )}

          <div className="text-[11px] text-slate-500 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Panele aktarırken tabloda olmayan Discord (timeout/ban/silme) ve hakem günlük kırılımları
              <b> mevcut kayıttan korunur</b>, bozulmaz. Yeni üyeler "panel girişi" olmadan eklenir —
              giriş bilgilerini Üye Listesi'nden tanımlayabilirsiniz.
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default SheetsView;

