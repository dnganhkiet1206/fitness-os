import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Same project as the web app. The publishable (anon) key is safe to ship in
// the client; row-level security governs access.
const SUPABASE_URL = 'https://drqgonxrtmomgrftelih.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // React Native has no URL bar — OAuth redirects are handled via deep links
    detectSessionInUrl: false,
  },
});
