// Phần VẼ LẠI của native (Kiệt đồng ý, #527): giữ đồ đạc của RN, thêm thứ
// làm căn phòng có chiều sâu — sàn và chân tường, bóng tiếp xúc, vũng sáng
// của đèn trên sàn, quầng đèn, bậu + vệt kính cửa sổ, viền sáng mép bục.
// 04/11 (#799, Kiệt duyệt mock): kệ, cây lớn, bóng tập của RN vẽ lại hẳn
// (`redraw799.cjs`) — cùng chỗ, cùng cỡ, cùng số phần tử.
const redraw = require('./redraw799.cjs');
const C = {
  soft: '#8F83FF', secondary: '#212B4E', primary: '#151A33', edge: '#0B0F22', white: '#FFFFFF', shadow: '#000000',
};
const E = (t, p, k, m) => ({ t, p, ...(k ? { k } : {}), ...(m ? { m } : {}) });

const FLOOR = 360;
const BOTTOM = 476;
const VP = { x: 195, y: 236 };

function floor() {
  const planks = [];
  for (let x = -260; x <= 650; x += 52) {
    const top = VP.x + (x - VP.x) * ((FLOOR - VP.y) / (BOTTOM - VP.y));
    planks.push(E('Path', { d: `M ${top.toFixed(2)} ${FLOOR} L ${x} ${BOTTOM}`, stroke: C.soft, strokeWidth: 0.7, opacity: 0.07, fill: 'none' }));
  }
  // đường nối ngang thưa dần về phía xa (phối cảnh)
  for (const y of [371, 386, 407, 437]) {
    planks.push(E('Path', { d: `M 0 ${y} L 390 ${y}`, stroke: C.soft, strokeWidth: 0.6, opacity: 0.045, fill: 'none' }));
  }
  return [
    E('Defs', {}, [
      E('ClipPath', { id: 'nsFloor' }, [E('Rect', { x: 0, y: FLOOR, width: 390, height: BOTTOM - FLOOR })]),
      E('RadialGradient', { id: 'nsContact' }, [
        E('Stop', { offset: 0, stopColor: C.shadow, stopOpacity: 1 }),
        E('Stop', { offset: 1, stopColor: C.shadow, stopOpacity: 0 }),
      ]),
      E('RadialGradient', { id: 'nsPool' }, [
        E('Stop', { offset: 0, stopColor: '$glow', stopOpacity: '$e:0.12:0.24' }),
        E('Stop', { offset: 0.55, stopColor: '$glow', stopOpacity: '$e:0.035:0.07' }),
        E('Stop', { offset: 1, stopColor: '$glow', stopOpacity: 0 }),
      ]),
      E('RadialGradient', { id: 'nsHalo' }, [
        E('Stop', { offset: 0, stopColor: '$glow', stopOpacity: 0.28 }),
        E('Stop', { offset: 0.45, stopColor: '$glow', stopOpacity: 0.08 }),
        E('Stop', { offset: 1, stopColor: '$glow', stopOpacity: 0 }),
      ]),
      E('LinearGradient', { id: 'nsGlass', x1: '0', y1: '0', x2: '1', y2: '1' }, [
        E('Stop', { offset: 0, stopColor: C.white, stopOpacity: 0.1 }),
        E('Stop', { offset: 1, stopColor: C.white, stopOpacity: 0 }),
      ]),
      ...redraw.defs(),
    ]),
    // chân tường: một gờ tối + một sợi sáng — tường dừng ở đây, sàn bắt đầu
    E('Rect', { x: 0, y: FLOOR - 1, width: 390, height: 4, fill: C.edge, opacity: 0.55 }),
    E('Rect', { x: 0, y: FLOOR - 2, width: 390, height: 1, fill: C.soft, opacity: 0.14 }),
    E('G', { clipPath: 'url(#nsFloor)' }, planks),
  ];
}

function window() {
  return [
    // vệt phản chiếu chéo trên kính
    E('Path', { d: 'M 284 104 L 304 104 L 279 166 L 279 116 Z', fill: 'url(#nsGlass)' }),
    E('Path', { d: 'M 312 104 L 318 104 L 286 186 L 283 180 Z', fill: C.white, opacity: 0.045 }),
    // bậu cửa
    E('Rect', { x: 267, y: 209, width: 105, height: 5, rx: 2, fill: C.secondary }),
    E('Rect', { x: 268, y: 209, width: 103, height: 1, fill: C.soft, opacity: 0.25 }),
    E('Rect', { x: 270, y: 214, width: 99, height: 3, rx: 1.5, fill: C.shadow, opacity: 0.22 }),
  ];
}

module.exports = ({ back, front }) => {
  // Kệ (10 phần tử), cây (chậu nhỏ + cây lớn), bóng (1) của RN thay bằng bản vẽ lại cùng số phần tử:
  // chỉ số 77…94 có chỗ trỏ tới (mặt nạ che Koa, chỗ đồ mua, cúp, lá rung, lớp parallax).
  if (back.shelf.length !== 10 || back.plants.length !== 2 || front.ball.length !== 1) throw new Error('đồ RN đã đổi số phần tử');
  const b = [
    ...back.bg,
    ...back.floor,
    ...floor(),
    ...back.window,
    ...window(),
    ...back.streak,
    ...redraw.shelfBehind(), // 77…79: bóng của kệ — đồ đứng TRÊN sàn, ván in bóng lên tường
    ...redraw.shelfBody(), // 80…89
    redraw.plantContact(), // 90
    redraw.smallPlant(), // 91
    redraw.bigPlant(), // 92
  ];
  const f = [
    redraw.ballContact(),
    redraw.ball(),
    ...front.stageShadow,
    ...front.vignette,
    // vũng sáng của đèn trên sàn — SAU vignette (nó là ánh sáng), theo năng lượng như ánh của bục
    E('Ellipse', { cx: 195, cy: 430, rx: 200, ry: 48, fill: 'url(#nsPool)' }),
    ...front.neon,
    // quầng quanh miệng đèn (dưới chụp đèn, trên vignette)
    E('Ellipse', { cx: 195, cy: 84, rx: 74, ry: 46, fill: 'url(#nsHalo)' }),
    ...front.spot,
    ...front.motes,
    ...front.floorLight,
    ...front.platform,
    // viền sáng mép sau của bục — ánh đèn rơi lên mép xa
    E('Path', { d: 'M 86 396 Q 195 366 304 396', stroke: C.white, strokeWidth: 1.1, opacity: 0.16, fill: 'none', strokeLinecap: 'round' }),
    ...front.stageGlow,
    ...front.label,
  ];
  return { back: b, front: f };
};
