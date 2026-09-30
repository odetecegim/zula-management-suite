import React from 'react';
import type { Member, TestSession, ActivityLog, Performance, RegionType } from '../types';
import { Users, Bug, CheckCircle, Trophy, Activity, Zap, TrendingUp, AlertTriangle, Globe, MapPin, Crown } from 'lucide-react';
import { calculateScore } from '../lib/time';
import { performanceMembers } from '../lib/roles';

interface DashboardProps {
  members: Member[];
  sessions: TestSession[];
  logs: ActivityLog[];
  performances: Performance[];
  currentUser: Member;
  onSelectTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardProps> = ({
  members,
  sessions,
  logs,
  performances,
  currentUser,
  onSelectTab,
}) => {
  // Şirket kadrosu (yönetim) üyeleri performans istatistiklerine dahil EDILMEZ.
  // Onlar testçi değil yöneticidir; ortalamaya sokmak metriği bozar.
  const statMembers = performanceMembers(members);
  const totalMembers = statMembers.length;
  const activeMembers = statMembers.filter((m) => m.status === 'Aktif').length;
  const totalBugs = statMembers.reduce((acc, curr) => acc + (curr.bugReportsCount || 0), 0);
  const avgScore = totalMembers
    ? Math.round(statMembers.reduce((acc, curr) => acc + curr.participationScore, 0) / totalMembers)
    : 0;

  // Oturum dagilimi - kartlarda SAYIM KULLANILMAZ, veriden hesaplanir.
  const ongoing = sessions.filter((s) => s.status === 'Devam Ediyor').length;
  const completed = sessions.filter((s) => s.status === 'Tamamlandı').length;
  const planned = sessions.filter((s) => s.status === 'Planlandı').length;

  const sessionSummary =
    sessions.length === 0
      ? 'Henüz oturum yok'
      : [
          ongoing > 0 ? `${ongoing} devam ediyor` : '',
          completed > 0 ? `${completed} tamamlandı` : '',
          planned > 0 ? `${planned} planlandı` : '',
        ]
        .filter(Boolean)
        .join(' · ');

  // Katilim seviyesi etiketi de sabit metin degil, puana gore degisir
  const effLevel =
    avgScore >= 90
      ? { text: 'Yüksek verimlilik', cls: 'text-emerald-400' }
      : avgScore >= 70
        ? { text: 'İyi seviye', cls: 'text-indigo-400' }
        : avgScore >= 40
          ? { text: 'Gelişime açık', cls: 'text-amber-400' }
          : { text: 'Düşük', cls: 'text-rose-400' };

  // "En iyi testçiler" siralamasinda da yoneticiler yer almaz
  const topTesters = [...statMembers]
    .sort((a, b) => b.participationScore - a.participationScore)
    .slice(0, 4);

  // --- Ek bolumler: bolge sampiyonlari ve dagilim ---
  const now = new Date();
  const curPeriod = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const curPerfs = performances.filter((p) => p.period === curPeriod);

  const scoreFor = (memberId: string) => {
    const p = curPerfs.find((x) => x.memberId === memberId);
    return p ? calculateScore(p) : 0;
  };

  const scoredMembers = statMembers
    .map((m) => ({ member: m, score: scoreFor(m.id) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const REGIONS: RegionType[] = ['TR', 'EU', 'LATAM'];

  const regionChampions = REGIONS.flatMap((region) => {
    const best = scoredMembers.find((x) => x.member.region === region);
    return best ? [{ region, member: best.member, score: best.score }] : [];
  });

  const gameDistribution = (['Zula PC', 'Zula Strike', 'Wolfteam'] as const)
    .map((game) => ({ label: game, count: statMembers.filter((m) => m.game === game).length }))
    .filter((d) => d.count > 0);
  const maxGameCount = Math.max(1, ...gameDistribution.map((d) => d.count));

  const regionDistribution = REGIONS.map((region) => ({
    label: region,
    count: statMembers.filter((m) => m.region === region).length,
  })).filter((d) => d.count > 0);
  const maxRegionCount = Math.max(1, ...regionDistribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900/60 border border-indigo-500/20 p-6 sm:p-8 backdrop-blur-xl">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Zap className="w-3.5 h-3.5" />
            Zula Test ve Topluluk Yönetim Platformu v2.0
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Hoş Geldiniz,{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              {currentUser.fullName}
            </span>
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            MadByte Akademi, QA Test ekipleri ve hakem heyeti performans göstergeleri aktif olarak izleniyor.
          </p>
        </div>
      </div>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kayıtlı Personel</div>
            <div className="text-2xl font-black text-white mt-1">{totalMembers}</div>
            <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <span>{activeMembers} aktif üye</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Toplam Hata Raporu</div>
            <div className="text-2xl font-black text-white mt-1">{totalBugs}</div>
            <div className={'text-[11px] mt-1 flex items-center gap-1 ' + (totalBugs > 0 ? 'text-indigo-400' : 'text-slate-500')}>
              <span>{totalBugs > 0 ? 'QA ve Akademi Onaylı' : 'Henüz rapor kaydedilmedi'}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Bug className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ortalama Katılım</div>
            <div className="text-2xl font-black text-white mt-1">%{avgScore}</div>
            <div className={'text-[11px] mt-1 flex items-center gap-1 ' + effLevel.cls}>
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{totalMembers === 0 ? 'Veri yok' : effLevel.text}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Oturumları</div>
            <div className="text-2xl font-black text-white mt-1">{sessions.length}</div>
            <div
              className={
                'text-[11px] mt-1 flex items-center gap-1 ' +
                (sessions.length === 0 ? 'text-slate-500' : ongoing > 0 ? 'text-amber-400' : 'text-emerald-400')
              }
            >
              <span>{sessionSummary}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Middle Section: Top Testers & Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Testers */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" />
              En Yüksek Katılımlı Üyeler
            </h3>
            <button
              onClick={() => onSelectTab('members')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
            >
              Tümünü Gör
            </button>
          </div>

          <div className="space-y-3">
            {topTesters.map((t, idx) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/60"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-bold text-xs text-slate-500">#{idx + 1}</span>
                  <div>
                    <div className="text-xs font-bold text-slate-200">{t.fullName}</div>
                    <div className="text-[11px] text-slate-500">{t.gameNickname} ({t.game})</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-indigo-400">%{t.participationScore}</div>
                  <div className="text-[10px] text-slate-500">{t.bugReportsCount} rapor</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Test Sessions */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-indigo-400" />
              Son Test Oturumları
            </h3>
            <button
              onClick={() => onSelectTab('tests')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
            >
              Yönet
            </button>
          </div>

          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">{s.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-1">
                    <span>{s.version}</span>
                    <span>•</span>
                    <span>{s.game}</span>
                    <span>•</span>
                    <span>{s.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      'text-[11px] font-semibold px-2.5 py-1 rounded-lg border ' +
                      (s.status === 'Tamamlandı'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : s.status === 'Devam Ediyor'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700')
                    }
                  >
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bolge Sampiyonlari & Dagilim */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
          <h3 className="font-bold text-white flex items-center gap-2 text-sm mb-4">
            <Crown className="w-4 h-4 text-amber-400" />
            Bölge Şampiyonları
            <span className="text-[10px] font-normal text-slate-500 uppercase tracking-wider">
              {curPeriod} dönemi
            </span>
          </h3>
          {regionChampions.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">
              Bu dönem için performans kaydı bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {regionChampions.map((champ) => (
                <div
                  key={champ.region}
                  className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-950 flex items-center justify-center text-[11px] font-black text-indigo-400 border border-indigo-500/20 shrink-0">
                      {champ.region}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate">{champ.member.fullName}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider truncate">
                        {champ.member.gameNickname}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-black text-indigo-400 shrink-0">
                    {champ.score.toLocaleString('tr-TR')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="font-bold text-white flex items-center gap-2 text-sm mb-3">
              <Globe className="w-4 h-4 text-cyan-400" />
              Oyun Dağılımı
            </h3>
            <div className="space-y-2.5">
              {gameDistribution.map((d) => (
                <div key={d.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400">{d.label}</span>
                    <span className="font-bold text-slate-300">{d.count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                      style={{ width: Math.round((d.count / maxGameCount) * 100) + '%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/60">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm mb-3">
              <MapPin className="w-4 h-4 text-purple-400" />
              Bölge Dağılımı
            </h3>
            <div className="space-y-2.5">
              {regionDistribution.map((d) => (
                <div key={d.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400">{d.label}</span>
                    <span className="font-bold text-slate-300">{d.count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                      style={{ width: Math.round((d.count / maxRegionCount) * 100) + '%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Logs */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
        <h3 className="font-bold text-white flex items-center gap-2 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 text-purple-400" />
          Son Sistem Hareketleri
        </h3>
        <div className="divide-y divide-slate-800/60">
          {logs.map((log) => (
            <div key={log.id} className="py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="font-semibold text-slate-300">{log.actor}</span>
                <span className="text-slate-400">{log.action}</span>
              </div>
              <span className="text-slate-500 text-[11px] font-mono">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

