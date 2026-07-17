import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { authenticate, biometricLockAvailable } from '@/lib/biometric-lock';

const LOCK_KEY = 'ascnd_app_lock';
// Returning within this window doesn't re-prompt (avoids Face ID on every glance)
const GRACE_MS = 20_000;

interface AppLockValue {
  enabled: boolean;
  available: boolean;
  locked: boolean;
  loaded: boolean;
  setEnabled: (v: boolean) => Promise<void>;
  unlock: () => Promise<void>;
}

const AppLockContext = createContext<AppLockValue>({
  enabled: false,
  available: false,
  locked: false,
  loaded: false,
  setEnabled: async () => {},
  unlock: async () => {},
});

export function AppLockProvider({ children, prompt }: { children: ReactNode; prompt: string }) {
  const [enabled, setEnabledState] = useState(false);
  const [available, setAvailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const authing = useRef(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Load pref + capability; lock immediately if enabled so nothing flashes
  useEffect(() => {
    (async () => {
      const [raw, avail] = await Promise.all([AsyncStorage.getItem(LOCK_KEY), biometricLockAvailable()]);
      const on = raw === '1' && avail;
      setAvailable(avail);
      setEnabledState(on);
      setLocked(on);
      setLoaded(true);
    })();
  }, []);

  const unlock = useCallback(async () => {
    if (authing.current) return;
    authing.current = true;
    const ok = await authenticate(prompt);
    authing.current = false;
    if (ok) {
      setLocked(false);
      backgroundedAt.current = null;
    }
  }, [prompt]);

  // Re-lock when the app goes to background for longer than the grace window
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (!enabledRef.current) return;
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundedAt.current;
        if (since != null && Date.now() - since > GRACE_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  // Auto-prompt whenever we enter the locked state
  useEffect(() => {
    if (locked && loaded) unlock();
  }, [locked, loaded, unlock]);

  const setEnabled = useCallback(async (v: boolean) => {
    setEnabledState(v);
    await AsyncStorage.setItem(LOCK_KEY, v ? '1' : '0').catch(() => {});
    // Turning it on shouldn't immediately lock the user out of the settings
    // screen they're on; it takes effect on the next background→foreground.
    if (!v) setLocked(false);
  }, []);

  return (
    <AppLockContext.Provider value={{ enabled, available, locked, loaded, setEnabled, unlock }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}
