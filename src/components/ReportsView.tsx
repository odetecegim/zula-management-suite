import React, { useState } from 'react';
import { Search, Download, FileSpreadsheet, Trophy, Medal, Flame, Calculator, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { currentPeriod, lastPeriods, periodLabel, calculateScore, scoreBreakdown, qaBaseTotal, QA_BASE_MULTIPLIER } from '../lib/time';
import { ACADEMY_ROLES, REFEREE_ROLES, performanceMembers } from '../lib/roles';
import { playerIdCompare } from '../lib/member-sort';
import type { Member, Performance } from '../types';

interface ReportsPageProps {
  members: Member[];
  performances: Performance[];
}

type Scope = 'all' | 'academy' | 'referee';

interface ReportRow {
  member: Member;
  perf: Performance | null;
  score: number;
  testDays: number;
  bugReports: number;
  suggestions: number;
  base: number; // Katılım + Hata + Öneri
  qa: number; // Toplam x 1000
  support: number;
  refereeMatches: number;
  qaReviews: number;
  discordActions: number;
  managerScore: number;
}

export const ReportsView: React.FC<ReportsPageProps> = ({ members, performances }) => {
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [detail, setDetail] = useState<ReportRow | null>(null);

  const inScope = (m: Member) => {
    if (scope === 'academy') return ACADEMY_ROLES.includes(m.role);
    if (scope === 'referee') return REFEREE_ROLES.includes(m.role);
    return true;
  };

  const rows: ReportRow[] = performanceMembers(members)
    .filter((m) => m.status !== 'Pasif' && inScope(m))
    .filter((m) => {
      const q = searchTerm.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.gameNickname.toLowerCase().includes(q) ||
        m.tagId.toLowerCase().includes(q)
      );
    })
    .map((m) => {
      const perf = performances.find((p) => p.memberId === m.id && p.period === period) ?? null;
      const base = qaBaseTotal(
        perf ?? { testParticipation: 0, bugReports: 0, suggestions: 0 }
      );
      return {
        member: m,
        perf,
        score: perf ? calculateScore(perf) : 0,
        testDays: perf?.testParticipation ?? 0,
        bugReports: perf?.bugReports ?? 0,
        suggestions: perf?.suggestions ?? 0,
        base,
        qa: base * QA_BASE_MULTIPLIER,
        support: perf?.supportPoints ?? 0,
        refereeMatches: perf?.refereeMatches ?? 0,
        qaReviews: perf?.qaReviews ?? 0,
        discordActions: perf?.discordActions ?? 0,
        managerScore: perf?.managerScore ?? 0,
      };
    });

  // SIRA (medal) kolonu PUANA gore hesaplanir; satir sirasi ise uye koduna.
  // Boylece "ZULA-001" ustte olurken siralama numarasi yine performansi yansitir.
  const rankByMember = new Map<string, number>();
  [...rows]
    .sort((a, b) => b.score - a.score)
    .forEach((r, i) => rankByMember.set(r.member.id, i + 1));

  // Ortak siralama kurali: OYUNCU MEMBER ID > kullanici adi > isim soyisim > puan
  // DIKKAT: ilk alan paneldeki "Uye Kodu" (ZULA-001) degil,
  // oyundaki gercek sayisal uye numarasidir.
  rows.sort((a, b) => {
    const m = playerIdCompare(a.member.playerId ?? '', b.member.playerId ?? '');
    if (m !== 0) return m;
    const u = (a.member.username || '').localeCompare(b.member.username || '', 'tr', { numeric: true });
    if (u !== 0) return u;
    const f = a.member.fullName.localeCompare(b.member.fullName, 'tr');
    if (f !== 0) return f;
    return b.score - a.score;
  });

  const maxScore = rows.length > 0 ? Math.max(...rows.map((r) => r.score), 1) : 1;
  const withData = rows.filter((r) => r.perf).length;
  const totalBugs = rows.reduce((s, r) => s + r.bugReports, 0);
  const baseName = 'Zula_Performans_' + period;

  const exportExcel = () => {
    const ranking = rows.map((r) => ({
      Sıra: rankByMember.get(r.member.id) ?? 0,
      'Üye Kodu': r.member.tagId,
      'Ad Soyad': r.member.fullName,
      'Oyun Nick': r.member.gameNickname,
      Oyun: r.member.game,
      Bölge: r.member.region,
      Rol: r.member.role,
      Dönem: periodLabel(period),
      'Test Katılımı': r.testDays,
      'Hata Bildirimi': r.bugReports,
      'Öneri Bildirimi': r.suggestions,
      Toplam: r.base,
      'QA Puanı': r.qa,
      Support: r.support,
      'Hakem Performansı': r.refereeMatches,
      'Discord İşlemleri': r.discordActions,
      'Yönetici Puanı': r.managerScore,
      'Genel Puan': r.score,
    }));
    const wsRank = XLSX.utils.json_to_sheet(ranking);
    wsRank['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
      { wch: 12 },
    ];

    const detailRows: Record<string, string | number>[] = [];
    rows.forEach((r) => {
      if (!r.perf) return;
      scoreBreakdown(r.perf).forEach((line) => {
        detailRows.push({
          'Üye Kodu': r.member.tagId,
          'Ad Soyad': r.member.fullName,
          Dönem: periodLabel(period),
          Kalem: line.label,
          Açıklama: line.detail,
          Puan: line.points,
        });
      });
    });
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    wsDetail['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 10 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsRank, 'Sıralama');
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Puan Dökümü');
    XLSX.writeFile(wb, baseName + '.xlsx');
  };

  const exportCsv = () => {
    const header =
      'Sira,Uye Kodu,Ad Soyad,Oyun Nick,Oyun,Bolge,Donem,Test Katilimi,Hata Bildirimi,Oneri Bildirimi,Toplam,QA Puani,Support,Hakem Performansi,Discord Islemleri,Yonetici Puani,Genel Puan';
    const lines = rows.map((r) =>
      [
        rankByMember.get(r.member.id) ?? 0,
        r.member.tagId,
        '"' + r.member.fullName + '"',
        r.member.gameNickname,
        r.member.game,
        r.member.region,
        periodLabel(period),
        r.testDays,
        r.bugReports,
        r.suggestions,
        r.base,
        r.qa,
        r.support,
        r.refereeMatches,
        r.discordActions,
        r.managerScore,
        r.score,
      ].join(',')
    );
    const blob = new Blob(['\ufeff' + header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = baseName + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const medalFor = (idx: number) => {
    if (idx === 0) return <Trophy className="w-4 h-4 text-amber-400" />;
    if (idx === 1) return <Medal className="w-4 h-4 text-slate-300" />;
    if (idx === 2) return <Medal className="w-4 h-4 text-amber-700" />;
    return <span className="text-[11px] text-slate-500 font-mono w-4 text-center">{idx + 1}</span>;
  };

  const scopeOptions: { id: Scope; label: string }[] = [
    { id: 'all', label: 'Tüm Ekip' },
    { id: 'academy', label: 'Akademi' },
    { id: 'referee', label: 'Hakem' },
  ];

  return (
    <div className="space-y-6">
      {/* Baslik + filtreler */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Performans Raporları</h2>
            <p className="text-xs text-slate-400">
              {periodLabel(period)} dönemi · {rows.length} üye · {withData} kayıtlı · {totalBugs} hata raporu
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel (.xlsx)
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {scopeOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setScope(opt.id)}
                className={
                  'px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ' +
                  (scope === opt.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
          >
            {lastPeriods(12).map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Üye ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>


      {/* Siralama tablosu */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto scroll-thin table-scroll-hint">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-4">Sıra</th>
                <th className="px-4 py-4">Member</th>
                <th className="px-4 py-4">İsim</th>
                <th className="px-4 py-4">Takma ad</th>
                <th className="px-4 py-4 text-center">* Test Katılımı</th>
                <th className="px-4 py-4 text-center">→ Hata Bildirimi</th>
                <th className="px-4 py-4 text-center">Öneri Bildirimi</th>
                <th className="px-4 py-4 text-center">Toplam</th>
                <th className="px-4 py-4 text-center text-emerald-400">Detay</th>
                <th className="px-4 py-4 text-center">Support</th>
                <th className="px-4 py-4 text-center">Hakem Performans</th>
                <th className="px-4 py-4 text-center text-emerald-400">QA</th>
                <th className="px-4 py-4 text-center">Discord PC</th>
                <th className="px-4 py-4 text-center">Kanaat</th>
                <th className="px-4 py-4 text-right">Toplam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-5 py-12 text-center text-slate-500 text-xs">
                    Bu kriterlere uygun kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.member.id}
                  onClick={() => r.perf && setDetail(r)}
                  className={
                    'transition-colors ' +
                    (r.perf ? 'hover:bg-slate-800/30 cursor-pointer' : 'hover:bg-slate-800/20')
                  }
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">{medalFor((rankByMember.get(r.member.id) ?? 0) - 1)}</div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs font-bold text-slate-200">
                    {r.member.playerId || '—'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-100 text-xs flex items-center gap-2">
                      {r.member.fullName}
                      {!r.perf && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          KAYIT YOK
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[11px] text-indigo-400">{r.member.gameNickname}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.testDays}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.bugReports}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.suggestions}</td>
                  <td className="px-4 py-4 text-center text-xs font-black text-emerald-300">{r.base}</td>
                  <td className="px-4 py-4 text-center text-xs font-black text-emerald-300">
                    {r.qa.toLocaleString('tr-TR')}
                  </td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.support}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.refereeMatches}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.qaReviews}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.discordActions}</td>
                  <td className="px-4 py-4 text-center text-xs font-bold text-slate-200">{r.managerScore}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 hidden sm:block h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                          style={{ width: Math.round((r.score / maxScore) * 100) + '%' }}
                        />
                      </div>
                      <span className="text-sm font-black text-indigo-300">{r.score.toLocaleString('tr-TR')}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Flame className="w-3.5 h-3.5 text-amber-500" />
        Detay için bir satıra tıklayın — puan kalemleri ayrıntılı açılır.
      </div>


      {/* Puan dokumu modali */}
      {detail && detail.perf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-full-mobile">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-indigo-400" />
                  {detail.member.fullName}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {periodLabel(period)} · {detail.member.tagId} · {detail.member.game}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto">
              {scoreBreakdown(detail.perf).map((line) => {
                const kind = line.kind ?? 'score';
                return (
                  <div
                    key={line.label}
                    className={
                      'flex items-center justify-between gap-3 p-2.5 rounded-xl border ' +
                      (kind === 'total'
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : kind === 'base'
                        ? 'bg-slate-950/60 border-slate-800/60'
                        : 'bg-indigo-500/5 border-indigo-500/20')
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200">
                        {line.label}
                        {kind === 'total' && (
                          <span className="ml-1.5 text-[8px] font-black uppercase text-emerald-400">Toplam</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">{line.detail}</div>
                    </div>
                    <div
                      className={
                        'text-xs font-black ' +
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
              {detail.perf.notes && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Dönem Notu</div>
                  <div className="text-xs text-slate-300">{detail.perf.notes}</div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">Genel Puan</span>
              <span className="text-lg font-black text-indigo-300">{detail.score.toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;

