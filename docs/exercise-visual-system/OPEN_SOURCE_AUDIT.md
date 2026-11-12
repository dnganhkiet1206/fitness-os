# Open-source and licence audit

Checked 11/11/2026 by four research agents reading primary sources (repositories through the GitHub API, LICENSE files, official docs, rule books), then re-checked by a fifth agent whose job was to refute them: 67 claims confirmed, 4 partly wrong (corrected below), 2 unverifiable. Raw findings: `artifacts/exercise-visual-system/bench-press/reference_notes.json` (technique and equipment) and this page (software).

Hard requirements used for the verdicts: (1) commercial use allowed for everything that ends up in shipped assets; (2) runs on, or can be driven from, Blender 5.2 on a MacBook Air M3 / 8 GB, with GPU-heavy steps allowed elsewhere; (3) one original master character reused for every exercise.

## Matrix

| Project | Exists / maintained | What it really does (verified) | Code licence | Assets / output | Commercial | Runs here | Verdict |
|---|---|---|---|---|---|---|---|
| **Blender 5.2 LTS** | yes, active | modelling, rigging, EEVEE headless render, glTF exporter with skins, animation, `KHR_materials_variants` via our post-processing | GPL-2.0+ (app only) | output is the user's ("GPL only applies to the Blender application and not the artwork") | yes | **yes, used** | **ADOPT** |
| **MPFB2 / MakeHuman** 2.0.18 | yes, active (last push 24/10/2026) | base mesh 19,158 verts, 352 macro targets, 8 rigs with weights incl. `game_engine` (53 bones) | GPL-3.0+ (add-on code, not shipped) | bundled assets **CC0 1.0**; "no claim whatsoever over output" (LICENSE.md §C, §D) | yes (core assets); CC-BY asset packs need attribution — **not used** | **yes, used headless on 5.2** | **ADOPT as one-time character bootstrap** |
| **Rigify** (bundled) | yes | control rig generator | GPL-2.0+ | generated `rig_ui.py` is GPL-derived script text | conditional: keep `rig_ui.py` out of shipped files | yes | **not used**: 160 deform bones is heavy for mobile; we use MPFB `game_engine` + our own small control layer |
| **Three.js** r187 | yes, active | GLTFLoader plays skinned, animated GLB; variants need ~40 lines of app code | MIT | none bundled that would ship | yes | n/a (runtime) | **optional** web/QA viewer; inside the iOS app it would mean a WKWebView |
| **Mesh2Motion** | yes, active (3.6k stars) | browser tool: auto-rig + CC0 animation library; editing limited to mirror / arm spacing / compositing | MIT | animations, rigs CC0; some character variants CC-BY/CC-SA | yes (CC0 parts) | browser | **reference only**: no strength exercises (push-up, jumping jacks, jog, walk…), no curve editor |
| **OpenGym3D** | yes, **stale** (single author, last commit 15/09/2026) | Blender 4.5 build scripts, GLB QA gate | MIT | mixed: CC0 clips, Mixamo-driven specs (Adobe terms), YouTube-derived demo data the repo itself marks non-commercial | conditional | no (Blender 4.5, legacy action API) | **reference only**: ideas for QA borrowed, no code or assets used; it has no bench press |
| **RGB MoCap** (toyxyz) | yes, active, 2 weeks old | video → SMPL-family pose with several models | MIT (app code only) | default models ExMR / GVHMR / PromptHMR / SMPL are **non-commercial**; default tracker YOLOv8 is AGPL | effectively **no** | **no** (Windows + NVIDIA only) | **reject for production**; GEM-X path needs legal review of the NVIDIA Open Model License |
| **VideoIntoBlenderModel** (v2bm) | yes, 4 weeks old, 4 stars, one author | MediaPipe monocular landmarks → user rig in Blender | Apache-2.0 | MediaPipe Apache-2.0; bundled sample rigs/videos have mixed terms | yes (code + deps) | yes (CPU; no Apple GPU path despite `--device mps`) | **optional experiment** only; no evidence it handles a lying lifter with the bar occluding the arms |
| **OpenCap** | yes, active; last release v1.0.0 (2022) | multi-iPhone capture → OpenSim joint angles | Apache-2.0 | hosted service forbids commercial entities; OpenPose is non-commercial | **no** | no (Windows/Ubuntu + CUDA) | **reject**: also outputs OpenSim angles, not character animation, and needs ≥ 2 cameras to see every segment |

Corrections the verification found: Three.js does not release monthly in 2026 (five releases, 1–2.5 months apart); Wagner 1992 does not show a single ~200 % biacromial optimum; Larsen 2021's table does not give a chest-to-lockout bar offset (axis undefined, the second velocity peak is not lockout); the 1.9–5.6 s tempo range is one Smith-machine study, and the commonest imposed tempo in the reviewed EMG studies is 2 s down / 2 s up.

## What the pipeline uses and why

- **Blender 5.2** for everything (character, rig, animation, render, export). The only tool that passed all three requirements and was proven by running it on this Mac.
- **MPFB2, once**, to generate the body. Its CC0 base mesh gives correct human proportions, clean all-quad topology, UVs and skin weights; building that procedurally would be weeks of work and worse. The add-on is only needed to rebuild the character, never by exercises. No asset packs (skins, hair, clothes) are used, so no CC-BY attribution applies. The face, shorts, muscle regions and every material are made by our own code.
- **No motion-capture tool is in the pipeline.** Every mocap option found is either non-commercial (RGB MoCap models, OpenCap/OpenPose), Windows + NVIDIA only, or unproven on a lying, occluded lifter (v2bm). The bench press is therefore keyframed from documented references and labelled `UNVERIFIED — NOT APPROVED FOR PRODUCTION`.
- **Not adopted, by reason**: OpenGym3D (stale, Blender 4.5, mixed-licence motion), Mesh2Motion (no strength motions; useful later for warm-up / cardio clips under CC0), Rigify (too many bones for mobile; GPL `rig_ui.py`), Three.js (only needed if a web viewer is chosen).

## Open licence risks

- MPFB's "no claim over output" is the MakeHuman team's statement, not a warranty. Keep the record that only bundled CC0 core assets were used (`config/master_character.json` → `generator`).
- `blender.org/about/license` returned HTTP 403 to every agent; the rule quoted above comes from the Blender manual. Python scripts saved inside distributed `.blend` files were not checked against a primary source. The `.blend` files are source files and are not shipped in the app.
- Blender 5.3.0 was tagged on 09/11/2026; MPFB and the glTF exporter were tested on 5.2 only.
- Any future mocap path needs a fresh licence review of the exact model weights used, not only the tool's code licence.
