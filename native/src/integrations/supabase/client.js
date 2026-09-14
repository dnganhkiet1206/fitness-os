"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
require("react-native-url-polyfill/auto");
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const supabase_js_1 = require("@supabase/supabase-js");
const backend_1 = require("@/lib/backend");
// Where to point is `@/lib/backend` — the only file that knows, so swapping
// projects is one `.env` change rather than a search across the app.
exports.supabase = (0, supabase_js_1.createClient)(backend_1.SUPABASE_URL, backend_1.SUPABASE_ANON_KEY, {
    auth: {
        storage: async_storage_1.default,
        persistSession: true,
        autoRefreshToken: true,
        // React Native has no URL bar — OAuth redirects are handled via deep links
        detectSessionInUrl: false,
    },
});
