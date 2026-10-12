# Today tab: redesign approved by the owner (2026-10-12)

The owner allowed the redesign to depart from RN where RN is weak ("keep what is strong, drop what is weak"). It was approved on the canvas on 2026-10-12. Implementation is handed to **A** (#527).

`mock/` holds the canvas source:
- `Redesign.dc.html` is the whole page. Its props are `variant` = day | new and `dark`.
- `RingOptions.dc.html` with `option = C` is the approved "day" block.

Both are HTML mocks for reading only. The app itself is SwiftUI.

## Thesis

Today counts the day **once**. RN showed the same day three times: the energy ring, Koa's quest dots and the to-do card. RN also gave half the screen to a readiness gauge that, for a new account, can only say "—".

The redesign has three parts:
- One "day" block in which Koa says what to do next.
- One list that logs.
- One workout card that carries readiness and answers "push hard or go easy today".

Kept from RN:
- the paper palette;
- Koa, coins and the streak;
- one-tap logging;
- "—" for anything not measured yet, never a fake 0;
- all economy and readiness rules, which stay unchanged.

## Page order (top → bottom)

1. **Large title "Today"** with the date below it, as a subtitle.
   - Trailing: the streak chip (≥ 1 day, goes to the mascot room) and the avatar with initials (goes to Settings).
   - The brand lockup is dropped; it is on the app icon.
2. **Day block (approved option C)**, a glass panel. Details below.
3. **Workout card.**
   - Plan name in title2.
   - Meta line: exercises, then `~N min`.
   - Readiness row, tappable, opens the readiness details:
     - score in Menlo 30 in the zone colour;
     - zone word in semibold (Train / Train moderately / Recover);
     - a one-line reason (the two weakest inputs);
     - a chevron.
   - Primary button "Start workout": black pill, 50 tall.
   - New account / no plan:
     - title "No workout planned";
     - readiness row shows "—" + "No readiness score yet" + "One night of sleep or one workout with sets gives you one.";
     - buttons "Pick a workout" and "Log sleep".
4. **"Your day" list.** One inset card. Header right side: "Each one fills the ring".
   - First five rows, the energy signals, each showing its coin reward: Sleep +15, Meal +10, Water +15, Workout +25, Steps +10.
   - After a 6pt gap: Weight and Biometrics, which have no coins.
   - Each row has:
     - a 32pt tinted circle with the glyph;
     - the label (17 semibold) with the coin value beside it;
     - a detail line (13, muted).
   - The trailing slot depends on state:
     - **done:** a filled check in the signal colour;
     - **open:** a bordered pill — "Log", or "+250 ml" for water (logs immediately);
     - **Steps:** "Auto", because steps come from Apple Health.
5. **"More about today".** An inset list of one-line rows, each with a Menlo value and a chevron:
   - Biometrics (`54 bpm · 62 ms`);
   - Training this week (`+8%` vs habit);
   - Readiness trend (`avg 71`);
   - Weekly review;
   - Buddy room (`Lv 4`).
   - The big RN group cards are replaced by these rows. The cards stay one tap away on their own screens.

## Approved day block: option C

Use a real glass material in SwiftUI (iOS 26 `.glassEffect()` / system materials), not CSS imitations. Honour Reduce Transparency (fall back to solid fills) and Reduce Motion.

- **Backdrop:** five very soft blurred colour pools, one per signal hue, at about 16–26% opacity. They give the glass something to blur.
- **Panel:** glass, radius 30, padding 16, very light shadow.
- **Top row:**
  - Koa (≈ 84 wide) on a soft contact shadow. Tap → mascot room. Use `MascotFigureView` with the equipped outfit.
  - "2 of 5" in Menlo 26 with " of 5" in muted, and a glass coin pill ("+15 coins waiting") at top right.
  - **Koa's speech bubble:** glass, 82% white, corners 16/16/16/5. It says what is next, with the coin value in bold yellow, e.g. "Sleep's in. I'm hungry — a meal is next, worth +10."
  - Inside the bubble, **one solid action pill in the next signal's colour** ("Log a meal"). This is the single strong accent of the block and the focal point.
- **Five glass meters:** sleep, meal, water, workout, steps.
  - **Slender tubes, about 30 wide × 104 tall, radius 15.** The owner asked for the thin tubes.
  - Each tube fills with its signal colour from the bottom by progress. Water and steps fill partially (e.g. 0.8 of 2.5 L → 32%). The others are 0 or 100%.
  - Each tube has a thin vertical highlight and the glyph in a small chip at the bottom.
  - The value sits under the tube in Menlo 11, e.g. `7h40 · 0 · 0.8L · 0 · 4.1k`.
  - **The "next" tube is highlighted:** a 2pt border in its colour, a soft glow, and a "Next" tag above it. It matches Koa's bubble.
- **What counts as "next":** the first open signal by time of day. This needs RN's `mascotLine` rules (time windows: sleep from 06:00 for 5 h; meal from 11:00; water from 14:00; workout from 16:00 for 5 h). Port `mascotLine` (`lib/mascot*`, RN @ fac9ac2) with a golden. Do not invent lines. With no open signal the bubble congratulates; with nothing logged yet it greets.

## Colours (light; dark = RN `darkPalette`)

| Role | Hex |
|---|---|
| ground | `#f7f4ef` |
| card | `#ffffff` |
| inset | `#f7f4ef` |
| line | `#dcd5c8` |
| ink | `#1a1917` |
| muted | `#6b6559` |
| sleep | `#8c35d0` |
| meal | `#d87300` |
| water | `#077b8b` |
| workout | `#b83044` |
| steps | `#078055` |
| weight | `#0673be` |
| biometrics | `#de0b44` |
| coins | `#846e06` |

- Words use SF.
- Menlo is used only for measurements.

## What already exists natively (E, T1–T3: `3945a1c0`, `342ed32f`, `0687b205`)

Reuse these and replace what the redesign changes.

| Component | Use in the redesign |
|---|---|
| `TodayTop.swift`: `StreakChip`, `AccountAvatar` + `AccountInitials` | Keep. |
| `TodayEnergyRow`, `TodayKoaRow`, `BrandLockup` | Replace with the day block and the large title. |
| `ReadinessCardView` (hero form) | Replace on Today with the readiness row inside the workout card. Keep the detail view / explainer for the tap target. |
| `TodayTodoCard` | Replace with "Your day". The flags come from the same sources: `ReminderTodayBook` + `MascotRoomController` signals. |
| `TodayGroups.swift` | Replace with the "More about today" rows. |

The data books are already wired in `TodayExtras`:

| Book | Provides |
|---|---|
| `MascotRoomController` | signals, streak, quests, coins |
| `ReminderTodayBook` | meal / sleep / biometrics / weight flags |
| `ReadinessBook` | readiness score |
| `BiometricsBook` | biometrics summary |
| `WeightLogger` | weight |
| `StepsBook` | steps |
| `ReadinessTrendBook` | readiness trend |
| `WeeklyReviewBook` | weekly review |

Water quick add needs `WaterBook` (`makeWaterBook`).
