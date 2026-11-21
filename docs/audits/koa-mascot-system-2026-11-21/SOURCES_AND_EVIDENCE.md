# SOURCES AND EVIDENCE — Consolidated (Phases I–VIII)

**ASCND Mascot Mission · 2026-11-21 (CST)**
**Koa audit tip:** `44862412` (`native/ios-rewrite`) · **Access date for all
web sources: 2026-11-21** unless a source's own publication date is given.
**Reliability:** A = first-party / named employee, direct statement · B =
vendor case study quoting named staff / reputable press · C = secondary
distillation · D = third-party / meme (images only) · M = own measurement
(reproducible, method recorded).

This file consolidates the sources. The full per-source tables for Phase I
live in `SOURCES_DUOLINGO.md` (sources A1–A22, B1–B6, C1–C8, D1–D3, E1–E8,
F1–F7, G1–G11, I1–I7, J); this file lists the sources actually relied on in
the synthesis, plus all Phase II–VIII sources.

---

## 1. Duolingo — primary sources relied on (A)

| ID | Source | URL | Published | Tier supported |
|---|---|---|---|---|
| A1 | Duolingo Blog — "How Duolingo Animates Its World Characters" (Rive + State Machine + viseme factory) | https://blog.duolingo.com/world-character-visemes/ | 2022-11-10 | VERIFIED (re-read in full) |
| A2 | Duolingo Blog — "How to draw Duo in 10 easy steps" | https://blog.duolingo.com/how-to-draw-duo-the-owl/ | 2022-06-10 | VERIFIED (re-read in full) |
| A3 | Duolingo Blog — "Shape language: Duolingo's art style" | https://blog.duolingo.com/shape-language-duolingos-art-style/ | 2020-07-02 | VERIFIED |
| A4 | Duolingo Blog — "Reshaping Duo" | https://blog.duolingo.com/reshaping-duo/ | 2013-11-20 | VERIFIED |
| A5 | Duolingo Blog — intern post (Figma = main illustration tool; character sheets; character library) | https://blog.duolingo.com/designing-new-characters-internship/ | 2023-04-14 | VERIFIED |
| A6 | Duolingo Blog — 3D Zari intern experiment (145-control rig, toon shaders, reference for 2D) | https://blog.duolingo.com/duolingo-art-intern-animation-case-study/ | 2023-02-24 | VERIFIED |
| A13 | Official Duo SVG, sitting + reading (measured: 1080×1080, 30 paths, 0 groups/gradients/strokes; shade `#50BB00`) | https://d35aaqx5ub95lt.cloudfront.net/images/pathCharacters/active/2b8208acfd8a19539a7f1f0f583eedaa.svg | fetched 2026-11-21 | VERIFIED (M) |
| A14–A16 | Official Duo PNGs — run / Year-in-Review / waving (colour census) | blog.duolingo.com / storage.ghost.io (see SOURCES_DUOLINGO.md) | fetched 2026-11-21 | VERIFIED (M) |
| A22 | Duolingo GitHub org API (12 repos, zero character/animation) | https://api.github.com/orgs/duolingo/repos?per_page=100 | fetched 2026-11-21 | VERIFIED (negative, M) |

## 2. Duolingo — press / vendor (B)

| ID | Source | URL | Tier supported |
|---|---|---|---|
| B1 | Apple Developer — "The evolution of the Duolingo owl" (Hartman, Sims, Murphy) | https://developer.apple.com/news/?id=e2e1faj4 | VERIFIED |
| B2 | Advertising Week — Hartman interview ("chicken nugget with a face"; 2019 facelift; Duo as coach) | https://advertisingweek.com/aw360/news/the-surprising-reason-why-the-duolingo-owl-is-green/2524 | VERIFIED |
| C1 | LottieFiles — Duolingo case study ("thousands of files") | https://lottiefiles.com/pt/case-studies/duolingo | STRONGLY SUPPORTED (opened directly) |
| C2 | HackerNoon — Hartfelder quote (LottieFiles "critically important… in our animation pipeline") | https://hackernoon.com/meet-lottie-the-open-source-file-that-is-changing-animation-as-we-know-it-o83735uy | STRONGLY SUPPORTED |
| C3 | Rive Blog — Lily Video Call (8 head × 8 body = 64+ idle variations, <1 MB, weekly "Riv Deliv") | https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life | STRONGLY SUPPORTED |
| C4 | Rive — character animation use case (lip-sync via State Machine) | https://rive.app/use-cases/character-animation | STRONGLY SUPPORTED |
| D1 | Duocon 2023 talk — "How we animate the Duolingo world" (YouTube `fgOqvyPif3g`) | https://www.youtube.com/watch?v=fgOqvyPif3g | STRONGLY SUPPORTED (existence + reported content; **not watched in full, no transcript — highest-value remaining source**) |

## 3. Duolingo — secondary distillations (C) — used with the tier cap

The former public guidelines at `design.duolingo.com` no longer serve as a
portal (VERIFIED, fetched 2026-11-21 — now a design-articles blog). Rules
cited from distillations (3 base shapes, ~15 shapes, pill shadows, pastels
never gray, no fingers, pupils never centred) are STRONGLY SUPPORTED at most,
via G1–G5 in `SOURCES_DUOLINGO.md` (notably the duolingo-ux-reference repo,
which states its source as design.duolingo.com captured 2026-07-17). **Disputed
value:** wing-overlay `#43C000` (G1) vs measured `#50BB00` (A13) — the
measurement wins; do not cite `#43C000` as canonical.

## 4. Tools (verified 2026-11-21)

| Tool | Source | What was verified |
|---|---|---|
| Rive runtimes | https://rive.app/docs/runtimes/getting-started | MIT licence for official runtimes; no royalties/fees |
| Rive Apple runtime | https://rive.app/docs/runtimes/apple/apple · https://github.com/rive-app/rive-ios | SwiftUI support, SPM, iOS 14+; free exports play a splash screen |
| Lottie-iOS | https://github.com/airbnb/lottie-ios | Apache 2.0; SwiftUI `LottieView` since 4.3.0 (Sep 2023) |
| Spine pricing | https://freedom251.com/apps/spine/ · https://www.thegeeksclub.com/platforms/spine/ | Essential $69 / Professional $379 one-time (reduced from $99/$449); Enterprise $2,499/yr base; iOS runtime listed — **secondary sources; confirm at checkout** |
| Blender | https://www.blender.org | GPL; 5.2.0 LTS on the ASCND VM; already used for the v8 gallery |

## 5. Koa — repo evidence (all at tip 44862412 unless noted)

| Source | What it evidences |
|---|---|
| `apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaSceneData.swift` (76,631 B; 628 nodes, 38 ids) | Master geometry; frozen RN export (`koa-scene.ts @ fac9ac2`); measured by `/tmp/parse_koa.py` + `/tmp/bbox_koa.py` (M) |
| `KoaWardrobeData.swift` (413,544 B; `build.py`) | 70 RN wardrobe groups dropped + redrawn; the sanctioned extension path for items |
| `KoaRender.swift` / `KoaPaint.swift` / `KoaLight.swift` / `KoaMath.swift` / `KoaFlags.swift` / `KoaGesture.swift` / `KoaWalk.swift` / `KoaFigurePlans.swift` / `KoaScene.swift` | Render pipeline; procedural lighting; flag system; gesture matrices; walk phases; 64-entry plan cache |
| `KoaRender.swift:188` (`isEyeGroup`) + lash-path construction | Eye-group restructuring — basis for the PoC §2.1 eye-backing finding |
| `KoaRender.walkFlags()` comment | 2.5D `KoaTurn` removed 10/11 (far-side eye/cheek overflowed head, covered ear) |
| `apps/ios/ASCND/Features/Mascot/KoaFigureView.swift` | SwiftUI Canvas + TimelineView ≤60 fps |
| `apps/ios/ASCNDTests/KoaImageDiff.swift` + `__Snapshots__/KoaSnapshotTests/` | Pixel-diff regression (tolerance 16/255, max 0.01%) — screen-level, not identity-level |
| `apps/ios/tools/koa-wardrobe/build.py` (1,392 lines) + `tools/insights-golden/gen-koa-scene.mjs` | Generators for wardrobe + scene data |
| `native/src/components/ascnd/koa/koa-scene.ts` (81,123 B) | RN origin of the scene data |
| `native/assets/mascots/{README.md, KOA_OUTFIT_CATALOGUE.md, koa-construction-manual.png, koa-flat-spec.png, koa-svg-spec-sheet.png}` | RN-era spec sheets (contradict shipped art — Audit §5.1); README records Rive/Spine/3D/Lottie/AI-cutout tried and dropped 27/07/2026 |
| `apps/ios/docs/koa-v2/{DUOLINGO_RESEARCH.md, KOA_TECHNICAL_AUDIT.md, KOA_V2_SLICE.md}` (05/11/2026) | Prior Duolingo research; 05/11 technical audit (pose readability 2/5; 9-step check loop; Character Bible proposed, never written) |
| `apps/ios/docs/koa-v2/gallery/{v3-vector-turnaround, v4-from-art, v5-2.5d-turn, v8-pose-library}/README.md` | Turnarounds (IoU silhouette 0.999, tuft 0.46); v8: 17 poses × 7 cameras, 119 frames, 28 expressions; Blender scripts `koa_model.py` / `koa_pose.py` / `koa_faces_gym.py` |
| `~/workspace/koa-audit/KOA_AUDIT_REPORT.md` (+ 3 explorer reports), tip `2a904952`, 17–18/11/2026 | First Koa audit: 60 findings (P0 4); Koa 2D-only; dead states K-29; cover-up patches |
| GitHub API: `KoaSceneData.swift` commit history | Only 2 commits: `3768aac8` (11/10/2026, created) + `3e2088b6` (21/11/2026, test-only KOA-T60) — geometry frozen ~6 weeks (M, via API) |

## 6. PoC artifacts (own measurements, 2026-11-21)

| Artifact | What it evidences |
|---|---|
| `poc_rig_test.py` | Parser + flat PIL renderer + rotation variants + IoU measurement (re-runnable) |
| `poc/poc-neutral.png` | Baseline renders correctly (validates the PoC pipeline) |
| `poc/poc-running.png` (IoU 0.870) · `poc/poc-sitting.png` (0.980) | Rotation-only frozen frames unreadable as poses |
| `poc/poc-curl.png` (IoU 0.942) | Partial: reads as "holding", not "curling" |
| `poc/poc-pushup.png` (IoU 0.368, 0.826× shrink) | Rotation-only cannot produce a push-up; horizontal Koa doesn't fit the 240×300 frame |
| `poc/poc-contact-sheet.png` | All five frames side by side |

## 7. What remains unverified (carry-forward list)

| # | Item | What would resolve it |
|---|---|---|
| U1 | Whether Duo's *own* in-app poses are Rive, Lottie, or hand-posed Figma/AE exports | Duocon 2023 talk transcript; a Duolingo post about Duo specifically |
| U2 | Contents/format of Duo's character sheet / pose library / rig | Any published sheet; designer portfolio with a Duo turnaround |
| U3 | Numeric construction spec for Duo | None exists publicly; Koa ratios must come from Koa's own assets (done — DNA doc) |
| U5 | Whether Duolingo's 3D continued after the 2023 intern project | Follow-up blog post; 3D Duo in product |
| U6 | Procedural/AI generation of Duo art in production | No evidence found; any claim would be fabrication |
| G1 | Koa git history (KoaTurn removal commit, Day-PNG removal, gallery changes) | Deeper clone (`git fetch --deepen` timed out at 120 s in synthesis) or GitHub API per-path commit lists |
| G2 | Runtime behaviour of Koa (animation judged visually, frame times, simulator captures) | Mac + Xcode + simulator; Instruments |
| G5 | `KoaWardrobeData` vs `KoaSceneData` node-by-node diff | Compute the diff (not done in Phase II) |
| P1 | Jointed-rebuild wardrobe scope (how many of 70 items need redrawn arm/leg layers) | Wardrobe audit — first task of Roadmap Phase 1 |
| P2 | Proposed-method authoring time (is B actually cheaper per pose?) | Execute the 6-pose PoC plan (§4 of KOA_PROOF_OF_CONCEPT.md) |
| P3 | Rive workflow AI-verifiability (C8's objection) | Time-boxed Rive evaluation on one pose (celebrating) |

## 8. Compliance statement

- No Duolingo artwork, logo, or character art is reproduced in any mission
  document. Only URLs, measurements, and principle-level analysis.
- No internal Duolingo documents, leaks, or employee-only systems were sought
  or used. All Duolingo evidence is from public web pages, public APIs,
  public patent databases, and files Duolingo itself serves publicly.
- No ASCND repo files were modified in this mission. All deliverables are
  research/design documents in `~/workspace/koa-mascot-research/working/`.
  The PoC reads the repo's scene data and renders it locally; it writes only
  to `working/poc/`.
- Licences are recorded as found on 2026-11-21; prices and plan terms change —
  confirm at purchase / before shipping.
