import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Target modern iOS Safari for smaller, faster bundles
    target: 'safari15',
    // Enable CSS code splitting for lazy-loaded routes
    cssCodeSplit: true,
    rollupOptions: {
      external: [
        "@flomentumsolutions/capacitor-health-extended",
        "@capacitor/haptics",
        "@capacitor/status-bar",
        "@capacitor/core",
        "@capacitor/app",
        "@capacitor/browser",
        "@capacitor/keyboard",
        "@capacitor/splash-screen",
        "@capacitor-community/apple-sign-in",
      ],
      output: {
        // Manual chunks for optimal caching and parallel loading
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', '@tanstack/react-query', 'recharts'],
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-accordion',
            '@radix-ui/react-switch',
            '@radix-ui/react-slider',
            '@radix-ui/react-progress',
          ],
        },
      },
    },
  },
}));
