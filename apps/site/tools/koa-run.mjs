// Koa chạy bộ cho web (23/10, Kiệt: "vẽ lại phần koa chạy bộ, không cần theo app").
// Nhìn nghiêng 3/4 sang phải. Đầu, mặt, tai: NGUYÊN cây HEADRIG của cảnh app ở tư thế chạy
// (mặt đã quay nghiêng), không vẽ lại. Thân đổ về trước, đùi / ống chân / giày, bắp tay /
// cẳng tay: vẽ mới, mỗi khớp một nhóm để CSS xoay (style.css, "Koa chạy bộ"): sải chân có gập
// gối, tay đánh ngược chân. Màu lấy đúng bảng màu lông của cảnh.
import { koaSvg } from './koa-svg.mjs';

const FUR = '#BFC7CF', SHADE = '#A9B2BC', BACK = '#9AA4B0', LIGHT = '#D7DDE3';
const SHOE = '#F4F6F8', SOLE = '#5B6573', RED = '#E5484D';

// Chỉ giữ nhánh đầu (POSERIG > … > headTilt > HEADRIG) của cảnh.
function headOnly(scene) {
  const s = JSON.parse(JSON.stringify(scene));
  const rig = s.nodes.find((n) => n.id === 'POSERIG');
  rig.kids[0].kids = rig.kids[0].kids.filter((k) => k.bind === 'headTilt');
  delete rig.bind;
  s.nodes = [rig];
  return s;
}

// Một chân, gốc ở hông (118,236): đùi → gối (118,262) → ống chân → giày mũi sang phải.
function leg(side) {
  const fur = side === 'F' ? FUR : BACK;
  return `<g class="kr-thigh kr-thigh${side}">
    <path d="M118 234 L 118 262" stroke="${fur}" stroke-width="25" stroke-linecap="round"/>
    <g class="kr-shin kr-shin${side}">
      <path d="M118 262 L 118 284" stroke="${fur}" stroke-width="21" stroke-linecap="round"/>
      <path d="M106 284 C 106 293 112 297 124 297 C 134 297 140 294 139 288 C 138 283 131 282 124 280 C 116 278 106 279 106 284 Z" fill="${side === 'F' ? SHOE : '#DDE2E7'}"/>
      <path d="M106 292 C 114 298 130 298 139 292" stroke="${SOLE}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M115 285 L 122 289 L 128 284" stroke="${RED}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>`;
}

// Một tay, gốc ở vai (146,176): bắp tay xuống → khuỷu (146,204) → cẳng tay co lên trước.
function arm(side) {
  const fur = side === 'F' ? SHADE : BACK, edge = side === 'F' ? '#97A1AD' : '#8C96A2';
  return `<g class="kr-upper kr-upper${side}">
    <path d="M146 174 L 146 204" stroke="${edge}" stroke-width="22" stroke-linecap="round"/>
    <path d="M146 174 L 146 204" stroke="${fur}" stroke-width="17" stroke-linecap="round"/>
    <g class="kr-fore kr-fore${side}">
      <path d="M146 204 L 146 226" stroke="${edge}" stroke-width="20" stroke-linecap="round"/>
      <path d="M146 204 L 146 226" stroke="${fur}" stroke-width="15" stroke-linecap="round"/>
      <circle cx="146" cy="228" r="9.5" fill="${LIGHT}" stroke="${edge}" stroke-width="2.5"/>
    </g>
  </g>`;
}

export function koaRunSvg(scene, { expression = 'happy', uid = 'run' } = {}) {
  const head = koaSvg(headOnly(scene), { expression, pose: 'running', uid })
    .replace(/^<svg[^>]*><g transform="[^"]*">/, '')
    .replace(/<\/g><\/svg>$/, '');
  const body = `
    <g class="kr-lines" stroke="${SHADE}" stroke-linecap="round">
      <path d="M22 186 H 52" stroke-width="4"/><path d="M8 214 H 44" stroke-width="4"/><path d="M26 242 H 50" stroke-width="3"/>
    </g>
    <g class="kr-dust" fill="${LIGHT}"><circle cx="92" cy="290" r="6"/><circle cx="80" cy="285" r="4.5"/><circle cx="70" cy="290" r="3.5"/></g>
    <ellipse class="kr-shadow" cx="124" cy="297" rx="46" ry="6.5" fill="#000" opacity="0.3"/>
    <g class="kr-body">
      ${arm('B')}
      ${leg('B')}
      <g class="kr-torso">
        <path d="M124 146 C 102 146 88 160 85 180 C 82 200 84 224 94 238 C 104 250 142 252 152 238 C 164 222 164 200 159 180 C 154 160 144 146 124 146 Z" fill="${FUR}"/>
        <path d="M140 186 C 153 190 157 206 155 220 C 153 236 146 244 135 244 C 125 242 121 230 122 216 C 123 200 129 184 140 186 Z" fill="${LIGHT}"/>
      </g>
      ${leg('F')}
      <g class="kr-head">${head}</g>
      ${arm('F')}
    </g>`;
  return `<svg class="koa-svg koa-run" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="matrix(0.93 0 0 0.93 8.4 21)">${body}</g></svg>`;
}
