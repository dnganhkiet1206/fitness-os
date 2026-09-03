/**
 * Thẻ Sinh trắc học: năm chỉ số, năm dấu hiệu khác nhau, và đơn vị đúng.
 *
 * ── ba lỗi cùng một họ, và không cái nào lộ ra trong diff ──
 *
 * 1. `Wind` được dùng cho CẢ VO₂max lẫn nhịp thở. Hai ô cạnh nhau trên cùng một
 *    thẻ, cùng một hình vẽ, và cách duy nhất để phân biệt là đọc dòng chữ bên
 *    dưới. Đúng cái lỗi `tools/glyph-collision.mjs` đã được viết ra để bắt —
 *    nhưng công cụ ấy chỉ soi trang trợ lý, nên lỗi này đi qua nó.
 *
 * 2. SpO₂ dùng `Droplets`. `constants/icon-tint.ts` gán `Droplets` cho NƯỚC,
 *    màu cyan. Nên oxy trong máu và nước uống đeo chung một dấu, ở hai màn cách
 *    nhau một cú chạm.
 *
 * 3. HRV dùng `Activity`. Bảng ấy gán `Activity` cho TẬP LUYỆN. Một chỉ số của
 *    hệ thần kinh tự chủ mang dấu của buổi tập.
 *
 * Cộng thêm hai đơn vị sai: `rpm` là vòng/phút của một động cơ, và `ml/kg/min`
 * viết `l` thường — ở cỡ 11pt, `l` và `1` là cùng ba điểm ảnh.
 *
 * ── vì sao luật nằm ở đây chứ không nới `glyph-collision.mjs` ──
 *
 * Công cụ kia đọc `key: '…', glyph: '…'` của trang trợ lý và có bảng `PAIRED`
 * riêng của trang ấy. Thẻ này có hình dạng khác, tệp khác, và những luật nó cần
 * — hình học của bộ icon, đơn vị khoa học, VO₂max không đứng chung nhóm với các
 * dấu hiệu tức thời — không có nghĩa gì ở trang kia.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** số ca tự kiểm đã chạy — gán trong khối tự kiểm, in ra ở câu kết luận */
let SELF_TESTS = 0;
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/** chú thích bị bóc trước mọi phép soi cấu trúc — một ghi chú nhắc tên
    `Droplets` không phải là một chỗ dùng `Droplets`. Bài học của
    `weight-ruler.mjs`, đã tốn hai lần đỏ oan. */
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

const ICONS = 'src/components/ascnd/biometric-icons.tsx';
const CARD = 'src/components/ascnd/today-widgets-2.tsx';
const SCREEN = 'src/app/biometrics.tsx';

/* ── một bộ phân tích đường SVG, đủ cho các lệnh bộ này dùng ──

   Với đoạn cong Bézier, hộp bao tính cả điểm ĐIỀU KHIỂN. Đó là ước lượng RỘNG
   HƠN hình thật (đường cong luôn nằm trong bao lồi của các điểm điều khiển),
   tức nghiêm hơn chứ không lỏng hơn — đúng chiều an toàn.

   ── vì sao cung `A` được tính đầy đủ chứ không chỉ hai đầu ──

   Bản đầu chỉ lấy điểm cuối của cung, và nó BÁO ĐỎ OAN ngay lần chạy đầu tiên:
   giọt oxy đo ra 14.5 đơn vị trong khi hình thật cao 17.7, vì cả phần phình
   dưới của cung không được đếm. Một cái thước đo thiếu một phần ba chiều cao
   thì con số nó in ra không nói được điều gì cả.

   Nên cung được giải đúng theo phụ lục F.6.5 của SVG: tìm tâm elip, rồi kiểm
   bốn góc cực trị 0/90/180/270° xem có nằm trong cung quét hay không. */
const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

/** Mọi điểm cực trị của một cung elip, cộng hai đầu. */
function arcPoints(x1, y1, rx, ry, rotDeg, fA, fS, x2, y2) {
  const pts = [[x1, y1], [x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return pts;
  const φ = (rotDeg * Math.PI) / 180;
  const cosφ = Math.cos(φ);
  const sinφ = Math.sin(φ);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosφ * dx + sinφ * dy;
  const y1p = -sinφ * dx + cosφ * dy;
  /* Bán kính quá nhỏ để nối hai đầu thì SVG phóng chúng lên — không làm bước
     này thì căn bậc hai bên dưới ra NaN và hộp bao im lặng thành rỗng. */
  const Λ = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (Λ > 1) { const s = Math.sqrt(Λ); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fA !== fS ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosφ * cxp - sinφ * cyp + (x1 + x2) / 2;
  const cy = sinφ * cxp + cosφ * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const s = Math.sign(ux * vy - uy * vx) || 1;
    const c = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return s * Math.acos(Math.min(1, Math.max(-1, c)));
  };
  const θ1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dθ = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fS && dθ > 0) dθ -= 2 * Math.PI;
  if (fS && dθ < 0) dθ += 2 * Math.PI;
  const on = (θ) => {
    /* θ có nằm trong cung đã quét không — thử cả ±2π vì θ1+dθ có thể vượt ±π. */
    for (const k of [-2, -1, 0, 1, 2]) {
      const t = θ + k * 2 * Math.PI;
      const lo = Math.min(θ1, θ1 + dθ);
      const hi = Math.max(θ1, θ1 + dθ);
      if (t >= lo && t <= hi) return true;
    }
    return false;
  };
  for (let i = 0; i < 4; i++) {
    const θ = (i * Math.PI) / 2;
    if (!on(θ)) continue;
    pts.push([
      cx + rx * cosφ * Math.cos(θ) - ry * sinφ * Math.sin(θ),
      cy + rx * sinφ * Math.cos(θ) + ry * cosφ * Math.sin(θ),
    ]);
  }
  return pts;
}

export function bbox(d) {
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const xs = [];
  const ys = [];
  const put = (x, y) => { xs.push(x); ys.push(y); };

  for (const seg of d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? []) {
    const cmd = seg[0];
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const n = (seg.slice(1).match(NUM) ?? []).map(Number);
    const arity = ARITY[up];
    if (arity === undefined) throw new Error(`lệnh SVG chưa hỗ trợ: ${cmd}`);
    if (arity === 0) { cx = sx; cy = sy; continue; }
    if (n.length === 0 || n.length % arity !== 0) {
      throw new Error(`lệnh ${cmd} có ${n.length} số, không chia hết cho ${arity}`);
    }

    for (let i = 0; i < n.length; i += arity) {
      const a = n.slice(i, i + arity);
      /* Trong một lệnh TƯƠNG ĐỐI, mọi toạ độ đều tính từ điểm hiện tại lúc
         BẮT ĐẦU lệnh con ấy — kể cả các điểm điều khiển. */
      const px = (v) => (rel ? cx + v : v);
      const py = (v) => (rel ? cy + v : v);
      let ex;
      let ey;
      if (up === 'H') { ex = px(a[0]); ey = cy; put(ex, ey); }
      else if (up === 'V') { ex = cx; ey = py(a[0]); put(ex, ey); }
      else if (up === 'A') {
        ex = px(a[5]);
        ey = py(a[6]);
        for (const [x, y] of arcPoints(cx, cy, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, ex, ey)) put(x, y);
      }
      else {
        for (let k = 0; k + 1 < a.length; k += 2) put(px(a[k]), py(a[k + 1]));
        ex = px(a[a.length - 2]);
        ey = py(a[a.length - 1]);
      }
      if (up === 'M' && i === 0) { sx = ex; sy = ey; }
      cx = ex;
      cy = ey;
    }
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/* ── luật ──

   Mỗi hàm nhận nguồn và trả về danh sách lỗi, để phần tự kiểm ở cuối chạy được
   chúng trên nguồn mẫu chứ không phải trên tệp thật. */

/** Khung vẽ chung: không hình nào tràn ra, và không hình nào bé hoặc to lệch. */
const ART_MIN = 1.2;
const ART_MAX = 22.8;
/** Cạnh dài nhất của mỗi hình phải nằm trong dải này — "cùng cỡ quang học". */
const SPAN_MIN = 15;
const SPAN_MAX = 20;
/** Và tâm hình phải gần tâm lưới, nếu không chúng không thẳng hàng với nhau. */
const OFF_CENTRE = 1.6;

export function geometry(src) {
  const bad = [];
  const paths = [...strip(src).matchAll(/^const ([A-Z_]+) =\s*\n?\s*'([^']+)';/gm)];
  if (paths.length < 5) {
    bad.push(`chỉ đọc được ${paths.length} đường vẽ — bộ icon phải có ít nhất 5`);
    return bad;
  }

  /* Các hình ghép: một dấu là hợp của nhiều đường, nên hộp bao phải tính trên
     cả nhóm chứ không trên từng mảnh. Đây là danh sách nhóm, và nó được kiểm
     ngược lại thành phần bên dưới. */
  const GLYPHS = {
    heartRest: ['HEART', 'HEART_LINE'],
    hrv: ['HRV'],
    bloodOxygen: ['DROP', 'DROP_RING'],
    breath: ['LOBE', 'LOBE_MIRROR', 'TRACHEA'],
    vo2max: ['LOBE', 'LOBE_MIRROR', 'RISE', 'RISE_HEAD'],
  };
  const byName = Object.fromEntries(paths.map((m) => [m[1], m[2]]));

  for (const [glyph, parts] of Object.entries(GLYPHS)) {
    const boxes = [];
    for (const p of parts) {
      /* Thuỳ phổi thứ hai không phải một đường riêng — nó là chính thuỳ kia lật
         quanh x=12. Lật ở đây đúng như `<G transform>` lật trong component. */
      const src2 = p === 'LOBE_MIRROR' ? byName.LOBE : byName[p];
      if (!src2) { bad.push(`${glyph}: thiếu đường \`${p}\``); continue; }
      let b;
      try { b = bbox(src2); } catch (e) { bad.push(`${p}: ${e.message}`); continue; }
      boxes.push(p === 'LOBE_MIRROR' ? { x0: 24 - b.x1, x1: 24 - b.x0, y0: b.y0, y1: b.y1 } : b);
    }
    if (boxes.length === 0) continue;
    const x0 = Math.min(...boxes.map((b) => b.x0));
    const x1 = Math.max(...boxes.map((b) => b.x1));
    const y0 = Math.min(...boxes.map((b) => b.y0));
    const y1 = Math.max(...boxes.map((b) => b.y1));
    const r2 = (v) => Math.round(v * 10) / 10;

    if (x0 < ART_MIN || y0 < ART_MIN || x1 > ART_MAX || y1 > ART_MAX) {
      bad.push(
        `${glyph}: tràn khung — x ${r2(x0)}…${r2(x1)}, y ${r2(y0)}…${r2(y1)}, ` +
          `phải nằm trong ${ART_MIN}…${ART_MAX} trên lưới 24`,
      );
    }
    const span = Math.max(x1 - x0, y1 - y0);
    if (span < SPAN_MIN || span > SPAN_MAX) {
      bad.push(
        `${glyph}: cạnh dài nhất ${r2(span)} đơn vị, ngoài dải ${SPAN_MIN}…${SPAN_MAX} — ` +
          'một hình to hơn hẳn hình bên cạnh thì bộ không còn là một bộ',
      );
    }
    for (const [axis, c] of [['ngang', (x0 + x1) / 2], ['dọc', (y0 + y1) / 2]]) {
      if (Math.abs(c - 12) > OFF_CENTRE) {
        bad.push(`${glyph}: tâm ${axis} ở ${r2(c)} chứ không phải 12 — hình sẽ không thẳng hàng với các hình khác`);
      }
    }
  }
  return bad;
}

/**
 * Màu: lấy từ token, và không hai dấu nào trùng màu trừ khi ĐƯỢC KHAI BÁO.
 *
 * Cùng một luật `glyph-collision.mjs` áp cho hình, áp cho màu — vì lỗi ở thẻ
 * này là cùng một hình dạng: hai thứ khác nhau đeo chung một dấu hiệu. Cặp
 * được phép ở đây là oxy máu và nhịp thở: một hệ (oxy vào cơ thể), và hai hình
 * đã khác nhau hoàn toàn nên màu không phải thứ phải phân biệt chúng.
 *
 * Học thuyết ở `constants/icon-tint.ts` cũng cấm mượn màu của khái niệm khác
 * ngay trên màn này: cyan là NƯỚC và tím là ĐÊM, mà thẻ Nước và thẻ Giấc ngủ
 * đều nằm cùng một màn cuộn với thẻ này.
 */
const TINT_PAIR = new Set(['bloodOxygen+breath']);

export function tints(src) {
  const bad = [];
  const table = /export const BIO_TINT[^{]*\{([\s\S]*?)\n\};/.exec(strip(src));
  if (!table) return ['không đọc được bảng BIO_TINT'];
  const picks = [...table[1].matchAll(/(\w+): colors\.(\w+),/g)].map((m) => [m[1], m[2]]);
  if (picks.length !== 5) bad.push(`BIO_TINT có ${picks.length} mục, phải có 5`);
  if (/#[0-9a-fA-F]{3,8}/.test(table[1])) bad.push('BIO_TINT có mã màu viết thẳng — phải là token của app');

  const by = new Map();
  for (const [name, tok] of picks) {
    if (!by.has(tok)) by.set(tok, []);
    by.get(tok).push(name);
  }
  for (const [tok, names] of by) {
    if (names.length < 2) continue;
    const key = [...names].sort().join('+');
    if (!TINT_PAIR.has(key)) {
      bad.push(`${names.join(' và ')} dùng chung màu \`${tok}\` mà không khai báo trong TINT_PAIR`);
    } else if (names.length > 2) {
      bad.push(`\`${tok}\` khai là một cặp nhưng có ${names.length} dấu dùng: ${names.join(', ')}`);
    }
  }
  /* Nhịp thở không được mang màu của NƯỚC hay của ĐÊM — hai khái niệm có thẻ
     riêng trên cùng màn Today. */
  const of = Object.fromEntries(picks);
  if (of.breath === 'metricCyan') bad.push('nhịp thở mang cyan — đó là màu NƯỚC, và thẻ Nước ở cùng màn');
  if (of.breath === 'metricPurple') bad.push('nhịp thở mang tím — đó là màu ĐÊM/giấc ngủ, và thẻ Giấc ngủ ở cùng màn');
  if (of.bloodOxygen === 'metricCyan') bad.push('oxy máu mang cyan — màu của nước, trên một hình vốn đã là giọt');
  if (of.vo2max !== 'champagne') bad.push(`VO₂max mang \`${of.vo2max}\` — màu thể lực của app là champagne`);
  if (of.heartRest !== 'readinessRed') bad.push(`nhịp tim nghỉ mang \`${of.heartRest}\` — màu tín hiệu cơ thể là readinessRed`);
  return bad;
}

/** Một nét, một kiểu đầu nét, một kiểu góc, không gradient, không tô đặc. */
export function material(src) {
  const bad = [];
  const s = strip(src);
  const once = (re, what) => {
    const n = (s.match(re) ?? []).length;
    if (n !== 1) bad.push(`${what} được khai ${n} lần — phải đúng một lần cho cả bộ`);
  };
  once(/strokeWidth:/g, 'strokeWidth');
  once(/strokeLinecap:/g, 'strokeLinecap');
  once(/strokeLinejoin:/g, 'strokeLinejoin');
  once(/fill: 'none'/g, "fill: 'none'");
  if (!/strokeLinecap: 'round'/.test(s)) bad.push("đầu nét phải là 'round'");
  if (!/strokeLinejoin: 'round'/.test(s)) bad.push("góc nối phải là 'round'");
  if (/Gradient/.test(s)) bad.push('bộ này không được có gradient — nét rỗng, đứng cạnh một con số');
  /* Mọi `<Path>` phải trải `common`. Một đường tự khai nét riêng là chỗ bộ bắt
     đầu rã ra, và nó vô hình trong diff. */
  for (const m of s.matchAll(/<Path\b([^>]*)>/g)) {
    if (!/\{\.\.\.common\}/.test(m[1])) bad.push(`một <Path> không trải \`common\`: ${m[1].trim().slice(0, 60)}`);
  }
  const boxes = [...s.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]);
  if (boxes.length !== 1 || boxes[0] !== '0 0 24 24') {
    bad.push(`viewBox phải là đúng một "0 0 24 24", đang thấy: ${boxes.join(' | ') || '(không có)'}`);
  }
  return bad;
}

/** Thẻ: năm dấu khác nhau, không dấu nào là lucide, VO₂max không nằm chung lưới. */
export function cardRules(src) {
  const bad = [];
  const s = strip(src);
  const card = /export function BiometricsCard\(\)[\s\S]*?\n\}/.exec(s)?.[0];
  if (!card) return ['không tìm được BiometricsCard'];

  const vitals = /const vitals[\s\S]*?\]\.filter/.exec(card)?.[0];
  if (!vitals) return ['không đọc được mảng `vitals`'];

  /*
    Ghép theo `key`, không đếm số lần xuất hiện.

    ── vì sao, và bản đầu đã sai thế nào ──

    Ô HRV là một biểu thức ba ngôi: `hrv_sdnn_ms != null ? {…SDNN…} : {…RMSSD…}`,
    hai nhánh loại trừ nhau và chỉ MỘT cái được dựng. Đếm chuỗi `glyph:` thấy
    'hrv' hai lần và báo đỏ một thẻ hoàn toàn đúng.

    Lỗi thật có hình dạng khác hẳn: HAI KEY KHÁC NHAU đeo cùng một dấu — đúng
    như `vo2max` và `resp` cùng dùng `Wind`. Nên luật ghép dấu theo key: hai
    dòng cùng key là hai phương án của một ô, hai key cùng dấu mới là lỗi.
  */
  const byKey = new Map();
  for (const m of vitals.matchAll(/key: '(\w+)'[^}]*?glyph: '(\w+)'/g)) {
    if (!byKey.has(m[1])) byKey.set(m[1], new Set());
    byKey.get(m[1]).add(m[2]);
  }
  if (byKey.size < 4) bad.push(`lưới chỉ có ${byKey.size} chỉ số — phải có bốn dấu hiệu tức thời`);
  for (const [key, set] of byKey) {
    if (set.size > 1) bad.push(`ô '${key}' đổi dấu giữa các nhánh: ${[...set].join(', ')}`);
  }
  const owner = new Map();
  for (const [key, set] of byKey) {
    for (const g of set) {
      if (owner.has(g)) {
        bad.push(
          `'${owner.get(g)}' và '${key}' dùng chung dấu '${g}' — cùng một hình cạnh nhau, ` +
            'chỉ khác dòng chữ bên dưới (đúng lỗi `Wind` dùng cho cả VO₂max lẫn nhịp thở)',
        );
      }
      owner.set(g, key);
    }
  }
  if (/vo2max/i.test(vitals)) {
    bad.push('VO₂max nằm trong lưới dấu hiệu tức thời — nó là năng lực, không phải số đo của một khoảnh khắc');
  }
  if (!/name="vo2max"/.test(card)) bad.push('không còn chỗ nào vẽ dấu VO₂max');

  /* Không icon lucide nào được quay lại thẻ này. Ba trong số chúng là dấu của
     khái niệm KHÁC trong `icon-tint.ts` (nước, tập luyện), nên đây không phải
     chuyện khẩu vị. */
  for (const n of ['Heart', 'Activity', 'Droplets', 'Droplet', 'Wind', 'HeartPulse', 'Gauge']) {
    if (new RegExp(`icon: ${n}\\b`).test(card)) {
      bad.push(`thẻ dùng lại icon lucide \`${n}\` — bộ dấu sinh trắc là \`BioGlyph\``);
    }
  }
  return bad;
}

/**
 * Giờ hiện ra phải là giờ của MÁY, không phải giờ UTC.
 *
 * ── lỗi ──
 *
 * Danh sách "Các lần đo" in `date_time.replace('T', ' ').slice(0, 16)`.
 * `date_time` là `timestamptz` và PostgREST trả nó về ở UTC, nên cắt chuỗi ra
 * là in giờ UTC: ở Hà Nội một lần đo lúc 07:19 hiện thành 00:19, và mọi lần đo
 * trước 7 giờ sáng còn nằm sai cả NGÀY.
 *
 * Luật cấm cắt chuỗi thời gian và đòi đi qua `local-date.ts` — nơi phép đổi
 * múi giờ nằm một chỗ và giờ mùa hè do bảng tz của hệ điều hành lo.
 */
export function timestamps(sources) {
  const bad = [];
  for (const [where, src] of [['màn Sinh trắc học', sources.screen], ['thẻ Today', sources.card]]) {
    const s = strip(src);
    for (const m of s.matchAll(/date_time[^\n;]*\.slice\(/g)) {
      bad.push(`${where}: cắt chuỗi \`date_time\` (${m[0].trim()}) — chuỗi ấy là UTC, không phải giờ máy`);
    }
    if (/date_time[^\n;]*\.replace\(\s*'T'/.test(s)) {
      bad.push(`${where}: thay 'T' trong \`date_time\` rồi in thẳng — đó là giờ UTC`);
    }
  }
  if (!/localStampStr\(s\.date_time\)/.test(strip(sources.screen))) {
    bad.push('màn Sinh trắc học: danh sách lần đo không còn đi qua `localStampStr`');
  }
  /* Và giờ chỉ được đứng cạnh nguồn khi CÓ nguồn: "Chưa kết nối · 22:17" đọc
     ra là việc mất kết nối xảy ra lúc 22:17. */
  if (!/const sampledAt = connectedSource \? localTimeStr\(/.test(strip(sources.card))) {
    bad.push('thẻ Today: giờ lấy mẫu không còn gác sau `connectedSource` — nó sẽ dính vào nhãn "Chưa kết nối"');
  }
  return bad;
}

/** Đơn vị: khoa học, và giống nhau ở mọi chỗ in ra cùng một đại lượng. */
export function units(sources) {
  const bad = [];
  const { card, screen, plausible, i18n } = sources;
  const region = /export function BiometricsCard\(\)[\s\S]*?\n\}/.exec(strip(card))?.[0] ?? '';

  for (const [where, src] of [['thẻ Today', region], ['màn Sinh trắc học', strip(screen)]]) {
    if (/'rpm'/.test(src)) bad.push(`${where}: còn in \`rpm\` — đó là vòng/phút của động cơ`);
    if (/'ml\/kg/.test(src)) bad.push(`${where}: còn in \`ml/kg…\` — chữ L phải viết hoa (mL)`);
    if (!/mL\/kg\/min/.test(src)) bad.push(`${where}: không thấy đơn vị \`mL/kg/min\` của VO₂max`);
  }
  const pv = /vo2max_mlkgmin: \{[^}]*unit: '([^']+)'/.exec(plausible)?.[1];
  if (pv !== 'mL/kg/min') {
    bad.push(`plausible.ts: VO₂max mang đơn vị '${pv}' — câu báo ngoài khoảng in thẳng chuỗi này ra cho người dùng`);
  }
  for (const m of i18n.matchAll(/biometricsBreathUnit: '([^']+)'/g)) {
    if (/rpm/i.test(m[1])) bad.push(`i18n: biometricsBreathUnit = '${m[1]}'`);
  }
  if ((i18n.match(/biometricsBreathUnit: '/g) ?? []).length !== 2) {
    bad.push('biometricsBreathUnit thiếu một trong hai ngôn ngữ');
  }
  return bad;
}

/*
  Tự kiểm chạy trên nguồn MẪU, không phải trên tệp thật.

  `glyph-collision.mjs` đã trả giá cho bài học này: bản đầu của nó dựng lại lỗi
  bằng cách sửa nguồn thật, nên khi nguồn thật đã hỏng sẵn thì phép dựng lại
  không tìm thấy gì để sửa và công cụ báo sai chỗ.
*/
{
  const cases = [];
  const push = (label, fn, shouldFail) => cases.push([label, fn, shouldFail]);

  /* hình học: bộ phân tích phải đọc đúng cả lệnh tương đối lẫn tuyệt đối */
  const b1 = bbox('M2 2h20v20');
  if (b1.x0 !== 2 || b1.x1 !== 22 || b1.y0 !== 2 || b1.y1 !== 22) {
    console.log(`tự kiểm hỏng — bbox tương đối sai: ${JSON.stringify(b1)}`);
    process.exit(2);
  }
  const b2 = bbox('M12 4C4 4 4 20 12 20');
  if (b2.x0 !== 4 || b2.x1 !== 12 || b2.y1 !== 20) {
    console.log(`tự kiểm hỏng — bbox tuyệt đối sai: ${JSON.stringify(b2)}`);
    process.exit(2);
  }
  /* Cung: một đường tròn tâm (12,12) bán kính 6 phải ra hộp 6…18 ở cả hai
     chiều. Đây đúng là ca bản đầu đo hụt — nó ra 6…12 và báo đỏ oan. */
  const b3 = bbox('M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z');
  const near = (v, w) => Math.abs(v - w) < 0.01;
  if (!near(b3.x0, 6) || !near(b3.x1, 18) || !near(b3.y0, 6) || !near(b3.y1, 18)) {
    console.log(`tự kiểm hỏng — bbox cung sai: ${JSON.stringify(b3)}`);
    process.exit(2);
  }
  /* Và một nửa cung phải KHÔNG kéo hộp sang phần nó không quét qua. */
  const b4 = bbox('M6 12a6 6 0 0 1 12 0');
  if (!near(b4.y0, 6) || !near(b4.y1, 12)) {
    console.log(`tự kiểm hỏng — nửa cung trên bị tính cả nửa dưới: ${JSON.stringify(b4)}`);
    process.exit(2);
  }

  const goodIcons = [
    "const HEART = 'M3 4L21 4L21 20L3 20Z';",
    "const HEART_LINE = 'M5 12h14';",
    "const HRV = 'M3 8L21 8L21 16L3 16';",
    "const DROP = 'M12 3L20 12L12 21L4 12Z';",
    "const DROP_RING = 'M12 10L14 12L12 14L10 12Z';",
    "const LOBE = 'M11 5L11 20L3 20L3 5Z';",
    "const TRACHEA = 'M12 4V11';",
    "const RISE = 'M12 4V11';",
    "const RISE_HEAD = 'M10 6L12 4L14 6';",
  ].join('\n');
  push('bộ hình đúng khung thì im', () => geometry(goodIcons), false);
  push('một hình tràn khung bị bắt', () => geometry(goodIcons.replace("'M3 8L21 8L21 16L3 16'", "'M3 8L26 8L26 16L3 16'")), true);
  push('một hình bé lệch hẳn bị bắt', () => geometry(goodIcons.replace("'M12 3L20 12L12 21L4 12Z'", "'M11 11L13 11L13 13L11 13Z'")), true);
  push('một hình lệch tâm bị bắt', () => geometry(goodIcons.replace("'M3 4L21 4L21 20L3 20Z'", "'M3 2L21 2L21 9L3 9Z'")), true);

  const goodMat = `
    const common = { stroke, strokeWidth: STROKE, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
    <Svg viewBox="0 0 24 24"><Path d={A} {...common} /><Path d={B} {...common} /></Svg>
  `;
  push('vật liệu đúng thì im', () => material(goodMat), false);
  push('một Path tự khai nét bị bắt', () => material(goodMat.replace('<Path d={B} {...common} />', '<Path d={B} strokeWidth={3} />')), true);
  push('gradient quay lại bị bắt', () => material(`${goodMat}\n<LinearGradient/>`), true);
  push('đầu nét vuông bị bắt', () => material(goodMat.replace("strokeLinecap: 'round'", "strokeLinecap: 'butt'")), true);

  const goodCard = [
    'export function BiometricsCard() {',
    "  const vitals = [",
    "    { key: 'hr', glyph: 'heartRest' as const },",
    "    { key: 'hrv', glyph: 'hrv' as const },",
    "    { key: 'spo2', glyph: 'bloodOxygen' as const },",
    "    { key: 'resp', glyph: 'breath' as const },",
    '  ].filter((m) => m.value != null);',
    '  return <BioGlyph name="vo2max" />;',
    '}',
  ].join('\n');
  /* Ô HRV thật là một biểu thức ba ngôi. Nó PHẢI đi qua im lặng — bản đầu của
     luật này đếm chuỗi và báo đỏ đúng chỗ này trên một thẻ hoàn toàn đúng. */
  const ternaryCard = goodCard.replace(
    "    { key: 'hrv', glyph: 'hrv' as const },",
    [
      '    a != null',
      "      ? { key: 'hrv', label: 'HRV · SDNN', glyph: 'hrv' as const }",
      "      : { key: 'hrv', label: 'HRV', glyph: 'hrv' as const },",
    ].join('\n'),
  );

  push('thẻ đúng thì im', () => cardRules(goodCard), false);
  push('ô HRV hai nhánh vẫn im', () => cardRules(ternaryCard), false);
  push('hai key cùng một dấu bị bắt', () => cardRules(goodCard.replace("glyph: 'breath'", "glyph: 'hrv'")), true);
  push('VO₂max lọt vào lưới bị bắt', () => cardRules(goodCard.replace("glyph: 'breath'", "glyph: 'vo2max'")), true);
  push('icon lucide quay lại bị bắt', () => cardRules(goodCard.replace("glyph: 'hrv' as const", 'icon: Activity')), true);
  push('mất dấu VO₂max bị bắt', () => cardRules(goodCard.replace('name="vo2max"', 'name="hrv"')), true);

  const goodTints = [
    'export const BIO_TINT: Record<BioGlyphName, string> = {',
    '  heartRest: colors.readinessRed,',
    '  hrv: colors.metricPurple,',
    '  bloodOxygen: colors.metricBlue,',
    '  breath: colors.metricBlue,',
    '  vo2max: colors.champagne,',
    '};',
  ].join('\n');
  push('bảng màu đúng thì im', () => tints(goodTints), false);
  push('trùng màu không khai báo bị bắt', () => tints(goodTints.replace('hrv: colors.metricPurple', 'hrv: colors.champagne')), true);
  push('nhịp thở mang cyan (màu nước) bị bắt', () => tints(goodTints.replace('breath: colors.metricBlue', 'breath: colors.metricCyan')), true);
  push('nhịp thở mang tím (màu đêm) bị bắt', () => tints(goodTints.replace('breath: colors.metricBlue', 'breath: colors.metricPurple')), true);
  push('VO₂max rời màu thể lực bị bắt', () => tints(goodTints.replace('vo2max: colors.champagne', 'vo2max: colors.metricOrange')), true);
  push('mã màu viết thẳng bị bắt', () => tints(goodTints.replace('colors.metricPurple', "'#b45cff'")), true);

  const goodStamps = {
    screen: "<Text>{localStampStr(s.date_time) ?? '—'}</Text>",
    card: 'const sampledAt = connectedSource ? localTimeStr(bio.date_time) : null;',
  };
  push('giờ đi qua local-date thì im', () => timestamps(goodStamps), false);
  push('cắt chuỗi date_time bị bắt', () => timestamps({ ...goodStamps, screen: `${goodStamps.screen}\nconst t = s.date_time.slice(0, 16);` }), true);
  push("thay 'T' rồi in bị bắt", () => timestamps({ ...goodStamps, screen: `${goodStamps.screen}\nconst t = s.date_time.replace('T', ' ');` }), true);
  push('giờ không gác theo kết nối bị bắt', () => timestamps({ ...goodStamps, card: 'const sampledAt = localTimeStr(bio.date_time);' }), true);

  const goodUnits = {
    card: "export function BiometricsCard() {\n const u = 'mL/kg/min'; const v = i18n.biometricsBreathUnit;\n}",
    screen: "const m = [{ unit: 'mL/kg/min' }, { unit: i18n.biometricsBreathUnit }];",
    plausible: "vo2max_mlkgmin: { min: 10, max: 100, unit: 'mL/kg/min' },",
    i18n: "biometricsBreathUnit: 'nhịp/phút',\nbiometricsBreathUnit: 'breaths/min',",
  };
  push('đơn vị đúng thì im', () => units(goodUnits), false);
  push('rpm quay lại bị bắt', () => units({ ...goodUnits, card: `${goodUnits.card.slice(0, -1)} const w = 'rpm'; }` }), true);
  push('ml thường bị bắt', () => units({ ...goodUnits, screen: goodUnits.screen.replace('mL/kg', 'ml/kg') }), true);
  push('plausible lệch đơn vị bị bắt', () => units({ ...goodUnits, plausible: goodUnits.plausible.replace('mL', 'ml') }), true);
  push('thiếu một ngôn ngữ bị bắt', () => units({ ...goodUnits, i18n: "biometricsBreathUnit: 'nhịp/phút'," }), true);

  const wrong = cases.filter(([, fn, shouldFail]) => (fn().length > 0) !== shouldFail);
  if (wrong.length) {
    console.log(`tự kiểm hỏng — sai ở: ${wrong.map(([l]) => l).join(', ')}, đừng tin kết quả`);
    process.exit(2);
  }
  /* Đếm ra từ chính mảng, không gõ tay: một con số trong câu kết luận mà không
     dẫn từ thứ nó mô tả thì sớm muộn cũng thành một lời khai sai. */
  SELF_TESTS = cases.length + 4;
}

const iconsSrc = read(ICONS);
const problems = [
  ...geometry(iconsSrc),
  ...material(iconsSrc),
  ...tints(iconsSrc),
  ...cardRules(read(CARD)),
  ...units({ card: read(CARD), screen: read(SCREEN), plausible: read('src/lib/plausible.ts'), i18n: read('src/lib/i18n.ts') }),
  ...timestamps({ card: read(CARD), screen: read(SCREEN) }),
];

if (problems.length) {
  console.log('dấu sinh trắc CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'dấu sinh trắc OK — năm hình vẽ tay trên cùng lưới 24, một nét, đầu và góc bo, không gradient; ' +
    `mỗi hình nằm trong khung ${ART_MIN}…${ART_MAX}, cạnh dài ${SPAN_MIN}…${SPAN_MAX}, tâm lệch dưới ${OFF_CENTRE}; ` +
    'bốn dấu hiệu tức thời mang bốn dấu khác nhau và không cái nào là icon lucide của khái niệm khác; ' +
    'màu lấy từ token, không hai dấu nào trùng màu ngoài cặp oxy máu + nhịp thở đã khai báo, và nhịp thở không mượn cyan của nước hay tím của đêm; ' +
    'VO₂max đứng ngoài lưới ấy; đơn vị mL/kg/min và nhịp/phút giống nhau ở thẻ, ở màn chi tiết và ở câu báo ngoài khoảng; ' +
    'giờ lấy mẫu đi qua local-date.ts (giờ máy, không phải UTC) và chỉ đứng cạnh nguồn khi có nguồn; ' +
    `${SELF_TESTS} ca tự kiểm chạy trên nguồn mẫu`,
);
