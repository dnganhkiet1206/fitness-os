# Companion mascot art

The premium companion look comes from **assets here**, not code-drawn SVG.
Two supported kinds, in priority order:

1. **Pre-rendered images** (`<id>.png`, background removed) — the
   Talking-Tom-style look. Registered in `src/lib/mascot-images.ts`, shown
   with a subtle breathing animation. **Currently live: `koa.png`.**
2. **Lottie** (`<id>-idle.json`) — vector animation, registered in
   `src/lib/mascot-lottie.ts` (see below).

Any mascot without an asset falls back to the built-in vector figure, so a
partial roster works and an empty folder never breaks the build.

## Adding a pre-rendered image (recommended)

1. Generate the character (see the prompt the team is using) on a **plain
   flat grey/white background**, front-facing, full body.
2. Remove the background (I do this — send me the raw PNG) and drop
   `<id>.png` here.
3. Register in `src/lib/mascot-images.ts`:
   ```ts
   koa: { idle: require('../../assets/mascots/koa.png'), aspect: HEIGHT/WIDTH },
   // optional: happy / tired variants
   ```
4. No native rebuild needed for images — a JS reload shows it.

Mascot ids: `koa`, `blaze`, `swift`, `titan`, `drago`, `nova`.

---

## Lottie (optional, animated)

The premium, animated companion look can also come from **Lottie** files.
Until you add files, the app falls back automatically.

## How to add a mascot animation

1. **Get a Lottie `.json`** (see *Where to get files* below).
2. Drop it in this folder, e.g. `koa-idle.json`.
3. Register it in `native/src/lib/mascot-lottie.ts`:

   ```ts
   export const MASCOT_LOTTIE: Record<string, MoodSources> = {
     koa: {
       idle:  require('../../assets/mascots/koa-idle.json'),
       happy: require('../../assets/mascots/koa-happy.json'), // optional
       tired: require('../../assets/mascots/koa-tired.json'), // optional
     },
   };
   ```

   - `idle` is required; `happy` / `tired` are optional (they fall back to
     `idle`). Mascot ids: `koa`, `blaze`, `swift`, `titan`, `drago`, `nova`.

4. **Rebuild the dev build** — Lottie is a native module, so a JS reload is
   not enough the first time:

   ```
   npx expo run:ios       # or: eas build --profile development
   ```

That's it — that mascot now plays its animation everywhere (gym room,
dashboard, unlock celebration). Any mascot without an entry keeps the
vector figure.

## Asset specs (so it drops in cleanly)

- **Format:** Lottie JSON (Bodymovin export) — `.json`, not `.lottie`.
- **Background:** transparent.
- **Framing:** front-facing, standing full-body, centred, a little padding.
- **Aspect:** portrait ~1 : 1.46 (matches the figure box). Square is okay —
  it renders with `resizeMode="contain"`.
- **Loop:** a calm looping idle (breathe / blink / weight-shift). No big
  bounce/spin — keep it grounded and premium.
- **Size:** keep it lean (< ~300 KB) so the bundle stays small.

## Where to get files

- **LottieFiles** (https://lottiefiles.com) — search e.g. "cute mascot",
  "3d character idle", "animal buddy". Many free + premium. Download as
  **Lottie JSON**.
- **Commission / AI:** tools like Rive, Jitter, or a motion designer can
  produce a matching set (idle / happy / tired) for the six characters.
- **Rive alternative:** if you'd rather use Rive (`.riv`), tell me and I'll
  swap the runtime — the wrapper is isolated in `mascot-figure.tsx`.

## Notes

- Equipped shop items (cap / sunglasses / belt …) are drawn by the vector
  figure. With Lottie, either bake outfit variants into the animation or
  keep using the vector figure for dressed-up states — ask and I'll wire
  whichever you prefer.
