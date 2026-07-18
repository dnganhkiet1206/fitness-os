const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * TEMP / opt-in: when EXPO_FREE_TEST=1, strips the HealthKit and
 * Sign In with Apple entitlements so the app can be built and installed on a
 * physical device with a FREE Apple ID (both capabilities require a paid
 * Apple Developer Program membership).
 *
 * It is a no-op unless EXPO_FREE_TEST=1, so normal/paid builds are entirely
 * unaffected. Run a free test build with:
 *
 *   EXPO_FREE_TEST=1 npx expo prebuild --clean
 *   EXPO_FREE_TEST=1 npx expo run:ios --device
 *
 * Once you have a paid account, just build without the env var and HealthKit
 * + Apple sign-in work again — no code to revert.
 */
module.exports = function withFreeTestEntitlements(config) {
  if (process.env.EXPO_FREE_TEST !== '1') return config;
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['com.apple.developer.healthkit'];
    delete cfg.modResults['com.apple.developer.healthkit.access'];
    delete cfg.modResults['com.apple.developer.applesignin'];
    return cfg;
  });
};
