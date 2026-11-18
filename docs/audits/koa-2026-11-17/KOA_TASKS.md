# Koa Audit — Implementation Task Specs

- **Audit tip:** `2a904952` on `origin/native/ios-rewrite`. All file:line references at this tip.
- **Source report:** `KOA_AUDIT_REPORT.md` (finding IDs `K-xx` map to tasks below).
- **Counts:** 60 tasks — **P0: 4, P1: 16, P2: 19, P3: 21.**
- **Standing law:** every change is notified to Kiệt as a PLAN before it is done. Tasks marked ⛔ DECISION GATE require Kiệt's decision before implementation starts.
- **Verification rule (every task):** the implementer returns git diff/PR + build/test results + before/after screenshots/recordings for visual or behavioral changes + perf measurements for perf tasks + the §5.3 checklist items touched, with captures. **No task is complete on the implementer's word alone.**
- **Repo discipline:** `agent/<x>/<slug>` from `native/ios-rewrite`, PR + cross-review, merge commit, CI green on the exact head, no force-push, never loosen guards to go green. PRs touching limitations/deferrals update `apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md`.

---

## KOA-T01 — Claim contract: make duplicate claims distinguishable (K-01)

- **Priority:** P0
- **Problem statement:** `claim_quest_reward` returns the full priced amount even when the row already existed, so no client path can tell a fresh claim from a duplicate — every retry, cross-device claim, or fresh install re-celebrates old rewards. The daily-ceiling check also runs before the insert, so already-claimed keys can be spuriously rejected.
- **Current behavior:** `INSERT … ON CONFLICT DO NOTHING; RETURN v_amount` (`20261029130000_koa_quests_v2.sql:135–139`); ceiling check at lines 122–133 precedes the insert. All 4 client paths (QuestObserver, KoaWeekBook, MascotShopBook, WeeklyChallengesBook) treat success as fresh.
- **Desired behavior:** A duplicate claim returns a distinguishable result (0 amount, an out-parameter, or row-count via `INSERT … RETURNING` + `GET DIAGNOSTICS`); keys already present are exempt from the ceiling check; all 4 client sites celebrate only fresh claims.
- **Affected components:** `claim_quest_reward` SQL, `reward_amount_for`, QuestObserver, KoaWeekBook, MascotShopBook, WeeklyChallengesBook.
- **Relevant files:** `supabase/migrations/20261029130000_koa_quests_v2.sql`, `supabase/migrations/20261112120000_reward_key_shapes.sql`, `ASCNDCore/Mascot/KoaWeek.swift`, `MascotShop.swift`, `WeeklyChallenges.swift`, `QuestObserver.swift`.
- **Implementation proposal:** (1) New migration: return a duplicate marker; exempt present keys from the ceiling. (2) Update the 4 client sites to branch on fresh vs duplicate. (3) Replace the now-dead client 23505 branches (K-01's companion dead code). Coordinate rollout: server first, then clients, or version-tolerant handling — state the rollout order in the plan.
- **Acceptance criteria:** Claim-twice in a test DB returns distinguishable results with no second ledger row; ceiling re-check no longer rejects present keys; each of the 4 client paths shows no celebration on a duplicate-marked response.
- **Required tests:** SQL tests (claim twice; ceiling + present key); client tests with a duplicate-marker fake for each of the 4 paths; existing claim suites green.
- **Visual verification requirements:** Simulator: claim a quest, force a retry (re-enter surface / fresh install on same account) — no second celebration. Capture before/after.
- **Regression risks:** Rollout skew between SQL and clients; other RPC callers of `claim_quest_reward` (collections `set:`, explore `x:`) must handle the new contract; ceiling behavior change could alter legitimate near-ceiling claims — pin with tests.

## KOA-T02 — Coach context: include allergy/dietary safety fields (K-02)

- **Priority:** P0
- **Problem statement:** The coach's profile block omits allergies, dietary preference, disliked foods, water target, sex, and fiber target, so the model can recommend foods the user is allergic to or that violate their diet.
- **Current behavior:** `supabase/functions/ai-coach/index.ts` ctx (~341–350) includes only name, goal, weight, height, activity/training levels, TDEE, P/C/F macros, sleep target. Columns exist in the profile.
- **Desired behavior:** Profile block includes allergies, dietary preference, disliked foods, water target, and fiber target, with a prompt rule to never recommend allergens or disliked foods.
- **Affected components:** `ai-coach` edge function context builder + system prompt.
- **Relevant files:** `supabase/functions/ai-coach/index.ts`, `ASCNDCore/Profile/Profile.swift` (column reference).
- **Implementation proposal:** Extend the profile subset in the ctx builder; add the never-recommend rule to the prompt; keep the payload minimal (no free-text beyond the fields).
- **Acceptance criteria:** A profile with a peanut allergy asking for snack ideas receives no peanut recommendations across repeated prompts; disliked foods and dietary preference are honored in sampled answers.
- **Required tests:** Server-side context-builder tests asserting the fields are present; prompt snapshot review; manual sampled Q&A recorded (5+ prompts).
- **Visual verification requirements:** Chat captures: allergy-profile Q&A before/after. No UI change expected.
- **Regression risks:** Larger prompts cost/latency (negligible for 5 fields); prompt-rule wording must not cause over-refusal — sample benign food questions too.

## KOA-T03 — Quick reply: never state 0 kcal / 0 g protein as eaten (K-03)

- **Priority:** P0
- **Problem statement:** With nothing logged, local quick-reply answers state the user ate 0 kcal / 0 g protein, contradicting the server's null-is-not-zero rule and risking wrong nutrition advice.
- **Current behavior:** `CoachQuickReply.overview()` guards readiness, steps, and sleep but not calories/protein; `Signal` defaults kcal 0 / proteinG 0 with no measured flag; `CoachOverviewCheck` treats 0 as actual for meal/protein.
- **Desired behavior:** When nutrition is unmeasured, the coach answers "not logged yet" (matching the steps/sleep treatment) in both the quick-reply and AI-overview paths.
- **Affected components:** CoachQuickReply, CoachOverviewCheck, Signal model.
- **Relevant files:** `ASCNDCore/AI/CoachQuickReply.swift`, `ASCNDCore/AI/CoachOverviewCheck.swift`, `ASCNDCore/AI/CoachQuickReplyTemplates.swift`.
- **Implementation proposal:** Add a `hasNutrition` measured flag to the signal; thread it through the overview/check paths; add the "not logged" template in vi/en/es.
- **Acceptance criteria:** Fresh account, no logs, asking "how many calories did I eat?" yields the not-logged answer in both paths; logged days still report real numbers.
- **Required tests:** Unit tests for unmeasured/measured nutrition in both paths; template tests for all 3 languages.
- **Visual verification requirements:** Checklist V28 captures (fresh account) before/after.
- **Regression risks:** Other `Signal` consumers reading kcal/protein defaults — audit all readers; ensure the flag defaults safely for legacy/constructed signals.

## KOA-T04 — Load-factor promise: apply it or fix the copy ⛔ DECISION GATE (K-04)

- **Priority:** P0
- **Problem statement:** The week-coach card displays a load reduction ("−20%/−10%") after long breaks, but accepting a light week only removes one set at the same weight. The displayed promise is not honored. Safety-relevant: returning lifters may lift prescribed loads the UI said were reduced.
- **Current behavior:** `KoaWeekCoach.swift:32–36` (0.8 at ≥56 days off, 0.9 at 21–55); card displays the percentage (`KoaWeekCoachCard.swift:128–129`); `LighterSession` removes one set, same weight; no other `loadFactor` consumer exists (grep-verified).
- **Desired behavior:** Either (a) the factor is applied to prescribed weights when a light week is accepted, or (b) the copy promises only fewer sets. Kiệt decides which.
- **Affected components:** KoaWeekCoach, KoaWeekCoachCard, LighterSession / session prescription, localized strings.
- **Relevant files:** `ASCNDCore/Koa/KoaWeekCoach.swift`, `Features/Today/KoaWeekCoachCard.swift`, `ASCNDCore/Workout/LighterSession.swift`, overload/session prescription code.
- **Implementation proposal:** Present both options with the safety tradeoff in the plan. If (a): apply the factor at prescription time for lighter-week sessions and show the reduced loads in the session UI. If (b): remove the percentage from the card and rewrite the detail copy in vi/en/es.
- **Acceptance criteria:** Accepting a light week after 30 days off yields 90% loads in the first session (option a) or copy with no load promise (option b); verified in the session UI, not just the card.
- **Required tests:** Unit tests for the factor application or copy keys; simulator test: 30-days-off → accept → first session loads.
- **Visual verification requirements:** Card + first-session captures for the 30-day-off scenario, before/after.
- **Regression risks:** Option (a) changes prescribed loads — affects overload progression history and PR comparisons; pin with tests. Option (b) is copy-only but must be checked in all 3 languages.

## KOA-T05 — Sticky `.justClaimed` celebration (K-05)

- **Priority:** P1
- **Problem statement:** The +50 weekly celebration re-fires on every Today reload because `.justClaimed` is never consumed.
- **Current behavior:** `KoaWeek.swift:133` preserves `.justClaimed`, `:144` sets it; `TodayExtras.swift:850` re-adds coins to the display and re-fires `noteKoaReward` + wallet refresh on every `reloadDailyPlan`. Coins are not duplicated (server dedups); the celebration is false.
- **Desired behavior:** The celebration fires exactly once per fresh claim. Also use the server-returned amount instead of the hardcoded 50 (companion issue: `KoaWeek.swift:17–19,142–144` discards the returned amount).
- **Affected components:** KoaWeekBook, Today claim wiring, KoaWeekCard.
- **Relevant files:** `ASCNDCore/Mascot/KoaWeek.swift`, `Features/Today/TodayExtras.swift`, `Features/Mascot/KoaWeekCard.swift`.
- **Implementation proposal:** Return a fresh-claim signal from `claimIfComplete` (mirror `claimMissed → Int?`) and celebrate only fresh returns; or add a consume method downgrading `.justClaimed → .claimed`. Use the returned amount for display; keep the constant for pre-claim display only. Coordinate with KOA-T01's duplicate marker.
- **Acceptance criteria:** Double-claim in a unit test yields no second fresh signal; Room→Today→reload loop shows the celebration once.
- **Required tests:** Unit test: double claim → one fresh signal; fake returning a different amount → UI shows it; existing KoaWeekTests green.
- **Visual verification requirements:** Simulator Room→Today repeat captures; coin display before/after.
- **Regression risks:** Consume-transition timing vs the room card (which also reads the enum) — both surfaces must agree; do not break the legitimate first celebration.

## KOA-T06 — SSE completion contract: require `[DONE]`, add retry/stop, persist partials (K-06)

- **Priority:** P1
- **Problem statement:** A truncated stream is treated as success; the user cannot retry, stop, or resume; a zero-event stream sets no failure; a partial answer shown after an error is never saved, so history diverges from what the user saw.
- **Current behavior:** Stream loop calls `continuation.finish()` on clean EOF without `[DONE]`; `CoachChatView.swift:324` shows a failure label with no retry button; no stop button while streaming; new chat disabled while loading; draft cleared in `submit()`; `guard !answer.isEmpty else { return }` yields a silent empty answer; persistence is best-effort on the success path only.
- **Desired behavior:** EOF without `[DONE]` is a failure with a retry button that re-sends the last user message; a stop button cancels the task; the draft is kept until a successful send; partial assistant messages (marked truncated) and the user message persist at stream start/error; retry replaces the truncated message.
- **Affected components:** SupabaseCoach SSE client, CoachChat book, CoachChatView.
- **Relevant files:** `ASCNDBackend/SupabaseCoach.swift`, `ASCNDCore/AI/Coach.swift`, `Features/Assistant/CoachChatView.swift`.
- **Implementation proposal:** Require `[DONE]` for success; surface a retry affordance matching `TodayCoachSection`'s bar (skeleton/fallback/retry); add stop/cancel; move persistence earlier in the send flow with a truncated marker.
- **Acceptance criteria:** Proxy-cut mid-response and airplane-toggle mid-stream both yield failure UI + working retry; leaving and re-entering shows the truncated partial; stop halts a runaway stream; draft survives a failed send.
- **Required tests:** Unit tests for EOF-without-DONE, zero-event stream, persist-on-error, retry-replaces-truncated; fake-stream tests.
- **Visual verification requirements:** Checklist V25 captures/recordings (cut stream, retry, re-enter) before/after.
- **Regression risks:** `[DONE]` handling must stay compatible with `refusalStream` (which returns proper SSE + `[DONE]`); persistence ordering changes could duplicate messages — pin with tests.

## KOA-T07 — Error classification: read the response body (K-07)

- **Priority:** P1
- **Problem statement:** Quota and overload errors can never surface correctly: the client classifies on status alone with an empty message, so a 429 quota denial reads as generic rate-limit and a 5xx `ai_unavailable` never reads as overload.
- **Current behavior:** `SupabaseCoach.failure(status:)` passes `message: ""`; `EdgeFunction.classify` needs "hết lượt"/"quota" in the message for `.quotaExceeded` and `ai_unavailable` on 5xx for `.overloaded`. Response body is never read. The correct `failureText` strings already exist.
- **Desired behavior:** On non-2xx, read the error body (bounded, e.g. 4 KB) and pass its text to `classify`; keep the empty-message path only when the body is unreadable.
- **Affected components:** SupabaseCoach, EdgeFunction failure classification.
- **Relevant files:** `ASCNDBackend/SupabaseCoach.swift`, `ASCNDCore/AI/EdgeFunction.swift`, `Features/Readiness/WeeklyReviewView.swift` (`failureText`).
- **Implementation proposal:** Read the body in the stream client's error path before classifying; add unit tests with the real server payloads (429 quota message from `guard.ts`, 500 `ai_unavailable`).
- **Acceptance criteria:** 429 quota → quota message; 500 `ai_unavailable` → overload message; unreadable body → previous generic behavior.
- **Required tests:** `classify` unit tests with real payloads; client tests with a fake transport returning bodies.
- **Visual verification requirements:** Staging-run captures of quota vs overload messages (or simulator with a stubbed backend).
- **Regression risks:** Body reading must not block the stream path or leak large payloads — enforce the bound; keep behavior identical for 2xx.

## KOA-T08 — Ask Koa probe: unknown state with explanation + retry (K-08)

- **Priority:** P1
- **Problem statement:** When the AI availability probe fails (offline, transient failure at launch), every Ask Koa entry vanishes with no placeholder, explanation, or retry. A stale "deployed" verdict is never re-checked. The probe counts 500/429 as deployed, so broken functions show dead entries.
- **Current behavior:** Entries gated by `isAIDeployed(.coach)`; probe = POST `{}` apikey-only, 8 s timeout, 3 attempts 2 s apart; network failure → unknown → hidden; once true, never re-probed; deployed = any status except 404.
- **Desired behavior:** Unknown/failed probe shows a disabled/placeholder Ask Koa entry with a one-line reason + tap-to-retry; verdict re-probed on foreground and on chat open when older than N minutes; repeated 5xx surfaces as "unhealthy" (degraded note or hidden-with-explanation, per the plan).
- **Affected components:** AppServices probe, Today gating, RootTabView routing, TodayAskKoaCard.
- **Relevant files:** `App/AppServices.swift:422–460`, `Features/Today/TodayExtras.swift:242,517`, `App/RootTabView.swift:75,88`, `Features/Today/TodayAskKoaCard.swift`, `ASCNDCore/AI/AIFunctionAvailability.swift`.
- **Implementation proposal:** Add an explicit unknown/unhealthy state to the availability model; render the placeholder in all gated entries; add foreground/chat-open re-probe with a staleness threshold; scope the UI-test blanket-deployed override to tests that need it.
- **Acceptance criteria:** Airplane mode at launch → placeholder + reason; connectivity restored + tap retry → entries appear without relaunch; staging 500 function → degraded/hidden state, not a dead entry.
- **Required tests:** Probe state-machine tests (unknown/healthy/unhealthy/stale); UI tests for placeholder + retry.
- **Visual verification requirements:** Checklist V24 captures (airplane launch, restore, retry) before/after.
- **Regression risks:** Re-probe frequency must not spam the function; placeholder must not appear during normal healthy launches (probe timing) — verify on a slow network.

## KOA-T09 — SSE timeout phases: first-byte budget + distinct timeout error (K-09)

- **Priority:** P1
- **Problem statement:** A single 90 s idle timeout covers both network stall and server-side failover/reasoning time, and timeouts are mislabeled "offline". Worst-case server failover (~180 s+) exceeds the budget, and long reasoning before the answer mark can trip it (INFERRED from timeout arithmetic + `stripBeforeMark` hold).
- **Current behavior:** `SupabaseCoach.idleTimeout` 90 s; `.timedOut` classified as offline (comment admits it); server worst case 3 providers × (3 attempts × 20 s header timeout + backoff) ≈ 180 s+ before the first byte.
- **Desired behavior:** Longer first-byte budget (e.g. 120–180 s) with a visible "Koa is thinking" state; shorter idle budget after the first byte; a distinct `.timedOut` user-facing string instead of offline.
- **Affected components:** SupabaseCoach timeout handling, CoachChatView waiting states, failure strings.
- **Relevant files:** `ASCNDBackend/SupabaseCoach.swift:72–94`, `ASCNDCore/AI/EdgeFunction.swift`, `supabase/functions/_shared/ai.ts` (`callAI`), `Features/Assistant/CoachChatView.swift`.
- **Implementation proposal:** Split connect/first-byte vs post-first-byte idle budgets; add the thinking state to the chat UI; add the distinct timeout failure + localized strings.
- **Acceptance criteria:** Staging run with a 100 s delayed first byte then a valid stream yields no false offline error; a genuine stall after the first byte still times out with the timeout message.
- **Required tests:** Fake-transport tests for slow-first-byte vs post-first-byte stall; failure-string tests.
- **Visual verification requirements:** Thinking-state capture during a slow first byte; timeout message capture.
- **Regression risks:** Longer budgets delay genuine failure feedback — the thinking state must make the wait legible; do not change the server failover behavior in this task.

## KOA-T10 — Frame-level figure plan cache (K-10)

- **Priority:** P1
- **Problem statement:** Every animated Koa frame rebuilds the whole figure plan from scratch; with `gesture?.armsFront` the pipeline runs twice per frame. Only defs and color strings are memoized. Magnitude is INFERRED (no Instruments run was possible) — measure before and after.
- **Current behavior:** `KoaFigureView.swift:203–218` builds plans per frame (signpost "figure"); `KoaRender.swift:715–726`, `KoaPaint.swift:592–596`; Paths/Text rebuilt per shape per frame (`:358–370, 467–525`).
- **Desired behavior:** Cache resolved `[KoaPaint.Op]`/Paths keyed by a hash of quantized render options, bounded like `StudioPlans`; at minimum skip rebuild when options are unchanged.
- **Affected components:** KoaFigureView, KoaRender, KoaPaint, KoaMemo.
- **Relevant files:** `Features/Mascot/KoaFigureView.swift`, `ASCNDCore/Koa/KoaRender.swift`, `ASCNDCore/Koa/KoaPaint.swift`, `ASCNDCore/Koa/KoaMemo.swift`.
- **Implementation proposal:** Introduce a bounded plan cache keyed by quantized options hash; invalidate on option change; keep the existing defs/color memoization. Measure with the "figure" signpost + Instruments before/after on device.
- **Acceptance criteria:** Measurable frame-time/CPU reduction on device in the room idle + animated figure scenarios (report numbers); no visual change (pixel-compare captures); cache-hit unit test.
- **Required tests:** Unit test for cache hit/miss/invalidation; golden/render tests green.
- **Visual verification requirements:** Before/after captures of identical frames (pixel-compare); Instruments traces attached. Checklist V32.
- **Regression risks:** Stale cache entries showing wrong poses/expressions — quantization must include every option affecting output; memory bound must be enforced (mirror `StudioPlans` FIFO).

## KOA-T11 — Scene clock gating: throttle timelines, one clock per scene (K-11)

- **Priority:** P1
- **Problem statement:** Reaction/rest/repair/pull scenes use unthrottled `TimelineView`s with no lifecycle gating and nested second Koa clocks; the room's outer timeline re-evaluates the whole room + stage at display rate and computes the repair shot twice per tick.
- **Current behavior:** `KoaReactionView.swift:60` (`TimelineView(.animation)`, no interval/paused), `:96–100` onChange ~60×/s, `:146–151` nested animated figure; `KoaRestScreen.swift:128,231+`; `KoaRepairLayer.swift:22,34`; `KoaPullScene.swift:39`; `CelebrationOverlay.swift:57`; `MascotRoomView.swift:176–203` outer timeline + double shot computation; three overlapping clocks (outer, `livingHero`, tall-room 30 fps).
- **Desired behavior:** `minimumInterval 1/60` + paused on background/Reduce Motion for scene timelines; nested figures driven via a `date:` parameter from the parent clock; repair shot computed once and shared; room scenes driven from the single-clock pattern already used by the room figure.
- **Affected components:** Reaction/rest/repair/pull/celebration scenes, room view clocks.
- **Relevant files:** `Features/Mascot/KoaReactionView.swift`, `Features/Workout/KoaRestScreen.swift`, `Features/Mascot/KoaRepairLayer.swift`, `Features/Mascot/KoaPullScene.swift`, `Features/Mascot/CelebrationOverlay.swift`, `Features/Mascot/MascotRoomView.swift`.
- **Implementation proposal:** Add intervals + lifecycle gating per scene; thread the parent clock date into nested figures; hoist the repair shot computation; keep the Reduce Motion behavior (flash gating etc.) intact.
- **Acceptance criteria:** Instruments energy/time improves in reaction/rest scenes (report numbers); signpost counts drop; no visual/behavioral change in recordings; backgrounded scenes stop ticking.
- **Required tests:** Unit tests for gating logic where extractable; existing scene tests green.
- **Visual verification requirements:** Before/after recordings of reaction + rest scenes; background/foreground behavior capture. Checklist V33.
- **Regression risks:** Throttling must not visibly step the animation (1/60 is display rate — safe) or break cue timing; nested-figure date threading must preserve the current visual output exactly.

## KOA-T12 — Idempotent gaze/face/clock stepping (K-12)

- **Priority:** P1
- **Problem statement:** Gaze/face/clock state is mutated during view evaluation, and `KoaIdleLife.step` consumes gaze/RNG blink state, so re-evaluation for the same timestamp advances state — view evaluation is not idempotent.
- **Current behavior:** `KoaFigureView.swift:116–132` mutates `life.idle`/`life.face` in a body-called function + `clock.tick`; `KoaSettle.swift:88–92` consumes state; `KoaFigureView:335–348` ticks; `KoaFaceTween.update` IS idempotent (the good pattern). `MascotRoomView:175,1603,1606` writes shared `KoaLens` via `let _ =` in GeometryReader/timeline closures (fragility INFERRED).
- **Desired behavior:** State steps exactly once per distinct timestamp; lens values are passed as inputs, not written during evaluation.
- **Affected components:** KoaFigureView, KoaSettle/KoaIdleLife, KoaClock, room lens plumbing.
- **Relevant files:** `Features/Mascot/KoaFigureView.swift`, `ASCNDCore/Koa/KoaSettle.swift`, `Features/Mascot/MascotRoomView.swift`.
- **Implementation proposal:** Step in the Canvas draw closure or a timestamp-guarded `.onChange`; pass lens values as inputs; add a DEBUG counter asserting one step per timestamp.
- **Acceptance criteria:** DEBUG counter shows exactly one step per distinct timestamp across forced re-evaluations; blink/gaze behavior unchanged on simulator observation.
- **Required tests:** Unit tests stepping the same timestamp twice → identical state; existing settle/mood tests green.
- **Visual verification requirements:** Simulator blink/gaze observation recordings before/after; no visible change expected.
- **Regression risks:** Moving stepping out of view evaluation changes timing subtly — verify gaze/blink cadence in recordings; the lens refactor must not alter layout.

## KOA-T13 — Wire the streak-danger state or remove it ⛔ DECISION GATE (K-13)

- **Priority:** P1
- **Problem statement:** The one emotional state designed for streak danger — the highest-value nudge moment — can never appear: `streakInDanger` has no callers, so `.worry` and the worry line are dead.
- **Current behavior:** `KoaMood.read` priority chain has no streak-risk branch; `KoaMood.swift:146` defines `streakInDanger(streak:emptyToday:hour:riskHour:)` with zero production callers (grep-verified); `.worry` branch in `KoaToday.swift` unreachable.
- **Desired behavior:** Either (a) add a streak-risk branch to `read()` (after birthday/sleep, before generic idle) wired to real streak data, showing the worry face + line; or (b) delete the dead code and strings if the design is intentionally dropped. Kiệt decides; note the character-law constraint from research (R6): worry must read as gentle encouragement, never guilt.
- **Affected components:** KoaMood engine, KoaToday line selector, strings.
- **Relevant files:** `ASCNDCore/Koa/KoaMood.swift`, `ASCNDCore/Koa/KoaToday.swift` (check actual location: `Features/Mascot/KoaToday.swift`), localized strings (`koa.say.worry`).
- **Implementation proposal:** If (a): thread real streak/empty-today/risk-hour inputs into `read()`; add the branch; verify the face+line pair. If (b): remove the function, the `.worry` branch, and the strings; update the emotion table docs.
- **Acceptance criteria:** (a) Simulator with a streak expiring within the risk hour shows worry face + line; outside the window, no change. (b) Grep shows zero references; suite green.
- **Required tests:** Unit tests for the branch (in-window/out-of-window/edge hours) or deletion verification; KoaMoodTests green.
- **Visual verification requirements:** Checklist V4 captures for the streak-at-risk state (option a) before/after.
- **Regression risks:** The priority-chain insertion point affects all downstream states — pin the full chain order with tests; worry must not fire for users with no streak or during pauses.

## KOA-T14 — Today face/line coherence + compact informative states (K-14)

- **Priority:** P1
- **Problem statement:** On Today, the face and the spoken line are computed by independent selectors with different thresholds, so Koa can look tired while praising a workout or proud while nagging about water. The compact layout additionally collapses informative states (tired/worry) to idle while the widget keeps the true mood.
- **Current behavior:** Face from `KoaMood`/schedule in `TodayDayBlock.swift`; line from `MascotLine.swift` (different windows/thresholds; water "done" at ≥50%; no steps line; praise once/day). `compactEmotion` maps sad/tired/worry/oops/warmup → idle. The room deliberately pairs face+line per topic (`KoaTalk`); Today does not.
- **Desired behavior:** Today's line derives from the same resolved state (mood reason + schedule phase + moment) that picks the face, as the room does; `MascotLine` remains only as the no-data fallback. Compact keeps tired/worry visible, collapsing only decorative variants.
- **Affected components:** Today hero, MascotLine, KoaMood/schedule resolution.
- **Relevant files:** `Features/Today/TodayDayBlock.swift`, `ASCNDCore/Today/MascotLine.swift`, `ASCNDCore/Koa/KoaMood.swift`, `ASCNDCore/Koa/KoaSchedule.swift`, `ASCNDCore/Koa/KoaTalk.swift` (reference pattern).
- **Implementation proposal:** Introduce a single resolved Today state (reason + phase + moment); derive both face and line from it; keep `MascotLine` as fallback; adjust `compactEmotion` to preserve tired/worry.
- **Acceptance criteria:** Scripted states across the day (morning/tired, post-workout, overate, all-done) show coherent face/line pairs; compact layout shows tired/worry faces.
- **Required tests:** Unit tests mapping resolved states → face/line pairs; compact-emotion tests; MascotLine fallback tests.
- **Visual verification requirements:** Checklist V4 + V5 captures for each scripted state, full and compact layouts, before/after.
- **Regression risks:** Line-copy changes in 3 languages; the fallback path must still produce a sensible line with no data; widget/line consistency must not regress.

## KOA-T15 — Implement storyboard haptics from cue data (K-15)

- **Priority:** P1
- **Problem statement:** Reaction/rest beats have sound but no vibration: haptic values exist in the cue data but are never read in production. Users with sound off get no beat feedback during rests. The only rest haptic fires 1 s overdue via a global handler.
- **Current behavior:** `KoaReaction.Haptic` + `KoaPerformance.Cue.haptic` written and forwarded, never read (grep: assignments/forwarding only). `KoaReactionView.fire()` and `KoaRestScreen.fire()` are documented "sound + haptics" but play only sound. `ASCNDApp.swift:25` fires `onRestFinished` via `onSettle` 1 s overdue, not at the "LƯỢT MÌNH!" beat.
- **Desired behavior:** `fire()` plays haptics from `Cue.haptic` (mapped to `sensoryFeedback`/generators), including the rest-go beat; respects Reduce Motion / haptic settings; follows the composed-vocabulary principle (R7): one cue per moment, soft/low-sharpness for Koa.
- **Affected components:** Reaction/rest firing paths, haptic mapping, settings.
- **Relevant files:** `Features/Mascot/KoaReactionView.swift`, `Features/Workout/KoaRestScreen.swift`, `ASCNDCore/Koa/KoaReaction.swift`, `ASCNDCore/Koa/KoaPerformance.swift`, `App/ASCNDApp.swift`.
- **Implementation proposal:** Implement the haptic channel in both `fire()` paths from cue data; map cue kinds to system patterns by documented meaning (success only for rare milestones); gate on Reduce Motion + the sound/haptic settings; align the rest-go haptic to the beat, not the overdue handler.
- **Acceptance criteria:** Device run through rest intro → activity → go confirms a haptic at each beat including rest-go; Reduce Motion ON yields no beat haptics; sound-off run still yields beat feedback.
- **Required tests:** Unit tests for the cue→pattern mapping; settings-gating tests.
- **Visual verification requirements:** Device-run report (haptics need hardware): beat-by-beat confirmation log + recording. Checklist V17.
- **Regression risks:** Haptic spam if cues fire per frame — fire on cue transitions only; must not double-fire with the global `onRestFinished` handler; battery impact negligible but verify no per-frame generator creation.

## KOA-T16 — Retry classification: transient errors retryable, permanent refusals not (K-16)

- **Priority:** P1
- **Problem statement:** Two opposite failures: transient server errors carrying a code are never retried (pending rewards dropped), while `QuestObserver` retries ALL failures including permanent refusals on every read — and a transient ledger failure makes it re-claim old rewards.
- **Current behavior:** `KoaQuests.swift:92–97` `shouldRetry` only `.offline`/`.server(code: nil)`; `SupabaseMascot.swift:224–240` maps unrecognized PostgrestErrors (incl. transient 5xx) to `.server(code:)`; `QuestObserver.swift:98–110` sets `claimed=[]` on ledger failure; `:151–182` treats any error as owed, retried every observe (unlike `QuestRetry.shouldRetry`); `.dailyCeiling`/`.unknownReward`/`.notSignedIn` retried forever in the 2-day window.
- **Desired behavior:** 5xx/transient errors are retryable; permanent refusals (ceiling, unknown reward, not signed in) are not retried; when the ledger read fails, claiming is skipped (not assumed unclaimed); ceiling gets backoff.
- **Affected components:** QuestRetry classification, error mapping, QuestObserver.
- **Relevant files:** `ASCNDCore/Mascot/KoaQuests.swift`, `ASCNDBackend/SupabaseMascot.swift`, `ASCNDCore/Mascot/QuestObserver.swift`, `App/AppServices.swift:621–641` (`claimOnce`).
- **Implementation proposal:** Make the error mapping distinguish transient 5xx (retryable) from permanent failures; reuse `shouldRetry` discrimination in `QuestObserver`; skip claiming on ledger-read failure; add backoff for ceiling.
- **Acceptance criteria:** Fake ledger-fail-once → zero claim RPCs; dailyCeiling fake → no retry on next observe; transient-5xx fake → retried and then succeeds.
- **Required tests:** Mapping tests per error kind; observer failure-injection tests; `claimOnce` drop/keep tests.
- **Visual verification requirements:** Offline→online simulator run: no spurious re-celebrations; stale-ledger scenario capture.
- **Regression risks:** Misclassifying a permanent error as transient causes retry loops — pin the classification table with tests; coordinate with KOA-T01 (duplicate marker reduces re-claim harm) and KOA-T53 (structured codes).

## KOA-T17 — Claim/load concurrency guards + claim retry UI (K-17)

- **Priority:** P1
- **Problem statement:** Concurrent claims interleave, concurrent room loads regress state, partial load failures keep stale values silently, and claim failure UI offers static text with no retry button. Occurrence of the races is INFERRED from missing guards; server `ref_key` dedup is the backstop.
- **Current behavior:** `KoaWeek.swift:126–169` check-then-act across awaits, no in-flight guard, 3 call sites (room `.task`, Today `claimKoaWeek`, reconnect retry); book never cleared on logout. `MascotRoom.swift:235–281` six parallel reads, no generation counter; ledger failure keeps stale wallet with `phase=.ready`; freezes failure → zero. `KoaWeekCard.swift:47–50,162–165` static retry text, no button. Other errors → `.failed`, retry only on re-entry.
- **Desired behavior:** In-flight guard keyed by claim ref; generation counter so only the latest load applies; stale/partial-failure state surfaced with a retry affordance; claim failure shows a working retry button; book cleared on session end.
- **Affected components:** KoaWeekBook, MascotRoomController, KoaWeekCard, session teardown.
- **Relevant files:** `ASCNDCore/Mascot/KoaWeek.swift`, `ASCNDCore/Mascot/MascotRoom.swift`, `Features/Mascot/KoaWeekCard.swift`, `Features/Mascot/MascotRoomView.swift`, `App/AppServices.swift` (session/forget paths).
- **Implementation proposal:** Add the in-flight set + generation counter; preserve freezes on failure; surface staleness + retry in UI; wire the retry button to re-claim; clear the book in `forgetKoaSession`.
- **Acceptance criteria:** Delayed-fake concurrent claims → one RPC; overlapping loads → latest wins; ledger-failure-after-success → staleness shown, not silent stale-ready; retry button re-claims; logout clears the book.
- **Required tests:** Concurrency tests with delayed fakes; overlapping-load test; staleness test; logout-clearing test.
- **Visual verification requirements:** Offline→online claim + retry-button captures; stale-indicator capture.
- **Regression risks:** Generation counters must not drop legitimate refreshes (pull-to-refresh, wallet-change reloads); retry must respect the in-flight guard.

## KOA-T18 — Buy-path atomicity: lock ordering + server-side unequip (K-18)

- **Priority:** P1
- **Problem statement:** Concurrent double-buy raises a raw 23505 that the client cannot map, and buying equips server-side while unequipping slot conflicts is a swallowed best-effort follow-up — leaving two items equipped in one slot with ad-hoc resolution.
- **Current behavior:** `buy_mascot_item` checks already-owned BEFORE the advisory lock (`20260815120000:83–85` vs `:89`); inserts have no `ON CONFLICT`; second concurrent buy fails UNIQUE → client generic `.server(code: 23505)`, not `.alreadyOwned`, and buy only reloads on `.alreadyOwned`/`.insufficientCoins`. SQL `:101–102` sets `equipped=true` with no conflict handling; `MascotShop.swift:467–468` swallows `setWorn` failures (`_ = try?`) yet reports `.bought`.
- **Desired behavior:** Re-check ownership after the lock and/or catch `unique_violation` → 'already owned'; unequip same-group items inside `buy_mascot_item` (or one atomic RPC); client maps buy-path 23505 → `.alreadyOwned` + reload; failures surfaced with reload.
- **Affected components:** `buy_mascot_item` SQL, MascotShopBook buy flow, ShopView.
- **Relevant files:** `supabase/migrations/20260815120000_economy_server_authority.sql`, `ASCNDCore/Mascot/MascotShop.swift`, `Features/Mascot/ShopView.swift`, `ASCNDBackend/SupabaseMascot.swift`.
- **Implementation proposal:** New migration for lock ordering + in-RPC unequip; client mapping + reload-on-23505; integration test with a failing follow-up asserting one equipped item per slot.
- **Acceptance criteria:** SQL concurrency test: two simultaneous buys → one succeeds, one clean already-owned; two same-slot buys → exactly one equipped; client 23505 fake → `.alreadyOwned` + reload.
- **Required tests:** SQL concurrency tests; client mapping tests; integration test for the failing-follow-up case.
- **Visual verification requirements:** Shop buy-flow captures incl. the double-tap case; equipped-state consistency in room after purchase.
- **Regression risks:** Needs a test DB; migration must be backward-compatible with clients in flight; unequip-inside-RPC changes the equipped set for existing double-equipped rows — decide migration behavior for them in the plan.

## KOA-T19 — `setWorn` atomicity: single RPC + reload on failure (K-19)

- **Priority:** P1
- **Problem statement:** Wearing is two non-atomic UPDATEs; the second result is discarded; optimistic restore can clobber fresh data; conflicting-item failures are swallowed — local and server equipped sets diverge.
- **Current behavior:** `SupabaseMascot.swift:279–303` (on-UPDATE `:284–290`, off-UPDATE `:292–298` result discarded; `found` reflects only the on-UPDATE); `MascotShop.swift:476–500` (optimistic apply `:482–484`, restore of stale `before` at `:497`, no load-generation guard); buy path `try?` at `:468`.
- **Desired behavior:** A single RPC sets the whole slot group atomically; on failure the client reloads from the server instead of restoring stale state; a load-generation counter prevents stale loads from clobbering.
- **Affected components:** SupabaseMascot wear path, MascotShopBook, ShopView apply flow.
- **Relevant files:** `ASCNDBackend/SupabaseMascot.swift`, `ASCNDCore/Mascot/MascotShop.swift`, `Features/Mascot/ShopView.swift:729–773` (apply flow: also silently skips `.busy` wears and overwrites notices — fix the notice accumulation in the same pass).
- **Implementation proposal:** New `set_worn` RPC (or equivalent) applying the group atomically; client reload-on-failure; generation counter on loads; `ShopView.apply()` accumulates outcomes into one combined notice and keeps failed items tryable.
- **Acceptance criteria:** Failing-off-update fake → reload shows server truth; overlapping setWorn+load → no clobber; offline wear-toggle → server truth after reconnect; apply with a `.busy` item → combined notice, item still tryable.
- **Required tests:** Fake-transport tests for partial failure; overlapping-operation tests; apply-outcome tests.
- **Visual verification requirements:** Simulator offline wear-toggle + apply-flow captures before/after.
- **Regression risks:** RPC rollout skew (old clients on direct UPDATEs); reload-on-failure must not flash the UI — keep optimistic UI only until the RPC resolves.

## KOA-T20 — One week definition: settle KoaWeek vs Gains ⛔ DECISION GATE (K-20)

- **Priority:** P1
- **Problem statement:** The header promises "MỘT sự kiện" (one event) but KoaWeek completion and the Gains full-week bonus diverge: walk-only days, 7th consecutive days, pauses, and no-plan weeks are treated differently, and `summary` vs `state` disagree on target/done for the same week.
- **Current behavior:** `KoaWeek.swift:52–56` done = kind-agnostic trained days; `KoaGains.swift:340–371` only `.active` kinds count (`:357`), walk else-branch (`:364–371`), 7th+ consecutive active day excluded (`maxActiveStreak=6`), unadjusted target (default 3, no plan), pauses ignored; `TodayController.swift:234` trained = all session dates incl. unconfirmed local/draft; `KoaWeek.summary` (`:84–97`, unadjusted, Gains-history done) vs `state` (`:44–57`, pause-adjusted, trained-set done).
- **Desired behavior:** Kiệt decides the single product rule (one shared definition implemented once), or explicitly documents two different intents and corrects the header. All surfaces (header, claim row, recap, assistant, review) derive from the decided definition.
- **Affected components:** KoaWeek, KoaGains.Week, TodayController trained set, all week surfaces.
- **Relevant files:** `ASCNDCore/Mascot/KoaWeek.swift`, `ASCNDCore/Koa/KoaGains.swift`, `ASCNDCore/Workout/TodayController.swift`, `Features/Today/TodayExtras.swift:230–234,710–715`, `Features/Assistant/AssistantTab.swift:456–461`, `Features/Readiness/WeeklyReviewView.swift:117–119`.
- **Implementation proposal:** Present the divergence table + options in the plan; implement the decided rule once; derive summary/state/header from it; fix the header copy; add divergence tests (walk-only week, 7th day, pause, no-plan, rest-only).
- **Acceptance criteria:** Paused-day + walk-day tests assert state.target == summary.target == header target under the decided rule; walk-only week behaves per the decided rule; header text matches behavior.
- **Required tests:** Divergence tests for each case above; existing KoaWeek/KoaGains suites green; the simple-case agreement test kept or updated deliberately.
- **Visual verification requirements:** Same-week captures across Today header, claim row, recap, Assistant, Review during a pause, before/after.
- **Regression risks:** Changes what users earn — this is a product decision, not a refactor; Gains history replay must handle the rule change for past weeks (decide retroactive vs forward-only in the plan).

## KOA-T21 — Single Monday-start helper + strip dedup + Water rename (K-21)

- **Priority:** P2
- **Problem statement:** Monday-start is computed inline in ≥7 places (drift risk); `Water.weekStart` computes a rolling 7-day window under the same name; `TodayWeekStrip.days` duplicates `KoaWeek.days` line-for-line.
- **Current behavior:** Inline Monday math in `WeeklyChallenges.swift:41–42`, `KoaGains.swift:394`, `WeekPlanning.swift:22–26`, `TodayPlanHero.swift:382`, `MascotRoom.swift:238`, `WorkoutHistory.swift:239,245`, `SmartGoals.swift:182–186` (Sunday=0 formula, never asserted equivalent); `Water.swift:189–191` rolling window; `TodayPlanHero:381–388` vs `KoaWeek:63–73` identical 7-day maps. NOTE: open PR #952 already removes `TodayWeekStrip.days` — verify after merge; that part may be resolved.
- **Desired behavior:** One `LocalDate` week-start helper used everywhere; `Water.weekStart` renamed to `rollingWindowStart`; strip uses the shared helper.
- **Affected components:** Week math across Mascot/Workout/Today/Progress.
- **Relevant files:** As listed above + `ASCNDCore/Mascot/KoaWeek.swift`, `Features/Today/TodayPlanHero.swift`.
- **Implementation proposal:** Introduce the helper; migrate all sites; rename the Water helper; boundary-date equivalence tests; grep to confirm no inline Monday math remains. Check PR #952's merge state first.
- **Acceptance criteria:** Boundary-date tests (Sunday/Monday edges, DST) pass for all migrated sites; grep finds no inline Monday computation; Water rolling behavior unchanged.
- **Required tests:** Equivalence tests per migrated site; SmartGoals formula equivalence test.
- **Visual verification requirements:** Week-strip captures across a Monday boundary before/after; no visual change expected.
- **Regression risks:** A subtle semantic difference at one site (e.g. Sunday handling) — the equivalence tests exist to catch it; migrate one site per commit within the PR for reviewability.

## KOA-T22 — Nil-library model + single trained-days source (K-22)

- **Priority:** P2
- **Problem statement:** Three different nil-library behaviors; two different "trained" sources feed week views (14-day server ∪ local vs ≤2000 newest rows); moved-session targets can mismatch planned days.
- **Current behavior:** `KoaWeek:44–57` nil when no library/planned day; `TodayPlanHero:381–388` 7 days planned=false/rest=false; `WorkoutHome:17–22` `.unplanned` except trained. `TodayController:101,121,227–234,424–447` (server 14d ∪ local) vs `KoaGains:439–505` (≤2000 rows). `KoaGains.Week.target` routine-only vs `KoaWeek.summary` moved/chosen-rest; only in-week moves tested.
- **Desired behavior:** One nil-library model (recommended: `WorkoutHome`'s) used everywhere; a single trained-days provider (or documented boundary behavior, pinned by tests); a defined/documented rule for cross-week moves and rest swaps.
- **Affected components:** Week views, TodayController, KoaGains, WorkoutHome.
- **Relevant files:** `ASCNDCore/Mascot/KoaWeek.swift`, `Features/Today/TodayPlanHero.swift`, `Features/Workout/WorkoutHome.swift`, `ASCNDCore/Workout/TodayController.swift`, `ASCNDCore/Koa/KoaGains.swift`, `ASCNDCore/Workout/WeekPlanning.swift`.
- **Implementation proposal:** Unify the nil-library model; introduce the single provider or pin boundaries; define the cross-week move rule; add tests (nil-library in all three, 15+-day-old session, >2000 history, cross-week move).
- **Acceptance criteria:** Fresh-account simulator check shows one consistent empty state; 15-day-old session visible consistently or per the documented rule; cross-week move behaves per the defined rule.
- **Required tests:** Nil-library tests in all three sites; boundary tests above.
- **Visual verification requirements:** Fresh-account + cross-week-move captures before/after.
- **Regression risks:** The trained-source change interacts with KOA-T20/T52 (history cap) — sequence after T20's decision; local/draft session inclusion is a product-visible behavior, state it in the plan.

## KOA-T23 — Week-coach card truthfulness: pause-aware + honest accept (K-23)

- **Priority:** P2
- **Problem statement:** The card's last-week state ignores pauses (a paused week reads as "missed" → wrong light-week recommendation), the card vanishes entirely during a pause, the documented pause trigger is missing from `decide()`, and accepting `.progress`/`.steady` applies nothing (verified by the coordinator, §2 of the report).
- **Current behavior:** `TodayExtras.swift:774` suppressed while paused today; `:776` `KoaWeek.state(today−7)` with default `paused={false}` vs `:844–846` `claimMissed` passing paused; `KoaWeekCoach.swift:42–49` inputs lack pause; doc `WEEK_RULES_EVIDENCE.md` lists the pause trigger; accept at `:744–749` calls `setLighterWeek` for `.light` only.
- **Desired behavior:** Last-week state is pause-adjusted; a product call is made on pause-aware messaging vs disappearance; pause input added to `decide()` (or the doc corrected); accepting `.progress` wires progression into next session targets (or the accept affordance/copy is changed so it does not promise application); `.steady` accept is honest about being acknowledgement-only.
- **Affected components:** Week-coach card, KoaWeekCoach, TodayExtras wiring, overload application.
- **Relevant files:** `Features/Today/TodayExtras.swift:717–810`, `ASCNDCore/Koa/KoaWeekCoach.swift`, `Features/Today/KoaWeekCoachCard.swift`, `docs/research/WEEK_RULES_EVIDENCE.md`.
- **Implementation proposal:** Thread the paused closure into the last-week computation; add the pause input to `decide()`; trace where `.progress` targets SHOULD apply (overload flow) and wire accept to it, or change the card to a single acknowledge action for `.progress`/`.steady` with honest copy.
- **Acceptance criteria:** Paused-last-week test → light recommendation (or the decided pause-aware message); accept-progress test → next-session targets increase (or single honest action); card behavior during pause matches the decided product call.
- **Required tests:** Pause-adjusted last-week tests; accept-wiring tests per kind; `decide()` pause-trigger test.
- **Visual verification requirements:** Simulator during-pause + accept-progress captures before/after.
- **Regression risks:** Overload-application wiring must not double-apply with the separate overload card; the pause message must not nag users who deliberately paused (R6).

## KOA-T24 — Weekly challenges: seed reliably, write progress durably (K-24)

- **Priority:** P2
- **Problem statement:** Seeding failure is sticky (initialized set before seeding), Today focus checks never seed (users who never open Challenges get nothing), and progress writes are coupled to reward success so a failed write causes repeat celebrations.
- **Current behavior:** `WeeklyChallenges.swift:298–309` (`initialized=true` before seeding; failure → `.seed`, later `load()` only re-reads); `:348–364` `refreshProgress` returns on empty open set, never seeds; `TodayExtras:554–566` focusChecks only call `refreshProgress`; `load()` only from `ChallengesView:28`. `:404–440` claim failure → continue without writing; row-update failure → continue before `justCompleted` append; claim-before-write per header `:345–347`.
- **Desired behavior:** Seed inside `refreshProgress` when rows < 3 (idempotent, 23505-tolerant), or reset `initialized` on failure; write progress even on permanent claim failure; record celebrated completions durably per (week, key) like the KoaWeek seen-key.
- **Affected components:** WeeklyChallengesBook, Today focus checks, ChallengesView.
- **Relevant files:** `ASCNDCore/Mascot/WeeklyChallenges.swift`, `Features/Today/TodayExtras.swift`, `Features/Mascot/ChallengesView.swift`.
- **Implementation proposal:** Make seeding idempotent and reachable from Today; decouple progress writes from claim success; add durable celebrated-completion records; coordinate with KOA-T01's duplicate marker.
- **Acceptance criteria:** Empty week + `refreshProgress` → seeded; failure-then-success → second load seeds; claim-ok + update-fail-then-ok → single `justCompleted`; ceiling case → `current_value` written.
- **Required tests:** Seeding tests (empty/failure/retry); write-ordering tests; celebration-dedup tests.
- **Visual verification requirements:** Today focus-check captures for a user who never opened Challenges, before/after; repeat-celebration scenario capture.
- **Regression risks:** Seeding from Today changes first-launch behavior — keep it idempotent and cheap; durable celebrated records need a migration or UserDefaults scheme — state it in the plan.

## KOA-T25 — Composed feedback vocabulary for chat + celebrations (K-25)

- **Priority:** P2
- **Problem statement:** The coach — Koa's voice surface — is entirely silent and still, and the highest-emotion moments (claiming, leveling up) get a single haptic with no Koa figure, face, or sound outside the room.
- **Current behavior:** No `KoaSound` callers in chat; chat haptics only for copy/delete-fail/history-select. `CelebrationOverlay` header admits Koa doesn't celebrate along; challenges/shop/Today claim paths use a success haptic with no sound; `KoaSound.react` cues exist but fire only from room/reaction/rest paths.
- **Desired behavior:** A minimal chat vocabulary (send tick, answer-complete soft cue, error buzz) gated by the `koa.sound.off` toggle and silent-mode behavior; celebrate face + `react` cue added to the celebration overlay and claim confirmations, keeping the haptic. One composed cue per moment (R7); full celebration only for rare milestones (R8).
- **Affected components:** CoachChatView, CelebrationOverlay, claim paths (challenges/shop/Today).
- **Relevant files:** `Features/Assistant/CoachChatView.swift`, `Features/Mascot/CelebrationOverlay.swift`, `Features/Community/CommunityChallengesView.swift`, `Features/Mascot/ShopView.swift`, `Features/Today/TodayDayBlock.swift`, `Features/Mascot/KoaSound.swift`.
- **Implementation proposal:** Wire the chat cues to the existing `KoaSound` vocabulary; add the celebrate face + cue to the overlay and claim confirmations; respect the toggle everywhere; keep cues subtle.
- **Acceptance criteria:** Device run: send → stream → complete → error yields the three cues; toggle silences them; claim + level-up show face + sound + haptic together.
- **Required tests:** Gating tests (toggle on/off); cue-firing tests with a sound double where feasible.
- **Visual verification requirements:** Device-run report + recordings (V20, V23); toggle-off verification.
- **Regression risks:** Sound in chat could annoy — keep it subtle and toggleable; overlay face must not break the existing layout/announcements.

## KOA-T26 — Rest-screen pause clock: freeze the performance with the timer (K-26)

- **Priority:** P2
- **Problem statement:** While paused, Koa's rest performance keeps advancing on wall-clock time and can jump on resume, while the countdown freezes — the face/activity shown during a pause does not match the frozen timer. (INFERRED from the two clocks; confirm severity on a run.)
- **Current behavior:** `elapsed` is wall-clock since `startedAt` with no pause compensation; `left` freezes via `pausedLeft`; `restBeat` uses `elapsed`; `restGo` suppressed while paused but intro/activity windows use wall `elapsed`; ±15 s adjust changes the schedule.
- **Desired behavior:** `restBeat` driven from accumulated active time (paused intervals subtracted); the performance frame freezes while paused; no beat skip on resume.
- **Affected components:** KoaRestScreen, RestTimerController.
- **Relevant files:** `Features/Workout/KoaRestScreen.swift`, `ASCNDCore/Workout/RestTimerController.swift`.
- **Implementation proposal:** Track accumulated active time; drive beats from it; freeze the frame while paused; handle ±15 s adjust against the active-time clock.
- **Acceptance criteria:** Start rest, pause mid-activity window, wait, resume → no beat skip; paused frame matches the frozen countdown; adjust behaves consistently.
- **Required tests:** Unit tests for the active-time computation (pause/resume/adjust sequences).
- **Visual verification requirements:** Checklist V18 recording before/after.
- **Regression risks:** The beat schedule interacts with `KoaPerformance` scripts — verify cue timing unchanged for the unpaused path; adjust edge cases (adjust while paused).

## KOA-T27 — Live Activity rest beats: update Koa at beat boundaries (K-27)

- **Priority:** P2
- **Problem statement:** The lock-screen rest Koa is a frozen snapshot while the in-app rest screen animates, and `hidesKoa` can remove Koa from the lock screen/Island entirely. (INFERRED from the Live Activity update model + static content; device verification required.)
- **Current behavior:** `RestActivityContent` `koa` static; content redraws only on app update; a user setting hides Koa on lock screen/Island.
- **Desired behavior:** Update the Live Activity at beat boundaries (intro → activity → go) with the matching static Koa state; keep the hide setting but document the tradeoff.
- **Affected components:** Rest Live Activity content, RestTimerController update triggers.
- **Relevant files:** Rest Activity content views, `ASCNDCore/Workout/RestTimerController.swift`, `Features/Workout/KoaRestScreen.swift` (beat definitions).
- **Implementation proposal:** Trigger Activity updates at beat boundaries with the corresponding Koa state snapshot; respect the update budget; document `hidesKoa` behavior.
- **Acceptance criteria:** Device run with a rest timer: Island/lock screen shows matching states across beat boundaries; `hidesKoa` behavior documented and unchanged.
- **Required tests:** Unit tests for beat-boundary state mapping; update-trigger tests with a double.
- **Visual verification requirements:** Device captures across beat boundaries (V21); 14 Pro+ hardware for Island.
- **Regression risks:** Activity update frequency limits — beat boundaries only, not per-second; stale states if updates are throttled by the system — acceptable degradation, document it.

## KOA-T28 — Audio infrastructure: diagnostics, Settings toggle, interruption handling (K-28)

- **Priority:** P2
- **Problem statement:** Sound failures are invisible (missing files/unmatched cues fail silently), the only mute toggle lives in the room, no interruption/route-change handling was found, and the audio session is reconfigured on every play.
- **Current behavior:** `KoaSound.load`/`voice`/`cue` return early with no log; `cue()` ignores volume for `koa-talk-*` cues; `koa-rx-ring.wav` exists with no `soundsOf` entry; `koa-cheer`/`koa-boop-2` reachable only via Dust/Repair string cues; toggle only `koa.sound.off` in the room; `.ambient` + mix-with-others; `activate()` reconfigures the session per play with swallowed failures (`KoaSound.swift:75–88`).
- **Desired behavior:** DEBUG diagnostics (Telemetry/debug log) on missing file/unmatched cue; startup asset check for the 55 wavs; volume honored for talk cues (or the exception documented); orphan wired or removed; toggle in Settings (room shortcut kept); interruption + route-change handling pausing/resuming ambience/voice; session activated once + re-activated on interruption, failures logged.
- **Affected components:** KoaSound, Settings, room toggle, AVAudioSession handling.
- **Relevant files:** `Features/Mascot/KoaSound.swift`, `Features/Mascot/MascotRoomView.swift`, Settings views, `Resources/Sounds/`.
- **Implementation proposal:** Add diagnostics + asset check; move/duplicate the toggle into Settings; add interruption observers; activate-once session management; resolve the orphan wav and volume inconsistency.
- **Acceptance criteria:** Renaming a wav in a DEBUG build produces a diagnostic; cue table matches the bundle listing; Settings toggle silences Koa sounds incl. rest; incoming call during ambience pauses/resumes correctly; background music unaffected.
- **Required tests:** Asset-inventory test (cue table vs bundle); toggle-gating tests; interruption-handler tests with doubles where feasible.
- **Visual verification requirements:** Device-run report: toggle from Settings, call interruption, background-music mix (V15).
- **Regression risks:** Session re-activation changes could affect gym-music mixing — verify mix-with-others behavior explicitly; the asset check must not slow launch (run async/lazy).

## KOA-T29 — Expression reachability: wire or remove, per state ⛔ DECISION GATE (K-29)

- **Priority:** P2
- **Problem statement:** A large designed vocabulary of faces is unreachable, so Koa's emotional range in production is much narrower than the design; dead states rot and mislead future work. `.plead` is reachable through talk faces while a test asserts no emotion state uses it — a layer contradiction.
- **Current behavior:** 17 emotions; no production selector for `.sad`, `.worry`, `.curl`, `.coat`; 34 expressions with no reachable selector for `.angry`, `.yikes`, `.focus`, `.pant`, `.oof`, `.dizzy`, `.tease`, `.thinking`, `.sheepish`, `.sleepy` (subset, provisional pending exhaustive grep); `KoaTalk.face(.emptyLate)` → `.plead` while the emotion layer + test forbid it.
- **Desired behavior:** Per unreachable state: wire a trigger (e.g. `.sad` for a missed goal with empathy, `.coat` seasonally) or remove it from the production enum and document the cut. One consistent face policy across layers; the test covers talk faces too.
- **Affected components:** KoaEmotion, KoaFlags, KoaTalk, selectors, tests.
- **Relevant files:** `ASCNDCore/Koa/KoaEmotion.swift`, `ASCNDCore/Koa/KoaFlags.swift`, `ASCNDCore/Koa/KoaTalk.swift`, selector sites, emotion/talk tests.
- **Implementation proposal:** Run the exhaustive per-expression grep (G10); present the wire-or-remove table to Kiệt; implement the decisions; extend the allowlist test to talk faces.
- **Acceptance criteria:** Post-fix grep: every remaining emotion/expression has a production call site or a documented cut; `.plead` usage matches the decided policy; tests enforce it.
- **Required tests:** Reachability assertion test; allowlist test incl. talk faces; new-trigger tests for wired states.
- **Visual verification requirements:** Simulator captures of each newly wired state; removal verification via grep (no visual change for removed states).
- **Regression risks:** Removing enum cases can break DEV lists/previews — audit all references incl. previews; wiring new triggers must respect the character law (no guilt/anger faces for user rest — R6).

## KOA-T30 — Cross-surface Koa state coherence (K-30)

- **Priority:** P2
- **Problem statement:** Koa's state is inconsistent across surfaces: schedule phases apply only on Today, the coach card always shows `.proud`, and non-Koa mascot selection is mostly cosmetic with permanently neutral figures.
- **Current behavior:** `KoaSchedule.phase` has exactly one production caller (`TodayDayBlock:265–281`) though the header claims Today/widget/room; `KoaWeekCoachCard` hardcodes `.proud` regardless of kind; `MascotFigureView` drops emotion/gesture/interactive/walk/director for non-Koa ids and renders `VectorMascotView` always neutral though `VectorMascot.Mood` has happy/neutral/tired; `mascotSelected` honored at 3 sites only.
- **Desired behavior:** The same phase override applies in the room emotion chain and widget snapshot (or the header is amended and Today-only is intentional); coach-card emotion maps from kind (light → supportive, steady → happy, push → proud); either `VectorMascot.Mood` is driven from the mood engine and selection honored in hero/room, or the feature is scoped honestly in UI copy (selection = widget/peek only).
- **Affected components:** Schedule/phase plumbing, coach card, mascot selection, widget publisher, room.
- **Relevant files:** `ASCNDCore/Koa/KoaSchedule.swift`, `Features/Today/TodayDayBlock.swift`, `Features/Mascot/KoaWidgetPublisher.swift`, `Features/Mascot/MascotRoomView.swift`, `Features/Today/KoaWeekCoachCard.swift`, `Features/Mascot/KoaFigureView.swift`, `ASCNDCore/Koa/VectorMascot.swift`.
- **Implementation proposal:** Apply the phase override in room + widget; add the kind→emotion map; decide the mascot-selection scope with Kiệt and implement (drive Mood or honest copy).
- **Acceptance criteria:** Work out → Today, room, widget show matching pump state within 2 h; each week kind shows a distinct card face; non-Koa selection audit passes per the decided scope.
- **Required tests:** Phase-override tests per surface; kind→emotion tests; mascot-selection tests.
- **Visual verification requirements:** Three-surface captures post-workout; week-kind captures; non-Koa audit captures (V16).
- **Regression risks:** Widget snapshot changes affect the `imageKey` guard/caching — verify; room emotion-chain insertion must preserve existing priority order.

## KOA-T31 — Coach memory reliability: retry `learn()`, gate quota spend (K-31)

- **Priority:** P2
- **Problem statement:** Failed memory extraction is silently dropped forever (facts like injuries permanently missed), while trivial chats burn AI quota because the quota claim precedes the gateway call.
- **Current behavior:** `learn()` sets `learnedAt` optimistically before a fire-and-forget detached task; errors swallowed; no retry queue; no UI status. `ai-coach-memory/index.ts:264–270` claims quota before the model call; the in-code comment acknowledges closing one-line chats repeatedly spends quota.
- **Desired behavior:** Mark learned only on success; on failure keep messages pending and retry on next successful send or foreground (bounded retries); skip the memory call for conversations below a turn/content threshold before claiming quota.
- **Affected components:** CoachChat learn flow, ai-coach-memory quota gating.
- **Relevant files:** `ASCNDCore/AI/Coach.swift` (`learn()`), `supabase/functions/ai-coach-memory/index.ts`, `Features/Assistant/CoachMemoryView.swift`.
- **Implementation proposal:** Pending-set + bounded retry for `learn()`; threshold gate client- or server-side before the quota claim; surface memory-sync status minimally (or document why not).
- **Acceptance criteria:** Memory endpoint failing once then succeeding → facts appear in `CoachMemoryView` after retry; short-chat quota counts drop in server logs; no unbounded retry.
- **Required tests:** Unit tests for pending/retry/bounded behavior; threshold tests; quota-log verification on staging.
- **Visual verification requirements:** Memory-view captures after the fail-then-succeed run; no UI change expected otherwise.
- **Regression risks:** Retry must not duplicate facts server-side (idempotency of the memory call — verify); threshold must not skip genuinely fact-dense short messages (tune conservatively).

## KOA-T32 — Memory transparency: visible set == used set (K-32)

- **Priority:** P2
- **Problem statement:** Facts with unknown kinds are used by the coach but invisible to the user, who cannot review or individually delete them — contradicting the server's own comment that the user can see/delete the list.
- **Current behavior:** `CoachMemory.groups()` drops nil/unknown-kind facts; the view renders groups only; forget-all still deletes them. Server sends ALL kinds to the model. Current server writes only the 4 known kinds, so this bites legacy/direct rows — structural, not hypothetical in shape.
- **Desired behavior:** Unknown-kind facts render under an "Other" group with individual delete; or the server filters to known kinds. Either way, visible == used.
- **Affected components:** CoachMemory grouping, CoachMemoryView, ai-coach memory block.
- **Relevant files:** `ASCNDCore/AI/CoachMemory.swift`, `Features/Assistant/CoachMemoryView.swift`, `supabase/functions/ai-coach/index.ts`, `supabase/functions/ai-coach-memory/index.ts:161`.
- **Implementation proposal:** Pick one side (recommended: client "Other" group — preserves transparency for legacy rows); implement + test with a seeded unknown-kind fact.
- **Acceptance criteria:** Seeded unknown-kind fact appears in the view and is individually deletable; or server filters and the fact is not sent to the model.
- **Required tests:** Grouping tests incl. unknown kinds; delete tests; server filter test if that side is chosen.
- **Visual verification requirements:** Memory-view captures with a seeded unknown-kind fact, before/after.
- **Regression risks:** "Other" group copy in 3 languages; forget-all behavior unchanged.

## KOA-T33 — Coach context completeness: streak, water, steps, all checks (K-33)

- **Priority:** P2
- **Problem statement:** The coach understates streaks (capped at 7), has no water data and no per-day steps despite prompt examples using both, honors only the first validated check, and cannot reference today's plan or explain readiness drivers.
- **Current behavior:** `dailyLogs` 7 rows; streak loop walks 30 days over ≤7 dates; server never reads `daily_logs.water_ml` or `water_logs`; `recent_nutrition` has `steps_avg_7d` only; `checkBlock` renders `checks[0]` only; ctx has no plan/meals/readiness components/Koa state.
- **Desired behavior:** Fetch 30 days of logged dates for the streak walk; add today + 7-day water totals (from `water_logs`) + per-day steps + water target to ctx; render all validated checks; add planned-workout and readiness-component fields as a follow-up in the same task.
- **Affected components:** `ai-coach` context builder.
- **Relevant files:** `supabase/functions/ai-coach/index.ts` (~232–350), `supabase/migrations/20261006160000_daily_logs_water_ml.sql` (column proof).
- **Implementation proposal:** Separate the 30-day date fetch from the 7-row detail fetch; add water/steps sources; render all checks; add plan + readiness components.
- **Acceptance criteria:** 30-day streak reported correctly in ctx (server log) and answers; water/step-pattern questions answered from real numbers after a logged week; sleep+weight message honors both numbers.
- **Required tests:** Context-builder tests (streak window, water totals, per-day steps, multi-check rendering); staging Q&A samples.
- **Visual verification requirements:** Chat captures for streak/water/step questions before/after.
- **Regression risks:** Extra queries add latency — keep them date-scoped and minimal; prompt-size growth — watch token budget.

## KOA-T34 — Chat input understanding: intents, questions, conflicts, units (K-34)

- **Priority:** P2
- **Problem statement:** Four input-understanding flaws: thanks-intent ordering can swallow questions; the question flag is ignored for sleep/water/weight; the instruction-leak guard can destroy whole legitimate answers and number-less conflict replies dead-end; weight is kg-only and sleep needs an hour unit.
- **Current behavior:** `thanks` (≤6 words) checked before advice guards (`CoachQuickReply.swift`); `detect()` honors the question flag only for workout/meal (`CoachLogPrompt.swift`); `leaksInstructions` matches substrings incl. "important"/"quan trong" and `send` replaces the whole answer with a canned question; `choice()` understands numbers only; `weightKg` kg-only, `display()` always kg, `sleepMinutes` requires an hour unit; profile `units_weight` exists.
- **Desired behavior:** Thanks path only without question marks/words; question flag honored for all kinds; leak matcher narrowed to instruction-like patterns with sentence-level stripping; number-less conflict replies mapped to offered choices with explicit choice buttons; lb parsing + user-unit display + minutes-only sleep accepted.
- **Affected components:** CoachQuickReply intents, CoachLogPrompt, Coach send flow.
- **Relevant files:** `ASCNDCore/AI/CoachQuickReply.swift`, `ASCNDCore/AI/CoachLogPrompt.swift`, `ASCNDCore/AI/Coach.swift`, `ASCNDCore/Profile/Profile.swift` (units).
- **Implementation proposal:** Reorder/refine intents; narrow the leak matcher; add choice buttons + word-reply mapping; add unit-aware parsing/display.
- **Acceptance criteria:** Thanks+question inputs route to AI; sleep/water/weight questions yield no log prompt; "important" in a benign answer survives; word-only conflict replies resolve; lb profile logs "150 lb" and "slept 420 minutes" correctly.
- **Required tests:** Intent-classifier tests (thanks+question); question-flag tests per kind; leak-guard fixtures; conflict-flow tests; unit tests (lb/kg, minutes/hours).
- **Visual verification requirements:** Chat captures for each scenario before/after.
- **Regression risks:** Leak-matcher narrowing must not re-open instruction-leak paths — keep adversarial fixtures; choice buttons must match the existing conflict UI language.

## KOA-T35 — Overview block: survive truncation + multiple blocks (K-35)

- **Priority:** P2
- **Problem statement:** If the model is cut at the 2048-token ceiling mid-block, the entire tail — including the required direct-answer sentence — is dropped during streaming and permanently; a second block is silently stripped.
- **Current behavior:** `CoachOverview.split`/`parse`: unclosed ` ```ascnd ` / ` ```json ` fence returns only the text before it; only the first block is drawn, later blocks stripped.
- **Desired behavior:** On unclosed fence, render the fenced content best-effort (lenient parse already exists for items) and keep trailing text; render or append subsequent blocks as text instead of stripping.
- **Affected components:** CoachOverview parsing/rendering.
- **Relevant files:** `ASCNDCore/AI/CoachOverview.swift`, `ASCNDCore/AI/CoachOverviewCheck.swift`.
- **Implementation proposal:** Lenient recovery for unclosed fences; multi-block handling; fixtures for truncated and multi-block outputs.
- **Acceptance criteria:** Truncated and multi-block fixtures preserve the tail/direct answer; well-formed single-block output unchanged.
- **Required tests:** Parse tests: unclosed fence, mid-block cut, two blocks, well-formed control.
- **Visual verification requirements:** Chat captures rendering a truncated answer before/after (use a fixture-driven preview or staging).
- **Regression risks:** Lenient parsing must not render malformed model output as false data — the number-verification check still applies to rendered items.

## KOA-T36 — Language + disclaimer coherence in chat (K-36)

- **Priority:** P2
- **Problem statement:** The answer prompt uses the app language while the medical disclaimer uses the detected message language (INFERRED incoherence), and the disclaimer is fragile: word-list based, shown only when the last message is an assistant message.
- **Current behavior:** `chatLanguage` (NaturalLanguage, ≥0.6 confidence, vi/en/es) used only for the disclaimer; server prompt language comes from the app language. Disclaimer requires a health word in the transcript AND last-message-is-assistant AND not loading. The server prompt forbids the model from writing its own disclaimer.
- **Desired behavior:** Send the detected message language (when confident) as the prompt language, falling back to app language; use the same language for the disclaimer; latch the disclaimer per conversation once a health topic is detected (sticky until the conversation changes); consider server-side health-topic marking.
- **Affected components:** CoachChatView language handling, disclaimer logic, ai-coach prompt language.
- **Relevant files:** `Features/Assistant/CoachChatView.swift`, `ASCNDCore/AI/CoachHealthTopic.swift`, `supabase/functions/ai-coach/index.ts`.
- **Implementation proposal:** Unify the language decision; implement disclaimer latching; evaluate server marking as a follow-up note in the plan.
- **Acceptance criteria:** App Vietnamese + English question → English answer + English disclaimer (or the decided coherent pair); multi-turn health conversation keeps the disclaimer visible.
- **Required tests:** Language-decision tests (confident/uncertain detection, fallback); disclaimer-latch tests.
- **Visual verification requirements:** Checklist V26 + V27 captures before/after.
- **Regression risks:** Language detection confidence edge cases (short messages, mixed language) — fallback must be safe; latching must reset on conversation change.

## KOA-T37 — Server prompt hygiene: hostility refusal, Spanish prompt, stream default (K-37)

- **Priority:** P2
- **Problem statement:** Three prompt-layer fragilities: the hostility filter can block benign corrections with an opaque refusal; the Spanish prompt is built by global string replacement over user data; the `CoachStream` default implementation silently drops checks/waterUnit.
- **Current behavior:** `scope.ts` `looksHostile` scans only the last message; refusal is a bare scope statement. `ai.ts` `forSpanish` runs `.replaceAll("English","Spanish")` over the whole prompt including embedded ctx JSON. `Coach.swift` default `stream` forwards only messages/language.
- **Desired behavior:** Refusal explains briefly that the request looks like an instruction override and invites rephrasing; the ignore-previous pattern reviewed for the benign "I meant…" case; `forSpanish` applied only to the static template before user-data interpolation (or a real Spanish branch); the default stream forwards checks/waterUnit or is removed so implementers must handle them.
- **Affected components:** `_shared/scope.ts`, `_shared/ai.ts`, CoachStream protocol.
- **Relevant files:** `supabase/functions/_shared/scope.ts`, `supabase/functions/_shared/ai.ts`, `ASCNDCore/AI/Coach.swift`.
- **Implementation proposal:** Adjust the refusal text + pattern review; reorder the Spanish replacement; fix or remove the default implementation.
- **Acceptance criteria:** Benign "ignore my previous message, I meant…" phrasings pass or get an explanatory refusal; Spanish user with "English" in profile data sees uncorrupted data in the model prompt (server log); a test double asserts checks reach the stream.
- **Required tests:** Hostility-pattern tests (benign + adversarial); Spanish prompt tests with "English" in user data; stream-default test.
- **Visual verification requirements:** Chat captures for the benign-correction case before/after.
- **Regression risks:** Loosening the hostility gate must not admit real prompt-injection — keep adversarial fixtures green; Spanish-branch changes need a Spanish Q&A sample.

## KOA-T38 — Coach history reliability: errors + delete confirmation (K-38)

- **Priority:** P2
- **Problem statement:** Opening a past conversation or reloading history can fail silently, and one accidental tap permanently deletes a conversation.
- **Current behavior:** `CoachChat.open()` sets no state on failure; `loadHistory()` keeps a stale ready list silently on reload failure; history sheet dismisses then fails silently; delete button has no confirmation.
- **Desired behavior:** Open/load errors surface as a transient notice with retry; delete requires confirmation (or an undo window).
- **Affected components:** CoachChat history, CoachChatView history sheet.
- **Relevant files:** `ASCNDCore/AI/Coach.swift`, `Features/Assistant/CoachChatView.swift`.
- **Implementation proposal:** Surface error state + retry in the history UI; add a confirmation dialog (or undo) for delete.
- **Acceptance criteria:** Forced persistence failure yields a notice + working retry; delete tap requires confirmation; stale-list staleness is indicated.
- **Required tests:** History error-state tests; delete-confirmation UI tests.
- **Visual verification requirements:** History error + delete-confirmation captures before/after.
- **Regression risks:** Confirmation must not break the existing delete flow for UI tests — keep identifiers stable; retry must not duplicate history entries.

## KOA-T39 — Consolidate the dual rest/reaction storyboard systems (K-39)

- **Priority:** P2
- **Problem statement:** Two overlapping storyboard systems, dead scripts for removed scenes, and duplicated rendering logic triple the maintenance surface; future edits can land in the wrong system.
- **Current behavior:** `KoaReaction.shots()` returns `[]` for all 10 rest scenes while `KoaPerformance` holds the scripts; `KoaRestScreen` duplicates `KoaReactionView` stage/koa/effects rendering (per in-code comments); `restSide`/`restShoulders`/`restJog` removed from activities but scripts + `soundsOf` entries remain; only `.done` runs in production; `.set`/`.record` DEBUG-preview only.
- **Desired behavior:** One system owns rest scenes; removed-scene scripts and `soundsOf` entries deleted or quarantined; shared stage/koa/effects rendering extracted into one helper used by both views.
- **Affected components:** KoaReaction, KoaPerformance, KoaReactionView, KoaRestScreen, KoaSound cue table.
- **Relevant files:** `ASCNDCore/Koa/KoaReaction.swift`, `ASCNDCore/Koa/KoaPerformance.swift`, `Features/Mascot/KoaReactionView.swift`, `Features/Workout/KoaRestScreen.swift`, `Features/Mascot/KoaSound.swift`.
- **Implementation proposal:** Pick the surviving system (recommend `KoaPerformance` — it runs in production); delete/quarantine dead scripts; extract the shared renderer; keep DEBUG previews working.
- **Acceptance criteria:** Grep confirms a single rest-scene source; rest screen + summary reaction render identically on simulator (captures); DEBUG previews intact.
- **Required tests:** Existing reaction/performance tests green; rendering-equivalence captures.
- **Visual verification requirements:** Side-by-side captures of rest + summary reaction before/after (V17, V19).
- **Regression risks:** Deleting scripts/entries referenced by string cues — audit `soundsOf` + string-cue call sites first (see KOA-T28 orphan); DEBUG-only scenes must keep working or be explicitly cut.

## KOA-T40 — Shared line formatter + dead-code removal (K-40)

- **Priority:** P3
- **Problem statement:** Two parallel implementations format the same number-dependent Koa lines (copy drift risk), and dead view code (`bubble()`, `TodayTube`) plus a triple-rebuilt `KoaState` add noise and wasted work.
- **Current behavior:** `KoaToday.line` vs `KoaTalkLine` independently format rested/shortSleep/overate lines; `TodayDayBlock.bubble()` (line 369) and `TodayTube` have zero call sites (grep-verified); `TodayDayBlock` constructs the same `KoaState` 3 times per render.
- **Desired behavior:** One shared formatter used by both selectors; dead code deleted (or call sites restored if the design needs them); `KoaState` computed once and shared.
- **Affected components:** Today lines, room lines, Today hero.
- **Relevant files:** `ASCNDCore/Koa/KoaToday.swift` / `Features/Mascot/KoaToday.swift` (verify location), `Features/Mascot/KoaTalkLine.swift`, `Features/Today/TodayDayBlock.swift`.
- **Implementation proposal:** Extract the formatter; delete dead code; hoist the state construction. Verify locations with `git ls-tree` first (the KoaToday file location differs between explorer citations).
- **Acceptance criteria:** Format change in one place reflects on both surfaces; build succeeds after removal; Today hero renders identically.
- **Required tests:** Formatter tests; existing line/talk tests green.
- **Visual verification requirements:** Today + room line captures before/after (no change expected).
- **Regression risks:** None expected beyond the usual — keep the change mechanical.

## KOA-T41 — Single source for prices/rules + CI check (K-41)

- **Priority:** P3
- **Problem statement:** Prices and rules are duplicated across Swift constants and SQL seeds with no verified in-tree check; checker scripts exist only under `native/tools/` with unread contents and unknown CI coverage; the app never reads the price tables.
- **Current behavior:** Swift: `MascotRules.swift:40–47,71–76,79`, `KoaQuests.swift:60–70`, `MascotShop.swift:123–207,226–244`, `KoaDust.swift:17`, `WeeklyChallenges.swift:22–31`. SQL: train-loop prices, quests v2, economy authority, room decor/clean, reward key shapes. Values spot-checked MATCHING at tip. Monday computation in 3 places (folded into KOA-T21 — do not duplicate).
- **Desired behavior:** Fetch prices from the server tables (cached), or generate constants from migrations with a CI check; a test asserting Swift values == migration seeds.
- **Affected components:** Economy constants, migrations, CI.
- **Relevant files:** As listed above; `native/tools/` checker scripts (read first); `.github/workflows/`.
- **Implementation proposal:** Read the existing checker scripts and CI coverage first; choose fetch-vs-generate in the plan; implement + CI check; deliberate-mismatch fixture must fail CI.
- **Acceptance criteria:** Deliberate mismatch fixture fails CI; Swift == seed test passes; offline behavior defined (cached values).
- **Required tests:** Seed-equality test; mismatch-fixture CI run.
- **Visual verification requirements:** Shop/quest price displays unchanged (captures).
- **Regression risks:** Fetching prices changes offline behavior — cache + fallback required; generated constants add a build step — keep it simple and documented.

## KOA-T42 — `KoaReactionView` accessibility + Reduce Motion flash gate (K-42)

- **Priority:** P3
- **Problem statement:** The reaction view has zero accessibility support and its white flash is not Reduce-Motion-gated, while other effects in the same file ARE gated.
- **Current behavior:** `KoaReactionView.swift:53–56` hardcoded dark; `:84` white flash, no gate; `:87` skip as plain Text; `:95` whole-view onTapGesture; `:99` auto-end; 7 fixed fonts; no labels, no skip control, no announcement. (Contrast: `:129/131/140/152/183/218` effects gated.)
- **Desired behavior:** Mirror `CelebrationOverlay`: hide decor from VoiceOver, gate the flash, labeled dismiss control, announcement, `.isModal` where appropriate; replace fixed fonts with DS styles.
- **Affected components:** KoaReactionView.
- **Relevant files:** `Features/Mascot/KoaReactionView.swift`, `Features/Mascot/CelebrationOverlay.swift` (pattern reference).
- **Implementation proposal:** Add labels/identifiers, a real dismiss control, flash gating, and announcements; font pass to DS styles.
- **Acceptance criteria:** VoiceOver run: all content announced, dismiss operable; Reduce Motion run: no flash; added to `KoaAccessibilityAuditTests`.
- **Required tests:** A11y audit test coverage for the view; Reduce Motion behavior test where feasible.
- **Visual verification requirements:** VoiceOver + Reduce Motion captures/recordings (V19, V29, V31).
- **Regression risks:** Auto-end timing vs announcement — ensure the announcement completes; `.isModal` must not trap focus.

## KOA-T43 — Rest screen Dynamic Type + forced-dark decision (K-43)

- **Priority:** P3
- **Problem statement:** The rest screen forces dark mode and uses 12 fixed fonts with no Dynamic Type support. Labels/identifiers are good; type and appearance are the gap.
- **Current behavior:** `KoaRestScreen.swift:94–97` hardcoded dark; `:171` `.environment colorScheme .dark`; fixed fonts at `:181,191,205,211,215,220,264,267,291,315,318,338`.
- **Desired behavior:** DS styles / `@ScaledMetric` throughout (timer digits may use the DS number exception — document it); forced dark kept only if product-confirmed, with a comment recording the decision.
- **Affected components:** KoaRestScreen.
- **Relevant files:** `Features/Workout/KoaRestScreen.swift`.
- **Implementation proposal:** Font pass to DS styles; product-confirm the forced-dark choice with Kiệt (or in the plan); document the decision in code.
- **Acceptance criteria:** AX5 simulator: no clipping; light-mode appearance check passes per the decided behavior.
- **Required tests:** Snapshot tests at AX sizes if the harness supports them; existing rest tests green.
- **Visual verification requirements:** AX3/AX5 + light/dark captures (V30).
- **Regression risks:** Timer-digit scaling could break the ring layout — verify at all sizes; the forced-dark decision affects the room-adjacent aesthetic — keep consistent with KOA-T44.

## KOA-T44 — Room color scheme + poke under Reduce Motion (K-44)

- **Priority:** P3
- **Problem statement:** The room forces a color scheme over the whole subtree (day/night follows time, not the user's choice), and room poke is disabled under Reduce Motion, contradicting the figure component's own contract.
- **Current behavior:** `MascotRoomView.swift:205` `.environment colorScheme daytime?.light:.dark` (comment: bars/board still follow app); `KoaFigureView.swift:36–38` comment says onTap "still fires under Reduce Motion", `:113` hides when onTap==nil, `:140–161` tap via DragGesture; `MascotRoomView:1713,1719` passes nil handlers when Reduce Motion is on.
- **Desired behavior:** A dedicated palette/environment value for the room's day/night look, leaving `colorScheme` untouched (or product-confirm + document the forcing); poke handler passed always, gating only the squash/jump animation; consider a real Button wrapper for the tap.
- **Affected components:** Room view, figure view tap handling.
- **Relevant files:** `Features/Mascot/MascotRoomView.swift`, `Features/Mascot/KoaFigureView.swift`.
- **Implementation proposal:** Introduce the palette value; pass handlers unconditionally; gate animation only; verify VoiceOver stage actions still work.
- **Acceptance criteria:** System dark + daytime → room dark-appropriate (and vice versa); Reduce Motion simulator: tap triggers reaction without motion; VoiceOver stage actions work.
- **Required tests:** Handler-presence tests under Reduce Motion; palette tests.
- **Visual verification requirements:** Day/night × system theme matrix captures (V12); Reduce Motion poke recording (V11).
- **Regression risks:** Palette change affects the whole room aesthetic — capture every room scene; Button wrapper changes tap-area semantics — verify poke zones still map correctly.

## KOA-T45 — Dynamic Type + identifier sweep across Koa views (K-45)

- **Priority:** P3
- **Problem statement:** Fixed fonts violating the DS "no fixed sizes" rule are scattered across Koa views; `KoaBubble` risks clipping; `TellKoaSheet` has zero accessibility identifiers and 45 fixed fonts; the comeback "later" button is below 44pt.
- **Current behavior:** `KoaWeekCard.swift:15` 11pt header (the same header scales via `@ScaledMetric` in `TodayPlanHero:299–300`); `KoaTalkLine.swift:63` fixed 15pt + Dynamic Type cap `:70` + fixed 190×110 frame (clipping INFERRED); `KoaPeekHost:50,54,55`; `ShopView:405,411,452,458,622`; `KoaMonthView:333,395` 44pt; `KoaJourneyView:270` 15pt; `KoaComebackView:34` 24pt; `TodayAskKoaCard:77` 16pt chevron (minor). No swept `.font(.system(size:))` uses `relativeTo:` (grep-verified). `TellKoaSheet`: 0 identifiers in 2025 lines, 9 labels/hints, Reduce Motion handled. `KoaComebackView:49–51` plain-text button, no minHeight; `:33–35` title without `.isHeader`.
- **Desired behavior:** `TodayWeekStrip`/`RoomSummaryCard` `@ScaledMetric` pattern applied across the swept views; `KoaBubble` audited at AX sizes; identifiers on `TellKoaSheet` primary controls + DS styles; comeback button minHeight 44 + `.isHeader` + identifiers.
- **Affected components:** Week card, talk bubble, peek, shop, month/journey/comeback views, TellKoaSheet, Ask Koa card.
- **Relevant files:** As listed above.
- **Implementation proposal:** Mechanical sweep per view; re-run the `relativeTo:` grep after; AX3/AX5 simulator verification per view.
- **Acceptance criteria:** Re-sweep grep finds no unscaled fixed fonts in the listed views; AX3/AX5 no clipping; `TellKoaSheet` primary controls addressable by identifier in UI tests.
- **Required tests:** UI tests by identifier for TellKoaSheet; snapshot tests at AX sizes where supported.
- **Visual verification requirements:** AX3/AX5 captures per view (V30); `KoaBubble` clipping check.
- **Regression risks:** Scaling changes layouts — verify each view at default size too (no visual change expected at default); identifier additions must not break existing UI tests.

## KOA-T46 — Touch targets, peek persistence, Canvas text equivalents (K-46)

- **Priority:** P3
- **Problem statement:** Shelf tap targets are below the 44pt guideline (motor-access gap); the peek overlay auto-dismisses in 3.2 s with no VoiceOver extension; Canvas-drawn dust/repair text may have no VoiceOver equivalent (INFERRED — severity depends on whether the text is decorative).
- **Current behavior:** `MascotRoomView:1544–1557` 38pt cups / 32pt frames, height ≥44, VoiceOver-hidden (stage actions cover VoiceOver); `KoaPeekHost:21` 3200 ms hold, `:95–100` announcement then auto-dismiss; `KoaDustLayer`/`KoaRepairLayer` Canvas-drawn "KOA" signage/repair text with only a generic parent stage label.
- **Desired behavior:** Widen shelf hit areas with transparent padding (visuals unchanged) or record an exception decision; peek extends/holds while VoiceOver runs or the element is focused; Canvas text exposed via stage label/value or announcement if informative, documented if decorative.
- **Affected components:** Room shelf, peek host, dust/repair layers.
- **Relevant files:** `Features/Mascot/MascotRoomView.swift`, `Features/Mascot/KoaPeekHost.swift`, `Features/Mascot/KoaDustLayer.swift`, `Features/Mascot/KoaRepairLayer.swift`.
- **Implementation proposal:** Hit-area padding; VoiceOver-aware peek hold; VoiceOver run to decide the Canvas-text treatment; document decorative-vs-informative per element.
- **Acceptance criteria:** Assistive-touch tap testing passes on shelf items; VoiceOver run: peek persists until dismissed; Canvas-text decision recorded and implemented.
- **Required tests:** Hit-area tests where feasible; peek-hold tests with a VoiceOver double/flag.
- **Visual verification requirements:** Tap-testing notes + VoiceOver run captures (V14, V22, V29).
- **Regression risks:** Hit-area padding must not overlap adjacent targets; peek-hold changes must not strand the overlay on screen for non-VoiceOver users.

## KOA-T47 — Make accessibility audit tests fail + extend coverage (K-47)

- **Priority:** P3
- **Problem statement:** The a11y audit tests log issues but never fail, and Room/Shop/Rest/Reaction/Coach are uncovered — regressions are invisible.
- **Current behavior:** `KoaAccessibilityAuditTests.swift:3–8,89–100` phase "2a collection" — handler returns true, issues logged not failed; 4 tests (Today, pause sheet, Progress rhythm, Journey).
- **Desired behavior:** Tests fail on issues (or fail on new-vs-baseline); Room/Shop/rest/reaction/coach coverage added.
- **Affected components:** A11y audit test suite.
- **Relevant files:** `ASCNDKit/Tests/.../KoaAccessibilityAuditTests.swift` (verify exact path).
- **Implementation proposal:** Flip the handler to failing (or baseline-diff) semantics; add the five uncovered surfaces; fix or baseline the issues found.
- **Acceptance criteria:** A deliberately introduced issue fails the suite; removing it returns green; CI runs the suite; 5 new surfaces covered.
- **Required tests:** This task IS tests — plus a meta-check that the suite runs in CI.
- **Visual verification requirements:** None (test-only), except captures for any issues the new coverage surfaces.
- **Regression risks:** Failing semantics could block unrelated work if the baseline is dirty — use new-vs-baseline if the current issue count is nonzero; state the choice in the plan.

## KOA-T48 — Animation lifecycle: identity, coalescing, cancellation (K-48)

- **Priority:** P3
- **Problem statement:** The Today figure is destroyed/recreated on every mood change; mid-flight retriggers lack coalescing (INFERRED restart/flash semantics); sleep-then-act tasks ignore cancellation; the reaction gate's wait has no timeout.
- **Current behavior:** `TodayDayBlock.swift:291–298` `.id(emotion)` + opacity transition + 0.35 s animation discards KoaClock/KoaTouch/KoaLifeBox state (face tween already cross-fades 180 ms); `KoaLive.swift:57–82` KoaPop 0.50 s triggered by expression; `MascotRoomView:1726–1737` nod by celebrateSignal; `KoaDirectorDriver:284–289` `tapped()` sleeps 110 ms in an unstructured Task, no cancellation; `KoaFigureView:107–111` 500 ms sleep then poke; `KoaPullScene:71–104` sleeps then close; `KoaReactionView:25–28` 1 s sleep then 250 ms wait-poll, no timeout/cancel; `MascotRoomView:96–105` sequential loads, no cancellation.
- **Desired behavior:** Drop `.id(emotion)`, rely on the face tween; debounce ~150 ms / cancellable tasks / ignore increments mid-nod; check `isCancelled` after sleeps; 30 s timeout + cancel check for `waitIdle`; cooperative room task.
- **Affected components:** Today hero, KoaLive/KoaPop, room nod/speech, pull scene, reaction gate.
- **Relevant files:** `Features/Today/TodayDayBlock.swift`, `Features/Mascot/KoaLive.swift`, `Features/Mascot/MascotRoomView.swift`, `Features/Mascot/KoaDirectorDriver.swift`, `Features/Mascot/KoaPullScene.swift`, `Features/Mascot/KoaReactionView.swift`.
- **Implementation proposal:** Remove the identity reset; add coalescing/cancellation per site following the good patterns in ShopView/MascotStage/CelebrationOverlay.
- **Acceptance criteria:** Emotion changes show no bob-phase jumps; rapid taps (50 ms apart) yield one speech set; navigation-away cancels pending tasks; `waitIdle` times out.
- **Required tests:** Unit tests for coalescing (two taps → one), cancellation, timeout; existing tests green.
- **Visual verification requirements:** Simulator emotion-change + rapid-tap recordings (V6, V10) before/after.
- **Regression risks:** Removing `.id(emotion)` changes transition behavior — verify the tween covers it; cancellation must not drop legitimate delayed speech.

## KOA-T49 — Render caches: shop preview, widget off-main, per-frame scans (K-49)

- **Priority:** P3
- **Problem statement:** Three remaining render hot spots: the shop preview bypasses the `StudioPlans` cache, widget rendering runs on the main actor, and per-frame calendar work + full-history scans run on every Today evaluation.
- **Current behavior:** `ShopSceneView.swift:74` `KoaPaint.plan` in `body`, `:52` spring SS=2.0; room caches in `StudioPlans` 96-entry FIFO (`MascotRoomView:1760–1805`). `KoaWidgetPublisher.swift:135–167` 2 avatar 3× + 3 rest 2× renders on main actor, only `Task.yield()` between; header cites Sentry hang >2 s (26/10). `MascotRoomView:1671–1672` Calendar components per director step 30–60×/s; `TodayDayBlock:107,132` `KoaMomentsStore.next` twice/eval; `KoaJourney.swift:279` Set from full history per call; `KoaGains.swift:432` limit-2000 scan per body eval.
- **Desired behavior:** Keyed cache for the shop preview like `StudioPlans`; lazy/on-demand rest renders for the widget, or plan-to-CGContext off-main (feasibility INFERRED — needs a spike; keep the `imageKey` guard); hour/minute cached per minute tick; history-derived values memoized keyed by history count + today.
- **Affected components:** Shop preview, widget publisher, room director step, Today evaluation, journey/gains scans.
- **Relevant files:** `Features/Mascot/ShopSceneView.swift`, `Features/Mascot/KoaWidgetPublisher.swift`, `Features/Mascot/MascotRoomView.swift`, `Features/Today/TodayDayBlock.swift`, `ASCNDCore/Koa/KoaJourney.swift`, `ASCNDCore/Koa/KoaGains.swift`.
- **Implementation proposal:** Implement the three fixes; spike the off-main widget render first and report feasibility before committing to it; measure with Instruments + DEBUG counters.
- **Acceptance criteria:** Instruments improvement toggling try-on and during Today evaluation (report numbers); no main-thread hang after widget key change; identical visuals.
- **Required tests:** Cache tests; memoization tests; widget-guard tests.
- **Visual verification requirements:** Before/after captures (identical) + Instruments traces (V34).
- **Regression risks:** Cache staleness (same discipline as KOA-T10); off-main rendering feasibility unknown — the spike may conclude lazy/on-demand is the right fix instead.

## KOA-T50 — Room speech topic burn + duplicate wav audit (K-50)

- **Priority:** P3
- **Problem statement:** Scheduled room speech burns a topic for the day when its numbers are missing, and ten `koa-talk-*.wav` files are byte-identical duplicates (~60 KB) of unverified reference status.
- **Current behavior:** `KoaDirectorDriver.nextLine` (~365–385): `talkLog.said` appended and persisted BEFORE the `guard let line` check; nil line (numbers missing) → silent return, topic stays said. Ten talk wavs byte-identical; whether all ten names are referenced was NOT verified.
- **Desired behavior:** Resolve the line before appending to `talkLog.said`; only mark said when a line actually speaks. Dedupe the wavs or document why the duplicates exist.
- **Affected components:** Director driver speech scheduling, sound assets.
- **Relevant files:** `Features/Mascot/KoaDirectorDriver.swift`, `Features/Mascot/KoaTalkLine.swift`, `Resources/Sounds/`, `Features/Mascot/KoaSound.swift` (mapping).
- **Implementation proposal:** Reorder mark-said after line resolution; blob-hash + grep audit of the wav names; dedupe or document.
- **Acceptance criteria:** Room opened with delayed signals → number-dependent topics still speak later in the visit; wav audit complete with a dedupe/document decision per file.
- **Required tests:** Speech-scheduling tests (missing-numbers → retry later); asset-reference test.
- **Visual verification requirements:** Delayed-signals room-visit recording (V9) before/after.
- **Regression risks:** Reordering must not double-speak topics (mark-said still happens exactly once per spoken line); wav dedupe must preserve the cue mapping.

## KOA-T51 — Welcome-grant fallback: bounded, ordered ledger read (K-51)

- **Priority:** P3
- **Problem statement:** The welcome-grant fallback ledger read has no order/limit and can re-celebrate the 300-coin welcome; the tried-latch resets on any error, risking a retry loop.
- **Current behavior:** `SupabaseMascot.swift:26–37` fallback select, no order/limit, only PGRST202 caught; `MascotRoom.swift:372–384` `welcomeTried` reset on ANY error (`:382`), `welcomeGranted = amount` (`:378`). Fallback reintroduces the AUD-28 failure (PostgREST max-rows truncation, arbitrary order) → welcome row absent → claim returns 300 → repeat celebrations.
- **Desired behavior:** Filtered select for welcome presence (or truncation detection); reset `welcomeTried` only on retryable errors; rely on the KOA-T01 duplicate signal.
- **Affected components:** Welcome grant flow, wallet fallback read.
- **Relevant files:** `ASCNDBackend/SupabaseMascot.swift`, `ASCNDCore/Mascot/MascotRoom.swift`.
- **Implementation proposal:** Replace the unbounded fallback with a presence-filtered query; narrow the latch reset; coordinate with KOA-T01.
- **Acceptance criteria:** Test DB without `mascot_wallet()` + >1000 rows → no false re-celebration; ceiling-error fake → no retry loop.
- **Required tests:** Fallback tests with large ledgers; latch-reset tests per error kind.
- **Visual verification requirements:** Fresh-account room-open captures; no repeat welcome celebration on reload.
- **Regression risks:** Filtered-query shape must match PostgREST behavior — verify against a test DB; latch changes must not strand genuinely ungranted welcomes.

## KOA-T52 — Gains history: paginate or snapshot past 2000 rows (K-52)

- **Priority:** P3
- **Problem statement:** The 2000-row cap silently lowers Gains for long-term users; sessions/overload reads are non-atomic; overload failure publishes a degraded state.
- **Current behavior:** `KoaGains.swift:432–438` limit 2000 newest-first; `:459–464` same cap for overload; `:482–492` overload failure → `[]` (`:486`), degraded state published. Beyond ~2000 sessions (~5.5 years daily) oldest rows drop; peak is derived, not stored. Two sequential reads can straddle a new session/claim. Zero test references for `KoaGainsSync.load`.
- **Desired behavior:** Paginate the full history, or a server-side snapshot/peak + incremental compute; keep the previous Loaded state on partial failure; surface truncation at minimum.
- **Affected components:** KoaGainsSync, Gains computation, AppServices caller.
- **Relevant files:** `ASCNDCore/Koa/KoaGains.swift`, `App/AppServices.swift:859` (sole caller).
- **Implementation proposal:** Choose paginate-vs-snapshot in the plan (snapshot needs a migration + backfill decision); implement failure-retains-previous; add the missing test coverage.
- **Acceptance criteria:** >2000-fixture-row test computes full Gains; overload-failure test retains previous state; no silent undercount.
- **Required tests:** >2000-row fixture test; partial-failure test; atomicity/straddle test.
- **Visual verification requirements:** Gains/rank display captures for a long-history fixture before/after.
- **Regression risks:** Pagination changes load latency — measure; snapshot migration needs a backfill + consistency story — state it in the plan; interacts with KOA-T20's week-rule decision.

## KOA-T53 — Structured error codes for economy mapping + clean-room tests (K-53)

- **Priority:** P3
- **Problem statement:** Economy error mapping relies on substring matching of SQL message text, so rewording a RAISE breaks the mapping; named failures lose SQLSTATE; `cleanKoaRoom` and the ledger mapping are untested.
- **Current behavior:** `SupabaseMascot.swift:224–240` lowercased `contains()` on RAISE text, code only in fallback; `MascotRoom.swift:392–395` unknown → `.server(code: nil)`; `cleanKoaRoom` (−30/day, `:215–221`) zero test refs; `mascot_wallet()` fallback (`:26–37`). `claim_community_challenge` already uses ERRCODEs — the better pattern exists. `MascotMappingTests` coverage: 4 tests, gaps at the mapping edges.
- **Desired behavior:** Match on SQLSTATE/ERRCODE, or centralize message constants shared by SQL + Swift tests; `cleanKoaRoom` + ledger mapping covered by fake-transport tests.
- **Affected components:** SupabaseMascot error mapping, clean-room RPC, mapping tests.
- **Relevant files:** `ASCNDBackend/SupabaseMascot.swift`, `ASCNDCore/Mascot/MascotRoom.swift`, mapping tests, relevant migrations.
- **Implementation proposal:** Adopt the ERRCODE pattern; add fake-transport mapping tests; reword-a-RAISE test proving the mapping holds.
- **Acceptance criteria:** Reworded RAISE in a test DB → mapping holds; `cleanKoaRoom` success/failure paths tested; staging run confirms.
- **Required tests:** Mapping tests per code; clean-room tests; reword-robustness test.
- **Visual verification requirements:** Clean-room flow captures (room cleaning) before/after; no behavior change expected.
- **Regression risks:** ERRCODE adoption touches SQL + Swift together — coordinate rollout; keep backward-compatible fallback during skew.

## KOA-T54 — Economy edge-case sweep (K-54)

- **Priority:** P3
- **Problem statement:** Six small economy edge cases, each independently minor, sharing one theme: boundary/consistency handling. Fixed together as a sweep with per-item acceptance criteria; each item is small enough to review separately within one PR, or split if review prefers.
- **Current behavior:**
  1. `mascot_wallet()` claimed list grows unbounded via `clean:`/`freeze:` keys, contradicting the bounded design (`20261112150000:47–56`, header `:19–20`).
  2. Awards grant-once flag set before the outcome is known; offline grants never retried in-session (`Awards.swift:361–364`).
  3. Room week summary shows "claimed" when the week is merely complete (`MascotRoomView:704–719`, ignores the claim enum; contrast `KoaWeekCard:38–53`).
  4. Last-week catch-up claim uses a 14-day UI window with zero slack on Mondays (`TodayExtras:844–847`, `TodayController:101`); server `ch:` window is 15 days (boundary-drop mechanism INFERRED).
  5. Community-challenge ceiling counts explore coins; quest-claim ceiling does not (`community_challenges:184–189` vs `koa_quests_v2:121–133`; up to 195 explore coins consume community headroom only).
  6. Pause `active` ignores the start date; long spells silently clamped client-side; decode lacks the `e>=s` check the log decoder has (`KoaPause.swift:26,20–23,58–63,129`); possible overwrite chain pushing truncation back (INFERRED).
- **Desired behavior:** (1) Restrict claimed to `welcome`/`x:`/`set:` (+legacy `w:` if queried); exclude `clean:`/`buy:`/`freeze:`/`cc:`. (2) Set `checked` only after grant + successful re-read, or retry on next `load()`. (3) Pass the claim enum into `weekSummary`. (4) Build from Gains history or extend the window; boundary test. (5) Exclude `x:` in the community sum too, or document the difference. (6) `active` requires start≤today≤last; preserve length or surface the clamp; reject `e<s` in both decoders.
- **Affected components:** Wallet SQL, AwardsBook, room summary, catch-up claim, community ceiling SQL, KoaPause.
- **Relevant files:** `supabase/migrations/20261112150000_mascot_wallet.sql`, `ASCNDCore/Mascot/Awards.swift`, `Features/Mascot/MascotRoomView.swift`, `Features/Today/TodayExtras.swift`, `ASCNDCore/Workout/TodayController.swift`, community-challenge migration, `ASCNDCore/Koa/KoaPause.swift`.
- **Implementation proposal:** Implement per item; per-item tests; document item (5)'s decision either way.
- **Acceptance criteria:** (1) 100 clean rows → claimed excludes `clean:`, stable size. (2) Offline-fail then online `load()` → retried. (3) Complete-week-offline UI test → reward text, not "claimed". (4) Monday + 13-day-old session → included. (5) SQL test: `x:` claims then community reward near ceiling → decided behavior. (6) Future-pause + 20-day-spell tests pass.
- **Required tests:** Per-item tests as listed; existing suites green.
- **Visual verification requirements:** Room summary + catch-up captures before/after; others are logic-only.
- **Regression risks:** (1) and (5) are SQL changes — test-DB verification required; (6) pause changes interact with KOA-T23 — sequence accordingly.

## KOA-T55 — One claim-state helper for all duplicate tracking (K-55)

- **Priority:** P3
- **Problem statement:** Five overlapping duplicate-tracking mechanisms exist, none shared; the server UNIQUE constraint is the only true dedup. Each path can disagree with the others.
- **Current behavior:** KoaWeekBook UserDefaults seen-keys (`KoaWeek.swift:122`); AppServices quest seen-keys (`:616`) + persisted pending queue (`:644–657`); QuestObserver in-memory sent/owed (`:55–57`); `MascotWallet.claimed` server ledger (`MascotRoom.swift:37–43`); MascotShopBook wallet set + claiming flag only.
- **Desired behavior:** One claim-state helper — server claimed set first (`mascot_wallet()`), fallback persisted seen-set, outcomes recorded through it; all claim sites routed through it. Depends on KOA-T01's contract.
- **Affected components:** All claim paths (quests, week, shop, challenges, collections, community, cleaning, welcome).
- **Relevant files:** As listed above + `MascotShop.swift`, `WeeklyChallenges.swift`, `SupabaseMascot.swift`.
- **Implementation proposal:** Build the helper after KOA-T01 lands; migrate sites one by one; audit that all sites use it; cross-path test (observer-claim then Room → no second celebration).
- **Acceptance criteria:** Audit confirms all claim sites use the helper; cross-path test passes; no behavior change for fresh claims.
- **Required tests:** Helper unit tests; cross-path integration test; per-site migration tests.
- **Visual verification requirements:** Cross-surface celebration-dedup captures (claim in one surface, open another).
- **Regression risks:** Large refactor surface — migrate incrementally, one site per commit; the fallback seen-set must survive app restarts (persisted, not in-memory).

## KOA-T56 — Streak bonus / freeze: dead or alive? ⛔ DECISION GATE (K-56)

- **Priority:** P3
- **Problem statement:** Dead economy surface: the streak bonus is unreachable, the freeze catalog entry has no consumers, and a challenges book is built/passed but never rendered. Keeping dead code misleads; restoring without a product decision re-adds a removed feature.
- **Current behavior:** `autoClaimStreak` never called (`MascotRoom.swift:342`, comment: streak coins removed 02/11); zero callers of `claimStreakBonus`; `TodayExtras:475–479` listens to `streakAutoClaim` which can never be set; `QuestObserver` claims daily quests only; `MascotShop.consumables` streak-freeze entry (`:219–224`) with no consumers; no Swift calls buy/use streak-freeze (sale revoked server-side); 15-coin `d:<date>:streak` reward has no UI path. `WeeklyChallengesBook` built (`TodayExtras:399`), passed (`:347`), accepted by `MascotRoomView:29` but never used in body; `ChallengesView` has no instantiating caller. A test pins the intent (`streakCoinsAreNoLongerClaimedByThemselves`).
- **Desired behavior:** Kiệt decides: delete the API/listener/catalog entry/plumbing, OR restore a claim path. Record the decision.
- **Affected components:** MascotRoom streak API, MascotShop consumables, TodayExtras listeners, WeeklyChallengesBook plumbing, ChallengesView.
- **Relevant files:** `ASCNDCore/Mascot/MascotRoom.swift:235–350`, `ASCNDCore/Mascot/MascotShop.swift`, `Features/Today/TodayExtras.swift`, `Features/Mascot/MascotRoomView.swift`, `Features/Mascot/ChallengesView.swift`.
- **Implementation proposal:** Present the delete-vs-restore options; implement the decision; grep-verify zero refs after deletion (or a working claim path after restore, with a UI test: streak≥2 + logged-today).
- **Acceptance criteria:** Delete: grep zero refs, suite green. Restore: working claim path + UI test + strings in 3 languages.
- **Required tests:** Deletion verification or restore-path tests; existing suites green.
- **Visual verification requirements:** Restore option: streak-claim UI captures. Delete option: none.
- **Regression risks:** Deletion must not break the test pinning the removal intent — update or keep it deliberately; restore re-opens the economy surface — needs the KOA-T01 contract.

## KOA-T57 — Rank gates: fix stale gains + decide on client-only enforcement ⛔ DECISION GATE (K-57)

- **Priority:** P3
- **Problem statement:** Rank gates are client-only (a modified client can buy rank-locked items), and `MascotShopBook.gains` can stay stale at rank 0, showing false locks for a whole room visit.
- **Current behavior:** Server doesn't check rank (`MascotShop.swift:82–90`, gate `:327–331`); `gains` defaults `.zero` (`:417`); only assignment `MascotRoomView:98` once in `.task`, never updated; `TodayExtras:398` creates the shop without gains; `ShopView:261,373,599` reads it. Room task racing before `loadGains` → rank 0 for the visit.
- **Desired behavior:** Derive gates from a shared observable (`services.koaGainsNow`) or update on room gains change, so fresh-login immediate room open shows the true rank; record an explicit decision on whether client-only gates are acceptable (server-side rank check is the alternative — state the cost in the plan).
- **Affected components:** MascotShopBook, room/shop gains plumbing, optionally `buy_mascot_item`.
- **Relevant files:** `ASCNDCore/Mascot/MascotShop.swift`, `Features/Mascot/MascotRoomView.swift`, `Features/Today/TodayExtras.swift`, `Features/Mascot/ShopView.swift`, `App/AppServices.swift`.
- **Implementation proposal:** Single-source the gains value; remove the manual assignment; present the server-check option with cost; implement per Kiệt's decision.
- **Acceptance criteria:** Fresh-login simulator: immediate room open shows the true rank; no false locks; manual assignment removed; decision recorded.
- **Required tests:** Rank-gate tests incl. the race (room open before gains load); bypass test documenting current client-only behavior.
- **Visual verification requirements:** Fresh-login room/shop captures before/after.
- **Regression risks:** Shared-observable wiring must update the shop live when gains change; a server-side check is a SQL change — separate rollout if chosen.

## KOA-T58 — Archive or banner the superseded decay mocks (K-58)

- **Priority:** P3
- **Problem statement:** Two mocks propose decay mechanics that were removed 21/10 and contradict the code; anyone reading them as current will design against a dead product.
- **Current behavior:** `koa-train-loop.html` + `koa-wave2-schedule.html` propose pump loss after 3 missed days / rank drop after 7 days + ×2 muscle memory. Code has NO decay ever (`KoaGains` header; `CONSTRAINTS_AND_DEFERRED.md:102`); `KoaGains.add` doubles only below the pre-21/10 peak.
- **Desired behavior:** A visible "SUPERSEDED — no decay since 21/10" banner on both mocks, or move them to an archive folder; no doc links present them as current.
- **Affected components:** Design mocks, docs links.
- **Relevant files:** Mock HTML files (locate under docs/design/mocks), `CONSTRAINTS_AND_DEFERRED.md`.
- **Implementation proposal:** Banner or archive; grep to confirm no doc links them as current.
- **Acceptance criteria:** Visual banner check on both files (or archive location); grep clean.
- **Required tests:** None (docs-only). Link check via grep.
- **Visual verification requirements:** Screenshot of the bannered mocks.
- **Regression risks:** None.

## KOA-T59 — Localize rest/reaction cue titles + real ring duration (K-59)

- **Priority:** P3
- **Problem statement:** Rest beats show hardcoded Vietnamese titles to en/es users (except two titles matched by fragile string equality), and the ring shows a fixed "1:30" regardless of the actual rest duration. (Non-Vietnamese impact INFERRED from hardcoded literals.)
- **Current behavior:** `KoaPerformance.swift` cue titles "XONG SET!", "KỶ LỤC MỚI!", "LƯỢT MÌNH!", "XONG BUỔI!" + sample stats; `KoaRestScreen.title()` localizes only two titles by string equality; `KoaReactionView.ring()` hardcodes "1:30".
- **Desired behavior:** Localization keys (or a title enum) stored in cues, rendered via `String(localized:)`; the real rest duration passed into `ring()`.
- **Affected components:** Performance cue data, rest/reaction rendering, strings.
- **Relevant files:** `ASCNDCore/Koa/KoaPerformance.swift`, `Features/Workout/KoaRestScreen.swift`, `Features/Mascot/KoaReactionView.swift`, localized strings.
- **Implementation proposal:** Migrate titles to keys/enum; add en/es strings; thread the duration into the ring; remove the string-equality matching.
- **Acceptance criteria:** App language en/es → translated beat titles; ring shows the true duration for 60 s, 90 s, and 180 s rests.
- **Required tests:** Key-coverage tests (all cues have keys in all 3 languages); ring-duration tests.
- **Visual verification requirements:** Rest-beat captures in en/es + varied durations (V17) before/after.
- **Regression risks:** Cue-title changes affect snapshot/golden tests — update deliberately; the enum migration must cover DEBUG-preview scenes too.

## KOA-T60 — Cover the untested seams (K-60)

- **Priority:** P3
- **Problem statement:** Zero test references exist for `KoaSceneData`, `KoaGainsSync.load`, `cleanKoaRoom`, and `StreakMissed.missedDates` (direct); zero `KoaWeek` tests pass `paused:`; `KoaMomentFeed`/analytics claims in `KOA_ECOSYSTEM.md` are unverified; golden streak-case coverage vs `StreakMissed` is unverified.
- **Current behavior:** 688 tests across 72 files (counted at tip), with the gaps above (grep-verified). `KoaGainsSync.load` is covered by KOA-T52's tests and `cleanKoaRoom` by KOA-T53's — this task covers the remainder and verifies the doc claims.
- **Desired behavior:** Tests for `KoaSceneData` (parse the blob / read the generator; verify 360°/angle claims), `StreakMissed.missedDates` (direct + golden equivalence), paused-path `KoaWeek` tests (all 10 call sites + 2 in ProgressStatusTests currently pass no paused value); `KoaMomentFeed`/analytics claims verified against code or corrected in the doc.
- **Affected components:** Test suites, KoaSceneData, StreakMissed, KoaWeek paused paths, ecosystem doc.
- **Relevant files:** `ASCNDCore/Koa/KoaSceneData.swift`, `ASCNDCore/Mascot/StreakMissed.swift`, `ASCNDCore/Mascot/KoaWeek.swift`, `KOA_ECOSYSTEM.md`, `gen-koa-scene.mjs` (verify path), golden tests.
- **Implementation proposal:** Write the missing tests; parse or generate-check the scene blob; verify-or-correct the doc claims; confirm golden streak coverage equivalence.
- **Acceptance criteria:** Each named seam has direct test coverage; paused-path tests exist; doc claims verified or corrected; golden-vs-`StreakMissed` equivalence established.
- **Required tests:** This task IS tests.
- **Visual verification requirements:** None, except captures if the 360°/angle verification needs a render check.
- **Regression risks:** Scene-blob parsing may reveal the 360° feature is unloaded dead weight — report the finding rather than silently testing around it.

---

## Appendix — Task → finding → explorer trace

| Tasks | Findings | Explorers |
|---|---|---|
| T01–T04 | K-01–K-04 | E1-F2/F3, E3-F20, E3-F9, E4-F14 |
| T05–T12 | K-05–K-12 | E1-F1/F5, E3-F1/F7, E3-F2, E3-F4/F46, E3-F3, E2-F1, E2-F2/F3, E2-F4 |
| T13–T20 | K-13–K-20 | E3-F25, E3-F30/F31, E3-F35, E2-F12+E1-F12, E1-F4/F13+E2-F12, E1-F8/F9, E1-F10+E2-F14, E1-F6/F7+E4-F1/F4 |
| T21–T39 | K-21–K-39 | E4-F2/F3, E4-F6/F7/F8, E4-F5/F15/F16, E1-F15/F16, E3-F36/F37, E3-F40, E3-F34, E3-F38/F39+E2-F10, E3-F26/F27, E3-F28/F29/F33, E3-F6/F24, E3-F16, E3-F18/F19/F21, E3-F10/F13/F14/F15, E3-F12, E3-F8/F17, E3-F22/F23/F45, E3-F5, E3-F41 |
| T40–T60 | K-40–K-60 | E3-F44/F43, E1-F17, E4-F18, E4-F19, E4-F20/F23, E4-F21/F26/F27, E4-F22/F25/F28, E4-F24, E2-F5/F6/F7, E2-F8/F9/F16, E3-F32+E2-F17, E1-F14, E1-F23, E1-F24+E4-F13, E1-F20/F21/F22/F25/F26/F27, E1-F28, E1-F11+E4-F11, E1-F18, E4-F17, E3-F42, coverage gaps |

Overlaps de-duplicated during synthesis: E4-F1≈E1-F7, E4-F4≈E1-F6, E4-F9≈E1-F4+E2-F12, E4-F10≈E1-F23, E4-F11≈E1-F11, E4-F12≈E1-F12, E4-F13≈E1-F24 (partial), E4-F16 resolved by coordinator verification (see report §2).
