// Koa chạy bộ cho web (23/10, Kiệt: "vẽ lại phần koa chạy bộ, không cần theo app").
// Đầu, mặt, tai: NGUYÊN cây HEADRIG của cảnh app (koaSvg), không vẽ lại. Thân, tay, chân, giày:
// vẽ mới theo dáng chạy nhìn chính diện — gối nâng, tay co ở khuỷu đánh ngược chân — và một
// nhịp chạy CSS (style.css, "Koa chạy bộ"). Màu lấy đúng bảng màu lông của cảnh.
import { koaSvg } from './koa-svg.mjs';

const FUR = '#BFC7CF', SHADE = '#A9B2BC', LIGHT = '#D7DDE3';
const SHOE = '#F4F6F8', SOLE = '#5B6573', RED = '#E5484D';

// Chỉ giữ nhánh đầu (POSERIG > … > headTilt > HEADRIG) của cảnh.
function headOnly(scene) {
  const s = JSON.parse(JSON.stringify(scene));
  const rig = s.nodes.find((n) => n.id === 'POSERIG');
  const inner = rig.kids[0];
  inner.kids = inner.kids.filter((k) => k.bind === 'headTilt');
  delete rig.bind;
  s.nodes = [rig];
  return s;
}

// Một chân: chân lông + giày. Gốc ở hông; CSS nâng gối (co ngắn + nhấc lên).
function leg(side) {
  const x = side === 'L' ? 101 : 139, f = side === 'L' ? -1 : 1;
  return `<g class="kr-leg kr-leg${side}" style="transform-origin:${x}px 250px">
    <path d="M${x - 15} 246 C ${x - 16} 262 ${x - 13} 276 ${x - 11} 282 L ${x + 11} 282 C ${x + 13} 276 ${x + 16} 262 ${x + 15} 246 Z" fill="${side === 'L' ? FUR : SHADE}"/>
    <path d="M${x - 15} 280 C ${x - 16} 290 ${x - 12} 295 ${x} 295 C ${x + 12} 295 ${x + 16 + f * 3} 291 ${x + 15 + f * 3} 280 C ${x + 8} 276 ${x - 8} 276 ${x - 15} 280 Z" fill="${SHOE}"/>
    <path d="M${x - 15} 291 C ${x - 6} 296 ${x + 8} 296 ${x + 16 + f * 3} 290" stroke="${SOLE}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M${x - 6} 283 L ${x + 2} 287 L ${x + 8} 281" stroke="${RED}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// Một tay: vai ở mép thân, khuỷu chĩa ra ngoài, nắm tay co lên trước ngực. Viền tối một lượt
// dưới lông để tay tách khỏi thân cùng màu. Gốc ở vai.
function arm(side) {
  const f = side === 'L' ? -1 : 1, sx = 120 + f * 36, sy = 172;
  const ex = 120 + f * 56, ey = 208, hx = 120 + f * 24, hy = 196;
  const fur = side === 'L' ? FUR : SHADE, edge = side === 'L' ? SHADE : '#949EAA';
  const d = `M${sx} ${sy} Q ${ex + f * 2} ${sy + 18} ${ex} ${ey} Q ${ex - f * 10} ${hy + 14} ${hx} ${hy}`;
  return `<g class="kr-arm kr-arm${side}" style="transform-origin:${sx}px ${sy}px">
    <path d="${d}" stroke="${edge}" stroke-width="24" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" stroke="${fur}" stroke-width="19" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${hx}" cy="${hy}" r="10" fill="${LIGHT}" stroke="${edge}" stroke-width="2.5"/>
  </g>`;
}

export function koaRunSvg(scene, { expression = 'happy', uid = 'run' } = {}) {
  const head = koaSvg(headOnly(scene), { expression, pose: 'idle', uid })
    .replace(/^<svg[^>]*><g transform="[^"]*">/, '')
    .replace(/<\/g><\/svg>$/, '');
  const body = `
    <g class="kr-lines" stroke="${SHADE}" stroke-linecap="round">
      <path d="M18 196 H 46" stroke-width="4"/><path d="M8 222 H 40" stroke-width="4"/><path d="M22 248 H 44" stroke-width="3"/>
    </g>
    <g class="kr-dust" fill="${LIGHT}">
      <circle cx="78" cy="290" r="6"/><circle cx="66" cy="286" r="4.5"/><circle cx="162" cy="290" r="6"/><circle cx="174" cy="286" r="4.5"/>
    </g>
    <ellipse class="kr-shadow" cx="120" cy="296" rx="52" ry="7" fill="#000" opacity="0.28"/>
    <g class="kr-body">
      ${arm('R')}
      ${leg('R')}
      ${leg('L')}
      <path d="M120 146 C 101 146 88 156 84 172 C 80 190 70 210 72 232 C 74 254 94 268 120 268 C 146 268 166 254 168 232 C 170 210 160 190 156 172 C 152 156 139 146 120 146 Z" fill="${FUR}"/>
      <path d="M120 190 C 141 190 152 203 152 222 C 152 242 140 258 120 258 C 100 258 88 242 88 222 C 88 203 99 190 120 190 Z" fill="${LIGHT}"/>
      ${arm('L')}
      <g class="kr-head">${head}</g>
    </g>`;
  return `<svg class="koa-svg koa-run" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="matrix(0.93 0 0 0.93 8.4 21)">${body}</g></svg>`;
}
