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

// iOS native: configure status bar when running in Capacitor
(async () => {
  try {
    if ((window as any)?.Capacitor?.isNativePlatform?.()) {
      const { StatusBar, Style } = await import(/* @vite-ignore */ '@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch {
    // Not on native or plugin unavailable
  }
})();

// Prevent iOS overscroll/bounce on root
document.addEventListener('touchmove', (e) => {
  const target = e.target as HTMLElement;
  const scrollable = target.closest('.scroll-container');
  if (!scrollable) {
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById("root")!).render(<App />);
