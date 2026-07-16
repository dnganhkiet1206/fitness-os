import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Same project as the web app. The publishable (anon) key is safe to ship in
// the client; row-level security governs access.
const SUPABASE_URL = 'https://drqgonxrtmomgrftelih.supabase.co';
// Fallback = the same publishable (anon) key the web build ships; RLS
// governs all access. Override via EXPO_PUBLIC_SUPABASE_KEY if rotated.
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRycWdvbnhydG1vbWdyZnRlbGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NjQ3MjMsImV4cCI6MjA4NjQ0MDcyM30.aiDCz4d5A9IFWE1M0xGWXAWtN0dIfyJnm5E62stl1Wo';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // React Native has no URL bar — OAuth redirects are handled via deep links
    detectSessionInUrl: false,
  },
});
