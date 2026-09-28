import React, { useState } from 'react';
import type { Member } from '../types';
import { LogIn, AlertCircle, User, Lock, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  members: Member[];
  onLogin: (member: Member) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ members, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Basit doğrulama (mock)
    setTimeout(() => {
      const cleanUser = username.trim().toLowerCase();
      // Kullanıcı adı, üye kodu (ZULA-001) veya e-posta ile giriş yapılabilir
      const member = members.find(
        (m) =>
          (m.username ?? '').toLowerCase() === cleanUser ||
          m.tagId.toLowerCase() === cleanUser ||
          (m.email ?? '').toLowerCase() === cleanUser
      );

      if (!member || !member.password || member.password !== password) {
        setError('Kullanıcı adı veya şifre hatalı.');
        setLoading(false);
        return;
      }

      if (member.status === 'Pasif') {
        setError('Hesabınız pasif durumda. Yöneticinizle iletişime geçin.');
        setLoading(false);
        return;
      }

      if (!member.permissions || member.permissions.length === 0) {
        setError('Hesabınıza henüz panel erişimi verilmemiş. Yöneticinizle iletişime geçin.');
        setLoading(false);
        return;
      }

      setLoading(false);
      onLogin(member);
    }, 350);
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
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Zula Suite</h1>
            <p className="text-sm text-indigo-400 font-medium">Test & Topluluk Yönetim Paneli</p>
          </div>
        </div>

        {/* Form Kartı */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-5">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Güvenli Giriş</span>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Kullanıcı Adı</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="Kullanıcı adınız"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Şifreniz"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm px-5 py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Giriş yapılıyor...' : 'Panele Giriş Yap'}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-[11px] text-slate-500">
              Hesabınız yoksa yöneticinizden panel erişimi talep edin.
            </p>
          </div>
        </div>

        <div className="text-center mt-6 text-[11px] text-slate-600">
          MadByte & Zula CRM Platform © 2026 · Geliştirici: <span className="text-slate-500">@odetecegim</span>
        </div>
      </div>
    </div>
  );
};
