import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { t, type AppLang } from '@/lib/i18n';
import { nativeStrings } from '@/lib/native-strings';

const LANG_KEY = 'ascnd_lang';

/**
 * First-launch language: follow the device locale (Vietnamese devices
 * get vi, everyone else en) until the user explicitly picks one. Uses
 * the built-in Intl locale — no extra native module.
 */
function deviceDefaultLang(): AppLang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return locale.toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

const SettingsContext = createContext<{
  lang: AppLang;
  setLang: (l: AppLang) => void;
}>({ lang: 'en', setLang: () => {} });

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(deviceDefaultLang);

  useEffect(() => {
    // A stored choice always wins over the device default
    AsyncStorage.getItem(LANG_KEY).then((v) => {
      if (v === 'vi' || v === 'en') setLangState(v);
    });
  }, []);

  const setLang = (l: AppLang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  };

  return <SettingsContext.Provider value={{ lang, setLang }}>{children}</SettingsContext.Provider>;
}

export function useAppSettings() {
  return useContext(SettingsContext);
}

/**
 * Ported web dictionary + native-only strings, with English as the base
 * layer so any key missing in another language falls back to English —
 * keeps adding new languages additive rather than all-or-nothing.
 */
const i18nCache = new Map<AppLang, ReturnType<typeof buildI18n>>();
function buildI18n(lang: AppLang) {
  return {
    ...t('en'),
    ...nativeStrings.en,
    ...t(lang),
    ...nativeStrings[lang],
  };
}

export function useI18n() {
  const { lang } = useAppSettings();
  // Built once per language and cached so the reference is stable across
  // renders (avoids reallocating the merged dict on every component render)
  return useMemo(() => {
    let dict = i18nCache.get(lang);
    if (!dict) {
      dict = buildI18n(lang);
      i18nCache.set(lang, dict);
    }
    return dict;
  }, [lang]);
}
