# Koa Mascot — Rive Rig & Animation Spec (Hand-off)

**Status: rigging NOT started — this is the brief.** Building the `.riv`
(bones, mesh deformation, IK, constraints, state machine, animations) is
manual work in the **Rive editor** (https://rive.app). This document is the
authoritative spec so any artist — or a follow-up AI guiding one — can
build it *and continue mid-way without drifting*. The app side that
*consumes* the `.riv` is already wired (see “App integration”).

> Character: **Koa**, a chunky Pixar-style koala fitness mascot.
> Target: iOS fitness app (Expo SDK 57 / React Native 0.86, New Arch),
> rendered via `rive-react-native` (installed, v9.8.5).

---

## 0. Reference

![Koala mascot layer breakdown](./koa-rig-reference.png)

- Clean idle art (bg removed) is already in the app: `koa.png`.
- The image above is a **layer-breakdown mock**. ⚠️ It is a *flat preview*,
  not a real layered file. **Before rigging you need the real export:**
  each part below as its own **transparent PNG** (or vector), trimmed, with
  hidden geometry behind overlaps painted in (so joints don’t show gaps).

---

## 1. Required layers (transparent PNGs)

Group / layer names to deliver (match these exactly — the rig + app assume
them). Paint a little extra *behind* every overlap (occluded geometry) so
rotations never reveal a hole.

```
HEAD/        head_top_fur, head_front, head_side_left, head_side_right, head_back
HEADBAND/    headband                      (OUTFIT — separate, swappable)
EARS/        ear_left, ear_right           (each: outer + inner)
FACE/        eyebrow_left, eyebrow_right,
             upper_eyelid_left, upper_eyelid_right,
             eye_left, eye_right,          (sclera+iris+pupil+highlight)
             lower_eyelid_left, lower_eyelid_right,
             nose, mouth, mouth_inside, tongue
NECK/        neck
TORSO/       torso_front, torso_side_left, torso_side_right, torso_back
ARMS/        arm_left_upper, arm_left_lower, hand_left,
             arm_right_upper, arm_right_lower, hand_right
WRISTBANDS/  wristband_left, wristband_right   (OUTFIT — separate)
OUTFIT/      tank_top, shorts                   (OUTFIT — separate)
LEGS/        leg_left_upper, leg_left_lower,
             leg_right_upper, leg_right_lower
SOCKS/       sock_left, sock_right              (OUTFIT — separate)
SHOES/       shoe_left, shoe_right              (OUTFIT — separate)
```

**Naked-body rule:** the *body* layers (head, ears, face, neck, torso,
arms, hands, legs, feet) must be complete on their own. Outfit layers
(headband, wristbands, tank, shorts, socks, shoes) sit on top and are
**swappable** — see §8.

---

## 2. Artboard

- **Name:** `Koa`
- **Size:** 640 × 859 (matches `koa.png` aspect 1.342 → app box lines up).
- Character centred; **feet on the artboard bottom** (so the floor contact
  is at y = bottom in-app).
- Origin/roots at the hip (see skeleton root below).

---

## 3. Skeleton (bones) & pivots

Hierarchy (parent → child). **Pivot = joint centre of rotation**, place at
the anatomical joint, not the layer centre.

```
Root (hip anchor, at pelvis centre ~ mid-hip)
└─ Hips  (pivot: pelvis centre)
   ├─ Spine       (pivot: base of spine)  → Chest (pivot: sternum)
   │   └─ Neck    (pivot: base of neck)
   │       └─ Head (pivot: skull base, just above neck)
   │           ├─ Ear_L (pivot: ear base where it meets skull)
   │           ├─ Ear_R (pivot: ear base)
   │           └─ [face controls — see §5, driven by bones/vertex, not FK]
   ├─ Shoulder_L (pivot: shoulder socket)
   │   └─ ArmUpper_L (pivot: shoulder) → ArmLower_L (pivot: elbow)
   │       └─ Hand_L (pivot: wrist)
   ├─ Shoulder_R (pivot: shoulder socket)
   │   └─ ArmUpper_R (pivot: shoulder) → ArmLower_R (pivot: elbow)
   │       └─ Hand_R (pivot: wrist)
   ├─ ThighUpper_L (pivot: hip socket) → Shin_L (pivot: knee)
   │   └─ Foot_L (pivot: ankle)
   └─ ThighUpper_R (pivot: hip socket) → Shin_R (pivot: knee)
       └─ Foot_R (pivot: ankle)
```

Extra control bones (optional but recommended):
- `Root_CTRL` (whole-character offset for jump/hop — translate/rotate all).
- `COG` (centre-of-gravity, child of Hips) to drive weight-shift/breathing.
- `Look_CTRL` (a target the eyes/head aim at, for Look L/R).

---

## 4. Mesh deformation

Convert these layers to **meshes** and bind vertices to bones (weight
painting) so joints bend smoothly with **no cracks/gaps**:

- **Torso** (torso_front primarily): weight between Hips ↔ Spine ↔ Chest so
  breathing and bends are soft.
- **Arms:** arm_upper + arm_lower as meshes; blend weights across the elbow
  (upper→lower gradient) so the elbow bends without a hard seam. Hand can be
  a rigid layer or light mesh.
- **Legs:** thigh + shin meshes; blend across the knee.
- **Neck:** mesh blended Chest↔Neck↔Head (stretchy, cartoon neck).
- **Ears:** meshes with 2–3 bones each (Ear_base → Ear_mid → Ear_tip) for
  floppy secondary motion (see §7).
- **Cheeks/muzzle:** light mesh so Smile/Happy can push the cheeks.

Guidance: keep vertex counts modest (mobile). Use smooth falloff at joints;
verify by rotating each joint ±45° and checking for gaps/pinching.

---

## 5. Face setup (bones + vertex, reusable across all moods)

Rig the face so expressions are **blendable poses**, not baked frames:

- **Eyes:** each eye is a small group (sclera fixed, iris+pupil on an
  `Eye_L/R` bone that translates within the socket) → aim at `Look_CTRL`
  for Look L/R and idle darting.
- **Eyelids:** `UpperLid_L/R` + `LowerLid_L/R` bones (or morph) that close
  over the eye for Blink / Sleep / Sad. Upper lid does the work; lower lid
  raises slightly for a squishy blink.
- **Eyebrows:** `Brow_L/R` bones — up = surprise/happy, inner-down = sad,
  angled = effort (used by Squat/PushUp/Curl).
- **Mouth:** `Mouth` bone + mesh; corner controls for Smile/Happy (up),
  Sad (down), open (mouth_inside + tongue visible) for Celebrate/Drink.

Keep every face control as a **named pose** so animations reuse them.

---

## 6. IK & constraints

**IK chains** (so hands/feet can be placed and stay planted):
- `IK_Hand_L`: ArmUpper_L → ArmLower_L → Hand_L, target `IK_Hand_L_TGT`.
- `IK_Hand_R`: same on the right (drives Dumbbell Curl, Drink, Wave).
- `IK_Foot_L`: ThighUpper_L → Shin_L → Foot_L, target `IK_Foot_L_TGT`.
- `IK_Foot_R`: same right (keeps feet planted in Squat, Run, PushUp).

Add a **pole/hint** so elbows point back and knees point forward.

**Constraints for natural weight:**
- Rotation constraints (limits) on elbows/knees so they never hyper-extend.
- `COG` translation constraint tied to foot IK — when weight shifts, the
  body leans over the planted foot (no “sliding on ice”).
- Transform constraints so wristbands/socks/shoe cuffs follow their limb
  bones (see §8).
- Distance constraint on the dumbbell prop to `Hand_R` (so it stays gripped
  during Curl).

---

## 7. Secondary motion (the “weight / not stiff” feel)

- **Ears:** 2–3 bone chain each with a slight delay/overlap so they lag and
  settle after head moves (follow-through). Small idle sway.
- **Belly/cheeks:** soft squash on Jump land, breath, and Celebrate.
- **Head:** overlapping delay after the chest on big moves.
- Apply Pixar principles everywhere: **anticipation** before a big action,
  **follow-through/overlap** after, **squash & stretch** on Jump/Celebrate,
  **ease-in/ease-out** (no linear), **arcs** (limbs move on curves).

---

## 8. Clothing independence & reusability (REQUIRED)

Clothes will be **changed later** — never bake clothing into an animation.

- **Animate BONES only.** Every animation moves the skeleton/face; body
  meshes are skinned to those bones.
- **Outfit layers are skinned to the SAME bones** as the body part they
  cover: tank_top → Chest/Spine/Hips; shorts → Hips/Thighs; wristbands →
  ArmLower; socks/shoes → Shin/Foot; headband → Head. So when the body
  moves, clothes deform with it — with **zero animation authored on the
  clothing**.
- Group outfit layers under a **`Outfit` group that can be toggled/swapped**
  (visibility or nested artboards) without touching any animation.
- Result: a new outfit = re-skin new art to the same bones; **all
  animations keep working unchanged.**
- Keep every animation as its own **reusable timeline** (one clip each,
  looping where noted) so the State Machine can mix/blend them.

---

## 9. State Machine — `MascotSM`

Inputs (the app drives these — names are the contract, do not rename):

| Input          | Type    | Values / use                                   |
|----------------|---------|------------------------------------------------|
| `mood`         | Number  | 0 neutral · 1 happy · 2 tired · 3 sad          |
| `blink`        | Trigger | one-shot blink (also auto on a timer)          |
| `lookLeft`     | Trigger | glance left, returns to centre                 |
| `lookRight`    | Trigger | glance right                                   |
| `smile`        | Trigger | quick smile                                    |
| `celebrate`    | Trigger | reward / level-up celebration                  |
| `wave`         | Trigger | greeting                                        |
| `jump`         | Trigger | hop                                            |
| `run`          | Trigger | run cycle (or Boolean `isRunning` if held)     |
| `squat`        | Trigger | one squat rep                                  |
| `pushUp`       | Trigger | one push-up rep                                |
| `dumbbellCurl` | Trigger | one curl rep (prop appears in Hand_R)          |
| `drinkWater`   | Trigger | drink from a bottle                            |
| `sleep`        | Trigger | enter sleeping loop (tie to `mood == tired`)   |

Recommended **layer structure** in the SM:
1. **Base layer** — `Idle`/`Breathing` loop is the default state; `mood`
   blends idle variants (neutral idle ↔ tired slump ↔ sad ↔ happy bounce
   idle). Transitions on `mood` value.
2. **Action layer** (additive/override) — each Trigger plays its clip then
   auto-returns (`exit` back to “any”/idle). Actions blend over the base so
   idle breathing continues underneath where possible.
3. **Face/blink layer** — `blink` fires on a random timer + on demand;
   Look L/R here too, so they don’t interrupt body actions.

Blend/transition rules: ease all transitions (~120–200 ms), no hard cuts;
Sleep is a held state entered when `mood == tired` (or `sleep` trigger) and
exited when mood changes.

---

## 10. Animation list (clips)

All clothing-independent, all reusable, Pixar timing (weighty, eased).

| Clip           | Loop | ~Dur   | Notes / key poses                                    |
|----------------|------|--------|------------------------------------------------------|
| `Idle`         | yes  | 3–5 s  | tiny weight shift, ear sway, occasional micro-move   |
| `Breathing`    | yes  | 3–4 s  | chest up + settle; can be baked into Idle base       |
| `Blink`        | no   | ~150ms | upper lid down+up, lower lid tiny raise              |
| `LookLeft`     | no   | ~0.6 s | eyes lead, head follows w/ overlap, return           |
| `LookRight`    | no   | ~0.6 s | mirror                                               |
| `Smile`        | no   | ~0.5 s | mouth corners up, cheeks push, eyes narrow a touch   |
| `Happy`        | yes/no| ~1 s  | bright idle: light bounce, big smile, ears perk      |
| `Sad`          | yes/no| ~1 s  | slump, brows inner-up, mouth down, slow blink        |
| `Celebrate`    | no   | ~1.5 s | anticipation dip → arms up jump → squash land → cheer|
| `Wave`         | no   | ~1.2 s | weight shift, arm up, 2–3 hand waves w/ overlap      |
| `Jump`         | no   | ~1 s   | crouch (antic) → stretch up → squash land → settle   |
| `Run`          | yes  | ~0.6 s | full run cycle, contact/down/passing/up poses        |
| `Squat`        | no   | ~1.4 s | hips back+down, knees track toes, chest up, rise     |
| `PushUp`       | no   | ~1.4 s | plank → lower (elbow IK) → push up; feet planted     |
| `DumbbellCurl` | no   | ~1.2 s | prop in Hand_R, forearm curls up/down, effort brow   |
| `DrinkWater`   | no   | ~1.8 s | raise bottle to mouth, tilt head, gulps, lower       |
| `Sleep`        | yes  | ~4 s   | eyes closed, slow breathing, optional “z” — held     |

---

## 11. Export

- Export the **`.riv`** with the `Koa` artboard + `MascotSM` state machine.
- Filename: **`koa.riv`**.
- Verify inputs are named EXACTLY as §9 (the app calls them by string).

---

## 12. App integration (already scaffolded — do this to go live)

Code is ready in the app; the `.riv` just needs bundling + registering.

1. **Add the file to the native bundle** (rive-react-native needs it native,
   not via Metro `require`):
   - iOS: add `koa.riv` to the Xcode project bundle (or an Expo asset step).
   - Android: `android/app/src/main/res/raw/koa.riv`.
2. **Register** in `native/src/lib/mascot-rive.ts`:
   ```ts
   export const MASCOT_RIVE = {
     koa: { resourceName: 'koa', stateMachine: RIVE_SM, aspect: 859 / 640 },
   };
   ```
3. **Rebuild** the dev build (native module + asset): `npx expo run:ios`.

Then `MascotFigure` automatically renders the rigged Koa (priority: **Rive →
image → Lottie → vector**). Mood is pushed to the `mood` input
automatically; wire action triggers (e.g. `celebrate` on reward, `sleep`
when tired) in `mascot-rive-view.tsx` / the scene as needed.

Contract lives in code at `src/lib/mascot-rive.ts` (`RIVE_SM`, `RIVE_MOOD`,
`RiveAction`) — keep it in sync with §9.

---

## 13. Continuation checklist (resume here if interrupted)

- [ ] Obtain **real transparent layer PNGs** (§1) — *blocker for rigging*.
- [ ] Create artboard `Koa` 640×859, import + order layers (§2).
- [ ] Build skeleton + pivots (§3).
- [ ] Mesh + weight-paint body parts (§4).
- [ ] Face rig: eyes/lids/brows/mouth as poses (§5).
- [ ] IK chains + constraints + pole hints (§6).
- [ ] Secondary motion on ears/belly/head (§7).
- [ ] Skin outfit layers to body bones; group swappable (§8).
- [ ] Build `MascotSM` inputs + layers + transitions (§9).
- [ ] Author all clips (§10) — reusable, eased, weighty.
- [ ] Export `koa.riv` with exact input names (§11).
- [ ] Bundle + register + rebuild (§12).
- [ ] QA: swap a test outfit to confirm animations still work (§8).

**Do not:** bake clothing into animations · rename SM inputs · animate
anything but bones/face-controls · use linear easing.

---

## 14. What is done vs. pending (for a fresh model)

**Done (in the repo):**
- App consumer wired: `mascot-rive.ts` (registry + contract),
  `mascot-rive-view.tsx` (RiveMascot, lazy native load), and
  `Mascot-figure.tsx` prioritises Rive → image → Lottie → vector.
- `rive-react-native` 9.8.5 installed.
- Clean idle art `koa.png` (bg removed) live via the image path.
- This spec + reference image committed.

**Pending (needs the Rive editor / an artist):**
- Everything in §13 — the actual `.riv` does not exist yet.

**How to continue without drifting:** follow §13 top-to-bottom against the
input contract in §9 and the clothing rule in §8. The moment `koa.riv`
exists and is registered (§12), the app shows it — no further app code
needed for the base case.
