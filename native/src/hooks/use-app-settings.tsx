import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { t, type AppLang } from '@/lib/i18n';
import { nativeStrings } from '@/lib/native-strings';

const LANG_KEY = 'ascnd_lang';

const SettingsContext = createContext<{
  lang: AppLang;
  setLang: (l: AppLang) => void;
}>({ lang: 'vi', setLang: () => {} });

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>('vi');

  useEffect(() => {
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

/** Convenience: ported web dictionary merged with native-only strings */
export function useI18n() {
  const { lang } = useAppSettings();
  return { ...t(lang), ...nativeStrings[lang] };
}
