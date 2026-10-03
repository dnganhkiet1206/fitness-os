const { withXcodeProject, withInfoPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Kiệt's Apple development team (personal team, free account). The extension
// MUST be signed with the same team as the containing app, otherwise
// `xcodebuild -target ASCNDWidgets` fails with "Signing for ASCNDWidgets
// requires a development team" and the appex can't be installed.
// NOTE: if the app ever moves to a different team (e.g. an org team on EAS),
// update this to match — or better, make it dynamic.
const APPLE_TEAM_ID = 'Z54JL44R9Z';

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
  'Shared/ASCNDMarkEmbedded.swift',
  'Widgets/WidgetData.swift',
  'Widgets/ASCNDWidgets.swift',
  'Widgets/TodayWorkoutWidget.swift',
  'Widgets/StreakReadinessWidget.swift',
  'Widgets/RestTimerLiveActivity.swift',
  'Widgets/RestTimerIntents.swift',
];

function extensionInfoPlist() {
  /*
    Uses $(MARKETING_VERSION) / $(CURRENT_PROJECT_VERSION) variables — resolved
    by Xcode at build time from the extension target's build settings (set
    explicitly in step 5 below, mirroring the app target). This is the same
    mechanism the app target uses; a literal would also work, but the target
    settings are the single source of truth Kiệt asked for, and they stay in
    sync with app.json automatically on every prebuild.
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
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
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

/**
 * Idempotency: `expo prebuild` WITHOUT --clean re-runs this plugin on the
 * existing project. Creating the target/group/sources unconditionally would
 * duplicate them (two "ASCNDWidgets" targets -> "Multiple commands produce
 * *.appex"). Find-or-create everywhere below.
 */
function findNativeTargetUuid(project, name) {
  const section = project.pbxNativeTargetSection();
  for (const uuid of Object.keys(section)) {
    if (uuid.endsWith('_comment')) continue;
    const t = section[uuid];
    if (t && typeof t.name === 'string' && t.name.replace(/^"|"$/g, '') === name) {
      return uuid;
    }
  }
  return null;
}

function findSourcesPhaseUuid(project, targetUuid) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const phases = target.buildPhases || [];
  const section = project.hash.project.objects.PBXSourcesBuildPhase || {};
  for (const entry of phases) {
    const uuid = typeof entry === 'string' ? entry : entry.value;
    if (section[uuid]) return uuid;
  }
  return null;
}

function findResourcesPhaseUuid(project, targetUuid) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const phases = target.buildPhases || [];
  const section = project.hash.project.objects.PBXResourcesBuildPhase || {};
  for (const entry of phases) {
    const uuid = typeof entry === 'string' ? entry : entry.value;
    if (section[uuid]) return uuid;
  }
  return null;
}

function hasTargetDependency(project, targetUuid, dependencyTargetUuid) {
  const section = project.hash.project.objects.PBXTargetDependency || {};
  const targets = project.pbxNativeTargetSection();
  for (const uuid of Object.keys(section)) {
    if (uuid.endsWith('_comment')) continue;
    const dep = section[uuid];
    const depTarget = dep.target && (dep.target.value || dep.target);
    if (depTarget !== dependencyTargetUuid) continue;
    // The dependency must be owned by targetUuid's dependency list.
    const owner = targets[targetUuid];
    const deps = owner.dependencies || [];
    if (deps.some((d) => (d.value || d) === uuid)) return true;
  }
  return false;
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

    // Version source of truth: the extension's CFBundleVersion MUST match the
    // containing app's, so both are read from the same Expo config every
    // prebuild (never hardcoded, never stale).
    const extBuildNumber = config.ios?.buildNumber ?? '1';
    const extShortVersion = config.version ?? '1.0.0';

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

    // 2. Extension Info.plist (matches the target's INFOPLIST_FILE, set
    //    explicitly in step 5). Version variables resolve at build time from
    //    the target's CURRENT_PROJECT_VERSION / MARKETING_VERSION.
    fs.writeFileSync(path.join(extDir, INFO_PLIST_NAME), extensionInfoPlist());

    // 3. Create the app-extension target (find-or-create: a non-clean
    //    prebuild re-runs this plugin and must NOT create a second target).
    //    addTarget() also adds the "Embed App Extensions" copy phase and the
    //    product reference on the app target.
    const bundleId = `${config.ios?.bundleIdentifier ?? 'com.ascnd.fitnessos'}.widgets`;
    const existingUuid = findNativeTargetUuid(project, EXTENSION_NAME);
    const target = existingUuid
      ? { uuid: existingUuid }
      : project.addTarget(EXTENSION_NAME, 'app_extension', EXTENSION_NAME, bundleId);

    // 4. Add Swift sources to the extension target.
    //
    // Two `xcode`-package traps handled explicitly here:
    //  - addSourceFile() without a group goes through addPluginFile(), which
    //    requires a "Plugins" group that Expo projects don't have, so we create
    //    a real PBXGroup and wire PBXBuildFile entries manually.
    //  - addToPbxSourcesBuildPhase() reuses the FIRST 'Sources' phase it finds
    //    (the app target's) instead of creating one for the new target, so we
    //    create the extension's Sources phase explicitly.
    // Group: find-or-create (addPbxGroup returns {uuid}; pbxGroupByName
    // returns the raw object, so normalize to uuid via the comment key).
    let groupUuid = (() => {
      const groups = project.hash.project.objects.PBXGroup || {};
      for (const key of Object.keys(groups)) {
        if (!/_comment$/.test(key)) continue;
        if (groups[key] === EXTENSION_NAME) return key.replace(/_comment$/, '');
      }
      return null;
    })();
    if (!groupUuid) {
      const g = project.addPbxGroup([], EXTENSION_NAME, EXTENSION_NAME);
      groupUuid = g.uuid;
      attachGroupToMainGroup(project, groupUuid, EXTENSION_NAME);
    }
    const existingPhaseUuid = findSourcesPhaseUuid(project, target.uuid);
    const sourcesPhase = existingPhaseUuid
      ? project.hash.project.objects.PBXSourcesBuildPhase[existingPhaseUuid]
      : project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid).buildPhase;
    for (const rel of SWIFT_SOURCES) {
      if (project.hasFile(rel)) continue; // already added by a previous prebuild
      /*
        `rel`, NOT `${EXTENSION_NAME}/${rel}`.

        The PBXGroup above was created with path = "ASCNDWidgets", and Xcode
        resolves a file's path RELATIVE to its containing group's path. Passing
        "ASCNDWidgets/Shared/…" here produced "ASCNDWidgets/ASCNDWidgets/…" —
        a doubled path that broke the extension's compile (caught on a real
        prebuild: every Swift source ref resolved under the doubled prefix).
      */
      const file = project.addFile(rel, groupUuid, { target: target.uuid });
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

    // 4b. Logo asset: the REAL ASCND mark (assets/images/splash-icon.png —
    //    white on transparent, the same artwork as the app icon). NOT redrawn:
    //    brand-lockup.tsx documents why a hand-drawn second version drifts.
    //    Copied into the extension dir and added to its Resources phase so
    //    `Image("ascnd-mark")` resolves inside the widget bundle at runtime.
    const LOGO_SRC = path.join(projectRoot, 'assets', 'images', 'splash-icon.png');
    const LOGO_REL = 'ascnd-mark.png';
    if (!fs.existsSync(LOGO_SRC)) {
      throw new Error('[with-ascnd-widgets] missing logo asset: assets/images/splash-icon.png');
    }
    // ALWAYS copy — the old code coupled the copy to `!hasFile`, so a stale
    // project reference (from an earlier prebuild) skipped the copy forever
    // and `Image("ascnd-mark")` rendered empty on device (02/10/2026, Kiệt's
    // compact shot: missing logo). Copying is idempotent and cheap.
    fs.copyFileSync(LOGO_SRC, path.join(extDir, LOGO_REL));
    if (!project.hasFile(LOGO_REL)) {
      const logoFile = project.addFile(LOGO_REL, groupUuid, { target: target.uuid });
      if (!logoFile) {
        throw new Error('[with-ascnd-widgets] failed to add logo asset');
      }
      logoFile.target = target.uuid;
      logoFile.uuid = project.generateUuid();
      project.addToPbxBuildFileSection(logoFile);
    }

    // 4b-verify. UNCONDITIONAL Resources-phase wiring (separate from the
    // hasFile guard above): a stale .pbxproj from a non-clean prebuild can
    // hold the PBXFileReference without the Resources phase entry — then
    // `Image("ascnd-mark")` renders empty with ZERO build warnings and the
    // bug is invisible until Kiệt's device shots (03/10/2026). Scan the
    // phase; repair if missing. Idempotent.
    {
      const existingResUuid = findResourcesPhaseUuid(project, target.uuid);
      const resPhase = existingResUuid
        ? project.hash.project.objects.PBXResourcesBuildPhase[existingResUuid]
        : project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid).buildPhase;
      const phaseFiles = resPhase.files || (resPhase.files = []);
      const hasLogoInPhase = phaseFiles.some((f) => (f.comment || '').includes(LOGO_REL));
      if (!hasLogoInPhase) {
        const fileRefs = project.hash.project.objects.PBXFileReference || {};
        let fileRefUuid = null;
        for (const k of Object.keys(fileRefs)) {
          if (k.endsWith('_comment')) continue;
          const p = String(fileRefs[k].path || '').replace(/^"|"$/g, '');
          if (p === LOGO_REL || p.endsWith('/' + LOGO_REL)) { fileRefUuid = k; break; }
        }
        if (!fileRefUuid) {
          throw new Error('[with-ascnd-widgets] logo file ref missing for ' + LOGO_REL);
        }
        const buildFiles = project.hash.project.objects.PBXBuildFile || {};
        let buildUuid = null;
        for (const k of Object.keys(buildFiles)) {
          if (k.endsWith('_comment')) continue;
          const bf = buildFiles[k];
          const fr = typeof bf.fileRef === 'string' ? bf.fileRef : (bf.fileRef && bf.fileRef.value);
          if (fr === fileRefUuid) { buildUuid = k; break; }
        }
        if (!buildUuid) {
          buildUuid = project.generateUuid();
          const section = project.hash.project.objects.PBXBuildFile;
          section[buildUuid] = { isa: 'PBXBuildFile', fileRef: fileRefUuid, fileRef_comment: LOGO_REL };
          section[buildUuid + '_comment'] = LOGO_REL + ' in Resources';
        }
        phaseFiles.push({ value: buildUuid, comment: LOGO_REL + ' in Resources' });
      }
    }

    // 4c. Target dependency app -> extension. The `xcode` package's
    // addTargetDependency() silently no-ops when the PBXTargetDependency /
    // PBXContainerItemProxy sections don't exist yet (fresh Expo project), so
    // ensure the sections exist first.
    for (const section of ['PBXTargetDependency', 'PBXContainerItemProxy']) {
      if (!project.hash.project.objects[section]) {
        project.hash.project.objects[section] = {};
      }
    }
    const appTargetUuid = project.getFirstTarget().uuid;
    if (!hasTargetDependency(project, appTargetUuid, target.uuid)) {
      project.addTargetDependency(appTargetUuid, [target.uuid]);
    }

    // 5. Build settings: match the app's deployment target, Swift 5.0,
    //    app-extension API only — plus the version settings Xcode needs to
    //    resolve $(CURRENT_PROJECT_VERSION) / $(MARKETING_VERSION) in the
    //    extension's Info.plist. Without these the built .appex ships with
    //    CFBundleVersion missing and iOS refuses install (MissingBundleVersion).
    //    INFOPLIST_FILE is set explicitly (not trusted to addTarget's default)
    //    so the generated plist above is always the one Xcode processes.
    //    Re-applied on every prebuild (idempotent assignment), so config
    //    changes (version/buildNumber) always take effect.
    //    Signing: the extension must carry the same development team as the
    //    app (CODE_SIGN_STYLE Automatic). Without DEVELOPMENT_TEAM the target
    //    fails to sign ("requires a development team") when built directly,
    //    and `expo run:ios` only papers over it via a command-line override.
    const appSettings = Object.values(getBuildSettings(project, appTargetUuid));
    const deploymentTarget =
      appSettings.map((s) => s.IPHONEOS_DEPLOYMENT_TARGET).find(Boolean) ?? '"15.1"';
    for (const settings of Object.values(getBuildSettings(project, target.uuid))) {
      settings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
      settings.SWIFT_VERSION = '"5.0"';
      settings.APPLICATION_EXTENSION_API_ONLY = '"YES"';
      settings.TARGETED_DEVICE_FAMILY = '"1,2"';
      settings.CURRENT_PROJECT_VERSION = `"${extBuildNumber}"`;
      settings.MARKETING_VERSION = `"${extShortVersion}"`;
      settings.INFOPLIST_FILE = `"${EXTENSION_NAME}/${INFO_PLIST_NAME}"`;
      settings.DEVELOPMENT_TEAM = APPLE_TEAM_ID;
      settings.CODE_SIGN_STYLE = '"Automatic"';
    }

    // 5b. TargetAttributes DevelopmentTeam — mirrors what Xcode writes when a
    // team is picked in the IDE's Signing & Capabilities pane. Idempotent.
    {
      const { firstProject } = project.getFirstProject();
      const attrs = (firstProject.attributes = firstProject.attributes || {});
      const ta = (attrs.TargetAttributes = attrs.TargetAttributes || {});
      const entry = (ta[target.uuid] = ta[target.uuid] || {});
      entry.DevelopmentTeam = APPLE_TEAM_ID;
    }

    return cfg;
  });
};
