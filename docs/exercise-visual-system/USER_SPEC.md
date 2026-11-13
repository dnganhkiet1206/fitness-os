# User specification, verbatim (received 11/11/2026)

Two parts. Where they differ, PART 2 (the execution override) wins.

==================== PART 1 ====================

MASTER ENGINEERING TASK: BUILD A PREMIUM 3D FITNESS EXERCISE VISUAL PRODUCTION SYSTEM

1. ROLE AND MISSION
Act as a senior 3D technical artist, character technical director, biomechanics engineer, motion-capture engineer, Blender pipeline developer, and software architect.
Your task is to investigate, design, and implement a reusable, production-oriented 3D exercise animation system for my fitness application.
The application is currently called ASCND, but its name may change. Therefore, NEVER hardcode ASCND as a permanent brand identity into the visual system, character assets, animation files, or rendering pipeline.
The system must support replaceable branding through configuration.
The ultimate goal is to create an exercise demonstration library with the visual quality of Lyfta-style anatomical fitness demonstrations, while maintaining our own original visual identity, character, assets, and implementation.
This is NOT a request to generate ordinary AI videos.
I specifically need:

* Anatomically believable human proportions.
* Technically correct exercise movements.
* The same 3D character across every exercise.
* Consistent equipment, materials, lighting, and rendering.
* Precisely synchronized camera angles.
* Reusable motion data.
* Automated animation quality checks.
* Human biomechanical review before an exercise is approved.
* Reliable export to MP4 and GLB.

The system must be scalable to hundreds of exercises without rebuilding the character or manually recreating the entire visual workflow for every exercise.
Do not prioritize impressive-looking demos over technical accuracy.

2. NON-NEGOTIABLE REQUIREMENTS
The following requirements are mandatory.

2.1 Character appearance
Create ONE master anatomical human character.
The character must follow a clean, premium, faceless 3D anatomical fitness illustration style.
Visual direction:

* No detailed face.
* No facial expression.
* No realistic eye rendering.
* No unnecessary skin pores or photorealistic face details.
* Natural human anatomy and proportions.
* Clearly defined but not exaggerated muscles.
* Athletic physique, balanced proportions.
* Clearly visible shoulders, chest, back, arms, abdomen, hips, legs, and joints.
* No cartoon proportions.
* No extreme bodybuilding proportions unless explicitly required by a future exercise variant.
* Avoid grotesque medical anatomy.
* Avoid exposed organs or unnecessarily disturbing anatomical details.
* Use a polished, premium 3D rendering style.

The character should look like a professional exercise instruction model, not a video game character.
Its identity must remain consistent across all exercises.

2.2 Character consistency
The following properties must never randomly change between exercises:

* Character height and proportions.
* Head-to-body ratio.
* Shoulder width.
* Chest dimensions.
* Arm length.
* Leg length.
* Muscle volume.
* Skeleton structure.
* Bone naming.
* Skin/material configuration.
* Overall rendering appearance.

The character must use one master mesh and one master skeleton whenever technically possible.
Do not generate a new character using AI for each exercise.
Do not use separate human models for different camera angles.

2.3 Visual identity
Create a completely configurable visual branding system.
The visual system must support:

* Replaceable logo.
* Replaceable primary and secondary colors.
* Replaceable typography.
* Replaceable background.
* Replaceable lighting presets.
* Replaceable intro/outro assets.
* Replaceable watermark configuration.

Store branding separately from the master character and exercise animation data.
A future application rename must NOT require regenerating any animation.
Do not copy Lyfta's proprietary assets, models, branding, or exact interface. Use it only as a visual quality and presentation reference.

3. FIRST TASK: AUDIT THE EXISTING CODEBASE
Before writing code, inspect the entire relevant project structure.
Do not assume the current implementation, programming language, framework, or asset pipeline.
Identify:

1. Current frontend architecture.
2. Current mobile architecture.
3. Current React Native or native iOS implementation, if present.
4. Existing video playback components.
5. Existing 3D rendering capabilities.
6. Existing asset storage structure.
7. Existing exercise metadata and exercise database.
8. Existing fitness coach or instructional bot integration.
9. Current testing infrastructure.
10. Existing naming and architectural conventions.

Inspect the project before proposing file locations.
Do not rewrite unrelated application components.
Do not break existing features.
The exercise visual production system should be modular and independently testable.
First create:
`docs/exercise-visual-system/ARCHITECTURE.md`
and:
`docs/exercise-visual-system/IMPLEMENTATION_PLAN.md`
Document the actual existing architecture, proposed integration points, technical trade-offs, risks, and milestones.
Then proceed with implementation.
Do not stop after writing documentation or presenting an architecture proposal.

4. OPEN-SOURCE TECHNOLOGY INVESTIGATION
Investigate the following projects and independently verify their actual existence, repository activity, implementation maturity, technical capabilities, and licenses.
Do not blindly assume their capabilities based on descriptions.

Character creation
MPFB2 / MakeHuman:
https://github.com/makehumancommunity/mpfb2
Investigate:

* Human base mesh generation.
* Body proportions.
* Morph targets.
* Rigging.
* Blender compatibility.
* Export capabilities.
* Asset licensing.

Exercise animation pipeline
OpenGym3D:
https://github.com/AssiamahS/opengym3d
Investigate:

* Exercise animation pipeline.
* Blender integration.
* GLB export.
* Character rig.
* Exercise validation.
* Animation inspection.
* Existing exercise assets.
* Whether the current implementation can actually be extended.

Motion capture
RGB MoCap:
https://github.com/toyxyz/toyxyz_RGBMocap
Investigate:

* Motion extraction from real videos.
* 3D pose estimation.
* Contact correction.
* Skeleton consistency.
* Retargeting.
* Equipment and object tracking limitations.
* Hardware requirements.

VideoIntoBlenderModel:
https://github.com/s0ck3t/VideoIntoBlenderModel
Investigate:

* Video-to-animation functionality.
* Mac Apple Silicon compatibility.
* Blender compatibility.
* Retargeting workflow.
* Limitations when body parts are occluded.

OpenCap:
https://github.com/opencap-org/opencap-core
Investigate:

* Multi-camera biomechanics.
* Joint kinematics.
* OpenSim integration.
* Local processing requirements.
* Commercial usage restrictions.
* Whether it is practical for our pipeline.

Animation editing
Mesh2Motion:
https://mesh2motion.org/
Investigate:

* Custom character support.
* Motion retargeting.
* Animation editing.
* GLB export.
* Reusability of animation assets.
* Licensing of the software and bundled assets.

General 3D production
Blender:
https://www.blender.org/
Rigify:
https://docs.blender.org/manual/en/latest/addons/rigging/rigify/
Three.js:
https://threejs.org/
Evaluate the best combination rather than automatically adopting every project.
IMPORTANT:
For every dependency and asset, verify:

* Repository license.
* Model license.
* Animation license.
* Texture license.
* Whether commercial use is permitted.
* Whether attribution is required.
* Whether redistribution is permitted.

Do not include assets with unclear or incompatible commercial licensing in the production pipeline.
Create:
`docs/exercise-visual-system/OPEN_SOURCE_AUDIT.md`
Include a comparison matrix and the reason for each technology selection.

5. MASTER CHARACTER PRODUCTION
Create one premium anatomical human model.

Character specifications
The model should have:

* Anatomically plausible proportions.
* Clearly defined muscular structure.
* Correct shoulder and hip anatomy.
* Distinguishable upper and lower limbs.
* Correct joint placement.
* Natural muscle volume.
* Clean topology.
* Consistent UV mapping.
* Consistent material assignment.
* Appropriate deformation topology for exercise movements.

Avoid excessive anatomical detail that makes small-screen viewing difficult.
The model must remain visually clean and recognizable at mobile display sizes.

Rigging requirements
Build a reusable skeleton that supports:

* Spine.
* Pelvis.
* Neck.
* Head.
* Scapula/shoulder region where appropriate.
* Upper arms.
* Forearms.
* Hands.
* Fingers or simplified grip controls where needed.
* Thighs.
* Lower legs.
* Feet.

Use appropriate IK/FK controls.
Include constraints and helpers for:

* Hand placement.
* Foot placement.
* Equipment contact.
* Barbell grip.
* Dumbbell grip.
* Cable attachment.
* Joint movement.
* Retargeting.

Do not rely exclusively on visual deformation.
The skeleton must be suitable for repeated animation reuse.

Character quality assurance
Check:

* Bone hierarchy.
* Bone naming.
* Rest pose.
* Bone lengths.
* Skin weights.
* Joint deformation.
* Mesh intersection.
* Shoulder deformation.
* Elbow deformation.
* Hip deformation.
* Knee deformation.
* Wrist deformation.

A character that looks good in a static T-pose but deforms badly during exercise is NOT acceptable.
Deliver:

* Master character file.
* Master rig file.
* Blender source file.
* GLB export.
* Character technical documentation.

6. THE MOST IMPORTANT PART: EXERCISE MOTION ACCURACY
Do not use text-to-video AI as the authoritative source for exercise movements.
Do not assume that an AI-generated video is biomechanically correct because it looks realistic.
Use a controlled motion pipeline.
Preferred workflow:

1. Obtain a reference recording of a real person performing the exercise correctly.
2. Use a qualified exercise professional or an authoritative technical reference to verify the movement.
3. Capture motion using an appropriate video-based motion-capture solution.
4. Use multiple synchronized camera views when necessary.
5. Extract joint positions and motion data.
6. Retarget the motion to the master character.
7. Correct anatomical deformation and equipment interactions.
8. Validate the movement.
9. Obtain human approval.
10. Export the approved animation.

Motion sources
Investigate:

* Video-based markerless motion capture.
* Multi-camera motion capture.
* Existing permissively licensed motion datasets.
* Manual Blender animation.
* Hybrid mocap plus manual correction.

Do not assume that a general-purpose motion capture dataset contains correct bodybuilding technique.
Do not use unverified stock animations as production-ready exercise instructions.
If no verified reference motion is available, mark the animation as:
`UNVERIFIED — NOT APPROVED FOR PRODUCTION`
You may still create a clearly labeled technical prototype, but do not claim it is scientifically validated.

Important distinction
Motion capture records movement.
It does NOT automatically establish:

* Correct biomechanics.
* Correct exercise technique.
* Correct bar path.
* Correct equipment positioning.
* Correct muscle engagement.
* Correct joint loading.

The pipeline must distinguish between captured movement and approved exercise instruction.

7. FIRST PROTOTYPE: BARBELL BENCH PRESS
Build Bench Press first.
Do not begin by attempting to produce 100 exercises.
Bench Press is the acceptance test for the entire production pipeline.
The prototype must include:

Character and equipment

* One master anatomical character.
* One adjustable gym bench if necessary.
* One barbell.
* Two weight plates or a configurable plate system.
* Appropriate grip positioning.
* Consistent equipment dimensions.
* Correct interaction between the character and equipment.

Exercise phases
Separate the movement into:

1. Setup.
2. Unrack.
3. Starting position.
4. Eccentric phase.
5. Bottom position.
6. Concentric phase.
7. Lockout.
8. Repeat or finish.

Each phase must have:

* Defined start time.
* Defined end time.
* Joint positions.
* Relevant technical cues.
* Associated validation checks.

Do not artificially force every bench press technique into one universally fixed joint angle.
Account for reasonable variations in body proportions, grip width, anatomy, and technique.

Bench Press technical checks
Implement specific checks for:

Hand and wrist

* Symmetrical grip.
* Correct contact with the bar.
* Wrist alignment.
* No accidental hand penetration through the bar.

Elbow

* Anatomically plausible movement.
* Correct elbow tracking.
* No sudden joint rotation.
* No impossible joint deformation.

Shoulder

* Stable shoulder positioning.
* Appropriate shoulder movement.
* No obvious shoulder dislocation or unnatural deformation.

Barbell

* Consistent bar orientation.
* Symmetrical grip.
* Plausible bar path.
* No uncontrolled lateral tilting.
* No penetration through the character or bench.

Body position

* Correct torso placement.
* Stable support contact.
* Feet maintain plausible contact with the ground.
* No unexplained body movement.
* No mesh/bench intersection.

Temporal continuity

* Smooth movement.
* No frame jumps.
* No sudden velocity spikes.
* No unexplained acceleration.
* No visible foot sliding.
* No animation discontinuity.

These are automated quality-control checks, not a substitute for expert biomechanics approval.

Bench Press camera system
All camera views MUST observe the exact same animation data and timeline.
Create:

CAMERA 01 — SIDE VIEW
Purpose:

* Barbell trajectory.
* Elbow position.
* Wrist alignment.
* Torso position.
* Eccentric and concentric phases.

CAMERA 02 — FRONT VIEW
Purpose:

* Grip symmetry.
* Barbell symmetry.
* Arm symmetry.
* Elbow tracking.
* Shoulder positioning.

CAMERA 03 — 45-DEGREE VIEW
Purpose:

* Overall movement.
* Character-equipment interaction.
* Full exercise presentation.

CAMERA 04 — OPTIONAL CLOSE-UP
Purpose:

* Hand placement.
* Wrist position.
* Bar grip.
* Other relevant technical details.

Requirements:

* All cameras must share the same animation timeline.
* All cameras must use consistent frame rates.
* All cameras must use consistent playback speed.
* Do not generate a separate AI video for each view.
* Camera switching must not cause animation timing differences.
* The system must support scrubbing to the same timestamp across views.

8. MUSCLE HIGHLIGHT SYSTEM
Build a reusable muscle visualization system.
The master character must support configurable muscle highlighting.
Each exercise should contain:

* Primary muscles.
* Secondary muscles.
* Stabilizing muscles, where appropriate.

The system must be able to change material assignments or use dedicated muscle meshes to highlight specific muscle groups.
Examples:
Bench Press:

* Pectoralis major.
* Triceps brachii.
* Anterior deltoid.

Squat:

* Quadriceps.
* Gluteus maximus.
* Hamstrings.
* Adductors.
* Calves as appropriate.

Lat Pulldown:

* Latissimus dorsi.
* Biceps brachii.
* Other relevant assisting muscles.

Do not highlight muscles simply because a text description says they are involved.
Muscle maps must be based on an anatomically defensible exercise-muscle mapping.
Create reusable muscle groups and configurable highlight presets.
The visual highlight must work across front, side, and rear views.

9. VISUAL DESIGN AND RENDERING SYSTEM
Create a professional rendering standard.
The output must look like a premium fitness application, not a low-quality game asset.

Visual requirements

* Clean anatomical model.
* Soft studio lighting.
* Balanced shadows.
* Clear silhouette.
* Clean background.
* High visual contrast.
* No unnecessary visual clutter.
* Correct object scale.
* Professional gym equipment.
* Consistent material roughness.
* Clean anti-aliasing.
* No distorted proportions.
* No flickering.
* No inconsistent lighting between frames.

Branding configuration
Create a separate configurable brand profile.
Example structure:
`brand.config.json`
Conceptually support:

* Brand name.
* Logo path.
* Primary color.
* Secondary color.
* Background color.
* Highlight color.
* Typography.
* Watermark.
* Intro/outro.
* Camera style.
* Rendering preset.

Use placeholder branding until the final application name is decided.
Never bake the application logo permanently into the character mesh or motion data.

10. TECHNICAL ARCHITECTURE
Design the system as an independent asset-production pipeline.
A possible structure, subject to existing project architecture:
`exercise-visual-system/`

* `characters/`
   * `master-character/`
   * `materials/`
   * `rigs/`
   * `muscle-maps/`
* `exercises/`
   * `bench-press/`
   * `squat/`
   * `deadlift/`
* `motion-capture/`
   * `raw/`
   * `processed/`
   * `retargeted/`
* `equipment/`
   * `barbell/`
   * `bench/`
   * `dumbbells/`
   * `cables/`
* `cameras/`
   * `side/`
   * `front/`
   * `three-quarter/`
* `branding/`
   * `brand.config.json`
   * `logos/`
   * `materials/`
* `validation/`
   * `joint-ranges/`
   * `contact-tests/`
   * `trajectory-tests/`
   * `continuity-tests/`
* `exports/`
   * `glb/`
   * `mp4/`
   * `thumbnails/`
* `scripts/`
   * `capture/`
   * `retarget/`
   * `validate/`
   * `render/`
   * `export/`

This is a conceptual structure. Adapt it to the existing codebase rather than blindly creating unnecessary folders.

Automation requirements
Create a repeatable pipeline:
`REFERENCE MOTION → CAPTURE → RETARGET → MANUAL CORRECTION → VALIDATION → APPROVAL → RENDER → EXPORT`
The pipeline should support batch rendering.
A developer should be able to add a new exercise by supplying:

* Exercise metadata.
* Verified motion source.
* Required equipment.
* Camera presets.
* Muscle mapping.
* Validation profile.

The developer should not need to rebuild the character.

11. DATA MODEL
Define a reusable exercise animation schema.
Each exercise should include:

* exercise_id
* exercise_name
* exercise_category
* equipment
* primary_muscles
* secondary_muscles
* stabilizing_muscles
* master_character_id
* motion_source_id
* motion_source_license
* animation_file
* animation_duration
* frame_rate
* exercise_phases
* camera_presets
* validation_profile
* validation_results
* technical_cues
* common_mistakes
* status
* reviewer
* approval_date
* brand_profile_id

Use explicit approval states:

* DRAFT
* CAPTURED
* RETARGETED
* NEEDS_CORRECTION
* TECHNICAL_QA_PASSED
* EXPERT_REVIEW_PENDING
* APPROVED
* REJECTED

Never treat `CAPTURED` or `TECHNICAL_QA_PASSED` as equivalent to `APPROVED`.
Only approved animations can be published as official exercise instruction.

12. AUTOMATED QUALITY ASSURANCE
Build a validation engine.
It should check:

Character checks

* Skeleton integrity.
* Bone lengths.
* Skin deformation.
* Rig compatibility.
* Mesh intersection.

Movement checks

* Joint angles.
* Joint range.
* Motion continuity.
* Velocity discontinuities.
* Bone orientation.
* Symmetry when appropriate.
* Contact stability.

Equipment checks

* Hand-bar contact.
* Barbell penetration.
* Equipment collision.
* Correct object scale.
* Object stability.
* Plausible equipment trajectory.

Rendering checks

* Camera availability.
* Correct resolution.
* Consistent frame rate.
* No missing materials.
* No missing geometry.
* No blank frames.
* No broken animation.
* No visual flickering.

Report
Each exported animation should have a QA report.
Example:

* Exercise: Barbell Bench Press
* Character: Master Character 001
* Motion source: Motion Source 001
* Skeleton integrity: PASS
* Joint continuity: PASS
* Equipment contact: PASS
* Barbell penetration: FAIL
* Camera synchronization: PASS
* Expert approval: PENDING
* Publication status: BLOCKED

Never fabricate test results.
If a validation test has not actually run, mark it `NOT_TESTED`.
If a condition cannot be evaluated automatically, mark it `REQUIRES_MANUAL_REVIEW`.

13. OUTPUT FORMATS
The system must support two primary outputs.

A. GLB
Use GLB for interactive 3D exercise viewing.
Requirements:

* Character mesh.
* Skeletal rig.
* Animation clips.
* Equipment geometry.
* Material assignments.
* Muscle highlight variants where supported.
* Appropriate optimization for mobile devices.

B. MP4
Use MP4 for lightweight instructional playback.
Requirements:

* H.264 where practical.
* Consistent frame rate.
* High-quality rendering.
* No frame flicker.
* No animation discontinuity.
* Consistent camera presets.
* Replaceable logo and visual branding.

Also consider:

* WebP thumbnails.
* GIF previews.
* Transparent-background sequences if technically useful.

Do not export unnecessarily large files.
Measure file sizes and playback performance.

14. MOBILE APP INTEGRATION
Inspect the current application before selecting the 3D viewer technology.
Determine whether the existing mobile architecture can safely support:

* GLB playback.
* Skeletal animation.
* Camera switching.
* Animation scrubbing.
* Playback speed control.
* Muscle highlighting.
* Exercise phase indicators.

Evaluate real compatibility with the existing iOS and React Native architecture.
Do not assume that a WebGL browser viewer will automatically work in React Native.
If GLB rendering introduces substantial mobile compatibility or maintenance risk, use MP4 as the initial production playback format and deliver GLB as an optional interactive feature.
The first requirement is reliable playback on a real iPhone.
Measure:

* Initial loading time.
* Memory usage.
* Frame rate.
* File size.
* Playback stability.
* Device compatibility.

Do not claim iPhone compatibility without an actual device test or clearly identified simulator test.

15. TESTING AND ACCEPTANCE CRITERIA
The Bench Press prototype is accepted only when ALL applicable requirements pass.

Visual acceptance

* One consistent faceless anatomical character.
* Premium 3D appearance.
* Natural human proportions.
* Correct equipment geometry.
* No unwanted facial details.
* No broken anatomy.
* No visible mesh deformation artifacts.
* Clean and consistent materials.

Motion acceptance

* Movement based on a verified reference.
* Appropriate exercise phases.
* Correct hand and equipment interaction.
* Plausible joint trajectories.
* No obvious anatomical violations.
* No uncontrolled barbell movement.
* Smooth animation.
* Expert review completed.

Camera acceptance

* Side view.
* Front view.
* 45-degree view.
* All views synchronized.
* Identical animation timing.
* No independently regenerated movements.

System acceptance

* Master character reusable.
* Rig reusable.
* Camera presets reusable.
* Brand configuration replaceable.
* Exercise metadata reusable.
* MP4 export works.
* GLB export works.
* Validation report generated.
* Automated tests pass.

Documentation acceptance
Document:

* How to add a new exercise.
* How to record reference motion.
* How to capture movement.
* How to retarget animation.
* How to correct animation.
* How to validate an exercise.
* How to create a camera preset.
* How to change the brand.
* How to export MP4.
* How to export GLB.
* How to integrate assets into the application.

16. PERFORMANCE AND HARDWARE CONSTRAINTS
Current development hardware may include:

* MacBook Air M3.
* 8GB RAM.
* External USB-C SSD, 1TB.

Do not assume this computer can run large motion-capture models or complex render jobs efficiently.
Design the workflow so:

* Code and metadata can be developed on the Mac.
* Lightweight Blender tasks can run locally where practical.
* GPU-intensive motion capture can run on a compatible workstation or cloud GPU.
* Source assets are portable.
* No proprietary cloud service is mandatory.
* No expensive subscription is required for the core production pipeline.

Prefer free and open-source tools.
When a cloud GPU is necessary, estimate its requirements separately.
Do not purchase or introduce a paid service without documenting the reason, cost, and alternatives.

17. IMPLEMENTATION STRATEGY
Work in controlled phases.

PHASE 1 — Technical audit

* Inspect the existing application.
* Verify open-source repositories.
* Verify licenses.
* Evaluate technical feasibility.
* Document architecture.

PHASE 2 — Master character

* Create the anatomical faceless character.
* Build the skeleton.
* Validate deformation.
* Create reusable materials.
* Export a test GLB.

PHASE 3 — Bench Press motion

* Obtain a verified reference.
* Capture or manually construct motion.
* Retarget.
* Correct equipment interactions.
* Divide the movement into phases.

PHASE 4 — Biomechanics QA

* Implement automated checks.
* Generate validation reports.
* Correct animation defects.
* Obtain expert approval.

PHASE 5 — Rendering

* Build the synchronized camera system.
* Create premium lighting and materials.
* Render MP4.
* Export GLB.
* Generate thumbnails.

PHASE 6 — Application integration

* Integrate the MP4 viewer first if it is the safest approach.
* Test GLB playback if feasible.
* Test on iPhone.
* Document performance.

PHASE 7 — Reusability test
After Bench Press is approved, test whether the same master character and rig can be reused for:

* Incline Dumbbell Press.
* Squat.
* Lat Pulldown.

These are not required to be fully production-ready in the first milestone, but the architecture must not make their addition unnecessarily difficult.

18. EXECUTION RULES
Follow these rules throughout the task.

1. Do not generate generic AI videos as the final exercise instruction assets.
2. Do not invent biomechanics claims.
3. Do not fabricate validation results.
4. Do not substitute visual realism for technical correctness.
5. Do not create a new character for each exercise.
6. Do not use different animation sources for different camera views.
7. Do not hardcode the current brand name.
8. Do not add unverified commercial assets.
9. Do not modify unrelated application code.
10. Do not install unnecessary dependencies.
11. Do not assume a feature works without testing it.
12. Do not mark a motion as production-approved without expert review.
13. Preserve existing architecture and tests.
14. Document technical compromises explicitly.
15. Prefer the smallest working vertical slice over a large unfinished implementation.

If a requested feature is technically impossible using the selected open-source tools, explain the limitation and provide a feasible alternative.
If a repository is abandoned, unavailable, incompatible, or improperly licensed, do not force it into the architecture.
If no real verified motion source is available, build the pipeline and a clearly labeled unverified prototype rather than falsely claiming a correct exercise demonstration.
Do not stop at recommendations. Implement what can genuinely be completed in the current development environment.

19. FINAL DELIVERABLES
At the end of the first implementation milestone, provide:

1. Technical architecture documentation.
2. Open-source and license audit.
3. Master 3D anatomical character.
4. Reusable skeleton and rig.
5. Blender source project.
6. Bench Press prototype animation.
7. Synchronized side/front/45-degree camera views.
8. Muscle highlight system.
9. Automated QA scripts.
10. Validation report.
11. MP4 output.
12. GLB output.
13. Integration guide.
14. Unit and integration test results.
15. Known limitations and unresolved issues.
16. Estimated GPU hardware requirements for scaling.

Provide actual file paths and evidence that each deliverable exists.
Distinguish between:

* Implemented and tested.
* Implemented but not tested.
* Prototype only.
* Planned.
* Blocked by external dependencies or missing reference data.

Do not claim completion for work that has not been performed.

20. FINAL SUCCESS DEFINITION
The project succeeds when we can produce a premium, consistent, technically reviewed Bench Press demonstration using one reusable faceless anatomical 3D character.
The same animation must drive every camera angle.
The same character, skeleton, material system, camera presets, and rendering configuration must be reusable for subsequent exercises.
The brand must be replaceable without rebuilding the visual assets.
Most importantly:
The system must prioritize exercise movement correctness over visual spectacle.
I do not want a beautiful AI-generated video that demonstrates incorrect exercise technique.
I want a reusable 3D exercise production engine capable of generating professional, consistent, technically reviewed instructional visuals for hundreds of exercises.
Start by auditing the actual codebase and verifying the technology choices. Then create the architecture documents and implement the smallest complete Bench Press vertical slice.
Do not stop after giving me a proposal.

==================== PART 2 ====================

EXECUTION OVERRIDE — BUILD THE ACTUAL PRODUCT NOW
This instruction overrides any previous tendency to stop at research, planning, architecture proposals, or documentation.
I do NOT want another analysis report.
I want actual working deliverables created in the current repository.
You are authorized to make reasonable technical decisions and proceed without asking me for confirmation.

1. YOUR PRIMARY OBJECTIVE
Build and deliver a real, working prototype of the Premium 3D Exercise Visual Production System.
The first deliverable is a complete BARBELL BENCH PRESS demonstration.
It must include:

1. One premium faceless anatomical 3D human character.
2. One reusable skeleton and rig.
3. A barbell and gym bench.
4. An animated Bench Press movement.
5. Three synchronized camera angles.
6. Muscle highlighting.
7. Premium lighting and rendering.
8. Actual MP4 video files.
9. An actual GLB 3D file.
10. The editable Blender source project.

DO NOT finish your response until you have made a genuine attempt to create these deliverables.

2. BUILD FIRST — NO EXTENDED PLANNING
Start by performing a quick inspection of:

* Current repository.
* Existing assets.
* Available Python environment.
* Blender installation.
* FFmpeg availability.
* GPU and available memory.
* Existing application integration points.

Limit preliminary investigation to what is necessary to begin building.
Do not spend the task producing lengthy documentation.
Do not wait for approval of the architecture.
Do not create only empty folders, placeholder files, TODO comments, or mock interfaces.
Do not claim that an animation exists unless you actually created and verified it.

3. CREATE THE MASTER CHARACTER
Create one original premium faceless anatomical 3D character.
Visual target: high-quality anatomical fitness demonstration similar in presentation quality to Lyfta.
Requirements:

* No detailed face.
* No visible facial expressions.
* Smooth, clean anatomical surfaces.
* Natural athletic human proportions.
* Clearly defined muscles without exaggerated bodybuilding proportions.
* Anatomically believable shoulders, chest, arms, back, abdomen, hips and legs.
* Clean skin/material finish.
* Neutral premium color scheme.
* Professional studio lighting.
* Suitable for mobile-sized presentation.

Use MPFB2, MakeHuman, Blender, or another genuinely suitable, permissively licensed workflow.
If those tools cannot be used immediately, build the best working character possible using Blender's procedural modeling capabilities.
Do not let an unavailable external dependency prevent the creation of the first prototype.
Save the actual editable character and rig.

4. BUILD THE BENCH PRESS ANIMATION
Create one complete Bench Press repetition.
The animation must contain:

* Setup.
* Unrack or starting transition.
* Controlled eccentric movement.
* Bottom position.
* Controlled concentric movement.
* Lockout.
* Return or end position.

The animation must have smooth transitions and plausible human biomechanics.
Specifically inspect:

* Hand placement.
* Grip symmetry.
* Wrist positioning.
* Elbow tracking.
* Shoulder positioning.
* Barbell trajectory.
* Torso position.
* Foot contact.
* Bench contact.
* Equipment collision.
* Character deformation.

Do not randomly generate keyframes without checking the resulting movement.
Use verified reference motion where available.
If no licensed and verified motion source is accessible, build a clearly labeled provisional animation based on a documented technical reference. Do not falsely mark it as biomechanically approved.
The animation must remain editable.

5. IMPLEMENT THE THREE-CAMERA SYSTEM
All three cameras must use EXACTLY the same animation timeline.
Create:

* SIDE VIEW.
* FRONT VIEW.
* 45-DEGREE VIEW.

Render each view independently.
Do not create three different animations.
Do not use AI-generated videos.
Do not regenerate character movement separately for each camera.
The three output videos must show the same repetition at the same timestamps.

6. APPLY PREMIUM VISUAL DESIGN
Create an original visual identity.
Use:

* Clean anatomical character materials.
* Soft studio lighting.
* Professional shadows.
* Smooth rendering.
* Clear equipment geometry.
* Minimal background.
* Consistent camera framing.
* Premium presentation.

Add configurable muscle highlighting for the primary and secondary muscles involved in Bench Press.
Keep the logo and branding separate from the character and animation.
Do not permanently hardcode ASCND into the model because the application may be renamed.

7. REQUIRED OUTPUT FILES
Create actual files in the current repository.
Use this directory unless an existing project convention provides a better location:
`artifacts/exercise-visual-system/bench-press/`
Required deliverables:

Character and animation source

* `bench_press_master.blend`
* `master_character.glb`
* `bench_press_animation.glb`

Rendered videos

* `bench_press_side.mp4`
* `bench_press_front.mp4`
* `bench_press_45.mp4`

Visual previews

* `character_preview.png`
* `bench_press_preview.png`
* `camera_comparison.png`

Technical validation

* `qa_report.json`
* `motion_metadata.json`
* `render_metadata.json`

Reproducible source

* `build_scene.py`
* `animate_bench_press.py`
* `render_cameras.py`
* `export_glb.py`
* `validate_animation.py`

The exact filenames may be adapted when technically necessary, but all equivalent deliverables must actually exist.

8. QUALITY CONTROL
Before considering the prototype complete:

* Open or parse the generated Blender project.
* Verify that the character exists.
* Verify that the rig exists.
* Verify that the animation has keyframes.
* Verify that the barbell and bench exist.
* Verify that all three cameras exist.
* Verify camera synchronization.
* Render actual frames.
* Inspect the rendered frames.
* Export actual MP4 files.
* Export actual GLB files.
* Check that the output files are not empty or corrupted.
* Run available validation scripts.

Use a reasonable first-render configuration if hardware is limited:

* 720p.
* 24 FPS.
* Eevee where suitable.
* A short instructional clip.
* Optimized render settings.

Prefer a complete, good-quality working prototype over an unfinished attempt at extremely high resolution.
Never fabricate QA results.
Use these status values:

* PASS
* FAIL
* NOT_TESTED
* REQUIRES_MANUAL_REVIEW
* UNVERIFIED

Do not mark biomechanical correctness as PASS without appropriate validation and qualified human review.

9. APPLICATION INTEGRATION
After the assets are successfully created:

* Inspect the existing application's exercise system.
* Determine the safest integration point.
* Integrate the sample MP4 or GLB into an existing exercise demonstration component if the architecture supports it.
* Do not rewrite unrelated screens.
* Do not break existing functionality.
* Test the actual integration where possible.

If mobile GLB playback is not ready, use MP4 first and document the GLB integration separately.

10. REUSABILITY REQUIREMENT
Do not build a one-off Bench Press scene that cannot be reused.
Separate:

* Master character.
* Skeleton and rig.
* Exercise animation.
* Equipment.
* Camera configuration.
* Muscle mapping.
* Rendering configuration.
* Brand configuration.

Create a reusable exercise configuration that makes it possible to add Squat, Lat Pulldown, Deadlift and other movements without recreating the character.

11. EXECUTION PRIORITIES
Work in this exact order:

1. Create the master character.
2. Create and test the rig.
3. Create the Bench Press animation.
4. Create the gym equipment.
5. Create the three synchronized cameras.
6. Render actual preview images.
7. Render the three MP4 files.
8. Export GLB files.
9. Run validation.
10. Integrate with the application if feasible.
11. Document the finished implementation.

If a step fails, diagnose and attempt a practical alternative.
Do not abandon the whole task because one open-source dependency is unavailable.
If full implementation is impossible in the current environment, produce the maximum genuinely working result and explicitly identify the remaining blocker.

12. FINAL RESPONSE MUST SHOW ACTUAL RESULTS
When finished, report:

* Exact paths of generated files.
* Character preview.
* Bench Press preview.
* Three camera outputs.
* GLB export status.
* Blender source project location.
* Actual tests executed and their results.
* What is implemented.
* What still requires expert review.
* Any technical limitations.

Do not respond with another architecture proposal.
Do not respond with a list of repositories to investigate.
Do not respond with an implementation plan instead of implementation.
Do not stop after creating documentation.
THE DELIVERABLE IS THE PRODUCT, NOT THE ANALYSIS.
Start building now and continue until you have created and verified the actual prototype artifacts.
