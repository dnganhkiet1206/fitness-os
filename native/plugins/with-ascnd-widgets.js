const { withXcodeProject, withInfoPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * #195 spike — adds the ASCNDWidgets WidgetKit app-extension target.
 *
 * What it does at prebuild time (EAS runs prebuild in the cloud, so this
 * applies to EAS builds too):
 *   1. Copies Swift sources from modules/ascnd-native/ios/ (the single source
 *      of truth) into ios/ASCNDWidgets/. Shared/RestTimerAttributes.swift is
 *      ALSO compiled into the app target via the Expo module — both targets
 *      compile the identical file, so attributes can never drift.
 *   2. Writes ios/ASCNDWidgets/ASCNDWidgets-Info.plist (NSExtension =
 *      com.apple.widgetkit-extension).
 *   3. Creates the `ASCNDWidgets` app-extension target (bundle id
 *      <app>.widgets), adds the Swift files to its Sources phase, and wires
 *      the "Embed App Extensions" copy phase + target dependency on the app.
 *   4. Matches the extension's IPHONEOS_DEPLOYMENT_TARGET to the app target's
 *      (no App Store mismatch), sets SWIFT_VERSION 5.0 and
 *      APPLICATION_EXTENSION_API_ONLY = YES.
 *   5. Sets NSSupportsLiveActivities = true in the MAIN app's Info.plist.
 *      REQUIRED for ActivityKit: without it every Activity.request fails
 *      (iOS 16.1+). This is an Apple requirement, not an Expo choice —
 *      confirmed across Expo Live Activity plugins/docs.
 *   6. Registers the extension in
 *      extra.eas.build.experimental.ios.appExtensions (the documented location
 *      per docs.expo.dev/build-reference/app-extensions). Without this, EAS
 *      cloud builds fail to sign/provision the extension target. Done here —
 *      not in app.json — so the declaration can never drift from the target
 *      this plugin creates. Spread-preserve + idempotent: other plugins' or
 *      manual entries are never clobbered.
 *
 * What it does NOT do (deliberate spike scope):
 *   - No App Groups entitlement. WidgetDataStore's App Group read path is real
 *     code, but the group is not provisioned; widgets render SPIKE-ONLY mock
 *     data until then. Provisioning `group.com.ascnd.fitnessos` in the Apple
 *     Developer portal + adding the entitlement is a documented production step.
 *   - No SwiftLint / extra build phases.
 */
const EXTENSION_NAME = 'ASCNDWidgets';
const INFO_PLIST_NAME = `${EXTENSION_NAME}-Info.plist`;

// Relative to modules/ascnd-native/ios — the single source of truth.
const SWIFT_SOURCES = [
  'Shared/RestTimerAttributes.swift',
  'Widgets/WidgetData.swift',
  'Widgets/ASCNDWidgets.swift',
  'Widgets/TodayWorkoutWidget.swift',
  'Widgets/StreakReadinessWidget.swift',
  'Widgets/RestTimerLiveActivity.swift',
];

function extensionInfoPlist(buildNumber, shortVersion) {
  /*
    Version strings are baked in as LITERALS, not $(CURRENT_PROJECT_VERSION) /
    $(MARKETING_VERSION).

    Why: the extension target created below via addTarget() never gets
    CURRENT_PROJECT_VERSION / MARKETING_VERSION build settings (Expo sets those
    on the app target only), so the $(...) variables never resolve and the built
    .appex ships with CFBundleVersion missing -> iOS refuses install
    ("MissingBundleVersion"; Xcode warns the extension's CFBundleVersion (null)
    must match the containing app's). iOS requires the extension's
    CFBundleVersion to MATCH the parent app's build number, so we read it from
    the same Expo config the app target uses. Prebuild re-runs this plugin from
    scratch every time (locally and on EAS), so the literals can never go stale.
  */
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>$(DEVELOPMENT_LANGUAGE)</string>
\t<key>CFBundleDisplayName</key>
\t<string>ASCND Widgets</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
\t<key>CFBundleShortVersionString</key>
\t<string>${shortVersion}</string>
\t<key>CFBundleVersion</key>
\t<string>${buildNumber}</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>com.apple.widgetkit-extension</string>
\t</dict>
</dict>
</plist>
`;
}

function configListUuid(project, targetUuid) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const list = target.buildConfigurationList;
  return typeof list === 'string' ? list : list.value;
}

/** Attaches a PBXGroup under the project's main group (Xcode navigator). */
function attachGroupToMainGroup(project, groupUuid, comment) {
  const { firstProject } = project.getFirstProject();
  const mainGroupRef = firstProject.mainGroup;
  const mainGroupUuid = typeof mainGroupRef === 'string' ? mainGroupRef : mainGroupRef.value;
  const mainGroup = project.hash.project.objects.PBXGroup[mainGroupUuid];
  mainGroup.children.push({ value: groupUuid, comment });
}

function getBuildSettings(project, targetUuid) {
  const out = {};
  const list = project.pbxXCConfigurationList()[configListUuid(project, targetUuid)];
  for (const entry of list.buildConfigurations) {
    const key = typeof entry === 'string' ? entry : entry.value;
    const settings = project.pbxXCBuildConfigurationSection()[key].buildSettings;
    out[key] = settings;
  }
  return out;
}

module.exports = function withAscndWidgets(config) {
  // (5) NSSupportsLiveActivities in the MAIN app's Info.plist — required for
  // ActivityKit Live Activities. No spike code path can start an activity
  // without it.
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    return cfg;
  });

  // (6) EAS app-extension declaration. EAS reads this from the resolved Expo
  // config at build time — it must exist even though the Xcode target itself
  // is created later in withXcodeProject.
  const widgetsBundleId = `${config.ios?.bundleIdentifier ?? 'com.ascnd.fitnessos'}.widgets`;
  config.extra = config.extra ?? {};
  config.extra.eas = config.extra.eas ?? {};
  config.extra.eas.build = config.extra.eas.build ?? {};
  config.extra.eas.build.experimental = config.extra.eas.build.experimental ?? {};
  config.extra.eas.build.experimental.ios = config.extra.eas.build.experimental.ios ?? {};
  const appExtensions =
    (config.extra.eas.build.experimental.ios.appExtensions ??= []);
  if (!appExtensions.some((e) => e && e.targetName === EXTENSION_NAME)) {
    // No `entitlements` key: the App Group is deliberately NOT provisioned in
    // this spike. When group.com.ascnd.fitnessos is provisioned, add the
    // application-groups entitlement here AND in ios.entitlements so EAS syncs
    // capabilities for both targets (known EAS quirk: it does not auto-sync
    // App Group capability to extension bundle IDs — may need a manual
    // Developer Portal step; see native-spike-195.md §11).
    appExtensions.push({
      targetName: EXTENSION_NAME,
      bundleIdentifier: widgetsBundleId,
    });
  }

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectRoot = cfg.modRequest.projectRoot; // native/
    const platformProjectRoot = cfg.modRequest.platformProjectRoot; // native/ios
    const moduleIosDir = path.join(projectRoot, 'modules', 'ascnd-native', 'ios');
    const extDir = path.join(platformProjectRoot, EXTENSION_NAME);

    // 1. Copy Swift sources (single source of truth -> generated target dir).
    fs.mkdirSync(extDir, { recursive: true });
    for (const rel of SWIFT_SOURCES) {
      const src = path.join(moduleIosDir, rel);
      if (!fs.existsSync(src)) {
        throw new Error(`[with-ascnd-widgets] missing Swift source: ${src}`);
      }
      const dest = path.join(extDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    // 2. Extension Info.plist (matches addTarget's default INFOPLIST_FILE).
    // Versions are baked in as literals matching the app target (see
    // extensionInfoPlist): the extension target has no CURRENT_PROJECT_VERSION /
    // MARKETING_VERSION build settings for $(...) to resolve against.
    const extBuildNumber = config.ios?.buildNumber ?? '1';
    const extShortVersion = config.version ?? '1.0.0';
    fs.writeFileSync(
      path.join(extDir, INFO_PLIST_NAME),
      extensionInfoPlist(extBuildNumber, extShortVersion),
    );

    // 3. Create the app-extension target. This also adds the "Embed App
    //    Extensions" copy phase and a target dependency on the app target.
    const bundleId = `${config.ios?.bundleIdentifier ?? 'com.ascnd.fitnessos'}.widgets`;
    const target = project.addTarget(EXTENSION_NAME, 'app_extension', EXTENSION_NAME, bundleId);

    // 4. Add Swift sources to the extension target.
    //
    // Two `xcode`-package traps handled explicitly here:
    //  - addSourceFile() without a group goes through addPluginFile(), which
    //    requires a "Plugins" group that Expo projects don't have, so we create
    //    a real PBXGroup and wire PBXBuildFile entries manually.
    //  - addToPbxSourcesBuildPhase() reuses the FIRST 'Sources' phase it finds
    //    (the app target's) instead of creating one for the new target, so we
    //    create the extension's Sources phase explicitly.
    const group = project.addPbxGroup([], EXTENSION_NAME, EXTENSION_NAME);
    attachGroupToMainGroup(project, group.uuid, EXTENSION_NAME);
    const sourcesPhase = project.addBuildPhase(
      [],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    ).buildPhase;
    for (const rel of SWIFT_SOURCES) {
      /*
        `rel`, NOT `${EXTENSION_NAME}/${rel}`.

        The PBXGroup above was created with path = "ASCNDWidgets", and Xcode
        resolves a file's path RELATIVE to its containing group's path. Passing
        "ASCNDWidgets/Shared/…" here produced "ASCNDWidgets/ASCNDWidgets/…" —
        a doubled path that broke the extension's compile (caught on a real
        prebuild: every Swift source ref resolved under the doubled prefix).
      */
      const file = project.addFile(rel, group.uuid, { target: target.uuid });
      if (!file) {
        throw new Error(`[with-ascnd-widgets] failed to add source: ${EXTENSION_NAME}/${rel}`);
      }
      file.target = target.uuid;
      file.uuid = project.generateUuid();
      project.addToPbxBuildFileSection(file);
      sourcesPhase.files.push({
        value: file.uuid,
        comment: `${rel.split('/').pop()} in Sources`,
      });
    }

    // 4b. Target dependency app -> extension. The `xcode` package's
    // addTargetDependency() silently no-ops when the PBXTargetDependency /
    // PBXContainerItemProxy sections don't exist yet (fresh Expo project), so
    // ensure the sections exist first.
    for (const section of ['PBXTargetDependency', 'PBXContainerItemProxy']) {
      if (!project.hash.project.objects[section]) {
        project.hash.project.objects[section] = {};
      }
    }
    project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid]);

    // 5. Build settings: match the app's deployment target, Swift 5.0,
    //    app-extension API only.
    const appTargetUuid = project.getFirstTarget().uuid;
    const appSettings = Object.values(getBuildSettings(project, appTargetUuid));
    const deploymentTarget =
      appSettings.map((s) => s.IPHONEOS_DEPLOYMENT_TARGET).find(Boolean) ?? '"15.1"';
    for (const settings of Object.values(getBuildSettings(project, target.uuid))) {
      settings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
      settings.SWIFT_VERSION = '"5.0"';
      settings.APPLICATION_EXTENSION_API_ONLY = '"YES"';
      settings.TARGETED_DEVICE_FAMILY = '"1,2"';
    }

    return cfg;
  });
};
