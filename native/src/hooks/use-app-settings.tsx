import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
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
  /**
   * Theme đã GIẢI — `light` hoặc `dark`, không còn `system`.
   *
   * ── vì sao nó nằm ở đây chứ không tính lại ở mỗi chỗ đọc ──
   *
   * `useThemeName` từng tự gọi `useColorScheme()`. Đọc thì vô hại, nhưng
   * `useColorScheme` của React Native là `useSyncExternalStore` bọc quanh
   * `Appearance.addChangeListener`, mà hàm ấy là
   * `eventEmitter.addListener('change', …)` — MỘT listener thật cho MỖI lần
   * gọi.
   *
   * `usePalette()` gọi `useThemeName()`, và `usePalette()` có mặt ở 230 chỗ
   * trong 128 tệp. Nên mỗi component đang gắn mang theo một listener riêng vào
   * cùng một sự kiện của hệ thống. Bật/tắt sáng-tối trên máy là emitter phải
   * duyệt hết chừng ấy listener, rồi React lên lịch chừng ấy lượt dựng — đó
   * đúng là độ trễ chủ dự án báo.
   *
   * Nay hệ thống được hỏi ĐÚNG MỘT LẦN, ở đây, và kết quả đi xuống bằng chính
   * context đã có sẵn. 230 đăng ký còn 1; chỗ đọc không đổi một dòng nào vì
   * `useThemeName` giữ nguyên chữ ký.
   */
  themeName: 'light' | 'dark';
}>({ lang: 'en', setLang: () => {}, theme: 'system', setTheme: () => {}, themeName: 'dark' });

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(deviceDefaultLang);
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  /*
    ── vì sao app KHÔNG được vẽ trước khi biết theme ──

    Bản trước vẽ ngay bằng `'system'`, rồi `AsyncStorage` trả lời vài trăm mili
    giây sau và `setThemeState('light')` LẬT cả bảng màu. Bảng màu là KHOÁ
    CACHE của `makeStyles` (xem chú thích `value` bên dưới), nên một cú lật là
    111 stylesheet đổi và CẢ CÂY dựng lại — đúng vào lúc người dùng vừa mở app
    và đang chạm ngón tay xuống màn Hôm nay.

    Đó là cái cửa sổ mà `runOnJS` chết trong đó. `card-deck.tsx:266` gọi
    `runOnJS(beginInteraction)()` ngay ở `.onBegin`, tức lúc ngón tay CHẠM
    XUỐNG; nếu cây đang bị dựng lại quanh lúc đó thì hàm từ xa của worklet có
    thể bị giải phóng trước khi nó chạy — `SIGABRT` trong
    `JSIWorkletsModuleProxy::toOptimizedObject`, đúng chữ ký trong nhật ký sự
    cố của máy thật (xem `docs/SO-GHI-LOI.md` A9).

    Và nó giải thích vì sao lỗi XUẤT HIỆN cùng lúc với giao diện sáng: trước đó
    chỉ có một bảng màu, không có cú lật nào để dựng lại cây. Cú lật chỉ xảy ra
    khi lựa chọn đã lưu KHÁC `'system'` — tức đúng người đang thử bản sáng.

    Cổng này KHÔNG được biến thành cái bẫy mà `_layout.tsx` đã ghi lại ("one
    query must not hold the whole app hostage"): đọc hỏng cũng là một câu trả
    lời, và một lần đọc treo bị hết giờ sau 1,5 giây. Splash vẫn đang che, nên
    người dùng không thấy thêm một khung hình trống nào.
  */
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setBooted(true);
    };
    // A stored choice always wins over the device default
    Promise.all([
      AsyncStorage.getItem(LANG_KEY)
        .then((v) => {
          if (v === 'vi' || v === 'en') setLangState(v);
        })
        .catch(() => {}),
      AsyncStorage.getItem(THEME_KEY)
        .then((v) => {
          if (v === 'system' || v === 'light' || v === 'dark') setThemeState(v);
        })
        .catch(() => {}),
    ]).then(finish, finish);
    /* Đĩa treo cũng không được giữ app: 1,5 giây rồi đi tiếp bằng mặc định. */
    const t = setTimeout(finish, 1500);
    return () => clearTimeout(t);
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
  /* Luật giải y hệt bản cũ ở `useThemeName`, chép nguyên văn để không đổi một
     điểm ảnh nào: chọn tay thì đó là câu trả lời; "theo máy" thì hỏi máy, và
     `unspecified` KHÔNG phải "sáng" — mặc định của app là tối. */
  const system = useColorScheme();
  const themeName: 'light' | 'dark' =
    theme === 'light' || theme === 'dark' ? theme : system === 'light' ? 'light' : 'dark';

  const value = useMemo(
    () => ({ lang, setLang, theme, setTheme, themeName }),
    [lang, theme, themeName],
  );

  /* Splash vẫn che (xem `SplashScreen.preventAutoHideAsync()` ở `_layout.tsx`),
     nên đây là không-vẽ-gì, không phải một khung hình trống. */
  if (!booted) return null;

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
