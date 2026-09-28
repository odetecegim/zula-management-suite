import React, { useState } from 'react';
import { ShieldCheck, Plus, Edit3, X, Check, KeyRound, Shield, Users, Trash2, Layers, AlertTriangle } from 'lucide-react';
import { ALL_PERMISSIONS } from '../data/initialData';
import { getRoleLevel, roleLevelLabel } from '../lib/roles';
import type { Member, RoleDef, RoleId, PermissionId } from '../types';

interface SettingsProps {
  members: Member[];
  roles: RoleDef[];
  onAddRole: (role: RoleDef) => void;
  onUpdateRole: (role: RoleDef) => void;
  onDeleteRole: (id: string) => void;
  simulateRoles: RoleId[];
  onSimulateRoles: (roles: RoleId[]) => void;
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
  members,
  roles,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  simulateRoles,
  onSimulateRoles,
}) => {
  const [editing, setEditing] = useState<RoleDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<PermissionId[]>([]);
  const [formColor, setFormColor] = useState<string>(BADGE_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const memberCountFor = (roleId: RoleId) => members.filter((m) => m.role === roleId).length;

  const openNew = () => {
    setEditing(null);
    setIsNew(true);
    setFormName('');
    setFormDesc('');
    setFormPerms(['dashboard']);
    setFormColor(BADGE_PALETTE[roles.length % BADGE_PALETTE.length]);
    setError(null);
  };

  const openEdit = (role: RoleDef) => {
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
              <div key={role.id} className="p-4 sm:p-5 hover:bg-slate-800/20 transition-colors">
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
            );
          })}
        </div>
      </div>


      {/* Rol duzenleme modali */}
      {(isNew || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
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
                <div className="space-y-1.5">
                  {ALL_PERMISSIONS.map((p) => {
                    const on = formPerms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleFormPerm(p.id)}
                        className={
                          'w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ' +
                          (on
                            ? 'bg-indigo-500/10 border-indigo-500/40'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700')
                        }
                      >
                        <span
                          className={
                            'w-4 h-4 rounded shrink-0 flex items-center justify-center border ' +
                            (on ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700')
                          }
                        >
                          {on && <Check className="w-3 h-3" />}
                        </span>
                        <span className="min-w-0">
                          <span className={'block text-xs font-semibold ' + (on ? 'text-indigo-300' : 'text-slate-300')}>
                            {p.label}
                          </span>
                          <span className="block text-[10px] text-slate-500">{p.description}</span>
                        </span>
                      </button>
                    );
                  })}
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

