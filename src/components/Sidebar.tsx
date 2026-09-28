import React from 'react';
import {
  LayoutDashboard,
  Users,
  Award,
  Shield,
  Activity,
  Code2,
  AtSign,
  Camera,
  Send,
  LogOut,
  GraduationCap,
  Scale,
  BarChart3,
  ScrollText,
  Settings,
  Sheet,
} from 'lucide-react';
import type { Member, PermissionId } from '../types';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  allowedTabs: PermissionId[];
  currentUser: Member;
  isAdmin: boolean;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  allowedTabs,
  currentUser,
  isAdmin,
  onLogout,
}) => {
  const allMenuItems: { id: PermissionId; label: string; icon: typeof LayoutDashboard; group?: string }[] = [
    { id: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
    { id: 'members', label: 'Üye & Personel Listesi', icon: Users, group: 'Ekip' },
    { id: 'academy', label: 'Akademi Üyeleri', icon: GraduationCap, group: 'Ekip' },
    { id: 'referees', label: 'Hakem Üyeleri', icon: Scale, group: 'Ekip' },
    { id: 'performance', label: 'Performans Yönetimi', icon: BarChart3, group: 'Değerlendirme' },
    { id: 'reports', label: 'Performans Raporları', icon: Award, group: 'Değerlendirme' },
    { id: 'tests', label: 'Test Oturumları', icon: Activity, group: 'Değerlendirme' },
    { id: 'roles', label: 'Rol & Yetkilendirme', icon: Shield, group: 'Sistem' },
    { id: 'logs', label: 'Sistem Kayıtları', icon: ScrollText, group: 'Sistem' },
    { id: 'settings', label: 'Ayarlar & Roller', icon: Settings, group: 'Sistem' },
    { id: 'sheets', label: 'Google Sheets', icon: Sheet, group: 'Sistem' },
  ];

  // Yetkisi olmayan sekmeler menüde görünmez
  const menuItems = allMenuItems.filter((item) => allowedTabs.includes(item.id));

  const initials = currentUser.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="w-72 bg-slate-950/90 border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 h-screen sticky top-0 backdrop-blur-xl">
      {/* Brand */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2 pt-2">
          <img
            src="/zula-logo.png"
            srcSet="/zula-logo@2x.png 2x, /zula-logo@3x.png 3x"
            width={256}
            height={101}
            alt="Zula"
            className="h-9 w-auto object-contain drop-shadow-[0_2px_12px_rgba(245,158,11,0.45)]"
          />
          <div className="min-w-0">
            <div className="font-extrabold text-sm tracking-wide text-white uppercase">Zula Suite</div>
            <div className="text-[11px] text-indigo-400 font-medium">Test & Topluluk CRM</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const showGroup = item.group && (idx === 0 || menuItems[idx - 1].group !== item.group);
            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-3.5 pt-3 pb-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                    {item.group}
                  </div>
                )}
                <button
                  onClick={() => onSelectTab(item.id)}
                  className={
                    'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ' +
                    (isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60')
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Developer Profile & Social Info */}
      <div className="pt-4 border-t border-slate-800/80 space-y-4">
        {/* User Card */}
        <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-400 text-xs">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">{currentUser.fullName}</div>
            <div className="text-[10px] text-indigo-400 truncate font-mono">
              @{currentUser.username}
              {isAdmin && <span className="ml-1 text-emerald-400 font-bold">· ADMIN</span>}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
            title="Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Social Links */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
            Geliştirici İletişim
          </div>
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <a
              href="https://x.com/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-white transition-all hover:scale-110"
              title="X / Twitter (@odetecegim)"
            >
              <AtSign className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-white transition-all hover:scale-110"
              title="GitHub (@odetecegim)"
            >
              <Code2 className="w-4 h-4" />
            </a>
            <a
              href="https://instagram.com/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-white transition-all hover:scale-110"
              title="Instagram (@odetecegim)"
            >
              <Camera className="w-4 h-4" />
            </a>
            <a
              href="https://t.me/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-white transition-all hover:scale-110"
              title="Telegram (@odetecegim)"
            >
              <Send className="w-4 h-4" />
            </a>
          </div>
          <div className="text-center text-[10px] text-slate-500 font-medium">
            MadByte & Zula CRM Platform © 2026
          </div>
        </div>
      </div>
    </aside>
  );
};

