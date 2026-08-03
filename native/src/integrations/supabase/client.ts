import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/backend';
import type { Database } from './types';

// Where to point is `@/lib/backend` — the only file that knows, so swapping
// projects is one `.env` change rather than a search across the app.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // React Native has no URL bar — OAuth redirects are handled via deep links
    detectSessionInUrl: false,
  },
});
