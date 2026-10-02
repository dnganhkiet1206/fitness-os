import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { createAsyncStore } from '@/lib/async-store';

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

const store = createAsyncStore<VolumeUnit>({
  storageKey: STORAGE_KEY,
  initial: deviceDefault,
  parse: (stored) => (stored === 'ml' || stored === 'oz' ? stored : undefined),
});

/* No onUserScopedReset here: this is a device display preference, not a
   person's data — it deliberately survives sign-out, unlike the two goals. */

export function setVolumeUnit(unit: VolumeUnit) {
  store.set(unit);
}

export function useVolumeUnit(): { unit: VolumeUnit; setUnit: (u: VolumeUnit) => void } {
  const unit = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => {
    store.hydrate();
  }, []);
  /* Stable identity — see use-steps-goal. */
  return useMemo(() => ({ unit, setUnit: setVolumeUnit }), [unit]);
}
