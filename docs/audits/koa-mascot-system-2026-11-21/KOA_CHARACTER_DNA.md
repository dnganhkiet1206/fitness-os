# KOA Character DNA

- **Source of truth for measurements:** `KoaSceneData.swift`
  (`native/src/components/ascnd/koa/koa-scene.ts @ fac9ac2`, auto-generated),
  frame **240 × 300**, y down, feet at y≈293. All bboxes below are
  cubic-sampled path bounding boxes computed by parsing the JSON
  (reproduce with `/tmp/parse_koa.py` + `/tmp/bbox_koa.py`).
  Cross-checked against `docs/koa-v2/gallery/v4-from-art/svg/0-0-front.svg`
  (IoU vs original: silhouette 0.999, parts ≥0.95 per its README),
  `v5-2.5d-turn/svg/turn+00.svg` (bbox identical to the scene data),
  and the two RN-era spec sheets
  (`native/assets/mascots/koa-construction-manual.png`,
  `koa-flat-spec.png`).
- **Audit tip:** `44862412` on `native/ios-rewrite`, 2026-11-21.
- **Status:** DRAFT for the mascot mission (Phase II). This is a measurement
  record, not a Kiệt-approved Character Bible. Where the spec sheets and the
  shipped art disagree, the shipped art is recorded as truth and the
  disagreement is flagged — the Bible (when written) must resolve them with
  Kiệt, not by fiat.

---

## 1. The figure in one paragraph

Koa is a chibi koala: a giant round head (≈52% of figure height) on a small
bean-shaped body, huge round ears that stick out past the head on both sides,
vertical oval eyes with big pupils, a teardrop nose, a small smile with a
tongue, pink blush ovals, capsule arms and stubby feet, no neck, no thigh,
no hands, no tail. Flat vector, rounded everywhere, soft grey outlines
(never black), no baked shading — light is added procedurally at draw time
(`KoaLight`). Personality in the code's own words (KoaMood header): Koa never
looks sad because of the user — unread data is `idle`, never a judgement;
no guilt mechanics.

---

## 2. Measured proportions (frame 240 × 300)

| # | Part | Bounding box (x0–x1, y0–y1) | Size (w × h) | Notes |
|---|---|---|---|---|
| 1 | Whole figure (ears top → feet) | x 8.6–231.4, y 12–293 | 222.8 × 281 | Feet baseline y≈293; shadow ellipse y 285–303, rx 64 |
| 2 | Head, front face only (`head_front`) | x 39.8–200, y 34–168 | **160.2 × 134.0** | The face plate; ears sit outside it |
| 3 | Head incl. ears (`HEAD`) | x 8.6–231.4, y 12–168 | 222.8 × 156 | Silhouette width is ear-dominated |
| 4 | Head-top fur tuft (`head_top_fur`) | x 99–141, y 19.4–66 | 42.0 × 46.6 | Centre-top, 3 spikes; v4 IoU vs original only 0.46 (its base sinks into the head — same colour, invisible difference, but the outline is lost) |
| 5 | Ear L / R (`ear_left` / `ear_right`) | L x 8.6–92, R x 148–231.4, y 12–105.6 | **83.4 × 93.6 each** | Each ear is 52% of head-front width; outer edge extends 31.2 beyond the head on each side |
| 6 | Inner ear L / R | x 34.1–79.3 / 160.7–205.9, y 27.3–79 | 45.2 × 51.7 | |
| 7 | Eye L / R (`eye_left` / `eye_right`) | L x 64–100, R x 140–176, y 72.5–119.5 | **36 × 47** | Vertical ovals; centres (82,96) / (158,96); inner gap 40 ≈ 1.1 eye widths; eye height = 35% of head-front height |
| 8 | Pupil L / R | L x 75–99, R x 141–165, y 83–115 | 24 × 32 | Pupil is ⅔ of eye width, 68% of eye height; two white highlight dots (spec) |
| 9 | Eyebrow L / R | L x 74–89, R x 151–166, y 59.9–65 | 15.0 × 5.1 | Thin curved strokes above the eyes; eye top is y 72.5 |
| 10 | Nose | x 106.6–133.4, y 84–126 | **26.9 × 42.0** | Teardrop, vertical; top between the eyes (y 84), bottom above the mouth (y 126); long highlight streak (spec) |
| 11 | Mouth | x 106–134, y 128–144.5 | 28.0 × 16.5 | Smile curve; tongue 18 × 10 (y 134–144) inside it |
| 12 | Blush L / R | L x 58–74, R x 166–182, y 115–127 | 16 × 12 | Pink ovals, level with the mouth top |
| 13 | Torso (`torso_front`) | x 63.9–176.1, y 140–279 | **112.3 × 139.0** | Bean/oval; chin overlaps torso top (head bottom y 168 vs torso top y 140 — 28 overlap, no neck) |
| 14 | Belly | x 85–155, y 188–270.2 | 70.0 × 82.2 | Lighter oval centred on the torso |
| 15 | Arm L / R (`arm_left_upper` / `arm_right_upper`) | L x 36.9–89.3, R x 150.7–203.1, y 169.4–241.9 | **52.4 × 72.5 each** | Single capsule segment; shoulder pivots (80,178) / (160,178); no elbow, no hand |
| 16 | Leg L / R (`leg_left_lower` / `leg_right_lower`) | L x 71.6–117, R x 123–168.4, y 251.4–293 | **45.4 × 41.6 each** | Single stubby segment; **no thigh**; foot is the bottom of the same blob |
| 17 | Shoes | clip rects only | — | `koaShoeL/R` are *clipPaths* (x 0–120 / 120–240, y 240–300), not shoe shapes; shoe art lives inside the `it_shoes_*` wardrobe groups |

### Ratios (the numbers a new pose must preserve)

| Ratio | Value |
|---|---|
| Head-front height / figure height | 134 / 281 = **47.7%** |
| Head (incl. ears) height / figure height | 156 / 281 = 55.5% |
| Head-front width / torso width | 160.2 / 112.3 = **1.43×** |
| Head-front height / body below chin (168→293 = 125) | **1.07 : 1** — the head is taller than the entire body beneath it |
| Torso height / figure height | 139 / 281 = 49.5% |
| Leg height / figure height | 41.6 / 281 = **14.8%** (extremely short legs) |
| Arm length / figure height | 72.5 / 281 = 25.8% |
| Eye height / head-front height | 47 / 134 = 35% |
| Eye width / head-front width | 36 / 160.2 = 22.5% |
| Inter-eye gap / eye width | 40 / 36 = 1.11 |
| Ear width / head-front width | 83.4 / 160.2 = 52% (per ear) |
| Nose width / head-front width | 26.9 / 160.2 = 16.8% |
| Mouth width / head-front width | 28 / 160.2 = 17.5% |

---

## 3. Colour palette (exact hex, from the scene data)

### 3.1 Base figure (flat colours — shading is procedural, see §5)

| Role | Hex | Where | Notes |
|---|---|---|---|
| Fur (body, head, ears, arms, legs) | `#BFC7CF` | 39 fills — the dominant colour | Spec sheets agree |
| Belly / inner ear / light parts | `#F4F6F8` | 32 fills | Spec sheets agree |
| Light grey-blue (secondary fur) | `#D7DDE3` | 6 fills | Spec sheets agree |
| Ink (pupils, mouth line, details) | `#20242A` | 12 fills, 31 strokes | Spec sheets: pupil `#20242A` with white highlight |
| Dark slate (nose, deep shadow) | `#2A313B` | 14 fills | Spec lists nose dark as `#3A4654`; scene uses `#39424E` (10 fills) for the nose — **mismatch, see §7** |
| Outline (main) | `#A9B2BC` | **41 strokes** | The outline colour. Soft grey, never black — this is what "không viền" (no outline) in the spec sheets *means in practice* |
| Outline (secondary) | `#39424E` | 12 strokes | |
| Shadow grey | `#AEB6BF` | 5 fills; ground shadow @ 0.45 opacity | Spec: shadow ellipse `#AEB6BF`, opacity 40% (close; shipped is 45%) |
| Blush | `#F3B5B5` | 3 fills | Spec agrees |
| Tongue / mouth interior | `#E8657B` | 12 fills | Spec agrees (tongue pink) |
| Eye white | `#FFFFFF` | 16 fills | |
| Speed/dust grey | `#C7CFD8` | run lines + dust | |

### 3.2 Wardrobe accents (only inside `it_*` item groups)

`#E8B23A` gold (24), `#D64545` red (23), `#3FA9E5` blue (11),
`#7A5BC4` purple (7), `#3F9E63` green (6), `#E8842A` orange (5),
`#2F7A4C`, `#6B4A2E`, `#8A6A3B`, `#2E8FCB`, `#C4901F`, … — about 25
accent colours. Rule: accents never touch the base figure's fur/belly/face
colours; an item may add colours but may not recolour Koa.

### 3.3 Lighting (procedural — not part of the flat art)

- Vertical gradient per flat colour: y 20 → 275, gain 1.10 (top) → 0.84
  (feet), exponent 0.6; warm floor bounce `#FFC24D` from y=170, max 5%
  (`KoaLight.shadeAt` / `bounceAt`).
- Radial head glow: centre (120,76), r=62, white 17% → 0, on
  `head_front` + `head_top_fur` only.
- Rim light `#FFE9B8`, 1.6 pt, on head / ears / torso only — **never on
  arms** (24/10: the rim on the arm's bounding box read as a cut across the
  shoulder).
- Form gradient (ears): white 25% → dark `#1A1420` 22%. Body gradient
  (torso): white 28% → 0.
- Paper mode (light theme): OKLab L × 0.85 desaturation.
- Flat mode (daytime): no per-part gradients; one sunlight wash over the
  whole figure (`sourceAtop`).

---

## 4. Shape language

- **Primitives:** ellipse / circle / rect / path only (SVG 1.1). No bitmap,
  no filter, no baked gradient in the art.
- **Corners:** rounded everywhere; no sharp points except the fur tuft.
- **Strokes:** round linecaps; stroke widths 3–4.6 (speed lines 3–4,
  smile 4.6, paw outline 1.8 @ 0.55 opacity, rim 1.6). Outline colour is
  mid-grey `#A9B2BC`, not black.
- **Construction:** the figure is a stack of flat colour layers in a fixed
  order (bottom → top): shadow → body → ears → inner ear → face patch →
  eyes → pupils → eyebrows → nose → mouth (+ tongue) → blush
  (construction manual §5). The shipped tree follows the same order.
- **Silhouette:** dominated by the ears (222.8 wide) and the round head;
  the torso is a narrow bean (112.3) tucked under the chin; arms hang as
  capsules at the sides; legs are stubs. The 05/11 audit's verdict stands:
  *"Tay 'ống' không khớp là chủ ý của phong cách"* — tube arms without
  joints are a style choice, but they are also the pose ceiling.
- **Depth:** faked by layer order + the procedural light only. There is no
  occlusion model beyond the tree order, and no back view: the back is a
  plain silhouette (v4 README: "Sau lưng và 3/4 sau trơn một màu. Bản vẽ
  không có mặt sau").

---

## 5. Face system (how expressions are built)

Expressions are **boolean combinations of face layers**, selected by
`KoaFlags.flags(expression, pose, worn)`:

| Layer group | Variants (condition flags) |
|---|---|
| Eyes | `eyesOpen` (18 expressions) / `eyesWide` (surprised, plead, yikes, oops) / `eyesArc` (grin, warm, pant) / `eyesStar` (delighted) / `eyesSqueeze` (oof) / `eyesSpiral` (dizzy) / `eyesMeditate` |
| Lids | `lidsHalf` (confident, strain, thinking, nope) / `lidsWink` (happytired) / `lidsHeavy` (tired, sleepy) / `lidsSad` (sad). Lids are real geometry: the lid drops from the eye top (y 72.5); blink is a vertical scale of the blink group |
| Brows | `browArc` (happy, grin, delighted, happytired, content, warm, sleepy, speaking) / `browRaised` (surprised, thinking, tease, yikes) / `browSad` (sad, plead, sheepish, nope, oops) / `browAngry` (angry) / `browStrain` (strain) / `browFocus` (focus) |
| Mouths | `mouthSmile` / `mouthGrin` / `mouthBreath` / `mouthO` / `mouthSmirk` / `mouthFrown` / `mouthFlat` / `mouthShout` / `mouthGrit` / `mouthSoft` / `mouthTease` / `mouthSay1/2/3` (visemes) / `mouthTongue` / `mouthPant` / `mouthWince` / `mouthWavy` / `mouthYikes` |
| Whole-face layers | `faceGymGrit/Puff/Roar/Focus/Pant/Smug` — complete replacement faces (05/11, built by `koa_faces_gym.py` → `build.py`); when one is on, the base eyes/brows/mouth are all off |
| Effects | `showStrain` (vein) / `showSteam` (anger) / `showHearts` (delighted) / `showSweat` (yikes, pant, oops) / `showStrain` |

- **Expression count:** 34 (`KoaFlags.Expression`, CaseIterable). At 05/11
  it was 20; the 6 gym faces + `yikes/focus/pant/oof/oops/dizzy` +
  `content/warm/sheepish/sleepy/thinking/say1-3/tease/nope` were added
  since. The spec sheets show 8.
- **Emotions (separate layer):** 17 (`KoaEmotion.Emotion`) map to
  (expression, pose, outfit); the day-mood selector (`KoaMood.read`,
  12 reasons, priority-ordered) uses 11 of them. Dead states per the
  first audit (K-29): `.sad`, `.curl`, `.coat`, `.worry` have no production
  selector.
- **Face change:** cross-fade `faceMix` 0→1 (brows/mouth fade; eyes swap
  inside a blink so two eye layers never overlap). Speaking swaps only the
  mouth (`say1/2/3` or `mouthSoft`).
- **Gaze:** head rotates ≤3.6°·x around (120,105) + translates (0.9x, 3y);
  eyes translate (4.4x, 3.1y). Eyes lead, head follows (spring). Gaze is
  room-only; other surfaces use static faces.

---

## 6. Pose system (how poses are built)

| Pose | Mechanism (all in `KoaFlags.flags` + `KoaRender`) |
|---|---|
| `idle` | Base drawing + breathing (`koaBreathe` 3.6 s), bob, ear/arm sway; idle arm lift +4 y so arm tops touch the chin |
| `turn34` | Whole figure `scale(0.93,1)`; face `translate(16,0)`; ears `+12/−17`; belly `scale(0.92,1) + translate(11,0)`; head `scale(0.96,1)`. **Not a drawing** — a squashed front view |
| `running` | `scale(0.91,1) + rotate(4°)`; head `rotate(−5°)`; face `translate(18,0)`; speed lines + dust; legs/arms on 18 s loops; body bob |
| `lifting` | `poseLift` layers on; hand anchor (180,222); curl animations `koaCurlA14/B14`; hand item hidden (`handFree = false`) |
| `stretching` | `poseStretch` layers + stretch arcs; figure `translate(−8,0) rotate(6°)` |
| `relaxing` | `poseRelax` + `legsSit`; sitting breath; used for tired/sleep/meditate |
| Gestures (on top of idle) | `taDa` arms ±90°, `cheer` ±108° + jump −26, `curious` head −9°, `flop` head +9° + (2,5), `pout` head +5°; arms flip past 25° |
| Walk | `KoaWalk`: feet planted/swing, body bob/sway/lean about (120,293), head/ear lag, arm swing ~±20°, 6 styles; face shift is a plain `translate(14·u, 0)` |
| Rank build (0–5) | Arms spread ±11·t and thicken `scale(1+0.22t, 1+0.05t)`; torso widens `scale(1+0.16t)`; `t` = 0, 0.18, 0.4, 0.6, 0.82, 1 |

**Hard limits of this system:** no joint between upper arm and forearm
(there is no forearm); no thigh; no hand; no side/back drawing; face
layers are front-view decals (2.5D turn reverted 10/11 — far-side
eye/cheek overflowed the head and covered the ear).

---

## 7. IMMUTABLE vs FLEXIBLE

### 7.1 IMMUTABLE — must never change across poses (breaking one breaks recognition)

| # | Trait | Evidence / measurement |
|---|---|---|
| I-1 | **Head-front outline** (160.2 × 134, x 39.8–200, y 34–168) and its roundness | The single most recognised shape; v4 turnaround IoU vs original ≥0.95 per part, silhouette 0.999. Any redraw must match this outline within measurement tolerance |
| I-2 | **Ear outer shape and span** (83.4 × 93.6 each; total span x 8.6–231.4) | Ears define the silhouette width; they stick out 31.2 beyond the head on each side. The spec sheets call them "tai không tròn hoàn hảo, có đường lượn mềm tự nhiên" — imperfectly round, soft natural curve |
| I-3 | **Eye size and placement** (36 × 47 vertical ovals; centres (82,96)/(158,96); gap 40) | Eyes are 35% of head height; moving them changes the face more than any other edit. Pupils 24 × 32, vertically centred in the eyes |
| I-4 | **Nose shape and placement** (26.9 × 42 teardrop, y 84–126, centred x=120) | The nose anchors the face centre; its bottom (y 126) sets the mouth line |
| I-5 | **Fur `#BFC7CF` + belly/inner-ear `#F4F6F8`** | The two-colour body; every render, every theme, every rank uses them |
| I-6 | **Soft-grey outline (`#A9B2BC`)**, never black | 41 strokes in the scene; the spec's "không viền" is realised as grey, not absent |
| I-7 | **Frame 240 × 300, feet at y≈293, viewBox-anchored** | Every transform, pivot, gradient and golden test assumes it (`KoaMath.width/height`, `insetMat`, `KoaPaint.viewport`) |
| I-8 | **Chin-over-torso overlap (no neck)** | Head bottom y 168 vs torso top y 140 — 28 units of overlap. A visible neck would be a different character |
| I-9 | **Layer order** (shadow → body → ears → inner ear → face → eyes → pupils → brows → nose → mouth → blush) | Construction manual §5; the render tree follows it |
| I-10 | **No-guilt face policy** (KoaMood header) | Unread data → `idle`; Koa never looks sad *at* the user. A pose/expression that guilts the user violates the character, not just the drawing |

### 7.2 FLEXIBLE — may vary for action / expression (within stated bounds)

| # | Trait | Bounds |
|---|---|---|
| F-1 | Arm rotation | Around shoulders (80,178)/(160,178); **flip past 25°** (`armFlipDeg`) so the paw doesn't point backwards; arms may be hidden or drawn front-only for `taDa`/`cheer` |
| F-2 | Leg rotation / position | Around (104,254)/(136,254); feet must stay near y≈293 when standing (walk pins feet to the floor); legs may tuck (cheer ±14°) |
| F-3 | Head rotation | Around neck (120,166): gestures use −9°…+9°; gaze ≤3.6°; rest tilt 2.5°. **Beyond ~10° the chin/torso gap opens** and needs a `neckFill` patch — a sign the pose is out of range |
| F-4 | Mouth / brow / lid layers | Any of the §5 combinations, including whole-face gym layers; mouth may be swapped for visemes while speaking |
| F-5 | Blush, tongue, sweat, steam, hearts, strain marks | Free effects; must stay inside the head outline |
| F-6 | Wardrobe (7 slots × 10 items) | Items may cover fur but may not recolour the face or change I-1…I-4; redrawn items go through `build.py` |
| F-7 | Rank build (0–5) | Arms ±11·t, scale ≤1.22×; torso ≤1.16× wide. Rank changes the *body*, never the head |
| F-8 | Gaze / blink / poke response | Eyes translate ≤4.4; blink is a vertical lid scale; poke may jump/ear-twitch/brow-raise |
| F-9 | Ground shadow | Ellipse rx 64, ry 9 @ 0.45, may stretch (run: scale 0.92) or be omitted when something else draws the floor shadow |
| F-10 | Whole-figure scale/translate/rotate (walk bob, settle, cheer jump) | Bob ≤ a few units; cheer jump −26; weight shift rotates the whole figure around (120,293) by small angles |

### 7.3 Disputed / unresolved (the Bible must decide with Kiệt)

| # | Dispute | Evidence |
|---|---|---|
| D-1 | Nose dark: spec `#3A4654` vs scene `#39424E` | Spec sheets list `#3A4654`; the scene's nose fill is `#39424E`. 10 fills use `#39424E`. Probably a spec-sheet typo, but it is the kind of drift a Bible must close |
| D-2 | Tail: manual lists layer 23 Tail; the app has no tail | Construction manual §4 vs 38 ids in the scene (no tail). Was the tail cut deliberately, or lost in the export? |
| D-3 | "No stroke / no gradient" vs shipped strokes + procedural gradients | Flat-spec §8 vs `KoaLight` + stroke census. Resolution is probably: *the art* is flat; *the renderer* adds light. The Bible must say so explicitly |
| D-4 | Back view: spec sheets draw one; the app has none; v4 left it plain | Needs Kiệt's decision (already flagged 05/11, audit §8.4): draw a back, or drop it from the sheets |
| D-5 | Fur tuft IoU 0.46 (v4) | The tuft's base sinks into the head; same colour, so invisible — but the outline is lost. Accept, or redraw the tuft as a separate visible shape? |

---

## 8. Construction rules (draft — for the Bible)

1. **Draw in the 240×300 frame, feet at y≈293.** No other canvas.
2. **Head first.** If the head-front outline doesn't match I-1 within ~2
   units, the pose is rejected before anything else is judged (Duolingo's
   rule, per DUOLINGO_RESEARCH.md: silhouette first).
3. **Ears are part of the head, not accessories.** Same outline, same
   colour, same span — every angle, every pose.
4. **Eyes/nose/mouth are placed, not drawn freehand.** Centres (82,96) /
   (158,96) / (120,105); nose bottom y 126; mouth y 128–144.5. A new
   expression moves *layers*, not *landmarks*.
5. **One segment per limb is a fact, not a style.** Until joints are added
   (forearm, hand, thigh, knee — the 05/11 audit's step 4), no pose may
   pretend the arm bends or the leg has a knee. Props and rotation are the
   only tools.
6. **No new geometry without a flag.** Every new layer enters through an
   `if` condition in the scene format, with a name, so golden tests and the
   spec sheet can see it. Unconditional new paths are how drift starts.
7. **Flat colours only in the art.** Shading comes from `KoaLight`. Never
   bake a gradient into a new layer.
8. **The face stays front-facing.** Past ±35° turn, draw a new side/back
   face layer; never rotate the front face further (measured failure 10/11).
9. **Check against the last approved gallery version, side by side, at real
   size** (9-step loop §6). A pose that only looks right enlarged is not
   approved.
10. **Celebrate once per milestone, never guilt.** Face policy I-10 applies
    to poses too: no disappointed/angry Koa at the user for resting.

---

## 9. Sources

- Measurements: `KoaSceneData.swift` parsed with Python (see
  `~/workspace/koa-audit` companion scripts in the audit doc §9);
  `v3`/`v4`/`v5` turnaround SVGs measured the same way.
- `KoaFlags.swift`, `KoaRender.swift`, `KoaMath.swift`, `KoaLight.swift`,
  `KoaGesture.swift`, `KoaWalk.swift`, `KoaEmotion.swift`, `KoaMood.swift`
  (tip `44862412`).
- `native/assets/mascots/koa-construction-manual.png`,
  `koa-flat-spec.png` (viewed 2026-11-21).
- `apps/ios/docs/koa-v2/{KOA_TECHNICAL_AUDIT.md, DUOLINGO_RESEARCH.md,
  gallery/v3-vector-turnaround/README.md, gallery/v4-from-art/README.md,
  gallery/v5-2.5d-turn/README.md, gallery/v8-pose-library/README.md}`.
- Prior audit `~/workspace/koa-audit/KOA_AUDIT_REPORT.md` (tip `2a904952`).
