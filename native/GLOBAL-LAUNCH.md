# ASCND — Global launch checklist

The app is built to ship worldwide, not just in Vietnam. This is the
punch list for a global App Store release and what's already handled in
code.

## Already done in the app (waves A–D)

- **Localized gamification data** — award/challenge names, descriptions
  and rewards render from stable keys in `src/lib/gamification-i18n.ts`,
  in the user's language. DB stores the English canonical string.
- **Unit conversion** — kg/lbs and cm/in throughout weight/height
  surfaces, driven by `profile.units_weight` / `units_height`
  (`src/lib/units.ts`, `src/hooks/use-units.ts`). Body metrics stay
  stored in metric.
- **Local calendar dates** — "today" and week boundaries use the device
  timezone (`src/lib/local-date.ts`), correct in every timezone.
- **AI in the user's language** — edge functions (`ai-coach`,
  `ai-weekly-review`, `ai-smart-nudges`, `ai-meal-suggest`, `scan-food`)
  take a `lang` param and reply accordingly; clients also pass the local
  `date` so server-side "today" matches the user's day.
- **Device-locale default** — first launch follows the device language
  (vi for Vietnamese devices, en otherwise); a stored choice wins.
- **i18n fallback** — English is the base layer, so a key missing from
  another language falls back to English (adding languages is additive).
- **Encryption compliance** — `ITSAppUsesNonExemptEncryption: false` in
  `app.json` (app uses only standard HTTPS), so submissions skip the
  export-compliance prompt.

## Before submitting to the App Store

1. **App Store Connect metadata per locale** — add at least English (US)
   and Vietnamese localizations: name, subtitle, keywords, description,
   screenshots. Screenshots must be captured per device size Apple
   requires (6.7" and 6.1" at minimum).
2. **Privacy policy + health disclaimer URLs** — the in-app Legal screen
   already has Terms / Privacy / Health in both languages; host the same
   text at public URLs and link them in App Store Connect. The app is a
   *wellness/habit* tracker, not a medical device — keep that framing.
3. **App Privacy "nutrition label"** — declare what's collected (health &
   fitness data, account email). HealthKit data stays on-device unless
   the user syncs; describe accurately.
4. **HealthKit review notes** — Apple hand-reviews HealthKit apps.
   Explain in the review notes that HR/HRV/sleep/steps feed the daily
   readiness score, and that the app never diagnoses.
5. **Age rating** — likely 4+ (no objectionable content); the AI coach is
   constrained to habit reminders, not medical advice.
6. **Add more languages (optional)** — extend `AppLang` in
   `src/lib/i18n.ts`, add the string tables, and the fallback layer keeps
   untranslated keys in English. Spanish and Japanese are the obvious
   next markets for fitness.

## Infrastructure notes

- **Supabase region** — the project runs in a single region. Users far
  from it see higher latency but it's acceptable at launch. If a region
  (e.g. US or EU) becomes dominant, consider read replicas or moving the
  project; edge functions run close to the user regardless.
- **Data residency (GDPR/EU)** — if EU usage grows, confirm the Supabase
  region and add a data-processing note to the privacy policy. Account
  deletion + data export already exist in Settings.

## Build & ship

See `TESTFLIGHT.md` for the EAS build + TestFlight steps. For a store
release, bump `version` / `ios.buildNumber` in `app.json`, run
`eas build --platform ios --profile production`, then
`eas submit --platform ios`.
