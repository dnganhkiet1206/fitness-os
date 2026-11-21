# KOA POSE SYSTEM ARCHITECTURE

**Phase V — ASCND Mascot Mission | Synthesis**
**Date:** 2026-11-21 (CST) · **Koa audit tip:** `44862412` (`native/ios-rewrite`)
**Inputs:** Phase II `KOA_CHARACTER_DNA.md` (measured) + `TECHNOLOGY_COMPARISON.md`
(Method B core + A-in-C + E-reference + D-deferred).
**Status:** Proposed architecture. Nothing here changes the repo — every repo step
needs Kiệt's plan approval first (17/11 plan-first law).

---

## 0. Design stance (one paragraph)

Koa's pose system is **a jointed modular vector figure in the existing 240×300
scene format, posed from a Blender reference, governed by a measured Character
Bible and an automated identity gate**. No new runtime is introduced in the
recommended path: the system finishes the architecture the code already implies
(named rig groups, pivots, flag conditions, `build.py`) instead of replacing it.
New geometry is the price of admission — rotation-only posing was measured to
fail (PoC) — and the geometry is added once, as jointed parts, so every later
pose is an arrangement, not a drawing.

---

## 1. Master Character Reference (the Bible)

**Deliverable: `KOA_CHARACTER_BIBLE.md`** — the file the 05/11 audit proposed
and that still does not exist (Audit RC-1). It is written **from the measured
DNA, not from the spec sheets**: where the two RN-era spec sheets contradict
the shipped art, the shipped art wins and the disagreement is logged as a
disputed item for Kiệt (DNA §7.3: D-1 nose hex, D-2 tail, D-3 strokes/gradients,
D-4 back view, D-5 tuft IoU 0.46).

### 1.1 Contents (each item is a measured value, not a qualitative description)

| # | Reference | Content (measured at tip 44862412) |
|---|---|---|
| R1 | Front view | The shipped front drawing, as rendered by the PoC neutral frame (`poc/poc-neutral.png`): head-front 160.2×134, ears 83.4×93.6 each, span x 8.6–231.4, feet y≈293. |
| R2 | Side view (¾ + profile) | **To be drawn, not rotated.** The v3/v4 turnarounds (8 angles, from 3D) are the starting reference; the side face is a new hand-drawn layer (C2: rotations fail past ±35°). |
| R3 | Three-quarter view | `turn34` exists as a transform fake; the Bible records the *drawn* ¾ face from v4 (`0-0-front.svg` family) as the reference, and marks the transform fake as deprecated for new work. |
| R4 | Back view | **Decision needed (D-4):** draw a back (plain silhouette + ear backs + tuft, per v4 README "sau lưng trơn một màu") or drop it from the sheets. Default recommendation: draw the plain back — a mascot that cannot turn around cannot celebrate, walk away, or be seen from behind in the room. |
| R5 | Neutral standing pose | The neutral frame: feet planted, arms at sides, `idle` breathing. The zero point every pose is measured against (silhouette IoU baseline). |
| R6 | Neutral facial expressions | The 34-expression layer set (`KoaFlags`), with the neutral face as the reference arrangement: eyes (82,96)/(158,96), nose (120, 84–126), mouth y 128–144.5. |
| R7 | Anatomy reference | Joint map (§2): pivots, segment lengths, rotation limits. |
| R8 | Colour reference | The 7-colour base palette with exact hex (§3.3 of DNA) + the rule that accents never recolour the face or fur. |
| R9 | Shape-language reference | Rounded everywhere; soft-grey `#A9B2BC` outline (never black); flat colours only; shading is procedural (`KoaLight`), never baked. |
| R10 | Proportion reference | The ratio table (DNA §2): head 47.7% of figure height (front), 1.43× torso width, legs 14.8%, arms 25.8%, eye height 35% of head height, inter-eye gap 1.11 eye widths. |

### 1.2 How the Bible is maintained

- **Source of truth is the shipped scene data**, not the Bible document. The
  Bible is regenerated/verified against `KoaSceneData.swift` by script (the
  PoC parser already does this): if a number in the Bible disagrees with the
  scene, the Bible is wrong, not the scene — until Kiệt approves a change.
- **Versioned with the gallery** (`docs/koa-v2/gallery/`): each Bible version
  names the gallery version it matches (v8, v9, …).
- **Disputed items (D-1…D-5) are decided by Kiệt**, recorded with the decision
  and date. The Bible must never silently resolve a dispute.

---

## 2. Character construction rules (grounded in measured DNA)

These are the binding rules. "Binding" means the identity gate (§5 of
KOA_QUALITY_STANDARD.md) enforces the measurable ones automatically, and the
manual review enforces the rest.

### 2.1 Immutable rules (breaking one = rejection, no exceptions)

| # | Rule | Measurement / test |
|---|---|---|
| I-1 | Head-front outline fixed: 160.2×134, x 39.8–200, y 34–168 | Head-bbox check, ±2 units |
| I-2 | Ear outer shape + span fixed: 83.4×93.6 each, total span x 8.6–231.4 | Ear-span check, ±3% |
| I-3 | Eye size + placement fixed: 36×47 ovals, centres (82,96)/(158,96), gap 40 | Eye-centre check, ±2 units |
| I-4 | Nose fixed: 26.9×42 teardrop, y 84–126, centred x=120 | Nose-bbox check, ±2 units |
| I-5 | Fur `#BFC7CF` + belly/inner-ear `#F4F6F8` | Palette check (exact hex) |
| I-6 | Outline is soft grey `#A9B2BC`, never black | Stroke-colour check |
| I-7 | Frame 240×300, feet at y≈293 | Frame check |
| I-8 | No neck: chin overlaps torso by 28 units (head bottom y 168, torso top y 140) | Overlap check |
| I-9 | Layer order: shadow → body → ears → inner ear → face → eyes → pupils → brows → nose → mouth → blush | Tree-order check |
| I-10 | No-guilt face policy: Koa never looks sad *at* the user for unread data | Manual review (expression × context) |

### 2.2 Flexible rules (may vary, within stated bounds)

| # | Rule | Bounds |
|---|---|---|
| F-1 | Arm rotation | Around shoulders (80,178)/(160,178); **flip past 25°** so the paw doesn't point backwards (existing `armFlipDeg` rule) |
| F-2 | Leg rotation | Around hips (104,254)/(136,254); feet stay near y≈293 when standing |
| F-3 | Head rotation | Around neck (120,166): −9°…+9°; gaze ≤3.6°; beyond ~10° the chin/torso gap opens — a sign the pose is out of range, not a cue to add a patch |
| F-4 | Mouth/brow/lid layers | Any combination from the §5 face system, including whole-face gym layers |
| F-5 | Effects (blush, tongue, sweat, steam, hearts, strain) | Free, inside the head outline |
| F-6 | Wardrobe (7 slots × 10 items) | May cover fur; may not recolour face or change I-1…I-4; new items go through `build.py` |
| F-7 | Rank build (0–5) | Arms ±11·t, ≤1.22×; torso ≤1.16× wide; never the head |
| F-8 | Gaze/blink/poke | Eyes translate ≤4.4; blink is a vertical lid scale |
| F-9 | Ground shadow | Ellipse rx 64, ry 9 @ 0.45; may stretch or be omitted |
| F-10 | Whole-figure motion | Bob a few units; cheer jump −26; small rotations about (120,293) |

### 2.3 New rules this architecture adds (beyond DNA §8)

| # | Rule | Why |
|---|---|---|
| N-1 | **No new geometry without a joint.** A new arm/leg segment must declare its parent joint, pivot, and rotation limits in the joint map (§3). A free-floating new path is rejected. | Closes the patch-the-vector failure mode at the rule level. |
| N-2 | **No new geometry without a flag.** Every new layer enters through an `if` condition with a name, so golden tests and the spec sheet can see it. Unconditional new paths are how drift starts. (DNA rule 6, elevated to architecture.) | Audit RC-1/RC-9. |
| N-3 | **Parts overlap, never detach.** Adjacent parts must overlap by ≥4 units at the joint in every pose (the head/torso overlap is the model). A visible gap is a defect, not a style. | Prevents the "puppet" failure the mission warns about. |
| N-4 | **The face stays front-facing.** Past ±35° turn, draw a new side/back face layer (C2). | Measured failure 10/11. |
| N-5 | **Props are declared, not drawn into the body.** A prop (dumbbell, cup, trophy) is a separate named layer with its own anchor (e.g. hand anchor (180,222) for `poseLift`), never merged into an arm path. | So props can be re-used, re-coloured, and removed without touching the body. |
| N-6 | **One source of truth per part.** A part's geometry lives in exactly one place (the scene data, generated from the part library). The Blender model is a *reference* for posing, not a second master — unless Kiệt later decides the 3D model becomes the master, in which case the scene data is generated from it and the old master is deleted, not kept alongside. | Prevents the two-masters drift (TECHNOLOGY_COMPARISON §1.5). |
| N-7 | **Celebrate once per milestone, never guilt.** Applies to poses too (DNA rule 10). | Character policy, not drawing policy. |

---

## 3. The joint map (the single biggest addition)

The current figure has named groups but no joints (Audit RC-10). The joint map
is the difference between "a rig" and "a drawing with pivots."

### 3.1 Joints to add (one drawing job, done once)

| Joint | Parent | Pivot (240×300) | Segments | Rotation limits |
|---|---|---|---|---|
| Shoulder L/R | Torso | (80,178) / (160,178) — existing pivots | Upper arm (existing capsule, 52.4×72.5) + **forearm (new)** + **hand/paw (new)** | Upper ±110° (flip past 25°); forearm 0–130° flexion; hand free within forearm axis |
| Elbow L/R | Upper arm | End of upper-arm capsule (~(72,225) / (168,225) — to be measured from the redrawn part) | Forearm + hand | 0–130° |
| Hip L/R | Torso | (104,254) / (136,254) — existing pivots | **Thigh (new)** + shin (existing stub, 45.4×41.6) | Thigh −70°…+70°; shin 0–120° flexion |
| Knee L/R | Thigh | End of thigh (~(104,272) / (136,272) — to be measured) | Shin + foot | 0–120° |
| Neck | Torso | (120,166) — existing | Head (existing) | −9°…+9° (F-3) |
| Waist | — | (120,200) approx. | Torso vs head+arms | ±6° lean; more requires a new torso drawing (bean torso can't fold — v8 README: deadlift/plank read as "bend", not "hip hinge") |

**What "thigh" means here:** exactly what the v8 README already scoped — "a
segment stretching from hip to foot; hidden inside the torso when standing,
visible only when stepping, sitting or squatting." The v8 Blender model already
implements this; the 2D part is the missing piece.

**Scope warning (VERIFIED, Audit RC-3):** all 70 wardrobe items touch arms/legs
in some way. Adding forearm/thigh changes the silhouette under clothing. The
jointed rebuild must include a wardrobe audit: which items need redrawn arm/leg
layers, and which can keep the old capsule (e.g. long sleeves hide the elbow).
This is the largest cost in Option B and it must be estimated by the artist
doing the rebuild, not by this document.

### 3.2 What stays one-segment (deliberately)

- **Ears, head, torso, feet:** no joints needed. The torso's bean shape is a
  feature (Duolingo P1: a one-shape body removes the proportion problem — but
  for Koa the "one shape" is the head, not the body; see §6).
- **Hands:** a paw, not fingers. Duo's rule ("no fingers, ever" — Phase I,
  STRONGLY SUPPORTED) transfers well: Koa's paw is a rounded capsule end with
  the existing `pawOutline` (1.8 pt @ 0.55) as the grip cue. No finger
  geometry is ever added.

### 3.3 Rig groups (adopt the v5 naming — it already exists)

The v5 turnaround SVG groups the figure as: `foot_L/R`, `leg_shade_L/R`,
`torso`, `belly`, `chin_shade`, `arm_L/R`, `arm_shade_L/R`, `ear_L/R`,
`head`, `tuft`, `eye_L/R`, `pupil_L/R`, `brow_L/R`, `blush_L/R`, `mouth`,
`nose`. The scene format's groups (`POSERIG`/`BODYRIG`/`HEADRIG`/`ARMS`/
`LEGS`) map onto these. **Adopt v5's naming as the canonical part list** and
extend it with `forearm_L/R`, `hand_L/R`, `thigh_L/R`, `shin_L/R` (renaming
`leg_left_lower` → `shin_L` at the same time, with the old id kept as an alias
until the golden tests are updated with Kiệt's approval).

---

## 4. Pose library architecture

### 4.1 Groups and target counts (50–100 poses total)

| Group | Poses | Method | Notes |
|---|---|---|---|
| **Core** (6) | idle, standing, walking, running, sitting, resting | B (rig) + effects | Running/sitting need the jointed legs + motion (bob, speed lines, dust). Sitting needs thigh (PoC: without it, sitting ≡ standing). |
| **Fitness** (12) | dumbbell curl, bench press, squat, deadlift, pull-up, push-up, stretching, plank, flexing, celebrating a workout, kettlebell swing, lunge | A-in-C (hand-drawn) for push-up/plank/squat/deadlift/lunge/bench (silhouette must change); B for curl/flexing/stretching | The v8 gallery already mocked all of these in Blender — the library starts from v8's 17 poses, not from zero. |
| **Emotional** (10) | happy, excited, confident, tired, sad, surprised, motivational, proud, focused, sheepish | Face layers (existing 34-expression system) + B gestures | Mostly face + gesture combinations; few need new body geometry. The no-guilt policy (I-10) bounds "sad/tired" — tired is allowed, disappointed-at-the-user is not. |
| **App interaction** (12) | greeting, pointing, holding an object, thumbs-up, celebrating XP, showing achievements, encouraging, rest-day encouragement, waving, cheering, thinking, listening | B (rig) + props (N-5) | The highest-ROI group: these are the poses the app actually shows every day. |
| **Seasonal / event** (open) | Tet, Christmas, Halloween, streak milestones | Wardrobe + B | Wardrobe items already cover this; poses reuse core/fitness geometry. |
| **Total target** | **40 named poses in v1, 50–100 by v3** | | v1 = the 17 v8 poses promoted into the app + 12 interaction poses + 11 core/emotional. v2/v3 add fitness depth + seasonal. |

### 4.2 Rig-generated vs hand-illustrated (decision rule)

A pose is **rig-generated** (Method B arrangement) if and only if:
1. Its silhouette IoU vs neutral is ≥0.55 (measured — the PoC's running 0.870
   and sitting 0.980 pass this, yet fail readability, so IoU is necessary, not
   sufficient), **and**
2. Three independent raters can name the pose from the still image alone
   (the readability test — see KOA_QUALITY_STANDARD.md §4), **and**
3. It needs no new body geometry beyond the joint map (§3).

Otherwise it is **hand-illustrated** (Method A): a new drawing, built in Blender
first (pose blocked on the 3D model, §5), traced into scene layers, reviewed
as a gallery version. Push-up, plank, squat, deadlift, lunge, bench press are
hand-illustrated by this rule — the PoC proves rotation cannot produce them.

### 4.3 Pose record (every pose is a record, not just an image)

```yaml
pose_id: curl_dumbbell
group: fitness
method: rig          # or hand
base_pose: idle
face: grit           # expression id from KoaFlags
gesture: null
joints:              # joint angles, degrees
  shoulder_R: -85
  elbow_R: 115
  shoulder_L: 10
props: [dumbbell]    # declared props (N-5), with anchor
wardrobe: [tank]     # optional
camera: front        # front | q34 | side | back | low | high
gallery_version: v9
identity_gate: { silhouette_iou: 0.94, head_ratio_delta: 0.0, ear_span_delta: 0.0, raters: 3/3 }
status: approved     # draft | in-review | approved | shipped
```

---

## 5. Asset pipeline

```
Reference → Construction → Pose → Review → Export → Integration → Regression
```

| Stage | Input | Output | Owner / tool | Gate |
|---|---|---|---|---|
| **1. Reference** | Bible (R1–R10) + v8 gallery + Duolingo principles (not art) | Pose brief: 1-page (intent, camera, face, joints, props) | Designer (+ AI ideation, Method F) | Brief approved by Kiệt for new silhouette poses (C6) |
| **2. Construction** | Pose brief + joint map + part library | Blender block (existing `koa_pose.py`: add one line to `POSES`) + flat 240×300 frame | Blender 5.2 (`koa_model.py` / `koa_pose.py`) | Blender frame passes silhouette + readability checks (§4.2) |
| **3. Pose** | Blender frame | Scene-format layers: named groups, `if` flags, pivots, keyframes (via the build script — extension of `tools/koa-wardrobe/build.py`) | Build script + human artist | Layers match the Blender frame (IoU ≥0.95 between Blender render and scene render) |
| **4. Review** | Scene layers + gallery version | Mock + simulator capture at real size + 8-criterion score (3 raters) | 9-step loop (Audit §5 RC-8) | Score ≥7 median, no criterion <5; Kiệt mock approval for new silhouettes |
| **5. Export** | Approved layers | `KoaSceneData.swift` regenerated (or a `KoaPoseData` extension — see §6) + updated golden fixtures (with Kiệt's approval, C5) | `gen-koa-scene.mjs` + build script | Golden fixtures updated deliberately, never silently |
| **6. Integration** | New scene data | `KoaFlags` entry (pose id → flags), `KoaFigureView` wiring, call-site adoption | Swift (agent) | CI green on exact head; no other feature touched |
| **7. Regression** | New pose in-app | Identity-gate results in CI + snapshot updates | `KoaImageDiff` + gate script | Gate passes (KOA_QUALITY_STANDARD.md §3) |

### 5.1 Naming, folders, versioning

- **Pose ids:** `snake_case`, group-prefixed: `core_run`, `fit_curl`, `emo_proud`, `app_thumbs_up`.
- **Files:** poses live in the scene data, not as files — but their *records*
  (§4.3) live in `apps/ios/docs/koa-v2/poses/<pose_id>.yaml`, and their gallery
  frames in `apps/ios/docs/koa-v2/gallery/v<NN>-pose-library/poses/`.
- **Versioning:** gallery versions (v8 → v9 → …) are the art versions; the
  scene data is generated from the *approved* gallery version only. A pose is
  never edited in the scene data directly — edit the gallery, regenerate.
- **Validation:** every stage's gate is a check that can fail the build or the
  review; no gate is advisory-only.

### 5.2 The missing bridge (the one new tool to build)

The pipeline's only genuinely new software is the **Blender-frame → scene-layer
converter**: it takes a Blender flat render (or the underlying 2D-projected
paths) and emits named scene-format groups with `if` flags. Two options, in
order of preference:
1. **Trace assist, not auto-trace:** the artist draws the layers in Inkscape/
   Figma using the Blender frame as an underlay; a script converts the SVG
   groups (v5 naming) into scene JSON and runs the identity gate. Human
   authorship preserved; automation handles the boring parts.
2. **Direct projection:** extend `koa_pose.py` to export the 3D model's
   projected outlines as SVG paths in the 240×300 frame (the v3/v4 turnarounds
   already did this once). Higher automation, but the projected paths need
   human cleanup (the v4 tuft IoU 0.46 shows projection isn't exact).

Either way, the converter is a **build tool, not a runtime dependency**, and it
must be AI-verifiable (plain Python, diffable JSON output) — C8's recorded
objection applies to it too.

---

## 6. Open design questions (for Kiệt / Claude review)

1. **Scene data growth:** should new poses extend `KoaSceneData.swift` (76 KB
   today) or live in a separate `KoaPoseData.swift` merged at runtime? The
   wardrobe precedent (`KoaWardrobeData`, 413 KB, generated by `build.py`)
   suggests a separate generated file is viable — but it doubles the golden-test
   surface. **Recommendation:** separate file, merged by `KoaScene` at load,
   so the RN payload stays untouched (C5).
2. **Back view (D-4):** draw or drop? Recommendation: draw (plain back).
3. **Tail (D-2):** the manual lists a tail layer; the app has none. Was it cut
   deliberately? If Kiệt wants a tail, it becomes a new part in the joint map;
   if not, the manual is corrected.
4. **Nose hex (D-1):** spec `#3A4654` vs scene `#39424E`. Recommend the scene
   value (it ships); correct the spec.
5. **Torso folding (waist joint):** the bean torso can't fold. Deadlift/plank
   need either a two-part torso or a hand-drawn bent torso per pose. The
   architecture leaves the waist joint at ±6° and sends deeper bends to
   hand-illustration — a reviewer may argue for a segmented torso instead.
   Record the disagreement if so.

---

## 7. What this architecture deliberately does NOT do

- **No new runtime** in the recommended path (no Rive/Spine/Lottie in the app
  until the deferred evaluation).
- **No 3D in-app Koa.** Blender is a reference; the app stays 2D (Koa is
  2D-only by decision).
- **No AI-authored layers.** AI ideates; humans draw.
- **No RN.** Nothing here touches or depends on the frozen RN app.
- **No change to the 34-expression face system** except adding poses that use
  it. The face system works; the body is what needs joints.
