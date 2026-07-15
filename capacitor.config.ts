import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ascnd.fitnessos',
  appName: 'ASCND',
  webDir: 'dist',
  ios: {
    // Safe areas are handled in CSS via env(safe-area-inset-*).
    // 'automatic' would ADD a native inset on top of that, shifting the
    // whole layout down on notch/Dynamic Island devices.
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'ASCND',
    backgroundColor: '#080809',
    allowsLinkPreview: false,
    scrollEnabled: false,
    // Limiter le nombre de web frames pour iOS perf
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    // Allow WKWebView to cache assets aggressively for offline + speed
    allowNavigation: ['drqgonxrtmomgrftelih.supabase.co'],
  },
  plugins: {
    Keyboard: {
      // The app compensates for the keyboard itself via visualViewport
      // (AppLayout). 'body' would also inject an inline height on <body>,
      // fighting the fixed 100dvh layout.
      resize: 'none',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
    SplashScreen: {
      // Keep splash visible until app is fully rendered, then fade out
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#080809',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      // Smooth fade for premium feel
      launchFadeOutDuration: 300,
    },
  },
  // For development with hot-reload, uncomment the server block below:
  // server: {
  //   url: 'http://YOUR_LOCAL_IP:8080',
  //   cleartext: true,
  // },
};

export default config;
