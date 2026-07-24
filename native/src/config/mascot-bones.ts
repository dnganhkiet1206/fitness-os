/**
 * MASCOT BONE MAP — canonical (MASCOT RIG & FACIAL SYSTEM SPEC v2.0).
 *
 * Single source of truth for the UniRig skeleton of assets/mascots/koa.glb
 * (38-bone auto-rig, no facial rig). NEVER hardcode bone names anywhere else —
 * all animation reads from here. Side labels follow the rig's own convention;
 * geometrically `leftShoulder` (Bone_025) sits on +X (screen-right) and
 * `rightShoulder` (Bone_020) on −X. The animator abducts each arm AWAY from the
 * body based on that physical side, so the labels don't affect the motion.
 */
export const BONES = {
  head: 'Bone_029', // neck base — rigid head rotation (no face warp)
  neck: 'Bone_028',
  chest: 'Bone_026',
  leftShoulder: 'Bone_025', // +X arm
  leftForeArm: 'Bone_024',
  rightShoulder: 'Bone_020', // −X arm
  rightForeArm: 'Bone_019',
} as const;

export type BoneKey = keyof typeof BONES;

/** Required bones the animator needs — validated on load (warn, never crash). */
export const REQUIRED_BONES: BoneKey[] = [
  'head',
  'leftShoulder',
  'leftForeArm',
  'rightShoulder',
  'rightForeArm',
];
