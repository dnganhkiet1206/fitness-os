import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import type { VolumeUnit } from '@/lib/units';

/**
 * Water display unit (ml / US fl oz). Water volumes are stored in ml;
 * this is a display/entry preference kept on-device via AsyncStorage —
 * same pattern as the steps goal, so no DB migration is needed. Defaults
 * to oz for imperial-locale first launch, ml otherwise.
 */

const STORAGE_KEY = 'ascnd-volume-unit';

function deviceDefault(): VolumeUnit {
  try {
    // e.g. "en-US" → region "US". Parse the string directly (portable —
    // doesn't rely on Intl.Locale, which some Hermes builds lack).
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const region = locale.split('-')[1]?.toUpperCase() ?? '';
    // US, Liberia, Myanmar use US customary; everyone else metric
    return ['US', 'LR', 'MM'].includes(region) ? 'oz' : 'ml';
  } catch {
    return 'ml';
  }
}

let state: VolumeUnit = deviceDefault();
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  listeners.forEach((l) => l());
}

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'ml' || stored === 'oz') {
      state = stored;
      emit();
    }
  } catch {
    // keep default
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setVolumeUnit(unit: VolumeUnit) {
  state = unit;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, unit).catch(() => {});
}

export function useVolumeUnit(): { unit: VolumeUnit; setUnit: (u: VolumeUnit) => void } {
  const unit = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    hydrate();
  }, []);
  return { unit, setUnit: setVolumeUnit };
}
