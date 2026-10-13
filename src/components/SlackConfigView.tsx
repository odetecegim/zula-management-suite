import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, LogIn, Send, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  testSlackConnection,
  sendManualMessage,
  checkSlackToken,
  listSlackChannels,
  type SlackChannel,
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

  // --- COK KANALLI GONDERIM --------------------------------------------
  // Botun uyesi oldugu / gorebildigi kanallar; kullanici bunlar arasindan
  // secip ayri ayri mesaj gonderebilir. Webhook modunda kanal listesi
  // bos olur ve secici gizlenir (tek sabit kanal).
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState(''); // '' = varsayilan kanal
  const [channelsLoading, setChannelsLoading] = useState(false);
  // Kanal listesi alinamazsa SEBEP burada tutulur ve ekranda gosterilir.
  // (Önceki hâlde hata tamamen yutuluyordu: secici sessizce gizleniyor,
  //  kullanıcı "kanal seçme yeri yok" diyor, nedenini göremiyordu.)
  const [channelsError, setChannelsError] = useState('');

  // --- MANUEL KANAL EKLEME -------------------------------------------
  // Bot tokeninda `channels:read` izni olmadan da (yalnizca `chat:write`
  // ile) bir kanala mesaj ATILABILIR; eksik olan sadece kanallari
  // LISTELEYEBilmek. Bu yuzden kullanici kanal ID'sini elle girer; kanal
  // tarayicida saklanir ve seciciye eklenir. Boylece Slack'ta hicbir
  // ek izin / reinstall gerektirmeden cok kanalli gonderim calisir.
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');

  const MANUAL_CHANNELS_KEY = 'zula_slack_manual_channels';

  const loadManualChannels = (): SlackChannel[] => {
    try {
      const raw = localStorage.getItem(MANUAL_CHANNELS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SlackChannel[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((c) => c && typeof c.id === 'string' && c.id.length > 0);
    } catch {
      return [];
    }
  };

  const saveManualChannels = (list: SlackChannel[]) => {
    try {
      localStorage.setItem(MANUAL_CHANNELS_KEY, JSON.stringify(list));
    } catch {
      /* depolama kapali olabilir */
    }
  };

  const addManualChannel = () => {
    const id = manualId.trim();
    // Slack kanal ID'si C/G/D ile baslar. Hatali girisi erken yakala:
    // yoksa mesaj gonderiminde "channel_not_found" alinir.
    if (!/^[CGD][A-Z0-9]{4,}$/i.test(id)) {
      setChannelsError(t('slackManualInvalidId'));
      return;
    }
    const name = manualName.trim() || id;
    const manual = loadManualChannels();
    const channel: SlackChannel = {
      id,
      name,
      isPrivate: /^G/i.test(id),
      isMember: true,
    };
    const nextManual = [...manual.filter((c) => c.id !== id), channel];
    saveManualChannels(nextManual);
    setChannels((prev) => [...prev.filter((c) => c.id !== id), channel]);
    setSelectedChannel(id);
    setManualId('');
    setManualName('');
    setChannelsError('');
  };

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

  // Sunucudan gelen kanal-listesi hata kodunu kullaniciya anlasilir bir
  // mesaja cevirir. Özellikle missing_scope: bot'a kanal okuma izni
  // eklenmemisse secici hic cikmazdi; artik nedenini açikça söyleriz.
  const describeChannelError = (msg: string): string => {
    const m = String(msg || '').toLowerCase();
    if (m.includes('missing_scope') || m.includes('channel_list_bot_only')) {
      return t('slackChannelScopeHint');
    }
    if (m.includes('invalid_auth') || m.includes('token')) {
      return t('slackChannelTokenHint');
    }
    return msg || t('slackChannelError');
  };

  // Kanallari sunucudan cek (bir kez, mount aninda). Webhook modunda
  // sunucu bos liste doner; secici o zaman hic gorunmez.
  const loadChannels = async () => {
    setChannelsLoading(true);
    const manual = loadManualChannels();
    const res = await listSlackChannels();
    setChannelsLoading(false);
    // Otomatik liste (channels:read ile) + manuel eklenen kanallar birlestirilir.
    // Manuel kanallar her zaman korunur; otomatik liste onlari ezmez.
    const auto = res.ok && res.channels.length > 0 ? res.channels : [];
    const merged: SlackChannel[] = [...auto];
    for (const m of manual) {
      if (!merged.some((c) => c.id === m.id)) merged.push(m);
    }
    if (merged.length > 0) {
      setChannels(merged);
      setChannelsError('');
      const firstMember = merged.find((c) => c.isMember);
      if (firstMember) setSelectedChannel((prev) => prev || firstMember.id);
      return;
    }
    // Hic kanal yok (otomatik liste de basarisiz). Manuel ekleme formunu
    // gostermek icin sebebi ekranda birakiyoruz.
    setChannels([]);
    setSelectedChannel('');
    setChannelsError(describeChannelError(res.message));
  };

  useEffect(() => {
    void loadChannels();
  }, []);

  const handleSlackSend = async () => {
    if (readOnly || !slackMessage.trim()) return;
    setSlackSending(true);
    setSlackNotice(null);
    // Secili kanal varsa ona, yoksa sunucu varsayilan kanalina gider.
    const res = await sendManualMessage(slackMessage.trim(), selectedChannel || undefined);
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
          {/* Kanal secici — yalnizca bot modunda ve kanal varsa gorunur.
              Webhook modunda sunucu bos liste doner; secici gizlenir. */}
          {channels.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-400">
                  {t('slackChannelLabel')}
                </label>
                <button
                  onClick={() => void loadChannels()}
                  disabled={channelsLoading || readOnly}
                  title={t('slackChannelRefresh')}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3 h-3 ${channelsLoading ? 'animate-spin' : ''}`} />
                  {t('slackChannelRefresh')}
                </button>
              </div>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                disabled={readOnly}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* '' = sunucu varsayilan kanali (SLACK_CHANNEL_ID) */}
                <option value="">{t('slackChannelDefault')}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.isPrivate ? '🔒 ' : '# '}
                    {c.name}
                    {c.isMember ? '' : ` (${t('slackChannelNotMember')})`}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1.5">
                {t('slackChannelHint')}
              </p>
            </div>
          )}

          {/* Kanal listesi ALINAMADIysa sebebini göster (artık sessiz kalmıyor). */}
          {channels.length === 0 && channelsError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-[11px] font-semibold text-amber-200 mb-1">
                {t('slackChannelError')}
              </p>
              <p className="text-[11px] text-amber-100/80 leading-relaxed">
                {channelsError}
              </p>
              <button
                onClick={() => void loadChannels()}
                disabled={channelsLoading || readOnly}
                className="mt-2 flex items-center gap-1 text-[11px] text-amber-200 hover:text-amber-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3 h-3 ${channelsLoading ? 'animate-spin' : ''}`} />
                {t('slackChannelRefresh')}
              </button>
            </div>
          )}

          {/* Manuel kanal ekleme — channels:read izni gerekmez (chat:write yeter).
              Kullanici kanal ID'sini elle girer; kanal seciciye eklenir ve
              tarayicida saklanir. Boylece Slack reinstall olmadan cok kanalli
              gonderim calisir. */}
          {!readOnly && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] font-semibold text-slate-300 mb-2">
                {t('slackManualTitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder={t('slackManualIdPlaceholder')}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                />
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={t('slackManualNamePlaceholder')}
                  className="sm:w-40 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                />
                <button
                  onClick={addManualChannel}
                  disabled={!manualId.trim()}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {t('slackManualAdd')}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                {t('slackManualHint')}
              </p>
            </div>
          )}

          {/* Manuel mesaj — cok satirli (textarea): yapistirilan metin aynen,
              satir bosluklariyla birlikte gider. Karakter siniri YOK. */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              {t('slackSendMessage')}
            </label>
            <div className="flex flex-col gap-2">
              <textarea
                value={slackMessage}
                onChange={(e) => setSlackMessage(e.target.value)}
                onKeyDown={(e) => {
                  // Enter = yeni satir. Gondermek icin Ctrl (veya Mac'te Cmd)+Enter.
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !readOnly) {
                    e.preventDefault();
                    handleSlackSend();
                  }
                }}
                placeholder={t('slackPlaceholder')}
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600 resize-y leading-relaxed whitespace-pre-wrap"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {t('slackMultilineHint')}
                </p>
                <button
                  onClick={handleSlackSend}
                  disabled={readOnly || !slackMessage.trim() || slackSending}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {slackSending ? t('slackSending') : t('slackSend')}
                </button>
              </div>
            </div>
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

