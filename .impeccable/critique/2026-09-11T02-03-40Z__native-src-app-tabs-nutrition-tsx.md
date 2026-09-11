---
target: trang dinh dưỡng (Nutrition tab)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-11T02-03-40Z
slug: native-src-app-tabs-nutrition-tsx
---
Method: dual-agent (A: design review from source + renders · B: detector + repo gate + pixel measurement). Parent verified three uncorroborated claims.

## Design Health Score — 23/40 (Operate surface, all 10 heuristics apply)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Light segmented thumb is `c.background` — byte-identical to the page ground (1.00:1), 1.16:1 vs the rail. No theme branch. |
| 2 | Match System / Real World | 3 | "eaten"/"left" and food glyphs are human; "0 items · 520 kcal" is machine-speak. |
| 3 | User Control and Freedom | 1 | No date navigation at all; cannot log or correct any day but today. |
| 4 | Consistency and Standards | 2 | Light thumb inverts the iOS convention its own comment names; light macro tiles carry washes dark ones don't. |
| 5 | Error Prevention | 2 | Help nudge fires at 0 kcal; "0 items" chevron opens onto nothing. |
| 6 | Recognition Rather Than Recall | 3 | Four named log methods beat one ⊕; macro flip is an invisible mode. |
| 7 | Flexibility and Efficiency | 2 | No date jump, no "repeat yesterday"; fastest path (camera) drawn identically to slowest (manual). |
| 8 | Aesthetic and Minimalist Design | 2 | 8 hue families; 4 purely decorative chip colours; "Nutrition" written 3× in 160pt of height. |
| 9 | Error Recovery | 3 | Model copy, but takes over the whole screen and blocks the other segment. |
| 10 | Help and Documentation | 3 | Per-card `?` with a real explainer; nudge is context-blind. |

## Design Specificity Verdict — AI look: YES, partially

The thinking is bespoke; the surface is not. Almost none of the authored judgment (MacroSwap odometer, eaten/left rule, dropping the floating ⊕ for iOS 26) is visible at rest. What renders is seven equal-width rounded rectangles.

Tells: (1) 2×2 pastel macro grid, the most-cloned object in fitness software, with `profile.goal` read on-screen and spent on nothing visual; (2) LOG MEAL is the textbook quick-actions strip, four hues carrying zero information, camera drawn identically to manual despite the code calling camera the fastest path; (3) visual weight inversely proportional to importance — the only gradient-filled controls on the page add water; (4) one elevation role (`secondary`) for all seven cards despite a documented four-tier system.

Authored, anti-AI-look: warm-paper light theme (#f7f4ef card-on-paper with #1a1917 ink shadow), Menlo tabular figures throughout, the bespoke water quick-add stepper.

Verdict: the page would survive a logo swap.

Deterministic scan: detector clean (0 findings, exit 0, both files) but only ~15 of ~59 rules implemented and all contrast/tap-target/typography rules structurally unreachable for React Native. Verified not a false negative via synthetic bad file (2 findings) and a bad line appended at EOF (flagged at line 1948). Repo gate `tools/check.mjs`: 216/216 green. The P0 below was found by pixel measurement, not by any tool in either suite.

## Colour census

| Method | Count |
|---|---|
| Palette tokens, two main files | 21 |
| Tokens incl. sub-components on screen | ~26 |
| Hard-coded literals in executable code | 7 hex + 2 rgba |
| Distinct exact RGB in light render | 6,124 (misleading — dithered background gradient, 552 distinct runs in one column) |
| Colours covering ≥0.05% area | 54 |
| Colours covering ≥0.5% area | 17 (3 colours cover 50% of the page) |
| **Chromatic hue families** | **8** |

Colour has stopped carrying meaning: amber = carbs + calorie-progress + page-aura + "manual entry" (4 meanings); blue = fat + water; rose = protein + at/over target; `destructive` and `readinessRed` are the same hex; teal and purple are decorative here while meaning deep-sleep and REM two taps away. Meaningful 4, decorative 2, accidental 2, ambiguous 2.

## Priority Issues

**[P0] The `/` separator is 13pt text painted in the border token — 1.46:1.**
`dashboard-cards.tsx:1655` → `sideSlash: { fontSize: 13, color: c.border }`, rendered line 833 between "Target: 2,450 kcal" and "69%". Light `#dcd5c8` on `#ffffff` = 1.46:1; dark `#2b2b31` on `#0e0e11` = 1.37:1. Floor is 4.5:1. Slips every guard by construction: `text-color.mjs` only checks a text style *declares* a colour; `same-color.mjs` only catches text *exactly equal* to its background. The author's own comment at line 829 says the separator is load-bearing, which argues against the WCAG incidental-text exemption.
Fix: `color: c.mutedForeground` (or raise to a legible token). Suggested command: /impeccable audit

**[P1] No date. The diary only exists today.**
`nutrition.tsx` has zero date state; hooks call `localDateStr()` internally. Cannot log yesterday's dinner or review last Tuesday.
Fix: 7-day date strip under the segmented control; thread a `date` param through `useTodayLog`/`useDailyLog`. Suggested command: /impeccable shape

**[P1] Light segmented thumb is invisible.**
`segmented.tsx:110` → `fill={cap ? c.background : c.accent}`, no theme branch. Light thumb `#f7f4ef` is byte-identical to the page ground; 1.16:1 vs the rail. The comment three lines above names this exact trap.
Fix: `fill={cap ? (m.lit ? c.background : c.card) : c.accent}`. Suggested command: /impeccable polish

**[P2] Over-target punishes instead of informing.**
Ring turns `#de0b44`, the identical hex to `destructive`. No week context, no protein-surplus vs calorie-surplus distinction.
Fix: amber for "over", reserve red for delete; add one week-context line. Suggested command: /impeccable clarify

**[P2] Hard-coded colour, one leaking into light.**
`#9fd8f5` ring glow has no theme branch and is active in the rendered state. Measured 1,314 cool pixels (b−r ≥ 8) in a box around the ring, samples like `#f4fbfe`; control box on blank paper: 0. Third undeclared exception to the palette's "every ASCND near-white is warm" law. Plus `rgba(14,165,233,0.1)` on the water icon plate (Tailwind sky-500, matching neither `metricBlue`).
Correction to Assessment A: `#ffc53d`, `#eaf1fb`, `#b9dcf0` sit in the `m.lit` branch and `m.lit` is DARK, so they do not leak to light. `#b45cff`/`#22e3ff` is the Sleep widget, not this screen.
Fix: tokenise the glow with a theme branch; replace the rgba plate with `alpha(c.metricBlue, 0.1)`. Suggested command: /impeccable audit

**[P3] Three visible data-integrity bugs.**
"Breakfast · 0 items · P38 · C54 · F14 · 520 kcal" with a chevron opening onto nothing; the help nudge fires at 0 kcal on an empty day; `ShortcutRow` (Supplements) degrades to a bare labelled door when `value` is null. Suggested command: /impeccable harden

## Persona Red Flags

**Linh, 34, cutting, logs from the supermarket queue** — gets the answer (770 remaining), then: four equal-weight log chips so she hunts; no date so last night never got in and today's number is already wrong; goes 60 over and the screen turns delete-red at her.

**Minh, 22, bulking, protein is the only number he cares about** — the 2×2 grid gives protein a quarter of the space and the same treatment as fibre; `profile.goal` is read on this screen and spent on nothing visual.

**VoiceOver user** — the hero card is one unlabelled button reading ~20 strings in a single breath, no announced flip action, no internal navigation.

## Minor Observations

- `tap-target` passes carrying 11 grandfathered items (ratchet: list may only shrink); `type-scale` notes 6 sizes off the 7-step ramp (12, 14, 16, 19, 20, 24), deliberately unenforced.
- Light calorie ring: under-target and in-band share a colour stop, collapsing three states into one hot ramp. Dark reads white/amber/red — a genuine three-way signal. Light loses it.
- Ring arc `#b67e08` vs track `#c4bcac` = 1.86:1, below WCAG 3:1, but `tools/ring-track.mjs` passes it against an explicit in-repo floor of 1.5:1 with recorded reasoning. Divergence between two yardsticks, not an unnoticed defect.
- Vertical rhythm is 20-20-20-20-20 with no grouping, so nothing reads as belonging with anything.
- "Today's meals" is the only page-level title; six siblings use in-card micro-labels, so it reads as an orphan.
- Macro bar fill vs track: protein 5.92, fat 5.00, fibre 4.97, carbs 3.30 — all pass 3:1, but protein is ~1.8× carbs, so the four bars don't read as a family.

## Questions to Consider

1. Every one of the best decisions is invisible at rest — the odometer, the stagger, the haptics are all motion. A screenshot of this page contains none of that judgment. What on this page is yours in a still frame?
2. The palette file is 1,010 lines of argument about colour and the screen still has eight hues. Is the governance measuring the wrong unit? What would a rule constraining "how many meanings may a hue carry on one screen" forbid here?
3. The largest, brightest object performs the least consequential action (the ring flips a label) and the most button-shaped controls add water. Delete the water card and the macro grid — what is actually lost?
