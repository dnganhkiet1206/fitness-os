# Competitor Deliverable 5 — UX and Interaction Pattern Analysis

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w8-competitors-b.md §2 (design language, dashboards/hierarchy/charts, animation/micro-interactions/accessibility). Patterns are drawn from publicly observable behavior only.

## 2. Visual design + interaction quality patterns (§16.2H)

*Scope note: this section is patterns observable from public sources (official blogs, App Store listings, reviews, design write-ups). No app was run by this worker; nothing here is a hands-on UI audit of a competitor.*

### 2.1 Design language — what the leaders converge on

| App | Language (PUBLICLY DOCUMENTED) | What ASCND can learn |
|---|---|---|
| **Apple Health (iOS 27 redesign)** | Insights tab (AI summary updating through the day) + Longevity tab (7 categories vs clinical guidance) + Health Age (single number vs chronological age). Calm, clinical, card-based; data *explained in sentences*, not just charted. | **Sentences beat charts for the daily surface.** ASCND's Today already has SmartNudges; the lesson is to make the *whole* Today read as a sentence-first summary, with charts one tap deeper. Health Age is a single-number long-term identity — ASCND's KoaGains is the analogue but is buried in the room, not on Today. |
| **WHOOP** | Strain / Recovery / Sleep as three coloured scores (green/yellow/red); one number per domain; coaching inline on the metric screen ("why your score dipped"). Dark, dense, data-forward. | **Coaching belongs on the metric screen, not in a separate chat tab.** ASCND's Coach lives in Progress; WHOOP puts the explanation *where the number is*. ASCND's ReadinessCard + TrainingCard are the right surfaces for inline explanation. |
| **Oura** | Rings + readiness score + "Readiness insight messages" that are entry points into Advisor chat. Tone choice (conversational vs direct), check-in frequency control. | **Let the user choose the coach's voice.** ASCND has one coach voice. Tone + check-in frequency are cheap settings with real perceived-personalisation payoff. |
| **Strava** | Feed-first; activity = content; kudos/comments inline; segments as data viz (elevation + leaderboards). | **Your workout data is the content.** ASCND's community feed already does this; the gap is that ASCND's *own* history views don't feel like content (no shareable recap, no Year-in-Sport equivalent — KoaMonthView exists but is not a shareable story). |
| **Peloton** | Class-player polish: granular playback, picture-in-picture, live leaderboard overlay, instructor presence. | **The live session is a stage, not a form.** ASCND's WorkoutView is a logging form; Peloton treats the session as an experience (music, voice, presence). Koa's rest-screen performance is ASCND's closest analogue — it should be treated as the stage, not a timer. |
| **NTC** | Big photography, strong filtering (duration/level/intensity/equipment/format), polished video player. | **Filtering is a feature.** ASCND's exercise library has search + muscle filter; NTC shows filter depth (duration × level × equipment × format) is what makes a large library usable. |
| **Finch** | Soft, warm, hand-drawn; pet is always present but never blocks; partial-progress celebration. | **Warmth without clutter.** ASCND's warm-paper background + Koa is the same instinct; Finch shows the pet must be *present in the work* (check-ins during the day), not confined to a room. |
| **Duolingo** | Flat vector, one shade step max, huge eyes, no outlines; every screen has one job; celebration is full-screen and rare. | **One job per screen; celebrations rare and full.** ASCND's Today hero card "does a lot of jobs at once" (Koa audit §5.1). Duolingo's discipline — one screen, one action — is the fix. |

### 2.2 Dashboards, hierarchy, charts

- **One number, then the why, then the detail.** Every leader shows a single headline score (Readiness, Recovery, Strain, Health Age) with 2–3 contributing factors visible without scrolling, and full charts one level down. ASCND's Today shows readiness + plan + Koa + insight + week strip — the hierarchy is flat; the headline (readiness) competes with five other cards. **Pattern to adopt:** a strict visual hierarchy — Today answers "what should I do today?" in the first viewport, everything else is secondary.
- **Rings are the shared visual language** (Apple Move/Exercise/Stand; ASCND already has them). The differentiator is not the ring, it's what the ring *does* — WHOOP's Strain target is adaptive (changes daily with Recovery); ASCND's ring targets are fixed defaults (300 kcal / 30' / 10k). Adaptive targets are O-04.
- **Charts:** leaders use sparklines inline + full charts on drill-in; drag-to-inspect (StrengthIQ lists this explicitly); trend callouts in words ("cardio fitness trending up"). ASCND has sparklines (AssistantSummaryViews) and WeeklyReview charts — the gap is *worded* trend interpretation on the chart itself, which is exactly what the AI coach should generate (and currently doesn't — K-33).
- **Empty / loading / error states:** the Koa audit praises ASCND's `TodayCoachSection` (loading skeleton, AI-failure fallback from real numbers with source + retry, dismiss rules) as the bar the chat should match. Competitor pattern (PUBLICLY DOCUMENTED, Oura/WHOOP support pages): failed AI = honest "couldn't load" + the deterministic numbers underneath + retry. **ASCND's own best pattern is already the standard; the gap is that it isn't applied uniformly** (coach chat K-06/K-07/K-08, community online-only writes with no offline queue).

### 2.3 Animation, micro-interactions, accessibility

- **Animation as feedback, not decoration:** Duolingo's celebration is full-screen but *rare* (milestone-only); Finch's bird-munching animation lasts seconds and *prevents* rapid-fire checking (friction as design); Peloton's high-five is a one-tap social ack. ASCND's audit found the opposite failure mode: celebrations re-fire (K-05 sticky, K-24 repeat), i.e. animation that lies. **Rule: celebrate once per milestone, ever; animate the *consequence* of an action, not the action's existence.**
- **Haptics + sound as one vocabulary:** WWDC19 session 810 principle (via Koa audit R7) — causality (feedback obviously follows cause), harmony (sound + haptics + visuals one story), utility (only where clear value). ASCND has the assets (55 wavs, haptic data) but they were never composed (K-15 data-dead, K-25 silent chat). Competitors don't publish haptic specs; the principle is the takeaway, not a copy.
- **Accessibility:** Apple's bar is the floor — Dynamic Type to AX5, VoiceOver labels on every control, Reduce Motion equivalents that *preserve information*. ASCND's Koa surfaces have documented gaps (K-42–K-47: fixed fonts, 32/38pt tap targets, Canvas text with no VoiceOver equivalent, peek auto-dismiss 3.2s). No competitor is exemplary here in public sources; the point is that ASCND must not treat a11y as polish — for a mascot that *is* the emotional interface, an unlabeled Koa is an absent Koa for VoiceOver users.

---
