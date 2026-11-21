# ASCND Koa Audit — Phase II (Mascot System Mission)

- **Audit tip:** `44862412b22dfe119c938bd041f255ddb1c879ae` on `origin/native/ios-rewrite`
  (repo `dnganhkiet1206/fitness-os`), verified by GitHub API branch lookup + a
  read-only `git clone --depth 1` finished 2026-11-21 ~01:35 CST
  (merge PR #995, `koa-t48-today-identity`, 2026-11-21 00:22 CST).
  All file paths below are at this tip unless noted.
- **Date:** 2026-11-21 (CST).
- **Mode:** READ-ONLY. No commits, no PRs, no code/asset changes. Evidence from
  GitHub API tree/contents reads + plain file reads of the cloned working tree.
  No build, no test execution, no simulator (no Swift toolchain on this VM).
- **Scope note:** the parent scope update authorized deep git-history research
  (when Koa files changed, by whom, why; comparing Koa versions across commits).
  That part is **BLOCKED, not skipped**: an execution-risk check on this session
  forbids running `git log` / `git diff` / `git status` inside the cloned repo
  content. The parent must decide whether to authorize that step separately.
  Everything else in this audit was verified against files at the current tip.
- **Prior work reused, not redone:** the first Koa audit (17–18/11/2026,
  `~/workspace/koa-audit/KOA_AUDIT_REPORT.md`, tip `2a904952`) and its three
  explorer reports; `apps/ios/docs/koa-v2/KOA_TECHNICAL_AUDIT.md` (05/11/2026,
  tip `9cd4ae6d`); `apps/ios/docs/koa-v2/DUOLINGO_RESEARCH.md` (05/11/2026).
  Where this audit agrees with them it says so and cites the file; where it
  corrects or updates them (tip moved 17/11 → 21/11) it says so explicitly.

---

## 1. Executive summary

1. **Koa is not "one standing pose".** The shipped figure is one parametric
   drawing driven by a flag system: **34 expressions × 6 poses × 5 gestures ×
   7 wardrobe slots × 10 items × 6 body-build ranks**, plus walk cycle, gaze,
   blink, poke and a room director. The problem is narrower and more specific
   than the mission brief states: **all 6 poses share one silhouette**, because
   they are affine transforms (scale / rotate / translate) of the *same* paths,
   not new drawings. Pose readability scored **2/5** in the 05/11 audit and
   nothing in the code since has changed that structural fact.
2. **The master geometry is a frozen export, not a living document.** The only
   source of body geometry is `KoaSceneData.swift` — a 76 KB auto-generated
   JSON blob, ported verbatim from the abandoned RN app's
   `koa-scene.ts @ fac9ac2`, header-marked "SINH TỰ ĐỘNG — đừng sửa tay"
   (do not edit by hand). The original design export `Koa.dc.html` is **not
   in the repo** (confirmed by KOA_TECHNICAL_AUDIT §5: not in repo, not on the
   machine).
3. **There is no Character Bible.** The 05/11 audit proposed writing one
   (`KOA_CHARACTER_BIBLE.md`, roadmap step 1) — it was never written. The two
   spec-sheet images that do exist (`koa-construction-manual.png`,
   `koa-flat-spec.png`) **contradict the shipped art** on the most basic
   points (flat / no-stroke / no-gradient vs procedural gradients + grey
   strokes; 24 layers incl. a tail vs 38 ids, no tail; 8 expressions vs 34;
   4 views vs front-only). There is nothing to compare a new pose against.
4. **A pose library already exists — as storyboard mock, not in-app art.**
   `docs/koa-v2/gallery/v8-pose-library/` (17 poses × 7 cameras, 119 frames,
   28 expressions, Blender-built from the v4 model) was never integrated into
   the app. The v3/v4/v5 turnaround SVGs (8 angles / 2.5D turn) were never
   loaded into `KoaSceneData` (their READMEs say NOT VERIFIED). Kiệt approved
   the 6 new gym expressions into the app (05/11); the poses themselves stayed
   in the gallery.
5. **The renderer itself is a catalogue of cover-ups for missing body parts.**
   Neck-fill patches, idle arm lift, shoulder tuck, arm-flip at 25°, paw
   outlines, lid path-string replacement — each is a local fix for "the old
   vector doesn't have the part this pose needs". The failure mode in the
   mission brief ("patch the old vector, parts don't match") is
   institutionalized in the shipping code, not just an AI bad habit.
6. **2.5D head-turn was tried and reverted (10/11).** `KoaTurn` was removed
   because the far-side eye/cheek overflowed the head and covered the ear.
   The face layers are flat decals positioned for the front view only; they
   are not painted on a 3D-consistent surface. Any rigging proposal must
   respect this bound: small rotations work, real turns do not.

---

## 2. Asset inventory (verified at tip 44862412)

### 2.1 Code — the figure is drawn, not stored

| Group | Location | Count | Notes |
|---|---|---|---|
| Render core | `apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Koa/` | **52 Swift files** | `KoaSceneData`, `KoaWardrobeData`, `KoaRender`, `KoaPaint`, `KoaLight`, `KoaMath`, `KoaFlags`, `KoaEmotion`, `KoaMood`, `KoaGesture`, `KoaWalk`, `KoaGaze`, `KoaSettle`, `KoaFigurePlans`, `KoaScene`, `VectorMascot`, `KoaPerformance`, `KoaReaction`, `KoaDirector`, `KoaTalk`, `KoaPeek`, `KoaPoke`, `KoaTap`, `KoaSchedule`, `KoaShelf`, `KoaDust*`, `KoaRoom*`, `Studio*`, `ShopScene*`, `KoaWardrobeData`, … |
| Economy / claims | `…/ASCNDCore/Mascot/` | **13 Swift files** | `KoaWeek`, `MascotRoom`, `MascotShop`, `KoaQuests`, `WeeklyChallenges`, `MascotRules`, `Awards`, … (out of scope for this audit except where they touch rendering) |
| Views | `apps/ios/ASCND/Features/Mascot/` | **31 Swift files** | `KoaFigureView`, `MascotRoomView` (1,872 lines), `KoaDirectorDriver`, `KoaLive`, `KoaSound`, `KoaReactionView`, `KoaRestScreen` is in `Features/Workout/`, `ShopView`, `StudioLayers`, `KoaWidgetPublisher`, `KoaSheetView` (Debug spec sheet), … |
| Koa elsewhere | `Features/Today/`, `Features/Workout/`, `Features/Progress/`, `Features/TellKoa/` | ~10 Swift files | `TodayDayBlock`, `TodayAskKoaCard`, `KoaWeekCoachCard`, `KoaRestScreen`, `KoaJourneyView`, `KoaMonthView`, `TellKoaSheet`, … |
| Tests | `Packages/ASCNDKit/Tests/ASCNDCoreTests/` + `apps/ios/ASCNDTests/` | **~50 Koa test files** | incl. `KoaRenderTests`, `KoaPaintTests`, `KoaGestureTests`, `KoaWalkTests`, `KoaMoodTests`, `KoaFigurePlansTests`, `KoaSnapshotTests`, `KoaImageDiff`, `KoaAnimationLifecycleTests`, `KoaAccessibilityAuditTests`; golden fixtures `koa-golden.json`, `koa-render-golden.json`, `koa-emotion-golden.json` |
| RN source (frozen) | `native/src/components/ascnd/koa/` | 11 files | `koa-scene.ts`, `koa-figure.tsx`, `koa-flags.ts`, `koa-light.ts`, `koa-pose.ts`, `koa-dress.ts`, `koa-gaze.ts`, `koa-frame.ts`, `figure-clock.ts`, `svg-shapes.ts` — the origin of every Swift file above; RN app abandoned 17/11, kept as reference only |

### 2.2 The two geometry payloads (the actual "master reference")

| File | Size | Provenance |
|---|---|---|
| `ASCNDCore/Koa/KoaSceneData.swift` | 76,631 bytes, 7 lines | Auto-generated by `apps/ios/tools/insights-golden/gen-koa-scene.mjs` from `native/src/components/ascnd/koa/koa-scene.ts @ fac9ac2`. Verbatim JSON: **628 nodes, 38 unique ids, 288 paths, 50 ellipses, 46 circles, 50 rects**. This is the RN payload; it is the standard for golden tests (`KoaScene.rn == true`). |
| `ASCNDCore/Koa/KoaWardrobeData.swift` | 413,544 bytes, 7 lines | Auto-generated by `apps/ios/tools/koa-wardrobe/build.py` (1,392 lines) from `KoaSceneData.swift`. Drops **all 70 RN wardrobe item groups** and inserts redrawn art in place. This is what the app actually draws (`wardrobePayload`). 5.4× larger than the RN payload. |

### 2.3 Raster / audio assets in the app bundle

| Asset | Status at this tip |
|---|---|
| `ASCND/Resources/Assets.xcassets/AskKoaScene.imageset/ask-koa-scene.png` (244,922 bytes) | **The only Koa raster in the app bundle.** Static scene on the Ask Koa card. |
| `DayMealScene` / `DaySleepScene` / `DayWaterScene` / `DayWorkoutScene` `.imageset`s | **GONE.** Present at tip `2a904952` (17/11, cited in the first audit §3.1); absent at tip `44862412` (21/11). Verified by tree listing at both tips via API. Removed during the 19–20/11 PR wave; no replacement raster was added. |
| `ASCND/Resources/Sounds/koa-*.wav` | **52 files, ~4.9 MB** (ambience, boops, cheers, talk, footsteps, reaction cues). 10 `koa-talk-*.wav` are byte-identical duplicates (~60 KB) — first audit K-50, still present. |
| `apps/site/src/img/koa3d/` | 11 webp/jpg (bowl, cheer, drink, gym, laptop, lift, phone, shaker, sleep, thumbs, walk). Landing page only; Kiệt-supplied 23/10; **not used in the app**. |

### 2.4 Design documentation — the koa-v2 gallery (455 blobs)

| Item | Detail |
|---|---|
| Location | `apps/ios/docs/koa-v2/` — `DUOLINGO_RESEARCH.md`, `KOA_TECHNICAL_AUDIT.md`, `KOA_V2_SLICE.md`, `blender/` (10 scripts), `gallery/` (12 version dirs) |
| Gallery versions | `v0-baseline` (simulator captures, 05/11), `v1-slice`, `v2-360-blockout`, `v3-vector-turnaround` (8-angle SVG, from 3D), `v4-from-art` (8-angle SVG, from outline), `v5-2.5d-turn` (continuous ±35°), `v6-in-app`, `v7-volume`, `v8-pose-library` (17 poses × 7 cameras, 119 frames + 56 face frames), `v9-reaction-storyboard` (+ sub-versions v10–v28), `v29-dust-scene`, `v30-koa-off` |
| Gallery contents | 247 jpg, 55 mp4, 39 md, 31 png, 20 svg, 10 py, 3 json, 2 html |
| **Missing** | `KOA_CHARACTER_BIBLE.md` — proposed 05/11 (KOA_TECHNICAL_AUDIT §9 step 1), **never written**. No numeric proportion / color / construction reference exists anywhere in the repo. |
| Spec sheets (RN era) | `native/assets/mascots/koa-construction-manual.png` (24-layer system, 8 expressions, 4-view turnaround, palette, layer order, folder conventions, prompt for Claude Code), `koa-flat-spec.png` ("PROMPT CHI TIẾT CHO CLAUDE CODE"), `koa-svg-spec-sheet.png`, `KOA_OUTFIT_CATALOGUE.md` (7 slots × 10 items), `README.md` (history: 4 rendering methods tried and dropped 27/07/2026) |

### 2.5 What does NOT exist (verified by negative search)

- **No Koa character PNG/SVG in the app bundle** besides `ask-koa-scene.png`.
  Koa is drawn at runtime from the JSON scene (see §3).
- **No Rive / Lottie / Spine / 3D Koa asset anywhere.** The 22 `.usdz` files
  under `Resources/ExerciseDemos/` are exercise demos only (first audit §3.1,
  re-confirmed by tree listing at this tip).
- **No `Koa.dc.html`** (the original design-tool export) in the repo.
- **No back view, no side view, no thigh, no forearm, no hand, no knee, no
  lower eyelid** in the shipped figure (see §4.2 and DNA doc).
- **No per-pose image assets.** Poses are not files; they are flag states.

---

## 3. How Koa is actually rendered (this decides what pose systems are feasible)

Pipeline, verified by reading the code at this tip:

```
KoaSceneData.swift (RN JSON, 628 nodes)
  + KoaWardrobeData.swift (build.py redraw, 70 items replaced)
        → KoaScene.wardrobePayload (app) / rnPayload (golden tests)
        → KoaRender.figure(Options) → Element tree (pure function)
        → KoaPaint.plan(tree) → [Op] draw ops (gradients/clips/matrices resolved)
        → KoaFigurePlans.plan(Options) → 64-entry cache keyed by FULL Options (KOA-T10)
        → KoaFigureView: SwiftUI Canvas + TimelineView ≤60 fps → GraphicsContext
```

- **Frame:** `viewBox 0 0 240 300`, aspect 1.25, drawn at 0.93 inset anchored
  at the feet (`KoaMath.insetMat`). `KoaFigureView.size` default 160 pt.
- **One drawing, many states.** `KoaRender.Options` carries: `expression`
  (34), `pose` (6), `gesture` (5), `worn` (7 slots), `build` (rank 0–5),
  `gaze`/`look`/`eyes`, `blink`/`blinkRight`, `walk`, `poke`, `dress`,
  `mouth` (visemes), `faceFrom`/`faceMix` (cross-fade), `flat`/`paper`,
  `groundShadow`, `t` (clock ms). `KoaFlags.flags()` maps
  (expression, pose, worn) → ~110 boolean/text flags; each JSON node has an
  `if` condition; `KoaRender.node()` includes or drops layers and applies
  per-layer matrices (CSS keyframes sampled with real bezier easing).
- **Poses are transforms, not drawings.** From `KoaFlags.flags()`:
  - `turn34`: whole figure `scale(0.93,1)`, face `translate(16,0)`, ears
    `+12/−17`, belly `scale(0.92,1) + translate(11,0)`, head `scale(0.96,1)`.
  - `running`: `scale(0.91,1) + rotate(4° about 120,288)`, head `rotate(−5°)`,
    face `translate(18,0)`, speed lines + dust ellipses, legs/arms on 18 s
    linear keyframe loops, body bob `koaRunBody18`.
  - `lifting` / `stretching` / `relaxing`: layer toggles (`poseLift`,
    `poseStretch`, `poseRelax`, `legsSit`) + fixed arm transforms; no new
    body geometry.
  - Consequence, already measured 05/11 (KOA_TECHNICAL_AUDIT §3): *"Sáu tư
    thế cùng bóng dáng"* — six poses, one silhouette.
- **Gestures are added rotations** (`KoaGesture`): arms rotate around
  shoulders (80,178)/(160,178); head around neck (120,166); `taDa` ±90°,
  `cheer` ±108° + jump −26, `curious` head −9°, `flop` head +9° + translate
  (2,5), `pout` head +5°. Arms raised past **25° flip** (`armFlipDeg`) so
  the paw doesn't point backwards (Koa's drawn arm curves downward).
- **Walk** (`KoaWalk`, 6 styles): feet planted/swing phases pinned to the
  floor, body bob/sway/lean around (120,293), head/ear lag, arm swing
  ~±20°. Face "turn" while walking is a plain `translate(14·u, 0)` —
  the 2.5D `KoaTurn` was **removed 10/11** (see §5.6).
- **Lighting is procedural, not baked** (`KoaLight`): every flat color becomes
  a vertical user-space gradient (y 20→275, gain 1.10→0.84, warm bounce
  `#FFC24D` from y=170, max 5%); radial head glow (120,76, r=62, white
  17%→0); rim light `#FFE9B8`, 1.6 pt, on head/ears/torso only (arms
  excluded 24/10 — the rim made the shoulder joint read as a cut);
  form/body gradients on ears/torso. **Paper mode** (light theme): OKLab
  desaturation (L×0.85). **Flat mode** (daytime, Kiệt 15/10): no per-part
  gradients at all — one sunlight wash over the whole figure.
- **Face changes cross-fade** (added 05/11): `faceMix` 0→1, brows/mouth fade;
  eyes swap *inside a blink* so two eye layers never overlap ("ghost eyes",
  measured 05/11). Blink is external (`blink` 0…1) or from the idle clock
  (2–7 s apart, 18% double, close 0.07 s / open 0.09 s — `KoaGaze`).
- **Performance mitigations in place** (first audit K-10 partially addressed):
  `KoaFigurePlans` 64-entry plan cache keyed by full `Options`
  (new since the first audit); `KoaMemo` for defs/colours/parsed ops;
  `StudioPlans` 96-entry FIFO for the room; off-screen/background gating in
  `KoaFigureView` (was ~30% simulator CPU when idle before 27/10 fix).
  Per-frame plan rebuild is still the cost for animated frames; magnitude on
  a real device remains UNVERIFIED (no Instruments run possible here).
- **Other mascots:** `VectorMascot` is a generic fallback figure for
  `blaze`/`swift`/`titan`/`drago`/`nova` — always neutral, selection honored
  at only 3 sites (first audit K-30). Not Koa; out of scope except as proof
  that "add a character" has no art pipeline (mascots README: "take Koa's
  path: a design export, the importer, the flags module, and `verify.mjs`
  at zero").

**Feasibility consequence:** any pose system must either (a) live inside this
pipeline — i.e. produce new *flag-conditioned layers + transforms* in the
JSON scene format, with the same 240×300 frame and the same lighting model —
or (b) replace the pipeline wholesale (new runtime, new art, all 70 wardrobe
items + 6 ranks + 34 expressions re-done). There is no middle option where a
new PNG/SVG is "dropped in": the app has no image-based Koa path at all.

---

## 4. Character DNA — summary (full measurements in KOA_CHARACTER_DNA.md)

Measured from `KoaSceneData.swift` by parsing every path (cubic-sampled
bounding boxes) and cross-checked against the v4/v5 turnaround SVGs and the
two spec-sheet images. Frame 240×300, y down.

| Trait | Measured value |
|---|---|
| Head (front) | 160.2 × 134.0, x 39.8–200, y 34–168 |
| Ears | 83.4 × 93.6 each; outer span x 8.6–231.4 (ears stick out 31.2 beyond the head on each side); inner ear 45.2 × 51.7 |
| Eyes | 36 × 47 vertical ovals; centres (82,96) and (158,96); gap 40 ≈ 1.1 eye widths |
| Pupils | 24 × 32; nose 26.9 × 42 (y 84–126); mouth 28 × 16.5 (y 128–144.5); brows 15 × 5.1 (y ~60–65); blush 16 × 12 |
| Torso | 112.3 × 139 (y 140–279); belly 70 × 82.2 |
| Arms | 52.4 × 72.5 each, shoulder pivots (80,178)/(160,178); one segment, no elbow/hand |
| Legs | 45.4 × 41.6 each; **no thigh** (confirmed by v8 README: "Bản vẽ gốc Koa không có đùi") |
| Total figure | y 12 (ear top) → 293 (feet) = 281 tall |
| Head : body | head 134 vs body-below-chin 125 → **head is ~52% of figure height**; head 1.43× torso width |
| Base palette | fur `#BFC7CF`, belly/inner-ear `#F4F6F8`, ink `#20242A` / `#2A313B`, nose `#39424E`, blush `#F3B5B5`, tongue `#E8657B`, outline stroke `#A9B2BC` (41× — the main outline colour), shadow `#AEB6BF` @ 0.45 |
| Style | Flat vector, rounded corners, soft grey outlines (not black), no baked shading — shading is procedural (`KoaLight`) |

IMMUTABLE vs FLEXIBLE classification with evidence is in
`KOA_CHARACTER_DNA.md`. Headline: immutable = head-front outline, ear
outer shape + span, eye size/placement, nose shape/placement, fur
`#BFC7CF`, belly `#F4F6F8`, soft-grey outline, 240×300 frame with feet at
y≈293. Flexible = arm/leg rotation (within the flip rule), mouth/brow/lid
layers, blush/tongue/effects, wardrobe, rank build, gaze/blink, shadow.

---

## 5. Root-cause analysis — why patched poses come out inconsistent

Ranked by impact. Each cause is rated against file evidence, not against the
mission brief's wording.

### RC-1 — No living master reference; the proposed Character Bible was never written [HIGHEST]

- **Evidence.** KOA_TECHNICAL_AUDIT §9 step 1 (05/11) proposed
  `KOA_CHARACTER_BIBLE.md` "from the scene data: head/body ratio, eye
  distance, ear size, color `#BFC7CF`… straight from the coordinates in
  `KoaSceneData`". A tree search at this tip finds **no such file**.
  The 9-step visual check loop in the same document (§6 step 3) requires
  comparing every change "with the Character Bible" — a step that cannot be
  performed.
- **What exists instead.** Two spec-sheet PNGs that contradict the shipped
  art (details in §5.1 below), and the geometry itself locked in a generated
  JSON blob that can only be read by parsing. A human (or Claude) asked to
  "draw a new Koa pose" has no single authoritative visual + numeric
  reference to work from.
- **Impact.** Every other cause below is downstream of this one: without a
  bible there is no test a new part can pass or fail.

#### 5.1 The two spec sheets vs the shipped art (verified contradictions)

| Spec-sheet claim | Shipped reality |
|---|---|
| "Không stroke, không gradient, không filter" / "Màu phẳng" (flat-spec §8) | Scene data carries strokes on most paths (`#A9B2BC` 41×, `#20242A` 31×); `KoaLight` adds a vertical gradient per flat colour + rim + glow on every lit frame |
| 24 layers, incl. **23 Tail** (construction manual §4) | 38 ids in `KoaSceneData`; **no tail node at all** |
| 8 expressions (manual §3, flat-spec §2) | **34 expressions** in `KoaFlags` |
| Turnaround FRONT / 3/4 / SIDE / BACK (both sheets) | Front only in the app; `turn34` is a scale/translate fake; no side or back drawing exists |
| "Mỗi layer là một file SVG riêng biệt" (manual §4) | Layers live inside one generated JSON blob; there are no per-layer SVG files in the repo |
| Poses: run / lift / stretch / relax (both sheets §5–6) | Those 4 exist as flag states, but all share one silhouette (§3) |
| Palette of 7 colours | Base figure matches the 7, but the wardrobe adds ~25 more accent colours (`#E8B23A`, `#D64545`, `#3FA9E5`, `#7A5BC4`, …) |

### RC-2 — The master geometry is frozen at the RN freeze commit and can only be extended through code pipelines

- **Evidence.** `KoaSceneData.swift` header: source
  `native/src/components/ascnd/koa/koa-scene.ts @ fac9ac2`, regenerated by
  `gen-koa-scene.mjs`, which reads `./out/koa-scene.js` (a *compiled* export
  of the design tool). The RN app is abandoned (17/11 directive); the
  compiled export step belongs to a dead toolchain. The file itself says
  "đừng sửa tay".
- **The only sanctioned extension paths** are (a) `tools/koa-wardrobe/build.py`
  — wardrobe items only, and it works by *deleting* the old RN groups and
  inserting redrawn ones; (b) the Blender gallery pipeline (`docs/koa-v2/
  blender/*.py`) — which produces storyboard mocks, not scene data. There is
  **no sanctioned path for "draw a new arm / leg / torso"**. So a new pose
  made by patching the old vector is not a shortcut around the system — it is
  the only path the system leaves open, and it bypasses every consistency
  mechanism (flags, golden tests, lighting) by construction.
- **Corroboration.** v3/v4/v5 turnaround SVGs were built to be loadable as new
  angles of `KoaSceneData` ("cùng khung 240×300 và cùng gốc tọa độ… có thể
  nạp làm một góc mới") — their READMEs all list "nạp vào `KoaSceneData`" as
  NOT VERIFIED. Sixteen days later (05/11 → 21/11) it is still not done.
  The v8 pose library (17 poses) likewise never entered the app.

### RC-3 — One-segment limbs + front-only drawing: new poses cannot change the silhouette

- **Evidence.** KOA_TECHNICAL_AUDIT §1: "Chỉ có một góc nhìn: mặt trước"
  and "Bộ khung chỉ có một mảnh cho mỗi tay và mỗi chân, không có khuỷu tay,
  bàn tay hay đầu gối." Verified in the data: `arm_left_upper` /
  `arm_right_upper` are single paths; `leg_left_lower` / `leg_right_lower`
  are single stubby paths (45.4×41.6); there is no thigh — the v8 README
  states it outright ("Bản vẽ gốc Koa không có đùi; thiếu đùi thì lunge và
  chạy không đọc ra được"). The v8 workarounds (adding a thigh as "một đoạn
  giãn từ hông tới bàn chân", arms as absolute-direction declarations)
  exist only in the Blender mock.
- **Impact.** Every "new pose" the current system can express is a rotation
  of the same two arm blobs and two leg blobs plus a prop. This is why poses
  read as "Koa wearing a different outfit / a different body" when someone
  hand-draws around it: the only way to make a pose *read* is to add geometry
  the rig doesn't have, and added geometry has no anchor in the master
  drawing.

### RC-4 — The renderer is full of cover-up patches for missing parts (the failure mode, in code)

Each of these is a verified local fix for a gap between the drawing and the
pose that needs it:

| Patch | File | What it hides |
|---|---|---|
| `neckFill` / `curiousFill` shoulder-neck patches | `KoaGesture.swift`, `KoaRender.swift` | Gap between head and torso when the head tilts ("đầu nghiêng không lộ khe giữa đầu và thân", Kiệt 25/10) |
| `idleArmLift` (+4 y on arms) | `KoaGesture.swift`, `KoaRender.swift` | Small dark gap between arm top and chin (Kiệt 25/10: "nâng tay lên thay vì vẽ che") |
| `shoulderTuck` (arms −6 y when raised) | `KoaRender.swift` | Upper arm edge meeting the chin leaves a dark wedge (Kiệt 06/11) |
| Arm flip at 25° (`armFlipDeg`, flip matrices 117.35°/62.65°) | `KoaRender.swift`, `KoaGesture.swift` | Drawn arm curves downward; raised without flipping, the paw points backwards (Kiệt 24/10, again 06/11) |
| `pawOutline` (faint stroke around half the paw) | `KoaGesture.swift`, `KoaRender.swift` | No hand exists; the outline fakes one when the hand presses the cheek |
| `lid(d:)` path-string replacement for `flop` | `KoaGesture.swift` | Heavy-lid layer only covers to y≈80 while the eyeball reaches y≈72 |
| `defsFlags` (old-face defs kept during transitions) | `KoaRender.swift` | Missing gradients made Koa render as "chỉ có mỗi tròng đen" during face changes (Kiệt 07/11) |
| `flat` mode + paper-mode sunlight wash | `KoaRender.swift`, `KoaFigureView.swift` | Per-part lighting exposed where parts overlap (Kiệt 15/10: "koa đang bị phủ một lớp tối của bản tối") |
| Rim light removed from arms | `KoaLight.swift` | Rim on the arm's bounding box read as a cut across the shoulder (Kiệt 24/10) |

**Reading:** these are good engineering under the constraint, but they prove
the constraint. A system that needs nine patches to pose its own character
is a system whose base drawing lacks the joints the poses need.

### RC-5 — The face is a boolean combination of layers, not a construction

- **Evidence.** `KoaFlags.flags()` builds ~110 flags; each expression is a
  set of layer toggles (`eyesOpen/Wide/Arc/Star`, `lidsHalf/Wink/Heavy/Sad`,
  `browArc/Raised/Sad/Angry/Strain`, 15+ mouth layers, `showStrain/Steam/
  Hearts/Sweat`, plus 6 whole-face gym layers `faceGym*` added via
  `build.py`). There is no model sheet constraining which combinations are
  legal, and no construction rule for where a mouth or brow may sit — the
  layers are positioned for the front view only.
- **Consequence.** New expressions can only (a) recombine existing layers
  (expressive range is bounded by the layer set), or (b) be added as whole-
  face layers through the wardrobe build pipeline. The prior audit found
  dead states (`.sad` / `.curl` / `.coat` / `.worry` unreachable, K-29) —
  the vocabulary grew faster than the triggers. A hand-drawn new face that
  doesn't decompose into these layers cannot enter the system at all.

### RC-6 — 2.5D turn was tried and reverted: the face is front-view decals

- **Evidence.** `KoaRender.walkFlags()`: "Kiệt 10/11 bỏ quay mặt 2.5D của
  Koa V2 (`KoaTurn`): mắt / má phía xa tràn khỏi đầu, đè lên tai. Về lại
  cách trước V2: dời cả mặt / tai / bụng một khoảng theo hướng đi."
  DUOLINGO_RESEARCH.md already predicted this: the v5 2.5D approach keeps the
  approved front drawing but has no side/back, and "mặt nghiêng và sau lưng
  là hình vẽ tay riêng".
- **Impact.** This bounds every rigging proposal: rotations beyond a few
  degrees break the face. The v5 turn works only in ±35°, and only for the
  head/body silhouette — the face still has to be re-drawn or faked past
  that. Any method comparison that assumes "rig the existing drawing and
  rotate it" must confront this measured failure.

### RC-7 — Visual regression testing exists, but it is screen-level, not identity-level

- **What exists (do not claim otherwise).** `KoaImageDiff` — CPU pixel diff
  (tolerance 16/255 per channel, max 0.01% differing pixels) over whole-
  screen snapshots in `KoaSnapshotTests` (reference PNGs under
  `ASCNDTests/__Snapshots__/KoaSnapshotTests/`); golden JSON fixtures
  (`koa-golden.json`, `koa-render-golden.json`, `koa-emotion-golden.json`)
  pin the render tree; the in-app Debug spec sheet (`KoaSheetView`,
  `ASCND_DEBUG_KOA=1`) shows all 34 expressions × 6 poses for eyeballing.
- **What does not exist.** No test measures a *new* pose against the DNA:
  no head-ratio check, no ear-shape check, no eye-geometry check, no
  silhouette-IoU gate (the v4 README computed IoU by hand: silhouette 0.999,
  parts ≥0.95, nose 0.85, tuft 0.46 — as a one-off, not a gate). The 8-
  criterion 1–5 scoring from the 05/11 audit was applied once, by one rater.
  A regression suite that only pins *existing* screens cannot catch a *new*
  pose drifting off-character; it can only catch accidental drift of old ones.

### RC-8 — The review loop exists on paper, but its inputs are missing

- **Evidence.** KOA_TECHNICAL_AUDIT §6 defines a 9-step visual check loop
  (mock → Kiệt approval → simulator capture at real size → compare with
  Character Bible + latest approved gallery version → 60 fps video → 8-
  criterion score → fix → save as new gallery version → CI snapshot →
  report on #527). Steps 3 (Bible), 5 (scoring) and 7 (gallery) are only as
  good as their inputs: the Bible doesn't exist (§ RC-1), scoring was done
  once by one rater, and the gallery versions (v8 poses, v3/v4/v5 turns)
  diverged from the app instead of feeding it. Repo rule (AGENTS.md):
  "Thiết kế lớn và art Koa: dựng mock cho Kiệt duyệt trước" — the gate
  exists; the reference it should check against does not.

### RC-9 — Under-constrained prompts (contributing, not primary)

- **Evidence.** Both spec sheets literally contain prompts for Claude Code
  ("PROMPT CHI TIẾT CHO CLAUDE CODE", "PROMPT NGẮN DÙNG CHO CLAUDE") that
  describe the style qualitatively — "đơn giản, đáng yêu, đầu to thân nhỏ",
  "màu phẳng, mắt to, má hồng, miệng cười hở, không viền" — with **no
  numbers**: no head ratio, no eye coordinates, no stroke widths, no layer
  order. The flat-spec's own tip admits the failure mode: "Nếu Claude vẽ
  chưa đúng, hãy nhắc mạnh…" — i.e. iterate verbally until it looks right.
- **Impact.** A prompt-only workflow cannot reproduce a character whose
  identity lives in coordinates. This cause is real but secondary: even a
  perfect prompt would hit RC-2/RC-3 (no path to add geometry, no joints).

### RC-10 — No reusable body-part system (consequence, not a separate cause)

- The 24-layer system in the construction manual *is* a body-part system on
  paper (one SVG file per layer, pivot at the bottom-center of each part).
  In the shipped code it exists only as named groups inside one JSON tree,
  and the pivots are hardcoded per use (`shoulderL/R`, `neck`, eye
  origins). The v5 turnaround SVG (`turn+00.svg`) already re-groups the
  figure into rig-ready named groups (`foot_L/R`, `leg_shade_L/R`, `torso`,
  `belly`, `chin_shade`, `arm_L/R`, `arm_shade_L/R`, `ear_L/R`, `head`,
  `tuft`, `eye_L/R`, `pupil_L/R`, `brow_L/R`, `blush_L/R`, `mouth`,
  `nose`) — measured bbox identical to `KoaSceneData` (x 8.6–231.4,
  y 12–293). The part system exists as a file; it was never adopted as the
  source of the app figure.

### Ranking summary

| Rank | Cause | Impact | Evidence strength |
|---|---|---|---|
| 1 | No Character Bible / master reference | Blocks every check | VERIFIED (file absent; loop step references it) |
| 2 | Geometry frozen at RN fac9ac2; no sanctioned path to add body parts | New poses must bypass the system | VERIFIED (headers, generator, NOT VERIFIED notes) |
| 3 | One-segment limbs, front-only drawing | New poses can't change silhouette | VERIFIED (measured paths; 05/11 audit §1) |
| 4 | Cover-up patches in the renderer | Proves the base lacks joints; each patch is a new inconsistency risk | VERIFIED (9 patches, code + Kiệt's dated notes) |
| 5 | Face = boolean layer combinations, no construction rules | New faces can't enter except as whole-face layers | VERIFIED (`KoaFlags`, dead states K-29) |
| 6 | 2.5D turn failed and reverted (10/11) | Bounds what rigging can do | VERIFIED (code comment + DUOLINGO_RESEARCH) |
| 7 | Regression tests are screen-level, not identity-level | New-pose drift is untestable | VERIFIED (KoaImageDiff, snapshot set, one-off IoU) |
| 8 | Review loop inputs missing | Gate exists, reference doesn't | VERIFIED (§6 loop vs RC-1) |
| 9 | Under-constrained prompts | New drawings drift by construction | VERIFIED (spec-sheet prompt text) |
| 10 | No adopted body-part system (v5 grouping unused) | Rework, not a root cause | VERIFIED (v5 SVG measured identical bbox, unused) |

---

## 6. What the mission brief gets wrong (corrections, with evidence)

1. **"Koa hiện chỉ có một tư thế đứng cơ bản."** Outdated. Six poses exist
   (`idle`, `turn34`, `running`, `lifting`, `stretching`, `relaxing`), five
   gestures, a walk cycle, 34 expressions, 17 emotions. The true statement
   is: *six poses share one silhouette*, and pose readability is 2/5.
2. **"Claude lấy vector Koa cũ rồi tự vẽ thêm tay, chân."** The deeper truth:
   there is no other way to add a limb in the current system. The sanctioned
   pipelines (wardrobe build, Blender gallery) don't cover body geometry.
   Blaming the patching habit misses that the system forces it.
3. **"Không có model sheet."** Half true. There *are* two spec sheets — but
   they contradict the shipped art (§5.1) and neither is treated as binding
   (the code never references them; the gallery, not the sheets, is where
   new art is versioned). The missing artifact is a *measured, binding*
   Character Bible, not "any reference image".
4. **"Không có rigging."** There *is* a rig, of a sort: named groups
   (`POSERIG`/`BODYRIG`/`HEADRIG`/`ARMS`/`LEGS`), per-part origins,
   keyframe tracks, gesture matrices, walk phases. What it lacks is joints:
   one segment per limb. "Add rigging" without "add joints" changes nothing.
5. **"Không có visual regression testing."** False as stated. Pixel-diff
   snapshot tests + golden JSON fixtures + an in-app spec sheet exist. What's
   missing is an *identity* gate for new poses (RC-7).

---

## 7. Constraints for the pose-system design (Phase V input)

Any proposal that ignores these will fail against the code:

1. **The app has no image-based Koa path.** A new pose must arrive as
   flag-conditioned layers in the 240×300 scene format (or the pipeline is
   replaced wholesale, with all 70 wardrobe items + 6 ranks re-done).
2. **The face only works from the front (±35° at most).** Measured failure
   10/11. Side/back faces must be hand-drawn layers, not rotations.
3. **New body geometry needs joints, not just new paths.** Arms need
   forearm + hand; legs need thigh + shin; the 05/11 audit already scoped
   this as the biggest job (all 70 wardrobe items touch arms/legs).
4. **Lighting is procedural.** New art must use flat base colours; shading
   comes from `KoaLight`. Art with baked gradients will double-shade.
5. **The golden tests pin the RN payload.** Any scene change must either
   keep `rnPayload` golden or deliberately update the fixtures with Kiệt's
   approval — the fixtures are the only automated identity record.
6. **Kiệt approves art by mock first** (repo AGENTS.md). No pose enters the
   app without a mock + gallery version + simulator capture.
7. **Rive / Spine / 3D / Lottie / AI-cutout were already tried and dropped**
   (27/07/2026, RN era; mascots README). A proposal to re-adopt one must
   address the recorded reason (AI-only workflow cannot author / diff /
   verify it end-to-end), not just its feature list.

---

## 8. Gaps and UNVERIFIED items

- **G1 — Git history of Koa files** (when each file changed, by whom, why;
  comparing Koa versions across commits; other branches). BLOCKED by the
  execution-risk check (see header). Needs a separate authorization decision.
- **G2 — Runtime behaviour.** No animation was judged visually; no frame
  times, no simulator captures. The v0 baseline captures (05/11) are the
  last visual record; the in-app figure has changed since (gym faces,
  KOA-T48, PR #995).
- **G3 — The 4 Day scene PNGs' removal.** Verified gone at this tip; the
  removing PR / reason was not traced (needs G1).
- **G4 — Whether `koa-svg-spec-sheet.png` differs from the flat spec.**
  Not viewed; both are RN-era sheets, likely near-duplicates. Low value.
- **G5 — `KoaScene` wardrobe diff.** `KoaWardrobeData` vs `KoaSceneData`
  node-by-node diff was not computed (only headers + build.py logic read).
  The build.py REDRAWN set (all 70 items) is the authoritative statement.
- **G6 — Exact `KoaWalk` tuning numbers** (stride, bob amplitude, style
  parameters) were not tabulated; the walk *architecture* (feet pinned,
  phases, lag) was verified.

---

## 9. Sources

- Repo at tip `44862412` (branch `native/ios-rewrite`): file paths cited
  inline throughout. Key files: `apps/ios/Packages/ASCNDKit/Sources/
  ASCNDCore/Koa/KoaSceneData.swift`, `KoaWardrobeData.swift`,
  `KoaRender.swift`, `KoaPaint.swift`, `KoaLight.swift`, `KoaMath.swift`,
  `KoaFlags.swift`, `KoaEmotion.swift`, `KoaMood.swift`, `KoaGesture.swift`,
  `KoaWalk.swift`, `KoaFigurePlans.swift`, `KoaScene.swift`;
  `apps/ios/ASCND/Features/Mascot/KoaFigureView.swift`;
  `apps/ios/ASCNDTests/KoaImageDiff.swift`;
  `apps/ios/tools/koa-wardrobe/build.py`;
  `apps/ios/tools/insights-golden/gen-koa-scene.mjs`;
  `native/src/components/ascnd/koa/koa-scene.ts` (81,123 bytes);
  `native/assets/mascots/{README.md, KOA_OUTFIT_CATALOGUE.md,
  koa-construction-manual.png, koa-flat-spec.png, koa-svg-spec-sheet.png}`;
  `apps/ios/docs/koa-v2/{DUOLINGO_RESEARCH.md, KOA_TECHNICAL_AUDIT.md,
  KOA_V2_SLICE.md, gallery/…}`.
- Prior audit: `~/workspace/koa-audit/KOA_AUDIT_REPORT.md` + `working/
  explorer-mascot-core-economy.md`, `explorer-animation-3d-state.md`,
  `explorer-coach-expressions-sound.md` (tip `2a904952`, 17–18/11/2026).
- Measurements: Python parse of the `KoaSceneData` JSON (628 nodes;
  cubic-sampled path bounding boxes, ±~1 px on curves) and of the
  `v3`/`v4`/`v5` turnaround SVGs; scripts in
  `~/workspace/koa-mascot-research/working/` (`/tmp/parse_koa.py`,
  `/tmp/bbox_koa.py`, `/tmp/svg_measure.py` — rerun to reproduce).
- Accessed 2026-11-21 CST. No internal Duolingo or ASCND documents were
  accessed; all evidence is from the public repo and its own docs.
