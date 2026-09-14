"use strict";
/**
 * Koa — the design component's `renderVals()`, ported as-is.
 *
 * The export switches every layer on a boolean flag and hands a few
 * transforms/animations down by name. This is that logic, line for line, so
 * `koa-scene.ts` (generated) can stay pure data. Keep it in step with the
 * export: if a new pose or item appears there, it appears here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KOA_POSES = exports.KOA_EXPRESSIONS = exports.KOA_SLOTS = exports.KOA_ITEMS = void 0;
exports.koaFlags = koaFlags;
/** §5 OUTFIT · CỬA HÀNG — seven slots, ten items each, in the export's order */
exports.KOA_ITEMS = {
    head: ['band', 'cap', 'beanie', 'santa', 'antler', 'pumpkin', 'witch', 'khanxep', 'phones', 'lion'],
    face: ['shades', 'goggles', 'mask', 'eyepatch', 'beard', 'tuong', 'vr', 'nosestrip', 'heart', 'dragon'],
    top: ['tank', 'tee', 'hoodie', 'xmas', 'aodai', 'ghost', 'windbreak', 'jersey', 'lion', 'armor'],
    bottom: ['short', 'legging', 'jogger', 'xmaspants', 'tetpants', 'tutu', 'camo', 'swim', 'ghostpants', 'flame'],
    shoes: ['sneaker', 'runner', 'boot', 'xmasboot', 'hai', 'sandal', 'socks', 'glow', 'ghostshoe', 'wing'],
    back: ['backpack', 'hydro', 'angel', 'bat', 'giftbag', 'lixi', 'cape', 'oxygen', 'dragonwing', 'jetpack'],
    hand: ['bottle', 'dumbbell', 'towel', 'rope', 'candy', 'lantern', 'broom', 'redenv', 'trophy', 'sparkler'],
};
exports.KOA_SLOTS = Object.keys(exports.KOA_ITEMS);
/**
 * §3 BIỂU CẢM, in the sheet's order (`strain` is the lifting face), then the
 * ones this app has had to add.
 *
 * ── why anything gets added at all ──
 *
 * The sheet was drawn for a character in a room. The app needs a character that
 * reacts to a day, and there is one moment it had no face for: **a streak that
 * is still alive and has not been fed yet.** `sad` is the streak already
 * broken — mourning something lost. What that evening needs is Koa *asking*,
 * which is a different face and is the one Duolingo rebuilt its whole mascot
 * around: their owl went from two states, happy and crying, to a spectrum
 * precisely so it could encourage somebody who is struggling rather than only
 * congratulate or grieve.
 *
 * ── and it is drawn out of the parts already here ──
 *
 * Not one new path. Every layer below — the sad brow, the wide eye, the flat
 * mouth — is already in the export, each behind its own flag, and `plead` is a
 * combination nobody had asked for yet. That is the cheap way to widen a
 * character's range and the honest one: the face stays unmistakably the same
 * animal, because it is made of the same drawing.
 */
exports.KOA_EXPRESSIONS = [
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
    { key: 'plead', label: 'VAN NÀI' },
];
exports.KOA_POSES = [
    { key: 'idle', label: 'ĐỨNG YÊN' },
    { key: 'turn34', label: 'TURNAROUND 3/4' },
    { key: 'running', label: 'CHẠY BỘ' },
    { key: 'lifting', label: 'TẬP TẠ' },
    { key: 'stretching', label: 'GIÃN CƠ' },
    { key: 'relaxing', label: 'THƯ GIÃN' },
];
const OPEN_EYES = [
    'happy',
    'confident',
    'sad',
    'tired',
    'angry',
    'happytired',
    'strain',
    // asking needs eyes you can see — a plea through shut lids is a nap
    'plead',
];
const HAND_ANCHOR = {
    idle: 'translate(178,236)',
    turn34: 'translate(178,236)',
    running: 'translate(184,232)',
    lifting: 'translate(180,222)',
    stretching: 'translate(188,214)',
    relaxing: 'translate(158,254)',
};
const HAND_ANIM = {
    idle: 'animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box',
    turn34: 'animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box',
    running: 'animation:koaRunArm18 18s linear infinite;transform-origin:160px 178px;transform-box:view-box',
    lifting: 'animation:koaCurlB14 14s ease-in-out infinite;transform-origin:156px 184px;transform-box:view-box;translate:18px -12px',
    stretching: '',
    relaxing: 'animation:koaSitBreath 3.6s ease-in-out infinite;transform-box:view-box',
};
function koaFlags(e, p, worn = {}) {
    const f = {};
    for (const slot of exports.KOA_SLOTS) {
        for (const id of exports.KOA_ITEMS[slot])
            f[`it_${slot}_${id}`] = worn[slot] === id;
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
    /* Wide for both, and the brow is what tells them apart: raised brows over
       wide eyes is alarm, worried brows over the same eyes is a plea. */
    f.eyesWide = e === 'surprised' || e === 'plead';
    f.eyesArc = e === 'grin';
    f.eyesStar = e === 'delighted';
    f.lidsHalf = e === 'confident' || e === 'strain';
    f.lidsWink = e === 'happytired';
    f.blinkGate = e === 'happytired' ? 'animation:koaWinkOff 9s ease-in-out infinite' : '';
    f.lidsHeavy = e === 'tired';
    f.lidsSad = e === 'sad';
    f.browArc = e === 'happy' || e === 'grin' || e === 'delighted' || e === 'happytired';
    f.browRaised = e === 'surprised';
    f.browSad = e === 'sad' || e === 'plead';
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
    /* Shared with `sad`, and that is right: worry and sorrow do have the same
       mouth. What separates them is above it — `sad` droops its lids and is
       already mourning, `plead` holds its eyes wide open and is still asking. */
    f.mouthFrown = e === 'sad' || e === 'plead';
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
