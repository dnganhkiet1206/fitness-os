# Exercise visual system — how to work with it

Short how-to for each step the spec asks about. Commands run from `artifacts/exercise-visual-system/`; `B=/Applications/Blender.app/Contents/MacOS/Blender`. Every Blender command uses `-b --factory-startup` (no UI, user preferences untouched).

## Milestones

| # | Milestone | State |
|---|---|---|
| 1 | Bench Press vertical slice: character, rig, motion, 4 cameras, MP4, GLB, QA report, Debug app integration | built; motion UNVERIFIED |
| 2 | Expert review of the bench press (motion, muscle regions); fix what they find; set `status`, `reviewer`, `approval_date` | waiting for a qualified reviewer |
| 3 | Production delivery: MP4 + poster to Supabase Storage + `exercise_media` rows (needs Kiệt's approval: data change) | not started |
| 4 | Reusability test: Incline Dumbbell Press, Squat, Lat Pulldown with the same character (needs dumbbell / cable equipment builders) | not started |
| 5 | Interactive 3D (RealityKit with USDZ, or WKWebView + three.js) after a mock is approved | not started |

## Add a new exercise

1. Copy `bench-press/` to `<new-exercise>/` and edit `exercise.json`: id and name, equipment entries (spec names from `config/equipment.json`), muscles (group names from `config/muscle_map.json`), phases with start / end seconds, cues and checks, camera presets, technique parameters, validation profile, `motion_source_*`, `status: "DRAFT"`.
2. Write `animate_<exercise>.py`: open `_scene.blend`, place the character, bind hands / feet to sockets on the equipment, key the equipment path and pole targets. Reuse `evs/motion.py` and `evs/rig.py`; do not touch the character.
3. Add any new equipment type to `evs/equipment.py` + `config/equipment.json`.
4. Run: `build_scene.py -- --exercise <x>`, the animate script, `render_cameras.py -- --exercise <x> --stills`, look at the stills, then the full render, `export_glb.py`, `validate_animation.py`.
5. Movement-specific checks (like bar path for the bench) go in `evs/validation/checks.py` behind the phase ids the exercise defines.

## Record reference motion

Film a qualified lifter performing a submaximal, technically clean repetition: two or three synchronised phones (side at bar height, front-high, 45°), 60 fps, plain background, the bar's end caps and the lifter's joints visible, tight clothing. Record grip width, bench and rack heights, plate sizes and the lifter's height and limb lengths. Get written permission to use the footage and the reviewer's written notes on what is correct in it.

## Capture movement

No capture tool in the audit is both licence-clean for commercial use and able to run here (see `OPEN_SOURCE_AUDIT.md`). Practical routes: (a) measure key poses from the reference video by hand (bar height, touch point, elbow angle per phase) and enter them as technique parameters, which is what the pipeline does now; (b) on a Windows / NVIDIA workstation, run a pose estimator whose weights allow commercial use (needs a licence review per model), export joint positions as JSON with a timestamp per frame.

## Retarget

Captured joints map onto the 53-bone skeleton by name (`pelvis`, `spine_01..03`, `neck_01`, `head`, `clavicle_*`, `upperarm_*`, `lowerarm_*`, `hand_*`, `thigh_*`, `calf_*`, `foot_*`, `ball_*`). Drive the IK controls (`ctl_hand_*`, `ctl_foot_*`) from captured wrist / ankle positions and the pole controls (`ctl_elbow_*`, `ctl_knee_*`) from elbow / knee positions, rather than copying rotations: bone lengths stay the character's own. Then bind hands to the equipment sockets so contact is exact.

## Correct animation

Open `<exercise>/<exercise>_master.blend` in Blender. Animated channels are listed in `motion_metadata.json` (`animated_channels`); for the bench they are `Barbell` location, `ctl_elbow_*` location and `clavicle_*` rotation. Edit keys in the Graph Editor, or change technique parameters in `exercise.json` and re-run the animate script (preferred: reproducible). Re-run validation after every change.

## Validate

`$B -b --factory-startup --python pipeline/validate_animation.py -- --exercise <x>` writes `qa_report.json`. Statuses are only PASS, FAIL, NOT_TESTED, REQUIRES_MANUAL_REVIEW, UNVERIFIED. `python3 pipeline/validate_animation.py --exercise <x> --from-samples` re-runs the checks without Blender. Unit tests: `python3 -m unittest discover -s tests`. Automated checks never approve technique: a qualified reviewer does, by setting `status: "APPROVED"`, `reviewer` and `approval_date` in `exercise.json`; the publication gate reads those.

## Create a camera preset

Add an entry to `config/camera_presets.json` (azimuth, elevation, focal length, margin, `file_suffix`, purpose) and list its name in the exercise's `camera_presets`. Framing is fitted automatically to everything visible in the clip. For a camera that follows something, give `follow` and `frame_width_m`, and pass the follow target in the animate script.

## Change the brand

Edit `config/brand.config.json` (or point `EVS_BRAND_CONFIG` at another file): name, logo, colours (background, highlight and muscle colours, character and equipment colours), typography, watermark (`enabled`, `image_path`, position, size, opacity), intro / outro, lighting and render presets. Then re-run `build_scene.py`, the animate script and `render_cameras.py`. The character, rig and motion data never contain brand values; nothing is re-animated by hand.

## Export MP4

`$B -b --factory-startup --python pipeline/render_cameras.py -- --exercise <x>` renders PNG frames per camera to `$TMPDIR/evs-work` (deleted afterwards) and encodes H.264 / yuv420p / faststart MP4 with the system ffmpeg: `<x>_<camera>.mp4` (whole clip) and `<x>_<camera>_loop.mp4` (one repetition). The watermark is burnt in at this step. `--stills` renders only the comparison sheet and preview.

## Export GLB

`$B -b --factory-startup --python pipeline/export_glb.py -- --exercise <x>` writes `master_character.glb` (rest pose) and `<x>_animation.glb` (character + equipment + one baked clip, 53 joints, two material variants `muscle_highlight` / `neutral` via `KHR_materials_variants`), re-imports both into an empty Blender to prove they load, and writes `glb_report.json`.

## Integrate assets into the app

Debug today: copy the loop MP4 and a JPEG poster into `apps/ios/ASCND/Resources/ExerciseDemos/` and add the exercise name to `ExerciseDemo3D.clips`. Production: upload to Supabase Storage and add `exercise_media` rows so `ExerciseGuideView` plays them like any other guide video — only for exercises whose QA report says `publication_status: PUBLISHABLE`.
