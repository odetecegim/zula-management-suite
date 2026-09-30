import React, { useState } from 'react';
import type { Member } from '../types';
import { LogIn, AlertCircle, User, Lock, ShieldCheck, Globe, Eye, EyeOff } from 'lucide-react';
import { remoteLogin } from '../lib/members-api';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n';

/**
 * Kurucu hesabin giriş bilgileri.
 * Tarayıcı verisi bozulsa bile bu hesap her zaman bu bilgilerle açılır.
 */
const FOUNDER_USERNAME = 'huseyin';
const FOUNDER_PASSWORD = 'admin123';

interface LoginScreenProps {
  members: Member[];
  onLogin: (member: Member) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ members, onLogin }) => {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanUser = username.trim();
    const clean = cleanUser.toLowerCase();

    // KURUCU HESABI: yetkiler App tarafinda zaten sabitleniyor.
    // Yerel listede bozuk/eksik kayit olsa bile giriş her zaman calisir.
    const founder = members.find((m) => m.username?.toLowerCase() === FOUNDER_USERNAME);
    if (
      clean === FOUNDER_USERNAME &&
      password === FOUNDER_PASSWORD &&
      founder
    ) {
      setLoading(false);
      onLogin(founder);
      return;
    }

    const findLocal = (): Member | undefined =>
      members.find(
        (m) =>
          (m.username ?? '').toLowerCase() === clean ||
          m.tagId.toLowerCase() === clean ||
          (m.email ?? '').toLowerCase() === clean
      );

    const finish = (member: Member) => {
      if (member.status === 'Pasif') {
        setError(t('accountInactive'));
        setLoading(false);
        return;
      }
      if (!member.permissions || member.permissions.length === 0) {
        setError(t('noAccess'));
        setLoading(false);
        return;
      }
      setLoading(false);
      onLogin(member);
    };

    // 1) Once sunucuda dogrula (sifre duz metin olarak istemcide tutulmaz)
    const remote = await remoteLogin(cleanUser, password);

    if (remote.status === 'ok') {
      finish(remote.member);
      return;
    }

    // 2) Yerel kayitla dogrula
    //
    // Sunucu "invalid" donse bile yerel kayit birebir uyuyorsa giris verilir;
    // AKSI HALDE YONETICI HESABI KILITLENIR: Sheets tablosu bos/silinmis ya da
    // sifre ozeti degismis olsa bile panelde hicbir zaman giris yapilamaz.
    // Yalnizca yonetici rolleri icin gecerli bir kurtarma yoludur.
    const local = findLocal();
    const localMatches = !!local && !!local.password && local.password === password;

    if (localMatches && local) {
      const isAdminRole = local.role === 'super_admin' || local.role === 'company_manager';
      if (remote.status === 'unavailable' || isAdminRole) {
        finish(local);
        return;
      }
    }

    if (members.length === 0) {
      setError(t('noAccountHint'));
      setLoading(false);
      return;
    }

    setError(t('loginFailed'));
    setLoading(false);
  };

  /** Giriş başarısız: kullanıcıya ne yapması gerektiğini söyleyen yardım metni */
  const errorHint = (() => {
    if (!error) return '';
    const e = error.toLowerCase();
    if (e.includes('şifre') || e.includes('sifre') || e.includes('password'))
      return 'Kullanıcı adı büyük/küçük harfe duyarsızdır. Şifreyi girerken büyük harf (Shift) açık olabilir.';
    return '';
  })();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Arka plan dekorları */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Başlık */}
        <div className="text-center mb-8 space-y-3">
          <img
            src="/zula-logo.png"
            srcSet="/zula-logo@2x.png 2x, /zula-logo@3x.png 3x"
            width={256}
            height={101}
            alt="Zula"
            className="mx-auto h-16 w-auto object-contain drop-shadow-[0_6px_30px_rgba(245,158,11,0.4)]"
          />
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">{t('brandName')}</h1>
            <p className="text-sm text-indigo-400 font-medium">{t('academyLabel')}</p>
          </div>

          {/* Giris yapmadan once de dil degistirilebilir */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                title={lang.name}
                className={
                  'px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ' +
                  (i18n.language === lang.code
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800')
                }
              >
                {lang.flag} {lang.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Form Kartı */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-5">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">{t('secureLogin')}</span>
          </div>

          {error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              {errorHint && (
                <p className="text-[11px] text-slate-500 leading-relaxed px-1">{errorHint}</p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('username')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder={t('usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-12 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
                />
                {/* Şifreyi göster / gizle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer"
                  title={showPassword ? t('hidePassword') : t('showPassword')}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm px-5 py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <LogIn className="w-4 h-4" />
              {loading ? t('loginInProgress') : t('loginButton')}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-[11px] text-slate-500">{t('noAccountHint')}</p>
          </div>
        </div>

        <div className="text-center mt-6 text-[11px] text-slate-600">
          MadByte & Zula CRM Platform © 2026 · {t('developer')}:{' '}
          <span className="text-slate-500">@odetecegim</span>
        </div>
      </div>
    </div>
  );
};
