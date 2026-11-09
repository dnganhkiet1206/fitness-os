import ASCNDCore
import SwiftUI

/// Vẽ đoạn diễn dọn bụi (cảnh B, `KoaRepairScene.Dust`): bụi bám của cảnh (kệ, bảng, mặt bục — khăn lau qua đâu sạch
/// đấy), mạng nhện, bụi trên lá, hạt bụi lơ lửng, xô, bọt, đồ cầm tay, bọt dính Koa, lốc xoáy, sao, lấp lánh, vòng tròn
/// khép. Toạ độ như các món khác: px ảnh phòng của storyboard quy về toạ độ phòng (`KoaRepairScene.room`).
extension KoaRepairLayer {
  typealias D = KoaRepairScene.Dust

  static func col(_ hex: UInt32, _ o: Double = 1) -> Color {
    Color(red: Double(hex >> 16 & 0xFF) / 255, green: Double(hex >> 8 & 0xFF) / 255, blue: Double(hex & 0xFF) / 255).opacity(o)
  }

  static func circle(_ p: CGPoint, _ r: Double) -> Path { Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)) }

  // MARK: phía sau Koa

  func drawDustBehind(_ c: inout GraphicsContext, _ shots: [KoaRepairScene.Shot], index i: Int) {
    let s = shots[i], d = s.dust, o = 1 - d.clean
    // màng xám cả phòng
    if d.grey > 0.002 {
      c.fill(Path(CGRect(x: -200, y: -Self.above - 200, width: StudioScene.width + 400, height: 1400)), with: .color(Self.col(0x7D7464, d.grey)))
    }
    if o > 0.002 {
      var holes: [KoaRepairScene.DustRegion: [CGPoint]] = [:]
      for k in 0...i {
        if let w = shots[k].dust.wipe, let p = shots[k].dust.paw { holes[w, default: []].append(CGPoint(x: p.x, y: p.y)) }
      }
      grime(&c, D.shelfRegionPx, holes[.shelf] ?? [], o, seed: 1)
      grime(&c, D.boardRegionPx, holes[.board] ?? [], o, seed: 2)
      stageGrime(&c, holes[.stage] ?? [], o)
      if d.webOn { cobweb(&c, at: Self.r(D.webPx.x, D.webPx.y), sx: -1, o) }
      cobweb(&c, at: Self.r(0, 1000), sx: 1, o)
      cobweb(&c, at: Self.r(1258, 820), sx: -1, o)
      // bụi trên lá: lắc theo cú phủi, mỏng dần
      let pg = d.plantDust * o
      if pg > 0.01 {
        var g = SplitMix(seed: 5)
        var cc = c
        let pivot = Self.r(D.plantPx.x, 1840)
        cc.translateBy(x: pivot.x, y: pivot.y)
        cc.rotate(by: .degrees(d.plantSway))
        cc.translateBy(x: -pivot.x, y: -pivot.y)
        for _ in 0..<26 {
          let p = Self.r(D.plantPx.x - 150 + 300 * g.unit(), D.plantPx.y - 70 + 130 * g.unit())
          cc.fill(Self.circle(p, Self.len(5 + 6 * g.unit())), with: .color(Self.col(0xA69B88, 0.7 * pg)))
        }
      }
      // hạt bụi lơ lửng
      for k in 0..<22 {
        let ph = Double(k) * 0.37
        let x = (90 + Double(k) * 57 + 40 * sin(d.t * 0.6 + ph * 3)).truncatingRemainder(dividingBy: 1260)
        let y = 420 + Double(k * 131 % 1600) + 40 * sin(d.t * 0.5 + ph)
        c.fill(Self.circle(Self.r(x, y), Self.len(Double(4 + k % 3))), with: .color(.white.opacity(0.4 * o)))
      }
    }
    if d.bucket > 0 { bucket(&c, d.bucket, bubbling: d.bubbling) }
    // khăn / chổi đúng chỗ → bụi bay ra từ chỗ ấy
    if let w = d.wipe, w != .stage, let p = d.paw {
      drawDustPuff(&c, CGPoint(x: p.x, y: p.y), u: (d.t * 1.4).truncatingRemainder(dividingBy: 1))
    }
    // cận cảnh kệ: ván ngay sau khăn bóng lên + lấp lánh
    if 9.3 <= d.t, d.t < 9.95, let p = d.paw {
      let u = KoaRepairScene.seg(d.t, 9.35, 9.9), l = Self.len
      var sheen = Path()
      sheen.move(to: CGPoint(x: p.x + l(-90 + 120 * u), y: p.y - l(30)))
      sheen.addLine(to: CGPoint(x: p.x + l(-74 + 120 * u), y: p.y - l(30)))
      sheen.addLine(to: CGPoint(x: p.x + l(-100 + 120 * u), y: p.y + l(30)))
      sheen.addLine(to: CGPoint(x: p.x + l(-116 + 120 * u), y: p.y + l(30)))
      sheen.closeSubpath()
      c.fill(sheen, with: .color(.white.opacity(0.7)))
      Self.drawSpark(&c, at: CGPoint(x: p.x - l(40), y: p.y - l(40)), r: l(22 * sin(.pi * KoaRepairScene.seg(d.t, 9.5, 9.9))))
    }
  }

  private func grime(_ c: inout GraphicsContext, _ rg: (x: Double, y: Double, w: Double, h: Double), _ holes: [CGPoint], _ o: Double, seed: UInt64) {
    let l = Self.len, origin = Self.r(rg.x, rg.y)
    c.drawLayer { g in
      g.opacity = o
      g.fill(Path(roundedRect: CGRect(x: origin.x, y: origin.y, width: l(rg.w), height: l(rg.h)), cornerRadius: l(18)),
             with: .color(Self.col(0x7F7564, 0.62)))
      var r = SplitMix(seed: seed)
      for _ in 0..<Int(rg.w * rg.h / 2500) {
        let p = Self.r(rg.x + rg.w * r.unit(), rg.y + rg.h * r.unit())
        g.fill(Self.circle(p, l(5 + 9 * r.unit())), with: .color(Self.col(0x9D927F, 0.4 + 0.4 * r.unit())))
      }
      g.blendMode = .destinationOut
      for p in holes { g.fill(Self.circle(p, l(70)), with: .color(.black)) }
    }
  }

  private func stageGrime(_ c: inout GraphicsContext, _ holes: [CGPoint], _ o: Double) {
    let l = Self.len, ctr = Self.r(616, 2010)
    c.drawLayer { g in
      g.opacity = o
      g.fill(Path(ellipseIn: CGRect(x: ctr.x - l(540), y: ctr.y - l(112), width: l(1080), height: l(224))), with: .color(Self.col(0x8F8574, 0.4)))
      var r = SplitMix(seed: 9)
      for _ in 0..<40 {
        let p = Self.r(616 - 480 + 960 * r.unit(), 2010 - 70 + 140 * r.unit())
        let rx = l(8 + 12 * r.unit()), ry = l(4 + 4 * r.unit())
        g.fill(Path(ellipseIn: CGRect(x: p.x - rx, y: p.y - ry, width: 2 * rx, height: 2 * ry)), with: .color(Self.col(0x9D927F, 0.6)))
      }
      g.blendMode = .destinationOut
      for p in holes { g.fill(Self.circle(p, l(120)), with: .color(.black)) }
    }
  }

  /// Mạng nhện góc (đơn vị storyboard, góc ở `at`, lật ngang khi `sx` = −1).
  func cobweb(_ c: inout GraphicsContext, at p: CGPoint, sx: Double, _ o: Double, angle: Double = 0, scale: Double = 1) {
    guard o > 0.01 else { return }
    var g = c
    g.opacity = o
    g.translateBy(x: p.x, y: p.y)
    g.rotate(by: .degrees(angle))
    let k = Self.len(1) * scale
    g.scaleBy(x: k * sx, y: k)
    var w = Path()
    for (x, y) in [(130.0, 0.0), (0, 130), (100, 100), (125, 55), (55, 125)] { w.move(to: .zero); w.addLine(to: CGPoint(x: x, y: y)) }
    for (a, b) in [(34.0, 27.0), (76, 62), (118, 98)] {
      w.move(to: CGPoint(x: a, y: 0)); w.addQuadCurve(to: CGPoint(x: 0, y: a), control: CGPoint(x: b, y: b))
    }
    g.stroke(w, with: .color(Self.col(0xECE8DF)), lineWidth: 3)
  }

  private func bucket(_ c: inout GraphicsContext, _ k: Double, bubbling: Double?) {
    var g = c
    let p = Self.r(D.bucketPx.x, D.bucketPx.y), s = Self.len(1) * k
    g.translateBy(x: p.x, y: p.y)
    g.scaleBy(x: s, y: s)
    let blue = Self.col(0x2F6FB5)
    g.fill(Path(ellipseIn: CGRect(x: -120, y: -14, width: 240, height: 40)), with: .color(Self.col(0x3B2B1C, 0.2)))
    var body = Path()
    body.move(to: CGPoint(x: -100, y: -150)); body.addLine(to: CGPoint(x: -82, y: 0))
    body.addQuadCurve(to: CGPoint(x: 82, y: 0), control: CGPoint(x: 0, y: 18)); body.addLine(to: CGPoint(x: 100, y: -150)); body.closeSubpath()
    g.fill(body, with: .color(Self.col(0x4A9BE0)))
    g.stroke(body, with: .color(blue), lineWidth: 6)
    var band = Path(); band.move(to: CGPoint(x: -96, y: -112)); band.addLine(to: CGPoint(x: 96, y: -112))
    g.stroke(band, with: .color(blue.opacity(0.6)), lineWidth: 5)
    let rim = Path(ellipseIn: CGRect(x: -100, y: -174, width: 200, height: 48))
    g.fill(rim, with: .color(Self.col(0xBFE6FF)))
    g.stroke(rim, with: .color(blue), lineWidth: 6)
    var handle = Path(); handle.move(to: CGPoint(x: -100, y: -150)); handle.addQuadCurve(to: CGPoint(x: 100, y: -150), control: CGPoint(x: 0, y: -290))
    g.stroke(handle, with: .color(Self.col(0x8A8F99)), lineWidth: 7)
    if let b = bubbling {
      var r = SplitMix(seed: 11)
      for i in 0..<14 {
        let ph = (b * 3 + Double(i) * 0.37).truncatingRemainder(dividingBy: 1)
        let x = -80 + 160 * r.unit(), rr = (8 + 10 * r.unit()) * (0.4 + ph)
        let circle = Self.circle(CGPoint(x: x, y: -160 - 70 * ph), rr)
        g.fill(circle, with: .color(.white.opacity(1 - ph)))
        g.stroke(circle, with: .color(Self.col(0xCFE3F0, 1 - ph)), lineWidth: 2)
      }
    }
  }

  private func drawDustPuff(_ c: inout GraphicsContext, _ p: CGPoint, u: Double) {
    guard u > 0, u < 1 else { return }
    for k in 0..<3 {
      let a = Double(k) * 1.3 + 0.4, d = Self.len(70 * KoaRepairScene.eout(u))
      let r = Self.len(Double(16 + 8 * (k % 3)) * (0.6 + 0.8 * u))
      c.fill(Self.circle(CGPoint(x: p.x + cos(a) * d, y: p.y + sin(a) * d * 0.6 - Self.len(60 * u)), r), with: .color(Self.col(0xE0D8C9, 0.75 * (1 - u))))
    }
  }

  // MARK: phía trước Koa

  func drawDustFront(_ c: inout GraphicsContext, _ s: KoaRepairScene.Shot, mouth: CGPoint?) {
    let d = s.dust, l = Self.len
    if let p = d.webFall {
      cobweb(&c, at: CGPoint(x: p.x - l(60), y: p.y - l(40)), sx: 1, d.webAlpha, angle: d.webAngle, scale: 1.1)
    }
    if d.pour, let m = mouth {                             // dòng nước từ miệng bình xuống mặt nước của xô
      let to = CGPoint(x: m.x + l(6), y: Self.r(0, D.bucketPx.y - 150).y)
      var w = Path(); w.move(to: m); w.addQuadCurve(to: to, control: CGPoint(x: m.x + l(4), y: (m.y + to.y) / 2))
      c.stroke(w, with: .color(Self.col(0x7FD6FF, 0.9)),
               style: StrokeStyle(lineWidth: l(12), lineCap: .round, dash: [l(26), l(14)], dashPhase: CGFloat(-d.t * 260) * CGFloat(l(1))))
    }
    if let a = d.spin {                                    // xoay: bọt văng ra, vệt gió
      let u = d.spinU
      var r = SplitMix(seed: 31)
      for _ in 0..<16 {
        let ang = 2 * .pi * r.unit(), dd = l(120 + 520 * u * (0.6 + 0.6 * r.unit()))
        let p = CGPoint(x: s.x + cos(ang) * dd, y: s.feet - l(260) + sin(ang) * dd * 0.7)
        let blob = Self.circle(p, l(26 * (1 - u) + 6))
        c.fill(blob, with: .color(.white.opacity(1 - u * 0.8)))
        c.stroke(blob, with: .color(Self.col(0xD6E6F2, 1 - u * 0.8)), lineWidth: l(3))
      }
      for k in 0..<3 {
        var w = Path()
        let y = s.feet - l(120 + 140 * Double(k))
        w.move(to: CGPoint(x: s.x - l(230), y: y))
        w.addQuadCurve(to: CGPoint(x: s.x + l(230), y: y), control: CGPoint(x: s.x, y: y + l(-60 + 20 * Double(k))))
        c.stroke(w, with: .color(.white.opacity(0.7 * sin(.pi * u))), style: StrokeStyle(lineWidth: l(10), lineCap: .round))
      }
      _ = a
    }
    foam(&c, t: d.t)
    if let tw = d.twinkle {                                // lấp lánh khắp phòng
      let pts: [(Double, Double, Double)] = [(200, 500, 46), (1080, 620, 40), (240, 1450, 36), (1150, 1250, 34), (160, 2000, 40),
                                             (1100, 2050, 44), (640, 1100, 30)]
      for (i, q) in pts.enumerated() {
        let u = KoaRepairScene.seg(tw, Double(i) * 0.07, Double(i) * 0.07 + 1.6)
        if u > 0, u < 1 { Self.drawSpark(&c, at: Self.r(q.0, q.1), r: l(q.2 * sin(.pi * u))) }
      }
    }
  }

  /// Kết kiểu phim hoạt hình: vòng tròn khép dần quanh mặt Koa đang nháy mắt, dừng quanh mặt rồi đóng hẳn.
  func drawIris(_ c: inout GraphicsContext, _ s: KoaRepairScene.Shot) {
    guard let u = s.dust.iris else { return }
    let ease = KoaRepairScene.ease, seg = KoaRepairScene.seg
    let px = u < 0.72 ? KoaRepairScene.lerp(1700, 240, ease(seg(u, 0, 0.55))) : 240 * (1 - ease(seg(u, 0.72, 1)))
    let rad = px / KoaRepairScene.pxPerUnit / max(1, s.camera.zoom)
    let face = CGPoint(x: s.x, y: s.feet - KoaRoomMap.heroWidth * s.scale * KoaMath.aspect * 0.6)
    var p = Path(CGRect(x: -1000, y: -1000, width: 2400, height: 3000))
    p.addEllipse(in: CGRect(x: face.x - rad, y: face.y - rad, width: 2 * rad, height: 2 * rad))
    c.fill(p, with: .color(Self.col(0x111111)), style: FillStyle(eoFill: true))
  }

  /// Một bong bóng xà phòng (toạ độ phòng).
  static func bubble(_ c: inout GraphicsContext, _ p: CGPoint, _ r: Double, sheen: Bool) {
    guard r > 0.3 else { return }
    let disk = circle(p, r)
    c.fill(disk, with: .radialGradient(Gradient(stops: [.init(color: .white, location: 0), .init(color: col(0xF5FAFF), location: 0.62),
                                                        .init(color: col(0xCFE4F5), location: 1)]),
                                       center: CGPoint(x: p.x - r * 0.2, y: p.y - r * 0.24), startRadius: 0, endRadius: r * 1.4))
    c.stroke(disk, with: .color(col(0xC3DAEE)), lineWidth: max(0.4, r * 0.03))
    var hi = c
    hi.translateBy(x: p.x - r * 0.38, y: p.y - r * 0.4)
    hi.rotate(by: .degrees(-35))
    hi.fill(Path(ellipseIn: CGRect(x: -r * 0.24, y: -r * 0.13, width: r * 0.48, height: r * 0.26)), with: .color(.white))
    c.fill(circle(CGPoint(x: p.x - r * 0.12, y: p.y - r * 0.58), r * 0.05), with: .color(.white))
    if sheen {                                             // ánh cầu vồng mỏng ở mép dưới-phải
      var arc = Path()
      arc.addArc(center: p, radius: r * 0.82, startAngle: .degrees(20), endAngle: .degrees(110), clockwise: false)
      c.stroke(arc, with: .linearGradient(Gradient(colors: [col(0xFFB3D1), col(0xFFF1A8), col(0xA8F0FF)]),
                                          startPoint: CGPoint(x: p.x - r, y: p.y - r), endPoint: CGPoint(x: p.x + r, y: p.y + r)),
               style: StrokeStyle(lineWidth: r * 0.09, lineCap: .round))
    }
  }

  /// Bọt: cột bọt phụt lên từ miệng xô → lan ngang phủ kín → vỡ từng bong bóng (vòng nổ + giọt); bong bóng nhỏ bay lên.
  private func foam(_ c: inout GraphicsContext, t: Double) {
    let T = D.T, l = Self.len
    let erupt = T["erupt"]!, full = T["full"]!, dissolve = T["dissolve"]!, spin = T["spin"]!
    if erupt <= t, t < dissolve + 1.2 {
      let seg = KoaRepairScene.seg, ease = KoaRepairScene.ease
      let base = ease(seg(t, full - 0.3, full)) * (1 - ease(seg(t, dissolve, dissolve + 0.3)))
      if base > 0 {
        c.fill(Path(CGRect(x: -400, y: -Self.above - 400, width: StudioScene.width + 800, height: 1800)), with: .color(Self.col(0xF4F9FE, base)))
      }
      var r = SplitMix(seed: 21)
      let ox = D.bucketPx.x, oy = D.bucketPx.y - 160
      for i in 0..<230 {
        let x = -120 + 1500 * r.unit(), y = -120 + 2976 * r.unit()
        let rad = (40 + 110 * r.unit()) * (i % 5 == 0 ? 1.15 : 1)
        let up = KoaRepairScene.clamp((oy - y) / 1900), side = KoaRepairScene.clamp(abs(x - ox) / 900), down = KoaRepairScene.clamp((y - oy) / 700)
        let born = erupt + 0.32 * up + 0.5 * side + 0.45 * down + 0.1 * r.unit()
        let pop = dissolve + 0.95 * r.unit()
        guard t >= born, t < pop + 0.22 else { continue }
        let g = KoaRepairScene.backOut(seg(t, born, born + 0.26), 1.6), wob = 1 + 0.03 * sin(t * 9 + Double(i))
        if t < pop {
          Self.bubble(&c, Self.r(x + 6 * sin(t * 3 + Double(i)), y - 30 * seg(t, born, dissolve)), l(rad * g * wob), sheen: i % 3 == 0)
        } else {
          let q = seg(t, pop, pop + 0.22), p = Self.r(x, y)
          Self.bubble(&c, p, l(rad * (1 - min(1, q * 3))), sheen: false)
          c.stroke(Self.circle(p, l(rad * (0.6 + 0.7 * q))), with: .color(Self.col(0xE4F1FB, 1 - q)), lineWidth: l(6 * (1 - q)))
          for a in [0.6, 2.3, 4.2] {
            let dp = CGPoint(x: p.x + cos(a) * l(rad * (0.7 + q)), y: p.y + sin(a) * l(rad * (0.7 + q)) + l(60 * q * q))
            c.fill(Self.circle(dp, l(6 * (1 - q))), with: .color(Self.col(0xDDEFFC)))
          }
        }
      }
    }
    if dissolve + 0.3 <= t, t < spin {                     // bong bóng nhỏ bay lên lấp lánh sau khi bọt tan
      var r = SplitMix(seed: 8)
      for i in 0..<14 {
        let t0 = dissolve + 0.3 + 0.8 * r.unit(), x0 = 80 + 1100 * r.unit(), y0 = 1500 + 900 * r.unit(), rr = 14 + 14 * r.unit()
        let u = KoaRepairScene.seg(t, t0, t0 + 2.2)
        guard u > 0, u < 1 else { continue }
        var g = c
        g.opacity = 1 - u
        Self.bubble(&g, Self.r(x0 + 30 * sin(u * 8 + Double(i)), y0 - 900 * u), l(rr), sheen: true)
      }
    }
  }

  // MARK: đồ cầm tay (hình 480 của storyboard, vẽ trong hình 240 của Koa: phóng 0,5)

  static func drawCloth(_ c: inout GraphicsContext) {
    var p = Path()
    p.move(to: CGPoint(x: -34, y: -10))
    p.addQuadCurve(to: CGPoint(x: 30, y: -14), control: CGPoint(x: -6, y: -24))
    p.addQuadCurve(to: CGPoint(x: 38, y: 40), control: CGPoint(x: 44, y: 10))
    p.addQuadCurve(to: CGPoint(x: 8, y: 70), control: CGPoint(x: 30, y: 62))
    p.addQuadCurve(to: CGPoint(x: -30, y: 60), control: CGPoint(x: -14, y: 74))
    p.addQuadCurve(to: CGPoint(x: -34, y: -10), control: CGPoint(x: -46, y: 30))
    c.fill(p, with: .color(col(0xFFCF4A)))
    var f = Path()
    for (y0, y1) in [(4.0, -6.0), (24, 14), (44, 36)] {
      f.move(to: CGPoint(x: -25, y: y0)); f.addQuadCurve(to: CGPoint(x: 31, y: y0 - 2), control: CGPoint(x: 2, y: y1))
    }
    c.stroke(f, with: .color(col(0xF4BC2C)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
  }

  /// Chổi lông gà: cán gỗ dài `length` + túm lông hồng-vàng.
  static func drawDuster(_ c: inout GraphicsContext, length L: Double) {
    c.fill(Path(roundedRect: CGRect(x: -6, y: -L, width: 12, height: L + 16), cornerRadius: 6), with: .color(col(0xB07A43)))
    c.fill(Path(roundedRect: CGRect(x: -6, y: -L, width: 4, height: L + 16), cornerRadius: 2), with: .color(col(0xCC9660)))
    c.fill(Path(roundedRect: CGRect(x: -9, y: -L - 8, width: 18, height: 12), cornerRadius: 4), with: .color(col(0x7E8A97)))
    for (dx, dy, r, hex) in [(-16.0, 6.0, -28.0, UInt32(0xF7A7C0)), (16, 6, 28, 0xF7A7C0), (-8, 0, -12, 0xFFD36E), (8, 0, 12, 0xFFD36E),
                             (0, -6, 0, 0xFBC2D4)] {
      var g = c
      g.translateBy(x: dx, y: -L - 10)
      g.rotate(by: .degrees(r))
      g.fill(Path(ellipseIn: CGRect(x: -14, y: -24 + dy - 36, width: 28, height: 72)), with: .color(col(hex)))
    }
  }

  /// Bình nước lau nhà: thân xanh bạc hà, nhãn bong bóng, nắp xanh đậm; miệng bình ở (0, −150).
  static func drawBottle(_ c: inout GraphicsContext) {
    let body = Path(roundedRect: CGRect(x: -36, y: -110, width: 72, height: 130), cornerRadius: 22)
    c.fill(body, with: .color(col(0x8EE0C8)))
    c.stroke(body, with: .color(col(0x4DB89A)), lineWidth: 4)
    c.fill(Path(roundedRect: CGRect(x: -28, y: -80, width: 56, height: 54), cornerRadius: 10), with: .color(.white.opacity(0.9)))
    for (x, y, r) in [(-8.0, -56.0, 10.0), (10, -48, 7), (4, -66, 5)] { c.fill(circle(CGPoint(x: x, y: y), r), with: .color(col(0x9FD8FF))) }
    c.fill(Path(roundedRect: CGRect(x: -16, y: -138, width: 32, height: 30), cornerRadius: 6), with: .color(col(0x2F6FB5)))
    c.fill(Path(roundedRect: CGRect(x: -7, y: -152, width: 14, height: 16), cornerRadius: 4), with: .color(col(0x2F6FB5)))
    c.fill(Path(roundedRect: CGRect(x: -30, y: -104, width: 10, height: 110), cornerRadius: 5), with: .color(.white.opacity(0.35)))
  }

  /// Bọt dính trên đầu, má, cằm, bụng, tay (toạ độ hình 240 của Koa; storyboard đo ở hình 480).
  static func drawFoamOnKoa(_ c: inout GraphicsContext, _ o: KoaRender.Options, k: Double) {
    guard k > 0.01 else { return }
    let a = KoaRender.anchors(o)
    let top = a["head_top_fur"] ?? (120, 48), nose = a["nose"] ?? (120, 105), paw = KoaRender.paws(o).right ?? (190, 238)
    let spots: [(Double, Double, Double)] = [(top.x, top.y - 3, 23), (top.x - 23, top.y + 7, 15), (top.x + 22, top.y + 5, 13),
                                             (nose.x + 35, nose.y + 17, 13), (nose.x - 2, nose.y + 42, 15), (120, 210, 22), (105, 220, 14),
                                             (paw.x, paw.y - 2, 15)]
    for (x, y, r) in spots {
      let rr = r * k
      for (dx, dy, s) in [(0.8, 0.3, 0.6), (-0.7, 0.4, 0.55), (0.0, 0.0, 1.0)] {
        bubble(&c, CGPoint(x: x + dx * rr, y: y + dy * rr), rr * s, sheen: s == 1)
      }
    }
  }
}

/// Góc 3/4 từ trên cao (cảnh B, 18,65–20,75 s; Kiệt 06/11 thay góc từ trần): máy đặt cao một phía, chếch xuống — bục
/// thành elip có thành bên, sàn gỗ chạy xa dần; vệt sạch hình số 8 Koa trượt ra trên lớp bụi. Vẽ phủ cả màn (khung
/// storyboard 1260 × 2736), Koa là Koa thật của bộ vẽ.
struct KoaDustHighAngle: View {
  let shots: [KoaRepairScene.Shot]
  let index: Int
  var equipped: [String] = []
  var build = 0

  var body: some View {
    Canvas { ctx, size in
      let s = shots[index], d = s.dust
      guard let pos = d.high else { return }
      let D = KoaRepairScene.Dust.self, H = D.high
      let k = Double(size.width) / 1260
      var c = ctx
      c.scaleBy(x: k, y: k)
      c.translateBy(x: 0, y: (Double(size.height) / k - 2736) / 2)
      // máy trôi nhẹ theo Koa
      let me = D.highPos(pos.x, pos.y)
      let u = KoaRepairScene.seg(d.t, 18.65, 20.75), rot = 2.5 - 5 * u, z = 1.22 + 0.06 * sin(.pi * u)
      let px = KoaRepairScene.lerp(640, me.x, 0.25), py = KoaRepairScene.lerp(1500, me.y - 200, 0.25)
      c.translateBy(x: 630, y: 1368); c.rotate(by: .degrees(rot)); c.scaleBy(x: z, y: z); c.translateBy(x: -px, y: -py)
      let col = KoaRepairLayer.col
      c.fill(Path(CGRect(x: -400, y: -400, width: 2060, height: 3536)), with: .color(col(0xC99A6A, 1)))
      var planks = Path()
      for i in -8...8 { planks.move(to: CGPoint(x: 640 + i * 70, y: -200)); planks.addLine(to: CGPoint(x: 640 + i * 260, y: 2936)) }
      c.stroke(planks, with: .color(col(0xB5855A, 0.55)), lineWidth: 5)
      var seams = Path()
      for y in [300.0, 620, 980, 1380, 1830, 2330] { seams.move(to: CGPoint(x: -50, y: y)); seams.addLine(to: CGPoint(x: 1310, y: y)) }
      c.stroke(seams, with: .color(col(0xB5855A, 0.35)), lineWidth: 3)
      c.fill(Path(CGRect(x: -60, y: -60, width: 1380, height: 380)), with: .color(col(0xF1E3CC, 1)))
      c.fill(Path(CGRect(x: -60, y: 300, width: 1380, height: 26)), with: .color(col(0xD9C2A0, 1)))
      var shelf = Path()
      shelf.addLines([CGPoint(x: -20, y: 330), CGPoint(x: 380, y: 330), CGPoint(x: 330, y: 560), CGPoint(x: -20, y: 560)]); shelf.closeSubpath()
      c.fill(shelf, with: .color(col(0xB9864F, 1))); c.stroke(shelf, with: .color(col(0x8A5F33, 1)), lineWidth: 5)
      for (x, y, r, h) in [(60.0, 420.0, 26.0, UInt32(0xE9B43C)), (170, 450, 24, 0x5A6C8C), (270, 420, 26, 0xE9B43C)] {
        c.fill(KoaRepairLayer.circle(CGPoint(x: x, y: y), r), with: .color(col(h, 1)))
      }
      for a in stride(from: -70.0, through: 70, by: 28) {
        var g = c
        g.translateBy(x: 1120, y: 600); g.rotate(by: .degrees(a)); g.translateBy(x: -1120, y: -600)
        g.fill(Path(ellipseIn: CGRect(x: 1102, y: 465, width: 36, height: 190)), with: .color(col(0x4E9A55, 1)))
      }
      c.fill(Path(ellipseIn: CGRect(x: 1066, y: 612, width: 108, height: 56)), with: .color(col(0xC46A3C, 1)))
      c.fill(KoaRepairLayer.circle(CGPoint(x: 1190, y: 760), 80), with: .color(col(0xE07B4F, 1)))
      // bục: thành bên + mặt trên
      var side = Path(CGRect(x: H.cx - H.rx, y: H.cy, width: 2 * H.rx, height: H.th))
      side.addEllipse(in: CGRect(x: H.cx - H.rx, y: H.cy + H.th - H.ry, width: 2 * H.rx, height: 2 * H.ry))
      c.fill(side, with: .color(col(0x6E5236, 1)))
      c.draw(Text(verbatim: "K O A").font(.system(size: 44, weight: .heavy)).foregroundStyle(col(0xF5A623, 1)),
             at: CGPoint(x: H.cx, y: H.cy + H.ry + H.th - 40))
      let top = Path(ellipseIn: CGRect(x: H.cx - H.rx, y: H.cy - H.ry, width: 2 * H.rx, height: 2 * H.ry))
      c.fill(top, with: .color(col(0xA07E5C, 1))); c.stroke(top, with: .color(col(0xF5A623, 1)), lineWidth: 22)
      c.stroke(Path(ellipseIn: CGRect(x: H.cx - H.rx + 50, y: H.cy - H.ry + 24, width: 2 * H.rx - 100, height: 2 * H.ry - 48)),
               with: .color(col(0xE2992A, 0.7)), lineWidth: 5)
      // bụi trên mặt bục, vệt sạch theo đường trượt
      var dc = c
      dc.clip(to: Path(ellipseIn: CGRect(x: H.cx - H.rx + 12, y: H.cy - H.ry + 10, width: 2 * H.rx - 24, height: 2 * H.ry - 20)))
      dc.drawLayer { g in
        g.fill(Path(CGRect(x: -200, y: -200, width: 1660, height: 3136)), with: .color(col(0x8F8574, 0.55)))
        var r = SplitMix(seed: 3)
        for _ in 0..<110 {
          let x = H.cx - 560 + 1120 * r.unit(), y = H.cy - 250 + 500 * r.unit(), rx = 7 + 9 * r.unit(), ry = 4 + 4 * r.unit()
          g.fill(Path(ellipseIn: CGRect(x: x - rx, y: y - ry, width: 2 * rx, height: 2 * ry)), with: .color(col(0x8E8270, 0.7)))
        }
        g.blendMode = .destinationOut
        for j in 0...index where shots[j].dust.high != nil {
          let q = D.highPos(shots[j].dust.high!.x, shots[j].dust.high!.y)
          g.fill(Path(ellipseIn: CGRect(x: q.x - 95, y: q.y - 46, width: 190, height: 92)), with: .color(.black))
        }
      }
      // Koa: cỡ theo độ sâu, hơi nén dọc (nhìn từ trên xuống), khăn dưới chân
      let depth = (me.y - H.cy) / H.ry, w = 640 * (1 + 0.18 * depth), kk = w / 480
      c.fill(Path(ellipseIn: CGRect(x: me.x - 150 * kk, y: me.y + 6 - 40 * kk, width: 300 * kk, height: 80 * kk)), with: .color(col(0x3B2B1C, 0.2)))
      for dx in [-60.0, 60] {
        let pad = Path(ellipseIn: CGRect(x: me.x + dx * kk - 72 * kk, y: me.y + 4 - 20 * kk, width: 144 * kk, height: 40 * kk))
        c.fill(pad, with: .color(col(0xFFCF4A, 1))); c.stroke(pad, with: .color(col(0xE9AE1F, 1)), lineWidth: 3)
      }
      var o = KoaRender.Options()
      o.size = 240; o.live = true; o.t = d.t * 1000; o.build = build; o.worn = KoaEmotion.worn(equipped)
      o.expression = s.expression; o.mouth = s.mouth; o.gaze = s.gaze; o.walk = s.pose
      var f = c
      f.translateBy(x: me.x, y: me.y)
      f.scaleBy(x: kk * 2, y: kk * 2 * 0.9)
      f.translateBy(x: -120, y: -294)
      KoaCanvas.draw(KoaPaint.plan(KoaRender.figure(o)), in: &f)
      // loé trắng lúc cắt vào / ra
      let flash = max(1 - KoaRepairScene.seg(d.t, 18.65, 18.8), KoaRepairScene.seg(d.t, 20.63, 20.75))
      ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(0.7 * flash)))
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}
