# KOA QUALITY STANDARD — Consistency Scoring & Gates

**Phase VII — ASCND Mascot Mission | Synthesis**
**Date:** 2026-11-21 (CST) · **Koa audit tip:** `44862412` (`native/ios-rewrite`)
**Status:** Proposed standard. Thresholds are set from measured data where
possible (PoC IoU values, DNA measurements) and marked as judgement where
they are not.

---

## 1. The 8 criteria (from the mission), 1–10 each

Score 1–10 per criterion. **Accept = median ≥7 across 3 raters AND no single
criterion <5 from any rater.** A pose that scores 10 on identity but 4 on
anatomy is rejected — the PoC's curl (readable as "holding", not "curling")
is exactly this shape of failure.

| # | Criterion | What the rater judges | Anchors |
|---|---|---|---|
| 1 | **Identity consistency** | "Do I recognise this as Koa instantly?" | 10 = unmistakable at thumbnail size; 7 = recognisable after a second look; 5 = recognisable only with the name attached; 1 = a different character |
| 2 | **Proportion consistency** | Head/body/ear/eye ratios vs the DNA table | 10 = within measurement tolerance (§3); 7 = visibly Koa-proportioned with a minor deviation; 5 = head or ears noticeably off; 1 = wrong character proportions |
| 3 | **Silhouette consistency** | The outline read: ears, head, torso, limbs | 10 = silhouette alone identifies Koa (cf. Duolingo's rule: if the outer shape fails, no interior detail rescues it); 5 = silhouette reads as a generic animal; 1 = unrecognisable blob |
| 4 | **Anatomy quality** | Joints, limb attachment, natural structure | 10 = every joint bends where a joint exists, parts overlap, no gaps; 7 = minor awkwardness; 5 = a limb that can't work (paw backwards, gap at the neck); 1 = broken body |
| 5 | **Style consistency** | Flat vector, rounded corners, soft-grey outline, no baked shading | 10 = indistinguishable in style from the shipped figure; 5 = a visible style break (gradient, black outline, sharp corner); 1 = a different illustration style |
| 6 | **Rendering consistency** | Light, colour, material | 10 = flat base colours + procedural `KoaLight` only; 5 = a baked shadow/gradient somewhere; 1 = a different rendering model |
| 7 | **Pose quality** | Is the pose readable and natural? | 10 = a stranger names the pose in under 3 seconds; 7 = names it after thinking; 5 = names it only with options given; 1 = cannot name it |
| 8 | **Production readiness** | Can it ship? | 10 = layers + flags + golden fixtures + gallery version all present; 7 = art done, integration pending; 5 = art needs rework before integration; 1 = concept only |

### 1.1 The two tests that override the numbers

- **Silhouette-only test:** the pose rendered as a solid black silhouette.
  3/3 raters must say "Koa" (or "koala" + the ears read). This is Duolingo's
  silhouette-first rule (Phase I V1/V3, VERIFIED) applied to Koa.
- **16 px test:** the face cropped to 16×16. Eyes + nose must still read.
  (Duolingo's app-icon test, Phase I §2.6 — STRONGLY SUPPORTED — adapted:
  Koa's face at 16 px is eyes + nose + blush.)

A pose can score 8s across the board and still fail if it fails either test —
the tests are gates, not criteria.

---

## 2. Automated checks (the identity gate)

Run in CI on every pose change. All checks are computed from the *lit* render
(through `KoaRender` + `KoaLight`, not the flat JSON) wherever the check
involves colour; silhouette checks run on the flat mask. Reference
implementation: `poc_rig_test.py` (PoC) + `KoaImageDiff` (in-repo).

| # | Check | Method | Threshold | PoC / DNA basis |
|---|---|---|---|---|
| A1 | **Head ratio** | Head-front bbox height / figure height | 47.7% ± 2% (i.e. 45.7–49.7%) | DNA §2: 134/281 |
| A2 | **Head width** | Head-front bbox width / torso width | 1.43× ± 3% | DNA §2 |
| A3 | **Ear span** | Total silhouette width (ear tip to ear tip) | 222.8 ± 3% (216–230) | DNA §2; ears define the silhouette |
| A4 | **Eye geometry** | Eye centres (82,96)/(158,96); eye 36×47; gap 40 | Centres ±2 units; size ±2 units | DNA §2 |
| A5 | **Nose placement** | Nose bbox 26.9×42, y 84–126, centred x=120 | ±2 units | DNA §2 |
| A6 | **Silhouette IoU vs neutral** | Mask IoU, same orientation, same scale | **≥0.55** (floor, not a pass — see §2.1) | PoC: running 0.870, curl 0.942, sitting 0.980 all *passed IoU and failed readability*; push-up 0.368 failed both |
| A7 | **Frame containment** | Figure bbox inside 240×300 with ≥0 margin | No part outside the frame; prone poses declare their scale (PoC: push-up needed 0.826×) | PoC §3 |
| A8 | **Palette** | Every fill in the approved palette (DNA §3) or a Kiệt-approved addition | Zero unapproved fills | DNA §3.2 (25 wardrobe accents are approved *inside item groups only*) |
| A9 | **Stroke audit** | Every stroke is `#A9B2BC` (or an approved secondary) at 1.6–4.6 pt; no black strokes | Zero violations | DNA §4 |
| A10 | **No baked shading** | No gradient/fill-opacity tricks in new layers (except the ground shadow @ 0.45) | Zero violations | DNA §3.3; Audit RC-1 (flat-spec dispute D-3) |
| A11 | **Overlap rule** | Adjacent parts overlap ≥4 units at every joint in every pose | Zero gaps | Architecture N-3 |
| A12 | **Face front-facing** | Face layers unrotated (rotation ≤35° turn, else a drawn side face) | Zero violations | C2; measured failure 10/11 |
| A13 | **Layer order** | Tree order matches I-9 | Exact | DNA I-9 |
| A14 | **Golden fixtures** | `rnPayload` golden unchanged OR deliberately updated with approval | No silent fixture changes | C5 |

### 2.1 Why IoU is a floor, not a pass (the PoC lesson)

The PoC measured running IoU 0.870 and sitting 0.980 — both would pass any
reasonable IoU gate — yet both are visually unreadable as poses. IoU measures
overlap with standing, and a *good* new pose must differ from standing. The
gate therefore uses IoU only to catch **identity loss** (a pose so distorted
it no longer overlaps Koa at all — push-up at 0.368, and even that is partly
the shrink). **Readability is judged by humans (§4), never by IoU.**

### 2.2 What the existing tests already cover (do not duplicate)

- `KoaImageDiff` (tolerance 16/255, max 0.01% differing pixels) + snapshot
  PNGs + golden JSON fixtures pin *existing* screens. The identity gate is
  additive: it measures *new* poses against the DNA. It must reuse
  `KoaImageDiff`'s harness, not replace it.
- The in-app Debug spec sheet (`KoaSheetView`, `ASCND_DEBUG_KOA=1`) shows all
  34 expressions × 6 poses — the manual review uses it, and the gate's
  per-pose report should be viewable there.

---

## 3. Manual design review checklist

Every pose passes through this checklist with 3 raters (one must be the
artist who did NOT draw the pose). Kiệt's mock approval (C6) is a separate
gate for new silhouettes, not a substitute for this checklist.

- [ ] Head outline matches I-1 within ~2 units (ruler check, not eyeball).
- [ ] Ears: same outer shape and span as neutral, both sides.
- [ ] Eyes: same size/placement; pupils off-centre where the expression needs
      it (never centred — Duolingo's "looks creepy" rule transfers; Phase I S4).
- [ ] Nose and mouth landmarks unmoved (nose bottom y 126 sets the mouth line).
- [ ] No neck visible; chin/torso overlap intact.
- [ ] Every joint: parts overlap, no gap, rotation within the joint map.
- [ ] No black outlines; no baked gradients; no sharp corners (except the tuft).
- [ ] Props are separate layers with anchors (N-5); the pose reads without the
      prop *and* with it (a pose that only reads because of its prop is a
      weak pose — the v8 review found this: "nhiều dáng chỉ đọc ra nhờ đạo cụ").
- [ ] Viewed at real size (160 pt default) and at 16 px face crop.
- [ ] Viewed as silhouette-only.
- [ ] Compared side-by-side with the last approved gallery version.
- [ ] Expression × context: no-guilt policy (I-10) — the face must not blame
      the user.
- [ ] 60 fps video of the pose in motion (for animated poses): no flicker,
      no ghost eyes, no part popping (the 05/11 "ghost eyes" lesson).
- [ ] Wardrobe check: if the pose wears an item, the item's arm/leg layers
      still fit the jointed parts (the §3.1 wardrobe audit).

---

## 4. Scoring process

1. **Automated gate runs first.** Any A1–A14 failure blocks review — the
   artist fixes the measurement, not the rater's opinion.
2. **Three raters score independently** (1–10 per criterion), then the median
   per criterion is taken. Raters also do the two override tests (§1.1) and
   the readability naming (pose named from the still alone, no options).
3. **Accept:** median ≥7 AND no criterion <5 from any rater AND both override
   tests pass AND 3/3 name the pose.
4. **Reject:** anything else. The rejection states the failing criterion and
   the measured value (e.g. "A3 ear span 208, need 216–230"), not a vibe.
5. **Kiệt's mock approval** follows acceptance, for new silhouettes (C6).
   Kiệt may approve a pose the gate rejected only by explicitly overruling a
   named check, recorded with the reason — the gate is never silently waived.
6. **Disagreements are recorded**, not averaged away: if raters differ by ≥3
   on any criterion, the pose goes back with both views noted (mission §11:
   no fake consensus).

---

## 5. Regression: keeping 50–100 poses consistent over time

- Every accepted pose's gate measurements are stored in its pose record
  (§4.3 of the architecture doc). A later DNA change re-runs the gate on all
  poses; any pose that newly fails is flagged, not silently kept.
- The golden fixtures + snapshots pin the *existing* poses; the identity gate
  pins the *DNA*. Both must pass on every PR touching Koa.
- A quarterly "pose census": re-render all poses, re-run the gate, re-check
  the gallery version matches the app. The 05/11 audit's finding — gallery
  versions diverging from the app (v8 poses never entering the app) — must
  not recur: **a gallery version with no matching app version is a defect in
  the process, reported on #527.**
