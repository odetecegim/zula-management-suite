import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, LogIn, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  testSlackConnection,
  sendManualMessage,
  checkSlackToken,
} from '../lib/slack';

/** Slack'in resmi 4 nokta logosu (lucide'de marka ikonu yok). */
const SlackIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.52-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.269a2.528 2.528 0 0 1 2.52 2.522 2.528 2.528 0 0 1-2.52 2.52H2.52V8.833a2.528 2.528 0 0 1 2.522-2.52h2.792zm9.334 9.334a2.528 2.528 0 0 1 2.52 2.52 2.528 2.528 0 0 1-2.52 2.522h-2.52v-2.52a2.528 2.528 0 0 1 2.52-2.522 2.528 2.528 0 0 1 2.522 2.522v-.002zm-1.272 0a2.528 2.528 0 0 1-2.52-2.52 2.528 2.528 0 0 1 2.52-2.52h6.314a2.528 2.528 0 0 1 2.522 2.52 2.528 2.528 0 0 1-2.522 2.52H8.834zM18.166 5.042a2.528 2.528 0 0 1 2.521-2.52A2.528 2.528 0 0 1 24 5.042a2.527 2.527 0 0 1-2.522 2.52h-2.52V5.042h-.833zm0 1.269a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521v6.314a2.528 2.528 0 0 1 2.521 2.522 2.528 2.528 0 0 1 2.522-2.522V6.31zM8.834 18.166a2.528 2.528 0 0 1 2.522 2.52A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.52-2.522v-2.52h2.52v-.334zm0-1.268a2.528 2.528 0 0 1-2.52-2.522 2.528 2.528 0 0 1 2.52-2.522h6.313a2.528 2.528 0 0 1 2.522 2.52H8.834z" />
  </svg>
);

interface SlackConfigViewProps {
  readOnly?: boolean;
  onForceRelogin?: () => void;
}

export const SlackConfigView: React.FC<SlackConfigViewProps> = ({ readOnly = false, onForceRelogin }) => {
  const { t } = useTranslation();
  const [slackStatus, setSlackStatus] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle');
  const [slackMessage, setSlackMessage] = useState('');
  const [slackSending, setSlackSending] = useState(false);
  const [slackChecking, setSlackChecking] = useState(false);
  const [slackNotice, setSlackNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Hata "yeniden giriş yapın" gerektiriyor mu? (401 / oturum gerekli)
  const needsLogin = Boolean(
    slackNotice &&
      !slackNotice.ok &&
      /oturum|giriş yap|401/i.test(slackNotice.text)
  );

  // SESSION_SECRET tanimli degilse oturumlar her deploy'da sifirlanir.
  const [sessionSecretSet, setSessionSecretSet] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sheets/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setSessionSecretSet(d.sessionSecretSet === true);
      })
      .catch(() => {
        /* sunucu kapali olabilir; sessizce gec */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSlackTest = async () => {
    if (readOnly) return;
    setSlackStatus('testing');
    setSlackNotice(null);
    const res = await testSlackConnection();
    if (res.ok) {
      setSlackStatus('ready');
      setSlackNotice({ ok: true, text: res.message || t('slackNoticeSent') });
    } else if (!res.configured) {
      setSlackStatus('idle');
      setSlackNotice({ ok: false, text: res.message || t('slackNotConfigured') });
    } else {
      setSlackStatus('error');
      setSlackNotice({ ok: false, text: res.message || t('slackConnectionFailed') });
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

  return (
    <div className="space-y-6">
      {/* ---- SLACK BILDIRIMLERI ---- */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <SlackIcon />
              {t('slackAlertsTitle')}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('slackAlertsSubtitle')}
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
                ? t('slackConnected')
                : slackStatus === 'testing'
                  ? t('slackTesting')
                  : slackStatus === 'error'
                    ? t('slackError')
                    : t('slackDisconnected')}
            </span>
            <button
              onClick={handleSlackCheck}
              disabled={readOnly || slackChecking}
              title={t('slackTokenCheckTitle')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {slackChecking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SlackIcon />
              )}
              {t('slackTokenCheck')}
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
              {t('slackTest')}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Manuel mesaj */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              {t('slackSendMessage')}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={slackMessage}
                onChange={(e) => setSlackMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !readOnly) handleSlackSend();
                }}
                placeholder={t('slackPlaceholder')}
                maxLength={500}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
              />
              <button
                onClick={handleSlackSend}
                disabled={readOnly || !slackMessage.trim() || slackSending}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {slackSending ? t('slackSending') : t('slackSend')}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              {slackMessage.length}/{t('slackCharLimit')}
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
          {needsLogin && onForceRelogin && (
            <button
              onClick={onForceRelogin}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold transition-colors cursor-pointer w-full"
            >
              <LogIn className="w-4 h-4" />
              Oturumu Yenile — Giriş Ekranına Dön
            </button>
          )}

          {/* SESSION_SECRET tanimli degilse oturumlar her deploy'da sifirlanir. */}
          {sessionSecretSet === false && (
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-200 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold mb-1">Sürekli oturum kapanmasının nedeni bulundu</div>
                Sunucuda <b>SESSION_SECRET</b> ortam değişkeni tanımlı değil. Bu durumda sunucu
                her yeniden başlatmada geçici bir imzalama anahtarı üretir; bu yüzden oturumunuz
                12 saat dolmadan kapanır.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sunucuya baglanma kurulumlarini goster */}
      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1.5">
        <div className="font-bold text-slate-300 text-xs mb-1">{t('slackSetupHeading')}</div>
        <p>{t('slackSetupStep1')}</p>
        <p>{t('slackSetupStep2')}</p>
        <p>{t('slackSetupStep3')}</p>
        <p className="pt-1 border-t border-slate-800">{t('slackSetupSecurity')}</p>
      </div>
    </div>
  );
};

