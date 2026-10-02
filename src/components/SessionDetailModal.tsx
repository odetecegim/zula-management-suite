import React, { useMemo, useState } from 'react';
import {
  Users, Bug, Plus, Trash2, X, Search,
  AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import type {
  Member, TestSession, SessionBug, SeverityType, BugStatusType,
} from '../types';

interface Props {
  session: TestSession;
  members: Member[];
  readOnly: boolean;
  onClose: () => void;
  /** Kalici guncelleme: App.tsx'teki handleUpdateSession */
  onUpdate: (patch: Partial<TestSession>) => void;
}

const SEVERITIES: SeverityType[] = ['Düşük', 'Orta', 'Yüksek', 'Kritik'];
const BUG_STATUSES: BugStatusType[] = ['Açık', 'İnceleniyor', 'Çözüldü'];

const SEVERITY_STYLE: Record<SeverityType, string> = {
  'Düşük': 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  'Orta': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  'Yüksek': 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  'Kritik': 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const BUG_STATUS_STYLE: Record<BugStatusType, string> = {
  'Açık': 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  'İnceleniyor': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  'Çözüldü': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

/**
 * Katilimcilarin LISESI yoksa (eski kayitlarda) sayiya dusulur.
 * Boylece "0 Katılımcı | 0 Hata" kartlari da dogru calisir.
 */
export function sessionParticipantIds(s: TestSession): string[] {
  if (Array.isArray(s.participants)) return s.participants;
  return [];
}

export function sessionBugList(s: TestSession): SessionBug[] {
  return Array.isArray(s.bugs) ? s.bugs : [];
}

export const SessionDetailModal: React.FC<Props> = ({
  session, members, readOnly, onClose, onUpdate,
}) => {
  const [tab, setTab] = useState<'participants' | 'bugs'>('participants');

  const participantIds = sessionParticipantIds(session);
  const bugs = sessionBugList(session);

  // Katilimci ekleme aramasi
  const [query, setQuery] = useState('');
  const openPicker = query.trim().length > 0;

  // Yeni hata formu
  const [bugTitle, setBugTitle] = useState('');
  const [bugReporter, setBugReporter] = useState('');
  const [bugSeverity, setBugSeverity] = useState<SeverityType>('Orta');
  const [bugNotes, setBugNotes] = useState('');

  const memberOf = (id: string) => members.find((m) => m.id === id);

  const patchParticipants = (next: string[]) => {
    onUpdate({
      participants: next,
      participantsCount: next.length,
    });
  };

  const addParticipant = (id: string) => {
    if (readOnly) return;
    if (participantIds.includes(id)) return;
    patchParticipants([...participantIds, id]);
    setQuery('');
  };

  const removeParticipant = (id: string) => {
    if (readOnly) return;
    patchParticipants(participantIds.filter((x) => x !== id));
  };

  const patchBugs = (next: SessionBug[]) => {
    onUpdate({
      bugs: next,
      reportedBugs: next.length,
    });
  };

  const addBug = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const title = bugTitle.trim();
    if (!title) return;
    patchBugs([
      ...bugs,
      {
        id: 'bug-' + Date.now(),
        title,
        reporterId: bugReporter || undefined,
        severity: bugSeverity,
        status: 'Açık',
        date: new Date().toISOString().split('T')[0],
        notes: bugNotes.trim() || undefined,
      },
    ]);
    setBugTitle('');
    setBugReporter('');
    setBugNotes('');
    setBugSeverity('Orta');
  };

  const setBugField = (id: string, patch: Partial<SessionBug>) => {
    if (readOnly) return;
    patchBugs(bugs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBug = (id: string) => {
    if (readOnly) return;
    patchBugs(bugs.filter((b) => b.id !== id));
  };

  // Katilimci adaylari: arip sonucu, kayitli olmayanlar
  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return members
      .filter((m) => !participantIds.includes(m.id))
      .filter((m) =>
        !q ||
        m.fullName.toLocaleLowerCase('tr-TR').includes(q) ||
        m.gameNickname.toLocaleLowerCase('tr-TR').includes(q) ||
        m.tagId.toLocaleLowerCase('tr-TR').includes(q)
      )
      .slice(0, 8);
  }, [members, participantIds, query]);

  const openBugs = bugs.filter((b) => b.status !== 'Çözüldü').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Baslik */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                {session.version}
              </span>
              <span
                className={
                  'text-[11px] font-semibold px-2 py-1 rounded-lg border ' +
                  (session.status === 'Tamamlandı'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : session.status === 'Devam Ediyor'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700')
                }
              >
                {session.status}
              </span>
              {readOnly && (
                <span className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-amber-500/10 text-amber-300 border-amber-500/30">
                  Salt Okunur
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white mt-2 leading-snug">{session.title}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {session.game} · {session.date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sekmeler */}
        <div className="px-5 pt-4 flex items-center gap-2 border-b border-slate-800">
          <button
            onClick={() => setTab('participants')}
            className={
              'flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors cursor-pointer ' +
              (tab === 'participants'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-500 hover:text-slate-300')
            }
          >
            <Users className="w-4 h-4" />
            Katılımcılar
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300">
              {participantIds.length}
            </span>
          </button>
          <button
            onClick={() => setTab('bugs')}
            className={
              'flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors cursor-pointer ' +
              (tab === 'bugs'
                ? 'border-rose-400 text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-300')
            }
          >
            <Bug className="w-4 h-4" />
            Hatalar
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300">
              {bugs.length}
            </span>
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'participants' && (


            <div className="space-y-4">
              {/* Katilimci ekleme */}
              {!readOnly && (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Üye ara ve ekle (ad, nick veya ZULA-001)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                  />
                  {openPicker && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                      {candidates.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-500">
                          Eslesen veya katilmayan uye yok.
                        </div>
                      ) : (
                        candidates.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => addParticipant(m.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-indigo-500/10 transition-colors cursor-pointer border-b border-slate-900 last:border-b-0"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-slate-200 truncate">
                                {m.fullName}
                              </span>
                              <span className="block text-[11px] text-slate-500 truncate">
                                {m.gameNickname} · {m.tagId} · {m.region}
                              </span>
                            </span>
                            <Plus className="w-4 h-4 text-indigo-400 shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Katilimci listesi */}
              {participantIds.length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-2xl p-10 text-center">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-300">Henuz katilimci yok</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {readOnly
                      ? 'Bu oturum icin katilimci kaydedilmemis.'
                      : 'Yukaridaki arama alanindan uye secerek ekleyin.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {participantIds.map((id) => {
                    const m = memberOf(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800"
                      >
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-[11px] shrink-0">
                          {m
                            ? m.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                            : '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-200 truncate">
                            {m ? m.fullName : 'Bilinmeyen uye'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {m ? `${m.gameNickname} · ${m.tagId} · ${m.region}` : id}
                          </div>
                        </div>
                        {!readOnly && (
                          <button
                            onClick={() => removeParticipant(id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
                            title="Katilimcilikten cikar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'bugs' && (

            <div className="space-y-4">
              {/* Durum ozeti */}
              <div className="grid grid-cols-3 gap-3">
                {BUG_STATUSES.map((st) => {
                  const n = bugs.filter((b) => b.status === st).length;
                  return (
                    <div
                      key={st}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center"
                    >
                      <div
                        className={
                          'text-lg font-black ' +
                          (st === 'Açık' ? 'text-rose-400' : st === 'İnceleniyor' ? 'text-amber-400' : 'text-emerald-400')
                        }
                      >
                        {n}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {st}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Yeni hata formu */}
              {!readOnly && (
                <form
                  onSubmit={addBug}
                  className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Bug className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                      Yeni Hata Bildir
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Hata Başlığı *
                    </label>
                    <input
                      type="text"
                      required
                      value={bugTitle}
                      onChange={(e) => setBugTitle(e.target.value)}
                      placeholder="Orn: Ses ayarlarinda oyunu cark edince donma"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Bildiren
                      </label>
                      <select
                        value={bugReporter}
                        onChange={(e) => setBugReporter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
                      >
                        <option value="">— Belirtilmedi —</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName} ({m.tagId})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Önem
                      </label>
                      <select
                        value={bugSeverity}
                        onChange={(e) => setBugSeverity(e.target.value as SeverityType)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Tarih
                      </label>
                      <input
                        type="date"
                        disabled
                        value={new Date().toISOString().split('T')[0]}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Not / Tekrar Adımları
                    </label>
                    <textarea
                      rows={2}
                      value={bugNotes}
                      onChange={(e) => setBugNotes(e.target.value)}
                      placeholder="Hangi adimlar izlenince oluyor, beklenen/gerceklesen davranis..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!bugTitle.trim()}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-rose-600/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Bildiriyi Kaydet
                  </button>
                </form>
              )}

              {/* Hata listesi */}
              {bugs.length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-2xl p-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-300">Hata bildirilmemis</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Bu oturum icin su ana kadar hata kaydi yok.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bugs.map((b) => {
                    const reporter = b.reporterId ? memberOf(b.reporterId) : null;
                    return (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-100 break-words">
                              {b.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span
                                className={
                                  'text-[10px] font-bold px-2 py-0.5 rounded-full border ' +
                                  SEVERITY_STYLE[b.severity]
                                }
                              >
                                {b.severity}
                              </span>
                              <span
                                className={
                                  'text-[10px] font-bold px-2 py-0.5 rounded-full border ' +
                                  BUG_STATUS_STYLE[b.status]
                                }
                              >
                                {b.status}
                              </span>
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {b.date}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Bildiren:{' '}
                                <span className="text-slate-400">
                                  {reporter ? `${reporter.fullName} (${reporter.tagId})` : 'Belirtilmemis'}
                                </span>
                              </span>
                            </div>
                            {b.notes && (
                              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed break-words whitespace-pre-wrap">
                                {b.notes}
                              </p>
                            )}
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => removeBug(b.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
                              title="Kaydi sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {!readOnly && (
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                            <span className="text-[10px] text-slate-500">Durum:</span>
                            <div className="flex gap-1.5">
                              {BUG_STATUSES.map((st) => (
                                <button
                                  key={st}
                                  onClick={() => setBugField(b.id, { status: st })}
                                  className={
                                    'text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ' +
                                    (b.status === st
                                      ? BUG_STATUS_STYLE[st]
                                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300')
                                  }
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alt bilgi ozeti */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span className="font-bold text-slate-300">{participantIds.length}</span> katılımcı
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-bold text-slate-300">{openBugs}</span> açık hata
              <span className="text-slate-600">/ {bugs.length} toplam</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
