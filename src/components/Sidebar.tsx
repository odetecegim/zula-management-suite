import React from 'react';
import {
  LayoutDashboard,
  Users,
  Award,
  Shield,
  Activity,
  Mail,
  LogOut,
  GraduationCap,
  Scale,
  BarChart3,
  ScrollText,
  Settings,
  Sheet,
  Globe,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n';
import type { Member, PermissionId } from '../types';

const SOCIAL_BTN =
  'p-2 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-white transition-all hover:scale-110';

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
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = React.useState(false);

  const allMenuItems: { id: PermissionId; labelKey: string; icon: typeof LayoutDashboard; groupKey?: string }[] = [
    { id: 'dashboard', labelKey: 'navDashboard', icon: LayoutDashboard },
    { id: 'members', labelKey: 'perm_members', icon: Users, groupKey: 'navOperations' },
    { id: 'academy', labelKey: 'navAcademy', icon: GraduationCap, groupKey: 'navOperations' },
    { id: 'referees', labelKey: 'navReferees', icon: Scale, groupKey: 'navOperations' },
    { id: 'performance', labelKey: 'navPerformance', icon: BarChart3, groupKey: 'navManagement' },
    { id: 'reports', labelKey: 'navReports', icon: Award, groupKey: 'navManagement' },
    { id: 'tests', labelKey: 'navTests', icon: Activity, groupKey: 'navManagement' },
    { id: 'roles', labelKey: 'navRoles', icon: Shield, groupKey: 'navSystem' },
    { id: 'logs', labelKey: 'navLogs', icon: ScrollText, groupKey: 'navSystem' },
    { id: 'settings', labelKey: 'navSettings', icon: Settings, groupKey: 'navSystem' },
    { id: 'sheets', labelKey: 'navSheets', icon: Sheet, groupKey: 'navSystem' },
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
            <div className="font-extrabold text-sm tracking-wide text-white uppercase">Zula Teşkilat</div>
            <div className="text-[11px] text-indigo-400 font-medium">Akademi</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const showGroup =
              item.groupKey && (idx === 0 || menuItems[idx - 1].groupKey !== item.groupKey);
            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-3.5 pt-3 pb-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                    {t(item.groupKey as string)}
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
                  {t(item.labelKey)}
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Developer Profile & Social Info */}
      <div className="pt-4 border-t border-slate-800/80 space-y-4">
        {/* Dil secimi */}
        <div className="relative">
          <button
            onClick={() => setLangOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-all cursor-pointer"
            title={t('language')}
          >
            <Globe className="w-4 h-4" />
            <span className="flex-1 text-left">{t('language')}</span>
            <span className="text-base leading-none">
              {languages.find((l) => l.code === i18n.language)?.flag ?? '🇹🇷'}
            </span>
          </button>

          {langOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-50">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  disabled={!lang.enabled}
                  onClick={() => {
                    if (!lang.enabled) return;
                    i18n.changeLanguage(lang.code);
                    setLangOpen(false);
                  }}
                  className={
                    'w-full flex items-center gap-3 px-3.5 py-2.5 text-xs transition-all text-left ' +
                    (i18n.language === lang.code
                      ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                      : lang.enabled
                        ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'
                        : 'text-slate-700 cursor-not-allowed')
                  }
                >
                  <span className="text-base leading-none">{lang.flag}</span>
                  <span className="flex-1">{lang.name}</span>
                  {i18n.language === lang.code && <Check className="w-3.5 h-3.5" />}
                  {!lang.enabled && (
                    <span className="text-[9px] uppercase tracking-wide text-slate-600">Soon</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

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
            title={t('logout')}
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
              href="https://instagram.com/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className={SOCIAL_BTN}
              title="Instagram (@odetecegim)"
              aria-label="Instagram"
            >
              <svg
                viewBox="0 0 20 20"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12.5 6.667a4.167 4.167 0 1 0-8.334 0 4.167 4.167 0 0 0 8.334 0" />
                <path d="M2.5 16.667a5.833 5.833 0 0 1 8.75-5.053m3.837.474.513 1.035c.07.144.257.282.414.309l.93.155c.596.1.736.536.307.965l-.723.73a.64.64 0 0 0-.152.531l.207.903c.164.715-.213.991-.84.618l-.872-.52a.63.63 0 0 0-.577 0l-.872.52c-.624.373-1.003.094-.84-.618l.207-.903a.64.64 0 0 0-.152-.532l-.723-.729c-.426-.43-.289-.864.306-.964l.93-.156a.64.64 0 0 0 .412-.31l.513-1.034c.28-.562.735-.562 1.012 0" />
              </svg>
            </a>
            <a
              href="https://github.com/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className={SOCIAL_BTN}
              title="GitHub (@odetecegim)"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 19 19" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
                />
              </svg>
            </a>
            <a
              href="https://discord.com/users/odetecegim"
              target="_blank"
              rel="noopener noreferrer"
              className={SOCIAL_BTN}
              title="Discord (@odetecegim)"
              aria-label="Discord"
            >
              <svg viewBox="0 0 20 19" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M16.224 3.768a14.5 14.5 0 0 0-3.67-1.153c-.158.286-.343.67-.47.976a13.5 13.5 0 0 0-4.067 0c-.128-.306-.317-.69-.476-.976A14.4 14.4 0 0 0 3.868 3.77C1.546 7.28.916 10.703 1.231 14.077a14.7 14.7 0 0 0 4.5 2.306q.545-.748.965-1.587a9.5 9.5 0 0 1-1.518-.74q.191-.14.372-.293c2.927 1.369 6.107 1.369 8.999 0q.183.152.372.294-.723.437-1.52.74c.418.838.963 1.588a14.6 14.6 0 0 0 4.504-2.308c.37-3.911-.63-7.302-2.644-10.309m-9.13 8.234c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.894 0 1.614.82 1.599 1.82.001 1-.705 1.82-1.6 1.82m5.91 0c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.893 0 1.614.82 1.599 1.82.001 1-.706 1.82-1.6 1.82" />
              </svg>
            </a>
            <a
              href="https://bsky.app/profile/odetecegim.bsky.social"
              target="_blank"
              rel="noopener noreferrer"
              className={SOCIAL_BTN}
              title="Bluesky (@odetecegim)"
              aria-label="Bluesky"
            >
              <svg viewBox="0 0 16 17" className="w-4 h-4" aria-hidden="true">
                <g clipPath="url(#zula-bsky-clip)">
                  <path
                    fill="currentColor"
                    d="M7.75 7.735c-.693-1.348-2.58-3.86-4.334-5.097-1.68-1.187-2.32-.981-2.74-.79C.188 2.065.1 2.812.1 3.251s.241 3.602.398 4.13c.52 1.744 2.367 2.333 4.07 2.145-2.495.37-4.71 1.278-1.805 4.512 3.196 3.309 4.38-.71 4.987-2.746.608 2.036 1.307 5.91 4.93 2.746 2.72-2.746.747-4.143-1.747-4.512 1.702.189 3.55-.4 4.07-2.145.156-.528.397-3.691.397-4.13s-.088-1.186-.575-1.406c-.42-.19-1.06-.395-2.741.79-1.755 1.24-3.64 3.752-4.334 5.099"
                  />
                </g>
                <defs>
                  <clipPath id="zula-bsky-clip">
                    <path d="M.1.85h15.3v15.3H.1z" />
                  </clipPath>
                </defs>
              </svg>
            </a>
            <a
              href="mailto:odetecegim@gmail.com"
              className={SOCIAL_BTN}
              title="odetecegim@gmail.com"
              aria-label="E-posta"
            >
              <Mail className="w-4 h-4" />
            </a>
          </div>
          <a
            href="mailto:odetecegim@gmail.com"
            className="block text-center text-[11px] text-slate-400 hover:text-indigo-300 transition-colors break-all"
          >
            odetecegim@gmail.com
          </a>
          <div className="text-center text-[10px] text-slate-500 font-medium">
            MadByte & Zula CRM Platform © 2026
          </div>
        </div>
      </div>
    </aside>
  );
};

