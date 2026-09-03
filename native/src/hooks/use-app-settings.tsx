import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { t, type AppLang } from '@/lib/i18n';
import { nativeStrings } from '@/lib/native-strings';

const LANG_KEY = 'ascnd_lang';
/**
 * Theme là tuỳ chọn của MÁY, không của tài khoản.
 *
 * Cùng nhóm với ngôn ngữ, đơn vị và khoá app — `tools/signed-out.mjs` giữ đúng
 * ba khoá ấy lại khi đăng xuất, vì cho mượn máy đăng nhập một lần không được
 * làm chủ máy nhận lại máy ở tiếng Anh và kilogram. Sáng/tối cũng vậy: nó là
 * cách người này muốn nhìn cái máy này, không phải một trường trong hồ sơ.
 *
 * Nên khoá này phải nằm trong danh sách GIỮ LẠI của bước kiểm ấy, không phải
 * danh sách xoá.
 */
const THEME_KEY = 'ascnd_theme';

/**
 * Lần đầu mở app thì theo máy, cho tới khi người dùng tự chọn.
 *
 * Cùng nguyên tắc `deviceDefaultLang` bên dưới, và `'system'` được lưu như một
 * lựa chọn THẬT chứ không phải "chưa chọn": người cố ý chọn "theo hệ thống"
 * khác với người chưa bao giờ mở phần cài đặt, và bản lưu phải phân biệt được
 * hai điều đó — nếu không, một lần chọn "theo hệ thống" sẽ không có gì để lưu
 * và cài đặt sẽ nhảy về giá trị khác ở lần mở sau.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

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
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
}>({ lang: 'en', setLang: () => {}, theme: 'system', setTheme: () => {} });

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(deviceDefaultLang);
  const [theme, setThemeState] = useState<ThemeChoice>('system');

  useEffect(() => {
    // A stored choice always wins over the device default
    AsyncStorage.getItem(LANG_KEY).then((v) => {
      if (v === 'vi' || v === 'en') setLangState(v);
    });
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === 'system' || v === 'light' || v === 'dark') setThemeState(v);
    });
  }, []);

  const setLang = (l: AppLang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  };

  const setTheme = (t: ThemeChoice) => {
    setThemeState(t);
    AsyncStorage.setItem(THEME_KEY, t).catch(() => {});
  };

  /*
    Bọc lại để tham chiếu ổn định.

    Đối tượng này là giá trị của một context mà `usePalette` đọc, và bảng màu
    lấy từ nó là KHOÁ CACHE của `makeStyles`. Dựng object mới mỗi lần render
    thì mọi consumer render lại theo — và với 111 stylesheet sắp treo vào đây,
    đó là thứ phải đúng ngay từ đầu chứ không phải tối ưu về sau.
  */
  const value = useMemo(() => ({ lang, setLang, theme, setTheme }), [lang, theme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
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
