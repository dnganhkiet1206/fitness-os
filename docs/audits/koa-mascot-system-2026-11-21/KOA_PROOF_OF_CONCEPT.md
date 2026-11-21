# KOA PROOF OF CONCEPT

**Phase VI — ASCND Mascot Mission | Synthesis**
**Date:** 2026-11-21 (CST) · **Koa audit tip:** `44862412` (`native/ios-rewrite`)
**Status:** A real, small experiment was run and is reported honestly below
(§3). The full 6-pose PoC (§4) is a plan, not a completed result — what was
NOT tested is listed in §5.

---

## 1. The question the PoC answers

**Can the shipped Koa drawing be posed into new readable poses by rotating its
existing parts only — the only posing mechanism the current pipeline has?**

The mission brief assumes the answer is "no, because Claude patches the old
vector." Phase II refined this: the system *forces* patching, because there is
no sanctioned path to add geometry. This PoC tests the sharpest form of the
claim: even with *perfect* rotations (exact pivots, exact angles, no AI
involved), can the existing parts express the six required poses?

If the answer is no for a pose, that pose needs new geometry — which is the
decision the architecture (KOA_POSE_SYSTEM_ARCHITECTURE.md §4.2) is built on.

---

## 2. Method (what was actually done)

**Script:** `poc_rig_test.py` (in this directory). **Inputs:** the real
`KoaSceneData.swift` JSON at tip `44862412` (628 nodes), parsed with the Phase II
parser (`/tmp/parse_koa.py`). **Renderer:** a flat PIL renderer written for this
PoC — every filled leaf shape flattened to polygons (cubic Béziers sampled at
12 segments, quadratics at 10, ellipses/circles at 36 points), drawn in tree
order at 2× (480×600). **No strokes, no `KoaLight` procedural shading, no
gradients, no animation keyframes** — frozen single frames, not the 18-second
run loops. Face variants other than neutral excluded; wardrobe excluded.

**Variants (all rotations around the pivots the code itself uses):**

| Variant | Transform applied |
|---|---|
| neutral | None (baseline) |
| running | Arms ±25° about shoulders (84,184)/(156,184); legs ±18° about hips (104,252)/(136,252); head −5° about (120,180); whole figure +4° about (120,288) |
| curl | Right arm −85° about (156,184) — past the 25° flip rule; dumbbell prop (bar + 2 plates) drawn at the rotated hand, grip centre measured (179.5, 169.2) |
| push-up | Whole figure +90° about (120,288); ground shadow dropped; fit-scaled 0.826× to fit the 240×300 frame |
| sitting | Legs +70° about hips (104,252)/(136,252) |

**Recentring:** each variant's figure bbox was recentred on the neutral bbox
centre (120,156) and fit-scaled if it exceeded the frame, so variants are
compared in-frame rather than clipped. This is a measurement choice, recorded
here: the push-up's 0.826× shrink is itself a finding (a horizontal Koa does
not fit the 240×300 frame at full size).

**Metrics:** silhouette IoU vs neutral (mask overlap), figure bbox, plus a
visual verdict from looking at the rendered PNGs (the author of this PoC
viewed all five frames).

**Outputs:** `poc/poc-neutral.png`, `poc-running.png`, `poc-curl.png`,
`poc-pushup.png`, `poc-sitting.png`, `poc-contact-sheet.png`.

### 2.1 A renderer-fidelity problem found during the PoC (new finding)

The naive flat render drew a **faceless Koa**: the JSON lists four unnamed
fur-coloured (`#BFC7CF`) ellipses exactly over the eye whites, *after* them in
tree order, so a tree-order painter covers the eyes entirely. In the real app
`KoaRender` restructures the eye group (`KoaRender.swift:188`, `isEyeGroup` +
lash paths), so the whites paint on top and the fur ellipses are only a ~1 px
rim. The PoC drops those four ellipses (they are invisible backing once the
eyes are on top). **Implication for any future pipeline: a new renderer or
exporter must replicate KoaRender's eye-group handling, not just the JSON tree
order — otherwise it will ship a faceless Koa.** This was not in Phase II; it
is a PoC finding, tier: VERIFIED (code read + render reproduced).

---

## 3. Results (measured 2026-11-21)

| Pose | Silhouette IoU vs neutral | Bbox (240×300) | Visual verdict (looking at the PNG) |
|---|---|---|---|
| neutral | 1.000 (baseline) | (8.5, 15.5, 231.5, 300) | Renders correctly; matches the shipped Koa (both eyes, nose, mouth, blush, belly). **Validates the PoC pipeline itself.** |
| running | **0.870** | (8.5, 10.5, 231.5, 300) | **FAIL — reads as standing.** Arms ±25° on capsule arms is nearly invisible (capsules are symmetric, mostly hidden behind torso/ears); legs slightly apart; no stride, no readable lean. The shipped `running` pose's readability comes from *motion* (bob, 18 s loops) + speed lines + dust — none of which exist in a frozen frame. |
| curl | **0.942** | (8.5, 15.5, 231.5, 300) | **PARTIAL — reads as "holding a dumbbell out to the side", not a curl.** The arm is a straight horizontal capsule at chin height; there is no elbow bend, so the weight never comes up toward the shoulder; the dumbbell floats at the arm's end with no hand gripping it; the arm merges with the chin. A viewer names it "holding", not "curling". |
| push-up | **0.368** | (4, 64, 236.5, 248) — after 0.826× shrink | **FAIL — reads as "Koa lying on its side / knocked over".** Face sideways, ears pointing right, belly up, no plank line, no supporting arms, no prone body. Rotation-only cannot produce a push-up; it can only rotate the standing figure. |
| sitting | **0.980** | (8.5, 15.5, 231.5, 300) | **FAIL — indistinguishable from neutral except slightly splayed feet.** The stub legs (45.4×41.6) rotating 70° barely change the silhouette because the torso hides the upper leg. Sitting needs a thigh (as the v8 README already concluded: "thiếu đùi thì lunge và chạy không đọc ra được"). |

### 3.1 The key inference (INFERRED from the measurements, but the numbers force it)

**Silhouette IoU does not predict pose readability.** Running (0.870) and sitting
(0.980) pass any plausible IoU threshold and still fail as poses; push-up (0.368)
fails IoU and fails visually. IoU measures "how much of the standing silhouette
is still there" — which is the *opposite* of what a new pose needs. A pose that
changes the silhouette enough to be readable will have a *low* IoU. The identity
gate must therefore treat IoU as a **floor for same-orientation poses** (the
figure must still overlap itself enough to be recognisable) and rely on human
readability rating for the actual pass/fail (see KOA_QUALITY_STANDARD.md §4).
This is consistent with the mission's own warning: "two poses can have low pixel
similarity and still be the same character."

### 3.2 What the PoC proves about the current method

1. **Rotation-only posing is exhausted.** The current pipeline's *only* posing
   mechanism fails 3 of 4 tested poses outright and partially passes the 4th —
   with perfect rotations and no AI in the loop. The failure is structural
   (missing joints/geometry), not a prompting or skill problem. This **overturns
   the mission brief's framing** ("Claude patches the old vector" as the cause):
   patching is the only move the system allows, and even perfect non-patched
   posing fails.
2. **Motion carries what geometry can't.** The shipped running pose works (in
   the app, as an animation) because of bob + loops + speed lines + dust — i.e.
   *effects*, not geometry. That is a design principle worth keeping: for
   rig-generated poses, effects are part of the pose, not decoration.
3. **The frame is part of the constraint.** A horizontal pose doesn't fit
   240×300 at full size. Any prone pose (push-up, plank) needs either a
   smaller figure scale or a wider frame — a decision for the architecture
   (recommended: scale the figure to ~0.8× for prone poses, and record the
   scale in the pose record).

---

## 4. The full 6-pose PoC plan (not yet executed)

The experiment above is a *rig test*, not the full PoC the mission asks for.
The full PoC builds the six poses **the proposed way** (jointed parts +
Blender reference + hand-drawn layers where needed) and compares the three
methods. It is executable as written; nothing in it requires a decision Kiệt
hasn't made except the jointed-part drawing job itself (which needs a plan
approval + an artist).

### 4.1 Poses and their assigned method

| # | Pose | Method (proposed) | Why this method |
|---|---|---|---|
| 1 | Neutral standing | Baseline (existing) | The control. |
| 2 | Running | **B + effects**: jointed legs (thigh+shin) with a real stride, arms swinging on two-segment joints, + speed lines + dust + bob | PoC proves rotation-only fails; thigh is required (v8 README). |
| 3 | Sitting / resting | **B**: thigh + shin, torso reclined −6° (waist limit), `legsSit` + `poseRelax` layers | PoC proves stub legs can't sit. |
| 4 | Dumbbell curl | **B**: shoulder −85° + elbow 115° flexion, dumbbell prop on the hand anchor | PoC partial-pass shows the shape is close — the elbow is the missing piece. |
| 5 | Celebrating | **B + Lottie**: `cheer` gesture (±108° + jump −26, existing) + confetti/sparkle effects as a linear Lottie overlay | Tests the deferred Lottie track at small scale, without committing the app to it. |
| 6 | Push-up | **A-in-C (hand-drawn)**: Blender-blocked prone pose, traced into scene layers at 0.8× scale | PoC proves rotation cannot do this; it is the hand-illustration test case. |

### 4.2 Steps

1. **Draw the jointed parts** (artist job, ~1–2 weeks estimated — the artist
   estimates, not this document): forearm + hand, thigh + shin, from the DNA
   measurements, in the 240×300 frame, flat colours only. Kiệt approves by
   mock (C6).
2. **Block the 6 poses in Blender** (`koa_pose.py`: add 6 lines to `POSES`;
   the model already exists). Render flat 240×300 frames.
3. **Convert to scene layers** (trace assist, §5.2 of the architecture doc)
   and wire `if` flags.
4. **Run the identity gate** (KOA_QUALITY_STANDARD.md §3) + 3-rater readability
   test (§4) on all 6 poses.
5. **Compare three methods on the same 6 poses:**
   - (i) current method — rotation-only (already measured above: 1 partial, 4 fail);
   - (ii) proposed method — jointed + Blender + hand layers (to be measured);
   - (iii) alternative — Rive rig on the jointed parts (build one pose, e.g.
     celebrating, in Rive; measure authoring time + file size + SwiftUI
     integration effort; do **not** ship it).
6. **Report:** per-pose scores, per-method authoring time, gate results, and a
   go/no-go for scaling to 50 poses.

### 4.3 Consistency criteria (applied to all 6 poses)

- Head-ratio delta ≤2%, ear-span delta ≤3%, eye centres within ±2 units
  (automated — see KOA_QUALITY_STANDARD.md §3).
- 3/3 raters name the pose from the still image alone (readability).
- 3/3 raters say "this is Koa" from the silhouette alone (identity).
- Palette: no fill outside the approved palette (or a Kiệt-approved addition).
- No baked gradients; no black outlines; no detached parts (N-3 overlap rule).

---

## 5. What was NOT tested (honest limits)

- **No animation was judged.** The PoC renders frozen frames. The shipped
  running pose's readability *in motion* was not measured — the claim "motion
  carries it" is INFERRED from the code (loops, bob, speed lines, dust), not
  from watching it.
- **No `KoaLight` shading.** The flat renders omit the procedural gradients,
  rim light and glow. A pose that reads in flat colours could read differently
  lit — and vice versa. The identity gate must run on the *lit* render.
- **No in-app render.** Nothing was built in Xcode or run on a simulator
  (no toolchain on this VM). The PoC renders the JSON directly, not through
  `KoaRender` — so the eye-group restructuring (§2.1) was worked around, not
  verified end-to-end.
- **No Kiệt judgement.** Pose readability was judged by one rater (the PoC
  author). The quality standard requires 3 raters + Kiệt's mock approval.
- **No authoring-time measurement.** The proposed method's cost is estimated,
  not measured — step 5(iii) of the plan exists precisely to measure it.
- **Git history (G1) remains partial.** `git fetch --deepen=400` timed out
  at 120 s in this session; the clone is shallow (1 commit). What *was*
  established via the GitHub API: `KoaSceneData.swift` has only **2 commits**
  — created 11/10/2026 (`3768aac8`, "Koa K1 — scene data + pure math") and a
  test-only change 21/11/2026 (`3e2088b6`, KOA-T60). The master geometry has
  been effectively frozen for 6 weeks. Deeper history (KoaTurn removal commit,
  Day-scene PNG removal) is still UNVERIFIED.
