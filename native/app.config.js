// Thin overlay on app.json. When EXPO_FREE_TEST=1 it removes the HealthKit
// config plugin so no HealthKit entitlement is generated — that capability
// requires a paid Apple Developer Program, so stripping it lets the app build
// and install with a FREE Apple ID for testing. (Sign In with Apple and Push
// Notifications are stripped separately by
// ./plugins/with-free-test-entitlements.js.)
//
// No-op unless EXPO_FREE_TEST=1, so normal/paid/release builds keep HealthKit
// and need no revert. Base config still comes from app.json.
module.exports = ({ config }) => {
  if (process.env.EXPO_FREE_TEST === '1' && Array.isArray(config.plugins)) {
    config.plugins = config.plugins.filter((p) => {
      const name = Array.isArray(p) ? p[0] : p;
      return name !== '@kingstinct/react-native-healthkit';
    });
  }
  return config;
};
