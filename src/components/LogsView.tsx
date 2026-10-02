import React, { useState } from 'react';
import { Search, ScrollText, User, Clock, TrendingUp } from 'lucide-react';
import type { ActivityLog, Member } from '../types';

interface LogsProps {
  logs: ActivityLog[];
  members: Member[];
}

const CATEGORY_STYLE: Record<ActivityLog['category'], string> = {
  System: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  User: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  Performance: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  Role: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
};

const CATEGORY_LABEL: Record<ActivityLog['category'], string> = {
  System: 'Sistem',
  User: 'Kullanıcı',
  Performance: 'Performans',
  Role: 'Rol',
};

export const LogsView: React.FC<LogsProps> = ({ logs, members }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState<'all' | ActivityLog['category']>('all');
  const [actor, setActor] = useState<string>('all');

  // En yeni kayit en ustte: once zaman damgasina gore, esitse
  // id'ye gore azalan sirala. Onceki surum yalnizca id'ye bakiyordu;
  // ornek (tohum) kayitlar gercek islemlerin ustune cikiyordu.
  const parseTs = (ts: string): number => {
    const m = ts.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (!m) return 0;
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
  };
  const sorted = [...logs].sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp) || (a.id < b.id ? 1 : -1));

  // Islem yapan benzersiz kullanicilar
  const actors = Array.from(new Set(sorted.map((l) => l.actor))).sort((a, b) =>
    a.localeCompare(b, 'tr-TR')
  );

  const filtered = sorted.filter((log) => {
    if (category !== 'all' && log.category !== category) return false;
    if (actor !== 'all' && log.actor !== actor) return false;
    const q = searchTerm.toLowerCase();
    const target = members.find((m) => m.id === log.memberId);
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor.toLowerCase().includes(q) ||
      (target && (target.fullName.toLowerCase().includes(q) || target.gameNickname.toLowerCase().includes(q)))
    );
  });

  const countBy = (cat: ActivityLog['category']) => sorted.filter((l) => l.category === cat).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-400" />
            Sistem Kayıtları
          </h2>
          <p className="text-xs text-slate-400">Panelde yapılan tüm işlemlerin geçmişi ({filtered.length} kayıt)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="İşlem, kullanıcı veya üye ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as 'all' | ActivityLog['category'])}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Tüm Kategoriler</option>
            <option value="System">Sistem</option>
            <option value="User">Kullanıcı</option>
            <option value="Performance">Performans</option>
            <option value="Role">Rol</option>
          </select>
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 outline-none focus:border-indigo-500 cursor-pointer max-w-[200px]"
          >
            <option value="all">Tüm İşlemi Yapanlar</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {(category !== 'all' || actor !== 'all' || searchTerm !== '') && (
            <button
              onClick={() => {
                setCategory('all');
                setActor('all');
                setSearchTerm('');
              }}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer px-2"
            >
              Filtreleri sıfırla
            </button>
          )}
        </div>
      </div>

      {/* Kategori ozeti */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['System', 'User', 'Performance', 'Role'] as ActivityLog['category'][]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(category === cat ? 'all' : cat)}
            className={
              'p-3 rounded-2xl border text-left transition-all cursor-pointer ' +
              (category === cat ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700')
            }
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <TrendingUp className="w-3 h-3" />
              {CATEGORY_LABEL[cat]}
            </div>
            <div className="text-xl font-black text-white mt-1">{countBy(cat)}</div>
          </button>
        ))}
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Aramanıza uygun kayıt bulunamadı.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filtered.map((log) => {
              const target = members.find((m) => m.id === log.memberId);
              return (
                <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-slate-800/20 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{log.actor}</span>
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full border ' + CATEGORY_STYLE[log.category]}>
                        {CATEGORY_LABEL[log.category]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed break-words">{log.action}</p>
                    {target && (
                      <p className="text-[11px] text-indigo-400/80 mt-0.5">
                        İlgili üye: {target.fullName} ({target.tagId})
                      </p>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 font-mono shrink-0">
                    <Clock className="w-3 h-3" />
                    {log.timestamp}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

