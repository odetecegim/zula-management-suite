import React, { useState } from 'react';
import {
  Search, Plus, Minus, Save, X, TestTube2, Bug, Lightbulb, Gavel, FileCheck,
  MessageSquareText, Star, StickyNote, Calculator, Ban, Timer, MessageCircleOff,
  GraduationCap, Scale, Layers, Lock, CheckCircle2, LifeBuoy,
} from 'lucide-react';
import { currentPeriod, lastPeriods, daysInPeriod, periodLabel, calculateScore, scoreBreakdown, qaBaseTotal, QA_BASE_MULTIPLIER } from '../lib/time';
import { canManageMember } from '../lib/roles';
import { sortMembers } from '../lib/member-sort';
import type { Member, Performance, PerfEntry, RefPerfEntry } from '../types';

export type LogFn = (
  action: string,
  category: 'User' | 'Performance' | 'Role' | 'System',
  memberId?: string
) => void;

interface PerformanceProps {
  members: Member[];
  performances: Performance[];
  /** Bolum erisimi olan herkes icin temel duzenleme izni */
  canEdit: boolean;
  /** Giris yapan kullanici: rol hiyerarsisi icin */
  currentUser?: Member | null;
  onSavePerformance: (perf: Performance) => void;
  onLog?: LogFn;
}

export const EMPTY_PERF = (memberId: string, period: string): Performance => ({
  memberId,
  period,
  testParticipation: 0,
  testDays: [],
  bugReports: 0,
  suggestions: 0,
  refereeMatches: 0,
  refereeDays: [],
  qaReviews: 0,
  discordActions: 0,
  managerScore: 0,
  notes: '',
  participationEntries: [],
  participationDetails: '',
  refereeEntries: [],
  refereeEveryoneX: 0,
  refereeSabotage: 0,
  discordTimeout: 0,
  discordBan: 0,
  discordMessageDelete: 0,
  managerOpinion: 0,
  supportPoints: 0,
});

// Eski localStorage kayitlarinda eksik alanlari tamamlar
export function normalizePerf(p: Performance): Performance {
  return { ...EMPTY_PERF(p.memberId, p.period), ...p };
}

const PERIOD_OPTIONS = lastPeriods(12);

function NumInput(props: {
  label: string;
  value: number;
  min: number;
  /** max verilmezse sınır yoktur (admin puanlaması gibi) */
  max?: number;
  onChange: (v: number) => void;
  icon: React.ReactNode;
  hint?: string;
  disabled: boolean;
}) {
  const { label, value, min, max, onChange, icon, hint, disabled } = props;
  const clamp = (v: number) => Math.max(min, max === undefined ? v : Math.min(max, v));
  const atMax = max !== undefined && value >= max;
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 text-slate-300">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isNaN(v)) return;
            onChange(clamp(v));
          }}
          className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-white outline-none focus:border-indigo-500 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled || atMax}
          onClick={() => onChange(clamp(value + 1))}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

export const PerformanceView: React.FC<PerformanceProps> = ({
  members,
  performances,
  canEdit: canEditBase,
  currentUser,
  onSavePerformance,
  onLog,
}) => {
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [searchTerm, setSearchTerm] = useState('');
  const [competency, setCompetency] = useState<'ALL' | 'ACADEMY' | 'REFEREE'>('ALL');
  const [draft, setDraft] = useState<Performance | null>(null);
  const [base, setBase] = useState<Performance | null>(null);

  // Hakemlik kaydi girisi
  const [refDay, setRefDay] = useState<number>(1);
  const [refCount, setRefCount] = useState<number>(1);
  const [refType, setRefType] = useState<'EVERYONE' | 'SABOTAGE'>('EVERYONE');

  // Carpanli katilim kaydi girisi
  const [entryDay, setEntryDay] = useState<number>(1);
  const [entryMultiplier, setEntryMultiplier] = useState<number>(1);

  const active = members.filter((m) => m.status !== 'Pasif');

  const filtered = active.filter((m) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      m.fullName.toLowerCase().includes(q) ||
      m.gameNickname.toLowerCase().includes(q) ||
      m.tagId.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (competency === 'ACADEMY') {
      return ['academy_lead', 'academy_member', 'fedai_member'].includes(m.role);
    }
    if (competency === 'REFEREE') {
      return m.role === 'referee_lead';
    }
    return true;
  });

  const perfFor = (memberId: string): Performance => {
    const found = performances.find((p) => p.memberId === memberId && p.period === period);
    return found ? normalizePerf(found) : EMPTY_PERF(memberId, period);
  };

  // Oyuncu siralamasi: uye kodu > kullanici adi > isim soyisim > puanlama
  // Bu tabloda puan, secili donemin YONETICI PUANI'dir.
  const sorted = sortMembers(filtered, (m) => perfFor(m.id).managerScore ?? 0);

  const openEditor = (m: Member) => {
    const current = perfFor(m.id);
    const snapshot: Performance = {
      ...current,
      testDays: [...current.testDays],
      refereeDays: [...(current.refereeDays ?? [])],
      participationEntries: [...(current.participationEntries ?? [])],
      refereeEntries: [...(current.refereeEntries ?? [])],
    };
    setBase(snapshot);
    setDraft({ ...snapshot });
    setRefDay(1);
    setRefCount(1);
    setRefType('EVERYONE');
    setEntryDay(1);
    setEntryMultiplier(1);
  };

  const closeEditor = () => {
    setDraft(null);
    setBase(null);
  };

  const toggleTestDay = (day: number) => {
    if (!draft) return;
    const has = draft.testDays.includes(day);
    const testDays = has
      ? draft.testDays.filter((d) => d !== day)
      : [...draft.testDays, day].sort((a, b) => a - b);
    setDraft({ ...draft, testDays });
  };

  // --- Carpanli katilim serisi ---
  const addParticipationEntry = () => {
    if (!draft) return;
    const day = Math.min(daysInPeriod(period), Math.max(1, entryDay));
    const multiplier = Math.max(1, Math.min(5, entryMultiplier));
    const entries: PerfEntry[] = [
      ...(draft.participationEntries ?? []).filter((e) => e.day !== day),
      { id: 'e-' + Date.now(), day, multiplier },
    ].sort((a, b) => a.day - b.day);
    const details = entries
      .map((e) => String(e.day).padStart(2, '0') + 'x' + e.multiplier)
      .join(', ');
    const total = entries.reduce((s, e) => s + e.multiplier, 0);
    setDraft({
      ...draft,
      participationEntries: entries,
      participationDetails: details,
      testParticipation: Math.min(30, total),
    });
  };

  const removeParticipationEntry = (id: string) => {
    if (!draft) return;
    const entries = (draft.participationEntries ?? []).filter((e) => e.id !== id);
    setDraft({
      ...draft,
      participationEntries: entries,
      participationDetails: entries.map((e) => String(e.day).padStart(2, '0') + 'x' + e.multiplier).join(', '),
      testParticipation: Math.min(30, entries.reduce((s, e) => s + e.multiplier, 0)),
    });
  };


  // Hakemlik toplamlarini yeniden hesaplar (Herkes + Sabotaj + gunluk dagilim)
  const applyRefEntries = (current: Performance, entries: RefPerfEntry[]): Performance => {
    const everyone = entries.filter((e) => e.type === 'EVERYONE').reduce((s, e) => s + e.multiplier, 0);
    const sabotage = entries.filter((e) => e.type === 'SABOTAGE').reduce((s, e) => s + e.multiplier, 0);
    const dayMap = new Map<number, number>();
    entries.forEach((e) => dayMap.set(e.day, (dayMap.get(e.day) ?? 0) + e.multiplier));
    return {
      ...current,
      refereeEntries: entries,
      refereeEveryoneX: everyone,
      refereeSabotage: sabotage,
      refereeMatches: everyone + sabotage,
      refereeDays: Array.from(dayMap.entries())
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day - b.day),
    };
  };

  const addRefEntry = () => {
    if (!draft) return;
    const day = Math.min(daysInPeriod(period), Math.max(1, refDay));
    const count = Math.max(1, Math.min(20, refCount));
    const entries: RefPerfEntry[] = [
      ...(draft.refereeEntries ?? []),
      { id: 'r-' + Date.now(), day, multiplier: count, type: refType },
    ].sort((a, b) => a.day - b.day);
    setDraft(applyRefEntries(draft, entries));
  };

  const removeRefEntry = (id: string) => {
    if (!draft) return;
    const entries = (draft.refereeEntries ?? []).filter((e) => e.id !== id);
    setDraft(applyRefEntries(draft, entries));
  };

  const setDiscordPart = (
    key: 'discordTimeout' | 'discordBan' | 'discordMessageDelete',
    value: number
  ) => {
    if (!draft) return;
    const next = { ...draft, [key]: value } as Performance;
    next.discordActions =
      Number(next.discordTimeout ?? 0) + Number(next.discordBan ?? 0) + Number(next.discordMessageDelete ?? 0);
    setDraft(next);
  };

  const handleSave = () => {
    if (!draft) return;
    // Yetki kontrolu: duzenleme yetkisi yoksa kaydetme
    const target = members.find((m) => m.id === draft.memberId);
    if (!target || !canEditMemberOf(target)) return;
    const label = target ? target.fullName + ' (' + target.tagId + ')' : draft.memberId;

    const saved: Performance = {
      ...draft,
      discordActions:
        Number(draft.discordTimeout ?? 0) + Number(draft.discordBan ?? 0) + Number(draft.discordMessageDelete ?? 0),
    };

    // Alan bazli denetim kaydi ("artirildi/azaltildi" mantigi)
    if (onLog && base) {
      const fields: { key: keyof Performance; label: string }[] = [
        { key: 'testParticipation', label: 'Test Katılımı' },
        { key: 'bugReports', label: 'Hata Bildirimi' },
        { key: 'suggestions', label: 'Öneri' },
        { key: 'refereeEveryoneX', label: 'Hakemlik (Herkes)' },
        { key: 'refereeSabotage', label: 'Hakemlik (Sabotaj)' },
        { key: 'qaReviews', label: 'QA İncelemesi' },
        { key: 'discordTimeout', label: 'Discord Uzaklaştırma' },
        { key: 'discordBan', label: 'Discord Yasaklama' },
        { key: 'discordMessageDelete', label: 'Discord Mesaj Silme' },
        { key: 'managerScore', label: 'Yönetici Puanı' },
        { key: 'managerOpinion', label: 'Yönetici Görüşü' },
        { key: 'supportPoints', label: 'Support' },
      ];
      fields.forEach(({ key, label: fieldLabel }) => {
        const oldVal = Number(base[key] ?? 0);
        const newVal = Number(saved[key] ?? 0);
        if (oldVal !== newVal) {
          const delta = newVal - oldVal;
          onLog(
            label + ' · ' + periodLabel(period) + ' döneminde ' + fieldLabel + ' ' +
              (delta > 0 ? delta + ' artırıldı' : Math.abs(delta) + ' azaltıldı') +
              ' (eski: ' + oldVal + ' → yeni: ' + newVal + ')',
            'Performance',
            draft.memberId
          );
        }
      });
      if (base.notes !== saved.notes) {
        onLog(label + ' · ' + periodLabel(period) + ' dönem notu güncellendi.', 'Performance', draft.memberId);
      }
    }

    onSavePerformance(saved);
    closeEditor();
  };

  const memberName = (id: string) => members.find((m) => m.id === id)?.fullName ?? id;
  const draftScore = draft ? calculateScore(draft) : 0;
  const draftLines = draft ? scoreBreakdown(draft) : [];
  const dayCount = daysInPeriod(period);
  // QA tablosu: Toplam = Katılım + Hata + Öneri ; QA = Toplam x 1000
  const baseTotal = draft ? qaBaseTotal(draft) : 0;
  const qaPoints = baseTotal * QA_BASE_MULTIPLIER;

  // Duzenleme izni: bolum yetkisi + rol hiyerarsisi
  // (kendi kaydi her zaman duzenlenebilir, ust roller duzenlenemez)
  const canEditMemberOf = (m: Member): boolean => {
    if (!canEditBase) return false;
    if (!currentUser) return false;
    if (m.id === currentUser.id) return true;
    return canManageMember(currentUser.role, m.role);
  };

  const draftMember = draft ? (members.find((m) => m.id === draft.memberId) ?? null) : null;
  const canEdit = canEditBase && (draftMember ? canEditMemberOf(draftMember) : false);


  const competencyOptions: { id: 'ALL' | 'ACADEMY' | 'REFEREE'; label: string; icon: React.ReactNode }[] = [
    { id: 'ALL', label: 'Tümü', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'ACADEMY', label: 'Akademi', icon: <GraduationCap className="w-3.5 h-3.5" /> },
    { id: 'REFEREE', label: 'Hakem', icon: <Scale className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Baslik + filtreler */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white">Performans Yönetimi</h2>
          <p className="text-xs text-slate-400">
            Aylık puan, çarpanlı test serisi, hakemlik ve moderasyon kaydı
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {competencyOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setCompetency(opt.id)}
                className={
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ' +
                  (competency === opt.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200')
                }
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Üye ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-44 sm:w-56 bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>


      {/* Uye kartlari */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full bg-slate-900/40 border border-slate-800/80 rounded-2xl p-10 text-center text-xs text-slate-500">
            Bu filtreye uygun üye bulunamadı.
          </div>
        )}
        {sorted.map((m) => {
          const perf = perfFor(m.id);
          const score = calculateScore(perf);
          return (
            <button
              key={m.id}
              onClick={() => openEditor(m)}
              className="text-left bg-slate-900/40 border border-slate-800 rounded-2xl p-4 hover:border-indigo-500/50 transition-all cursor-pointer space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                  {m.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                    {m.fullName}
                    {canEditMemberOf(m) ? (
                      <span title="Kaydı düzenleyebilirsiniz">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      </span>
                    ) : (
                      <span title="Rol seviyeniz yetersiz — salt okunur">
                        <Lock className="w-3 h-3 text-slate-600 shrink-0" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {m.gameNickname} · {m.tagId}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-indigo-400">{score.toLocaleString('tr-TR')}</div>
                  <div className="text-[10px] text-slate-500 uppercase">puan</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-950/60 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-slate-200">{perf.testParticipation}</div>
                  <div className="text-[9px] text-slate-500 uppercase">Test</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-slate-200">{perf.bugReports}</div>
                  <div className="text-[9px] text-slate-500 uppercase">Hata</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-slate-200">{perf.refereeMatches}</div>
                  <div className="text-[9px] text-slate-500 uppercase">Hakem</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-slate-200">{perf.managerScore}</div>
                  <div className="text-[9px] text-slate-500 uppercase">Yön.</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>


      {/* Duzenleme modali */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="text-base font-bold text-white">
                  {memberName(draft.memberId)} · {periodLabel(period)}
                </h3>
                <p className="text-xs text-slate-400">
                  Genel Puan:{' '}
                  <span className="font-black text-indigo-400">{draftScore.toLocaleString('tr-TR')}</span>
                  {!canEdit && <span className="ml-2 text-amber-400">(Salt okunur)</span>}
                </p>
              </div>
              <button
                onClick={closeEditor}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Puan dokumu */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-300 mb-3">
                  <Calculator className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">Puan Dökümü</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {draftLines.map((line) => {
                    const kind = line.kind ?? 'score';
                    return (
                      <div
                        key={line.label}
                        className={
                          'rounded-lg p-2.5 border ' +
                          (kind === 'total'
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : kind === 'base'
                            ? 'bg-slate-900/60 border-slate-800/60'
                            : 'bg-indigo-500/5 border-indigo-500/20')
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="text-[11px] font-semibold text-slate-300">{line.label}</div>
                          {kind === 'total' && (
                            <span className="text-[8px] font-black uppercase text-emerald-400">Toplam</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate" title={line.detail}>
                          {line.detail}
                        </div>
                        <div
                          className={
                            'text-xs font-black mt-1 ' +
                            (kind === 'total'
                              ? 'text-emerald-300'
                              : kind === 'base'
                              ? 'text-slate-400'
                              : line.points > 0
                              ? 'text-indigo-300'
                              : 'text-slate-600')
                          }
                        >
                          {line.points.toLocaleString('tr-TR')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* QA TABLOSU: Toplam = Katılım + Hata + Öneri -> QA = Toplam x 1000 */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300">
                  <Calculator className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">QA Puanlaması</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2 text-slate-300">
                      <TestTube2 className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold">Test Katılımı</span>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-indigo-300">{draft.testParticipation}</div>
                      <div className="text-[10px] text-slate-500">
                        gün · {draft.testDays.length} gün seçili
                      </div>
                    </div>
                  </div>

                  <NumInput
                    label="Hata Bildirimi"
                    value={draft.bugReports}
                    min={0}
                    disabled={!canEdit}
                    icon={<Bug className="w-4 h-4 text-rose-400" />}
                    hint="Adet"
                    onChange={(v) => setDraft({ ...draft, bugReports: v })}
                  />

                  <NumInput
                    label="Öneri Bildirimi"
                    value={draft.suggestions}
                    min={0}
                    disabled={!canEdit}
                    icon={<Lightbulb className="w-4 h-4 text-amber-400" />}
                    hint="Adet"
                    onChange={(v) => setDraft({ ...draft, suggestions: v })}
                  />

                  <div className="bg-slate-950/60 border border-emerald-500/40 rounded-xl p-3 flex flex-col justify-center text-center space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Toplam</div>
                    <div className="text-2xl font-black text-emerald-300">{baseTotal}</div>
                    <div className="text-[10px] text-slate-500">Katılım + Hata + Öneri</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-xs text-emerald-200 font-semibold">
                    QA Puanı = {baseTotal} × {QA_BASE_MULTIPLIER}
                  </div>
                  <div className="text-xl font-black text-emerald-300">
                    {qaPoints.toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>

              {/* Ek puanlar - admin puanlamasında sınır yok */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <NumInput
                  label="Support (sınırsız)"
                  value={draft.supportPoints ?? 0}
                  min={0}
                  disabled={!canEdit}
                  icon={<LifeBuoy className="w-4 h-4 text-cyan-400" />}
                  hint="Birebir eklenir · sınır yok"
                  onChange={(v) => setDraft({ ...draft, supportPoints: v })}
                />
                <NumInput
                  label="Yönetici Puanı (sınırsız)"
                  value={draft.managerScore ?? 0}
                  min={0}
                  disabled={!canEdit}
                  icon={<Star className="w-4 h-4 text-emerald-400" />}
                  hint="Birebir eklenir · sınır yok"
                  onChange={(v) => setDraft({ ...draft, managerScore: v })}
                />
                <NumInput
                  label="Yönetici Görüşü (sınırsız)"
                  value={draft.managerOpinion ?? 0}
                  min={0}
                  disabled={!canEdit}
                  icon={<MessageSquareText className="w-4 h-4 text-purple-400" />}
                  onChange={(v) => setDraft({ ...draft, managerOpinion: v })}
                />
                <NumInput
                  label="QA İncelemesi (adet)"
                  value={draft.qaReviews}
                  min={0}
                  disabled={!canEdit}
                  icon={<FileCheck className="w-4 h-4 text-sky-400" />}
                  onChange={(v) => setDraft({ ...draft, qaReviews: v })}
                />
              </div>


              {/* Test gunleri */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300">
                  Test Katılım Günleri <span className="text-slate-500">({draft.testDays.length} gün seçili)</span>
                </div>
                <div className="grid grid-cols-7 sm:grid-cols-11 gap-1.5">
                  {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
                    const on = draft.testDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleTestDay(day)}
                        className={
                          'h-8 rounded-lg text-[11px] font-bold border transition-all ' +
                          (on
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600') +
                          (canEdit ? ' cursor-pointer' : ' cursor-not-allowed opacity-60')
                        }
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Carpanli katilim serisi */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300">
                  Çarpanlı Katılım Serisi{' '}
                  <span className="text-slate-500">
                    (toplam {(draft.participationEntries ?? []).reduce((s, e) => s + e.multiplier, 0)} gün)
                  </span>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Gün (1-{dayCount})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={dayCount}
                        value={entryDay}
                        onChange={(e) => setEntryDay(Number(e.target.value) || 1)}
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Çarpan</label>
                      <select
                        value={entryMultiplier}
                        onChange={(e) => setEntryMultiplier(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none cursor-pointer"
                      >
                        <option value={1}>x1</option>
                        <option value={2}>x2</option>
                        <option value={3}>x3</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={addParticipationEntry}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Ekle / Güncelle
                    </button>
                    {draft.participationDetails && (
                      <span className="text-[11px] text-slate-500 font-mono">{draft.participationDetails}</span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(draft.participationEntries ?? []).length === 0 && (
                    <span className="text-[11px] text-slate-600 italic">
                      Çarpanlı kayıt yok. (Gün kutucukları doğrudan kullanılabilir.)
                    </span>
                  )}
                  {(draft.participationEntries ?? []).map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex items-center gap-2 text-[11px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-1 rounded-lg"
                    >
                      <TestTube2 className="w-3 h-3" />
                      {entry.day}. gün · x{entry.multiplier}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeParticipationEntry(entry.id)}
                          className="hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>


              {/* Hakemlik (Herkes / Sabotaj) */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300">
                  Hakemlik Kaydı{' '}
                  <span className="text-slate-500">
                    (Herkes {draft.refereeEveryoneX ?? 0} × 2000 · Sabotaj {draft.refereeSabotage ?? 0} × 5000 · toplam{' '}
                    {draft.refereeMatches} maç)
                  </span>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Tür</label>
                      <select
                        value={refType}
                        onChange={(e) => setRefType(e.target.value as 'EVERYONE' | 'SABOTAGE')}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none cursor-pointer"
                      >
                        <option value="EVERYONE">Herkes (ÖTS)</option>
                        <option value="SABOTAGE">Sabotaj</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Gün (1-{dayCount})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={dayCount}
                        value={refDay}
                        onChange={(e) => setRefDay(Number(e.target.value) || 1)}
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Maç adedi</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={refCount}
                        onChange={(e) => setRefCount(Number(e.target.value) || 1)}
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white outline-none text-center"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addRefEntry}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Ekle
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(draft.refereeEntries ?? []).length === 0 && (
                    <span className="text-[11px] text-slate-600 italic">Kayıtlı hakemlik yok.</span>
                  )}
                  {(draft.refereeEntries ?? []).map((entry) => (
                    <span
                      key={entry.id}
                      className={
                        'inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-lg border ' +
                        (entry.type === 'SABOTAGE'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20')
                      }
                    >
                      <Gavel className="w-3 h-3" />
                      {entry.day}. gün · {entry.multiplier} maç · {entry.type === 'SABOTAGE' ? 'Sabotaj' : 'Herkes'}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeRefEntry(entry.id)}
                          className="hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>


              {/* Discord islemleri (agirlikli) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NumInput
                  label="Discord Uzaklaştırma"
                  value={draft.discordTimeout ?? 0}
                  min={0}
                  max={999}
                  disabled={!canEdit}
                  icon={<Timer className="w-4 h-4 text-amber-400" />}
                  hint="Timeout · x25 puan"
                  onChange={(v) => setDiscordPart('discordTimeout', v)}
                />
                <NumInput
                  label="Discord Yasaklama"
                  value={draft.discordBan ?? 0}
                  min={0}
                  max={999}
                  disabled={!canEdit}
                  icon={<Ban className="w-4 h-4 text-rose-400" />}
                  hint="Ban · x25 puan"
                  onChange={(v) => setDiscordPart('discordBan', v)}
                />
                <NumInput
                  label="Discord Mesaj Silme"
                  value={draft.discordMessageDelete ?? 0}
                  min={0}
                  max={999}
                  disabled={!canEdit}
                  icon={<MessageCircleOff className="w-4 h-4 text-blue-400" />}
                  hint="Silme · x10 puan"
                  onChange={(v) => setDiscordPart('discordMessageDelete', v)}
                />
              </div>

              {/* Notlar */}
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> Notlar
                </label>
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Dönem değerlendirmesi..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none disabled:opacity-60"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
              <div className="text-xs text-slate-400">
                Genel Puan: <span className="font-black text-indigo-400">{draftScore.toLocaleString('tr-TR')}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={closeEditor}
                  className="px-5 py-2.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  {canEdit ? 'Vazgeç' : 'Kapat'}
                </button>
                {canEdit && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    Kaydet ({draftScore.toLocaleString('tr-TR')} puan)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceView;

