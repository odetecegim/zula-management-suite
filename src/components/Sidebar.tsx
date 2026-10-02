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
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n';
import type { Member, PermissionId } from '../types';

const MAIL_TO = 'odetecegim@gmail.com';

/**
 * Iletisim kanallari.
 *
 * `hover` alani her platformun KENDI marka rengini verir; boylece
 * fare/dokunma uzerine gelince ikon o platformun rengine donusur.
 * Renkler kaynakta degil, burada tek yerde tutulur.
 */
const SOCIALS: {
  id: string;
  title: string;
  href: string;
  external: boolean;
  hover: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'instagram',
    title: 'Instagram (@odetecegim)',
    href: 'https://instagram.com/odetecegim',
    external: true,
    hover: 'hover:bg-[#E1306C]/10 hover:text-[#E1306C] hover:border-[#E1306C]/30',
    icon: (
      // Resmi Instagram logosu: yuvarlak govde + mercek + nokta
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.675.675 1.249 1.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.675.675-1.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.675-.675-1.249-1.242-1.311-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.675-.675 1.249-1.242 3.608-1.311C8.416 2.175 8.796 2.163 12 2.163zm0 1.802c-3.15 0-3.494.012-4.728.068-1.04.048-1.684.22-2.078.614-.394.394-.566 1.037-.614 2.078C4.638 9.69 4.626 10.034 4.626 12s.012 2.31.068 4.544c.048 1.041.22 1.684.614 2.078.394.394 1.037.566 2.078.614 1.234.056 1.578.068 4.728.068s3.494-.012 4.728-.068c1.041-.048 1.684-.22 2.078-.614.394-.394.566-1.037.614-2.078.056-1.234.068-1.578.068-4.728s-.012-3.494-.068-4.728c-.048-1.041-.22-1.684-.614-2.078-.394-.394-1.037-.566-2.078-.614C15.494 3.977 15.15 3.965 12 3.965zm0 3.405a4.63 4.63 0 110 9.26 4.63 4.63 0 010-9.26zm0 1.802a2.828 2.828 0 100 5.656 2.828 2.828 0 000-5.656zm5.658-.835a1.081 1.081 0 11-2.163 0 1.081 1.081 0 012.163 0z" />
      </svg>
    ),
  },
  {
    id: 'github',
    title: 'GitHub (@odetecegim)',
    href: 'https://github.com/odetecegim',
    external: true,
    hover: 'hover:bg-white/10 hover:text-white hover:border-white/20',
    icon: (
      <svg viewBox="0 0 19 19" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    title: 'TikTok (@odetecegim)',
    href: 'https://tiktok.com/@odetecegim',
    external: true,
    hover: 'hover:bg-[#25F4EE]/10 hover:text-[#25F4EE] hover:border-[#25F4EE]/30',
    icon: (
      // Resmi TikTok logosu
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
  {
    id: 'discord',
    title: 'Discord (@odetecegim)',
    href: 'https://discord.com/users/odetecegim',
    external: true,
    hover: 'hover:bg-[#5865F2]/10 hover:text-[#5865F2] hover:border-[#5865F2]/30',
    icon: (
      <svg viewBox="0 0 20 19" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M16.224 3.768a14.5 14.5 0 0 0-3.67-1.153c-.158.286-.343.67-.47.976a13.5 13.5 0 0 0-4.067 0c-.128-.306-.317-.69-.476-.976A14.4 14.4 0 0 0 3.868 3.77C1.546 7.28.916 10.703 1.231 14.077a14.7 14.7 0 0 0 4.5 2.306q.545-.748.965-1.587a9.5 9.5 0 0 1-1.518-.74q.191-.14.372-.293c2.927 1.369 6.107 1.369 8.999 0q.183.152.372.294-.723.437-1.52.74c.418.838.963 1.588 1.52.74a14.6 14.6 0 0 0 4.504-2.308c.37-3.911-.63-7.302-2.644-10.309m-9.13 8.234c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.894 0 1.614.82 1.599 1.82.001 1-.705 1.82-1.6 1.82m5.91 0c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.893 0 1.614.82 1.599 1.82.001 1-.706 1.82-1.6 1.82" />
      </svg>
    ),
  },
  {
    id: 'mail',
    title: 'E-posta gönder',
    href: `mailto:${MAIL_TO}`,
    external: false,
    hover: 'hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30',
    icon: <Mail className="w-4 h-4" />,
  },
];

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  allowedTabs: PermissionId[];
  currentUser: Member;
  isAdmin: boolean;
  onLogout: () => void;
  /** Mobilde menunun acik kapali durumu */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  allowedTabs,
  currentUser,
  isAdmin,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = React.useState(false);
  // Logoya tiklayinca acilan cikis butonunun gorunur olmasi
  const [logoutOpen, setLogoutOpen] = React.useState(false);

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
    <>
      {/* MOBIL: arkadaki karartma -> dokununca menu kapanir */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      <aside
        className={
          'w-72 bg-slate-950/95 border-r border-slate-800/80 flex flex-col justify-between p-4 h-screen shrink-0 backdrop-blur-xl ' +
          // masaustunde sabit kolon, mobilde sagdan acilan cekmece
          'fixed lg:sticky top-0 left-0 z-50 transition-transform duration-300 ease-out ' +
          (mobileOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full lg:translate-x-0')
        }
      >
        {/* Mobilde kapatma butonu */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          aria-label="Menüyü kapat"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand */}
      <div className="space-y-6">
        {/*
          MOBILDE CIKIS BUTONU:
          Once buton profil kartinin en altindaydi; mobilde yanlis
          yonlendirmis, ekranin dibinde kalip ulasilmaz oluyordu.
          Artik LOGOYA dokununca profil kartinin hemen altinda beliren
          bir cikis butonu acilir. Logonun yaninda kucuk bir isaret
          cikar ("cikis burada") kullanicinin nereye dokunacagini
          gosterir.
        */}
        <button
          onClick={() => setLogoutOpen((v) => !v)}
          aria-expanded={logoutOpen}
          className="w-full flex items-center gap-3 px-2 pt-2 text-left rounded-xl hover:bg-slate-900/60 active:scale-[0.99] transition-all cursor-pointer"
          title="Çıkış seçenekleri"
        >
          <img
            src="/zula-logo.png"
            srcSet="/zula-logo@2x.png 2x, /zula-logo@3x.png 3x"
            width={256}
            height={101}
            alt="Zula"
            className="h-9 w-auto object-contain drop-shadow-[0_2px_12px_rgba(245,158,11,0.45)]"
          />
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-sm tracking-wide text-white uppercase">Zula Teşkilat</div>
            <div className="text-[11px] text-indigo-400 font-medium">Akademi</div>
          </div>
          <LogOut
            className={
              'w-4 h-4 shrink-0 transition-all ' +
              (logoutOpen ? 'text-rose-400 rotate-0' : 'text-slate-600')
            }
          />
        </button>

        {/* Logoya tiklayinca acilan cikis butonu */}
        {logoutOpen && (
          <button
            onClick={() => {
              setLogoutOpen(false);
              onLogout();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 hover:text-rose-200 text-xs font-bold transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Oturumu Kapat
          </button>
        )}

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
                  onClick={() => {
                    onSelectTab(item.id);
                    setLogoutOpen(false); // cikis menusu acik kalmasin
                    onCloseMobile(); // mobilde secim sonrasi menuyu kapat
                  }}
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
          {/*
            Profil kartindaki cikis butonu artik YALNIZCA masaustunde
            gorunur. Mobilde cikis, logonun altinda acilan butonla
            yapilir; buradaki buton ekranin dibinde kalip erisilemez
            oldugu icin lg:hidden ile gizlenir.
          */}
          <button
            onClick={onLogout}
            className="hidden lg:block p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
            title={t('logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Social Links */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
            {t('developerContact')}
          </div>
          <div className="flex items-center justify-center gap-2 text-slate-400">
            {SOCIALS.map((s) => (
              <a
                key={s.id}
                href={s.href}
                target={s.external ? '_blank' : undefined}
                rel={s.external ? 'noopener noreferrer' : undefined}
                className={
                  'p-2 rounded-lg bg-slate-900 border border-transparent text-slate-500 ' +
                  'transition-all duration-200 hover:scale-110 hover:text-white ' +
                  s.hover
                }
                title={s.title}
                aria-label={s.title}
              >
                {s.icon}
              </a>
            ))}
          </div>
          <a
            href={`mailto:${MAIL_TO}`}
            className="block text-center text-[11px] text-slate-400 hover:text-indigo-300 transition-colors break-all"
          >
            {MAIL_TO}
          </a>
          <div className="text-center text-[10px] text-slate-500 font-medium">
            MadByte & Zula CRM Platform © 2026
          </div>
        </div>
      </div>
      </aside>
    </>
  );
};

