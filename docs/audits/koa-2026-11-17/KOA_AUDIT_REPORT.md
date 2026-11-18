# Koa Audit Report — First Full Audit

- **Audit tip:** `2a904952f8fbcfdaad5cb3157c760bd965e43dff` on `origin/native/ios-rewrite` (repo `dnganhkiet1206/fitness-os`), verified by `git fetch` + `rev-parse` at dispatch and re-verified during synthesis. All file:line references are at this tip.
- **Date:** 17–18/11/2026 (audit run overnight CST; report written 18/11/2026).
- **Mode:** READ-ONLY. No commits, no PRs, no GitHub comments, no code changes. All evidence from `git show` / `git grep` / `git ls-tree` reads, one user-supplied screenshot, and public web research.
- **Standing directives honored:** the RN build is abandoned and was never referenced; no parity work was done; every finding below is stated against the native build only.
- **Companion deliverable:** `KOA_TASKS.md` — 60 implementation task specs, each with all 12 required fields. Finding IDs below (`K-01`…) map to task IDs (`KOA-Txx`) there.
- **How to read evidence labels:** **VERIFIED** = read directly in code at tip. **INFERRED** = deduction from code, basis stated. **UNVERIFIED** = needs a run, a device, or access this audit did not have; the gap and the evidence that would close it are listed in §7.

---

## 1. Capability inventory (Phase 1) — what this audit could and could not do

### Available and used

| Capability | Status |
|---|---|
| Repo read access via `git`/`gh` as `dnganhkiet1206`, branch `native/ios-rewrite` | ✅ Used for all code evidence |
| Linux VM: git, Node v24.22.1, Python 3, `xvfb-run` | ✅ Used |
| Blender 5.2 (`~/workspace/blender-dl/blender-5.2.0-linux-x64/blender`) | ✅ Available; not needed — Koa has no 3D assets (§3.1) |
| Web search + page-text fetch | ✅ Used for Phase 4 research |
| One user-supplied screenshot (Today tab, dark mode, 20:58 CST 17/11/2026) | ✅ Reviewed with human eyes (§5) |
| Five read-only explorer subagents with explicit file scopes | ✅ All completed; claims spot-checked by the coordinator (§2) |

### NOT available — nothing in this report claims otherwise

| Capability | Consequence |
|---|---|
| Swift toolchain / Xcode / iOS Simulator | No build, no test execution, no UI run. All findings are code-level; runtime behavior is marked INFERRED or UNVERIFIED. |
| Physical iPhone / Kiệt's Mac filesystem | No haptics, Live Activity/Dynamic Island, HealthKit, audio, or on-device observation. |
| Live Supabase project (dashboard, function logs, DB) | No verification of deployed migrations, function behavior, RLS, or production data. SQL findings are from migration files in the repo. |
| Running app | No animation was judged visually successful; no fix was verified. |

**Bottom line:** this audit establishes what the code says with high confidence, and states plainly where a run is required before any claim about what users see, hear, or feel can be made.

---

## 2. Method and verification

Five explorers covered: (1) mascot core + economy + claims, (2) animation / 3D / state / performance / error handling, (3) Ask Koa / coach / expressions / sound / haptics, (4) tests / duplicated week logic / docs & mocks / accessibility, (5) external research. Condensed explorer reports are preserved in `working/`.

The coordinator spot-checked decisive claims against code before synthesis. Resolutions:

- **KoaWeekCard path:** only `apps/ios/ASCND/Features/Mascot/KoaWeekCard.swift` exists at tip. Explorer 4's `Today/KoaWeekCard.swift` citation was a mislabel; findings referencing it are filed under the correct path.
- **Coach accept (explorer 4, F16 — was UNVERIFIED): RESOLVED, confirmed with a refinement.** `TodayExtras.swift:744–749`: accepting applies `setLighterWeek` for `.light` only. Accepting `.progress` or `.steady` records the answer and dismisses the card — the overload targets displayed on a `.progress` card are never applied by the accept action. The separate "Tăng tải hôm nay" overload surface is a different flow; the card's own accept button promises application it does not perform.
- **`streakInDanger` dead:** confirmed — definition only at `KoaMood.swift:146`, zero production callers in `apps/ios`.
- **Coach error classification:** confirmed — `SupabaseCoach.swift:104` classifies with `message: ""`; the response body is never read.
- **90s idle timeout:** confirmed — `SupabaseCoach.swift:88,94`, with the failover arithmetic documented in comments at lines 72–79.
- **Unthrottled reaction clock:** confirmed — `KoaReactionView.swift:60` uses `TimelineView(.animation)` with no interval.
- **Sticky `.justClaimed`:** confirmed — `Mascot/KoaWeek.swift:133,144` (correct path: `ASCNDCore/Mascot/KoaWeek.swift`, not `Koa/`); no consume transition exists in the file; celebration re-fires from `TodayExtras.swift:850`.
- **PR #952** (removes the Koa's Week card from Today) was still OPEN with merge state UNKNOWN at synthesis; findings it may resolve are marked "verify after merge".

Overlaps between explorers were de-duplicated into the single finding catalog in §4. Where explorers disagreed or a claim rested on an unread file, the finding is marked accordingly rather than silently resolved.

---

## 3. System inventory — what Koa actually is at tip

### 3.1 Koa is 2D-only — definitive

Negative greps for RealityKit/SceneKit/USDZ/Model3D/RealityView/ModelEntity/ARView/SCNView across `Features/Mascot`, `Today`, `Workout`, and `ASCNDCore` returned **zero matches**. The entire Koa pipeline is 2D vector: `KoaRender.figure()` builds a shape tree → `KoaPaint.plan()` turns it into draw ops → `KoaCanvas.draw` renders into a SwiftUI `Canvas` (`KoaFigureView.swift:501`). The same pipeline feeds the room, bedroom, pull, repair, shop, and widget surfaces. **No Koa character PNG exists.** All 22 `.usdz` files are exercise demos under `Resources/ExerciseDemos/`. 3D exists only in `Features/Exercises/ExerciseDemo3DView.swift` (RealityKit) and never references Koa types. Any future Koa 3D work starts from zero and, per current Apple direction, must be RealityKit/USD from day one (§6).

### 3.2 Koa systems inventoried

| System | Core files | State at tip |
|---|---|---|
| Room / figure rendering | `MascotRoomView.swift` (1,872 lines), `KoaFigureView.swift`, `KoaRender/KoaPaint/KoaMemo/KoaSettle`, `KoaDirector + KoaDirectorDriver`, `StudioLayers` | Working 2D pipeline with partial memoization; per-frame plan rebuild (K-10); three overlapping clocks in the room |
| Emotions / expressions / gestures / talk | `KoaEmotion` (17 emotions), `KoaFlags` (34 expressions × 6 poses), `KoaGesture` (5), `KoaTalk` (23 topics), `KoaMood`, `KoaSchedule`, `KoaPeek` | Large designed vocabulary; 4 emotions unreachable, several expressions unreachable; face/line selectors disagree on Today |
| Reactions / performances | `KoaReaction` (13 scenes), `KoaPerformance` (baked 120 Hz scripts), `KoaReactionView`, `KoaRestScreen` | Dual overlapping storyboard systems; only `.done` runs in production; haptics data-dead |
| Sound | `KoaSound.swift`, 55 wav files (~4.9 MB) | Rich room sound design (21 cues, Animalese/Tom-cat voices, ambience); silent failures; no chat/celebration coverage |
| Economy / claims | `KoaWeek`, `KoaGains`, `KoaQuests`, `QuestObserver`, `WeeklyChallenges`, `MascotShop`, `MascotRoom`, `Awards`, `SupabaseMascot`, 13+ migrations | Server-authority design fundamentally sound; claim contract cannot signal duplicates; races and sticky flags on the client |
| Week logic | `KoaWeek`, `KoaGains.Week`, `KoaWeekCoach`, `TodayController`, `TodayWeekStrip`, `WeeklyChallenges` | Multiple divergent definitions of the same week; Monday-start computed in ≥7 places |
| Ask Koa / coach | `CoachChatView` (1,514 lines), `Coach.swift`, `CoachQuickReply`, `CoachOverview`, `CoachLogPrompt`, `CoachMemory`, `SupabaseCoach` (SSE), `ai-coach` + `ai-coach-memory` edge functions | Feature-rich; silent failure modes dominate: truncation-as-success, dead error classification, missing safety context |
| Tests | 688 tests across 72 files (counted: `@Test` + XCTest `func test…`) | Broad but uneven; zero coverage of `KoaSceneData`, `KoaGainsSync.load`, `cleanKoaRoom`, `StreakMissed.missedDates`; a11y audit tests log-only |

### 3.3 Data flow (economy, traced end to end)

Activity (sessions/logs) → daily signals → `QuestObserver` auto-claims daily quests → `KoaGainsSync.load` replays history into Gains/rank → `KoaWeek` state + claim → weekly challenges seed/measure/claim → server `claim_quest_reward` (shape/window validation → advisory lock → 800/day ceiling → `INSERT … ON CONFLICT DO NOTHING`, returns full amount fresh-or-duplicate) → `mascot_wallet()` balance/XP/claimed keys → spending (`buy_mascot_item`) / wearing (`setWorn`) → rendering + widget. No edge function touches the mascot economy (grep-verified).

---

## 4. Findings catalog

Priority = user impact × technical importance × implementation cost, per the audit brief. **P0** = safety / data-loss / false user-facing truth. **P1** = high user impact or structural risk. **P2** = medium. **P3** = low / polish / dead code / docs. Each finding carries its task ID; full 12-field specs are in `KOA_TASKS.md`.

### P0 — must fix first

| ID | Finding | Evidence | Task |
|---|---|---|---|
| K-01 | Claim contract cannot distinguish duplicates: `claim_quest_reward` returns the full amount for duplicates, so all 4 client paths celebrate twice; ceiling check runs before insert, spuriously rejecting already-claimed keys | `supabase/migrations/20261029130000_koa_quests_v2.sql:122–139` | KOA-T01 |
| K-02 | Coach can recommend allergenic / disliked / diet-violating foods: allergies, dietary preference, disliked foods, water target, fiber target dropped from the profile block sent to the model | `supabase/functions/ai-coach/index.ts` ctx (~341–350); columns exist in `Profile.swift` | KOA-T02 |
| K-03 | Quick reply states "0 kcal / 0 g protein" as eaten when nothing is logged — contradicts the server's null-is-not-zero rule; same flaw in `CoachOverviewCheck` | `CoachQuickReply.swift` `overview()`; `CoachOverviewCheck.swift` | KOA-T03 |
| K-04 | Load-factor promise displayed but never applied: card shows "−20%/−10% load" after long breaks, but accepting a light week only removes one set at the same weight. Safety-relevant. | `KoaWeekCoach.swift:32–36`; `KoaWeekCoachCard.swift:128–129`; `LighterSession.swift:3–5` | KOA-T04 |

### P1 — high impact

| ID | Finding | Evidence | Task |
|---|---|---|---|
| K-05 | Sticky `.justClaimed` re-fires the +50 celebration on every Today reload; no consume transition. Coins are not duplicated (server dedups) but the celebration lies. | `ASCNDCore/Mascot/KoaWeek.swift:133,144`; `TodayExtras.swift:850` | KOA-T05 |
| K-06 | Truncated SSE stream treated as success; no retry, no stop, no resume; zero-event stream sets no failure; partial answer shown but never saved | `SupabaseCoach.swift` stream loop; `Coach.swift` `send` ~233–290; `CoachChatView.swift:324` | KOA-T06 |
| K-07 | Error classification can never produce quota/overload: body never read, `message: ""` always | `SupabaseCoach.swift:103–104`; `EdgeFunction.swift` `classify` | KOA-T07 |
| K-08 | Ask Koa entries vanish silently when the probe fails; no explanation, no retry; stale "deployed" never re-probed; 500/429 count as deployed | `AppServices.swift:422–460`; `TodayExtras.swift:242,517`; `RootTabView.swift:75,88` | KOA-T08 |
| K-09 | 90 s idle timeout mislabels slow AI as "offline" and is shorter than worst-case server failover (~180 s+); reasoning before the answer mark can trip it (INFERRED) | `SupabaseCoach.swift:88,94`; `_shared/ai.ts` `callAI` | KOA-T09 |
| K-10 | Every animated Koa frame rebuilds the whole figure plan; no frame-level cache; pipeline runs twice per frame when `armsFront`. Magnitude INFERRED (no Instruments run possible). | `KoaFigureView.swift:203–218`; `KoaRender.swift:715–726`; `KoaPaint.swift:592–596` | KOA-T10 |
| K-11 | Unthrottled nested `TimelineView`s in reaction/rest/repair/pull scenes; no lifecycle gating; outer room timeline re-evaluates the whole room at display rate; repair shot computed twice per tick | `KoaReactionView.swift:60,96–100,146–151`; `KoaRestScreen.swift:128`; `MascotRoomView.swift:176–203` | KOA-T11 |
| K-12 | Gaze/face/clock state mutated during view evaluation; `KoaIdleLife.step` is non-idempotent (consumes gaze/RNG state) | `KoaSettle.swift:88–92`; `KoaFigureView.swift:116–132,335–348` | KOA-T12 |
| K-13 | Streak-danger state is dead: `streakInDanger` has zero callers, `.worry` and the worry line can never appear — at the highest-value nudge moment | `KoaMood.swift:146`; `KoaToday.swift` `.worry` branch | KOA-T13 |
| K-14 | Face and spoken line come from different selectors on Today and can contradict each other; compact layout collapses informative states (tired/worry) to idle while the widget keeps the true mood | `TodayDayBlock.swift` face vs `MascotLine.swift`; `compactEmotion` | KOA-T14 |
| K-15 | Storyboard haptics are data-dead: `Cue.haptic` values are written and forwarded but never read; rest/record/set/done beats have sound but no vibration; the only rest haptic fires 1 s overdue | `KoaReaction.swift`; `KoaPerformance.swift`; `KoaReactionView.fire()`; `KoaRestScreen.fire()`; `ASCNDApp.swift:25` | KOA-T15 |
| K-16 | Transient server errors with codes are never retried; `QuestObserver` retries ALL failures including permanent refusals on every read; ledger failure triggers spurious re-claims of old rewards | `KoaQuests.swift:92–97`; `SupabaseMascot.swift:224–240`; `QuestObserver.swift:98–110,151–182` | KOA-T16 |
| K-17 | No in-flight guards: concurrent `KoaWeekBook` claims interleave; concurrent room loads regress state; partial load failures keep stale values silently; claim failure UI has static text, no retry button | `KoaWeek.swift:126–169`; `MascotRoom.swift:235–281`; `KoaWeekCard.swift:47–50,162–165` | KOA-T17 |
| K-18 | Buy path races: already-owned check runs before the advisory lock (concurrent double-buy raises raw 23505, unmapped); buying equips server-side while unequipping conflicts is swallowed best-effort, leaving two items equipped per slot | `20260815120000_economy_server_authority.sql:83–102`; `MascotShop.swift:467–468` | KOA-T18 |
| K-19 | `setWorn` is two non-atomic UPDATEs; the second result is discarded; optimistic restore can clobber fresh data; conflicting-item failures swallowed | `SupabaseMascot.swift:279–303`; `MascotShop.swift:476–500` | KOA-T19 |
| K-20 | "One event" is false: KoaWeek completion ≠ Gains full-week bonus. Walk-only days, 7th consecutive days, pauses, and no-plan weeks diverge; header promise, summary, and state disagree | `KoaWeek.swift:7–15,44–97`; `KoaGains.swift:320–371`; `TodayController.swift:234` | KOA-T20 |

### P2 — medium

| ID | Finding | Evidence | Task |
|---|---|---|---|
| K-21 | Monday-start computed in ≥7 places; `Water.weekStart` is a different semantic (rolling 7-day window) under the same name; `TodayWeekStrip.days` duplicates `KoaWeek.days` line-for-line (may be resolved by open PR #952 — verify after merge) | `WeeklyChallenges.swift:41–42`; `KoaGains.swift:394`; `TodayPlanHero.swift:381–388`; `Water.swift:189–191` | KOA-T21 |
| K-22 | Three different nil-library behaviors; two different "trained" sources feed week views; moved-session target vs planned-days mismatch | `KoaWeek.swift:44–57`; `TodayPlanHero.swift:381–388`; `WorkoutHome.swift:17–22`; `TodayController.swift:227–234`; `KoaGains.swift:439–505` | KOA-T22 |
| K-23 | Week-coach card: last-week state not pause-adjusted (paused weeks read as "missed"); card vanishes during pause; documented pause trigger missing from `decide()`; accepting `.progress`/`.steady` applies nothing (verified, §2) | `TodayExtras.swift:744–749,774–780`; `KoaWeekCoach.swift:42–49` | KOA-T23 |
| K-24 | Weekly-challenge seeding failure is sticky; Today focus checks never seed, so users who never open Challenges get no challenges/rewards from Today; progress writes coupled to reward success, so failed writes cause repeat celebrations | `WeeklyChallenges.swift:298–309,348–364,404–440`; `TodayExtras.swift:554–566` | KOA-T24 |
| K-25 | No sound or haptic anywhere in Ask Koa/chat; claim/level-up/celebration feedback is haptic-only outside the room and the celebration overlay has no Koa at all (its own header admits it) | `CoachChatView.swift`; `CelebrationOverlay.swift`; `CommunityChallengesView.swift:287–288,538–539` | KOA-T25 |
| K-26 | Rest-screen pause desync: performance clock is wall-clock while the timer freezes, so Koa's performance advances during pause and can jump on resume (INFERRED from the two clocks) | `KoaRestScreen.swift` `elapsed` vs `pausedLeft`; `RestTimerController.swift` | KOA-T26 |
| K-27 | Rest/Live Activity Koa is static; `hidesKoa` can remove Koa from the lock screen entirely; lock-screen rest diverges from the animated in-app rest (INFERRED) | `RestActivityContent`; `RestTimerController.swift` | KOA-T27 |
| K-28 | `KoaSound` fails silently (missing files/unmatched cues, no log; volume ignored for talk cues; orphan `koa-rx-ring.wav`); toggle lives only in the room; no interruption/route-change handling found; audio session reconfigured on every play | `KoaSound.swift:75–88`, `load`/`voice`/`cue`; `MascotRoomView.swift` toggle | KOA-T28 |
| K-29 | Expression vocabulary far larger than the reachable set: `.sad`, `.curl`, `.coat`, `.worry` have no production selector; `.plead` reachable via talk faces while a test asserts no emotion state uses it | `KoaEmotion.swift`; `KoaFlags.swift`; `KoaTalk.swift` `face(.emptyLate)` | KOA-T29 |
| K-30 | Cross-surface incoherence: schedule phases (pump/waiting) apply only on Today though the header claims room + widget too; coach card always `.proud` even for deload weeks; non-Koa mascots always neutral and selection honored at only 3 sites | `KoaSchedule.swift`; `TodayDayBlock.swift:265–281`; `KoaWeekCoachCard.swift`; `KoaFigureView.swift` `MascotFigureView` | KOA-T30 |
| K-31 | Failed `learn()` is silently dropped forever (optimistic marking + swallowed errors + no retry); memory quota is claimed before the gateway call, so closing short chats burns quota | `Coach.swift` `learn()`; `ai-coach-memory/index.ts:264–270` | KOA-T31 |
| K-32 | Memory view hides unknown-kind facts (invisible, individually undeletable) while the server sends all kinds to the model — visible set ≠ used set | `CoachMemory.swift` `groups()`; `ai-coach/index.ts` memory block | KOA-T32 |
| K-33 | Coach context gaps: `streak_days` capped at 7; no water data and no per-day steps despite prompt examples; only the first validated check is sent; no plan, meals, readiness components, or Koa state | `ai-coach/index.ts` (~232–350, `checkBlock`) | KOA-T33 |
| K-34 | Chat input understanding: thanks-intent ordering can swallow questions (INFERRED); question flag ignored for sleep/water/weight (INFERRED); instruction-leak guard can nuke whole legitimate answers and number-less conflict replies dead-end; kg-only weight, hour-only sleep | `CoachQuickReply.swift`; `CoachLogPrompt.swift` | KOA-T34 |
| K-35 | Overview block: unclosed fence drops the tail permanently (including the required direct answer); only the first block renders | `CoachOverview.swift` `split`/`parse` | KOA-T35 |
| K-36 | Language incoherence: answer prompt uses app language, disclaimer uses detected message language (INFERRED); health disclaimer is word-list based and only shows on the last assistant message | `CoachChatView.swift` `chatLanguage`; `CoachHealthTopic.swift` | KOA-T36 |
| K-37 | Server prompt hygiene: hostility filter checks only the last message with an opaque refusal (benign "ignore my previous message" can be blocked, INFERRED); Spanish prompt built by global string replacement over user data (INFERRED corruption); `CoachStream` default drops checks/waterUnit | `_shared/scope.ts`; `_shared/ai.ts` `forSpanish`; `Coach.swift` default extension | KOA-T37 |
| K-38 | Coach history: `open()` and reload fail silently; delete has no confirmation | `Coach.swift` `open()`/`loadHistory()`; `CoachChatView.swift` history sheet | KOA-T38 |
| K-39 | Dual storyboard systems + duplicated rest rendering; scripts and sound entries remain for removed scenes (`restSide`/`restShoulders`/`restJog`); only `.done` runs in production | `KoaReaction.swift` `shots()`; `KoaPerformance.swift`; `KoaRestScreen.swift` | KOA-T39 |

### P3 — low / polish / dead code / docs

| ID | Finding | Evidence | Task |
|---|---|---|---|
| K-40 | Duplicated line formatting (`KoaToday.line` vs `KoaTalkLine`); dead `TodayDayBlock.bubble()` and `TodayTube` (zero call sites); same `KoaState` rebuilt 3× in `TodayDayBlock` | `KoaToday.swift`; `KoaTalkLine.swift`; `TodayDayBlock.swift:369` | KOA-T40 |
| K-41 | Prices/rules duplicated across Swift constants and SQL seeds (values spot-checked matching at tip); checker scripts exist only under `native/tools/`, CI coverage unverified; app never reads the price tables | `MascotRules.swift`; `KoaQuests.swift:60–70`; `MascotShop.swift:123–244`; train-loop/quests/economy migrations | KOA-T41 |
| K-42 | `KoaReactionView`: zero accessibility support; white flash not Reduce-Motion-gated; skip is plain text; 7 fixed fonts | `KoaReactionView.swift:53–56,84,87,95,99` | KOA-T42 |
| K-43 | `KoaRestScreen`: forced dark + 12 fixed fonts, no Dynamic Type (labels/identifiers are good) | `KoaRestScreen.swift:94–97,171,181–338` | KOA-T43 |
| K-44 | Room forces color scheme over the whole subtree (day/night follows time, not user choice); room poke disabled under Reduce Motion, contradicting the figure component's own contract | `MascotRoomView.swift:205,1713,1719`; `KoaFigureView.swift:36–38` | KOA-T44 |
| K-45 | Fixed fonts violating the DS "no fixed sizes" rule across Koa views; `KoaBubble` fixed 15pt + capped Dynamic Type + fixed frame (clipping INFERRED); `TellKoaSheet`: zero identifiers, 45 fixed fonts; comeback "later" button below 44pt | `KoaWeekCard.swift:15`; `KoaTalkLine.swift:63,70`; `TellKoaSheet.swift`; `KoaComebackView.swift:49–51` | KOA-T45 |
| K-46 | Shelf tap targets 32/38pt (motor-access gap, VoiceOver covered by stage actions); peek auto-dismisses in 3.2 s with no VoiceOver extension; Canvas-drawn dust/repair text has no VoiceOver equivalent (INFERRED) | `MascotRoomView.swift:1544–1557`; `KoaPeekHost.swift:21,95–100` | KOA-T46 |
| K-47 | Accessibility audit tests log issues but never fail; Room/Shop/Rest/Reaction/Coach uncovered | `KoaAccessibilityAuditTests.swift:3–8,89–100` | KOA-T47 |
| K-48 | Animation lifecycle: `.id(emotion)` destroys/recreates Today figure state on every mood change; mid-flight retriggers (KoaPop, nod, delayed speech) lack coalescing (INFERRED); sleep-then-act tasks ignore cancellation; `KoaReactionGate.waitIdle()` has no timeout | `TodayDayBlock.swift:291–298`; `KoaLive.swift:57–82`; `KoaReactionView.swift:25–28` | KOA-T48 |
| K-49 | Render perf follow-ups: shop preview rebuilds the full scene plan in `body`, bypassing the `StudioPlans` cache; widget rendering on the main actor (2 avatar 3× + 3 rest 2×); per-frame calendar work + full-history scans on Today evaluation | `ShopSceneView.swift:74`; `KoaWidgetPublisher.swift:135–167`; `MascotRoomView.swift:1671–1672`; `KoaJourney.swift:279` | KOA-T49 |
| K-50 | Room speech burns a topic for the day when its numbers are missing (mark-said before line resolution); ten `koa-talk-*.wav` files are byte-identical duplicates (~60 KB) | `KoaDirectorDriver.swift:365–385`; `Resources/Sounds/` | KOA-T50 |
| K-51 | Welcome-grant fallback ledger read has no order/limit and can re-celebrate the 300-coin welcome; `welcomeTried` resets on any error | `SupabaseMascot.swift:26–37`; `MascotRoom.swift:372–384` | KOA-T51 |
| K-52 | Gains history capped at 2000 rows silently lowers Gains for long-term users; sessions/overload reads are non-atomic; overload failure publishes a degraded state | `KoaGains.swift:432–438,459–492` | KOA-T52 |
| K-53 | Economy error mapping relies on substring matching of SQL message text; named failures lose SQLSTATE; `cleanKoaRoom` RPC and ledger mapping untested | `SupabaseMascot.swift:224–240`; `MascotRoom.swift:392–395` | KOA-T53 |
| K-54 | Economy edge sweep: unbounded `claimed` list via `clean:`/`freeze:` keys; awards grant-once flag set before outcome known; room week summary shows "claimed" when merely complete; 14-day catch-up window with zero slack on Mondays; community ceiling counts explore coins, quest ceiling does not; pause `active` ignores start date and clamps long spells | Migrations + `Awards.swift:361–364`; `MascotRoomView.swift:704–719`; `TodayExtras.swift:844–847`; `KoaPause.swift:26` | KOA-T54 |
| K-55 | Five overlapping duplicate-tracking mechanisms, none shared; server UNIQUE is the only true dedup | `KoaWeek.swift:122`; `AppServices.swift:616,644–657`; `QuestObserver.swift:55–57`; `MascotRoom.swift:37–43` | KOA-T55 |
| K-56 | Dead economy surface: streak bonus unreachable (`autoClaimStreak` never called, `claimStreakBonus` zero callers); streak-freeze catalog entry with no consumers; `WeeklyChallengesBook` built/passed but never rendered. **Needs Kiệt's decision: delete or restore.** | `MascotRoom.swift:335–350`; `MascotShop.swift:219–224`; `TodayExtras.swift:399` | KOA-T56 |
| K-57 | Rank gates are client-only (modified client can buy rank-locked items); `MascotShopBook.gains` can stay stale at rank 0, showing false locks for a whole room visit. **Needs Kiệt's decision on client-only gates.** | `MascotShop.swift:82–90,327–331,417`; `MascotRoomView.swift:98` | KOA-T57 |
| K-58 | Superseded mocks contradict current behavior: `koa-train-loop.html` / `koa-wave2-schedule.html` propose decay (pump loss, rank drop) that was removed 21/10; code has no decay ever | Mocks vs `KoaGains.swift` header; `CONSTRAINTS_AND_DEFERRED.md:102` | KOA-T58 |
| K-59 | Hardcoded Vietnamese cue titles; localization by string equality (fragile); ring shows fixed "1:30" regardless of actual rest duration | `KoaPerformance.swift` titles; `KoaRestScreen.swift` `title()`; `KoaReactionView.swift` `ring()` | KOA-T59 |
| K-60 | Untested seams: zero test references for `KoaSceneData`, `KoaGainsSync.load`, `cleanKoaRoom`, `StreakMissed.missedDates`; zero `KoaWeek` tests pass `paused:`; `KoaMomentFeed`/analytics claims in `KOA_ECOSYSTEM.md` unverified | Test grep inventory (§3.2) | KOA-T60 |

### What is genuinely good (verified contrast cases — do not regress)

- **Server-authority economy design:** server pricing, advisory locks, UNIQUE dedup, shape/window validation, revoked anon access. The flaws are in the contract edges, not the architecture.
- **`TodayCoachSection` (SmartNudges):** loading skeleton, AI-failure fallback from real numbers with source + retry, dismiss rules, reload on refresh/day-change/foreground. The chat should match this bar.
- **Server AI failover** (`_shared/ai.ts` `callAI`): 3 providers × 3 attempts on 503, 20 s header-only timeout, per-provider abort controllers. The client timeout is the weak side, not the server.
- **`stripBeforeMark` + `refusalStream`:** held content flushes verbatim at `[DONE]`; refusals are proper SSE with `[DONE]`.
- **Room sound design:** 21 cues, Animalese/Tom-cat voices, day/night ambience, footstep throttling, per-cue volumes, mix-with-others. The gap is coverage, not quality.
- **`KoaTalk` face+line pairing** with schedule caps — the model Today should follow.
- **Mitigations already in place:** `StudioPlans` 96-entry FIFO, `KoaMemo`, baked-frame cache (cap 8), off-screen/background gating, 30/60 fps adaptivity, `.task(id:)` cancellation in wake/bed/dress paths, single-flight guards on claiming/buying/wearing, widget `imageKey` guard, `CelebrationOverlay` / `KoaPauseViews` / `RankJourneyView` accessibility patterns, `DSButton` 50pt minimum, `TodayPlanHero` `@ScaledMetric` + 44pt targets.

---

## 5. Visual / human audit (Phase 3)

### 5.1 The screenshot — judged as a real user

Source: `~/workspace/user/files/8F40A068-38D9-4791-9D43-B8F0089AAF7A-photo-D8925177-7C90-4C11-B3F1-BF08EB316316.jpg` — Today tab, dark mode, 20:58, sent by Kiệt with "Koa week hình như trùng với workouts". One still frame; scroll, animation, and padding behavior could not be judged from it and are in the checklist below.

What the eye sees, top to bottom:

1. **"Start workout" hero card** (partially visible): "Do the full session", "Review the week", "Take a few days off..." — the hero is doing a lot of jobs at once.
2. **KOA'S WEEK card:** "0/7 SESSIONS", Mon–Sun pills with Tue outlined, "+15 Gains · +50 coins", then three paragraphs of explanation plus a legend plus rules. As a user: this card *reads like documentation*, not a glanceable widget. The copy says rest days don't count, yet all 7 days render as "planned" with 0/7 — the visual and the words disagree at first glance. (Kiệt already chose removal from Today; PR #952 open. The card itself still lives in the room — the text-heaviness finding travels with it.)
3. **ASK KOA card:** a static 2D koala illustration with a speech bubble containing "..." and the line "Talk to Koa about today." As a user: the "..." bubble reads as *loading* or *thinking*, not as an invitation — on a card whose whole job is to invite a tap. The subtitle is partially obscured by the floating tab bar in this frame, and the chevron button overlaps the speech bubble. Both may be scroll-position artifacts of one still — they must be checked on a simulator at rest, not assumed fixed or broken.

Overall impression from this one frame: Today is information-dense and Koa's presence on it is *decorative* — a static illustration and a text-heavy card — rather than *alive*. Nothing in the frame shows Koa reacting to the user's day. That matches the code finding: the richest Koa life (talk, gestures, sound, director) lives in the room, while the home surface gets a static figure and independently-computed face/line pairs (K-14).

**No animation was judged.** No Koa animation was observed running in this audit. Any claim about whether Koa's motion looks good, smooth, or premium would be fabrication from file existence. The checklist below is the instrument for that judgment.

### 5.2 Mocks and docs vs code

- `koa-rank-tiers.html` matches code exactly (51 Gains/week, tier counts, thresholds). `gd2-progress-koa-week.html` matches except for the later pause adjustment. `koa-logging-milestones`, `koa-logging-rhythm`, and `koa-month-recap` ("for approval") are implemented.
- `koa-train-loop.html` and `koa-wave2-schedule.html` are **superseded and misleading**: they propose decay mechanics (pump loss after 3 missed days, rank drop after 7 days) that contradict the 21/10 no-decay decision and the code. See K-58.
- `KOA_ECOSYSTEM.md` claims about `KoaMomentFeed`/analytics were **not verified** against code in this audit.
- `KOA_TECHNICAL_AUDIT.md`, `KOA_V2_SLICE.md`, `DUOLINGO_RESEARCH.md`, `ENGAGEMENT_RESEARCH.md`, and the `koa-v2` gallery READMEs were not fully read; 8 of 15 mocks were text-swept only. A follow-up read may surface further doc/code drift.

### 5.3 Simulator visual-inspection checklist (for the local agent)

Rules: capture before/after for every item that changes visuals; record with the device clock visible; state the exact build (commit SHA) in each capture set. Do not mark any item "looks good" without a capture.

**Today tab**
- [ ] V1. Today at rest, dark + light: is the Ask Koa subtitle fully visible above the floating tab bar? Does the chevron overlap the speech bubble? Capture both themes, scrolled to top.
- [ ] V2. Ask Koa card: does the "..." bubble read as loading? Capture; note first-impression reading.
- [ ] V3. Koa's Week card (room, after #952): text density at default and AX3/AX5 Dynamic Type — any clipping in the 3 paragraphs, legend, rules?
- [ ] V4. Face/line pairs across scripted states (morning rested, morning tired <6h sleep, post-workout, overate, all-quests-done, streak at risk): capture face + line together; note any contradiction (K-14).
- [ ] V5. Compact layout with tired/worry states: is the informative face visible or collapsed to idle? (K-14)
- [ ] V6. Emotion transitions: record 3 mood changes; watch for bob-phase jumps / state resets (K-48, `.id(emotion)`).
- [ ] V7. Reduce Motion ON: Today entrance, press states, Koa figure — what still moves? (K-44, §4 F15 in explorer 2)

**Room**
- [ ] V8. Idle for 2 minutes, uninterrupted: breathing, blink, ear twitch/glance/weight shift — does Koa look alive or frozen? Record full 2 min.
- [ ] V9. Room speech: first line timing (~2 s), 26 s gap, max 3/visit; number-dependent topics with slow signal load — do topics get burned silently? (K-50)
- [ ] V10. Gestures: cheer/taDa/pout/flop/curious triggers — record each; note mid-flight retrigger behavior on rapid taps (K-48).
- [ ] V11. Poke zones (head/ear/nose/face/belly/feet/body): does each respond? Under Reduce Motion, does poke still fire without motion? (K-44)
- [ ] V12. Day/night: room at daytime with system Dark Mode, and at night with system Light Mode — does the forced color scheme look wrong? (K-44)
- [ ] V13. Shelf: tap targets — can each cup/frame be tapped reliably with a thumb? (K-46)
- [ ] V14. Dust/repair scenes: is Canvas-drawn text informative or decorative? VoiceOver pass. (K-46)
- [ ] V15. Sound toggle: room toggle on/off; background music playing — does Koa audio duck/mix correctly? Incoming call during ambience — pause/resume? (K-28, device only)
- [ ] V16. Non-Koa mascot selected: audit every surface — which figure appears, does its mood change? (K-30)

**Reactions / rest / celebrations**
- [ ] V17. Rest timer full cycle: intro → activity → "LƯỢT MÌNH!" beat → end. Record; check beat timing, titles in en/es (K-59), ring duration correctness, haptic at each beat on device (K-15).
- [ ] V18. Rest pause mid-activity window: pause, wait 10 s, resume — does Koa jump beats? (K-26)
- [ ] V19. Workout summary reaction (`.done`): record; check white flash under Reduce Motion (K-42), VoiceOver announcement, skip control.
- [ ] V20. Claim a challenge reward + trigger a level-up: is there a Koa face + sound + haptic together? (K-25, device for haptic/sound)
- [ ] V21. Live Activity / Dynamic Island during rest: beat-boundary updates? `hidesKoa` behavior? (K-27, device only, 14 Pro+ hardware)
- [ ] V22. Peek overlay: appearance, 3.2 s hold, VoiceOver persistence. (K-46)

**Chat / Ask Koa**
- [ ] V23. Send → stream → complete: any send tick / arrival cue? (K-25, device)
- [ ] V24. Airplane mode at launch: do Ask Koa entries vanish silently? Restore connectivity: do they return without relaunch? (K-08)
- [ ] V25. Stream cut mid-answer (proxy/airplane toggle): failure UI? Retry? Is the partial answer still there after leaving and re-entering? (K-06)
- [ ] V26. App language Vietnamese, question in English: answer language vs disclaimer language. (K-36)
- [ ] V27. Health-topic multi-turn conversation: does the disclaimer persist? (K-36)
- [ ] V28. Fresh account, nothing logged: ask "how many calories did I eat?" — is the answer "not logged" or "0"? (K-03)

**Accessibility sweep**
- [ ] V29. VoiceOver full pass: room, shop, rest, reaction, coach card, comeback view. Note unlabeled controls and missing announcements.
- [ ] V30. Dynamic Type AX3 and AX5: Today, room, rest screen, Koa bubble, week card — clipping check with captures. (K-43, K-45)
- [ ] V31. Reduce Motion full pass: every Koa surface — motion replaced by crossfade/static equivalents with information preserved? (K-42, K-44)

**Performance (Instruments, device)**
- [ ] V32. Room idle + animated figure: frame time / CPU before and after the plan cache (K-10); signpost "figure" counts.
- [ ] V33. Reaction/rest scenes: energy + frame rate with throttled clocks (K-11).
- [ ] V34. Widget refresh after key change: main-thread hang detection (K-49).

---

## 6. External research (Phase 4) — principles, not copies

Full sourced notes: `working/research-external.md`. Every idea below is a *principle extracted* from the source; none is a directive to copy a competitor. "Why ASCND" is checked against the native code findings above.

| # | Principle | Source | Why it applies to Koa |
|---|---|---|---|
| R1 | One state machine drives the companion (idle / listening / speaking / celebrate / rest / encourage), fed by app-state inputs, interruptible by user action | Duolingo character state machines (Rive): blog.duolingo.com/world-character-visemes; rive.app/docs/runtimes/apple/state-machines | Koa's face/line/gesture/talk selectors are parallel systems that disagree (K-14, K-29, K-30). A single state machine with app-state inputs is the architectural fix for the whole class, not one more selector. Rive is the best-fit runtime for a reactive 2D companion; Lottie is one-shot only; Spine is likely overkill for a flat koala. Licensing/pricing/maintenance NOT verified — confirm before adoption. |
| R2 | Design the idle first: breathing at the silhouette, blink, one trailing secondary element, randomized variation; judge by watching 2 minutes; distinct sleepy night / low-readiness idle | blog.makko.ai/idle-animation-that-does-not-look-dead | Koa's idle is the most-seen animation in the app and was never observed running in this audit (V8). Idle quality is the highest-leverage animation investment. |
| R3 | The companion reacts *inside the work*, with distinct reactions per outcome — not only in its own room | Duolingo: blog.duolingo.com/building-character | Koa's life is room-concentrated; chat, celebrations, and claims outside the room are silent/still (K-25). Distinct reactions per outcome (PR, week complete, comeback) map directly onto existing reaction scenes. |
| R4 | Growth + story returns for real care; minimum days count; you care for the pet by caring for yourself | Finch: finchcare.com/about-finch | Koa's growth (Gains/rank) already ties to real care; the returns (room speech, comeback) are where story can live. Finch internals NOT verified — principle only. |
| R5 | The companion mirrors bodily state visibly; rest reads in-character, never as failure | Pokémon Sleep; Garmin watch-face reporting (secondary, NOT verified from Garmin) | Koa already has the mood engine; the gaps are the dead worry state (K-13) and the missing readiness/sleep mirroring on surfaces other than Today. A koala resting is in-character — the product should lean into it, never guilt. |
| R6 | Weekly consistency + grace/freeze as insurance + "paused, not lost" return flow; missing one day barely affects habit formation; no disappointed/guilty companion | Lally et al. via secondary summary (pocket-fit.app); streak-anxiety social listening via secondary essays (getchonky.app, ogamic.com); habitkit.club/duolingo patterns | Directly relevant to K-23 (pause handling), K-56 (freeze dead/alive decision), and the character law: Koa is never angry/guilty/ill because the user rested. Statistics are directional, not quotable — secondary sources only. |
| R7 | One composed audio-haptic vocabulary per moment: causality (feedback obviously follows cause), harmony (sound + haptics + visuals one synchronized story), utility (add only where clear value); Ambient session respecting Silent mode; success pattern never reused for failure | WWDC19 session 810 (verified transcript); HIG Playing Haptics/Audio via mirrors only (canonical pages NOT fetched) | Koa has the sound design and the haptic data but they were never composed: haptics data-dead (K-15), chat silent (K-25), toggle undiscoverable (K-28). The fix is composition, not more assets. |
| R8 | Reduce Motion equivalents preserve information; full celebrations only for rare milestones (~500–1000 ms, once per milestone) | Apple reduced-motion evaluation criteria; euleinstitute.com UI animation guidance | Koa's Reduce Motion handling is inconsistent (K-42, K-44) and celebrations re-fire (K-05). Both findings are instances of this principle. |
| R9 | Future 3D must be RealityKit/USD from day one (SceneKit soft-deprecated per WWDC25 session 288 transcript mirror — NOT verified on developer.apple.com); expressions via blend shapes, animation-graph state machines | WWDC25 288 + WWDC24 10102 (transcript mirrors) | Koa is 2D-only (§3.1). If Kiệt ever wants Koa 3D, the state-machine model from R1 transfers; no SceneKit investment should be made. This is a direction note, not a task — no 3D task is proposed in this audit. |
| R10 | Disney's 12 principles: volume-preserving squash/stretch, anticipation, follow-through/overlap, secondary action, timing | Thomas & Johnston via cada-edu.com | A round koala is ideal for gentle squash/stretch; one squash moment per celebration. Applies to the idle/celebration craft work that must be judged on a simulator (V8, V19–V20), not to any code finding directly. |

**Research caveats (stated plainly):** canonical Apple HIG pages were not fetched (mirrors only); SceneKit deprecation wording not verified on developer.apple.com; Duolingo sound spec is a third-party study; Garmin behavior is secondary news; streak statistics are secondary summaries; Rive/Spine/Lottie pricing, licensing, and maintenance were not inspected; Finch internals were not verified. Re-verify any of these before acting on them.

---

## 7. What could NOT be verified — and what would close each gap

| # | Gap | Evidence / access needed |
|---|---|---|
| G1 | All runtime behavior: animations, face rendering, talk timing, peek/celebration motion, rest-beat visuals, VoiceOver, dark mode, Dynamic Type clipping | Mac + Xcode + simulator run (layout/navigation/logic/a11y/dark mode); checklist §5.3 |
| G2 | Haptics feel; whether storyboard haptics truly never fire at runtime (code-level only); Live Activity/Dynamic Island behavior | Real device (14 Pro+ for Island); device runs V17, V20–V21 |
| G3 | Sound audibility, mixing, bundle membership of the 55 wavs (repo presence + whole-directory sources make bundling LIKELY, inferred, not verified); interruption behavior | Built `.app` bundle listing + device run with sound on/off, silent switch, room toggle, incoming call |
| G4 | Frame times / CPU / GPU / battery for K-10, K-11, K-49; whether multi-evaluation per timestamp actually occurs (K-12) | Instruments on device + "figure" signposts + DEBUG counters |
| G5 | SSE end-to-end: probe verdicts, quota/overload payloads, truncation, 90 s timeout, provider failover timing | Supabase project access (dashboard + function logs) + staging runs with scripted failures |
| G6 | Live Supabase state: which migrations actually ran, RLS on `weekly_challenges`/`awards`, deployed function list, production data shapes | Supabase dashboard / schema dump / SQL access |
| G7 | Race outcomes (concurrent claims, overlapping loads, double-buy): interleavings are inferred from missing guards, occurrence not observed | Failing/delayed fakes in unit tests + staging concurrency tests (specified per task) |
| G8 | Renderer behavior with two items equipped in one slot; full schema beyond checked columns; `KoaSceneData` blob contents / 360° angles; `KoaMomentFeed`/analytics claims | Targeted code reads + simulator runs (multi-equip); schema dump; parse `KoaSceneData` / read `gen-koa-scene.mjs` |
| G9 | Unread ranges: `KoaSound.swift:180–308`, `StudioLayers.swift:260–540`, parts of `AppServices`/`ShopView`, most of `KoaDirector`, `KoaGaze`/`KoaDustScene`/`KoaRepairScene`, `KoaLive`, `KoaWeekCard` internals beyond excerpts, `CoachChatView:859–1418` (markdown renderers), `_shared/{readiness,progress,sleep}.ts`, full `KOA_TECHNICAL_AUDIT.md` / `KOA_V2_SLICE.md` / research docs, 8 mocks swept only | Follow-up targeted reads at the same tip |
| G10 | Exhaustive per-expression reachability (34 cases): greps covered main selectors; per-expression audit not completed | One exhaustive grep pass per expression + a test asserting each reachable expression has a selector (KOA-T29) |
| G11 | Whether `koa-talk-*` duplicate wav names are all referenced; `waitIdle()` callers; `autoClaimStreak` reachability beyond the zero-caller grep | Grep + build/bundle audit (KOA-T50, KOA-T56) |
| G12 | Price-checker scripts under `native/tools/` (existence verified, contents unread) and their CI coverage | Read the scripts + CI workflow inspection (KOA-T41) |

---

## 8. Priorities and challenges to assumptions

**Do first (P0, 4 tasks):** the claim contract (K-01 — every celebration in the app rests on it), the two nutrition-truth fixes (K-02, K-03), and the load-factor promise (K-04). These are the only findings where the app can actively mislead or endanger the user.

**Do next (P1, 16 tasks):** make the coach recoverable and honest (K-06–K-09), stop the per-frame rebuild and unthrottled clocks (K-10–K-12), revive the dead emotional core (K-13, K-14), close the haptic loop (K-15), harden claims/buying/wearing (K-16–K-19), and settle the one-week-definition question (K-20).

**Challenges to standing assumptions, where evidence supports a better direction:**

1. **"More Koa surfaces" is the wrong next step; one Koa state is.** The audit found parallel selectors disagreeing across Today/room/widget/chat (K-14, K-28/K-30, K-33). Adding more Koa placements before unifying state multiplies the contradictions. R1's single state machine is the strategic fix; KOA-T14/T30 are the incremental steps.
2. **The expression vocabulary should shrink before it grows.** 34 expressions and 17 emotions, with a large unreachable fraction (K-29). Wiring triggers for dead states the product may not want is waste; the decision-first approach in KOA-T29 (wire or remove, per state) is cheaper and more honest than assuming all designed states are wanted.
3. **3D Koa is not a near-term option and should not be scoped as one.** There is no Koa 3D asset, no 3D pipeline, and no 3D code path (§3.1). The 2D pipeline's performance and state problems (K-10–K-12) must be fixed first; any 3D future is RealityKit/USD (R9) and a separate, Kiệt-approved program.
4. **Celebration frequency is a product decision hiding in code.** The sticky celebration (K-05), repeat celebrations from write ordering (K-24), and re-claim celebrations (K-16) all violate the milestones-only principle (R8). Fixing the mechanisms without deciding the celebration policy will reproduce the problem in new forms; KOA-T01/T05/T24 should land with an explicit policy (celebrate once per milestone, ever).
5. **The "one event" week header should be treated as a product decision, not a bug to quietly fix.** K-20's divergence may reflect genuinely different product intents (KoaWeek rewards showing up; Gains rewards training quality). The task requires Kiệt's rule decision before implementation — implementing either definition unilaterally would change what users earn.

**Decisions needed from Kiệt before implementation (do not implement on assumption):** K-04 (apply load factor vs change copy — safety call), K-20 (single week rule), K-56 (streak bonus/freeze dead or alive), K-57 (client-only rank gates acceptable?), K-29 (per-state wire-or-remove for unreachable emotions), celebration policy (§8.4). These are flagged as decision gates in their task specs.

---

## 9. Handoff rules (apply to every task in KOA_TASKS.md)

1. **Plan first, per the standing law:** every change is notified to Kiệt as a plan before it is done. Tasks flagged with decision gates require his decision before implementation starts.
2. **Verification/feedback loop (required for every task):** the implementing agent returns (a) the `git diff` (or PR), (b) build + test results, (c) before/after screenshots or recordings for any visual/behavioral change, (d) performance measurements (Instruments/signposts) for any perf task, (e) the simulator checklist items from §5.3 that the task touches, marked with captures.
3. **No task is complete on the implementer's word alone.** Completion requires the evidence in (2) reviewed against the task's acceptance criteria. A "done" report without evidence is not done.
4. **Read-only audit boundary:** this report proposes; it does not implement. No code was changed in producing it.
5. **Repo discipline stands:** `agent/<x>/<slug>` branches from `native/ios-rewrite`, PR + cross-review, merge commit, CI green on the exact head, no force-push, never loosen guards to go green. PRs touching limitations/deferrals update `apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md`.
