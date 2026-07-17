import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';

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
