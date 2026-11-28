# Competitor Deliverable 10 — Prioritized Competitor-Inspired Product Roadmap

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w8-competitors-b.md §7 (P0–P3 + sequencing). A feature is not prioritized merely because a competitor has it; each item carries impact, complexity, dependencies, data/security/privacy implications, success metrics, and a validation strategy.

## 7. Prioritised roadmap (§16.10)

*Prioritisation rule: impact on real training consistency + closing a loop, divided by complexity and risk. Nothing is P0 "because a competitor has it". P0 = safety/truth + the core loop. Dependencies and K-refs are to the Koa audit / baseline.*

### P0 — safety, truth, and the core loop (do first)

| # | Feature | Competitor ref | User problem | Opportunity | Impact | Complexity | Dependencies | Data / security / privacy | Success metric | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| P0-1 | Coach truth fixes: allergy/diet hard filter (K-02), null-is-not-zero (K-03), SSE truncation + error classification (K-06/K-07), probe graceful degradation (K-08) | MFP (allergy-aware planner); Oura (honest AI disclaimer) | Coach can recommend allergenic food and state 0 as eaten; AI vanishes on probe failure | Trustworthy coach | High (safety) | S–M | Koa audit KOA-T02/T03/T06/T07/T08 | Allergies = health data: filter server-side, minimised context; no raw profile in prompts | 0 allergen violations in constraint tests; 0 "0 kcal as eaten" in scripted fresh-account tests | Constraint test suite; fresh-account script (Koa audit V28) |
| P0-2 | One Koa state machine (R-K1 / O-14) | Duolingo Rive state machine | Face/line/gesture contradict each other | Coherent companion everywhere | High | M–L | KOA-T14/T30; mascot Bible/gate (Option B phase 0) | None new | 0 contradictions in scripted-state captures (V4–V6) | Simulator checklist V4–V6; state-transition tests |
| P0-3 | Deterministic adaptive plan generator (O-01) | Fitbod; Apple Gym Strength | Plans go stale; users don't know what to lift | The core loop, closed | High | M | LoadHint/e1RM/LighterSession (exist); readiness engine | On-device; no new data | % users with a generated next session; 8-week training consistency | Golden vectors; A/B vs static templates (consistency, not opens) |
| P0-4 | Pause-as-care + streak grace (O-15) + decide K-56 | Finch Pause Mode; Lally | Paused weeks read as missed; freeze dead | Retention through life events | High | M | Kiệt decision K-56; KOA-T23/T56 | Streak data already held | Streak survival after pause; return rate after 7+ day absence | Cohort: paused users' 30-day return |
| P0-5 | Celebration-once policy + claim-contract fix (O-16) | Duolingo (rare celebrations) | Celebrations lie (re-fire, double-claim) | Trust in rewards | High | S–M | KOA-T01/T05/T24 | Server ledger (exists) | 0 duplicate celebrations in testing | Dedup tests; Today reload test |

### P1 — the loops, connected

| # | Feature | Competitor ref | User problem | Opportunity | Impact | Complexity | Dependencies | Data / security / privacy | Success metric | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| P1-1 | Koa reacts inside the work + haptic/sound composition (R-K2; K-15/K-25/K-26) | Peloton (stage); Finch (in-the-moment) | Koa is alive in the room, dead in the workout | Companion where it matters | High | M | P0-2; KoaReaction scenes | None new | PR/session completion with Koa reaction seen; haptic fires on device | Simulator V17–V20; device haptic check |
| P1-2 | Coach context completion (K-33) + in-chat graphs (O-12) | WHOOP Activity Insights; Oura in-chat graphs | Coach lacks water/steps/plan/meals; answers are text-only | Grounded, evidenced coaching | High | M | P0-1 | Minimised context block; visible = used (K-32) | % coach answers citing a correct number | Grounding tests; scripted Q&A |
| P1-3 | AI meal-plan generation, constrained (O-10) | MFP Meal Planner | No generated plan; plans are stored rows | Nutrition loop closed | High | M–L | P0-1 (allergy filter); FitnessCalc | Allergies minimised; no raw profile dump | % users with an active generated plan; plan adherence | Constraint tests; 4-week adherence cohort |
| P1-4 | Adaptive daily targets (O-04) + per-set load adaptation (O-20) | WHOOP Strain target; Fitbod mid-workout | Fixed targets punish rest; next set doesn't learn | Targets that feel personal | High | S–M | P0-3; readiness engine | On-device | Target-achievement rate by readiness band (should be ~equal, not skewed) | Golden vectors per band |
| P1-5 | Winnable social: training groups + consistency titles (O-06 + O-08) | Duolingo leagues; Strava Local Legend | No winnable competition; community is solo | Social retention | High | M | Community infra (exists); opt-in privacy | Opt-in only; session counts only, no health data | Group member 8-week retention vs solo | Cohort comparison; moderation load |
| P1-6 | Koa visible growth + weekly adventure recap (O-13) | Finch growth + adventures | Growth is a number; weeks end with nothing | The Koa differentiator | High | M | P0-2; KoaMonthView; WeeklyReview | None new | Recap open + share rate; rank-up room-change seen | Snapshot tests; share analytics |

### P2 — depth and polish

| # | Feature | Competitor ref | User problem | Opportunity | Impact | Complexity | Dependencies | Data / security / privacy | Success metric | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| P2-1 | Strength standards + Training Age (O-02 + O-18) | StrengthIQ; Apple Health Age | "Am I strong?" unanswered; no long-term identity | Horizon + identity | Medium | S–M | O-01 (for accurate e1RM) | Bundled cited table; no medical claims | % users viewing standards; share rate | Golden vectors; source citation review |
| P2-2 | Plateau/fatigue alerts (O-03) | StrengthIQ | Plateaus found months late | Early action | Medium | S | ExerciseTrend (exists) | On-device | Time-to-deload-action after alert | Threshold tests; false-positive rate |
| P2-3 | Streak integrity split (O-05) + exploration awards (O-07) | Peloton; NTC | Junk logs preserve streaks; no variety reward | Honest progress | Medium | S | Streak.swift; Awards | None new | Junk-log rate (proxy: water-only streak days) falls | Streak golden tests |
| P2-4 | Day in Review evening card (O-19) + shareable stories (O-21) | WHOOP Day in Review; Strava Year in Sport | Evenings have no close-out; sharing is static | Daily bookend + acquisition | Medium | S–M | P1-6 (recap) | None new | Evening card open rate; story shares | Analytics; share tests |
| P2-5 | Coach tone + memory controls (O-11) | Oura tone + Memories; WHOOP My Memory | One voice; invisible memory | Trust + personalisation | Medium | S–M | P0-1 | User control = the feature | Memory view/delete usage; tone setting adoption | Round-trip tests |
| P2-6 | Nutrition logging confidence + edit loop (O-22) | MFP Meal Scan | AI logs are silent numbers | Trustworthy logging | Medium | S–M | scan-food; TellKoa | Photo data handling (existing) | Edit rate on AI logs (healthy: some edits, not all) | Parse accuracy tests |
| P2-7 | Ship the 8 DRAFT 3D guides to Release (approval by reference-comparison) | — (ASCND Motion Kit) | Form guidance is DEBUG-only | Real form guidance | Medium | M | Motion Kit QA; PR #895/#896 lineage | None new | Guide views per session; form-related support questions fall | Reference-comparison approval records (per 2026-11-14 decision) |

### P3 — investigate / defer / sequence later

| # | Feature | Competitor ref | User problem | Opportunity | Impact | Complexity | Dependencies | Data / security / privacy | Success metric | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| P3-1 | Realtime + APNs (O-23) — investigate, don't commit | Peloton live; WHOOP check-ins | Community/coach can't reach out | Proactive + live layer | High (if done) | L | O-09 async presence proving demand; moderation; APNs certs | Opt-in; no health data in push payloads | Async presence engagement first | Demand gate: async presence DAU |
| P3-2 | Camera AI form analysis (O-17) — research spike only | Freeletics | No eyes on form when training alone | Form feedback | UNVERIFIED | L | P2-7 (guides shipped first) | Camera privacy; on-device preferred | Benchmark accuracy on public clips | Accuracy benchmark; privacy review |
| P3-3 | StoreKit paywall (O-24) — sequence after P0/P1 value lands | WHOOP/Oura/Peloton | No monetisation for AI + premium | Revenue | High (business) | M–L | Deploy 3 edge fns; StoreKit caller; tier design | Purchase data; App Store review | Conversion at value moments (not at core logging) | Sandbox purchase tests; paywall A/B |
| P3-4 | Koa tone choice + wider expression wiring (R-K7; K-29 decision) | Oura tone | One Koa voice; dead expressions | Polish | Low–Medium | S–M | P0-2; Kiệt decision per state (K-29) | None | Tone adoption | Rater review per state |

### Roadmap sequencing (suggested order, not a commitment)

1. **Now:** P0-1 (safety) + P0-5 (trust) — both are correctness, not features.
2. **Next:** P0-3 (generator) + P0-2 (Koa state) in parallel — the two architectural pieces everything else hangs on.
3. **Then:** P1-2 (grounded coach) + P1-4 (adaptive targets) — the coach becomes the explainer of the loop.
4. **Then:** P1-1 + P1-6 (Koa in the work + recap) + P1-5 (social) — the emotional + social layers, on top of a working loop.
5. **Later:** P2 depth; P3 only when its demand gate is met (async presence for realtime; guides shipped for camera form; P0/P1 value for paywall).

---
