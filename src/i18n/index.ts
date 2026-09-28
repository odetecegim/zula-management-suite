import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import tr from './tr';
import en from './en';

/**
 * Aktif diller.
 *
 * Eskiden kullanilan panel 7 dilliydi; burada yalnizca Turkce ve
 * Ingilizce gercekten cevrildi. Diger diller bilerek pasif birakildi:
 * yari ceviri gostermek yerine Turkce'ye (fallback) dusunmek daha iyi.
 *
 * Yeni bir dil eklemek icin: 1) i18n/<kod>.ts olustur, 2) languages
 * listesine ekle, 3) resources'e kaydet.
 */
export const languages = [
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', enabled: true },
  { code: 'en', name: 'English', flag: '🇺🇸', enabled: true },
  { code: 'az', name: 'Azərbaycan', flag: '🇦🇿', enabled: false },
  { code: 'pt', name: 'Português', flag: '🇧🇷', enabled: false },
  { code: 'es', name: 'Español', flag: '🇪🇸', enabled: false },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', enabled: false },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', enabled: false },
];

const resources = {
  tr: { translation: tr },
  en: { translation: en },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Ceviri eklenmedigi anahtarlar Turkce'ye doner (bos ekran olmaz)
    fallbackLng: 'tr',
    supportedLngs: ['tr', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
