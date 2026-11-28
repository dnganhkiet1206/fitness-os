# Competitor Deliverable 3 — Competitor Feature Comparison Matrix

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w7-competitors-a.md §4. Values: SUPPORTED / PARTIAL / NOT_SUPPORTED / NOT_VERIFIED. An empty or NOT_VERIFIED cell means the feature could not be confirmed from public sources, not that it does not exist.

## 4. Comparison matrix (§16.5)

Legend: **S** = SUPPORTED · **P** = PARTIAL · **N** = NOT_SUPPORTED · **?** = NOT_VERIFIED. Judgements are from the teardowns above; "PARTIAL" means present but gated, thin, or single-purpose. Prices are US, Nov 2026, from §2.

| Capability | Hevy | Strong | Fitbod | JEFIT | StrongLifts | Strava | Apple Fitness+ | WHOOP | Garmin Connect | Fitbit / Google Health | MyFitnessPal | MacroFactor | Cronometer | Lose It! |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Workout logging (sets/reps/weight) | S | S | S | S | S* | P† | N | P‡ | P | P | N | P§ | N | N |
| Exercise DB | S (~450) | S | S (1,000+) | S (1,400+) | N (5 lifts) | N | N (classes) | N | P | N | N | N | N | N |
| Progressive overload | P (Pro Trainer only) | N (manual) | S (auto, opaque) | S (Elite AI) | S (published rule) | N | N | P (Strain Coach) | P (suggested workouts) | P (adaptive plans, Premium) | N | ? (Workouts) | N | N |
| Training analytics | S (volume/1RM/PRs; full history Pro) | S (volume/1RM, PRO charts) | S (volume, strength scores) | S (4 engines + NSPI) | S (history/charts) | S (Fitness Score, sub) | P (rings/trends) | S (Strain/Recovery trends) | S (load/VO2/Fitness Age) | S (trends, readiness) | P (weight charts) | S (TDEE/weight trend) | S (nutrient trends) | P (weight/budget charts) |
| Nutrition tracking | N | N | N | N | N | N | N | N (journal behaviours) | N | P (basic log) | S | S | S | S |
| Recovery insights | N | N | P (muscle recovery map, history-based) | P (muscle recovery chart) | N | P (Fitness/Freshness, sub) | N | S | S (Body Battery/Readiness/HRV, free) | S (Readiness/Sleep Score) | N | N | N | N |
| Health integration (HealthKit / wearables) | S (Watch, Strava, Health) | S (Watch, Health) | S (Watch, Health, Strava, Fitbit, Garmin) | S (Watch, Health, Strava) | S (Watch, HR) | S (imports Garmin/Fitbit/etc.) | S (Health native) | P (band only; no GPS) | S (Garmin hardware) | S (Fitbit/Pixel hardware) | S (40+ apps) | S (Health etc.) | S (Health, Oura, WHOOP, Garmin) | S (Health, Watch; device sync Premium) |
| Gamification | S (PRs, streaks, leaderboards) | P (PRs, streaks) | P (streaks) | S (challenges, NSPI, leaderboards) | P (streaks/history) | S (segments, challenges, crowns) | S (awards, rings, Burn Bar) | P (strain targets) | S (badges, challenges) | P (badges removed 2026) | S (streaks, badges) | P (habits, streaks) | N | P (streaks, groups) |
| Social features | S (feed, follow, Gym Profiles) | N | N | S (routines, challenges, community) | N | S (feed, clubs, kudos — moat) | N (Strava share) | N | S (challenges, connections) | P (groups removed) | P (forums, diary share) | N | N | S (friends, groups) |
| Personalisation | P (routines, Trainer Pro) | P (routines) | S (goal/equip/recovery-generated) | S (Adaptive Plan, Elite) | N (fixed programme) | P (goals, routes, Runna plans) | P (Custom Plans, For You) | S (Recovery/Strain targets, AI Coach) | S (Garmin Coach, suggested workouts) | P (adaptive plans, Premium) | P (calorie budget by goal) | S (Coached/Collab/Manual, diet styles) | P (targets by diet/DRI) | P (budget by goal) |
| AI capabilities | P (Trainer, ChatGPT/Claude plugins) | N | S (workout generation) | S (Adaptive Plan + 4 engines, Elite) | N (rules engine, not AI) | P (Athlete Intelligence summaries) | N | S (WHOOP Coach/AI, Strength Trainer) | P (Active Intelligence, Connect+) | S (Gemini coach, Premium) | P (AI Coach, Meal Scan) | S (adaptive coach, AI photo/voice) | P (Crono Coach, photo log — Gold) | P (AI Voice log, Premium) |

Notes: * StrongLifts logging is 5-lift-only. † Strava strength = coach-designed workouts with live set/rep tracking (subscriber, from Oct 2026) — new and thin. ‡ WHOOP Strength Trainer generates workouts; no Hevy/Strong-grade set/rep log. § MacroFactor Workouts is a newer expansion; depth NOT_VERIFIED.

### Matrix reading (one paragraph)
No app scores S across a row. The strength loggers (Hevy/Strong/JEFIT) own logging + overload but score N on nutrition and recovery. The recovery wearables (WHOOP/Garmin/Fitbit) own recovery but score N/P on logging and nutrition. The nutrition apps own food but score N on training. Fitbod is the only S on both workout generation *and* overload, but N on nutrition and P (non-biometric) on recovery — and the most expensive logger. **ASCND's opportunity is the empty intersection: S logging + S transparent overload + S biometric recovery + S adaptive nutrition in one app.** The risk is equally clear: matching any single column is not differentiation; the bar is Hevy's free logging, Fitbod's generation, WHOOP's daily recovery answer, and MacroFactor's adaptive TDEE — simultaneously.

---
