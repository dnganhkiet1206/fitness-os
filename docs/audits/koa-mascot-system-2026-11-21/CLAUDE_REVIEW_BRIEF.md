# CLAUDE REVIEW BRIEF — Independent Technical Review of the Koa Mascot Mission

**For:** Claude (or any independent reviewer) receiving the ASCND mascot
mission reports.
**Date:** 2026-11-21 (CST) · **Koa audit tip:** `44862412` (`native/ios-rewrite`)
**Your mandate:** review, challenge, and improve. You are explicitly permitted
— and expected — to disagree. Per mission §11, no fake consensus: record
disagreements with evidence.

---

## 1. What to read (in order)

1. `FINAL_RECOMMENDATION.md` — the conclusions (read first, so you know what
   you're attacking).
2. `KOA_POSE_SYSTEM_ARCHITECTURE.md` + `KOA_QUALITY_STANDARD.md` — the
   proposed system and its tests.
3. `TECHNOLOGY_COMPARISON.md` — method scores and tool table.
4. `KOA_PROOF_OF_CONCEPT.md` + the PoC artifacts: `poc_rig_test.py`,
   `poc/*.png` (re-run the script yourself: `python3 poc_rig_test.py`).
5. `DUOLINGO_REVERSE_ENGINEERING.md` + `SOURCES_DUOLINGO.md` — Phase I.
6. `ASCND_KOA_AUDIT.md` + `KOA_CHARACTER_DNA.md` — Phase II (measured at tip
   `44862412`).
7. `SOURCES_AND_EVIDENCE.md` — consolidated sources.

**Repo access:** read-only clone at `working/repo/` (tip `44862412`, shallow —
see §4.3 for the history limit). Key files: `apps/ios/Packages/ASCNDKit/
Sources/ASCNDCore/Koa/KoaSceneData.swift`, `KoaRender.swift`, `KoaLight.swift`,
`KoaFlags.swift`, `KoaGesture.swift`, `KoaWalk.swift`;
`apps/ios/docs/koa-v2/` (DUOLINGO_RESEARCH.md, KOA_TECHNICAL_AUDIT.md,
gallery v3/v4/v5/v8 READMEs); `apps/ios/tools/koa-wardrobe/build.py`;
`native/assets/mascots/` (spec sheets).

---

## 2. What to verify (re-check, don't trust)

- [ ] **Phase I's load-bearing sources:** re-open `blog.duolingo.com/
      world-character-visemes/` (Rive) and `blog.duolingo.com/how-to-draw-duo-
      the-owl/` (10-step guide). Confirm the quotes and the scope limits
      (Rive is proven for World Characters, **not** for Duo himself — U1).
- [ ] **The measured SVG claims:** re-run the Phase I §3.1 measurement if you
      doubt it (URL + method recorded). In particular the `#50BB00` vs
      `#43C000` wing-overlay dispute — the measurement wins over the
      distillation, but check it.
- [ ] **Phase II's DNA numbers:** re-run `/tmp/parse_koa.py` +
      `/tmp/bbox_koa.py` against `working/files/swift/KoaSceneData.swift`.
      Spot-check three numbers: head-front 160.2×134, ear span 222.8, eye
      centres (82,96)/(158,96).
- [ ] **The PoC:** re-run `poc_rig_test.py` and look at the five PNGs
      yourself. Do you agree running/sitting fail and push-up reads as lying
      on its side? Is the curl "partial" or a fail? Say so with reasons.
- [ ] **The eye-backing finding** (PoC §2.1): confirm in `KoaRender.swift`
      that the eye group is restructured (`isEyeGroup`, lash paths) — or
      refute it if the four fur ellipses are something else (e.g. a blink
      state). This is a new claim; it needs a second pair of eyes.
- [ ] **Tool facts:** Rive runtimes MIT + SwiftUI runtime; Lottie-iOS Apache
      2.0 + SwiftUI since 4.3.0; Spine prices (secondary sources — confirm at
      checkout, and say if you find different numbers).
- [ ] **The 27/07/2026 drop reason** (Audit §7.7 / mascots README): read the
      README yourself. Does the recommendation actually answer it, or does
      it route around it?

---

## 3. Questions to attack (the weakest points, as the author sees them)

1. **Is Method B's "jointed rebuild" actually one job, or three?**
   The recommendation treats forearm+hand and thigh+shin as a single drawing
   job. Is the wardrobe audit likely to explode it? Give your own estimate
   of the wardrobe impact — open a few `it_*` item groups and judge.
2. **Is the Blender bridge real, or hand-waving?** "Trace-assist" is doing a
   lot of work in this plan. Sketch the converter concretely (input format,
   output format, who runs it) or propose a better bridge — or argue the
   bridge should be dropped and poses drawn directly into the scene format.
3. **Does the identity gate measure the right things?** The thresholds
   (head ±2%, ear ±3%, IoU floor 0.55) are set from one PoC run and DNA
   numbers. Are they too loose (drift passes) or too tight (good poses fail)?
   Propose different thresholds with reasons.
4. **Is deferring Rive correct, or cowardice?** The recommendation defers
   Rive until after B. Argue the opposite if you believe it: Rive-first
   would force the jointed rebuild anyway (a rig needs joints), and the
   state machine would pay off from day one. What would Rive-first cost
   that B-first doesn't?
5. **Is the waist joint right at ±6°?** Deadlift/plank need a folding torso.
   The architecture sends deep bends to hand-illustration. Is a segmented
   torso a better answer? What does it cost?
6. **Did the PoC test the right thing?** Frozen frames, no `KoaLight`, no
   animation, one rater. Is the conclusion ("rotation-only is exhausted")
   actually supported — or could the shipped running pose's motion + effects
   be enough for *all* rig poses, making joints unnecessary? Steelman the
   "effects carry the pose" position.
7. **Is Option A underrated?** If the library tops out at ~25–30 poses under
   A, is that actually a problem for ASCND's near-term needs? Maybe 25 good
   poses beat 50 mediocre ones. Argue for A if the evidence supports it.
8. **What did this mission miss?** Name at least one method, tool, or
   consideration the reports don't cover (e.g. DragonBones/Creature were
   left UNKNOWN — go verify one; or the Watch/widget Koa surfaces; or
   accessibility of animated Koa; or the sound design that accompanies poses).

---

## 4. Permissions and rules for your review

1. **You may edit the reports directly.** Fix numbers, rewrite sections,
   replace the architecture. Log every material change in §5 of this brief
   (or as a `REVIEW_LOG.md` beside it): what changed, why, what evidence.
2. **You may propose a wholly different architecture.** If you find a better
   one, write it up as an alternative with the same structure (constraints →
   method → pipeline → QA → roadmap) and let Kiệt choose.
3. **Record disagreements, don't resolve them by averaging.** For each
   disagreement: the two positions, the evidence for each, the differing
   assumptions, and the experiment that would settle it.
4. **Check against the real code and assets.** A conclusion that contradicts
   a file in the repo is wrong until the file is shown to be stale — and
   staleness itself must be evidenced (tip, commit, date).
5. **Keep the evidence tiers.** Any claim you add carries VERIFIED /
   STRONGLY SUPPORTED / INFERRED / UNKNOWN. Downgrade a tier if the evidence
   doesn't support it — that is a valid and valuable review outcome.
6. **Do not copy Duolingo artwork** and do not seek non-public Duolingo
   material. Public sources and publicly served assets only.

### 4.1 Known gaps you could close (the mission's own UNKNOWNs)

- **U1 (Phase I):** Duo's own format (Rive vs Lottie vs hand-posed). The
  highest-value remaining public source is the **Duocon 2023 talk transcript**
  (YouTube `fgOqvyPif3g`) — fetch it if you can.
- **G1 (Phase II):** Koa git history. The clone in `working/repo/` is
  **shallow (1 commit)** and a `git fetch --deepen=400` timed out at 120 s
  in the synthesis session. If you can deepen the history (longer timeout,
  or GitHub API commit lists per path), trace: the KoaTurn removal commit
  (10/11), the Day-scene PNG removal (19–20/11), and when the v8 gallery
  last changed. Record what you establish and what stays blocked.
- **PoC limits (§5):** run the lit render (through `KoaRender` if you have a
  Swift toolchain), get more raters, or execute the full 6-pose PoC plan.

---

## 5. Review log (the reviewer fills this in)

| Date | Reviewer | Change / finding | Evidence | Effect on recommendation |
|---|---|---|---|---|
| — | — | *(empty — to be filled by Claude's review)* | — | — |
