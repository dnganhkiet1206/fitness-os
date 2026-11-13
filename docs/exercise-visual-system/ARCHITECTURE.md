# Exercise visual system — architecture

Status 12/11/2026. The pipeline lives in `artifacts/exercise-visual-system/`; its README is the hand-over page (status, commands, decisions). This page describes the existing app it plugs into and how the parts fit.

## The app as it is (read from the code, 11/11/2026)

| Area | What exists |
|---|---|
| Product | Native iOS app in `apps/ios` (SwiftUI, iOS 26 target); core logic in Swift packages `ASCNDKit` (`ASCNDCore` builds on Linux, no UIKit), `ASCNDBackend` (Supabase), `ASCNDStore`. A Watch app target exists. |
| React Native | `native/` is the old app, kept as behaviour reference and for the check scripts (`native/tools/check.mjs`). Not shipped. |
| Exercise data | Supabase tables `exercises` (name, muscle group, equipment, legacy `video_url`), guide content and media rows per exercise (`ExerciseGuideSource.guideRows / guideContent / guideMedia`). `ExerciseGuides.fetch` matches by id, then by normalised name. Cached locally (`ExerciseGuideCache`). |
| Exercise demonstration UI | `ASCND/Features/Exercises/ExerciseGuideView.swift`: one scrolling sheet; hero `TabView` of `MediaThumb`; tap opens `GuideMediaViewer`, which plays a single video with `VideoPlayer(player: AVPlayer(url:))`. Media model `MediaState` (`none / image_single / image_gallery / video`) in `ASCNDCore/Workout/ExerciseGuide.swift`. |
| 3D | None. No SceneKit, RealityKit, Model3D or WKWebView anywhere in the app. iOS has no built-in glTF loader (RealityKit reads USDZ). |
| Coach / bot | "Koa Coach" (AI answers via server functions) and the rule-based Daily Plan; neither references exercise media. |
| Tests | `swift test` per package, app snapshot tests (references from CI), XCUITest accessibility audit, Maestro E2E flows, fast gates in `apps/ios/tools/*.mjs`. |
| Conventions | Vietnamese docs, `claude/<slug>` branches into `native/ios-rewrite`, every visible string in `Localizable.xcstrings` (en / vi / es), Debug-only features behind `#if DEBUG`. |

## The pipeline

```
REFERENCE  →  (CAPTURE)  →  (RETARGET)  →  KEYFRAME / CORRECT  →  VALIDATE  →  APPROVAL  →  RENDER  →  EXPORT
reference_     no licence-clean      animate_<ex>.py             validate_      exercise.json     render_     export_
notes.json     mocap path today                                  animation.py   status/reviewer   cameras.py  glb.py
```

Separated parts, each with its own file:

| Part | Where | Reused by every exercise |
|---|---|---|
| Master character (mesh, faceless head, shorts, UVs, skin weights) | `config/master_character.json` → `pipeline/build_character.py` → `characters/master_character_001/master_character.blend` | yes, appended, never rebuilt |
| Skeleton and rig | 53 deform bones (MPFB `game_engine`), control layer `evs/rig.py` (IK/FK arms and legs, pole targets, solved bar grip, equipment sockets) | yes |
| Muscle map and highlight | `config/muscle_map.json` (21 groups) → `pipeline/bake_muscle_atlas.py` → UV masks; per exercise an RGB map (primary / secondary / stabiliser) | yes |
| Equipment | `config/equipment.json` + `evs/equipment.py` (parametric bar, plates, collars, bench with rack) | yes |
| Exercise | `<exercise>/exercise.json` (schema fields from the spec, phases, cues, technique parameters, validation profile) + `animate_<exercise>.py` | one folder per exercise |
| Cameras | `config/camera_presets.json`; framing fitted automatically to what is visible in the clip | yes |
| Render quality and lighting | `config/render_presets.json` | yes |
| Brand | `config/brand.config.json` (placeholder; `EVS_BRAND_CONFIG` selects another) | yes; never baked into mesh or motion |
| Validation | `evs/validation/` (plain Python) fed by `evs/sampling.py` (Blender) | yes; thresholds per exercise |

**Camera synchronisation** is structural: one `.blend`, one timeline; `render_cameras.py` renders the same frame numbers from each camera in turn and only changes `scene.camera`. The close-up camera is parented to the bar, not animated. `validate_animation.py` then re-checks it on the encoded videos (when the picture moves and holds still, camera against camera).

## Integration into the app (done)

- `ExerciseGuideView` asks `ExerciseDemo3D.media(for:)` (Debug builds only) when the server has no media for the exercise. For Bench Press it returns a `MediaState.bundledVideo` pointing at `Resources/ExerciseDemos/bench_press_45_loop.mp4` with a poster. The hero shows a "3D demo · not yet reviewed" badge.
- Why Debug only: the motion is `UNVERIFIED`; the spec allows publishing only `APPROVED` exercises. Release builds keep showing server media only.
- Removal: delete `ExerciseDemo3D.swift`, `Resources/ExerciseDemos/`, the `#if DEBUG` block in `ExerciseGuideView` and the two `eg.demo3d.*` strings.

## Production integration (not done; options)

1. **MP4 from storage (recommended first)**: upload approved MP4s and posters to Supabase Storage and insert `exercise_media` rows (`kind = video`). The existing guide sheet plays them with no app change. Needs a migration / data change, so Kiệt's approval.
2. **Interactive 3D**: convert the GLB to USDZ (Reality Converter or `usdzconvert`) and show it with RealityKit (`Model3D` / `RealityView`), which supports skeletal animation playback; material variants would be separate USDZ files or swapped materials in code. Alternative: WKWebView + three.js reading the GLB directly (variants supported by our file). Both are new UI and need a mock approved first.

## Trade-offs and risks

- Keyframed motion is only as good as its reference; it is not measured human movement. Approval by a qualified person is the gate, enforced in `evs/validation/report.py`.
- The MakeHuman base mesh deforms with linear blend skinning: elbows and shoulders lose some volume in deep flexion (measured in `rig_test.json`), and palm pads are rigid, so up to 8 mm of pad inside the bar is accepted as pressed soft tissue.
- Rendering is 720p EEVEE on an 8 GB laptop: about 1 s per frame per camera. A 100-exercise library at 4 cameras × ~230 frames is ~25 hours on this machine; see the GPU estimate in the README.
- Binary files (`.blend`, `.mp4`, `.glb`, `.npz`) are committed because the repository has no Git LFS and Kiệt asked for everything to be handed over (11/11). Each is under 2 MB; total stays small but grows per exercise.
