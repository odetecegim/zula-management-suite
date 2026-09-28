import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ArrowRight, Check } from 'lucide-react';
import { languages } from '../i18n';

const SELECTED_KEY = 'zula_lang_selected';

export default function LanguageSelectionOverlay() {
  const { i18n, t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string>(i18n.language || 'tr');

  // Yalnizca ilk acilista gosterilir; secim kalici olarak saklanir
  useEffect(() => {
    if (!localStorage.getItem(SELECTED_KEY)) setVisible(true);
  }, []);

  const confirm = () => {
    i18n.changeLanguage(selected);
    localStorage.setItem(SELECTED_KEY, '1');
    localStorage.setItem('i18nextLng', selected);
    setVisible(false);
  };

  if (!visible) return null;

  const active = languages.filter((l) => l.enabled);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
            <Globe className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {t('languageSelection')}
          </h2>
          <p className="text-slate-400 text-sm">{t('languageSelectionSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {active.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelected(lang.code)}
              className={
                'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 text-left ' +
                (selected === lang.code
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50')
              }
            >
              <span className="text-xl">{lang.flag}</span>
              <span className="font-medium">{lang.name}</span>
              {selected === lang.code && <Check className="ml-auto w-4 h-4" />}
            </button>
          ))}
        </div>

        <button
          onClick={confirm}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-600/10 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
        >
          {t('languageContinue')}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
