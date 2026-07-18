const { withFinalizedMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * TEMP / opt-in: when EXPO_FREE_TEST=1, strips the Sign In with Apple and
 * Push Notifications (aps-environment) entitlements — both auto-added by
 * their packages and unsupported on a FREE Apple ID. HealthKit is removed
 * separately in app.config.js. Local (scheduled) reminders don't need
 * aps-environment, so they keep working.
 *
 * Runs in the "finalized" mod phase, which executes AFTER every other mod
 * (including expo-notifications' auto-applied one) has written the
 * entitlements file — the only place a removal actually sticks. No-op unless
 * EXPO_FREE_TEST=1, so normal/paid builds are unaffected.
 */
module.exports = function withFreeTestEntitlements(config) {
  if (process.env.EXPO_FREE_TEST !== '1') return config;

  return withFinalizedMod(config, [
    'ios',
    (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const walk = (dir) =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
          const p = path.join(dir, d.name);
          return d.isDirectory() ? walk(p) : [p];
        });
      for (const file of walk(root).filter((f) => f.endsWith('.entitlements'))) {
        let xml = fs.readFileSync(file, 'utf8');
        xml = xml
          .replace(/[ \t]*<key>aps-environment<\/key>\s*<string>[^<]*<\/string>\n?/g, '')
          .replace(/[ \t]*<key>com\.apple\.developer\.applesignin<\/key>\s*<array>[\s\S]*?<\/array>\n?/g, '')
          .replace(/[ \t]*<key>com\.apple\.developer\.healthkit<\/key>\s*<(true|false)\/>\n?/g, '');
        fs.writeFileSync(file, xml);
      }
      return cfg;
    },
  ]);
};
