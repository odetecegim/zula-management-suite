import React, { useState } from 'react';
import { ShieldCheck, Plus, Edit3, X, Check, KeyRound, Shield, Users, Trash2, Layers, AlertTriangle, GripVertical, ArrowUp, ArrowDown, Send, Loader2, CheckCircle2, LogIn } from 'lucide-react';
import { ALL_PERMISSIONS } from '../data/initialData';
import { getRoleLevel, roleLevelLabel } from '../lib/roles';
import { testSlackConnection, sendManualMessage, checkSlackToken } from '../lib/slack';
import type { Member, RoleDef, RoleId, PermissionId } from '../types';

/** Slack'in resmi 4 nokta logosu (lucide'de marka ikonu yok). */
const SlackIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.52-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.269a2.528 2.528 0 0 1 2.52 2.522 2.528 2.528 0 0 1-2.52 2.52H2.52V8.833a2.528 2.528 0 0 1 2.522-2.52h2.792zm9.334 9.334a2.528 2.528 0 0 1 2.52 2.52 2.528 2.528 0 0 1-2.52 2.522h-2.52v-2.52a2.528 2.528 0 0 1 2.52-2.522 2.528 2.528 0 0 1 2.52 2.522v-.002zm-1.272 0a2.528 2.528 0 0 1-2.52-2.52 2.528 2.528 0 0 1 2.52-2.52h6.314a2.528 2.528 0 0 1 2.522 2.52 2.528 2.528 0 0 1-2.522 2.52h-6.314zM18.166 5.042a2.528 2.528 0 0 1 2.521-2.52A2.528 2.528 0 0 1 24 5.042a2.527 2.527 0 0 1-2.522 2.52h-2.52V5.042h-.833zm0 1.269a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521v6.314a2.528 2.528 0 0 1 2.521 2.522 2.528 2.528 0 0 1 2.522-2.522V6.31zM8.834 18.166a2.528 2.528 0 0 1 2.522 2.52A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.52-2.522v-2.52h2.52v-.334zm0-1.268a2.528 2.528 0 0 1-2.52-2.522 2.528 2.528 0 0 1 2.52-2.52h6.313a2.528 2.528 0 0 1 2.522 2.52 2.528 2.528 0 0 1-2.522 2.52H8.834z" />
  </svg>
);

interface SettingsProps {
  readOnly?: boolean;
  members: Member[];
  roles: RoleDef[];
  onAddRole: (role: RoleDef) => void;
  onUpdateRole: (role: RoleDef) => void;
  onDeleteRole: (id: string) => void;
  /** Roller listesindeki sirayi degistirir (yer degisikligi) */
  onReorderRoles: (ordered: RoleId[]) => void;
  simulateRoles: RoleId[];
  onSimulateRoles: (roles: RoleId[]) => void;
  /**
   * Oturum gecersiz oldugunda kullaniciyi dogrudan giris ekranina
   * gonderir. once sadece "yeniden giris yapin" mesaji gosteriliyordu
   * ama paneldeki cikis dugmesi sol menusunun altinda gizliydi;
   * kullanici hatayi alinca nereden cikacagini bilmiyordu.
   */
  onForceRelogin: () => void;
}

const BADGE_PALETTE = [
  'bg-red-500/10 text-red-400 border-red-500/20',
  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'bg-pink-500/10 text-pink-400 border-pink-500/20',
];

export const SettingsView: React.FC<SettingsProps> = ({
  readOnly = false,
  members,
  roles,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onReorderRoles,
  simulateRoles,
  onSimulateRoles,
  onForceRelogin,
}) => {
  const [editing, setEditing] = useState<RoleDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<PermissionId[]>([]);
  const [formColor, setFormColor] = useState<string>(BADGE_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  /* ---- SLACK BILDIRIMLERI ---- */
  const [slackStatus, setSlackStatus] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle');
  const [slackMessage, setSlackMessage] = useState('');
  const [slackSending, setSlackSending] = useState(false);
const [slackChecking, setSlackChecking] = useState(false);
  const [slackNotice, setSlackNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Hata "yeniden giriş yapın" gerektiriyor mu? (401 / oturum gerekli)
  // Öyleyse kullanıcıya sadece mesaj değil, ÇÖZÜM DÜĞMESİ gösterilir.
  const needsLogin = Boolean(
    slackNotice &&
      !slackNotice.ok &&
      /oturum|giriş yap|401/i.test(slackNotice.text)
  );

  const handleSlackTest = async () => {
    if (readOnly) return;
    setSlackStatus('testing');
    setSlackNotice(null);
    const res = await testSlackConnection();
    if (res.ok) {
      setSlackStatus('ready');
      setSlackNotice({ ok: true, text: res.message || 'Test mesajı gönderildi.' });
    } else if (!res.configured) {
      setSlackStatus('idle');
      setSlackNotice({ ok: false, text: res.message || 'Slack yapılandırılmamış.' });
    } else {
      setSlackStatus('error');
      setSlackNotice({ ok: false, text: res.message || 'Bağlantı kurulamadı.' });
    }
  };

  const handleSlackCheck = async () => {
  if (readOnly) return;
  setSlackChecking(true);
  setSlackNotice(null);
  const res = await checkSlackToken();
  setSlackChecking(false);
  setSlackNotice({ ok: res.ok, text: res.message });
  if (res.ok) setSlackStatus('ready');
};

const handleSlackSend = async () => {
    if (readOnly || !slackMessage.trim()) return;
    setSlackSending(true);
    setSlackNotice(null);
    const res = await sendManualMessage(slackMessage.trim());
    setSlackSending(false);
    setSlackNotice({ ok: res.ok, text: res.message });
    if (res.ok) setSlackMessage('');
  };

  /* ==========================================================
     YER DEGISTIRLIGI (drag & drop + yukari/asagi oklari)
     ========================================================== */

  /** Su an tasini olan oge: rol karti icin 'role:<id>', izin icin 'perm:<id>' */
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** Tasin ogenin hangi listenin uzerinde birakildigi */
  const [dropKey, setDropKey] = useState<string | null>(null);

  /** Iki ogeyi listede yer degistirir (yeni dizi dondurur) */
  const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  /* ---- ROL YER DEGISTIRLIGI ---- */

  const moveRole = (from: number, to: number) => {
    if (readOnly) return; // salt-okunur rol sira degistiremez
    const ordered = moveItem(roles, from, to).map((r) => r.id);
    onReorderRoles(ordered);
  };

  const handleRoleDrop = (targetId: RoleId) => {
    if (readOnly || !dragKey?.startsWith('role:')) return;
    const fromId = dragKey.slice(5) as RoleId;
    if (fromId === targetId) return resetDrag();
    const from = roles.findIndex((r) => r.id === fromId);
    const to = roles.findIndex((r) => r.id === targetId);
    moveRole(from, to);
    resetDrag();
  };

  /* ---- BOLUM/IZIN YER DEGISTIRLIGI (modal icinde) ---- */

  const moveFormPerm = (from: number, to: number) => {
    setFormPerms((prev) => moveItem(prev, from, to));
  };

  const handleFormPermDrop = (targetId: PermissionId) => {
    if (readOnly || !dragKey?.startsWith('perm:')) return;
    const fromId = dragKey.slice(5) as PermissionId;
    if (fromId === targetId) return resetDrag();
    const from = formPerms.indexOf(fromId);
    const to = formPerms.indexOf(targetId);
    if (from < 0 || to < 0) return resetDrag();
    moveFormPerm(from, to);
    resetDrag();
  };

  function resetDrag() {
    setDragKey(null);
    setDropKey(null);
  }

  const memberCountFor = (roleId: RoleId) => members.filter((m) => m.role === roleId).length;

  const openNew = () => {
    if (readOnly) return; // salt-okunur rol rol olusturamaz
    setEditing(null);
    setIsNew(true);
    setFormName('');
    setFormDesc('');
    setFormPerms(['dashboard']);
    setFormColor(BADGE_PALETTE[roles.length % BADGE_PALETTE.length]);
    setError(null);
  };

  const openEdit = (role: RoleDef) => {
    if (readOnly) return; // salt-okunur rol duzenleyemez
    setEditing(role);
    setIsNew(false);
    setFormName(role.name);
    setFormDesc(role.description);
    setFormPerms([...role.permissions]);
    setFormColor(role.badgeColor);
    setError(null);
  };

  const closeModal = () => {
    setEditing(null);
    setIsNew(false);
    setError(null);
  };

  const toggleFormPerm = (pid: PermissionId) => {
    setFormPerms((prev) => (prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]));
  };

  const handleSave = () => {
    if (!formName.trim()) {
      setError('Rol adı zorunludur.');
      return;
    }
    if (formPerms.length === 0) {
      setError('En az bir bölüm erişimi seçmelisiniz.');
      return;
    }
    const duplicate = roles.find(
      (r) => r.name.toLocaleLowerCase('tr-TR') === formName.trim().toLocaleLowerCase('tr-TR') && r.id !== editing?.id
    );
    if (duplicate) {
      setError('Bu isimde bir rol zaten var.');
      return;
    }

    if (isNew) {
      onAddRole({
        id: ('custom_' + Date.now()) as RoleId,
        name: formName.trim(),
        description: formDesc.trim() || 'Özel rol',
        badgeColor: formColor,
        permissions: formPerms,
      });
    } else if (editing) {
      onUpdateRole({
        ...editing,
        name: formName.trim(),
        description: formDesc.trim() || editing.description,
        badgeColor: formColor,
        permissions: formPerms,
      });
    }
    closeModal();
  };

  const toggleSim = (id: RoleId) => {
    if (readOnly) return; // salt-okunur rol simule edemez
    onSimulateRoles(
      simulateRoles.includes(id) ? simulateRoles.filter((r) => r !== id) : [...simulateRoles, id]
    );
  };

  const handleDelete = (role: RoleDef) => {
    if (memberCountFor(role.id) > 0) return;
    onDeleteRole(role.id);
  };

  return (
    <div className="space-y-6">
      {/* Rol simulasyonu */}
      <div className="bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold text-white">Rol Simülasyonu</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Aktif rolü değiştirerek panelin farklı kullanıcılar için nasıl göründüğünü test edin. (Yalnızca görünüm —
          oturum değişmez.)
        </p>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const on = simulateRoles.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggleSim(r.id)}
                className={
                  'px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ' +
                  (on
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700')
                }
              >
                {r.name}
              </button>
            );
          })}
        </div>
        {simulateRoles.length === 0 && (
          <p className="text-[11px] text-amber-400 mt-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Hiçbir rol seçilmedi — simülasyon kapalı, kendi yetkilerinizle görüntülüyorsunuz.
          </p>
        )}
      </div>


      {/*
          SLACK BAGLANTISI
          Webhook adresi sunucuda (SLACK_WEBHOOK_URL) tutulur ve
          burada GOSTERILMEZ; panel yalnizca "bagli mi / degil mi"
          bilgisini ve bir test mesaji gonderme yetkisini gorur.
        */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <SlackIcon />
                Slack Bildirimleri
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Üye ekleme/güncelleme/silme ve güvenlik olayları kanala otomatik gider
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  'px-2.5 py-1 rounded-lg text-[11px] font-bold border ' +
                  (slackStatus === 'ready'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : slackStatus === 'testing'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : slackStatus === 'error'
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700')
                }
              >
                {slackStatus === 'ready'
                  ? 'Bağlı'
                  : slackStatus === 'testing'
                  ? 'Test ediliyor…'
                  : slackStatus === 'error'
                  ? 'Bağlantı Hatası'
                  : 'Bağlı Değil'}
              </span>
              {/*
                TOKEN KONTROLU (mesaj GONDERMEZ)
                "Baglantiyi Test Et" kanala GERCEK bir mesaj yazar.
                Ayar yaparken kanali kirletmemek ve tokenin gecerli olup
                olmadigini net gormek icin ayri bir kontrol butonu var.
              */}
              <button
                onClick={handleSlackCheck}
                disabled={readOnly || slackChecking}
                title="Kanala mesaj göndermeden tokenı kontrol eder"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {slackChecking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SlackIcon />
                )}
                Tokenı Kontrol Et
              </button>
              <button
                onClick={handleSlackTest}
                disabled={readOnly || slackStatus === 'testing'}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {slackStatus === 'testing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Bağlantıyı Test Et
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Manuel mesaj */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">
                Kanala Mesaj Gönder
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={slackMessage}
                  onChange={(e) => setSlackMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !readOnly) handleSlackSend();
                  }}
                  placeholder="Örn: Yarın 20:00'de moderatör toplantısı var."
                  maxLength={500}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                />
                <button
                  onClick={handleSlackSend}
                  disabled={readOnly || !slackMessage.trim() || slackSending}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {slackSending ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                {slackMessage.length}/500 karakter
              </p>
            </div>

            {slackNotice && (
              <div
                className={
                  'flex items-center gap-2 text-xs rounded-xl px-3 py-2 border ' +
                  (slackNotice.ok
                    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-amber-300 bg-amber-500/10 border-amber-500/20')
                }
              >
                {slackNotice.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                {slackNotice.text}
              </div>
            )}

            {/* Oturum hatasinda dogrudan cozum: giris ekranina gec */}
            {needsLogin && (
              <button
                onClick={onForceRelogin}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold border border-amber-500/30 transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Oturumu Yenile — Giriş Ekranına Dön
              </button>
            )}

            {/* Kurulum yardimi */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1.5">
              <div className="font-bold text-slate-300 text-xs mb-1">Bağlantı nasıl kurulur?</div>
              <p>1. Slack uygulamasında <b className="text-slate-300">Incoming Webhooks</b> oluşturun.</p>
              <p>2. Bildirimlerin düşeceği kanalı seçin (örn. <code className="text-indigo-300">#zula-bildirim</code>).</p>
              <p>
                3. Webhook adresini <b className="text-slate-300">Vercel</b> → Settings → Environment Variables →{' '}
                <code className="text-indigo-300">SLACK_WEBHOOK_URL</code> olarak ekleyip deploy'u yenileyin.
              </p>
              <p className="text-slate-500">
                Alternatif: bot kullanıyorsanız <code className="text-indigo-300">SLACK_BOT_TOKEN</code> (xoxb-…) ve{' '}
                <code className="text-indigo-300">SLACK_CHANNEL_ID</code> (kanal kimliği) ekleyin — bu yol bot
                üzerinden çalışır.
              </p>
              <p className="text-slate-500 pt-1 border-t border-slate-800">
                Güvenlik: Webhook adresi sunucuda saklanır, tarayıcıya hiç gönderilmez. Panel yalnızca sunucuya
                bildirir; mesajı sunucu iletir.
              </p>
            </div>
          </div>
        </div>

        {/* Rol listesi */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              Rol & İzin Tanımları
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {roles.length} rol · hiyerarşi seviyeleri ve bölüm erişimleri
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Yeni Rol
          </button>
        </div>

        <div className="divide-y divide-slate-800/60">
          {roles.map((role) => {
            const count = memberCountFor(role.id);
            const level = getRoleLevel(role.id);
            return (
              <div
                key={role.id}
                role="listitem"
                draggable={!readOnly}
                onDragStart={(e) => {
                  setDragKey('role:' + role.id);
                  e.dataTransfer.effectAllowed = 'move';
                  // bazi tarayicilar suruklemeyi baslatmak icin veri bekler
                  e.dataTransfer.setData('text/plain', role.id);
                }}
                onDragEnd={resetDrag}
                onDragOver={(e) => {
                  if (readOnly || !dragKey) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropKey('role:' + role.id);
                }}
                onDragLeave={() => setDropKey(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleRoleDrop(role.id);
                }}
                className={
                  'p-4 sm:p-5 transition-colors flex gap-2 ' +
                  (dropKey === 'role:' + role.id && dragKey !== 'role:' + role.id
                    ? 'bg-indigo-500/10 ring-2 ring-inset ring-indigo-500/50'
                    : 'hover:bg-slate-800/20') +
                  (dragKey === 'role:' + role.id ? ' opacity-40' : '')
                }
              >
                {!readOnly && (
                  <div
                    className="flex items-center text-slate-600 hover:text-indigo-400 transition-colors cursor-grab active:cursor-grabbing shrink-0"
                    title="Tut ve taşı"
                    aria-label="Rolü taşı"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ' +
                          role.badgeColor
                        }
                      >
                        <Shield className="w-3 h-3" />
                        {role.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        <Layers className="w-3 h-3" />
                        {roleLevelLabel(role.id)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        <Users className="w-3 h-3" />
                        {count} üye
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{role.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span
                        className={
                          'text-[10px] font-bold px-2 py-1 rounded-lg border ' +
                          (role.permissions.length === ALL_PERMISSIONS.length
                            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-amber-300 bg-amber-500/10 border-amber-500/20')
                        }
                      >
                        {role.permissions.length === ALL_PERMISSIONS.length
                          ? 'TÜM BÖLÜMLER (' + role.permissions.length + ')'
                          : role.permissions.length + ' bölüm erişimi'}
                      </span>
                      {role.permissions.map((pid) => {
                        const def = ALL_PERMISSIONS.find((p) => p.id === pid);
                        return (
                          <span
                            key={pid}
                            className="text-[10px] text-slate-400 bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg"
                            title={def?.description}
                          >
                            {def?.label ?? pid}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-mono hidden sm:block">Lv.{level}</span>
                    {!readOnly && (
                      <>
                        <button
                          onClick={() => moveRole(roles.findIndex((r) => r.id === role.id) - 1, roles.findIndex((r) => r.id === role.id))}
                          disabled={roles.findIndex((r) => r.id === role.id) === 0}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title="Yukarı taşı"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveRole(roles.findIndex((r) => r.id === role.id), roles.findIndex((r) => r.id === role.id) + 1)}
                          disabled={roles.findIndex((r) => r.id === role.id) === roles.length - 1}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title="Aşağı taşı"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openEdit(role)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Rolü düzenle"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {count === 0 ? (
                      <button
                        onClick={() => handleDelete(role)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                        title="Rolü sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span
                        className="p-1.5 rounded-lg bg-slate-800/50 text-slate-600"
                        title={'Bu role atanmış ' + count + ' üye var — silinemez.'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {/* Rol duzenleme modali */}
      {(isNew || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-full-mobile">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-400" />
                {isNew ? 'Yeni Rol Oluştur' : 'Rolü Düzenle'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Rol Adı</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Örn: Kıdemli Testçi"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Açıklama</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Rol sorumlulukları..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Rozet Rengi</label>
                <div className="flex flex-wrap gap-2">
                  {BADGE_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={
                        'px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ' +
                        color +
                        (formColor === color ? ' ring-2 ring-indigo-400' : '')
                      }
                    >
                      Örnek
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">
                  Bölüm Erişim Yetkileri ({formPerms.length}/{ALL_PERMISSIONS.length})
                </label>
                {formPerms.length > 1 && (
                  <p className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 mb-2">
                    Seçili bölümlerin sırasını tutun veya oklarla değiştirin — bu sıra kaydedilir.
                  </p>
                )}
                <div className="space-y-1.5">
                  {/* SECILI BOLUMLER: one cikarilir, sirasiyla ve yer degistirilebilir */}
                  {formPerms.map((pid, idx) => {
                    const p = ALL_PERMISSIONS.find((x) => x.id === pid);
                    if (!p) return null;
                    return (
                      <div
                        key={pid}
                        role="listitem"
                        draggable={!readOnly}
                        onDragStart={(e) => {
                          setDragKey('perm:' + pid);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', pid);
                        }}
                        onDragEnd={resetDrag}
                        onDragOver={(e) => {
                          if (readOnly || !dragKey) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropKey('perm:' + pid);
                        }}
                        onDragLeave={() => setDropKey(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleFormPermDrop(pid);
                        }}
                        className={
                          'w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all bg-indigo-500/10 border-indigo-500/40 ' +
                          (dropKey === 'perm:' + pid && dragKey !== 'perm:' + pid
                            ? 'ring-2 ring-indigo-400'
                            : '') +
                          (dragKey === 'perm:' + pid ? ' opacity-40' : '') +
                          (readOnly ? '' : ' cursor-grab active:cursor-grabbing')
                        }
                      >
                        {!readOnly && (
                          <span className="text-slate-500 shrink-0" title="Tut ve taşı">
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-500 w-4 shrink-0">{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => toggleFormPerm(p.id)}
                          className="w-4 h-4 rounded shrink-0 flex items-center justify-center border border-indigo-500 bg-indigo-500 text-white cursor-pointer"
                          title={p.label + ' — erişimi kaldır'}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-indigo-300">{p.label}</span>
                          <span className="block text-[10px] text-slate-500">{p.description}</span>
                        </span>
                        {!readOnly && (
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveFormPerm(idx, idx - 1)}
                              disabled={idx === 0}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Yukarı taşı"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFormPerm(idx, idx + 1)}
                              disabled={idx === formPerms.length - 1}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Aşağı taşı"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {/* YERI degistirilebilir bitti */}

                  {/* SECILI OLMAYAN BOLUMLER: tiklanip listeye eklenir */}
                  {ALL_PERMISSIONS.filter((p) => !formPerms.includes(p.id)).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleFormPerm(p.id)}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    >
                      <span className="w-4 shrink-0 flex justify-center">
                        <Plus className="w-3.5 h-3.5 text-slate-500" />
                      </span>
                      <span className="w-4 h-4 rounded shrink-0 flex items-center justify-center border bg-slate-900 border-slate-700" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-300">{p.label}</span>
                        <span className="block text-[10px] text-slate-500">{p.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;

