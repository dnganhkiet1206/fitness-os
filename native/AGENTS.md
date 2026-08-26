# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# UI / design work: read the skills first

Two skill systems are installed in this repository. On any UI or design task —
new screen, redesign, critique, polish, spacing, colour, motion, empty states —
read the fitting one **before** editing, without being asked each time.

- **`.claude/skills/impeccable/`** — critique, audit and raising the quality of an
  interface. This is the one for *existing* ASCND screens: reviewing what is
  there, finding what is weak, and making it better. It is explicitly scoped to
  product UI and dashboards, which is what this app is.
- **`.agents/skills/`** (Taste Skills) — visual direction. `design-taste-frontend`
  is the general one; there are also `minimalist-ui`, `high-end-visual-design`,
  `redesign-existing-projects`, `brandkit`, `imagegen-frontend-mobile` and others.
  Pick by what the task actually is.

Two cautions, so the skills are used rather than recited:

**`design-taste-frontend` scopes itself out of this app's main surfaces.** Its
first line says *"landing pages, portfolios, and redesigns. Not dashboards, not
data tables, not multi-step product UI"*. Today, Nutrition, Workouts and Progress
are exactly what it excludes. Use `impeccable` for those and take from the Taste
Skills what is about visual language rather than about page kind.

**A skill does not outrank a measurement.** This repository decides UI questions
by measuring them — `tools/*.mjs`, screenshots, numbers written into the comment
beside the code. Where a skill's default and a recorded measurement disagree, the
measurement wins and the reason it wins is already written down next to the code.
The skills are for the questions nobody has measured yet.
