# Mascot System — Hand-off / Continuation Guide

**Read this first if you are continuing the mascot work.** It is the goal,
the shape of the thing as it actually is, the rules, and what is open.

This document was rewritten on 2026-07-27. Four earlier directions —
pre-rendered AI art, Lottie, a rigged Rive character, and a real-time 3D
GLB — are gone, along with the rules that served them. Do not mine the git
history for those rules; they were written for a system that no longer
exists.

---

## 1. The goal (unchanged, do not lose this)

Make **this exact koala** live inside the iOS fitness app as a character
with **emotions that react to real user activity**, like Duolingo / Apple
Fitness:

- open the app → wave
- no workout for ~3 days → sad / tired
- hit a PR → celebrate
- logging a workout → curling a dumbbell
- cold outside → coat · birthday → party hat

The **soul is the logic** — when and why it reacts. That is 100% code and
it is the valuable part.

---

## 2. Division of labour

| Task | Who |
|---|---|
| Design Koa — poses, expressions, wardrobe — and export it | **User** |
| Import the export, render it, prove it matches | **AI dev (you)** |
| Emotion logic, state, shop, app wiring | **AI dev (you)** |

The user works in a design tool and cannot run developer GUIs. Everything
downstream of the export must be code. The user's deliverable is a
`Koa.dc.html` export; yours is everything else.

---

## 3. How Koa is rendered

```
Koa.dc.html                          ← the user's design export (truth)
  → tools/koa-import/import-koa.py   ← generator
    → koa/koa-scene.ts               ← SVG tree + keyframes, as data (generated)
       koa/koa-flags.ts              ← the export's renderVals(), ported by hand
      → koa/koa-figure.tsx           ← the runtime that walks the tree
        → react-native-svg + Reanimated
```

- **`koa-scene.ts` is generated. Never edit it.** Re-run the importer.
- **`koa-flags.ts` is hand-kept** because it is logic, not data. A new
  pose, expression, slot or binding in the export must be mirrored here or
  those layers silently never draw.
- **`koa-figure.tsx` is a generic runtime**, not a drawing. It evaluates
  flags, composes transforms and samples keyframes. One `useFrameCallback`
  clock on the UI thread at 30fps feeds every animated layer; groups
  animate through `matrix`, the only transform prop `RNSVGGroup` takes
  natively, so nothing crosses to JS per frame.

`tools/koa-import/README.md` is the operating manual, including **the CSS
rules the runtime has to honour**. Read it before changing either file.

The emotion side:

- `lib/mascot-emotion.ts` — pure map from app state to an emotion.
- `hooks/use-mascot-emotion.tsx` — held emotion + one-shot actions.
- `lib/koa-emotion.ts` — the one table that turns an emotion into the
  sheet's own vocabulary (expression + pose + implied outfit).
- `components/ascnd/mascot-figure.tsx` — Koa, or the generic vector figure
  for the five characters that have no art.

---

## 4. What is built

- **Koa, imported and verified.** 10 expressions, 6 poses, a 7-slot × 10
  wardrobe (`assets/mascots/KOA_OUTFIT_CATALOGUE.md`). `verify.mjs` reports
  904 cases — every pose × expression at thirteen points in the cycle, all
  70 items at four — with 0 differences against the export.
- **The Emotion Engine.** Held emotion from mood / streak / hour / route;
  one-shots `wave` (app open, tap) and `celebrate` (award, unlock). `hat`
  uses the real profile DOB; `coat` is wired but gated `cold: false` until
  a weather source lands.
- **`/koa-sheet`** — the DEV review screen: every expression, every pose,
  all 70 items, tap to wear. Reached from the DEV bar in the Mascot Room;
  nothing links to it in a production build. Only the hero animates.
- **The Stage** — `stage-renderer.tsx` over `config/stage/*.json`, with
  aura, particles and event motion. The user intends to replace it with an
  idea suited to the vector character; it is untouched and waiting.
- **Gamification** (context, do not redo): rank ladder, Today's Energy
  ring, Rank Journey, coin-burst and rank-up confetti, stage lighting off
  rank and energy.
- **Performance.** The figure runs at 30fps, pauses when the app
  backgrounds, and every screen that shows it passes focus down — the
  Mascot Room, and the home tab, which stays mounted all session and used
  to keep the buddy's float, sway, quirk timer, the readiness pulse and a
  live 30fps character running behind whatever the user was looking at.
  A group with no transform, animation or attributes is flattened away,
  which is 15–23% of the figure's native views. The tree is memoised on
  the flags, so a parent re-render does not rebuild ~100 elements. The
  run pose's 33 animated layers cost ~13.5µs of maths per frame.

### Removed, on purpose — do not bring back

| Gone | Why |
|---|---|
| Real-time 3D (`mascot-3d.tsx`, `koa.glb`, bone/pose/face configs, three / @react-three/* / expo-gl) | The direction is the flat vector sheet. Removed at the user's request. |
| Rive (`mascot-rive.ts`, `mascot-rive-view.tsx`, `rive-react-native`, `KOA_RIG_SPEC.md`) | Registry empty by design — GUI-authored binaries an AI cannot produce. |
| Lottie (`mascot-lottie.ts`, `lottie-react-native`) | Registry empty by design. |
| Pre-rendered art (`mascot-images.ts`, 9 `koa-*.webp/png`, `scripts/remove-bg.py`) | Unreachable: Koa short-circuits ahead of it and nothing else was registered. |
| The photoreal gym room (`room-renderer.tsx`, `config/room/`) | Zero call sites — `StageRenderer` replaced it, and photoreal props clash with a flat-vector character. The art in `assets/room/` is kept for the user. |
| `koa-parts.ts`, `koa-anim.tsx` | The hand-drawn Koa, superseded by the import. |

---

## 5. Rules

**About the character**

1. **`koa-scene.ts` is generated.** A design update is
   `python3 tools/koa-import/import-koa.py <Koa.dc.html> …`, never a
   transcription. Every visual regression in this project's history came
   from hand-copying that export.
2. **Never judge the character from a static screenshot.** That is how the
   run pose got rebuilt from scratch, wrongly, and how six CSS-semantics
   bugs hid at once. Run
   `node tools/koa-import/verify.mjs <Koa.dc.html>`; a change to
   `koa-figure.tsx` or `import-koa.py` that cannot be shown to keep it at
   zero is not finished.
3. **A drawing that never moves looks perfectly correct.** `verify.mjs`
   compares geometry and is blind to a stopped clock — the character froze
   twice before anyone had a way to see it. Anything touching the clock or
   the focus gating must keep `node tools/koa-import/clock.test.mjs` green,
   and the rule that found the second freeze is worth remembering on its
   own: a frame callback's `timeSinceFirstFrame` **restarts at 0 on every
   re-activation**, so it is not a clock and must never be treated as one.
4. **The export is the truth, including its mistakes.** If the browser
   renders something you think is wrong, the app must still match it, and
   the fix belongs in the design tool. Do not "improve" the design in the
   port.
5. **Do not change the character's proportions.** The user said so
   explicitly about the arms and legs; treat it as covering the whole
   figure.
6. **Anything of ours layered on the character goes on top of the
   generated tree**, never inside generated data — the next import wipes
   it otherwise. That is what happened to the gaze, the cheek pop and the
   lash-line blink.

**About the system**

7. **One rendering path.** Koa is code-drawn vector; other characters fall
   back to the generic vector figure. Do not add an asset pipeline,
   provider chain or binary format back. Give a new character art by
   giving it Koa's treatment.
8. **Do not bake clothing into poses** — outfits stay per-slot overlays,
   swapped independently.
9. **All logic in TypeScript**, assets as data, no GUI in the loop.
10. **Keep the room cool.**  Anything that runs per frame is paid for on the
   user's phone. Gate loops on screen focus and app state, and prefer one
   clock over many.

**Working rules**

11. `cd native && npx tsc --noEmit` before every commit (ignore the
    pre-existing TS5101 baseUrl warning).
12. Develop on `claude/ios-fitness-rebuild-omgulr`; ff-merge into
    `claude/ios-fitness-rebuild-fiyl9k` and push both. `main` and the
    `devin/*` branches are a **different project** (a Vite/Capacitor web
    app) with unrelated history — do not merge across.
13. Commit trailer: `Co-Authored-By:` and the `Claude-Session:` line.
    Never put the model id in a commit, a PR or a code comment.

---

## 6. Open — parked, ask the user when they are ready

The user is still designing and asked to be left alone until then. Do NOT
act on these; raise them when a design pass lands.

1. **Two touches lost when Koa became an import.** They were ours, not the
   export's, so re-running the importer wiped them. Re-applying means
   layering them on top of the generated tree (rule 5).
   - the wandering gaze (`useGaze`) — sheet §8 "Look Left / Right"
   - the cheek pop on poke (`usePop`) — the dangling `pokeSignal` prop it
     used to ride on has been removed, so this needs re-wiring from
     scratch if the user wants it back
   The lash-line blink pivot has since become moot: the export's own
   eyelid collapses onto the lash line at y=72, which is what the user
   asked for.
2. **The shop vs the 70-item wardrobe.** `SHOP_ITEMS` sells five flat
   outfit keys on head/eyes/neck/waist; the character wears one item per
   slot across head/face/top/bottom/shoes/back/hand. `WORN_FROM_SHOP` in
   `mascot-figure.tsx` bridges the three that overlap. Open: prices,
   unlock rules, and a season/theme field — a third of the catalogue is
   Tết / Christmas / Halloween.
3. **The stage.** The user said they would replace it with an idea suited
   to the mascot.
4. **Expressions with no trigger.** `surprised` and `angry` are drawn but
   nothing in `baseEmotion()` produces them; `run` is reachable only from
   the DEV picker.
5. **Sheet §1 turnaround.** The sheet shows side and back views; no path
   data exists for them in the export yet.
6. **`coat` needs a weather source** — location + a free weather API.

---

## 7. One paragraph for a fresh model

Koa is a flat-vector koala **drawn in code from the user's design-tool
export**. `tools/koa-import/import-koa.py` turns `Koa.dc.html` into
`koa-scene.ts` (tree + keyframes as data); `koa-flags.ts` is the export's
own logic ported by hand; `koa-figure.tsx` is a small runtime that walks
the tree on one UI-thread clock. A TypeScript Emotion Engine maps real app
events to an expression + pose. Everything else that was ever tried — 3D,
Rive, Lottie, pre-rendered art — has been removed and must not come back.
The one hard rule: never judge the render by eye,
`node tools/koa-import/verify.mjs <Koa.dc.html>` must report zero.
