import React from 'react';
import type { RoleDef, Member } from '../types';
import { ShieldCheck, UserCheck } from 'lucide-react';

interface RolesProps {
  roles: RoleDef[];
  members: Member[];
}

export const RolesView: React.FC<RolesProps> = ({ roles, members }) => {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          Rol Tabanlı Yetki ve Hiyerarşi Yönetimi
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Akademi, Hakemlik ve QA süreçlerindeki rol dağılımları ve erişim düzeyleri
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {roles.map((r) => {
          const roleMembers = members.filter((m) => m.role === r.id);
          return (
            <div
              key={r.id}
              className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={'text-xs font-semibold px-2.5 py-1 rounded-lg border ' + r.badgeColor}
                  >
                    {r.name}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {roleMembers.length} Personel
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{r.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80">
                <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  Atanan Üyeler:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {roleMembers.length === 0 ? (
                    <span className="text-[11px] text-slate-600 italic">Henüz atanmadı</span>
                  ) : (
                    roleMembers.map((m) => (
                      <span
                        key={m.id}
                        className="text-[10px] bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md"
                      >
                        {m.fullName}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

