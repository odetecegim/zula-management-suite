import React, { useState } from 'react';
import type { TestSession, GameType } from '../types';
import { Activity, Plus, Play, CheckCircle2, Calendar, Edit3, Trash2 } from 'lucide-react';

interface TestSessionsProps {
  sessions: TestSession[];
  readOnly?: boolean;
  onAddSession: (session: TestSession) => void;
  onUpdateStatus: (id: string, status: 'Planlandı' | 'Devam Ediyor' | 'Tamamlandı') => void;
  onUpdateSession: (id: string, patch: Partial<TestSession>) => void;
  onDeleteSession: (id: string) => void;
}

const STATUSES: TestSession['status'][] = ['Planlandı', 'Devam Ediyor', 'Tamamlandı'];
const GAMES: GameType[] = ['Zula PC', 'Zula Strike', 'Wolfteam'];

export const TestSessionsView: React.FC<TestSessionsProps> = ({
  sessions,
  readOnly = false,
  onAddSession,
  onUpdateStatus,
  onUpdateSession,
  onDeleteSession,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('v2.16.0');
  const [game, setGame] = useState<GameType>('Zula PC');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<TestSession['status']>('Devam Ediyor');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setVersion('v2.16.0');
    setGame('Zula PC');
    setDate(new Date().toISOString().split('T')[0]);
    setStatus('Devam Ediyor');
    setIsModalOpen(true);
  };

  const openEdit = (s: TestSession) => {
    setEditingId(s.id);
    setTitle(s.title);
    setVersion(s.version);
    setGame((GAMES.includes(s.game) ? s.game : 'Zula PC') as GameType);
    setDate(s.date);
    setStatus(s.status);
    setIsModalOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingId) {
      onUpdateSession(editingId, { title: title.trim(), version, game, date, status });
    } else {
      onAddSession({
        id: 'ts-' + Date.now(),
        title: title.trim(),
        version,
        game,
        date,
        status,
        participantsCount: 0,
        reportedBugs: 0,
      });
    }
    setTitle('');
    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) onDeleteSession(deleteId);
    setDeleteId(null);
  };

  const pendingDelete = sessions.find((s) => s.id === deleteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white">Test Oturumları & Senaryo Takibi</h2>
          <p className="text-xs text-slate-400">Yeni oyun güncellemeleri, harita ve silah test süreçleri</p>
        </div>
        {!readOnly && (
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Yeni Test Başlat
        </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all space-y-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-mono font-bold bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-md border border-indigo-500/20">
                  {s.version}
                </span>
                <span
                  className={
                    'text-[10px] font-bold px-2 py-0.5 rounded-full border ' +
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
              <h3 className="font-bold text-slate-100 text-sm leading-snug">{s.title}</h3>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                <span>🎮 {s.game}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {s.date}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                <span className="font-bold text-slate-200">{s.participantsCount}</span> Katılımcı |{' '}
                <span className="font-bold text-rose-400">{s.reportedBugs}</span> Hata
              </div>

              <div className="flex items-center gap-1">
                {!readOnly && s.status !== 'Devam Ediyor' && (
                  <button
                    onClick={() => onUpdateStatus(s.id, 'Devam Ediyor')}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 cursor-pointer"
                    title="Devam Ediyor Yap"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                {!readOnly && s.status !== 'Tamamlandı' && (
                  <button
                    onClick={() => onUpdateStatus(s.id, 'Tamamlandı')}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 cursor-pointer"
                    title="Tamamlandı Olarak İşaretle"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {!readOnly && (<button
                  onClick={() => openEdit(s)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Düzenle"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>)}
                {!readOnly && (<button
                  onClick={() => setDeleteId(s.id)}
                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                  title="Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              {editingId ? 'Test Oturumunu Düzenle' : 'Yeni Test Oturumu Oluştur'}
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Oturum Başlığı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: V2.16 Silah Dengeleme ve Ağ Gecikme Testi"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Versiyon</label>
                  <input
                    type="text"
                    required
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Hedef Oyun</label>
                  <select
                    value={game}
                    onChange={(e) => setGame(e.target.value as GameType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  >
                    {GAMES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Tarih</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Durum</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TestSession['status'])}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer"
                >
                  {editingId ? 'Kaydet' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Silme onayi */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setDeleteId(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Test oturumu silinsin mi?
            </h3>
            <p className="text-xs text-slate-400">
              <span className="text-slate-200 font-semibold">{pendingDelete?.title}</span> kalıcı olarak
              silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer"
              >
                Evet, sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
