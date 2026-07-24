/**
 * rig-analyzer.js — model-agnostic bone-role detection (Mascot Studio v4.0).
 *
 * Given a skeleton's joints (name + rest world position + parent name) it infers
 * the animation roles (head, shoulders, forearms, hands, hips) from geometry +
 * hierarchy alone — no hardcoded bone names, no dependence on Meshy/Koala. Works
 * for any roughly-humanoid mascot rig (koala, cat, dog, bear, robot…).
 *
 * Verified against the shipping koala rig: head=Bone_029,
 * shoulders=Bone_025/Bone_020, forearms=Bone_024/Bone_019.
 *
 * @param {{name:string, x:number, y:number, z:number, parent:string|null}[]} joints
 * @returns {{ roles: Record<string,string|null>, meta: object }}
 */
export function analyzeRig(joints) {
  if (!joints || joints.length === 0) return { roles: {}, meta: {} };
  const by = Object.fromEntries(joints.map((j) => [j.name, j]));
  const parentOf = (n) => (by[n] ? by[n].parent : null);

  const xs = joints.map((j) => j.x);
  const ys = joints.map((j) => j.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const height = maxY - minY || 1;
  const width = Math.max(...xs) - Math.min(...xs) || 1;
  const cx = median(xs);

  const yf = (n) => (by[n].y - minY) / height; // 0 bottom → 1 top
  const ax = (n) => by[n].x - cx; // signed lateral offset from centre
  const CENTRAL = 0.12 * width;

  // ── arm chain per side (sign = +1 for +X, −1 for −X) ──
  function armFor(sign) {
    const cand = joints
      .map((j) => j.name)
      .filter((n) => ax(n) * sign > 0 && Math.abs(ax(n)) > 0.15 * width && yf(n) > 0.45);
    if (!cand.length) return { shoulder: null, forearm: null, hand: null };
    // hand = most-lateral bone; walk up parents while still lateral & upper-body
    let hand = cand.reduce((a, b) => (Math.abs(ax(b)) > Math.abs(ax(a)) ? b : a));
    const chain = [hand];
    let cur = hand;
    while (
      parentOf(cur) &&
      by[parentOf(cur)] &&
      Math.abs(ax(parentOf(cur))) > 0.1 * width &&
      yf(parentOf(cur)) > 0.45
    ) {
      cur = parentOf(cur);
      chain.push(cur);
    }
    chain.reverse(); // inner → outer
    // drop the clavicle if the innermost link sits near the body centre
    const arm = chain.length >= 2 && Math.abs(ax(chain[0])) < 0.2 * width ? chain.slice(1) : chain;
    return {
      shoulder: arm[0] ?? null,
      forearm: arm[1] ?? arm[0] ?? null,
      hand: arm[arm.length - 1] ?? null,
    };
  }
  const posArm = armFor(+1); // +X side
  const negArm = armFor(-1); // −X side

  const shoulderY =
    posArm.shoulder && negArm.shoulder
      ? (by[posArm.shoulder].y + by[negArm.shoulder].y) / 2
      : minY + 0.7 * height;

  // ── head = lowest central bone above the shoulder line ──
  const central = joints.map((j) => j.name).filter((n) => Math.abs(ax(n)) < CENTRAL);
  const aboveShoulder = central.filter((n) => by[n].y > shoulderY);
  const head = aboveShoulder.length
    ? aboveShoulder.reduce((a, b) => (by[b].y < by[a].y ? b : a))
    : null;
  const neck = head;
  // chest = highest central bone at/below the shoulder line
  const belowNeck = central.filter((n) => by[n].y <= shoulderY);
  const chest = belowNeck.length
    ? belowNeck.reduce((a, b) => (by[b].y > by[a].y ? b : a))
    : null;
  // hip / root = the joint with no bone parent, else the lowest central
  const root = joints.find((j) => !j.parent)?.name ?? null;

  return {
    roles: {
      head,
      neck,
      chest,
      hip: root,
      // NB: side labels follow the rig's own frame; +X may read as screen-right.
      leftShoulder: posArm.shoulder,
      leftForeArm: posArm.forearm,
      leftHand: posArm.hand,
      rightShoulder: negArm.shoulder,
      rightForeArm: negArm.forearm,
      rightHand: negArm.hand,
    },
    meta: { minY, maxY, height, width, cx, shoulderY, jointCount: joints.length },
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
