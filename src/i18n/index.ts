import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import tr from './tr';
import en from './en';
import pt from './pt';
import es from './es';

/**
 * Aktif diller.
 *
 * Pasif dil icin listede `enabled: false` y bos bir <kod>.ts dosyasi
 * yeterlidir; anahtar eksikse Turkce'ye (fallback) donulur.
 *
 * Yeni dil eklemek icin: 1) i18n/<kod>.ts olustur, 2) languages
 * listesine ekle, 3) resources'e kaydet.
 */
export const languages = [
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', enabled: true },
  { code: 'en', name: 'English', flag: '🇺🇸', enabled: true },
  { code: 'pt', name: 'Português', flag: '🇧🇷', enabled: true },
  { code: 'es', name: 'Español', flag: '🇪🇸', enabled: true },
];

const resources = {
  tr: { translation: tr },
  en: { translation: en },
  pt: { translation: pt },
  es: { translation: es },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Ceviri eklenmedigi anahtarlar Turkce'ye doner (bos ekran olmaz)
    fallbackLng: 'tr',
    supportedLngs: ['tr', 'en', 'pt', 'es'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
