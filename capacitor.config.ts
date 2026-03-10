import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ascnd.fitnessos',
  appName: 'ASCND',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'ASCND',
    backgroundColor: '#080809',
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: '#080809',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  // For development with hot-reload, uncomment the server block below:
  // server: {
  //   url: 'http://YOUR_LOCAL_IP:8080',
  //   cleartext: true,
  // },
};

export default config;
