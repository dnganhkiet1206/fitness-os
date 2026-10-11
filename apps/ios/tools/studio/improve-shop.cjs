// Phần VẼ LẠI của phòng thử đồ (#527 S2, Kiệt đồng ý): giữ nguyên căn phòng
// của RN (rèm, tủ, gương, ghế, đèn, bục), thêm cùng bộ chiều sâu với studio —
// ván sàn phối cảnh, bóng của mép rèm trên sàn, bóng tiếp xúc dưới gương / ghế
// / tủ, ánh tủ hắt xuống sàn, vũng sáng + quầng đèn, viền sáng mép bục.
const C = { soft: '#8F83FF', white: '#FFFFFF', shadow: '#000000', highlight: '#FFC24D' };
const E = (t, p, k, m) => ({ t, p, ...(k ? { k } : {}), ...(m ? { m } : {}) });
const shadow = (cx, cy, rx, ry, o) => E('Ellipse', { cx, cy, rx, ry, fill: 'url(#nsContact)', opacity: o });

const HEM = 368;
const BOTTOM = 476;
const VP = { x: 195, y: 236 };

function defs() {
  return E('Defs', {}, [
    E('ClipPath', { id: 'nsShopFloor' }, [E('Rect', { x: 0, y: HEM, width: 390, height: BOTTOM - HEM })]),
    E('RadialGradient', { id: 'nsContact' }, [
      E('Stop', { offset: 0, stopColor: C.shadow, stopOpacity: 1 }),
      E('Stop', { offset: 1, stopColor: C.shadow, stopOpacity: 0 }),
    ]),
    E('LinearGradient', { id: 'nsHem', x1: '0', y1: '0', x2: '0', y2: '1' }, [
      E('Stop', { offset: 0, stopColor: C.shadow, stopOpacity: 0.4 }),
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
    E('RadialGradient', { id: 'nsSpill' }, [
      E('Stop', { offset: 0, stopColor: C.highlight, stopOpacity: 0.16 }),
      E('Stop', { offset: 1, stopColor: C.highlight, stopOpacity: 0 }),
    ]),
  ]);
}

function planks() {
  const out = [];
  for (let x = -260; x <= 650; x += 52) {
    const top = VP.x + (x - VP.x) * ((HEM - VP.y) / (BOTTOM - VP.y));
    out.push(E('Path', { d: `M ${top.toFixed(2)} ${HEM} L ${x} ${BOTTOM}`, stroke: C.soft, strokeWidth: 0.7, opacity: 0.07, fill: 'none' }));
  }
  for (const y of [378, 392, 412, 440]) {
    out.push(E('Path', { d: `M 0 ${y} L 390 ${y}`, stroke: C.soft, strokeWidth: 0.6, opacity: 0.045, fill: 'none' }));
  }
  return E('G', { clipPath: 'url(#nsShopFloor)' }, out);
}

/**
 * `kids` = các con của `<G>` gốc của `ShopRoom`, theo thứ tự RN:
 * Defs, tường, sàn, ánh sàn, rèm, tủ, gương, ghế, vignette, ánh tủ, sân khấu.
 */
module.exports = (kids, plan) => {
  const at = (pred, what) => {
    const i = kids.findIndex(pred);
    if (i < 0) throw new Error('không thấy ' + what);
    return i;
  };
  const tint = at((e) => e.t === 'Rect' && e.p.fill === 'url(#shopFloorTint)', 'ánh sàn');
  const vig = at((e) => e.t === 'Rect' && e.p.fill === 'url(#shopVig)', 'vignette');
  const stage = at((e, i) => i > vig && e.t === 'G' && e.m && e.m[4] === plan.STAGE_DX, 'sân khấu');
  const closetShell = at((e) => e.t === 'G' && e.m && e.m[0] === plan.CLOSET_SCALE, 'tủ');
  const cx = plan.CLOSET.x, cw = plan.CLOSET.w, fl = plan.SHOP_FLOOR;
  const sx = plan.STAGE_X;

  const out = [];
  kids.forEach((e, i) => {
    if (i === closetShell) {
      // bóng tiếp xúc: đồ đứng TRÊN sàn trước rèm, không dán lên rèm
      out.push(
        shadow(plan.MIRROR.x + plan.MIRROR.w / 2, fl + 1, plan.MIRROR.w / 2 + 6, 3.4, 0.5),
        shadow(plan.STOOL_X, fl + 1, 30, 3.2, 0.5),
        shadow(cx + cw / 2, fl + 1, cw / 2 + 4, 4.2, 0.45),
      );
    }
    if (i === stage) {
      // vũng sáng của đèn trên sàn (theo năng lượng) + quầng quanh miệng đèn
      out.push(
        E('Ellipse', { cx: sx, cy: 430, rx: 190, ry: 46, fill: 'url(#nsPool)' }),
        E('Ellipse', { cx: sx, cy: 84, rx: 74, ry: 46, fill: 'url(#nsHalo)' }),
      );
    }
    out.push(e);
    if (i === 0) out.push(defs());
    if (i === tint) out.push(planks());
    if (i === closetShell - 1) {
      // mép rèm đổ bóng xuống sàn
      out.push(E('Rect', { x: 0, y: HEM, width: 390, height: 10, fill: 'url(#nsHem)' }));
    }
    if (i === vig) {
      // ánh trong tủ hắt xuống sàn trước tủ (sau vignette: nó là ánh sáng)
      out.push(E('Ellipse', { cx: cx + cw / 2, cy: HEM + 8, rx: cw / 2 + 8, ry: 10, fill: 'url(#nsSpill)' }));
    }
    if (i === stage) {
      // viền sáng mép sau của bục
      out.push(E('Path', { d: `M ${sx - 109} 396 Q ${sx} 366 ${sx + 109} 396`, stroke: C.white, strokeWidth: 1.1, opacity: 0.16, fill: 'none', strokeLinecap: 'round' }));
    }
  });
  return out;
};
