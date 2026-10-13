# Today tab: what came from RN, what changed, and what is new

This page is the record for the native Today tab, the approved redesign (`README.md` + `mock/`, PDF `ASCND_Today_tab-selection`).

The rule is:
- follow RN @ fac9ac2 where RN already has the behaviour;
- improve it only where the redesign or a measured flaw asks for it;
- build something new only where RN has nothing.

Read this before porting anything else from RN's `(tabs)/index.tsx`. Several RN pieces are **intentionally gone**, and porting them back would undo an owner decision.

Status:
- every row below has been checked on the Limrun simulator (iOS 26.4);
- no row has been checked on a real device;
- device QA is Kiệt's.

## Page order

| # | Native piece (file) | RN source @ fac9ac2 | Decision |
|---|---|---|---|
| 1 | Large title "Today" + date, streak chip, avatar (`TodayExtras.header`) | `BrandLockup`, `StreakChip`, `AccountAvatar` in `(tabs)/index.tsx` | **Changed.** The logo is dropped because it is on the app icon (spec). The streak chip (≥ 1, opens the mascot room) and the avatar (opens Settings) are kept as in RN. |
| 2 | Day block (`TodayDayBlock`, `TodayDay`, `MascotLine`) | `EnergyRing`, Koa row + quest dots, `useMascot().line` (`lib/mascot*`) | **Changed / ported.** One block replaces the three RN views (ring, quest dots, to-do count); details below. |
| 3 | Workout card (`TodayView.planCard`) + readiness row (`TodayReadinessRow`) | `today-training.tsx`, `ReadinessGauge` hero | **Changed.** The readiness hero becomes a row inside the card; details below. |
| 4 | "Your day" (`TodayYourDay`) | `todo-card.tsx`, plus the water and steps widgets | **Changed + new.** Details below. |
| 5 | "More about today" (`TodayMore`) | the group cards (`DEFAULT_CONFIG`: health, fitness, insights) | **Changed.** One-line rows; each full card stays one tap away. |
| 6 | Apple Health sync card (`HealthSyncCard`) | `useHealthSync` card | **Kept as RN.** It is not in the mock, but it is the only way in to connect Health. Removing it would cut off steps and biometrics. |

## Day block

| Behaviour | RN | Native |
|---|---|---|
| Koa's line | `mascotLine(day, order, dueFrom)` + `nMascot*` strings | **Ported with a golden** (`MascotLine`, `mascot-line-golden.json`, 1200 cases). The strings are verbatim RN in vi / en / es (`today.koa.*`). |
| Order and learned hours | bandit order and personal hours (`personal.hours`) | **Not ported.** Native uses RN's defaults (`gapFrom` / `gapSpan`), which is RN's own behaviour for a new account. Port the bandit as its own task; do not hand-tune the defaults. |
| Praise once a day | `mayPraise(today)` (AsyncStorage) | **Same rule** (`MascotLine.allowPraise`), stored in UserDefaults `ascnd-koa-praised-on.<user>`. |
| Greeting before anything is logged | none: RN shows nothing | **New**, spec copy: "A fresh day. Log anything below and Koa wakes up." (`today.koa.greet`). |
| The mock's sentence "Sleep's in. I'm hungry — a meal is next, worth +10." | none | **Not used.** The mock text is not RN copy, and the spec says "do not invent lines". The coin value sits on the action pill instead ("Log a meal +10"). |
| "N of 5" | energy ring count (`ENERGY_SIGNALS`) | **Same signals and rules.** Counted from the tubes, so water logged on the device counts before sync. |
| Coins waiting | quest dots + unclaimed coins | **Same source** (`activeQuests`, `isClaimed`). Tapping opens the mascot room, where claiming happens. Today does not claim. |
| Five tubes | none: RN has a ring | **New** (spec option C). Water and steps fill partially; the others are 0 or 100 %. "Next" is the `MascotLine` gap. |
| Water "+250 ml" | `useAddWater`: optimistic patch, haptic in `onPress`, `invalidateQueries` on settle | **Same.** `WaterBook.add` goes through the outbox. The tube and Koa read `WaterBook.totalMl`, which includes pending glasses, as RN's `useTodayWater` does. The light haptic fires on tap. Today reloads when the outbox drains. |
| Koa's outfit | `wornFrom(equipped)` | **Not yet.** Today does not read the shop inventory, so Koa shows the default outfit. To do: pass `equipped` from the shop book. |
| Reduce Transparency / Reduce Motion | n/a | **New.** Solid fills instead of glass; no idle animation or glow pulse. |

## Workout card

| Behaviour | RN | Native |
|---|---|---|
| Title | `heading`: template name, else the status | Same. |
| Meta line | `nExerciseCount · N sets` and `~N min` (`estimatedMinutes`, `prescription.ts:86`) | **Changed to the spec**: the first three exercise names, then `~N min`. It uses the same `estimatedMinutes` (`TemplateDraft.estimatedMinutes`) with the plan's rest seconds (`TodayExercise.restSeconds`). The per-exercise list moved to the workout screen. RN does not list exercises on Today either. |
| CTA | `todayCta` (`lib/today-cta.ts`): start / extra / logFree / pick | **Same decision table.** "Pick a workout" is now the solid primary button (spec); in RN it was light. |
| Readiness | hero gauge 264 pt, tap to expand | **Changed.** It is now a row: score in Menlo 30 in the zone colour, then the zone word (`rd.status.*`, RN text), then the reason (`explainText`, the two lowest inputs, RN). Tapping opens RN's card already expanded (`ReadinessCardView(startExpanded:)`) with its five tiles, recommendation, "?" and biometrics link. |
| No score | `EmptyHero` "—" + `dashReadinessMsg` | "—" is never shown as 0. Short spec copy on the row (`today.rd.none*`); RN's full message stays in the details sheet. **New:** "Log sleep" next to the CTA, because one night of sleep is one of RN's ways to get a score. |

## Your day

| Behaviour | RN `todo-card.tsx` | Native |
|---|---|---|
| Rows | meal, workout, sleep, biometrics, weight | **Changed.** The five energy signals come first (sleep, meal, water, workout, steps), each with its quest coins. Then a 6 pt gap, then weight and biometrics. |
| "Done" flags | meal = `kcal > 0`; workout = `workout_count > 0`; sleep = row or minutes; biometrics / weight = a row today | **Same sources.** Signals come from `DailySignals` (water merged with pending); weight and biometrics come from `ReminderTodayBook`. |
| Tap | opens the logger in any state, so you can add another meal or fix sleep | **Same.** The whole row is the button. |
| Trailing | black "Log" / green "✓ Logged" | **Changed (spec).** A filled check in the signal colour, a bordered "Log" or "+250 ml", or "Auto" for steps. |
| Detail line | none | **New.** Measured values ("7 h 40 min", "0.8 of 1.9 L", "4,120 of 10,000 · Apple Health", "Chest day is planned"), never a fake 0. |
| Steps | `StepsWidget` card | Row with "Auto", which opens the Steps screen (`StepsView`). |
| Swipe to skip, reminder time, toggle | RN only | **Not ported** (was already missing). |
| Header hint | spec: "Each one fills the ring" | **Changed** to "Each one fills a tube", because option C replaced the ring with tubes. |

## More about today

| Row | Value | Destination | RN source |
|---|---|---|---|
| Biometrics | `hr bpm · hrv ms` from today's latest sample, else "—" | `BiometricsView` | `BiometricsCard` |
| Training this week | `loadComparison(acwr)`: "+8%" or "−12%" against the 4-week habit; "—" without ACWR | `TrainingCardView` — the full RN training card (B, N3) | `TrainingCard` (`today-widgets-2.tsx:400`) + `training-card.ts`, `training-week.ts`, `goal-training.ts` → `TrainingCard` / `TrainingCardBook` (Core, `training-card-golden.json`) |
| Readiness trend | `avg N` (7 days), "—" under 2 days | trend screen. **New:** an empty state instead of a blank page under 2 days; RN hides the card | `ReadinessTrendCard` |
| Activity | rings closed today, "N/3" (native-only value) | `ActivityRingsView` — the RN activity rings card (B, N4) | `ActivityRingsCard` (`activity-rings.tsx`) + `lib/activity.ts` → `ActivityRings` / `ActivityRingsBook` (Core, `activity-golden.json`) |
| Weekly review | — | `WeeklyReviewView` | Assistant tab in RN |
| Buddy room | `Lv N` | `MascotRoomView` | Koa row in RN |

**Training card (N3, B):** the row opens the full card as its own screen, in RN order: the verdict sentence tinted by zone and what to do about it, the two load figures it compares (tonnage printed small under each), strength days against the goal, the stale note past 7 days, the 8-week volume chart with the dashed habit line drawn over the bars, and the latest session (tap → history). The "?" opens `TrainingExplainerSheet` (`training-explainer.tsx`). RN at fac9ac2 has no ACWR band bar on this card any more (the chart replaced it), so none is drawn.

## Audit of RN Today features (2026-10-12)

The whole of RN `(tabs)/index.tsx` @ fac9ac2 (14 widgets, hero deck, edit mode, focus hooks) was checked against native Today.

### Added in this pass

| RN behaviour | Native now |
|---|---|
| `useCheckAwards` on every focus: grants newly earned awards and celebrates them | Awards are checked on build, on return to the foreground and on pull-to-refresh (`AwardsBook.load`, which grants). A new award shows a glass toast "New award: …" with a success haptic and a VoiceOver announcement; tapping it opens the mascot room. **Before this pass, native Today created the awards book but never loaded it, so nothing was granted from Today.** |
| `useUpdateChallengeProgress` on every focus | `WeeklyChallengesBook.refreshProgress()` runs at the same moments. Before, it ran only from the Challenges screen's pull, so a week of workouts sat at 0 until that screen was opened (the same bug RN fixed). |
| Pull to refresh: `invalidateQueries()` + light haptic | The pull reloads the plan (`TodayScreen`) **and** every Today book: signals, water, readiness, biometrics, trend, awards and challenges. Light haptic on pull. |
| `TodaySkeleton` / `LoadFailed` | The day block shows a placeholder of the same size while loading, and "couldn't load" with Retry on failure. Before, it simply vanished. |
| Sleep widget → `/sleep-insights` | "More about today" has a **Sleep** row: last night's `7h40`, or "—". It opens `SleepInsightsView`. |
| `SupplementChecklistCard` (nutrition group) | A **Supplements** row shows `taken/total` when there are any and opens `SupplementsView`. |
| `useTodayWater`: one cache shared by every screen | Today uses the **session's shared** `NutritionBooks.water` (the same instance as the Nutrition tab). A glass added on either tab shows on the other at once. Before, Today had its own `WaterBook`. |

### Deliberately not on Today (on purpose, or living elsewhere)

| RN widget / feature | Where it is instead / why |
|---|---|
| Hero deck (swipe pages: readiness, activity, nutrition, water, sleep) | Replaced by the day block (spec option C). Readiness → workout card row; nutrition, water and sleep → "Your day" rows plus the tubes. |
| Edit layout (drag to reorder, add/remove groups, `useWidgetConfig`) | Dropped by design: fixed page order (spec). |
| `NutritionHero` / `NutritionCard` (kcal vs target, macros) | Nutrition tab (`NutritionTodayCard`). Today's Meal row shows kcal logged. |
| `WeightCheckinCard` history | The Weight row opens the logger; history lives in Progress. |
| `RecentAwardsCard` | Buddy room → Awards; new awards toast on Today (above). |
| `SmartTipsCard` (AI tips) | Assistant tab (`SmartNudges`). |
| `WorkoutStatusCard` | The workout card. |

### Still missing (port as their own tasks)

- `PeekHost`: Koa peeking from behind a card when a quest completes (`allowPeek` budget). Native has no peek; the tube rise and done-check bounce stand in.
- `SleepHero` stages and quality on Today: the Sleep row shows duration only.

## Removed on purpose (do not port back onto Today)

- `BrandLockup`: the logo is on the app icon.
- `EnergyRing` and the Koa row with quest dots: the day block counts the day once.
- `ReadinessGauge` hero: it is now a row in the workout card.
- `TodoCard`: replaced by "Your day".
- The group cards (`TodayGroups`: health, fitness, insights, steps, biometrics, weight): replaced by "More about today".
- Drag-to-reorder widget groups (`useWidgetConfig`): the page has a fixed order by design.

## Material and motion (owner request, 2026-10-12: "premium, clean, glass like Apple Music, smooth")

None of this exists in RN. RN draws `GlassCard` as an opaque white card, and its only motion is the ring sweep.

Everything below lives in `TodayGlass.swift`.

**Material**
- **Ambient glow (`TodayAmbient`).** One very soft glow sits at the top of the page, behind everything, in the colour of Koa's next thing (the same colour as the bubble's action pill).
  - It gives the glass something to blur without turning into a palette.
  - When nothing is due, it fades back to plain paper.
  - Reduce Transparency: no glow. Reduce Motion: the colour changes instantly.
  - The first version used a five-hue mesh; the owner found it too colourful on 2026-10-12 and asked for minimal and clean.
- **Cards (`todayCard`).** System glass (`glassEffect` on iOS 26, `.regularMaterial` before that), continuous corners, a 0.75 pt top-lit hairline, and a soft offset shadow.
  - Reduce Transparency: a solid card with a plain border.
  - There is no hand-drawn blur.

**Motion**
- **Focal moment.** The "Next" tag and the ring of the next tube are one object (`matchedGeometryEffect`). When Koa's next thing changes, it glides to the new tube with a spring (0.6 s, small bounce).
- **Supporting motion:**
  - tubes rise like liquid (spring 0.8 s);
  - "N of 5" and the readiness score roll (`numericText`);
  - Koa's line changes with `blurReplace`;
  - a row that becomes done swaps its pill for a bouncing check, with a success haptic;
  - press feedback is a 0.97–0.98 spring scale.
- **Navigation.** Detail screens zoom out of the row or Koa that was tapped (`navigationTransition(.zoom)`, iOS 18): mascot room, readiness sheet, trend, weekly review, biometrics.
- **Entrance.** First appearance only: opacity, a 6 pt blur and a 14 pt rise. Delays are staggered 50 ms per section and capped at 200 ms.
- **Reduce Motion.** Every spring becomes a 0.2 s ease and the entrance is opacity only. The system turns the zoom into a fade.

Checked on the Limrun simulator (iOS 26.4, light): material, glow, entrance, water tap (tube rise and Koa line change), and the zoom into the buddy room. **Not checked:** dark mode, Reduce Transparency, Reduce Motion, frame rate on a real device.
