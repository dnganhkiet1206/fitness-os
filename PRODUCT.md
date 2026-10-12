# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users
Two audiences weighed equally (owner's answer, 2026-10-12):
- People who train seriously (strength work several times a week) and open Today to see what to train, how ready they are, and to log meals / sleep / weight quickly.
- Newcomers to healthy routines who need motivation to come back every day — the mascot Koa, daily energy, quests, coins and streaks exist for them.

## Product Purpose
ASCND (fitness-os) is one app for the whole day of a person who trains: workouts and plans, nutrition and water, sleep, biometrics and readiness, weight, and a community. The native iOS app (`apps/ios`) is a port of the React Native app (`native/` @ fac9ac2), which is the behavioural oracle.

## Positioning
"One app for everything" (owner's answer): training, food, sleep, biometrics and body tracking live in one place and feed one another — the readiness score is computed from the same day the user logs.

## Operating Context
Opened several times a day on an iPhone: in the morning (sleep, readiness), around meals, before / after training. Light paper theme by default, dark "room" theme available. Data syncs with Supabase and Apple Health; works offline with a queue.

## Capabilities and Constraints
- Languages: Vietnamese, English, Spanish (every string in all three).
- Readiness engine, mascot economy, quests and streak rules are server / RN rules and must not change in the UI port.
- Today tab blocks that exist natively: brand header, energy ring, readiness hero, Koa row, to-do card, Apple Health sync, groups (Health / Fitness / Insights), plan card.

## Brand Commitments
- Name ASCND with its A-mark (koa inside the A), mascot Koa.
- **Binding:** keep the current beige / paper palette (owner's answer) — background `#f7f4ef`, cards `#ffffff`, ink `#1a1917`, muted `#6b6559`, border `#dcd5c8`, ring track `#c4bcac`, plus the readiness / metric accents of RN's `lightPalette`.

## Evidence on Hand
Real app data only (Supabase, Apple Health). No testimonials, stats or customer claims exist; none may be invented.

## Product Principles
1. Everything about today on one page, in the order the day is lived.
2. Never show a fake zero: unmeasured is "—", not 0.
3. Motivation for newcomers must not slow down the people who just want to log and train.
4. Logging anything is one tap from Today.
