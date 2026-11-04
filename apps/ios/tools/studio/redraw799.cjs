// Vẽ lại kệ, cây lớn, bóng tập của phòng Koa (#799, Kiệt duyệt mock 04/11:
// https://claude.ai/artifact/TRTSQoBbE7W8n4LMZ8ZvWR). Cùng chỗ, cùng cỡ với tranh RN; chỉ dùng thứ
// `KoaPaint` vẽ được (hình, gradient tuyến tính / toả tròn, độ mờ — không blur, không filter).
//
// Giữ nguyên SỐ và THỨ TỰ phần tử của phòng, vì nhiều chỗ trỏ theo chỉ số:
// - 77…79: bóng của kệ trên sàn / dưới ba tấm ván trên tường — vẽ TRƯỚC Koa và không thuộc mặt nạ
//   che Koa (bóng không được phủ lên Koa); 79 trống;
// - 80…89, 91: thân kệ + đồ trên kệ — mặt nạ che Koa `KoaRoomMap.occluders["shelf"]`, chỗ đồ mua
//   `shelf` (77…89, 91). Thân kệ (cột, ván, bình nước, tạ, ấm tạ, con lăn) gom vào 80, 81…89 trống;
//   chậu cây nhỏ vẫn là 91 (cùng `m` với RN), cúp chèn ngay trước nó (`KoaShelf.cupsAt`);
// - 90: bóng tiếp xúc của cây lớn (ngoài mặt nạ `plant`, như bóng RN);
// - 92: cây lớn — con 0 là thân, con 1…8 là tám lá (`StudioScene.build` cho lá rung theo đúng thứ
//   tự này, quanh ngọn thân (0, −28)), rồi chậu;
// - front 0, 1: bóng tiếp xúc + quả bóng (mặt nạ `ball` = front 1).
// Gradient ở `Defs` cấp đầu của sàn (`improve.cjs`), để mọi lớp / mặt nạ vẽ riêng đều thấy.
// Màu là màu ĐÊM; bản ngày đổi qua `StudioScene.dayColors` (màu riêng của tranh mới, không đụng
// màu đồ mua — lá dùng #3D8254 chứ không #3D8253 của cây đồ mua). Hai chỗ bản ngày của mock khác:
// - bóng tiếp xúc, gân con lăn, viền bóng dùng `INK` ('black'): mock giữ đen cả ban ngày, mà
//   `dayColors` đổi đúng chuỗi '#000000' sang nâu (bóng ván dưới đây vẫn '#000000' → nâu như mock);
// - bóng ván trên tường mờ 0.35 ban đêm, 0.25 ban ngày: token `$day:<đêm>:<ngày>`.
const E = (t, p, k, m) => ({ t, p, ...(k ? { k } : {}), ...(m ? { m } : {}) });
const n = (v) => +v.toFixed(3);

const INK = 'black';
const P = {
  woodTop: '#7A5A86', wood: '#4C3763', woodDark: '#2B1F3D', woodEdge: '#A88BC0', shadow: '#000000',
  iron: '#2A2D45', ironHi: '#55597E', ironDark: '#15172A', accent: '#7B61FF', accentHi: '#A99BFF',
  bar: '#B9BEDA', barDark: '#6A6F8E', leaf: '#3D8254', leafHi: '#63A877', leafDark: '#245437',
  pot: '#5A3F7A', potHi: '#8A6AB0', potDark: '#36254D', ball: '#6D5BD0', ballHi: '#B7AAFF', ballDark: '#3A2E8F',
  seam: '#C9C0FF', bottle: '#1C2140', bottleHi: '#343B6A', cap: '#FFC24D', capHi: '#FFE29A',
};

const stops = (list) => list.map(([o, c, a]) => E('Stop', { offset: o, stopColor: c, ...(a != null ? { stopOpacity: a } : {}) }));
const lin = (id, list, x2 = 0, y2 = 1) => E('LinearGradient', { id, x1: 0, y1: 0, x2, y2 }, stops(list));
const rad = (id, list, cx = 0.5, cy = 0.5, r = 0.5) => E('RadialGradient', { id, cx, cy, r }, stops(list));

/** Gradient của tranh mới — thêm vào `Defs` cấp đầu của sàn. */
const defs = () => [
  lin('nwBoard', [[0, P.wood], [1, P.woodDark]]),
  lin('nwShadow', [[0, P.shadow, '$day:0.35:0.25'], [1, P.shadow, 0]]),
  lin('nwBar', [[0, P.bar], [1, P.barDark]]),
  lin('nwPlate', [[0, P.ironHi], [0.45, P.iron], [1, P.ironDark]], 1, 0),
  lin('nwAccent', [[0, P.accentHi], [1, P.accent]], 1, 0),
  rad('nwBell', [[0, P.ironHi], [0.55, P.iron], [1, P.ironDark]], 0.66, 0.35, 0.8),
  lin('nwRoller', [[0, P.accentHi], [0.5, P.accent], [1, P.ironDark]]),
  lin('nwBottle', [[0, P.bottle], [0.7, P.bottleHi], [1, P.bottle]], 1, 0),
  lin('nwCap', [[0, P.capHi], [1, P.cap]]),
  lin('nwPot', [[0, P.potDark], [0.6, P.pot], [1, P.potHi]], 1, 0),
  lin('nwLeaf', [[0, P.leafHi], [1, P.leaf]]),
  rad('nwBall', [[0, P.ballHi], [0.45, P.ball], [1, P.ballDark]], 0.68, 0.32, 0.85),
  rad('nwContact', [[0, INK, 0.45], [1, INK, 0]]),
];

const rect = (x, y, w, h, fill, r = 0, op) =>
  E('Rect', { x: n(x), y: n(y), width: n(w), height: n(h), rx: r, fill, ...(op != null ? { opacity: op } : {}) });
const ellipse = (cx, cy, rx, ry, fill, op) => E('Ellipse', { cx, cy, rx, ry, fill, ...(op != null ? { opacity: op } : {}) });
const path = (d, fill = 'none', op) => E('Path', { d, fill, ...(op != null ? { opacity: op } : {}) });
const group = (x, y, s, kids) => E('G', {}, kids, [s, 0, 0, s, x, y]);
const contact = (cx, cy, rx, ry, op) => ellipse(cx, cy, rx, ry, 'url(#nwContact)', op);
const empty = () => E('G', {});

/** Bóng của tấm ván trên tường (sau Koa). */
const boardShadow = (x1, x2, y) => rect(x1 + 2, y + 6, x2 - x1 - 4, 5, 'url(#nwShadow)');
/** Tấm ván: mặt trên sáng hơn (thấy được, dưới tầm mắt), mặt trước, vệt đèn bên phải. */
const board = (x1, x2, y) => {
  const w = x2 - x1;
  return [
    rect(x1, y - 2, w, 3, P.woodTop, 1.5),
    rect(x1, y, w, 6, 'url(#nwBoard)', 1.5),
    rect(x1 + w * 0.55, y + 0.6, w * 0.42, 0.9, P.woodEdge, 0.45, 0.55),
  ];
};
const post = (x1, y1, x2, y2) => [
  E('Path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, fill: 'none', stroke: P.woodDark, strokeWidth: 7, strokeLinecap: 'round' }),
  E('Path', { d: `M ${n(x1 + 1.2)} ${y1} L ${n(x2 + 1.2)} ${y2}`, fill: 'none', stroke: P.wood, strokeWidth: 4, strokeLinecap: 'round' }),
  E('Path', {
    d: `M ${n(x1 + 2.6)} ${y1 - 2} L ${n(x2 + 2.4)} ${y2 + 2}`, fill: 'none', stroke: P.woodEdge, strokeWidth: 1,
    strokeLinecap: 'round', opacity: 0.6,
  }),
];
/** Tạ đơn: tay cầm kim loại, đĩa gang, đĩa nhỏ màu nhấn. */
const dumbbell = (cx, cy) => {
  const k = [contact(cx, cy + 9, 22, 2.6, 0.8), rect(cx - 13, cy - 1.6, 26, 3.2, 'url(#nwBar)', 1.6)];
  for (const side of [-1, 1]) {
    const x = cx + side * 13;
    k.push(rect(x - 4, cy - 8, 8, 16, 'url(#nwPlate)', 2.6));
    k.push(rect(x - 3.2, cy - 7.2, 1.4, 14.4, '#FFFFFF', 0.7, 0.12));
    const xo = cx + side * 19;
    k.push(rect(xo - 2.6, cy - 6, 5.2, 12, 'url(#nwAccent)', 2.2));
  }
  return k;
};
/** Ấm tạ gang có điểm sáng. */
const kettlebell = (cx, base, s = 1.1) => group(cx, base, s, [
  contact(0, 0.8, 14, 2.6, 0.9),
  E('Path', { d: 'M -7.5 -19 C -8 -31 8 -31 7.5 -19', fill: 'none', stroke: P.ironDark, strokeWidth: 4.6, strokeLinecap: 'round' }),
  E('Path', {
    d: 'M -6.6 -19.5 C -7 -29.4 7 -29.4 6.6 -19.5', fill: 'none', stroke: P.ironHi, strokeWidth: 1.1, strokeLinecap: 'round',
    opacity: 0.55,
  }),
  ellipse(0, -10.5, 11.5, 10.5, 'url(#nwBell)'),
  rect(-6, -1.6, 12, 2.2, P.ironDark, 1.1),
  ellipse(3.8, -14.5, 3.2, 2.2, '#FFFFFF', 0.18),
  rect(-11.4, -11.5, 22.8, 2.4, 'url(#nwAccent)', 1.2, 0.9),
]);
/** Con lăn có gân. */
const roller = (cx, base, s = 1.1) => {
  const k = [contact(0, 0.8, 19, 2.6, 0.9), rect(-16, -16, 32, 16, 'url(#nwRoller)', 8)];
  for (let i = 0; i < 7; i++) {
    k.push(rect(-11 + i * 4, -15.4, 1.2, 14.8, i % 2 ? '#FFFFFF' : INK, 0.6, i % 2 ? 0.08 : 0.14));
  }
  k.push(ellipse(-16, -8, 4, 8, P.accentHi), ellipse(-16, -8, 2.2, 4.4, P.ironDark, 0.75), ellipse(-16, -8, 0.9, 1.8, INK, 0.5));
  return group(cx, base, s, k);
};
/** Bình nước có khối, tia sét trên nắp như bình của RN. */
const bottle = (cx, base, s = 0.72) => group(cx, base, s, [
  contact(0, 0.6, 13, 2.4, 0.9),
  rect(-11, -34, 22, 34, 'url(#nwBottle)', 5),
  rect(-11, -22, 22, 9, P.accent, 0, 0.75),
  rect(-11, -22, 22, 1.4, '#FFFFFF', 0, 0.18),
  rect(-9, -42, 18, 9, 'url(#nwCap)', 3),
  rect(-4, -46, 8, 5, P.cap, 2, 0.85),
  path('M 2 -30 L -4 -21 L 0 -21 L -2 -14 L 5 -23 L 1 -23 Z', P.capHi),
  rect(6, -32, 2.2, 30, '#FFFFFF', 1.1, 0.14),
]);
/** Lá của chậu cây nhỏ: hai tông + gân giữa. */
const leaf = (x, y, ang, ln, wd) => {
  const r = (ang * Math.PI) / 180, c = n(Math.cos(r)), s = n(Math.sin(r));
  const d = `M 0 0 C ${n(wd)} ${n(-ln * 0.3)} ${n(wd * 0.9)} ${n(-ln * 0.75)} 0 ${n(-ln)} C ${n(-wd * 0.9)} ${n(-ln * 0.75)} ${n(-wd)} ${n(-ln * 0.3)} 0 0 Z`;
  const half = `M 0 0 C ${n(wd)} ${n(-ln * 0.3)} ${n(wd * 0.9)} ${n(-ln * 0.75)} 0 ${n(-ln)} Z`;
  return E('G', {}, [
    E('Path', { d, fill: P.leafDark }),
    E('Path', { d: half, fill: 'url(#nwLeaf)' }),
    E('Path', { d: `M 0 -1 L 0 ${n(-ln * 0.92)}`, fill: 'none', stroke: P.leafDark, strokeWidth: 0.6, opacity: 0.7 }),
  ], [c, s, -s, c, x, y]);
};
const smallPlant = (cx, base, s = 0.72) => {
  const k = [contact(0, 0.6, 12, 2.4, 0.9)];
  for (const [ang, ln] of [[-62, 20], [-36, 26], [-12, 30], [12, 29], [36, 25], [60, 19]]) k.push(leaf(0, -12, ang, ln, 5.2));
  k.push(path('M -9 -12 L 9 -12 L 7 0 L -7 0 Z', 'url(#nwPot)'), rect(-10, -14.4, 20, 3.4, P.potHi, 1.4),
    rect(-10, -11.4, 20, 1, P.potDark, 0, 0.5));
  return group(cx, base, s, k);
};

/** Bóng tiếp xúc của cây lớn (phần tử 90): như trong mock, (0, 0.4) cỡ 13 × 2.8 của nhóm cây (× 1.81). */
const plantContact = () => group(316, 397, 1.81, [contact(0, 0.4, 13, 2.8, 0.8)]);
/** Cây lớn bên phải (phần tử 92): thân, tám lá toả từ ngọn (0, −28) tới đúng tám đầu lá cũ (lá ngoài
 * tối và mờ hơn cho có chiều sâu), rồi chậu gốm có vành. */
const bigPlant = () => {
  const tips = [[-30, -38, 0.55], [-23, -43, 0.7], [-14, -46, 0.88], [-5, -48, 1.0], [4, -48, 1.0], [13, -45, 0.9], [22, -41, 0.72], [29, -35, 0.58]];
  const k = [E('Path', { d: 'M 0 -12 L 0 -28', stroke: P.leafDark, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' })];
  for (const [tx, ty, op] of tips) {
    const dx = tx, dy = ty + 28, ln = Math.hypot(dx, dy), nx = -dy / ln, ny = dx / ln, w = 4.6;
    const pt = (a, b) => `${a.toFixed(2)} ${b.toFixed(2)}`;
    const c1 = pt(dx * 0.35 + nx * w, -28 + dy * 0.35 + ny * w);
    const c2 = pt(dx * 0.8 + nx * w * 0.7, -28 + dy * 0.8 + ny * w * 0.7);
    const c3 = pt(dx * 0.8 - nx * w * 0.7, -28 + dy * 0.8 - ny * w * 0.7);
    const c4 = pt(dx * 0.35 - nx * w, -28 + dy * 0.35 - ny * w);
    k.push(E('G', {}, [
      E('Path', { d: `M 0 -28 C ${c1} ${c2} ${tx} ${ty} C ${c3} ${c4} 0 -28 Z`, fill: P.leafDark, opacity: op }),
      E('Path', { d: `M 0 -28 C ${c1} ${c2} ${tx} ${ty} Z`, fill: 'url(#nwLeaf)', opacity: op }),
      E('Path', {
        d: `M 0 -28 L ${(tx * 0.95).toFixed(2)} ${(-28 + dy * 0.95).toFixed(2)}`, stroke: P.leafDark, strokeWidth: 0.5,
        fill: 'none', opacity: n(0.8 * op),
      }),
    ]));
  }
  k.push(path('M -10 -12 L 10 -12 L 7.8 0 L -7.8 0 Z', 'url(#nwPot)'),
    rect(-11, -14.6, 22, 3.6, P.potHi, 1.6), rect(-11, -11.2, 22, 1, P.potDark, 0, 0.5), rect(-8.4, -6.8, 16.8, 1.2, P.potHi, 0.6, 0.45));
  return group(316, 397, 1.81, k);
};

/** Bóng tập: khối cầu có điểm sáng, đường may mờ. */
const ball = () => {
  const k = [E('Circle', { cx: 0, cy: 0, r: 30, fill: 'url(#nwBall)' })];
  for (const [yy, rx, ry] of [[-18.6, 23.5, 8.0], [-7.2, 29.1, 9.9], [4.8, 29.6, 10.1], [16.2, 25.2, 8.6]]) {
    k.push(E('Path', { d: `M ${-rx} ${yy} A ${rx} ${ry} 0 0 0 ${rx} ${yy}`, fill: 'none', stroke: P.seam, strokeWidth: 1, opacity: 0.35 }));
  }
  k.push(ellipse(10, -14, 9, 6, '#FFFFFF', 0.22), ellipse(13, -17, 3.4, 2.2, '#FFFFFF', 0.45),
    E('Circle', { cx: 0, cy: 0, r: 29.5, fill: 'none', stroke: INK, strokeWidth: 1, opacity: 0.18 }));
  return group(352, 370, 1, k);
};

/** 77…79: bóng của kệ trên sàn và dưới ba tấm ván trên tường (sau Koa). */
const shelfBehind = () => [
  contact(72, 393, 62, 5, 0.9),
  E('G', {}, [boardShadow(28, 116, 250), boardShadow(20, 124, 300), boardShadow(12, 132, 350)]),
  empty(),
];
/** 80…89: thân kệ thang gỗ + đồ trên kệ ở 80 (mặt nạ che Koa), 81…89 trống. Chậu cây nhỏ ở 91. */
const shelfBody = () => [
  E('G', {}, [
    ...post(12, 392, 26, 250), ...post(132, 392, 118, 250),
    ...board(28, 116, 250), ...board(20, 124, 300), ...board(12, 132, 350),
    bottle(84, 250),
    ...dumbbell(46, 291), ...dumbbell(98, 291),
    kettlebell(40, 350), roller(100, 350),
  ]),
  ...Array.from({ length: 9 }, empty),
];

module.exports = {
  defs, shelfBehind, shelfBody, plantContact, smallPlant: () => smallPlant(41, 250), bigPlant,
  ballContact: () => contact(352, 400, 30, 5, 0.9), ball,
};
