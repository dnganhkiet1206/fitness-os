# FINAL RECOMMENDATION

**Phase VIII — ASCND Mascot Mission | Synthesis**
**Date:** 2026-11-21 (CST) · **Koa audit tip:** `44862412` (`native/ios-rewrite`)
**Status:** Recommendation to Kiệt. Per mission §11, every conclusion here may
be challenged, rewritten, or replaced by Claude's independent review
(`CLAUDE_REVIEW_BRIEF.md`) — the goal is the best system for Koa, not defending
this document.

---

## 1. The 9 closing questions (answered directly)

### Q1. Why is Koa hard to pose today?
**Because the geometry new poses need does not exist, and the system offers no
sanctioned way to add it.** The figure is one-segment limbs on a front-only
drawing, frozen in a generated JSON blob since 11/10 (only 2 commits ever).
Rotation-only posing — the pipeline's sole mechanism — was *measured* to fail
3 of 4 test poses (PoC). Patching the old vector is not a bad habit; it is the
only move the system allows. On top of that there is no Character Bible to
check a new pose against (RC-1), so drift has no test to fail.

### Q2. What does Duolingo do well that ASCND lacks?
Three things, all VERIFIED in Phase I:
1. **A minimal fixed construction** (circle body + half-circle wings + pill
   feet) chosen explicitly so that posing is cheap — "animation and
   illustration time go down drastically" (Murphy). ASCND's construction was
   never designed for posing; it was a design-tool export frozen at the RN
   freeze.
2. **Published rules + character sheets + a reusable character library**
   (Figma as main tool; sheets exist for the main cast). ASCND has two spec
   sheets that contradict the shipped art and no Bible.
3. **Three tracks, not one pipeline:** static vector (Figma) for poses,
   After Effects→Lottie for linear animation at thousand-file scale, Rive
   state machines for interactive characters (8 head × 8 body = 64+ idle
   variations from 16 pieces). ASCND has one track — the scene-format
   pipeline — and tries to make it do everything.

### Q3. Which Duolingo principles should ASCND learn?
- **Silhouette first** (if the outer shape fails, no interior detail rescues
  it). Test every Koa pose as a silhouette.
- **Eyes carry emotion; design the eye system first.** Koa already does this
  well (34 expressions from eye/brow/mouth layers) — keep it.
- **Few shapes, flat colour, one shade step max** — chosen for production
  speed, not just looks. Koa's procedural `KoaLight` already embodies this;
  protect it from baked shading.
- **Character library before pose library.** Fix the construction, then the
  poses follow. This is the single most transferable lesson, and it is the
  order this recommendation follows.
- **A shipped asset is flat; the system lives upstream.** Judge Koa's system
  by its authoring files and rules, not by the exported JSON.
- **Do NOT transfer:** the one-shape nugget body. Koa's identity *is* the
  giant head + ears + tiny body (head ~52%). Collapsing Koa into a nugget
  would erase it. Species recognisability is secondary for Duo (Hartman:
  "hard to tell that Duo is an owl") — for Koa, the koala read (ears, nose,
  grey fur) is load-bearing.

### Q4. Which method fits Koa best?
**Method B — modular SVG character system — as the core**, with Method A
inside Method C for silhouette-changing poses, Method E (Blender) as the
posing reference, Method D deferred, Method F for ideation only. Full scoring
in `TECHNOLOGY_COMPARISON.md` §1.7 (B 4.0, D 3.5, C/E 3.0, A 2.5, F 1.5).

### Q5. Keep SVG or move to another system?
**Keep the scene-format vector system (which is SVG-descended JSON, not raw
SVG files).** There is no image-based Koa path in the app (C1), and the
SwiftUI Canvas renderer is the app. Moving to Rive/Spine/Lottie as the *pose
system* would replace the pipeline wholesale (70 wardrobe items + 6 ranks +
34 expressions re-done) to solve a problem that is about missing geometry,
not about the format. The format is not the problem; the joints are.

### Q6. Rigging or independent illustration?
**Both, split by the decision rule (Architecture §4.2):** rig-generated
(jointed parts) where the silhouette doesn't need to change; hand-illustrated
where it does (push-up, plank, squat, deadlift, lunge, bench). Rigging *alone*
was proven insufficient by the PoC — rigging without joints changes nothing —
so the question as posed has a false premise: the choice is not rig-vs-draw,
it is joints-first, then both.

### Q7. Where should AI participate?
**Ideation and automation-around-the-art only:** pose ideas, composition
thumbnails, drift-flagging, batch measurement. **Never as the author of a
shipped Koa layer.** No evidence Duolingo uses AI generation for Duo (Phase I
U6), and the 27/07/2026 drop reason (AI-only workflow cannot author/diff/
verify end-to-end) still applies to any AI-authored layer.

### Q8. What must change in Claude's workflow?
1. **No new Koa geometry without a pose brief + Bible reference + flag.**
   (Rules N-1, N-2.) The current workflow's failure is under-constrained
   prompts (Audit RC-9: "đơn giản, đáng yêu, đầu to thân nhỏ" with no numbers).
   Prompts must cite DNA numbers (head 160.2×134, eye centres, ear span).
2. **Poses are built Blender-first, then traced into layers** — never drawn
   directly onto the old vector.
3. **Every pose runs the identity gate before review.** A pose that fails A1–
   A14 never reaches a human rater.
4. **Gallery version = app version.** A pose that exists only in the gallery
   is unfinished work, reported as such.
5. **Three raters + Kiệt mock approval** for new silhouettes; disagreements
   recorded, not averaged away.

### Q9. How is Koa kept consistent in the future?
**Four locks, all automatic or procedural:** (1) the Bible, regenerated/
verified against the scene data by script; (2) the identity gate in CI
(A1–A14); (3) the pose record for every pose, with stored gate measurements
re-run on any DNA change; (4) the quarterly pose census. Plus one human lock:
Kiệt's mock approval for new silhouettes. Consistency is a system with tests,
not a hope about artist discipline.

---

## 2. Three scenarios

### Option A — Minimal cost (do the governance, not the geometry)

**Architecture:** Write the Character Bible from the measured DNA; adopt the
identity gate (automated checks A1–A14) + 3-rater review; promote the 17 v8
poses into the app as flag-conditioned layers using the *existing* one-segment
drawing + effects (the way `running` already works); no new joints, no new
runtime, no Blender bridge.
**Technologies:** The current pipeline + Python/PIL gate scripts + gallery
versioning. Zero new dependencies.
**Advantages:** Cheapest; shippable fastest; fixes the *governance* failure
(RC-1/RC-7/RC-8) which is real and independent of geometry; the v8 poses
become usable instead of stranded in the gallery.
**Disadvantages:** The geometric ceiling stays: push-up, plank, squat,
deadlift, lunge, sitting will still fail readability (PoC) — those poses
simply cannot be honestly shipped under A. The library tops out at roughly
the poses the current body can express (~25–30, mostly face/gesture/prop
variants).
**Risks:** The team declares victory on governance while the pose ceiling
remains; pressure to "just draw" the hard poses re-creates the patching
failure inside the new governance.
**Effort:** ~1–2 weeks (Bible + gate + v8 promotion). **Expertise:** one
agent + Kiệt's review; no illustrator required beyond the v8 art.
**Maintenance:** Low — the gate is the maintenance.

### Option B — Recommended (jointed core + Blender reference + gate)

**Architecture:** Everything in A, **plus**: (1) the jointed-part rebuild —
forearm + hand, thigh + shin, drawn once from the DNA, as named scene-format
groups (Architecture §3); (2) the Blender-frame → scene-layer bridge
(trace-assist first); (3) the pose library (40 poses v1 → 50–100 by v3) with
rig-vs-hand split by the decision rule; (4) the full 6-pose PoC executed and
measured before scaling.
**Technologies:** Current pipeline + Blender 5.2 (already owned) + Python
build/gate scripts + Inkscape/Figma for part sheets. No new app runtime.
**Advantages:** Removes the geometric ceiling for real (joints unlock
sitting, running, curl, lunge, squat); every later pose is cheap (an
arrangement, not a drawing); the existing code architecture is *finished*
rather than replaced, so the 70 wardrobe items, 34 expressions and golden
tests survive; Rive/Lottie remain available later without rework.
**Disadvantages:** The jointed rebuild is the biggest single job (05/11
audit's step 4) and it touches wardrobe items — the estimate must come from
the artist, and it will be larger than anyone's first guess. Two sources of
truth (Blender model + scene data) until the bridge is proven.
**Risks:** (1) The rebuild's wardrobe scope explodes — mitigate by auditing
which items actually need redrawn arm/leg layers before starting. (2) The
Blender→scene bridge produces paths that fail the gate (v4 tuft IoU 0.46
shows projection isn't exact) — mitigate with trace-assist (human authors,
script converts). (3) The team builds joints but keeps posing by rotation
habit — mitigate with the decision rule + readability rating.
**Effort:** A (1–2 weeks) + jointed rebuild (artist estimate; planning
assumption 3–6 weeks for parts + wardrobe audit) + bridge (1–2 weeks) +
6-pose PoC (1 week) + library build to 40 poses (4–8 weeks, paced by review).
**Expertise:** One illustrator (vector, character) + one agent for the build/
gate scripts + Kiệt's mock approvals. No Rive/Spine specialist needed.
**Maintenance:** The gate + pose records + quarterly census. A DNA change
re-runs the gate on all poses automatically.

### Option C — Premium production (B + interactive character + 3D master)

**Architecture:** Everything in B, **plus**: (1) Rive interactive character
for the mascot room — state machine combining idle/walk/talk/react like
Duolingo's Lily (8 head × 8 body = 64+ variations), on the jointed parts;
(2) Lottie for linear celebrations/rewards; (3) the Blender 3D model promoted
to *the* master reference (posed in 3D, projected to 2D layers — Duolingo's
Zari precedent); (4) a dedicated illustrator + creative technologist, weekly
"Riv Deliv"-style handoff.
**Technologies:** B's stack + Rive editor (free tier to evaluate; paid to
remove the splash screen) + `rive-ios` (MIT, SwiftUI) + `lottie-ios`
(Apache 2.0) + Blender as master.
**Advantages:** The full Duolingo three-track model; interactive Koa (lip-sync
via visemes — the 15+ mouth layers already exist — reactive idle, combinable
states) is a genuine product differentiator; 3D-as-master ends the two-sources
problem by making the model the single source.
**Disadvantages:** Highest cost and longest time-to-value; Rive files are
binary and hard to diff/verify by AI (C8's objection returns — it must be
answered by demonstrating the workflow, not asserted away); the 3D model
becomes a critical dependency (if the model breaks, all posing stops);
splash-screen/licensing admin for Rive exports.
**Risks:** (1) The Rive evaluation concludes the workflow isn't AI-verifiable
— then C collapses to B + Lottie, and the Rive work is sunk. Mitigate by
time-boxing the Rive evaluation to one pose (celebrating) in the PoC.
(2) 3D-as-master drifts from the 2D DNA (the v4 tuft problem at scale).
Mitigate with the identity gate running on projected frames.
**Effort:** B + Rive evaluation (2 weeks time-boxed) + Rive character build
(4–8 weeks) + 3D-master migration (4+ weeks). **Expertise:** + Rive
animator/creative technologist + 3D artist.
**Maintenance:** Highest — two runtimes + editor licences + the model. The
quarterly census becomes monthly.

---

## 3. Roadmap (Option B)

| Phase | What | Gate to proceed |
|---|---|---|
| **0. Bible + gate (1–2 wks)** | Write `KOA_CHARACTER_BIBLE.md` from DNA; implement A1–A14; Kiệt decides D-1…D-5 | Bible approved; gate runs in CI |
| **1. Jointed parts (artist est.)** | Forearm+hand, thigh+shin; wardrobe audit; Kiệt mock approval | Parts pass the gate as a neutral figure (IoU vs current neutral ≥0.98, all A-checks pass) |
| **2. Bridge (1–2 wks)** | Blender-frame → scene-layer converter (trace-assist); v5 naming adopted | A Blender pose converts and passes the gate end-to-end |
| **3. PoC (1 wk)** | 6 poses by the assigned methods; 3-method comparison incl. time-boxed Rive test | 6/6 readable by 3/3 raters; method comparison reported |
| **4. Library v1 (4–8 wks)** | 40 poses: 17 v8 + 12 interaction + 11 core/emotional | Each pose accepted per §4 of the quality standard |
| **5. Deferred decision** | Rive/Lottie evaluation on the PoC evidence | Kiệt decides: adopt, defer, or drop |
| **6. Library v2–v3** | 50–100 poses; seasonal; census quarterly | Census green |

**What happens if Kiệt picks A:** phases 1–3 are skipped; the library tops
out at ~25–30 poses and the hard fitness poses stay unshipped. That is an
honest ceiling, not a failure — but it should be chosen knowingly.
**What happens if Kiệt picks C:** phases 0–4 run first (C *contains* B); the
Rive/3D work starts only after the PoC, time-boxed.

---

## 4. The single biggest risk (all options)

**The jointed rebuild's wardrobe scope.** The 70 wardrobe items were drawn
against one-segment limbs. If most of them need redrawn arm/leg layers, the
rebuild is several times larger than the part-drawing job itself — and it is
the one cost in this whole recommendation that no document can estimate,
because it requires opening all 70 items against the new joints. **Mitigation:
the wardrobe audit is the first task of Phase 1, before any part is drawn,
and its result re-estimates the whole roadmap.** If the audit says "most items
are unaffected" (long sleeves hide elbows, most bottoms hide thighs), B stays
cheap. If it says "most need redraws", Kiệt decides with real numbers whether
to proceed, descope the wardrobe, or fall back to A.

---

## 5. Conclusion (one paragraph)

Koa doesn't need a new runtime, a new format, or AI. It needs **joints, a
Bible, and a gate** — in that order. Duolingo's real lesson isn't Rive or
Lottie; it's that a character whose construction is fixed, whose rules are
published, and whose poses are tested can scale to hundreds of appearances
without drifting. Koa already has the hardest parts: a distinctive measured
identity, a working flag-and-layer expression system, a Blender posing
pipeline, and a review culture that catches drift when it has something to
check against. Option B finishes that system. The PoC proves the current
ceiling is real and structural; the architecture shows the way past it; the
quality standard makes sure the way past it doesn't become a new way to drift.
