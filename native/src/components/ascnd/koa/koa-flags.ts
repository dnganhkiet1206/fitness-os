/**
 * Koa — the design component's `renderVals()`, ported as-is.
 *
 * The export switches every layer on a boolean flag and hands a few
 * transforms/animations down by name. This is that logic, line for line, so
 * `koa-scene.ts` (generated) can stay pure data. Keep it in step with the
 * export: if a new pose or item appears there, it appears here.
 */

export type KoaExpression =
  | 'happy'
  | 'surprised'
  | 'grin'
  | 'confident'
  | 'sad'
  | 'tired'
  | 'angry'
  | 'delighted'
  | 'happytired'
  | 'strain';

export type KoaPose = 'idle' | 'turn34' | 'running' | 'lifting' | 'stretching' | 'relaxing';

export type KoaSlot = 'head' | 'face' | 'top' | 'bottom' | 'shoes' | 'back' | 'hand';

/** §5 OUTFIT · CỬA HÀNG — seven slots, ten items each, in the export's order */
export const KOA_ITEMS: Record<KoaSlot, string[]> = {
  head: ['band', 'cap', 'beanie', 'santa', 'antler', 'pumpkin', 'witch', 'khanxep', 'phones', 'lion'],
  face: ['shades', 'goggles', 'mask', 'eyepatch', 'beard', 'tuong', 'vr', 'nosestrip', 'heart', 'dragon'],
  top: ['tank', 'tee', 'hoodie', 'xmas', 'aodai', 'ghost', 'windbreak', 'jersey', 'lion', 'armor'],
  bottom: ['short', 'legging', 'jogger', 'xmaspants', 'tetpants', 'tutu', 'camo', 'swim', 'ghostpants', 'flame'],
  shoes: ['sneaker', 'runner', 'boot', 'xmasboot', 'hai', 'sandal', 'socks', 'glow', 'ghostshoe', 'wing'],
  back: ['backpack', 'hydro', 'angel', 'bat', 'giftbag', 'lixi', 'cape', 'oxygen', 'dragonwing', 'jetpack'],
  hand: ['bottle', 'dumbbell', 'towel', 'rope', 'candy', 'lantern', 'broom', 'redenv', 'trophy', 'sparkler'],
};

export const KOA_SLOTS = Object.keys(KOA_ITEMS) as KoaSlot[];

/** §3 BIỂU CẢM, in the sheet's order (`strain` is the lifting face) */
export const KOA_EXPRESSIONS: { key: KoaExpression; label: string }[] = [
  { key: 'happy', label: 'VUI VẺ' },
  { key: 'surprised', label: 'NGẠC NHIÊN' },
  { key: 'grin', label: 'CƯỜI TÍT MẮT' },
  { key: 'confident', label: 'TỰ TIN' },
  { key: 'sad', label: 'BUỒN' },
  { key: 'tired', label: 'MỆT MỎI' },
  { key: 'angry', label: 'TỨC GIẬN' },
  { key: 'delighted', label: 'THÍCH THÚ' },
  { key: 'happytired', label: 'VUI MÀ MỆT' },
  { key: 'strain', label: 'GỒNG SỨC' },
];

export const KOA_POSES: { key: KoaPose; label: string }[] = [
  { key: 'idle', label: 'ĐỨNG YÊN' },
  { key: 'turn34', label: 'TURNAROUND 3/4' },
  { key: 'running', label: 'CHẠY BỘ' },
  { key: 'lifting', label: 'TẬP TẠ' },
  { key: 'stretching', label: 'GIÃN CƠ' },
  { key: 'relaxing', label: 'THƯ GIÃN' },
];

export type Worn = Partial<Record<KoaSlot, string>>;

/** flags are booleans; bindings are transform / animation strings by name */
export type Flags = Record<string, boolean | string>;

const OPEN_EYES: KoaExpression[] = [
  'happy',
  'confident',
  'sad',
  'tired',
  'angry',
  'happytired',
  'strain',
];

const HAND_ANCHOR: Record<KoaPose, string> = {
  idle: 'translate(178,236)',
  turn34: 'translate(178,236)',
  running: 'translate(184,232)',
  lifting: 'translate(180,222)',
  stretching: 'translate(188,214)',
  relaxing: 'translate(158,254)',
};

const HAND_ANIM: Record<KoaPose, string> = {
  idle: 'animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box',
  turn34: 'animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box',
  running: 'animation:koaRunArm18 18s linear infinite;transform-origin:160px 178px;transform-box:view-box',
  lifting:
    'animation:koaCurlB14 14s ease-in-out infinite;transform-origin:156px 184px;transform-box:view-box;translate:18px -12px',
  stretching: '',
  relaxing: 'animation:koaSitBreath 3.6s ease-in-out infinite;transform-box:view-box',
};

export function koaFlags(e: KoaExpression, p: KoaPose, worn: Worn = {}): Flags {
  const f: Flags = {};

  for (const slot of KOA_SLOTS) {
    for (const id of KOA_ITEMS[slot]) f[`it_${slot}_${id}`] = worn[slot] === id;
  }

  f.handTf = HAND_ANCHOR[p] ?? HAND_ANCHOR.idle;
  f.handAnim = HAND_ANIM[p] ?? '';
  f.packTf = p === 'running' ? '' : 'translate(-10,30)';
  f.strapVis = p === 'running' ? '' : 'opacity:0';
  f.shoeAnimL =
    p === 'running'
      ? 'animation:koaRunLegA18 18s linear infinite;transform-origin:104px 252px;transform-box:view-box'
      : '';
  f.shoeAnimR =
    p === 'running'
      ? 'animation:koaRunLegB18 18s linear infinite;transform-origin:136px 252px;transform-box:view-box'
      : '';

  f.eyesOpen = OPEN_EYES.includes(e);
  f.eyesWide = e === 'surprised';
  f.eyesArc = e === 'grin';
  f.eyesStar = e === 'delighted';
  f.lidsHalf = e === 'confident' || e === 'strain';
  f.lidsWink = e === 'happytired';
  f.blinkGate = e === 'happytired' ? 'animation:koaWinkOff 9s ease-in-out infinite' : '';
  f.lidsHeavy = e === 'tired';
  f.lidsSad = e === 'sad';
  f.browArc = e === 'happy' || e === 'grin' || e === 'delighted' || e === 'happytired';
  f.browRaised = e === 'surprised';
  f.browSad = e === 'sad';
  f.browAngry = e === 'angry';
  f.browStrain = e === 'strain';
  f.mouthGrit = e === 'strain';
  f.showStrain = e === 'strain';
  f.mouthSmile = e === 'happy' || e === 'delighted';
  f.mouthGrin = e === 'grin' || e === 'happytired';
  f.mouthBreath = e === 'happytired';
  f.grinCycle = e === 'happytired' ? 'animation:koaBreathGrin 18s linear infinite' : '';
  f.mouthO = e === 'surprised';
  f.mouthSmirk = e === 'confident';
  f.mouthFrown = e === 'sad';
  f.mouthFlat = e === 'tired';
  f.mouthShout = e === 'angry';
  f.showSteam = e === 'angry';
  f.showHearts = e === 'delighted';

  f.armsIdle = p === 'idle' || p === 'turn34';
  f.poseRun = p === 'running';
  f.turnedView = p === 'running' || p === 'turn34';
  f.torsoStand = p !== 'running' && p !== 'turn34';
  f.torsoRun = p === 'running' || p === 'turn34';
  f.runBob =
    p === 'running'
      ? 'animation:koaRunBody18 18s linear infinite;transform-origin:120px 290px;transform-box:view-box'
      : '';
  f.poseLift = p === 'lifting';
  f.poseStretch = p === 'stretching';
  f.poseRelax = p === 'relaxing';
  f.poseTilt =
    p === 'running'
      ? 'rotate(4 120 288) translate(120,0) scale(0.91,1) translate(-120,0)'
      : p === 'turn34'
        ? 'translate(120,0) scale(0.93,1) translate(-120,0)'
        : p === 'stretching'
          ? 'translate(-8,0) rotate(6 120 288)'
          : '';
  f.bellyTurn =
    p === 'running'
      ? 'translate(120,228) scale(0.9,1) translate(-120,-228) translate(13,0)'
      : p === 'turn34'
        ? 'translate(120,228) scale(0.92,1) translate(-120,-228) translate(11,0)'
        : '';
  f.headTilt =
    p === 'running'
      ? 'rotate(-5 120 170) translate(120,0) scale(0.99,1) translate(-120,0)'
      : p === 'turn34'
        ? 'translate(120,0) scale(0.96,1) translate(-120,0)'
        : '';
  f.hipTuft = p === 'turn34';
  f.gazeShift = p === 'turn34' ? 'translate(-6,4)' : '';
  f.gazeRight = p === 'turn34' ? 'translate(7,0)' : '';
  f.faceShift = p === 'running' ? 'translate(18,0)' : p === 'turn34' ? 'translate(16,0)' : '';
  f.earShift = p === 'running' ? 'translate(14,0)' : p === 'turn34' ? 'translate(12,0)' : '';
  f.earLeftShift = p === 'running' ? 'translate(-19,0)' : p === 'turn34' ? 'translate(-17,0)' : '';
  f.armLeftTurn =
    p === 'running'
      ? 'translate(15,0) rotate(6 80 178)'
      : p === 'turn34'
        ? 'translate(13,0) rotate(5 80 178)'
        : '';
  f.shadowTf =
    p === 'running'
      ? 'translate(120,294) scale(0.92,1) translate(-120,-294)'
      : p === 'turn34'
        ? 'translate(120,294) scale(0.93,1) translate(-120,-294) translate(4,0)'
        : '';
  f.legsStand = p === 'idle' || p === 'lifting' || p === 'stretching' || p === 'turn34';
  f.legsRun = p === 'running';
  f.legsSit = p === 'relaxing';

  return f;
}
