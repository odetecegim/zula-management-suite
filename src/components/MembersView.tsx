import React, { useState } from 'react';
import { Plus, Search, Trash2, Edit3, X, Check, Shield, UserCheck, KeyRound, Eye, EyeOff, Copy, AlertTriangle } from 'lucide-react';
import { ALL_PERMISSIONS } from '../data/initialData';
import { canManageMember, getRoleLevel, roleLevelLabel } from '../lib/roles';
import { sortMembers } from '../lib/member-sort';
import type { Member, RoleDef, GameType, RegionType, StatusType, RoleId, PermissionId } from '../types';

export interface TeamFilter {
  team: 'academy' | 'referee';
  allowedRoles: RoleId[];
  title: string;
  subtitle: string;
  emptyMessage: string;
}

interface MembersProps {
  members: Member[];
  roles: RoleDef[];
  onAddMember: (member: Member) => void;
  onUpdateMember: (member: Member) => void;
  onDeleteMember: (id: string) => void;
  currentUser: Member;
  isAdmin: boolean;
  teamFilter: TeamFilter | null;
}

export const MembersView: React.FC<MembersProps> = ({
  members,
  roles,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  currentUser,
  isAdmin,
  teamFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGame, setFilterGame] = useState<string>('ALL');
  const [filterRegion, setFilterRegion] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const [formTagId, setFormTagId] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formGameNickname, setFormGameNickname] = useState('');
  const [formPlayerId, setFormPlayerId] = useState('');
  const [formDiscordTag, setFormDiscordTag] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGame, setFormGame] = useState<GameType>('Zula PC');
  const [formRegion, setFormRegion] = useState<RegionType>('TR');
  const [formRole, setFormRole] = useState<RoleId>('academy_member');
  const [formStatus, setFormStatus] = useState<StatusType>('Aktif');
  const [formScore, setFormScore] = useState(80);
  const [formNotes, setFormNotes] = useState('');
  // Admin: giriş bilgisi & yetkiler
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPermissions, setFormPermissions] = useState<PermissionId[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedTag(value);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Alan dogrulama + benzersizlik kontrolleri
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const others = editingMember ? members.filter((m) => m.id !== editingMember.id) : members;

    const tagTrim = formTagId.trim();
    if (!tagTrim) next.tagId = 'Üye kodu zorunludur.';
    else if (!/^ZULA-\d{3}$/i.test(tagTrim)) next.tagId = 'Format ZULA-001 şeklinde olmalıdır.';
    else if (others.some((m) => m.tagId.toLocaleLowerCase('tr-TR') === tagTrim.toLocaleLowerCase('tr-TR')))
      next.tagId = 'Bu üye kodu zaten kullanılıyor.';

    if (!formFullName.trim()) next.fullName = 'Ad Soyad zorunludur.';
    else if (formFullName.trim().length < 3) next.fullName = 'En az 3 karakter giriniz.';

    const nickTrim = formGameNickname.trim();
    if (!nickTrim) next.gameNickname = 'Oyun içi nick zorunludur.';
    else if (!/^[a-zA-Z0-9çğıöşüÇĞİÖŞÜ!^/+?=_$#{}|[\]~`<>*.-]{3,12}$/.test(nickTrim))
      next.gameNickname = '3-12 karakter; yalnızca harf, rakam ve ! ^ / + ? = _ - $ # { } [ ] | ~ ` < > * .';
    else if (others.some((m) => m.gameNickname.toLocaleLowerCase('tr-TR') === nickTrim.toLocaleLowerCase('tr-TR')))
      next.gameNickname = 'Bu oyun içi nick zaten kullanılıyor.';

    const emailTrim = formEmail.trim();
    if (emailTrim) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) next.email = 'Geçerli bir e-posta adresi giriniz.';
      else if (others.some((m) => m.email.toLocaleLowerCase('tr-TR') === emailTrim.toLocaleLowerCase('tr-TR')))
        next.email = 'Bu e-posta adresi zaten kullanılıyor.';
    }

    // Discord ID: Topluluk Moderatörü için zorunlu ve 17+ haneli olmalı

    if (formPermissions.length === 0) next.permissions = 'En az bir bölüm erişimi seçmelisiniz.';

    // Panel girisi (yalnizca admin duzenler)
    if (isAdmin) {
      const userTrim = formUsername.trim().toLowerCase();
      if (!userTrim) next.username = 'Kullanıcı adı zorunludur.';
      else if (!/^[a-zA-Z0-9]{4,10}$/.test(userTrim))
        next.username = '4-10 karakter; yalnızca İngilizce harf ve rakam.';
      else if (others.some((m) => (m.username ?? '').toLowerCase() === userTrim))
        next.username = 'Bu kullanıcı adı zaten kullanılıyor.';

      if (!formPassword) next.password = 'Şifre zorunludur.';
      else if (formPassword.length < 4) next.password = 'Şifre en az 4 karakter olmalıdır.';
    }

    return next;
  };


  const togglePermission = (pid: PermissionId) => {
    setFormPermissions((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]
    );
  };

  const openNewModal = () => {
    setEditingMember(null);
    setFormTagId('ZULA-' + String(members.length + 1).padStart(3, '0'));
    setFormFullName('');
    setFormGameNickname('');
    setFormDiscordTag('');
    setFormEmail('');
    setFormGame('Zula PC');
    setFormRegion('TR');
    setFormRole('academy_member');
    setFormStatus('Aktif');
    setFormScore(85);
    setFormNotes('');
    setFormUsername('');
    setFormPassword('');
    setFormPermissions(['dashboard']);
    setShowPassword(false);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (m: Member) => {
    setEditingMember(m);
    setFormTagId(m.tagId);
    setFormFullName(m.fullName);
    setFormGameNickname(m.gameNickname);
    setFormDiscordTag(m.discordTag);
    setFormEmail(m.email);
    setFormGame(m.game);
    setFormRegion(m.region);
    setFormRole(m.role);
    setFormStatus(m.status);
    setFormPlayerId(m.playerId ?? '');
    setFormScore(m.participationScore);
    setFormNotes(m.notes);
    setFormUsername(m.username);
    setFormPassword(m.password);
    setFormPermissions(m.permissions);
    setShowPassword(false);
    setErrors({});
    setIsModalOpen(true);
  };
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Hiyerarsi kontrolu: kendi seviyesinden yuksek bir rolu yonetemez
    if (editingMember && !canManageMember(currentUser.role, editingMember.role)) {
      setErrors({ form: 'Bu üyeyi düzenleme yetkiniz yok — rol seviyesi sizinkinden yüksek.' });
      return;
    }

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Admin değilse mevcut giriş bilgileri & yetkiler korunur
    const credentials = isAdmin
      ? { username: formUsername.trim().toLowerCase(), password: formPassword, permissions: formPermissions }
      : editingMember
      ? { username: editingMember.username, password: editingMember.password, permissions: editingMember.permissions }
      : { username: '', password: '', permissions: ['dashboard'] as PermissionId[] };

    if (editingMember) {
      onUpdateMember({
        ...editingMember,
        tagId: formTagId,
        fullName: formFullName,
        gameNickname: formGameNickname,
        playerId: formPlayerId.trim(),
        discordTag: formDiscordTag,
        email: formEmail,
        game: formGame,
        region: formRegion,
        role: formRole,
        status: formStatus,
        participationScore: Number(formScore),
        notes: formNotes,
        ...credentials,
      });
    } else {
      onAddMember({
        id: 'm-' + Date.now(),
        tagId: formTagId,
        fullName: formFullName,
        gameNickname: formGameNickname,
        playerId: formPlayerId.trim(),
        discordTag: formDiscordTag,
        email: formEmail,
        game: formGame,
        region: formRegion,
        role: formRole,
        status: formStatus,
        joinDate: new Date().toISOString().split('T')[0],
        participationScore: Number(formScore),
        bugReportsCount: 0,
        notes: formNotes,
        ...credentials,
      });
    }
    setIsModalOpen(false);
  };

  const filteredMembers = members.filter((m) => {
    if (teamFilter && !teamFilter.allowedRoles.includes(m.role)) return false;

    const matchSearch =
      m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.gameNickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.tagId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.discordTag.toLowerCase().includes(searchTerm.toLowerCase());

    const matchGame = filterGame === 'ALL' || m.game === filterGame;
    const matchRegion = filterRegion === 'ALL' || m.region === filterRegion;

    return matchSearch && matchGame && matchRegion;
  });

  // Oyuncu siralamasi: uye kodu > kullanici adi > isim soyisim > puanlama
  const sortedMembers = sortMembers(filteredMembers);

  const getRoleDef = (roleId: RoleId) => roles.find((r) => r.id === roleId);

  // Hiyerarsi: giris yapan kullanici bu uyeyi yonetebilir mi?
  const canEditTarget = !editingMember || canManageMember(currentUser.role, editingMember.role);

  const errorFor = (key: string) =>
    errors[key] ? (
      <p className="text-[10px] text-rose-400 mt-1 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="space-y-6">
      {teamFilter && (
        <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">{teamFilter.title}</h2>
            <p className="text-xs text-slate-400">{teamFilter.subtitle}</p>
          </div>
          <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
            {filteredMembers.length} üye
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex flex-1 items-center gap-3 bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 w-full sm:w-auto">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="İsim, oyun nicki, kod veya discord ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-slate-100 placeholder-slate-500 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={filterGame}
            onChange={(e) => setFilterGame(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 outline-none"
          >
            <option value="ALL">Tüm Oyunlar</option>
            <option value="Zula">Zula</option>
            <option value="Zula Strike">Zula Strike</option>
            <option value="Wolfteam">Wolfteam</option>
          </select>

          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 outline-none"
          >
            <option value="ALL">Tüm Bölgeler</option>
            <option value="TR">TR</option>
            <option value="EU">EU</option>
            <option value="LATAM">LATAM</option>
          </select>

          <button
            onClick={openNewModal}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Yeni Üye Ekle
          </button>
        </div>
      </div>



      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-4">Üye / Bilgi</th>
                <th className="px-5 py-4">Oyun & Bölge</th>
                <th className="px-5 py-4">Rol / Yetki</th>
                <th className="px-5 py-4">Performans Skoru</th>
                <th className="px-5 py-4">Durum</th>
                <th className="px-5 py-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    {teamFilter ? teamFilter.emptyMessage : 'Kriterlere uygun üye bulunamadı.'}
                  </td>
                </tr>
              ) : (
                sortedMembers.map((m) => {
                  const roleDef = getRoleDef(m.role);
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                            {m.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100 flex items-center gap-2">
                              {m.fullName}
                              <button
                                onClick={() => copyToClipboard(m.tagId)}
                                className="inline-flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-300 px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer"
                                title="Üye kodunu kopyala"
                              >
                                {m.tagId}
                                {copiedTag === m.tagId ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5" />
                                )}
                              </button>
                            </div>
                            <div className="text-xs text-indigo-400 flex items-center gap-2">
                              <span>🎮 {m.gameNickname}</span>
                              {m.playerId && (
                                <>
                                  <span className="text-slate-600">•</span>
                                  <span className="font-mono text-slate-500" title="Oyuncu Member ID">
                                    #{m.playerId}
                                  </span>
                                </>
                              )}
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400">{m.discordTag}</span>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                                <KeyRound className="w-3 h-3 text-indigo-500" />
                                <span className="font-mono">@{m.username || '—'}</span>
                                <span className="text-slate-700">·</span>
                                <span>{m.permissions.length} bölüm erişimi</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-slate-200 font-medium text-xs">{m.game}</div>
                        <div className="text-[11px] text-slate-500">Bölge: {m.region}</div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ' + (roleDef ? roleDef.badgeColor : 'bg-slate-800 text-slate-300 border-slate-700')}
                        >
                          <Shield className="w-3 h-3" />
                          {roleDef ? roleDef.name : m.role}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          {roleLevelLabel(m.role)} · Lv.{getRoleLevel(m.role)}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-1.5 w-32">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Katılım:</span>
                            <span className="font-bold text-slate-200">%{m.participationScore}</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={'h-full rounded-full ' + (m.participationScore >= 90 ? 'bg-emerald-500' : m.participationScore >= 70 ? 'bg-amber-500' : 'bg-rose-500')}
                              style={{ width: m.participationScore + '%' }}
                            />
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Hata Raporu: {m.bugReportsCount} adet
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ' + (m.status === 'Aktif' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : m.status === 'Pasif' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20')}
                        >
                          {m.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {m.id !== currentUser.id ? (
                            <button
                              onClick={() => onDeleteMember(m.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              className="p-1.5 rounded-lg bg-slate-800/50 text-slate-600"
                              title="Kendi hesabınızı silemezsiniz"
                            >
                              <Trash2 className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-400" />
                {editingMember ? 'Üye Profilini Güncelle' : 'Yeni Ekip Üyesi Oluştur'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              {!canEditTarget && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Bu üyenin rol seviyesi ({roleLevelLabel(editingMember?.role ?? '')} · Lv.
                    {getRoleLevel(editingMember?.role ?? '')}) sizinkinden yüksek veya eşit. Kayıt değişiklikleri
                    engellenir.
                  </span>
                </div>
              )}
              {errors.form && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {errors.form}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Üye Kodu</label>
                  <input
                    type="text"
                    required
                    value={formTagId}
                    onChange={(e) => setFormTagId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                  {errorFor('tagId')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Hüseyin Çalışkan"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                  {errorFor('fullName')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Oyun İçi Nick</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Odetecegim"
                    value={formGameNickname}
                    onChange={(e) => setFormGameNickname(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                  {errorFor('gameNickname')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Oyuncu Member ID
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Örn: 1234567"
                    value={formPlayerId}
                    onChange={(e) => setFormPlayerId(e.target.value.replace(/[^\d]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none font-mono"
                  />
                  {errorFor('playerId')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Discord Kullanıcı Adı</label>
                  <input
                    type="text"
                    placeholder="Örn: odetecegim#0001"
                    value={formDiscordTag}
                    onChange={(e) => setFormDiscordTag(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                  {errorFor('discordTag')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">E-Posta</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                  {errorFor('email')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Yetki / Rol</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as RoleId)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Oyun</label>
                  <select
                    value={formGame}
                    onChange={(e) => setFormGame(e.target.value as GameType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="Zula">Zula</option>
                    <option value="Zula Strike">Zula Strike</option>
                    <option value="Wolfteam">Wolfteam</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Bölge</label>
                  <select
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value as RegionType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="TR">TR</option>
                    <option value="EU">EU</option>
                    <option value="LATAM">LATAM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Durum</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as StatusType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Pasif">Pasif</option>
                    <option value="İncelemede">İncelemede</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">
                  Katılım Skoru (% {formScore})
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formScore}
                  onChange={(e) => setFormScore(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Açıklama / Notlar</label>
                <textarea
                  rows={2}
                  placeholder="Üye hakkında test notları veya değerlendirme..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none"
                />
              </div>

              {/* Admin'e özel: Panel girişi & erişim yetkileri */}
              {isAdmin && (
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                      Panel Girişi & Erişim Yetkileri
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Kullanıcı Adı</label>
                      <input
                        type="text"
                        placeholder="orn: testci01"
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none font-mono"
                      />
                      {errorFor('username')}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Şifre</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Şifre belirleyin"
                          value={formPassword}
                          onChange={(e) => setFormPassword(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3 pr-9 py-2 text-sm text-white outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                          title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errorFor('password')}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      Erişebileceği Bölümler ({formPermissions.length}/{ALL_PERMISSIONS.length})
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_PERMISSIONS.map((p) => {
                        const checked = formPermissions.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePermission(p.id)}
                            className={
                              'flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ' +
                              (checked
                                ? 'bg-indigo-500/10 border-indigo-500/40'
                                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700')
                            }
                          >
                            <span
                              className={
                                'mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center border ' +
                                (checked
                                  ? 'bg-indigo-500 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700')
                              }
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <span className="min-w-0">
                              <span className={'block text-xs font-semibold ' + (checked ? 'text-indigo-300' : 'text-slate-300')}>
                                {p.label}
                              </span>
                              <span className="block text-[10px] text-slate-500 leading-snug">{p.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      İzin verilmeyen bölümler kullanıcının menüsünde görünmez ve doğrudan erişilemez.
                    </p>
                    {errorFor('permissions')}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={!canEditTarget}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
