const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * TEMP / opt-in: when EXPO_FREE_TEST=1, strips the Sign In with Apple
 * entitlement (added by expo-apple-authentication) so the app can be built
 * with a FREE Apple ID — that capability requires a paid Apple Developer
 * Program. The HealthKit plugin is removed separately in app.config.js.
 *
 * No-op unless EXPO_FREE_TEST=1, so normal/paid builds are unaffected.
 *
 *   EXPO_FREE_TEST=1 npx expo prebuild --clean
 *   EXPO_FREE_TEST=1 npx expo run:ios --device
 */
module.exports = function withFreeTestEntitlements(config) {
  if (process.env.EXPO_FREE_TEST !== '1') return config;
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['com.apple.developer.applesignin'];
    return cfg;
  });
};
