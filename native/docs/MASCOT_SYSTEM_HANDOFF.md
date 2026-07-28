# Mascot System — Hand-off / Continuation Guide

**Read this first if you are continuing the mascot work.** It is the goal,
the shape of the thing as it actually is, the rules, and what is open.

This document was rewritten on 2026-07-27 and updated on 2026-07-28. Four
earlier directions — pre-rendered AI art, Lottie, a rigged Rive character,
and a real-time 3D GLB — are gone, along with the rules that served them.
Do not mine the git history for those rules; they were written for a system
that no longer exists.

If you are picking this up cold, read "The repository" and the 2026-07-28
note after §5 before running any git command — the branch layout changed,
and one claim this document used to make about it was false.

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
- **The Stage — Koa Studio.** `components/ascnd/studio/` is the room: an
  SVG scene built to the user's "Koa Studio" brief and held to their design
  screenshot by
  `tools/koa-studio/compare.mjs` (every landmark within 4pt).
  `stage-renderer.tsx` is now only what the scene is not — where the
  character stands, the poke, the fade into the page, and the live versions
  of the room's moving parts. The buddy is placed from `STAGE_MARK`, the
  same number the scene composes itself around. It was a still scene until
  2026-07-28; it now drifts, pulses and glows — see rule 10.
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
| The old themed stage (the hand-drawn wall / spotlight / podium / props in `stage-renderer.tsx`, `config/stage/`, `lib/stage-layout.ts`, `docs/HERO_STAGE_LAYOUT_SPEC.md`) | Replaced by Koa Studio. **Read the note below before reviving any of it.** |
| `koa-parts.ts`, `koa-anim.tsx` | The hand-drawn Koa, superseded by the import. |
| The imported Mascot Room backdrop (`koa/koa-room.tsx`, `koa/room-scene.ts`, `--room` in `import-koa.py`, the room half of `verify.mjs`) | Never mounted by anything. Koa Studio is the stage. See the 2026-07-28 note below for how that was established. |

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

   **The studio is no longer a static scene.** That rule was lifted by the
   user on 2026-07-28: the room may move, and it does — drifting motes, a
   pulsing lamp, a stage glow. Do not put the old rule back, and do not
   remove those on the grounds that the room should be still. What survives
   is this rule, which the room's two clocks obey: one shared value each,
   derived on the UI thread into a group `matrix` or `opacity`, both gated
   on screen focus by `StageRenderer`, and periods (26s and 7.3s) chosen so
   they do not fall into step.

   **And one more, learned the hard way: never animate inside a big `<Svg>`.**
   `react-native-svg` rasterises a whole canvas again whenever any child prop
   changes, so an animated group invalidates up to the root. Putting the
   room's motion inside `KoaStudio` redrew all ~190 of its shapes every
   frame, over full-canvas gradients, under a character already running its
   own 30fps clock — the Mascot Room went visibly laggy the moment it landed.
   The moving parts are a second canvas over the studio now
   (`studio-live.tsx`).

   That fixed the lag and the phone still ran hot, because the beam moved
   with them — nine full-height gradient trapezoids at 60fps. **Shape count
   is not the cost; covered area is.** The beam is static again and only
   small things move: a glow at the lamp's mouth, nine motes, the stage's
   glow. Never animate anything that covers a large part of the screen.
   `components/ascnd/studio/README.md` carries the detail.

**Working rules**

11. `cd native && npx tsc --noEmit` before every commit (ignore the
    pre-existing TS5101 baseUrl warning).
12. Develop on `claude/ios-fitness-rebuild-omgulr`. It is now the only
    working branch — see "The repository" below. Do not merge `main` into
    it.

    **More than one agent works this branch.** Fetch before starting and
    rebase rather than force-push: a session pushed three studio commits
    mid-flight on 2026-07-28, and rebasing onto them was the whole of the
    fix. Two of those revised work from this side with better measurements,
    which is the point of the arrangement — but it also means **do not
    delete or rewrite someone else's work without asking the user first.**
    Where two edits landed on one comment block the result was unreadable,
    so read what you are merging into rather than assuming it is yours.
13. Commit trailer: `Co-Authored-By:` and the `Claude-Session:` line.
    Never put the model id in a commit, a PR or a code comment.

---

### What went with the old stage, and what that costs

`HERO_STAGE_LAYOUT_SPEC.md` was marked canonical, and it is gone because
the design it specified is gone. Its promise was worth more than its code
and is **not** met by the studio, so it should be a deliberate decision
rather than something noticed later:

- The old stage had a **layout engine**: zones, occupancy, collision,
  priority and exclusive groups, so a future shop item could be registered
  and place itself in the room with no layout edit. Koa Studio is a fixed
  composition — a new prop means editing the scene.
- Its goal was "a gym room the player owns and grows over years". The new
  brief says the opposite in as many words: *"Không biến thành phòng gym.
  Đây là một fitness studio"*, every object must serve gameplay, and the
  space around the character must stay empty.

Those are incompatible, and the newer brief won. If room-furnishing ever
becomes a shop mechanic again, the engine has to come back — but against
the studio's composition, not the old one's.

The three stage skins survived: `STUDIO_SKINS` in `studio/palette.ts`
shifts the wall and the warm colour, so `stage_night` / `stage_sunset` /
`stage_champion` still change the room.

---

### The repository

Two projects share this repo, and only one is alive.

`native/` is the app: Expo, and where all work happens. The repo **root**
holds the old Vite/Capacitor web app — `index.html`, `vite.config.ts`,
`src/`, `ios/App`, `tailwind.config.ts` and the rest. The user has ported
everything to native and no longer develops the web app. It is kept on
purpose, as a reference to compare against while the port settles, and
will be deleted in one deliberate pass before this branch merges to `main`.

Two traps follow from that, both of which have already cost time:

- **`src/` at the root is deleted on this branch, and that is correct.**
  Commit `75b7208` removed all 190 files of it. Its message only describes
  the studio components it added, so the deletion reads as an accident —
  `index.html` still loads `/src/main.tsx`, `package.json` still runs vite.
  It is not an accident. Do not restore it. If the root web app looks
  broken, that is because it is dead, not because something needs fixing.
- **`main` is the old web app.** Its commits after the split are Lovable
  edits to `src/pages/MascotLab.tsx`, `src/App.tsx` and the Vite tsconfigs.
  Merging `main` into this branch resurrects `src/`. Don't.

### 2026-07-28 — branch consolidation, and the dead-room sweep

**Branches.** Everything now lives on `claude/ios-fitness-rebuild-omgulr`.
`claude/native-logging-input-design-1ziiu3` was merged into it (its eight
Koa commits, so its history survives its deletion) and these five are
redundant, each containing zero commits that omgulr lacks:
`claude/ios-fitness-rebuild-fiyl9k` (was byte-identical to omgulr),
`claude/native-logging-input-design-1ziiu3`, and the three `devin/*`
branches. They were slated for deletion; the environment's git proxy
refuses ref deletions, so the user deletes them by hand. If they are still
on the remote, that is why — they are not live work.

That merge conflicted add/add on `koa-figure.tsx`, because the two branches
had grown separate mascots from one parent. **The import-based figure won**
and is what rule 1 protects; the other branch's hand-drawn version and its
`koa-parts.ts` were dropped, which is the second time `koa-parts.ts` has
been deleted for the same reason. If it reappears, it is a merge dragging
it back, not new work.

**An earlier version of this document claimed `main` and `devin/*` were "a
different project with unrelated history". That was wrong**, and the way it
was wrong is worth knowing: the working copy was a **shallow clone**, so
`git merge-base` found no common ancestor and every branch looked orphaned,
with omgulr appearing to hold 50 commits instead of its real 569. Run
`git rev-parse --is-shallow-repository` before drawing any conclusion from
history, and `git fetch --unshallow` first if it says true. The devin
branches are in fact fully contained in omgulr.

**The dead room.** `koa/koa-room.tsx` and its generated `koa/room-scene.ts`
drew a room imported from the design export's Mascot Room page. The stage
draws `KoaStudio` instead, so they were removed. Three independent checks
established they were dead, and the method is reusable for the rest of the
sweep:

1. `git log -S KoaRoom` over the whole repository returns exactly one
   commit — `249667f`, the one that added it. The name is never referenced
   again, so no screen ever mounted it.
2. Walking imports from all 38 `src/app` routes (expo-router is
   file-based, so every file there is an entry point) reaches 142 files.
   `koa-room.tsx` was not among them, and `room-scene.ts` was imported by
   `koa-room.tsx` alone. After the deletion the reachable set was still the
   same 142, which is the check that proves nothing live lost an import.
3. `249667f` landed 2026-07-27; the studio replacing it landed the next
   day, and `stage-renderer.tsx` renders `KoaStudio`.

Deleting the two files alone would have broken the tooling, which is the
part worth copying: `verify.mjs` built `room-scene.ts` through esbuild and
imported the result, so it would have failed on the missing file. The
`--room` mode came out of `import-koa.py` in the same change, along with
`VIEWBOX`, which only that mode read. `opsMat` stayed — the character check
still uses it; only `roomNode` and `matrixTransformOf` went with the room.

**`vector-mascot.tsx` was examined and kept.** It looks like the same
vintage of dead code and is not: `mascot-figure.tsx` falls back to it for
every character that is not Koa. Rule 7, not an oversight.

**The rest of the sweep.** Eight more files went the same way, each with no
importer and its exported names appearing nowhere else in `src/`:
`animated-icon.tsx` with its `.web.tsx` and `.module.css`, `hint-row.tsx`,
`web-badge.tsx`, `ui/collapsible.tsx` (the last file in `ui/`, so the
directory went too), `ascnd/game-icons.tsx` — left over from the old Stage
pivot — and `ascnd/readiness-ring.tsx`, which `e144dfc` replaced with the
`ReadinessGauge` that `(tabs)/index.tsx` renders today.

### Eight files look dead to the import walk and are not — do not delete them

This is the trap the sweep nearly fell into, and it will look exactly the
same to the next reader who walks imports from `src/app`:

| File | Why it is live |
|---|---|
| `components/app-tabs.web.tsx` | Metro resolves `@/components/app-tabs` to the `.web` variant on the web target. `(tabs)/_layout.tsx` imports it; the platform, not an import, picks the file. |
| `components/external-link.tsx`, `components/themed-text.tsx`, `components/themed-view.tsx` | Imported by `app-tabs.web.tsx`, so they are live on web only. |
| `hooks/use-theme.ts` | Imported by `themed-text.tsx` / `themed-view.tsx`. |
| `hooks/use-color-scheme.ts`, `hooks/use-color-scheme.web.ts` | Imported by `use-theme.ts`, and the same `.web` resolution applies again. |
| `src/css-modules.d.ts` | Ambient declaration, never imported. Still needed: `constants/expo-template-theme.ts` does `import '@/global.css'`, which its `declare module '*.css'` covers. |

Deleting any of them breaks `npm run web` without breaking iOS, and `tsc`
will not catch it. If the project ever drops the web target, they can go
together — but that is a product decision, not a cleanup.

After this, every file under `native/src` is either reached from a route,
live on the web target, or an ambient declaration. The app is clean; a
future `KHÔNG reachable` list that is longer than the eight above means
something new was added and left unwired.

### Not a bug — an empty podium is a reference shot, and the figure is healthy

The user sends screenshots of `/mascot-room` with **the podium empty** on
purpose: with the character out of the way, the shot is a clean reference
for the room's layout, spacing and shadows. Koa is wired up and does draw on
device. `stage.mjs` renders an empty podium for a different reason — it only
draws the figure when it finds `../koa-figure-mirror.js`, which is not in the
repo. **Neither is a fault to go fixing.**

The measurements below were taken while briefly mistaking one of those shots
for a bug report. They are kept because they are the baseline for the day the
figure really does fail, and because re-deriving them costs an hour:

- **The scene data is healthy.** Bundling `koa-scene.ts` + `koa-flags.ts`
  and walking the tree the way `RenderNode` does — skipping any node whose
  `if` flag is false or whose `animBind` resolves to `opacity:0` — draws
  52 shapes for (happy, idle), 75 for (strain, lifting), 42 for
  (grin, idle), 50 for (tired, relaxing) and 76 for (happytired, running).
  The scene references 106 `if` flags and 19 binds, and `koaFlags()`
  defines every one of them. Nothing is silently switched off.
- **The placement math fits.** With `SCENE_BOTTOM` 476, `STUDIO_W` 390,
  `HERO_W` 128 and `STAGE_MARK` (195, 412), the buddy's box runs from
  `258k` to `418k` inside a stage `476k` tall — the feet land on the mark,
  nothing overflows.
- **Nothing gates it.** `mascot-room.tsx` → `MascotScene` →
  `StageRenderer` → `MascotBuddy` → `MascotFigure` → `KoaFigure`, with no
  conditional anywhere on that path, and `DEFAULT_MASCOT_ID` is `koa`.
- **No recent regression.** The last commits to touch `koa-figure.tsx` and
  `stage-renderer.tsx` predate the studio work, and `tsc --noEmit` is
  clean.

**If the figure ever does go missing, the cheap discriminating test comes
before any code change:** the room's DEV bar has a `spec sheet →` chip.
`/koa-sheet` renders `KoaFigure` directly at size 200 with no
`StageRenderer`, no placement math and no `perspective` / `rotateX` /
`scale` wrapper; Settings renders it at size 44 with `animated={false}`.

| What you see | Where the fault is |
|---|---|
| Koa on the spec sheet, not on the podium | `StageRenderer` — placement, or the transform wrapper around the buddy |
| Koa missing on the spec sheet too, but present at 44px in Settings | the animated path — the clock, `useFrameCallback`, `AnimGroup` |
| Koa missing everywhere | the figure or `react-native-svg` itself at runtime |

Run that first. Each row points somewhere different, and guessing between
them is what would cause a wide, wrong change.

### The preview is faithful about geometry, not about text

Comparing the user's device shot against `preview.mjs` turned up three
defects, and the first one undermines an assumption the whole method rests
on. `preview.mjs` bundles the real `.tsx`, so it cannot drift on shapes or
coordinates — but it renders in a **browser**, and a browser and
`react-native-svg` do not agree about text.

- **A `TSpan` cannot end in whitespace on iOS — no character fixes it.**
  The wall sign's gap was a trailing space inside `<TSpan>WIN </TSpan>`.
  The browser kept it, the phone did not, so the sign read `WINTODAY` on
  device while every check ever run on this scene showed `WIN TODAY`.

  Swapping in U+00A0 was tried first and **also failed**. The reason is in
  `react-native-svg/apple/Text/RNSVGTSpan.mm`: each span's advance comes
  from `CTLineGetBoundsWithOptions(line, 0)`, and CoreText leaves trailing
  whitespace out of a line's width, so a span ending in a space measures
  exactly as wide as one that does not, and the next span starts flush
  against it. A no-break space does not escape this — `NSCharacterSet
  whitespaceCharacterSet` is Unicode category Zs, which contains U+00A0.

  `dx` was tried next and **also failed on device**, which is the part worth
  remembering, because the code says it should work: the Fabric props map
  `dx` to `deltaX` (`RNSVGFabricConversions.h`), `pushGlyphContext` passes
  it down, `nextDeltaX` accumulates into `mDX_`, and the draw applies it as
  `offset + (x + dx) * side`. It reads correct end to end and the phone
  still ran the words together.

  **What works is not sharing a `<Text>` at all.** `neon-sign.tsx` now draws
  WIN and TODAY as two independent `<Text>` elements at fixed `x`, one
  `textAnchor="end"` and one `"start"` — the same primitive as the STRONGER
  and TOMORROW lines under them, which had always rendered correctly on the
  same screen. Nothing about the gap depends on how a renderer measures a
  string any more.

  The cost is centring the pair by hand. Only the *difference* of the two
  widths matters, and `LEAN` in that file carries it, measured in the
  preview at 9.5/800: WIN 20.06, TODAY 33.27. **Re-measure it if the words
  or the font size change** — a wrong `LEAN` shifts the line against the two
  below it and is visible; a wrong `GAP` is not.

  **Never carry layout in whitespace inside SVG text**, and prefer separate
  positioned `<Text>` over `TSpan` whenever two runs must sit a known
  distance apart.
- Treat any text difference between the preview and a device shot as the
  preview being wrong, not the phone. Shapes are the other way round.

The other two were plain contradictions, both found by reading the code
against what it already claims:

- `streak-card.tsx` printed `String(DAYS)` — the pip count, a constant 7 —
  where the streak belongs, so the card showed `7` over a single lit pip.
  The pips had always used the real prop; only the number ignored it.
- `mascot-room.tsx` passed `ownedGym={equippedOutfits}`, so a stage skin
  someone paid 300–800 coins for did nothing until they also toggled it on.
  `SHOP_ITEMS` says of those items: *"The highest owned tier is applied
  automatically"*. `owned` was computed in the same component and already
  passed to the shop panel — the stage was the one caller reading the wrong
  set.

The pattern worth copying: all three were found by holding the code against
a claim already written down — a screenshot, a comment, a prop name — rather
than by judging the render by eye.

### Two more room passes, and the one lesson that transfers

Detail and numbers for both are in `components/ascnd/studio/README.md`;
what belongs here is the part that will bite again elsewhere.

**The beam read as several colours mixed together, and the stops were not
the cause.** Removing them changed nothing. A warm at low alpha over this
blue-purple wall does not look like a faint warm — it sweeps blue → purple →
magenta as the alpha climbs, because `highlight`'s blue channel sits barely
above the wall's while its red runs away. The old cone was never strong
enough to leave that sweep: hue down the middle measured 312 · 270 · 261 at
y 110/140/170, so the *bright* half of the beam was magenta and purple with
no part of it gold. It reads 25 · 32 · 24 there now. **A translucent warm
over a cool ground has no colour of its own until it is strong enough; the
fix for "wrong colour" was strength, not hue.**

**Motes, and why they were measured.** Seventeen neon specks at 3–5% now
hang in the room. At that opacity a mote only reads where it is *brighter
than what is behind it*, which two placements failed: a warm one inside the
beam's bright cone came out 7 luminance units darker than the light around
it — a speck of dirt, not dust — and one on the window frame moved the pixel
by 1.5. **Anything drawn at single-digit opacity has to be checked against
its own local background, not against the page.**

The podium's face was lifted and its side darkened so face ÷ side went
2.80 → 3.96; that difference is the only thing making it read as a solid
rather than a disc on the floor.

Both passes were tuned against numbers, not taste — the beam against the
design column already in the studio README, the motes and the podium against
their own measured surroundings. Neither touched text, so neither carries
the preview-versus-device risk above.

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
2. **The shop vs the 70-item wardrobe — and two items that are sold but
   never appear.** `SHOP_ITEMS` sells five outfit keys on head / eyes /
   neck / waist; the character wears one item per slot across head / face /
   top / bottom / shoes / back / hand. `WORN_FROM_SHOP` in
   `mascot-figure.tsx` bridges only the three that overlap — `headband`,
   `cap`, `sunglasses`.

   **`medal` (300 coins) and `belt` (250 coins) therefore render as nothing
   on Koa.** They cannot be fixed by extending that table: `KOA_ITEMS` has
   no `neck` or `waist` slot and no medal or belt anywhere in its 70, so
   there is no art to map them onto. They *do* draw on the other five
   characters, because `vector-mascot.tsx` hand-draws them — so the two
   items work on every companion except the one everybody uses. Either the
   design sheet gains a neck medal and a waist belt, or the shop stops
   selling them and refunds the people who bought them. Not a code
   decision.

   Open with it: prices, unlock rules, and a season/theme field — a third
   of the catalogue is Tết / Christmas / Halloween.
3. **Room items as a shop mechanic.** The studio is a fixed composition, so
   the old stage's auto-placing layout engine has no equivalent. If future
   shop items should furnish the room, that needs designing against the
   studio.
4. **Expressions with no trigger — this is the direction the user picked on
   2026-07-28, so it is the next piece of work.** Three of the sheet's ten
   expressions have no route to the screen: `surprised`, `angry` and
   `confident` (an earlier version of this list missed `confident`). The
   `STATES` table in `koa-emotion.ts` uses the other seven. `run` is mapped
   but nothing in `baseEmotion()` produces it either, so it too is
   reachable only from the DEV picker.

   What is missing is not code but the trigger rules: `EmotionInput` today
   carries only `mood`, `streak`, `hour`, `onWorkoutScreen`, `isBirthday`
   and `cold`, and `baseEmotion()` returns one of curl / hat / sleep / coat
   / happy / sad / tired / idle. Widening it means saying **when** each new
   expression fires and, for most of them, feeding a signal the engine does
   not receive yet (a PR, a lapsed streak, a finished session). Ask the
   user for the rules before inventing them.
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
