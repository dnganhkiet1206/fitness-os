# Mascot System — Hand-off / Continuation Guide

**Read this first if you are continuing the mascot work.** It captures the
goal, the decided architecture, what is already built, and the exact next
steps — so you continue without drifting. Do not relitigate settled
decisions (see “Guardrails”).

---

## 1. The goal (do not lose this)

Make **this exact koala** live inside the iOS fitness app as a character
with **emotions that react to real user activity**, like Duolingo / Apple
Fitness. Concretely:

- 😊 Open app → smile / wave
- 😔 No workout for ~3 days → sad / tired / yawn
- 🏆 Hit a PR → jump / celebrate
- 💪 During a workout (curl) → holding a dumbbell
- 🥶 Cold weather → wearing a coat
- 🎂 Birthday → party hat

The **“soul” is the logic** (when/why it reacts) — that is the valuable
part and it is 100% code. The **art** (a picture per emotion) is generated
by the USER with an AI image tool; the AI dev does everything else.

Reference art (the character) and the current clean idle:
![Koala reference](../assets/mascots/koa-rig-reference.png)
- Live idle asset (background removed): `native/assets/mascots/koa.png`.

---

## 2. Division of labour (the working model — agreed)

| Task | Who |
|---|---|
| Generate character art per pose/emotion (AI image tool) | **User** |
| Cut background cleanly, integrate, animate | **AI dev (you)** |
| Emotion/event logic, state machine, equipment, app wiring | **AI dev (you)** |

The user depends almost entirely on AI and cannot run GUI tools. Therefore
**all logic and asset processing must be code (no GUI in the loop).** The
only thing the user does outside code is *prompt an image generator*.

---

## 3. Architecture (decided — Principal-Architect level)

Layered, provider-abstracted “Mascot Engine”. **App never knows the render
tech.** All intelligence in TypeScript; providers are thin adapters; assets
are data (images/frames + JSON manifest).

```
App screens
  → MascotController (public API: play/setMood/setEnergy/setWorkout/equip)
    → MascotEngine (TS: state machine + mood + equipment)   ← the brain
      → IAnimationProvider (adapter)                          ← thin
        → Renderer (draws image/frames/…)
          → React Native
```

**Chosen primary provider: image / sprite-frame (raster).** Reasoning under
the “AI-only, no GUI” constraint:

- Raster assets come from AI image/video (user prompts) and are **processed
  and assembled entirely in code** (Python/PIL — see §6). Adding an
  animation = new frames + a JSON line. **No GUI ever.**
- **Rive and GLB are demoted to optional future providers.** They look
  great but are **binary formats authored only in GUI editors (Rive
  editor / Blender / Mixamo)** — the AI cannot create or modify them, so as
  a *primary* they would block development. Keep them as pluggable options
  for if/when a human/artist is available. **Do not make Rive/GLB the
  core.** (The earlier `KOA_RIG_SPEC.md` is a valid Rive brief but Rive is
  NOT the primary path.)

Provider priority already implemented in `mascot-figure.tsx`:
`Rive → image → Lottie → vector-fallback`. This is the seed of the engine;
the next step formalises it (§5).

---

## 4. What is already built (in the repo, both branches)

Branches: develop on `claude/native-logging-input-design-1ziiu3`, then
**ff-merge into `claude/ios-fitness-rebuild-omgulr`** (the user pulls
omgulr) and push BOTH. Always merge to omgulr.

Files:
- `src/components/ascnd/mascot-figure.tsx` — **provider selector**.
  Renders: Rive (if registered) → **image + breathing** (koa) → Lottie →
  `VectorMascot`. `ImageMascot` uses `expo-image` + a Reanimated breathing
  loop (scaleY/translateY), `contentPosition="bottom"` so feet touch floor.
- `src/lib/mascot-images.ts` — **image registry** (koa live; `aspect` =
  h/w so the box matches the art). `imageFor(id, mood)` → source+aspect.
- `src/lib/mascot-lottie.ts` — Lottie registry (empty; lazy).
- `src/lib/mascot-rive.ts` + `src/components/ascnd/mascot-rive-view.tsx` —
  Rive registry + view (empty; lazy native require). Contract: SM
  `MascotSM`, number input `mood`, action triggers.
- `assets/mascots/koa.png` — clean idle (U2Net-cut, 640×859).
- `assets/mascots/README.md`, `KOA_RIG_SPEC.md`, `koa-rig-reference.png`.
- Deps installed: `expo-image` (was present), `lottie-react-native@7.3.8`,
  `rive-react-native@9.8.5` (native modules → dev build rebuild needed to
  link, but both are lazy so an empty registry never touches them).

Data the logic can already use:
- `src/hooks/use-mascot.tsx` — `useMascotMood()` returns
  `happy | neutral | tired` (happy = meals+workout logged; tired = no meal
  after noon / no workout by evening). `useMascotMessage()` context lines.
  `MASCOTS` catalog ids: `koa, blaze, swift, titan, drago, nova`.
- `src/hooks/use-mascot-room.ts` — `useDailyStreak()` (consecutive
  daily_logs), wallet/xp/level, quests.
- PR signal: `workout_sessions.pr_detected` (see `use-extras.ts` awards
  `first_pr` / `pr_5`).
- The gym scene (`mascot-scene.tsx`) already wraps the figure in event
  motion (nod/settle on `celebrateSignal`, droop + zzz when tired) and
  passes `celebrateSignal`/`flexSignal` from the room screen.

Gamification already shipped (context, don’t redo): rank ladder
(Rookie→Legend, `mascot-room.ts`), Today’s Energy ring
(`energy-ring.tsx`), Rank Journey (`rank-journey.tsx`), reward coin-burst +
rank-up confetti, room lighting reacting to rank/energy.

---

## 5. NEXT STEPS — build the Emotion Engine (primary task)

Goal: a small TS engine that maps **real app state/events → a mascot
emotion/action**, rendered via the image provider, and degrading
gracefully (1 still per emotion + micro-motion is enough; swap in animated
WebP later for smooth actions).

### 5a. Emotion state model
Emotions/actions (start): `idle, happy, sad, tired/sleep, celebrate, curl,
wave`. Each maps to an image key in `mascot-images.ts` (fall back to
`idle` when the art isn’t added yet — so it works incrementally).

Extend `MascotImageSet` to hold these keys, e.g.:
```ts
{ idle, happy?, sad?, tired?, sleep?, celebrate?, curl?, wave?, coat?, hat?, aspect }
```
`imageFor(id, emotion)` returns the specific art or `idle`.

### 5b. Event → emotion mapping (the brain)
Create `src/lib/mascot-emotion.ts` (pure functions) + a hook
`useMascotEmotion()` that derives the current emotion from data:

| Trigger | Source (exists?) | Emotion |
|---|---|---|
| App/room opened | mount | `happy` (brief) → `idle` |
| Streak lapse ≥3 days / mood tired | `useDailyStreak`, `useMascotMood` | `sad`/`tired` |
| Recent PR | `workout_sessions.pr_detected` / new award | `celebrate` (one-shot) |
| On workout log / curl screen | route = `log-workout` (or exercise name) | `curl` |
| Night / no activity late | hour + logs | `sleep` |
| Cold weather | ⚠️ needs weather API + location | overlay `coat` |
| Birthday | ⚠️ needs `birthdate` (add to profile/settings) | overlay `hat` |

First 4 use **existing** data. Weather + birthday need a small data add
(free weather API by location; a birthdate field in settings) — do those
when you reach outfits.

### 5c. Playback / state machine (TS, code-only)
`src/lib/mascot-state-machine.ts`:
- Base loop = `idle`, blended by mood (`happy`/`sad`/`tired` idle variant).
- One-shot actions (`celebrate`, `curl`, `wave`) play then auto-return to
  the mood idle. Held state = `sleep` (until mood changes).
- Micro-motion per still (breathe always; squash on celebrate/jump;
  slump on sad) via Reanimated in the renderer.
- Face blink can be a timed overlay later (or a `blink` art frame).

### 5d. Renderer
Evolve `ImageMascot` (in `mascot-figure.tsx`) to accept an `emotion` and
pick per-emotion micro-motion. Keep `expo-image`. Later add a
`SpriteRenderer` for multi-frame WebP/sprite clips (see §7).

### 5e. Wire it
- `MascotFigure` already receives `mood`; add `emotion`/`action` from the
  engine (a context `MascotProvider` at root, or thread props).
- Fire `celebrate` on reward/PR (room already has `celebrateSignal`), set
  `sleep`/`sad` from mood, `curl` when on the workout logging flow.

**Ship incrementally:** with only `koa.png` today you can already do
mood-driven micro-motion (breathe/slump/bounce). Each new art file lights
up its emotion automatically.

---

## 6. Asset processing pipeline (background removal) — reproducible in code

The user sends raw AI images with a **plain flat light-grey background**,
full body, front view (like the koala). Cut them with **U2Net matting** (NOT
colour-key flood-fill — that chews fur and leaves grey fringe).

Setup (ephemeral container — re-fetch each session):
```bash
python3 -m pip install --quiet numpy Pillow onnxruntime
# model (GitHub release is 403-blocked; use the HF mirror):
mkdir -p ~/.u2net && curl -fsSL -o ~/.u2net/u2net.onnx \
  "https://huggingface.co/tomjackson2023/rembg/resolve/main/u2net.onnx"
```

Cut script (`cut.py`) — soft fur alpha, defringe, crop, resize:
```python
import numpy as np, onnxruntime as ort
from PIL import Image, ImageFilter
SRC='in.png'; OUT='out.png'; TW=640   # target width
im=Image.open(SRC).convert('RGB'); W,H=im.size
sess=ort.InferenceSession('/root/.u2net/u2net.onnx',providers=['CPUExecutionProvider'])
n=sess.get_inputs()[0].name
r=im.resize((320,320),Image.BILINEAR)
x=(np.asarray(r).astype(np.float32)/255.0-[0.485,0.456,0.406])/[0.229,0.224,0.225]
x=x.transpose(2,0,1)[None].astype(np.float32)
m=sess.run(None,{n:x})[0][0,0]
m=(m-m.min())/(m.max()-m.min()+1e-8)
a=np.asarray(Image.fromarray((m*255).astype(np.uint8),'L').resize((W,H),Image.BILINEAR)).astype(np.float32)/255.
a=np.clip((a-0.06)/0.88,0,1)                      # crisp transition, kill haze
arr=np.asarray(im).astype(np.float32); af=a[...,None]
pb=np.stack([np.asarray(Image.fromarray((arr*af)[...,c].astype(np.uint8),'L').filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32) for c in range(3)],-1)
ab=np.asarray(Image.fromarray((a*255).astype(np.uint8),'L').filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32)[...,None]
rgb=np.where(af>0.9,arr,pb/np.clip(ab,1,None))    # defringe: edge = fur colour
o=Image.fromarray(np.dstack([np.clip(rgb,0,255).astype(np.uint8),(a*255).astype(np.uint8)]),'RGBA')
o=o.crop(Image.fromarray((a*255).astype(np.uint8),'L').getbbox())
o=o.resize((TW,round(o.size[1]*TW/o.size[0])),Image.LANCZOS); o.save(OUT)
print('aspect h/w =', round(o.size[1]/o.size[0],4))
```
Always verify on a magenta background (fringe/jaggies show there) before
committing. Save to `assets/mascots/koa-<emotion>.png`; register in
`mascot-images.ts` with the printed aspect.

---

## 7. Smooth motion (optional upgrade, still code-only)
For truly animated actions (curl up/down, jump): user makes a short clip
with **image-to-video AI** (Kling/Luma/Runway/Pika) → you extract frames,
U2Net-cut each, assemble an **animated WebP / APNG (transparent)** or a
sprite sheet + JSON, play via `expo-image` (animated) or a `SpriteRenderer`
that drives the frame index. This stays 100% code/asset — no GUI.

---

## 8. Asset shopping list (what to ask the user for)
Same character, same outfit/colors, full body, front, **plain grey bg**,
one character. Base prompt + one action line each. Filenames:

Priority 1 (turns the engine on): `koa-happy.png` (smiling),
`koa-sad.png` (sad/tired), `koa-celebrate.png` (jumping, arms up),
`koa-curl.png` (holding a dumbbell, bicep curl).
Priority 2: `koa-wave.png`, `koa-sleep.png` (eyes closed).
Priority 3 (outfits, full variants for v1): `koa-coat.png`, `koa-hat.png`.

1 still per emotion is enough to start. The user attaches files (inline
paste does NOT persist to disk — must be a file attachment).

---

## 9. Guardrails (settled — do NOT drift)
- **Do NOT hand-draw the character in SVG/code to match the 3D look.** It
  was tried repeatedly and rejected (“no volume / bad”). Hand-drawn vector
  tops out at flat 2D. The 3D-render quality only comes from the user’s AI
  image tool. The vector figure stays ONLY as the graceful fallback.
- **Do NOT make Rive or GLB the primary** — GUI-authored binaries block an
  AI-only workflow. Keep as optional providers.
- **Do NOT bake clothing into animations** — outfits are overlays/variants
  swapped independently.
- **Keep all logic in TypeScript**, providers thin, assets as data.
- **Background removal = U2Net matting** (§6), not colour-key.
- Typecheck before commit: `cd native && npx tsc --noEmit` (ignore the
  pre-existing TS5101 baseUrl warning). Commit + push BOTH branches;
  always ff-merge into `claude/ios-fitness-rebuild-omgulr`.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  and the Claude-Session line. Never put the model id in commits.

---

## 10. One-paragraph summary for a fresh model
The user generates AI images of one koala mascot in different emotions; you
cut them with U2Net (§6) and build a **TypeScript Emotion Engine** (§5)
that maps real app events (streak lapse, PR, workout, mood) to an emotion,
rendered via the image provider in `mascot-figure.tsx` with per-emotion
micro-motion, degrading to the current `koa.png` idle + the vector fallback
when art is missing. Raster (image/sprite) is the intended primary because
it’s the only high-quality path an AI can produce and maintain without a
GUI; Rive/GLB are optional future providers, not the core. Start by wiring
mood-driven micro-motion today, then light up each emotion as its art
arrives, then add weather (coat) and birthday (hat) with a small data add.
```
