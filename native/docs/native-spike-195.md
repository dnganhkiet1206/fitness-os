# #195 — Swift + EAS Native iOS Spike: what was proven

Date: 2026-10-01. Owner: C. Branch: `claude/ios-fitness-rebuild-omgulr`.

Spike question: **"Can ASCND safely introduce native Swift/iOS capabilities while
keeping React Native as the primary architecture?"**

Answer: **Yes — up to the EAS cloud build.** Everything validatable on Linux is
green: TypeScript, the 296-gate suite, `expo prebuild` project generation, and
Expo module autolinking. Still pending (need macOS/EAS + credentials): Swift
compilation, the EAS iOS build itself, and on-device runtime. The EAS build
command is scripted below but has not been run from here.

React Native / TypeScript remains the source of truth for ALL product and
business state. Swift owns only iOS-specific capabilities. Nothing was
rewritten; no business logic was duplicated.

---

## 1. Files added

```
native/modules/ascnd-native/
  package.json                        # local Expo module "ascnd-native" 0.1.0
  expo-module.config.json             # platforms: apple+web; apple.modules: AscndNativeModule
  src/index.ts                        # TS types + requireOptionalNativeModule('AscndNative')
  ios/AscndNative.podspec             # CocoaPods pod (app target only)
  ios/AscndNativeModule.swift         # Expo module: haptics + ActivityKit bridge
  ios/Shared/RestTimerAttributes.swift# ActivityAttributes — SINGLE SOURCE, compiled
                                      # into both the app target AND the widget
                                      # extension (copied by the config plugin)
  ios/Widgets/WidgetData.swift        # shared native data abstraction + store + SPIKE-ONLY mock
  ios/Widgets/ASCNDWidgets.swift      # @main WidgetBundle (2 widgets + Live Activity UI)
  ios/Widgets/TodayWorkoutWidget.swift
  ios/Widgets/StreakReadinessWidget.swift
  ios/Widgets/RestTimerLiveActivity.swift  # display-only ActivityConfiguration UI

native/plugins/with-ascnd-widgets.js  # config plugin: creates the WidgetKit
                                      # app-extension target at prebuild time

native/src/native/ios/
  ASCNDNative.ts                      # isAscndNativeAvailable()
  ASCNDHaptics.ts                     # playNativeHaptic() — bridge validation only
  ASCNDLiveActivity.ts                # start/update/endRestActivity(), areLiveActivitiesEnabled()
```

## 2. Files modified

- `native/package.json` — added `"ascnd-native": "file:modules/ascnd-native"`.
- `native/package-lock.json` — lock entries for the local module (additive only).
- `native/app.json` — registered `./plugins/with-ascnd-widgets.js`.
- `native/docs/ios-audit.md` — this spike's proven results (section 8).

## 3. Native modules created

One Expo module: **`AscndNative`** (`modules/ascnd-native`).

- Swift class `AscndNativeModule` (ExpoModulesCore `Module`), name `"AscndNative"`.
- CocoaPods pod `AscndNative` (static framework, depends on `ExpoModulesCore`).
- Resolves through `expo-modules-autolinking` exactly like Expo's own modules
  (verified: `npx expo-modules-autolinking resolve --platform ios` lists
  `packageName: 'ascnd-native'`, `podName: 'AscndNative'`, class
  `AscndNativeModule`).
- The pod compiles `AscndNativeModule.swift` + `Shared/**` only — `Widgets/**`
  is excluded so the `@main WidgetBundle` is never linked into the app target.

## 4. RN ↔ Swift interface

TypeScript (no business logic crosses the bridge — display state only):

```ts
// src/native/ios/ASCNDLiveActivity.ts
areLiveActivitiesEnabled(): boolean
startRestActivity({ exerciseName, setNumber, totalSets, totalSeconds }): Promise<string | null>
updateRestActivity(activityId, { exerciseName, setNumber, totalSets, totalSeconds }): Promise<boolean>
endRestActivity(activityId): Promise<void>
```

Key design: TypeScript passes an **absolute end timestamp** (`Date.now() +
totalSeconds * 1000`). Swift stores it as `ContentState.endDate`; the UI
derives the countdown natively (`Text(timerInterval:countsDown:)`). Bridge
traffic happens only on start/update/end — never per-second.

```ts
// src/native/ios/ASCNDHaptics.ts — bridge validation ONLY, not a product API
playNativeHaptic(style: 'light' | 'medium' | 'heavy'): boolean
```

Product haptics stay in `src/lib/haptics.ts` (#194). This exists only to prove
RN → Swift calls end-to-end without ActivityKit in the loop.

All facades null-check the module (`requireOptionalNativeModule`) so web and
non-iOS builds are unaffected.

## 5. ActivityKit implementation

- `RestTimerAttributes` / `ContentState{exerciseName, setNumber, totalSets,
  totalSeconds, endDate}` — minimal, `Codable & Hashable`.
- `RestActivityStore` (iOS 16.1+, `@available`-guarded): start / update / end,
  keyed by activity id. `Activity.request` with `staleDate = endDate + 60s`.
- **Display-only** (Kiệt's call): no buttons, no actions. Lock Screen shows
  branding + exercise + `Set x of y` + large countdown; Dynamic Island has
  expanded / compact / minimal presentations.
- Module entry points guard `#available(iOS 16.1, *)` and throw
  `unsupportedOS` below it — the app still launches on the existing
  deployment target (16.4, so this is belt-and-braces).

## 6. WidgetKit implementation

One extension target **`ASCNDWidgets`** (`com.ascnd.fitnessos.widgets`) hosts:

- **Widget 1 — Today's Workout** (primary): name, status, next exercise,
  progress. Families: systemSmall, systemMedium.
- **Widget 2 — Streak + Readiness**: streak days, readiness score, status.
- **RestTimerLiveActivity** UI (the ActivityConfiguration above).

Shared data abstraction (`WidgetData.swift`): `TodayWorkoutData` /
`StreakReadinessData` structs, `WidgetDataStore` reading App Group
`group.com.ascnd.fitnessos` shared UserDefaults, and `MockWidgetDataProvider`
— **explicitly marked SPIKE-ONLY**. Neither widget invents its own format.
Production wiring (TS → `updateWidgetData` → App Group → `WidgetCenter`
reload) is designed but not built; the mock is not presented as integration.

## 7. EAS configuration changes

- `app.json`: added `./plugins/with-ascnd-widgets.js` to `plugins`.
  `app.json` itself declares nothing else — the plugin writes the two
  required native declarations at prebuild time so they cannot drift from
  the target it creates:
  1. **`NSSupportsLiveActivities = true`** in the main app's Info.plist
     (via `withInfoPlist`). Apple requirement: without it every
     `Activity.request` fails. Verified in the generated
     `ios/ASCND/Info.plist` after prebuild.
  2. **`extra.eas.build.experimental.ios.appExtensions`** =
     `[{ targetName: "ASCNDWidgets", bundleIdentifier:
     "com.ascnd.fitnessos.widgets" }]` — the documented location
     (docs.expo.dev/build-reference/app-extensions) where EAS looks for
     extension targets when signing/provisioning. Without it, cloud builds
     fail to sign the extension. Registered idempotently by the plugin
     (spread-preserve; never clobbers other plugins' entries). Verified in
     the resolved Expo config (`npx expo config --type public`).
- The plugin runs inside `expo prebuild`, which EAS Build runs automatically —
  no `ios/` directory is committed, no manual Xcode steps.
- No changes to `eas.json` build profiles.

## 8. New entitlements

**None.** Deliberate spike scope: the App Group (`group.com.ascnd.fitnessos`)
is referenced in code but not provisioned, so no
`com.apple.security.application-groups` entitlement was added. Provisioning the
group in the Apple Developer portal + adding the entitlement is a documented
production prerequisite (see §12).

## 9. Build commands used

```bash
npx tsc --noEmit                                   # TS: clean (01/10)
npx expo prebuild --platform ios --clean           # Xcode project generation: OK (01/10)
npx expo-modules-autolinking resolve --platform ios # module resolves: OK (01/10)
node tools/check.mjs                               # 296/296 gates green (01/10, see §10)
```

EAS (not yet run — needs `eas login` + Apple Developer credentials):

```bash
eas build --platform ios --profile preview
```

## 10. Validation results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (rerun 01/10 after all spike edits) |
| `node tools/check.mjs` | ✅ **296/296 green** (full rerun 01/10). One real catch on the
first run: `tools/linked.mjs` ("đã nối chưa") flagged the spike's own
`playNativeHaptic` as an export nothing calls. Fixed the honest way — the
gate's sanctioned path: added it to the KNOWN exemption list with a reason
(bridge-validation-only by design, product haptics stay in `lib/haptics.ts`;
the gate's self-test forces the entry's removal once it is really wired).
Not by fake-wiring it into product code. |
| `expo prebuild --platform ios` | ✅ succeeds with the new module + plugin |
| Extension target in generated `.pbxproj` | ✅ `ASCNDWidgets`, `com.apple.product-type.app-extension` |
| Swift sources in extension target | ✅ all 6 files in its own Sources phase (not the app's) |
| Embed App Extensions phase | ✅ on app target, `dstSubfolderSpec=13` (PlugIns), `.appex` copied |
| Target dependency app → extension | ✅ |
| Bundle IDs | ✅ `com.ascnd.fitnessos` + `com.ascnd.fitnessos.widgets` |
| Extension settings | ✅ deployment target 16.4 (matches app), Swift 5.0, `APPLICATION_EXTENSION_API_ONLY=YES`, `SKIP_INSTALL=YES` |
| Extension Info.plist | ✅ `NSExtensionPointIdentifier = com.apple.widgetkit-extension` |
| Autolinking (`AscndNative` pod) | ✅ resolves with class `AscndNativeModule` |
| Swift compilation | ⏳ needs Xcode (macOS/EAS) — not possible on this Linux VM |
| EAS iOS build | ⏳ needs `eas login` + Apple credentials — scripted above |
| RN → Swift runtime call | ⏳ needs a device/simulator build |
| ActivityKit start/update/end runtime | ⏳ needs a device build (iOS 16.1+) |
| Widget rendering on device | ⏳ needs a device build |

Two real bugs were found and fixed during prebuild validation (both in the
`xcode` npm package's helpers, worked around in the plugin — see comments in
`with-ascnd-widgets.js`):
1. `addSourceFile()` without a group goes through `addPluginFile()`, which
   crashes on Expo projects (no "Plugins" group). Fixed by creating a real
   PBXGroup and wiring PBXBuildFile entries manually.
2. `addToPbxSourcesBuildPhase()` reuses the FIRST `Sources` phase it finds
   (the app target's) instead of creating one for the new target — widget
   sources were landing in the app target. Fixed by creating the extension's
   Sources phase explicitly with `addBuildPhase()`.
3. `addTargetDependency()` silently no-ops when the `PBXTargetDependency` /
   `PBXContainerItemProxy` sections don't exist yet. Fixed by ensuring the
   sections exist first.

## 11. Limitations discovered

- **No Swift compiler on this VM.** All Swift was validated by inspection +
  prebuild project generation, not compilation. The `AsyncFunction` async-closure
  risk called out in earlier drafts is already mitigated in code (Promise +
  Task style, with a NOTE comment in `AscndNativeModule.swift`) — but only a
  real `xcodebuild` / EAS build proves it. Remaining syntax/API risk is
  concentrated in `RestTimerLiveActivity.swift` (ActivityConfiguration /
  DynamicIsland DSL).
- **No EAS auth on this VM** (`eas` CLI present, v24.8.0, but not logged in;
  no token in env). The EAS build step is scripted but unrunnable here — this
  is the spike's single biggest unverified item.
- **WidgetKit extension ≠ Expo module.** Widget extensions cannot link
  ExpoModulesCore, so widget Swift lives outside the module's pod and is
  copied into the extension target by the config plugin. `Shared/` is the
  single on-disk source compiled into both targets — never edit one copy;
  there is only one.
- **App Groups not provisioned.** Widgets render mock data until
  `group.com.ascnd.fitnessos` is registered and the entitlement added.
  Known EAS quirk for later: EAS does not reliably sync the App Group
  capability to an *extension's* bundle ID in the Apple Developer Portal —
  expect a possible manual step (enable App Groups on
  `com.ascnd.fitnessos.widgets`, assign the group, delete the extension's
  provisioning profile via `eas credentials -p ios`, rebuild).
- **Live Activities need a real device** (or TestFlight) to validate
  lifecycle; the simulator shows them but Dynamic Island behavior differs.
- **`expo prebuild` on Linux skips CocoaPods** — pod integration
  (`AscndNative` pod into the app target) is validated via autolinking
  resolve only, not by a real `pod install`.

## 12. Recommended next native feature

Based on actual findings (not plans):

1. **Run the scripted EAS build** (`eas build --platform ios --profile
   preview`) from a logged-in machine and install on a test iPhone. This
   unblocks every ⏳ row in §10 — it is the single highest-value next step.
2. Then: **Live Activity rest timer (display-only)** as the first production
   native feature. It is the smallest Swift surface that touches real product
   state, and the spike already built its exact shape (absolute `endDate`,
   start/update/end, no per-second bridge traffic).
3. After that: **provision the App Group + `updateWidgetData`** to light up
   Widget 1 with real data (Widget 2 follows on the same abstraction).

Do NOT proceed spike → large native implementation without the EAS build
passing and Kiệt's approval.
