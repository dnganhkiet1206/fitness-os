/**
 * MASCOT POSE LIBRARY (KOA MOTION POLISH v1.2 — Priority 1).
 *
 * Animation no longer rotates bones ad-hoc per emotion. Each named pose is DATA
 * (target angles for the controllable DOF); the animator only blends between
 * poses and layers breathing / weight-shift / asymmetry on top. Angles are
 * radians. `armR` is the +X-side arm abduction magnitude, `armL` the −X side
 * (the animator applies the sign); poses are intentionally left/right
 * asymmetric so nothing looks like a T-pose.
 */
export interface KoaPose {
  hx: number; // head nod (+ down)
  hy: number; // head yaw magnitude (+ toward +X; animator may flip per glance)
  hz: number; // head tilt (roll)
  armR: number; // +X arm abduction (out to the side)
  armL: number; // −X arm abduction
  armFwd: number; // both arms forward/back
  foreR: number; // right forearm curl
  foreL: number; // left forearm curl
  lean: number; // whole-body forward lean
}

const OUT = 0.42; // rest abduction (arm↔body clearance)
const FWD = -0.3; // rest forward swing (hands in front of hips)

export const POSES: Record<string, KoaPose> = {
  // ── idle states ──
  nothing: { hx: 0.02, hy: 0, hz: 0.045, armR: OUT, armL: OUT * 0.95, armFwd: FWD, foreR: -0.12, foreL: -0.09, lean: 0 },
  relax: { hx: 0.03, hy: 0, hz: 0.05, armR: OUT, armL: OUT * 0.95, armFwd: FWD, foreR: -0.12, foreL: -0.09, lean: 0 },
  curious: { hx: -0.01, hy: 0.2, hz: 0.14, armR: OUT, armL: OUT * 0.95, armFwd: FWD, foreR: -0.12, foreL: -0.08, lean: 0.03 },
  waiting: { hx: -0.03, hy: -0.1, hz: 0.03, armR: OUT, armL: OUT * 0.96, armFwd: FWD, foreR: -0.1, foreL: -0.09, lean: 0 },
  stretch: { hx: -0.12, hy: 0, hz: 0.02, armR: OUT + 0.5, armL: OUT + 0.44, armFwd: FWD - 0.2, foreR: -0.05, foreL: -0.06, lean: -0.03 },
  // ── emotion poses ──
  celebrate: { hx: -0.1, hy: 0, hz: 0, armR: 1.67, armL: 1.6, armFwd: -0.15, foreR: -0.1, foreL: -0.12, lean: 0 },
  wave: { hx: -0.04, hy: 0, hz: 0.1, armR: 1.5, armL: OUT, armFwd: FWD, foreR: -0.1, foreL: -0.09, lean: 0 },
  workout: { hx: 0, hy: 0, hz: 0, armR: 1.45, armL: 1.4, armFwd: 0, foreR: -1.0, foreL: -1.0, lean: 0 },
  sleep: { hx: 0.5, hy: 0, hz: 0.14, armR: OUT, armL: OUT * 0.95, armFwd: FWD, foreR: -0.1, foreL: -0.09, lean: 0.16 },
  tired: { hx: 0.3, hy: 0, hz: 0.04, armR: OUT, armL: OUT * 0.95, armFwd: FWD, foreR: -0.1, foreL: -0.09, lean: 0.06 },
};

export type PoseKey = keyof typeof POSES;
