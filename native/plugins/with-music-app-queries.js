const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Android's half of the "is that app installed?" question.
 *
 * `Linking.canOpenURL` has the same silent failure on both platforms and needs
 * a different declaration on each. iOS wants the scheme in
 * `LSApplicationQueriesSchemes`, which `app.json` can set directly. Android 11
 * (API 30) introduced **package visibility**: an app can no longer see what
 * else is installed unless it declares what it intends to look for, in a
 * `<queries>` element in the manifest.
 *
 * Miss it and `canOpenURL` returns **false** — no error, no warning, no log —
 * so the music row is filtered to nothing and never appears. Exactly the iOS
 * trap, on the other platform, with a completely different fix and the same
 * symptom: a feature that is simply absent.
 *
 * `app.json` has no field for `<queries>`, so this is the plugin that adds it.
 * The schemes come from one place — `src/lib/music-app.ts` — and
 * `tools/music-launch.mjs` checks this file against that one, so the two cannot
 * drift into declaring different things.
 */
const SCHEMES = ['music', 'spotify'];

module.exports = function withMusicAppQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [];

    /* One `<intent>` per scheme, each an ACTION_VIEW on that scheme — the shape
       Android expects for "I may want to open a link like this". */
    const intents = SCHEMES.map((scheme) => ({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': scheme } }],
    }));

    /* Merged rather than assigned: other plugins declare their own queries, and
       overwriting the array would silently take away somebody else's visibility
       — the same class of bug this plugin exists to prevent. */
    const block = manifest.queries[0] ?? {};
    block.intent = [...(block.intent ?? []), ...intents];
    manifest.queries[0] = block;

    return cfg;
  });
};
