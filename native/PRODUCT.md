# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Three personas the product serves at once, not a single narrow one:

- **Serious lifters/athletes** who want precise load and recovery data (readiness score, ACWR, HRV) beyond what generic fitness apps surface.
- **General fitness enthusiasts** building a training/nutrition habit who want an engaging, game-like companion (Koa) to stay motivated.
- **Bio-hackers / quantified-self users** optimizing sleep, recovery, and supplementation, for whom deep biometric tracking is the main draw.

## Product Purpose

ASCND is an all-in-one iOS fitness app unifying workout logging, nutrition/meal tracking, sleep and recovery scoring, supplement tracking, and an AI coach — all reflected back to the user through Koa, a mascot whose emotional state reacts to the user's real activity (workout streaks, PRs, inactivity, etc.), rather than being purely decorative. Success means the user trusts the numbers enough to act on them (train harder or back off, prioritize sleep, adjust nutrition).

## Positioning

All-in-one depth: ASCND replaces several point solutions (a workout logger, a nutrition tracker, and a recovery/readiness tool like Whoop) inside a single app. Two commitments a competitor could not casually copy:

- Missing or unmeasured data is never faked as zero — it renders as `null`/blank. This is an explicit, previously-violated-and-fixed rule (`native/docs/fitness-scores.md` cites six past instances of the anti-pattern).
- Koa the mascot's reactions are driven by real logged activity, not idle animation — an emotional layer other fitness apps don't have.

## Operating Context

- Built with Expo Router + React Native (Expo SDK ~57), targeting iOS as the primary platform (bundle id `com.ascnd.fitnessos`); Android is scaffolded in the same codebase but iOS is the stated target.
- Syncs with Apple HealthKit (steps, heart rate, HRV, sleep) to compute daily readiness.
- Camera/barcode scanning for food logging; Face ID gates health data; Apple Sign-In for auth.
- Backend is Supabase (project shared with a legacy Lovable-built web app at the repo root — same database, both apps read/write it).
- AI features (coach chat, meal suggestions, smart nudges, weekly review, food-scan vision) run through Lovable's AI gateway (Gemini models under the hood), billed as Lovable credits rather than a direct OpenAI/Anthropic key.

## Capabilities and Constraints

- **Training:** workout logging, workout builder, routines, templates, exercise library with per-exercise insight/history, session tracking.
- **Nutrition:** meal logging, meal plans, food editor, grocery list, barcode/camera food scanning.
- **Recovery:** readiness score (weighted average of measured dimensions, robust z-score against the user's own baseline; HRV/RHR baseline needs ≥5 data points before it's trusted), ACWR (acute:chronic workload ratio vs. the user's own 4-week habit), sleep logging and insights.
- **Body tracking:** biometrics, measurements, progress photos, weekly review, smart goals.
- **Engagement:** Koa mascot with emotional states driven by activity, in-app shop, challenges, awards.
- **AI coach:** chat with memory, reminders, smart nudges.
- **Hard constraint:** absent/unmeasured data must be excluded and re-weighted, never defaulted to 0 — the whole scoring system depends on this (`native/docs/fitness-scores.md`).
- **Known open risk:** the five Supabase AI functions' auth hardening and mascot-economy data (currently AsyncStorage-only under `TEST_UNLOCK_ALL`) are pre-release concerns tracked in `native/docs/PRE_RELEASE.md` — not yet safe to ship as-is.
- **Undecided:** Android is present in the build config but not the stated target platform; treat iOS as primary unless the user says otherwise.

## Brand Commitments

- App name **ASCND** (stylized full-caps); mascot character **Koa**, a koala, with a binding existing design — construction manual, flat spec, and SVG spec sheet in `native/assets/mascots/`, plus an outfit catalogue (`KOA_OUTFIT_CATALOGUE.md`). Koa's established look is truth to preserve, not a starting sketch.
- App icon source exists at `native/assets/brand/app-icon-source.png`.
- Current interface default is dark (`app.json` → `userInterfaceStyle: dark`).

## Evidence on Hand

- Full scoring methodology (readiness, ACWR — definitions, formulas, missing-data handling, confidence tiers) documented in `native/docs/fitness-scores.md`.
- Mascot system design and rollout plan in `native/docs/MASCOT_SYSTEM_HANDOFF.md` and the spec assets in `native/assets/mascots/`.
- No testimonials, customer evidence, pricing, or press exist yet — future work must not invent any.

## Product Principles

1. Never fake a number — absent data renders as null/blank, never a misleading zero.
2. One coherent app beats a shelf of point solutions — training, nutrition, recovery, and body tracking share a single data model and a single daily story.
3. Koa's reactions are earned by real user data, not decorative animation.
4. iOS-native feel is part of the product, not a wrapper — HealthKit, Face ID, and Apple Sign-In are load-bearing, not optional polish.
5. Every recovery/readiness number is relative to the user's own history, never a population norm.

## Accessibility & Inclusion

Screen-reader support is an active, tracked concern rather than a later add-on — recent work on the home-screen card-deck specifically addressed VoiceOver reachability and gave interactions activity-based labels instead of repeating element names (git history, `native/src/components/ascnd/card-deck.tsx`).
