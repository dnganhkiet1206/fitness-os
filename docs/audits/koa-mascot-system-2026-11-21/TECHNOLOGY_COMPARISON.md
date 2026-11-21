# TECHNOLOGY COMPARISON — Methods & Tools for the Koa Pose System

**Phase III–IV — ASCND Mascot Mission | Synthesis**
**Date:** 2026-11-21 (CST) · **Koa audit tip:** `44862412` (`native/ios-rewrite`)
**Inputs:** Phase I `DUOLINGO_REVERSE_ENGINEERING.md` (evidence-tiered) + Phase II
`ASCND_KOA_AUDIT.md` + `KOA_CHARACTER_DNA.md` (measured at tip `44862412`).
**Status:** Synthesis, not a build decision. Every verdict carries an evidence tier.

---

## 0. The constraints every method is judged against (VERIFIED, Phase II)

These are not preferences. A method that violates one fails, however popular it is.

| # | Constraint | Source |
|---|---|---|
| C1 | **The app has no image-based Koa path.** Koa is drawn at runtime from `KoaSceneData.swift` (628 nodes, 38 ids) through `KoaRender → KoaPaint → KoaFigureView` (SwiftUI Canvas). A new pose must arrive as flag-conditioned layers in the 240×300 scene format — or the pipeline is replaced wholesale (70 wardrobe items + 6 ranks + 34 expressions re-done). | Audit §3, §7.1 |
| C2 | **The face only works from the front (±35° at most).** The 2.5D `KoaTurn` was tried and reverted 10/11: far-side eye/cheek overflowed the head and covered the ear. Side/back faces must be hand-drawn layers, never rotations of the front face. | Audit §5 RC-6 |
| C3 | **One segment per limb, no joints.** Single-path arms, stub legs, no thigh, no hand, no knee. Rotation-only posing was *measured* in the PoC (`KOA_PROOF_OF_CONCEPT.md`): frozen running/sitting frames are unreadable (IoU 0.870 / 0.980 vs neutral — yet visually identical to standing); push-up is impossible (reads as lying on its side, IoU 0.368, needs 0.826× shrink to fit the frame). | Audit §5 RC-3; PoC §3 |
| C4 | **Lighting is procedural** (`KoaLight`): flat base colours only in the art; shading comes from the renderer. Art with baked gradients will double-shade. | Audit §3; DNA §3.3 |
| C5 | **The golden tests pin the RN payload.** `KoaScene.rn == true` is the standard for golden tests. Any scene change must keep `rnPayload` golden or deliberately update fixtures with Kiệt's approval. | Audit §7.5 |
| C6 | **Kiệt approves art by mock first** (repo AGENTS.md). No pose enters the app without mock + gallery version + simulator capture. | Audit §7.6 |
| C7 | **RN is dropped (17/11 directive).** Native (SwiftUI) is the standard. Anything that depends on RN — or on parity with RN — is disqualified. Methods are weighted on **SwiftUI integration**, not RN. | Mission directive |
| C8 | **Rive / Spine / 3D / Lottie / AI-cutout were already tried and dropped** (27/07/2026, RN era; mascots README). A proposal to re-adopt one must address the recorded reason — "AI-only workflow cannot author / diff / verify it end-to-end" — not just its feature list. | Audit §7.7 |
| C9 | **No per-layer SVG files exist.** Layers live inside one generated JSON blob; the v5 turnaround SVG already groups the figure into rig-ready named groups (`foot_L/R`, `leg`, `torso`, `belly`, `arm_L/R`, `head`, `ear_L/R`, `eye_L/R`, `pupil_L/R`, `brow_L/R`, `mouth`, `nose`) — measured bbox identical to `KoaSceneData` — but was never adopted as the app figure's source. | Audit §5 RC-10 |

**Consequence of C1+C3, stated once plainly:** any method that only *animates* the
existing drawing (rigging, Lottie, Rive, Spine) cannot create a single new readable
pose. The geometry that new poses need does not exist yet. **New geometry first,
animation second.** Any comparison that scores rigging without jointed geometry is
scoring a fantasy.

---

## 1. Method evaluation

Scale 1–5 (5 = best). Scores are judgements against C1–C9, not generic tool quality.
**RN-independence is a gate, not a score:** every method below passes it (none
depends on RN); a method that failed it would be disqualified outright.

### 1.1 Method A — Independent SVG illustration (one drawing per pose)

Each pose is a standalone illustration, drawn by a human (or human + AI reference),
checked against the Character Bible.

| Criterion | Score | Reason |
|---|---|---|
| Visual quality | 5 | A skilled illustrator can draw anything: push-up, plank, squat, back view. The only method with no geometric ceiling. |
| Consistency | 2 | Entirely dependent on the artist + the Bible. Without measured rules, each pose drifts (this is the current failure mode). With the Bible + identity gate (§4), rises to 4 — but the cost is review labour per pose. |
| Development cost | 2 | Slowest per pose. 50–100 poses = 50–100 drawings + 50–100 reviews. |
| Scalability | 2 | Linear cost per pose; no reuse. Adding expression × pose combinations explodes. |
| Maintenance | 2 | A DNA change (e.g. ear redraw) must be repainted into every pose by hand. |
| SwiftUI fit | 3 | Poses would arrive as scene-format layers (C1) or as raster/vector assets — but the app has no image-based Koa path, so each pose still needs a build-pipeline step to become layers. Not free. |
| **Overall** | **2.5** | **Necessary for the hard poses, insufficient as the whole system.** |

Verdict: **required for silhouette-changing poses, wrong as the default.** Use it
where the silhouette must change (push-up, plank, squat, deadlift, lunge, back view),
not for everything.

### 1.2 Method B — Modular SVG character system (reusable body parts)

Koa is rebuilt from named, reusable parts (head, torso, upper arm, forearm, hand,
thigh, shin, foot, face layers) in the 240×300 frame; new poses are made by
repositioning/rotating parts, within DNA rules.

| Criterion | Score | Reason |
|---|---|---|
| Visual quality | 4 | As good as the part drawings. Two-segment limbs + hands unlock real posing. Still flat vector, so it cannot fake 3D volume — but Koa is flat by design (DNA §4). |
| Consistency | 4 | Parts are drawn once; every pose reuses the same head/ears/eyes. Drift is confined to part placement, which the identity gate can measure (head ratio, ear span). |
| Development cost | 3 | High upfront (redraw the figure as jointed parts, once), then cheap per pose. The upfront job is the 05/11 audit's step 4 — the biggest single job, touching all 70 wardrobe items. |
| Scalability | 4 | New pose = new arrangement, not a new drawing. Expression × pose combinations multiply for free (face layers are already combinatorial: 34 expressions exist this way). |
| Maintenance | 4 | Fix the head once, every pose is fixed. This is exactly what Duolingo's character library does (Phase I V4). |
| SwiftUI fit | 5 | This *is* the current architecture, done properly: named groups already exist in the scene format (`arm_left_upper`, `HEADRIG`, …) and in the v5 SVG. Method B is "finish the system the code already implies" rather than a new runtime. |
| **Overall** | **4.0** | **The backbone of the recommended system.** |

Verdict: **adopt as the core architecture.** Note the trap the mission brief
warns about: parts must not become "discrete blocks that make Koa look like a
puppet." Mitigations, all VERIFIED as already practised in the code: overlapping
part boundaries (head overlaps torso by 28 units, no neck — DNA I-8), soft-grey
outlines that continue across part seams, `neckFill`/`shoulderTuck`-style patches
as *designed* overlaps rather than bug fixes, and the rule that parts may only
rotate around anatomical pivots, never detach (unlike Duo's floating feet — Koa
is not Duo; Koa's parts must stay connected).

### 1.3 Method C — SVG pose library (hand-illustrated, shared rules)

A library of hand-drawn poses (like the existing v8 Blender gallery: 17 poses ×
7 cameras, 119 frames) built to one rule set, versioned as a gallery, feeding the
app through the build pipeline.

| Criterion | Score | Reason |
|---|---|---|
| Visual quality | 5 | Same ceiling as A (it *is* A, with rules). |
| Consistency | 3 | Better than A (shared rules + gallery versioning + side-by-side review), worse than B (parts still redrawn per pose). |
| Development cost | 2 | Same per-pose cost as A, plus library governance. |
| Scalability | 2 | Linear per pose. |
| Maintenance | 3 | Gallery versioning helps (v8 README shows a working review loop); a DNA change still means repainting. |
| SwiftUI fit | 3 | Same integration cost as A. |
| **Overall** | **3.0** | **The right container for Method A poses.** |

Verdict: **adopt as the library format, not as the posing method.** Method C is
how A-poses are stored, reviewed and versioned — it is complementary to B, not an
alternative. The v8 gallery already proves the format works (17 poses, review
rounds 1–4 recorded). What v8 lacks is the *app* connection: its poses never
entered `KoaSceneData` (Audit §2.4). Method C's real job in the recommendation is
to close that gap.

### 1.4 Method D — 2D skeletal rigging (Spine / Rive / Lottie)

A rig (bones + meshes + state machine) drives the figure; poses/animations are
bone transforms, not new drawings.

| Criterion | Score | Reason |
|---|---|---|
| Visual quality | 3 | Excellent for *motion* (walk, idle, blink, talk); capped for *poses* by the underlying art — a rig cannot invent a thigh (C3, PoC). |
| Consistency | 4 | One art source, many transforms — if the art is jointed. With the current one-segment art, consistency is trivially perfect and poses are unreadable. |
| Development cost | 2 | Rigging is skilled work; Rive/Spine editors are visual but the Koa rebuild (jointed parts) must happen first anyway. Double cost if the rig is built on un-jointed art and then rebuilt. |
| Scalability | 5 | Best in class *for animation*: Duolingo's Lily pattern — 8 head × 8 body = 64+ idle variations from 16 pieces (Phase I S2, STRONGLY SUPPORTED) — is the combinatorial ideal. But that pattern needs modular parts (Method B) first. |
| Maintenance | 3 | Rig files are binary/proprietary-ish (`.riv`, Spine binary); diffing and AI-authoring them is hard — this is exactly why they were dropped 27/07/2026 (C8). The 05/11 audit's verdict stands until someone demonstrates an AI-verifiable rig workflow. |
| SwiftUI fit | 4 | Rive's Apple runtime is MIT, supports SwiftUI via SPM, iOS 14+ (VERIFIED, §2.1). Lottie-iOS is Apache 2.0 with SwiftUI support since 4.3.0 (VERIFIED, §2.3). Spine has an official iOS runtime (STRONGLY SUPPORTED, §2.2). All three integrate — the blocker is art/authoring, not the runtime. |
| **Overall** | **3.5** | **Powerful, but premature as the pose solution; correct as a later animation layer.** |

Verdict: **defer the rig decision until Method B exists; then Rive is the leading
candidate for interactive moments only** (room idle/talk/react — the use case
Duolingo *proved* with Rive, Phase I V5), **not** for static poses. Lottie is the
candidate for linear micro-animations (celebrations, streak rewards — Duolingo's
proven Lottie use, Phase I S1). Spine is the weakest fit: game-oriented, paid
editor, no state machine, no SwiftUI-native story — it solves a problem ASCND
doesn't have.

**Overturned assumption (recorded):** the mission brief treats "add rigging" as a
candidate pose solution. It is not. Rigging without joints changes nothing — the
PoC proves it numerically (sitting IoU 0.980, yet unreadable). The correct
sequencing is B → D, never D alone.

### 1.5 Method E — 3D character pipeline (Blender)

Model Koa in 3D, rig, pose, render flat-shaded frames (or use 3D as reference for
2D drawing, as Duolingo did with Zari in 2023 — Phase I V6).

| Criterion | Score | Reason |
|---|---|---|
| Visual quality | 4 | Best posing freedom (any angle, any pose, real perspective). Flat/Workbench shading can match Koa's flat look — the v8 gallery already demonstrates this. |
| Consistency | 4 | One 3D model = one source of truth for proportions from every angle; the v3/v4 turnarounds prove the model matches the 2D art (silhouette IoU 0.999). |
| Development cost | 2 | A good Koa 3D model + rig is weeks of skilled work; ASCND already *has* a Blender model + posing scripts (`koa_model.py`, `koa_pose.py`) — the sunk cost is paid. The remaining cost is the *export-to-app* bridge, which was never built. |
| Scalability | 4 | New pose = one line in `POSES` in `koa_pose.py` (v8 README). Cameras are free. |
| Maintenance | 2 | Two sources of truth (3D model + 2D scene data) that can drift apart; every DNA change must be made twice unless the 3D model *is* the master. Blender is GPL; the pipeline scripts are ASCND's own. |
| SwiftUI fit | 2 | Blender renders frames; frames must still become scene-format layers (C1) or raster assets the app can't currently display. No direct runtime path. As a *reference* for drawing 2D layers, fit is 4 — the distinction matters. |
| **Overall** | **3.0** | **Best posing reference available; wrong as the app runtime.** |

Verdict: **adopt Blender as the posing/reference stage, not as the delivery
format.** Correction to the mission brief: Method E is not a new adoption —
ASCND already owns a working Blender Koa pipeline that produced 17 poses, 7
cameras, 28 expressions. The missing piece is the bridge from Blender frame →
scene-format layer. Duolingo's own precedent supports exactly this use: their 3D
Zari rig was built *as a reference for creating 2D path animations* (Phase I V6,
VERIFIED), not as a production pipeline.

### 1.6 Method F — AI-assisted character production

Reference-conditioned generation (ControlNet / pose conditioning / image-to-image),
then vectorisation + manual cleanup.

| Criterion | Score | Reason |
|---|---|---|
| Visual quality | 2 | Current models cannot hold Koa's measured DNA (head 52%, ear span 222.8, eye centres (82,96)/(158,96)) across poses; every output needs near-total manual rework — the mission brief itself warns against treating AI as a complete solution. No evidence was found that Duolingo uses AI generation for Duo (Phase I U6). |
| Consistency | 1 | Worst in class. Generative models drift proportions stochastically; there is no constraint mechanism that enforces the DNA table. |
| Development cost | 3 | Cheap per attempt, expensive per *usable* output once cleanup is counted. |
| Scalability | 2 | Generates many images fast; almost none pass the identity gate without rework. |
| Maintenance | 1 | No source of truth: re-running a prompt after a DNA change gives a different character. |
| SwiftUI fit | 2 | Same integration cost as A, plus a vectorisation step that itself introduces drift. |
| **Overall** | **1.5** | **Useful for ideation only.** |

Verdict: **AI belongs in two places only: (1) ideation/reference — generating
pose *ideas* and composition thumbnails for the human artist, never final art;
(2) automation *around* the art — e.g. suggesting identity-gate measurements,
flagging drift, batch-renaming. It must never be the author of a shipped Koa
layer.** This also answers C8's recorded objection: the 27/07/2026 drop reason
was that an AI-only workflow cannot author/diff/verify — Method F as defined
here keeps the human as author and the AI as assistant, which does not trigger
that objection.

### 1.7 Scoreboard

| Method | Quality | Consistency | Cost | Scalability | Maintenance | SwiftUI fit | Overall |
|---|---|---|---|---|---|---|---|
| A — Independent SVG | 5 | 2 | 2 | 2 | 2 | 3 | 2.5 |
| **B — Modular SVG** | 4 | 4 | 3 | 4 | 4 | **5** | **4.0** |
| C — Pose library | 5 | 3 | 2 | 2 | 3 | 3 | 3.0 |
| D — Skeletal rigging | 3 | 4 | 2 | 5 | 3 | 4 | 3.5 |
| E — 3D Blender | 4 | 4 | 2 | 4 | 2 | 2 | 3.0 |
| F — AI-assisted | 2 | 1 | 3 | 2 | 1 | 2 | 1.5 |

**Reading:** no single method wins. The recommendation (FINAL_RECOMMENDATION.md)
is a *composition*: **B as the core** (jointed modular parts in the existing scene
format) + **A inside C for silhouette-changing poses** (hand-drawn, library-governed)
+ **E as the posing reference** (Blender blocks the pose, the human traces it into
scene layers) + **D deferred** (Rive for interactive moments, Lottie for linear
celebrations, after B ships) + **F for ideation only**.

---

## 2. Open-source tool table (verified 2026-11-21 unless noted)

"SwiftUI fit" is judged for the **native** app (C7). RN fit is not scored — RN is
dropped. Prices are as found on the check date; confirm at purchase.

### 2.1 Runtimes (ship in the app)

| Tool | What it is | Licence | Free? | Commercial use | SwiftUI fit | Verdict for Koa |
|---|---|---|---|---|---|---|
| **Rive runtime** (`rive-ios`) | State-machine vector animation runtime; `.riv` files | **MIT** (runtimes); editor proprietary | Runtime free; editor free tier; free exports play a short splash screen, paid removes it | Yes (MIT) | **Excellent** — official Apple runtime, SPM, SwiftUI via `RiveUIViewRepresentable`, iOS 14+ | **Leading candidate for interactive moments (deferred to after B).** Evidence: rive.app/docs/runtimes/apple/apple; github.com/rive-app/rive-ios |
| **Lottie-iOS** (`lottie-ios`) | After Effects → JSON vector animation player | **Apache 2.0** | Free | Yes | **Good** — SwiftUI `LottieView` since 4.3.0 (Sep 2023), SPM | **Candidate for linear celebrations/rewards.** Evidence: github.com/airbnb/lottie-ios |
| **Spine runtimes** | Skeletal animation runtime (Esoteric Software) | Runtime included with editor licence (proprietary) | No free plan; trial can't save/export | Yes, under licence | **Fair** — official iOS runtime exists, but no SwiftUI-native story; game-oriented | **Not recommended.** No state machine; paid editor ($69 Essential / $379 Professional one-time; Enterprise $2,499/yr base for >$500k revenue — secondary sources, confirm at checkout) |
| **SwiftUI Canvas** (built-in) | The current renderer (`KoaFigureView`) | Apple, part of the OS | Free | Yes | **Native** — it *is* the app | **Keep.** Method B needs no new runtime at all. |
| **DragonBones** | Skeletal animation (game-oriented) | Licence not verified in this research | — | — | No SwiftUI runtime known | **Not evaluated further.** Licence + iOS story unverified; no evidence it beats Rive for app UI. Marked UNKNOWN, not rejected on merit. |
| **Creature** | Mesh-based 2D animation | Licence not verified in this research | — | — | No SwiftUI runtime known | **Same as DragonBones:** UNKNOWN, not pursued. |

### 2.2 Authoring tools (make the art)

| Tool | What it is | Licence | Free? | Commercial use | Notes for Koa |
|---|---|---|---|---|---|
| **Blender 5.2** | 3D modelling/rigging/rendering | **GNU GPL** | Free | Yes | **Already in use** (v8 gallery, `koa_model.py`/`koa_pose.py`). VM has Blender 5.2.0 LTS. Use as posing reference + flat renders. |
| **Figma** | Vector illustration (Duolingo's main tool — Phase I V4, VERIFIED) | Proprietary | Free tier; paid for teams | Yes, under ToS | Good for the Character Bible + part sheets; but Figma files are not the app's source of truth — the scene JSON is. Use for design, not as the pipeline. |
| **Inkscape** | Open-source vector editor | **GPL** | Free | Yes | Capable SVG authoring for parts; scriptable. A credible free alternative to Figma for the part library. |
| **SVG.js / Paper.js** | Programmatic SVG (JS) | **MIT** | Free | Yes | Useful for the *build* step: generating scene-format layers from part definitions, diffing SVGs, automated measurement for the identity gate. |
| **Spine editor** | Skeletal rigging editor | Proprietary | Paid (see §2.1) | Under licence | Only if Spine were chosen — it isn't. |
| **Rive editor** | State-machine animation editor | Proprietary | Free tier | Under ToS | Needed only if/when D is adopted. Free tier suffices for evaluation. |
| **Adobe After Effects** | Motion design (Lottie source) | Proprietary subscription | No | Under licence | Only if Lottie track is adopted; the free alternative is Rive or direct Lottie JSON authoring. Not recommended as a new dependency. |

### 2.3 Testing / comparison (the identity gate)

| Tool | What it is | Licence | Notes for Koa |
|---|---|---|---|
| **`KoaImageDiff`** (in-repo) | CPU pixel diff, tolerance 16/255, max 0.01% differing pixels; whole-screen snapshots | ASCND's own | Exists; pins *existing* screens. Extend it — don't replace it — with identity checks (see KOA_QUALITY_STANDARD.md §3). |
| **Python + PIL** | Image measurement (used in Phase I §3.2 and in the PoC) | PIL: open source (HPND) | **Already proven in this mission**: colour census, silhouette IoU, bbox measurement. The identity gate's reference implementation. |
| **pixelmatch / odiff** | Pixel-diff libraries (JS/Go) | MIT / Apache | Alternatives to `KoaImageDiff` for CI; no advantage over the in-repo tool for Koa's needs. |
| **Playwright / Maestro** | Simulator screenshot capture | MIT / Apache | Capture pipeline for the review loop (simulator shots at real size, 60 fps video). Maestro already referenced in the repo's workflow. |
| **Storyboarder** (Wonder Unit) | Storyboard assembly | MIT (with exception) | Cited in v8 README; frames from `poses/` drop straight in. Useful for the pose-library review, not for the app. |

### 2.4 What was searched for and NOT recommended

- **Procedural/generative posing of Duo:** no public evidence Duolingo does it (Phase I U6). Not a basis for a Koa decision.
- **Toon Boom Harmony / Adobe Animate:** appear only as intern-listing "such as" skills at Duolingo (Phase I §6.4). No production evidence; no SwiftUI story.
- **3D in-app runtimes (SceneKit/RealityKit USDZ):** the app already ships 22 `.usdz` exercise demos, but Koa is 2D-only by decision and the 3D exercise pipeline is separate. Mixing Koa into USDZ would create a second mascot system; rejected.

---

## 3. The three decisions this comparison forces

1. **Geometry before animation.** Fund the jointed-part rebuild (Method B) before
   any rigging/runtime decision. A Rive/Spine evaluation done on one-segment art
   will conclude — correctly — that rigging doesn't help, and the wrong lesson
   ("rigging doesn't work for Koa") will be learned.
2. **Blender is a reference, not a runtime.** The v8 pipeline stays; the missing
   work is the Blender-frame → scene-layer bridge, not a better 3D model.
3. **AI is an assistant, not an author.** Any workflow that lets a model emit a
   shipped Koa layer re-creates the 27/07/2026 failure (C8) and will fail the
   identity gate by construction.

---

## 4. Sources

- Phase I `DUOLINGO_REVERSE_ENGINEERING.md` §§4, 6, 7 (V4/V5/S1/S2/U1/U6) and
  `SOURCES_DUOLINGO.md`.
- Phase II `ASCND_KOA_AUDIT.md` §§3, 5, 7; `KOA_CHARACTER_DNA.md` §§2–4, 7.
- PoC: `KOA_PROOF_OF_CONCEPT.md` §3 (measured IoU + visual verdicts).
- Rive: https://rive.app/docs/runtimes/getting-started (MIT runtimes, quote);
  https://rive.app/docs/runtimes/apple/apple (SwiftUI, SPM, iOS 14+);
  https://github.com/rive-app/rive-ios. Accessed 2026-11-21.
- Lottie: https://github.com/airbnb/lottie-ios (Apache 2.0; SwiftUI `LottieView`
  since 4.3.0). Accessed 2026-11-21.
- Spine: vendor pricing via secondary sources checked Sep–Nov 2026
  (freedom251.com/apps/spine/; thegeeksclub.com/platforms/spine/) — **prices are
  secondary-source; confirm at checkout.** iOS runtime existence: vendor docs via
  the same sources (STRONGLY SUPPORTED, not directly opened).
- Blender: https://www.blender.org (GPL; version 5.2.0 LTS on the ASCND VM).
- v8 gallery: `apps/ios/docs/koa-v2/gallery/v8-pose-library/README.md`.
