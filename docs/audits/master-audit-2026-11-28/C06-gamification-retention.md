# Competitor Deliverable 6 — Gamification and Retention Analysis

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w8-competitors-b.md §1 (Duolingo/NTC/Finch/Peloton/Strava + habit science). Assesses why each mechanism retains users and whether it creates genuine value or superficial engagement.

## 1. Gamification / retention research (§16.2G)

### 1.1 Duolingo — summary of the existing reverse-engineering doc (NOT redone)

Source: `~/workspace/koa-mascot-research/working/DUOLINGO_REVERSE_ENGINEERING.md` (Phase I, 2026-11-21) + Duolingo's own blog/help pages re-checked 2026-11-28. Confidence: **VERIFIED** for the items below (Duolingo-owned publications / named designers).

**Mechanics (all VERIFIED from blog.duolingo.com / Duolingo help):**
- **Streak (flame):** consecutive days with ≥1 lesson; resets to zero on a miss. Loss aversion is the engine — "the longer a streak runs, the more reluctant users become to break it."
- **Streak Freeze:** buyable with gems, auto-activates on a missed day. Third-party analysis (Trophy Gamification Intelligence Report 2026, USER-REPORTED/secondary) claims freezes produce 4.5× longer average streaks by day 21 and a 21% churn reduction for at-risk users — treat the numbers as **USER-REPORTED**, the mechanic itself as **VERIFIED**.
- **XP:** earned for every activity; immediate feedback (XP shown before leaving the lesson screen). XP is the *common currency* tying streaks, leagues and achievements together.
- **Leagues:** 10 tiers Bronze→Diamond; each Monday 30 random similarly-active users are grouped for a weekly XP race; top promoted, bottom 5 demoted; weekly reset creates Sunday/Monday engagement peaks. **Key design choice: matchmaking by similar activity level, so competition feels winnable.** Users can opt out in settings.
- **Gems:** in-app currency for Streak Freezes, timer boosts, cosmetics, league repair.
- **Hearts (free tier):** mistakes cost hearts; 5 mistakes blocks progress until a practice lesson refills one — a soft difficulty/monetization lever, NOT a fitness-appropriate mechanic (see §1.7).
- **Streak Society:** milestone tiers — 7 days (membership + trial), 30 days (app icon), 100 days (extra freeze slots), 365 days (VIP badge on leaderboards/profiles).
- **Character system (the part that matters for Koa):** Duo is one fixed minimal construction (circle body + half-circle wings + pill feet) chosen *explicitly* so posing is cheap — "animation and illustration time go down drastically" (Tyler Murphy, Apple Developer interview). Three tracks: static Figma vector for poses; After Effects→Lottie for linear animation at thousand-file scale; Rive state machines for interactive characters (8 head × 8 body = 64+ idle variations from 16 pieces; 20+ mouth shapes per character for viseme lip-sync). Character sheets + reusable character library exist. Duo's mood is "almost entirely tied to your learning habits" (Greg Hartman) — tears when you skip, backflips when you practise. Duo communicates via text only, never talks.
- **Why it retains:** one trivially easy daily core action (a 3–5 min lesson) + loss aversion (streak) + winnable social competition (leagues) + a character whose mood mirrors the user's behaviour. Every notification/animation/currency exists to drive the *single* daily action. The Hook Model maps cleanly: trigger (streak flame/notification) → action (one lesson) → variable reward (XP, chest, league move) → investment (streak day, XP, rank).
- **What does NOT transfer to fitness:** hearts-as-punishment (punishing a missed workout or a wrong answer is fine in a lesson; punishing a body is not); XP farming (grinding easy lessons for league XP has a fitness analogue — logging junk volume — that must be designed against); streaks as the *only* identity (a missed rest day is medically correct behaviour and must never be framed as failure).

**ASCND cross-reference:** ASCND already has Duolingo's skeleton — streak + freeze + XP/levels + coins + weekly challenges + ranks. What it lacks vs Duolingo: (a) **winnable social competition** — ASCND's weekly challenges are solo; community challenges exist but there is no league/peer-group ladder; (b) **streak-society-style milestone status** — ASCND awards exist (29) but no escalating social status for long streaks; (c) **the single daily action** — Duolingo's loop is one lesson; ASCND's loop is fragmented across workout/meal/water/sleep/steps quests with no one "do this today" anchor (DailyPlan exists but is a decision, not a loop); (d) **character-mood coupling done right** — Duo's mood mirrors behaviour; Koa's mood engine exists but K-13/K-14 show the coupling is partly dead or contradictory.

### 1.2 Nike Training Club (NTC) — badge collection, no XP

Sources: ironstreak.com "Best Gamified Workout Apps in 2026" (PUBLICLY DOCUMENTED); screensdesign.com NTC showcase; openloyalty.io (Nike Membership analysis). Confidence: **PUBLICLY DOCUMENTED**.

- **Mechanics:** badges/trophies for milestones (first workout, 10/50 workouts), variety (try yoga/strength/HIIT), consistency; weekly workout streaks visible on home; structured multi-week programs ("4-Week Full Body Burn"); "Train and Collect" collection view. **No XP system, no levels, no leaderboards, no freeze mechanic.**
- **Why it retains (weakly, by design):** NTC's gamification is deliberately *light* — the product is a free, polished guided-workout library and the gamification is a collection hobby, not the core loop. Badges reward *variety* (trying new workout types), which is the one genuinely clever bit: it fights routine boredom rather than rewarding raw volume.
- **Genuine value vs superficial:** badges for *trying a new modality* = genuine (broadens training); badges for raw count = superficial (rewards volume the user would do anyway). No freeze means a broken streak is just broken — less anxiety, less retention leverage.
- **ASCND cross-reference:** ASCND already exceeds NTC (XP + levels + coins + shop + weekly challenges vs NTC's badges-only). **Adoptable:** variety/exploration badges (first time per muscle group / modality) — ASCND's 29 awards are count-based (streak/workouts/meals/water/sleep/weigh-ins); there is no exploration award. Low cost: new award defs + source queries. See O-07.

### 1.3 Finch — the care-loop mascot (closest analogue to Koa)

Sources: finchcare.com (official, via search); makeuseof.com, engadget.com, techanjan.com, findurnest.com reviews (PUBLICLY DOCUMENTED / USER-REPORTED). Confidence: **PUBLICLY DOCUMENTED** for mechanics; **USER-REPORTED** for retention effects.

- **Core loop (4 steps):** set goals → complete real-world tasks → bird gains energy → bird goes on an "adventure" and returns with a story + a question → bird grows (baby → adult), unlocking new worlds. **Partial progress is rewarded** — the bird adventures even if not all tasks are done.
- **Mechanics:** rainbow stones (currency for clothes/furniture); Micropets (100+ to hatch — each paired with a goal; 15 adventures to raise); streaks exist but are *non-punitive* (first restore free, later restores cost currency; Pause Mode preserves streaks); daily quests; seasonal monthly events (e.g. Raven's Mansion — complete adventures to unlock a Micropet); Journeys (goal groups with tiered rewards); friends (birds visit each other, send "good vibes"); mood check-ins; first-aid kit (coping tools for bad days).
- **Why it retains:** **care, not competition.** The user cares for the bird *by caring for themselves* — the pet's growth is a mirror of the user's real self-care. No guilt mechanics: "If you have a bad day and do nothing, your bird stays by your side, waiting." The adventure *story* is the variable reward (narrative, not points). Customisation (outfits, room decor) is the investment loop. Social is supportive (encouragement), not competitive.
- **Genuine value vs superficial:** the loop is genuine *because the rewarded action is the real-world behaviour itself* (get out of bed, drink water, walk) — the game never rewards in-app grinding. The risk is the inverse: the pet can become the point (users open the app to dress the bird, not to do the task). Finch mitigates this by making every reward gated on a real task.
- **ASCND cross-reference:** This is the strongest model for Koa's future (§4). ASCND already has the pieces (room, wardrobe, coins, quests, KoaGains growth, comeback) but they are *disconnected*: Koa's room speech, Gains rank, quests and shop do not form one care loop; Koa's growth (Gains) is a number, not a visible life stage; there is no "adventure"/story return for real effort; streak handling has guilt-adjacent edges (K-13 dead worry state, K-23 pause misreads). See O-13–O-16.

### 1.4 Peloton — streak machine + live social competition

Sources: onepeloton.com blog "Celebrate Milestone Moments" (VERIFIED, official, updated 2025-07-18); support.onepeloton.com badges page (VERIFIED); yukaichou.com Octalysis analysis (PUBLICLY DOCUMENTED). Confidence: **VERIFIED** for mechanics.

- **Mechanics:** milestone badges per discipline (1/10/25/50/75/100 classes, then every 50); daily + weekly streak badges (now calendar-day based, not rolling 72h); monthly activity challenges; trophy cabinet on profile; live leaderboards during classes with instructor shoutouts for milestones; high-fives (real-time social reinforcement); **Club Peloton (2025) loyalty tiers** Bronze→Silver→Gold→Platinum→Diamond→Legend with points (2/workout day, streak-length points, annual streaks double, modality-variety bonuses) redeemable for early access/apparel/event invites; Teams (100k+ member-created teams); hidden "quest" classes.
- **Why it retains:** the streak is the retention engine (Octalysis Core Drive 8, loss & avoidance — "users waking at 4 AM on vacation to maintain streaks"); the *live* leaderboard + instructor parasocial shoutout makes a solitary workout feel witnessed; milestone badges (Century Ride = 100 rides) became cultural markers, i.e. status that travels outside the app.
- **Genuine value vs superficial:** the leaderboard is genuine *during* a live class (real-time pacing against real people improves output); the streak is the dangerous part — it rewards *showing up* even when rest is correct, and Peloton counts third-party workouts toward streaks but NOT toward milestones (a deliberate integrity line: platform effort counts more). Club Peloton's variety bonus (10% for 2nd activity, 20% for 3rd+) is a good anti-monotony design.
- **ASCND cross-reference:** ASCND has streaks/badges/challenges but **no live social layer** (no realtime, no APNs — a structural gap, not a feature gap), **no instructor/parasocial element**, and **no tiered loyalty status**. The integrity line (what counts toward what) is worth copying: ASCND's streak counts *any* logged day (kcal>0 OR workout>0 OR sleep>0 OR supplement>0) — a very low bar that invites streak-preserving junk logs; Peloton's split (streak = any activity, milestone = platform effort) is a model. See O-05, O-09.

### 1.5 Strava — segments solve the global-leaderboard problem

Sources: trophy.so "Strava Gamification Strategy" (2026) and "Segmented Leaderboards" (PUBLICLY DOCUMENTED, vendor analysis with platform data — treat numbers as secondary); omegapoint.systems (PUBLICLY DOCUMENTED); runnory.com (PUBLICLY DOCUMENTED). Confidence: **PUBLICLY DOCUMENTED**.

- **Mechanics:** **Segments** — any named stretch of road/trail becomes its own leaderboard; KOM/QOM (fastest on a segment, stealable); Local Legend (most efforts in 90 days — rewards *consistency*, not speed); Kudos (likes); Clubs + club leaderboards/challenges; monthly challenges (distance/climbing/commute, often sponsored); Year in Sport (Wrapped-style recap); personal-best celebrations; trophy cabinet.
- **Why it retains (the key insight):** Strava decomposes one demotivating global ranking into *thousands of small winnable ones*. A global leaderboard motivates the top 1% and demoralises everyone else (social comparison theory: people compare to similar others). A local KOM is winnable by an average athlete and carries real meaning in their network. Trophy's platform data: repeating (resetting) leaderboards show 3.4× higher competition than perpetual ones; social streaks average 5.7 days vs 4.0 without. Local Legend is the masterstroke: it gives non-elite users a title they can win through *showing up*, not being fastest.
- **Genuine value vs superficial:** segments are genuine — they convert the same route into a competitive course and make training *itself* the game. Kudos are low-cost social glue (visible accountability: "your runs exist publicly"). Sponsored monthly challenges are the superficial end (brand impressions).
- **ASCND cross-reference:** ASCND's community has challenges and a feed, but **no winnable local competition** and **no consistency-title equivalent** (no Local Legend). ASCND *could* do this better than Strava: strength has natural "segments" — a specific lift, a specific template, a gym — and a natural consistency title (most sessions on a given template/exercise in 90 days). This is the highest-leverage social-gamification idea in this report (O-09). It needs no realtime; weekly computed leaderboards suffice.

### 1.6 Other mechanics worth noting

- **Hevy / Strong / Fitbod (strength trackers):** PR celebrations, volume charts, streaks, estimated-1RM trends. Fitbod adds muscle-recovery modelling (50+ muscle groups) and real-time set adaptation; StrengthIQ (App Store listing, PUBLICLY DOCUMENTED) adds transparent rule-based next-session targets, deload weeks planned *before* plateaus, plateau/fatigue alerts, and strength standards (beginner→elite per bodyweight/sex) — a *normative* progression frame ASCND lacks (ASCND shows your own history, never where you stand vs a standard). See O-02, O-03.
- **Garmin Connect (USER-REPORTED):** badge system tied to training data; challenges. Not deeply researched — no distinctive mechanic beyond badges.
- **Zombies, Run! / audio narrative (runnory.com):** story-driven running; niche, high production cost; not recommended for ASCND (see AVOID).
- **Apple Fitness+ Gym Strength (iOS 27.3 beta, PUBLICLY DOCUMENTED via techtimes.com):** 4-week personalised lifting planner, 350+ exercises, weekly targets rewritten from *logged* performance (rules-based progressive overload, not ML). This is the direct competitive threat to ASCND's workout core: Apple now does adaptive lifting plans natively, free with Fitness+. ASCND's answer cannot be "also a plan generator" — it must be the *integration* (plan + readiness + nutrition + Koa + community in one loop). See §6.

### 1.7 What makes a mechanic retain — synthesis (why, not just what)

| Mechanism | Psychological driver | Retains when… | Turns toxic when… |
|---|---|---|---|
| Streak | Loss aversion | The streak = a *healthy* daily action; freezes/pause exist; one miss doesn't erase months | It rewards showing up sick/injured; no grace; streak becomes identity (Duolingo/Peloton 4 AM anecdotes) |
| XP / levels | Progress visibility, competence | XP is a *common currency* across systems; levels are slow enough to matter | XP farmable by junk volume; levels too fast (meaningless) or too slow (hopeless) |
| Leagues / ladders | Social comparison to *similar* others | Groups are small, similar-activity, reset weekly | Global ranking; demotion feels like punishment; pay-to-repair |
| Badges / awards | Collection, identity | Milestones are real (100th session, first pull-up); variety rewarded | Count-only badges; badge spam (a badge for opening the app) |
| Currency + shop | Ownership, investment | Currency buys *self-expression* (outfits, room) not power; prices are earnable | Currency buys advantage; prices force grinding or paying |
| Character growth | Care, attachment | Growth mirrors *real* user effort; character reacts in the work, not just its room | Character is decoration; growth is a number; character guilts the user |
| Social (kudos, teams) | Relatedness, accountability | Visibility is opt-in; support is the default tone | Comparison is the default tone; public failure |
| Challenges | Goal clarity, time-boxing | Time-boxed, opt-in, difficulty-matched | Always-on, mismatched difficulty, FOMO-driven |

**Habit-science guardrail (VERIFIED):** Lally et al. (2010, *European Journal of Social Psychology*): median 66 days to 95% automaticity (range 18–254, n=39 well-modelled of 96 recruited); **missing one day did not materially affect habit formation.** Design implication, stated as a rule: **ASCND must never treat a single missed day as a reset of the user's identity.** Streaks may reset as a counter; the *relationship* (Koa, rank, Gains) must not. This is the scientific basis for freeze/pause/grace design and for the "paused, not lost" return flow (Koa audit R6).

---
