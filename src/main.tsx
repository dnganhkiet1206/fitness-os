import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent unhandled promise rejections from crashing the app on iOS
window.addEventListener("unhandledrejection", (event) => {
  console.error("[ASCND] Unhandled rejection:", event.reason);
  event.preventDefault();
});

window.addEventListener("error", (event) => {
  console.error("[ASCND] Uncaught error:", event.error);
});

// iOS native: configure native plugins when running in Capacitor
const win = window as unknown as Record<string, unknown>;
const cap = win.Capacitor as { isNativePlatform?: () => boolean } | undefined;
const isNative = !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();

if (isNative) {
  (async () => {
    try {
      // Configure Status Bar
      const { StatusBar, Style } = await import(/* @vite-ignore */ '@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setOverlaysWebView({ overlay: true });

      // Configure Keyboard plugin for smooth iOS keyboard handling
      try {
        const { Keyboard } = await import(/* @vite-ignore */ '@capacitor/keyboard');
        await Keyboard.setAccessoryBarVisible({ isVisible: true });
        await Keyboard.setScroll({ isDisabled: false });
      } catch {
        // Keyboard plugin not available
      }

      // Listen for deep links (Supabase auth callbacks, etc.)
      try {
        const { App: CapApp } = await import(/* @vite-ignore */ '@capacitor/app');
        CapApp.addListener('appUrlOpen', (data) => {
          const url = new URL(data.url);
          // Handle Supabase auth redirect
          if (url.hostname === 'login-callback' || url.pathname?.includes('auth')) {
            const params = url.hash || url.search;
            if (params) {
              window.location.hash = params;
            }
          } else {
            // Handle deep links to internal routes
            const path = url.pathname;
            if (path && path !== '/') {
              window.location.pathname = path;
            }
          }
        });

        // Handle back button on iOS (for edge cases)
        CapApp.addListener('backButton', () => {
          window.history.back();
        });
      } catch {
        // App plugin not available
      }
    } catch {
      // Not on native or plugin unavailable
    }
  })();
}

// Prevent iOS overscroll/bounce on root
document.addEventListener('touchmove', (e) => {
  const target = e.target as HTMLElement;
  const scrollable = target.closest('.scroll-container');
  if (!scrollable) {
    e.preventDefault();
  }
}, { passive: false });

// Render the app
const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Hide splash screen after first render (Capacitor SplashScreen launchAutoHide=false)
if (isNative) {
  // Wait for first paint + a small buffer so the UI is visible before hiding splash
  requestAnimationFrame(() => {
    setTimeout(async () => {
      try {
        const { SplashScreen } = await import(/* @vite-ignore */ '@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 300 });
      } catch {
        // SplashScreen plugin not available
      }
    }, 100);
  });
}
