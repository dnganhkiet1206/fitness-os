import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';

import { registerOfflineWrites } from '@/lib/offline-write';

/**
 * Offline-aware React Query client.
 *
 * - onlineManager is wired to NetInfo so queries pause while offline and
 *   refetch automatically on reconnect (React Native has no built-in
 *   connectivity signal).
 * - The cache is persisted to AsyncStorage (see asyncStoragePersister), so
 *   the last-seen data is shown instantly on launch and while offline.
 */

// Report real device connectivity to React Query
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep entries a full day so the persisted cache is useful offline
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 60, // 1 min: serve cache first, refresh in background
      retry: 2,
      refetchOnReconnect: true,
    },
  },
});

/*
  Taught before anything is restored.

  Module scope on purpose: `PersistQueryClientProvider` reads the cache back as
  soon as it mounts, and a paused mutation that returns before its default
  function exists is discarded. Registering inside a component would be a race
  whose losing side looks like a write that was never made.
*/
registerOfflineWrites(queryClient);

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'ascnd_rq_cache',
  throttleTime: 1000,
});

/** Bump when the cache shape changes to invalidate old persisted data. */
export const CACHE_BUSTER = 'v1';

/** Drop the in-memory + persisted cache — call on sign-out to avoid leaking
 *  one user's data into the next session. */
export async function clearPersistedCache() {
  queryClient.clear();
  try {
    await AsyncStorage.removeItem('ascnd_rq_cache');
  } catch {
    // ignore
  }
}
