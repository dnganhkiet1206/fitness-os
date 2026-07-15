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
      output: {
        // Manual chunks for optimal caching and parallel loading
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // recharts is intentionally NOT pinned here: only lazy-loaded pages
          // use it, so Rollup splits it into an async chunk that isn't part
          // of app startup.
          'vendor-ui': ['framer-motion', '@tanstack/react-query'],
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
