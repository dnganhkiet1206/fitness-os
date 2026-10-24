// Koa cho web (#527, 23/10): dựng SVG từ CHÍNH cảnh app vẽ — `KoaWardrobeData.swift`
// (cảnh RN + tủ đồ vẽ lại) — với cờ tính như `KoaFlags.flags` + `KoaRender.flags/rankFlags`.
// Không vẽ lại gì: chỉ đọc cây lớp, bật / tắt theo cờ, và đưa hoạt ảnh gốc của bản
// export (`KEYFRAMES`: chớp mắt, thở, tai, tim, hơi nóng…) ra lại thành CSS @keyframes.
//
// Bản phẳng (`flat` của app — màu gốc, không lượt đèn); ánh sáng do trang web lo.
// Không có: cái liếc trong phòng (gaze), tư thế thử đồ — web không dùng.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXPRESSIONS = ['happy', 'surprised', 'grin', 'confident', 'sad', 'tired', 'angry', 'delighted', 'happytired', 'strain', 'plead', 'meditate'];

export function loadScene(repo) {
  const swift = readFileSync(join(repo, 'apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaWardrobeData.swift'), 'utf8');
  return JSON.parse(swift.match(/##"([\s\S]*)"##/)[1]);
}

// ---- Cờ: KoaFlags.flags (chỉ phần web dùng: không đồ mặc) ----
const OPEN_EYES = new Set(['happy', 'confident', 'sad', 'tired', 'angry', 'happytired', 'strain', 'plead']);
const HAND_ANCHOR = { idle: 'translate(178,236)', turn34: 'translate(178,236)', running: 'translate(184,232)', lifting: 'translate(180,222)', stretching: 'translate(188,214)', relaxing: 'translate(158,254)' };
const HAND_ANIM = {
  idle: 'animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box',
  turn34: 'animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box',
  running: 'animation:koaRunArm18 18s linear infinite;transform-origin:160px 178px;transform-box:view-box',
  lifting: 'animation:koaCurlB14 14s ease-in-out infinite;transform-origin:156px 184px;transform-box:view-box;translate:18px -12px',
  stretching: '',
  relaxing: 'animation:koaSitBreath 3.6s ease-in-out infinite;transform-box:view-box',
};
const RANK_BUILD = [0, 0.18, 0.4, 0.6, 0.82, 1];

export function flags(e, p = 'idle', rank = 0, worn = {}) {
  const run = p === 'running', turn = p === 'turn34';
  const f = {
    handTf: HAND_ANCHOR[p], handAnim: HAND_ANIM[p] ?? '',
    packTf: run ? '' : 'translate(-10,30)', strapVis: run ? '' : 'opacity:0',
    shoeAnimL: run ? 'animation:koaRunLegA18 18s linear infinite;transform-origin:104px 252px;transform-box:view-box' : '',
    shoeAnimR: run ? 'animation:koaRunLegB18 18s linear infinite;transform-origin:136px 252px;transform-box:view-box' : '',
    eyesOpen: OPEN_EYES.has(e), eyesWide: e === 'surprised' || e === 'plead', eyesArc: e === 'grin', eyesStar: e === 'delighted',
    lidsHalf: e === 'confident' || e === 'strain', lidsWink: e === 'happytired',
    blinkGate: e === 'happytired' ? 'animation:koaWinkOff 9s ease-in-out infinite' : '',
    lidsHeavy: e === 'tired', lidsSad: e === 'sad',
    browArc: ['happy', 'grin', 'delighted', 'happytired'].includes(e), browRaised: e === 'surprised',
    browSad: e === 'sad' || e === 'plead', browAngry: e === 'angry', browStrain: e === 'strain',
    mouthGrit: e === 'strain', showStrain: e === 'strain', mouthSmile: e === 'happy' || e === 'delighted',
    mouthGrin: e === 'grin' || e === 'happytired', mouthBreath: e === 'happytired',
    grinCycle: e === 'happytired' ? 'animation:koaBreathGrin 18s linear infinite' : '',
    mouthO: e === 'surprised', mouthSmirk: e === 'confident', mouthFrown: e === 'sad' || e === 'plead',
    mouthFlat: e === 'tired' || e === 'meditate', mouthShout: e === 'angry', showSteam: e === 'angry', showHearts: e === 'delighted',
    armsIdle: p === 'idle' || turn, poseRun: run, turnedView: run || turn, torsoStand: !run && !turn, torsoRun: run || turn,
    runBob: run ? 'animation:koaRunBody18 18s linear infinite;transform-origin:120px 290px;transform-box:view-box' : '',
    poseLift: p === 'lifting', poseStretch: p === 'stretching', poseRelax: p === 'relaxing',
    poseTilt: run ? 'rotate(4 120 288) translate(120,0) scale(0.91,1) translate(-120,0)' : turn ? 'translate(120,0) scale(0.93,1) translate(-120,0)' : p === 'stretching' ? 'translate(-8,0) rotate(6 120 288)' : '',
    bellyTurn: run ? 'translate(120,228) scale(0.9,1) translate(-120,-228) translate(13,0)' : turn ? 'translate(120,228) scale(0.92,1) translate(-120,-228) translate(11,0)' : '',
    headTilt: run ? 'rotate(-5 120 170) translate(120,0) scale(0.99,1) translate(-120,0)' : turn ? 'translate(120,0) scale(0.96,1) translate(-120,0)' : '',
    hipTuft: turn, gazeShift: turn ? 'translate(-6,4)' : '', gazeRight: turn ? 'translate(7,0)' : '',
    faceShift: run ? 'translate(18,0)' : turn ? 'translate(16,0)' : '', earShift: run ? 'translate(14,0)' : turn ? 'translate(12,0)' : '',
    earLeftShift: run ? 'translate(-19,0)' : turn ? 'translate(-17,0)' : '',
    armLeftTurn: run ? 'translate(15,0) rotate(6 80 178)' : turn ? 'translate(13,0) rotate(5 80 178)' : '',
    shadowTf: run ? 'translate(120,294) scale(0.92,1) translate(-120,-294)' : turn ? 'translate(120,294) scale(0.93,1) translate(-120,-294) translate(4,0)' : '',
    legsStand: p === 'idle' || p === 'lifting' || p === 'stretching' || turn, legsRun: run, legsSit: p === 'relaxing',
    handFree: p !== 'lifting',
  };
  if (e === 'meditate') f.eyesMeditate = true;
  // Đồ đang mặc: `it_<ô>_<món>` (KoaFlags.items); web chỉ dùng vài món (mũ len của "ngủ đủ").
  for (const [slot, id] of Object.entries(worn)) f[`it_${slot}_${id}`] = true;
  // KoaRender.rankFlags
  const r = Math.max(0, Math.min(rank, 5)), t = RANK_BUILD[r];
  for (let n = 1; n <= 5; n++) f[`rk${n}`] = r >= n;
  for (let n = 0; n <= 5; n++) f[`rkE${n}`] = r === n;
  const g = (v) => String(+v.toPrecision(6));
  const dx = 11 * t, sx = 1 + 0.22 * t, sy = 1 + 0.05 * t;
  const armL = `translate(${g(-dx)},0) translate(70,176) scale(${g(sx)},${g(sy)}) translate(-70,-176)`;
  const armR = `translate(${g(dx)},0) translate(170,176) scale(${g(sx)},${g(sy)}) translate(-170,-176)`;
  const standing = p === 'idle' || turn;
  f.armRankL = r === 0 ? '' : armL;
  f.armRankR = r === 0 ? '' : armR;
  f.handRank = r === 0 || !standing ? '' : armR;
  f.topRank = r === 0 ? '' : `translate(120,0) scale(${g(1 + 0.16 * t)},1) translate(-120,0)`;
  return f;
}
const truthy = (v) => (typeof v === 'string' ? v.length > 0 : !!v);

// ---- Biến đổi ----
const fmt = (v) => String(Math.round(v * 1000) / 1000);
// Một phép của cảnh → CSS (đơn vị px = đơn vị người dùng khi transform-box: view-box).
function opCss(op) {
  const [k, ...v] = op;
  if (k === 'r') return v.length === 3 ? `translate(${fmt(v[1])}px,${fmt(v[2])}px) rotate(${fmt(v[0])}deg) translate(${fmt(-v[1])}px,${fmt(-v[2])}px)` : `rotate(${fmt(v[0])}deg)`;
  if (k === 't') return `translate(${fmt(v[0])}px,${fmt(v[1])}px)`;
  return `scale(${fmt(v[0])},${fmt(v[1])})`;
}
// Một phép → thuộc tính transform của SVG.
function opSvg(op) {
  const [k, ...v] = op;
  if (k === 'r') return v.length === 3 ? `rotate(${v.map(fmt).join(' ')})` : `rotate(${fmt(v[0])})`;
  if (k === 't') return `translate(${fmt(v[0])} ${fmt(v[1])})`;
  return `scale(${fmt(v[0])} ${fmt(v[1])})`;
}
function parseOps(css) {
  const ops = [];
  for (const m of css.matchAll(/(rotate|translate|translateX|translateY|scale|scaleX|scaleY)\(([^)]*)\)/g)) {
    const n = [...m[2].matchAll(/-?\d*\.?\d+/g)].map((x) => +x[0]);
    const name = m[1];
    if (name === 'rotate') ops.push(n.length === 3 ? ['r', n[0], n[1], n[2]] : ['r', n[0]]);
    else if (name === 'translate') ops.push(['t', n[0], n.length > 1 ? n[1] : 0]);
    else if (name === 'translateX') ops.push(['t', n[0], 0]);
    else if (name === 'translateY') ops.push(['t', 0, n[0]]);
    else if (name === 'scale') ops.push(['s', n[0], n.length > 1 ? n[1] : n[0]]);
    else if (name === 'scaleX') ops.push(['s', n[0], 1]);
    else ops.push(['s', 1, n[0]]);
  }
  return ops;
}
function parseAnim(css) {
  const m = css.match(/(\w+)\s+([\d.]+)s\s+([\w-]+)(?:\s+([\d.]+)s)?\s+infinite/);
  if (!m) return null;
  const o = css.match(/transform-origin:\s*([\d.]+)px\s+([\d.]+)px/);
  const tr = css.match(/(?:^|;)\s*translate:\s*(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?/);
  return {
    anim: { k: m[1], dur: Math.round(+m[2] * 1000), delay: m[4] ? Math.round(+m[4] * 1000) : 0, ease: m[3] === 'linear' ? 'lin' : m[3] === 'ease-out' ? 'out' : 'io' },
    origin: o ? [+o[1], +o[2]] : null,
    tr: tr ? [['t', +tr[1], tr[2] ? +tr[2] : 0]] : [],
  };
}
const EASE = { lin: 'linear', out: 'ease-out', io: 'ease-in-out' };

// Dáng nghỉ khi đứng (KoaMath.rest).
const REST = { BODYRIG: [-1, 120, 279], HEADRIG: [2.5, 120, 115], arm_left_upper: [2.2, 80, 178], arm_right_upper: [0.8, 160, 178], leg_left_lower: [1.5, 104, 254], leg_right_lower: [0.5, 136, 254] };

// ---- Koa lớn như app (KoaPoke, 23/10): nét mi khi chớp, tai trong theo tai ngoài ----
// Mi gốc là mảng lông trượt xuống che kín mắt; khi mi gần khép thì hiện nét mi cong.
const BLINKS = new Set(['koaBlink', 'koaBlink2']);
const LASH = ['M67 104 Q82 113 97 104', 'M143 104 Q158 113 173 104'];
const lashOpacity = (lid) => Math.min(1, Math.max(0, (lid - 0.55) / 0.35));
// cubic-bezier(0.42, 0, 0.58, 1) = ease-in-out (KoaMath.ease "io")
function easeIO(t) {
  let s = t;
  for (let i = 0; i < 8; i++) {
    const x = 3 * 0.42 * s * (1 - s) ** 2 + 3 * 0.58 * s * s * (1 - s) + s ** 3 - t;
    const d = 3 * 0.42 * (1 - s) ** 2 + 6 * (0.58 - 0.42) * s * (1 - s) + 3 * (1 - 0.58) * s * s;
    if (Math.abs(d) < 1e-6) break;
    s -= x / d;
  }
  return 3 * s * s * (1 - s) + s ** 3;
}
// scaleY của mi ở phân số t của vòng (rãnh `s 1 v`, ease-in-out từng đoạn như CSS)
function lidAt(track, t) {
  const f = track.tf;
  let i = 0;
  while (i < f.length - 1 && t > f[i + 1].o) i++;
  const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
  const va = a.ops[0]?.[2] ?? 1, vb = (a.to ?? a.ops)[0]?.[2] ?? va;
  const w = b.o - a.o;
  return w > 0 ? va + (vb - va) * easeIO((t - a.o) / w) : va;
}
function lashKeyframes(name, track, dur) {
  const n = Math.round(dur / 10), pts = [];
  for (let i = 0; i <= n; i++) pts.push([i / n, lashOpacity(lidAt(track, i / n))]);
  const keep = pts.filter((p, i) => i === 0 || i === n || p[1] !== pts[i - 1][1] || p[1] !== pts[i + 1][1]);
  return `@keyframes lash-${name}{${keep.map(([t, o]) => `${fmt(t * 100)}%{opacity:${fmt(o)}}`).join('')}}\n`;
}
function lash(anim) {
  const paths = LASH.map((d) => `<path d="${d}" stroke="#20242A" stroke-width="3.4" stroke-linecap="round" fill="none"/>`).join('');
  return `<g class="k-lash" opacity="0" style="animation:lash-${anim.k} ${anim.dur}ms linear ${anim.delay}ms infinite">${paths}</g>`;
}
const EAR_SIDE = { ear_left: 'L', ear_left_inner: 'L', ear_right: 'R', ear_right_inner: 'R' };

/** Mọi @keyframes của cảnh, thành CSS (một lần cho cả trang). */
export function keyframesCss(scene) {
  let css = '';
  for (const k of BLINKS) {
    const n = findAnim(scene.nodes, k);
    if (n && scene.keyframes[k]) css += lashKeyframes(k, scene.keyframes[k], n.anim.dur);
  }
  for (const [name, track] of Object.entries(scene.keyframes)) {
    const stops = new Map();
    for (const f of track.tf ?? []) (stops.get(f.o) ?? stops.set(f.o, []).get(f.o)).push(`transform:${f.ops.length ? f.ops.map(opCss).join(' ') : 'none'}`);
    for (const f of track.op ?? []) (stops.get(f.o) ?? stops.set(f.o, []).get(f.o)).push(`opacity:${fmt(f.v)}`);
    const body = [...stops.entries()].sort((a, b) => a[0] - b[0]).map(([o, d]) => `${fmt(o * 100)}%{${d.join(';')}}`).join('');
    css += `@keyframes ${name}{${body}}\n`;
  }
  return css;
}

/**
 * SVG của Koa. `uid` đặt trước mọi id (nhiều Koa trên cùng trang không đụng gradient / clipPath).
 * Giữ id của các phần (BODYRIG, eye_left…) dưới dạng class `k-<id>` để trang tự điều khiển.
 */
function findAnim(nodes, k) {
  for (const n of nodes) {
    if (n.anim?.k === k) return n;
    const r = findAnim(n.kids ?? [], k);
    if (r) return r;
  }
  return null;
}

export function koaSvg(scene, { expression = 'happy', pose = 'idle', rank = 0, worn = {}, uid = 'k' } = {}) {
  const f = flags(expression, pose, rank, worn);
  const rests = !f.poseRun && !f.poseStretch && !f.poseLift;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const fixRefs = (v) => String(v).replace(/url\(#([^)]+)\)/g, `url(#${uid}-$1)`);

  function render(n) {
    if (n.if && !truthy(f[n.if])) return '';
    const kids = (n.kids ?? []).map(render).join('');
    if (n.t === 'defs') return `<defs>${kids}</defs>`;
    if (n.t === 'clipPath') return `<clipPath id="${uid}-${n.id}">${kids}</clipPath>`;

    const bound = n.animBind ? String(f[n.animBind] ?? '') : '';
    if (/opacity:\s*0/.test(bound)) return '';
    const ba = bound ? parseAnim(bound) : null;
    const anim = n.anim ?? ba?.anim;
    const origin = n.o ?? ba?.origin ?? [0, 0];
    const track = anim ? scene.keyframes[anim.k] : null;
    const drivesTf = !!track?.tf?.length, drivesOp = !!track?.op?.length;
    const own = n.tf ?? (n.bind ? parseOps(String(f[n.bind] ?? '')) : []);
    const base = [...(n.tr ? [['t', n.tr[0], n.tr[1]]] : []), ...(ba?.tr ?? []), ...(drivesTf ? [] : own)];

    // Độ mờ gốc giữ lại làm thuộc tính: trong độ trễ (fill-mode none) nó là giá trị đúng như app
    // (`ownOpacity`); khi hoạt ảnh chạy, rãnh opacity của CSS thắng thuộc tính.
    const attrs = Object.entries(n.a ?? {})
      .map(([k, v]) => `${k}="${esc(k === 'id' ? `${uid}-${v}` : fixRefs(v))}"`)
      .join(' ');
    const cls = n.id ? ` class="k-${n.id}"` : '';
    const isShape = !['g', 'svg'].includes(n.t);
    let el = isShape ? `<${n.t}${cls}${attrs ? ' ' + attrs : ''}>${kids}</${n.t}>` : kids;
    const gAttrs = isShape ? '' : (attrs ? ' ' + attrs : '');

    if (anim) {
      // Hoạt ảnh gốc: rãnh transform THAY transform của lớp (như app); `translate` CSS vẫn còn.
      const style = `animation:${anim.k} ${anim.dur}ms ${EASE[anim.ease]} ${anim.delay}ms infinite;transform-box:view-box;transform-origin:${fmt(origin[0])}px ${fmt(origin[1])}px`;
      // Trong độ trễ app dùng transform của chính lớp (`over`) quanh gốc; khi chạy, rãnh CSS thay nó.
      const over = drivesTf && own.length ? ` transform="${[['t', origin[0], origin[1]], ...own, ['t', -origin[0], -origin[1]]].map(opSvg).join(' ')}"` : '';
      el = `<g${isShape ? '' : cls}${gAttrs}${over} style="${style}">${el}</g>`;
      if (base.length) el = `<g transform="${base.map(opSvg).join(' ')}">${el}</g>`;
    } else if (base.length) {
      const o = origin[0] || origin[1] ? [['t', origin[0], origin[1]], ...base, ['t', -origin[0], -origin[1]]] : base;
      el = `<g${isShape ? '' : cls}${gAttrs} transform="${o.map(opSvg).join(' ')}">${el}</g>`;
    } else if (!isShape && (gAttrs || cls)) {
      el = `<g${cls}${gAttrs}>${el}</g>`;
    }
    if (rests && n.id && REST[n.id]) el = `<g transform="rotate(${REST[n.id].join(' ')})">${el}</g>`;
    if (anim && BLINKS.has(anim.k)) el += lash(anim);
    // Tai: tai trong theo hoạt ảnh gốc của tai ngoài (bản gốc chỉ lắc tai ngoài); mỗi tai
    // một lớp giật lúc rảnh, một lớp nghiêng theo con trỏ (style.css, `.k-ear-*`).
    const side = n.id && EAR_SIDE[n.id];
    if (side) {
      if (n.id.endsWith('_inner')) {
        el = `<g style="animation:koaEar${side} 3600ms ease-in-out infinite;transform-box:view-box;transform-origin:${side === 'L' ? 62 : 178}px 92px">${el}</g>`;
      }
      el = `<g class="k-ear-lean k-ear-lean${side}"><g class="k-ear-twitch k-ear-twitch${side}">${el}</g></g>`;
    }
    return el;
  }

  const tree = scene.nodes.map(render).join('');
  // KoaMath.insetMat: hình 0,93 khung, neo ở chân.
  return `<svg class="koa-svg" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="matrix(0.93 0 0 0.93 8.4 21)">${tree}</g></svg>`;
}
