import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type AppLang, type CurrencyCode, t as getTranslations } from '@/lib/i18n';

// Re-export for convenience
export type { AppLang, CurrencyCode };
export { getTranslations as t };

export type ThemeMode = 'light' | 'dark' | 'system';

interface AppSettings {
  lang: AppLang;
  currency: CurrencyCode;
  theme: ThemeMode;
  setLang: (lang: AppLang) => void;
  setCurrency: (currency: CurrencyCode) => void;
  setTheme: (theme: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
}

const AppSettingsContext = createContext<AppSettings | null>(null);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(() => (localStorage.getItem('app-lang') as AppLang) || 'vi');
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => (localStorage.getItem('app-currency') as CurrencyCode) || 'VND');
  const [theme, setThemeState] = useState<ThemeMode>(() => (localStorage.getItem('app-theme') as ThemeMode) || 'dark');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  // Apply theme class to html element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const setLang = useCallback((l: AppLang) => {
    setLangState(l);
    localStorage.setItem('app-lang', l);
    // Migrate old grocery-specific key
    localStorage.removeItem('grocery-lang');
  }, []);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCurrencyState(c);
    localStorage.setItem('app-currency', c);
    localStorage.removeItem('grocery-currency');
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
  }, []);

  return (
    <AppSettingsContext.Provider value={{ lang, currency, theme, setLang, setCurrency, setTheme, resolvedTheme }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettings {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
