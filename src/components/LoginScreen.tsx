import React, { useState } from 'react';
import type { Member } from '../types';
import { LogIn, AlertCircle, User, Lock, ShieldCheck, Globe, Eye, EyeOff } from 'lucide-react';
import { remoteLogin } from '../lib/members-api';
import { normalizePermissions } from '../data/initialData';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n';

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

  const finish = (member: Member) => {
    // Pasif hesap ve yetkisiz hesap engelleri
    if (member.status === 'Pasif') {
      setError('Hesabınız pasif durumda. Yöneticinizle iletişime geçin.');
      setLoading(false);
      return;
    }
    if (!member.permissions || member.permissions.length === 0) {
      setError('Hesabınıza panel erişimi verilmemiş. Yöneticinizle iletişime geçin.');
      setLoading(false);
      return;
    }
    setLoading(false);
    onLogin(member);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanUser || !cleanPass) {
      setError('Kullanıcı adı ve şifre giriniz.');
      setLoading(false);
      return;
    }

    // 1) SUNUCUDA DOGRULA (asil kaynak: Google Sheets)
    const remote = await remoteLogin(cleanUser, cleanPass);

    if (remote.status === 'ok') {
      // Sunucudan gelen uyede izinler virgüllü METIN olabilir
      // ("dashboard,members"). Dizye cevrilmeden gonderilirse
      // LoginScreen "yetkisiz" deyip girisi reddeder.
      finish({
        ...remote.member,
        permissions: normalizePermissions(remote.member.permissions, remote.member.role),
      });
      return;
    }

    // 2) YEREL YEDEK: yalnizca kullanici adi + sifre birebir uyusuyorsa
    //
    // DIKKAT: onceki surumde bu kontrol "admin rolune sahipse" ekranin
    // hicbir sekilde gecmemesine yol aciyordu. Artik rol bakimi
    // YAPILMAZ: kullanici adin ve sifresi dogruysa giris acilir.
    const local = members.find(
      (m) =>
        (m.username ?? '').toLowerCase() === cleanUser ||
        m.tagId.toLowerCase() === cleanUser ||
        (m.email ?? '').toLowerCase() === cleanUser
    );

    if (local && local.password && local.password === cleanPass) {
      finish({ ...local, permissions: normalizePermissions(local.permissions, local.role) });
      return;
    }

    // 3) Hata mesaji
    if (remote.status === 'unavailable') {
      // Sunucuya ulasilamadi ve yerelde de eslesme yok
      const found = members.some(
        (m) =>
          (m.username ?? '').toLowerCase() === cleanUser ||
          m.tagId.toLowerCase() === cleanUser
      );
      setError(
        found
          ? 'Sunucuya ulaşılamıyor ve şifre bu tarayıcıda kayıtlı değil. Lütfen tekrar deneyin.'
          : 'Bu kullanıcı adı sistemde bulunamadı.'
      );
    } else {
      setError('Kullanıcı adı veya şifre hatalı.');
    }
    setLoading(false);
  };

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
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
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
