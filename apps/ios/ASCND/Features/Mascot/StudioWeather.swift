import ASCNDCore
import SwiftUI

/// Mây và thời tiết ngoài ô cửa vòm phòng Koa (Kiệt duyệt mock bản 3, 23/11). Vẽ trong toạ độ của ô cửa
/// (162 × 311, gốc ở góc trên trái ô, bậu ở đáy). `KoaWeather` chọn kiểu trời theo mùa, cố định theo ngày.
///
/// Nguyên lý (nghiên cứu 23/11, theo các hiệu ứng mưa / tuyết / biển mã nguồn mở và ảnh tham khảo):
/// - Mưa: vệt là vết nhoè chuyển động, nằm đúng theo vận tốc (đuôi ở phía giọt vừa đi qua). Gió đổi cả hướng trôi
///   lẫn góc vệt. Có 3 lớp sâu: xa thì mảnh, ngắn, mờ, đứng hơn; gần thì dày, sáng, nghiêng hơn. Giọt băng qua
///   ô trong 1–2 s. Có giọt bắn ở bậu và giọt bám kính trượt từng nấc.
/// - Tuyết: 3 lớp sâu. Mỗi bông lượn chậm (chu kỳ 6–14 s), gió đẩy chéo nhẹ, hiện / tắt dần ở mép.
///   Tuyết đọng thành gò trên bậu.
/// - Sương: dày sát đất, loãng lên cao (phối cảnh khí quyển). Các dải mềm (nhoè) trôi ở 3 tốc độ.
/// - Biển: sóng nhỏ theo phối cảnh (thưa, dài ở gần; dày, ngắn ở xa). Vệt trăng là các đốm lấp lánh, sáng nhất
///   ngay dưới trăng, rộng dần về phía người xem; trời mưa thì mờ và loang rộng.
enum StudioWeather {
  static let w = StudioTall.arch.w
  static let h = StudioTall.arch.h

  /// Mulberry32: chuỗi số giả ngẫu nhiên cố định theo hạt, để mọi khung vẽ cùng một đàn giọt / bông.
  struct Seq {
    var a: UInt32
    init(_ seed: UInt32) { a = seed }
    mutating func next() -> Double {
      a = a &+ 0x6D2B_79F5
      var t = (a ^ (a >> 15)) &* (1 | a)
      t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
      return Double(t ^ (t >> 14)) / 4_294_967_296
    }
  }

  static func wrap(_ v: Double, _ m: Double) -> Double {
    let r = v.truncatingRemainder(dividingBy: m)
    return r < 0 ? r + m : r
  }

  static func archPath() -> Path {
    var p = Path()
    let r = w / 2
    p.move(to: CGPoint(x: 0, y: h))
    p.addLine(to: CGPoint(x: 0, y: r))
    p.addArc(center: CGPoint(x: r, y: r), radius: r, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
    p.addLine(to: CGPoint(x: w, y: h))
    p.closeSubpath()
    return p
  }

  /// Đưa `c` về toạ độ ô cửa và cắt theo vòm.
  static func enter(_ c: inout GraphicsContext) {
    c.translateBy(x: StudioTall.arch.x, y: StudioTall.arch.y)
    c.clip(to: archPath())
  }

  static func rgb(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> Color {
    Color(red: r / 255, green: g / 255, blue: b / 255).opacity(a)
  }

  // MARK: tầng trời (sau thành phố): trời xám + mây

  static func sky(_ c: inout GraphicsContext, t: Double, weather: KoaWeather, night: Bool, bought: Bool) {
    enter(&c)
    if weather.overcast > 0 {
      c.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)),
             with: .color(night ? rgb(34, 34, 56, weather.overcast) : rgb(150, 160, 174, weather.overcast)))
    }
    guard !bought else { return }  // cảnh đã mua có trời riêng
    let layers: [(sp: Double, y: Double, s: Double, a: Double)] = [
      (2, 62, 0.55, 0.8), (4.2, 110, 0.85, 1), (6.5, weather == .rain ? 150 : 170, 1.05, 1),
    ]
    for (i, l) in layers.prefix(weather.cloudLayers).enumerated() {
      for j in 0..<2 {
        let span = w + 170
        let x = -85 + wrap(t * l.sp + Double(j) * span / 2 + Double(i) * 53, span)
        c.opacity = l.a
        cloud(&c, x: x, y: l.y + Double(j) * 8, s: l.s, dark: weather.denseClouds, night: night)
      }
    }
    c.opacity = 1
  }

  /// Một cụm mây đáy phẳng: mặt trên sáng, đáy tối, viền sáng phía trên.
  static func cloud(_ c: inout GraphicsContext, x: Double, y: Double, s: Double, dark: Bool, night: Bool) {
    let puffs: [(Double, Double, Double)] = [(-30, 0, 16), (-12, -10, 20), (8, -14, 22), (28, -6, 17), (44, 2, 12)]
    let top = night ? (dark ? rgb(74, 74, 114) : rgb(93, 92, 142)) : (dark ? rgb(227, 231, 236) : .white)
    let bot = night ? (dark ? rgb(37, 37, 63) : rgb(48, 48, 90)) : (dark ? rgb(154, 166, 180) : rgb(201, 211, 224))
    var shape = Path()
    for (dx, dy, r) in puffs { shape.addEllipse(in: CGRect(x: dx - r, y: dy - r, width: r * 2, height: r * 2)) }
    shape.addRect(CGRect(x: -46, y: 0, width: 104, height: 14))
    let m = CGAffineTransform(translationX: x, y: y).scaledBy(x: s, y: s)
    let placed = shape.applying(m)
    c.fill(placed, with: .linearGradient(
      Gradient(stops: [.init(color: top, location: 0), .init(color: top, location: 0.55), .init(color: bot, location: 1)]),
      startPoint: CGPoint(x: 0, y: y - 36 * s), endPoint: CGPoint(x: 0, y: y + 14 * s)))
    var open = Path()
    for (dx, dy, r) in puffs.prefix(4) {
      open.move(to: CGPoint(x: dx + r * cos(.pi * 1.1), y: dy + r * sin(.pi * 1.1)))
      open.addArc(center: CGPoint(x: dx, y: dy), radius: r, startAngle: .radians(.pi * 1.1), endAngle: .radians(.pi * 1.75), clockwise: false)
    }
    c.stroke(open.applying(m), with: .color(night ? rgb(217, 210, 255, 0.45) : .white.opacity(0.9)), lineWidth: 1.3)
  }

  // MARK: tầng ngoài trời (trên thành phố / cảnh): sương, mưa, tuyết, biển

  static func outside(_ c: inout GraphicsContext, t: Double, weather: KoaWeather, night: Bool, window: String?) {
    enter(&c)
    let haze: Double = [.cloudy: 0.08, .rain: 0.2, .fog: 0.28, .snow: 0.12][weather] ?? 0
    if haze > 0 {
      c.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(night ? rgb(70, 68, 100, haze) : rgb(226, 230, 236, haze)))
    }
    if window == "ocean" {
      sea(&c, t: t, weather: weather, horizon: StudioTall.oceanHorizon - StudioTall.arch.y, moonX: StudioTall.oceanMoonX - StudioTall.arch.x)
    }
    switch weather {
    case .rain: rain(&c, t: t, night: night)
    case .snow: snow(&c, t: t, night: night)
    case .fog: fog(&c, t: t, night: night, top: window == "mountain" ? 0.66 : 0.45, dense: window == "mountain" ? 0.75 : 1)
    case .clear, .cloudy: break
    }
  }

  static func rain(_ c: inout GraphicsContext, t: Double, night: Bool) {
    let gust = 0.16 + 0.05 * sin(t * 0.23) + 0.02 * sin(t * 0.9)
    let layers: [(n: Int, fall: Double, len: Double, lw: Double, a: Double, k: Double)] = [
      (90, 140, 0.08, 0.55, night ? 0.3 : 0.28, 0.6), (55, 200, 0.09, 0.85, night ? 0.42 : 0.38, 0.85),
      (14, 280, 0.1, 1.2, night ? 0.55 : 0.5, 1),
    ]
    let ink = night ? (190.0, 198.0, 240.0) : (70.0, 88.0, 115.0)
    for (li, l) in layers.enumerated() {
      var r = Seq(UInt32(11 + li))
      let vx = gust * l.fall * l.k
      var p = Path()
      for _ in 0..<l.n {
        let x0 = r.next() * (w + 80), y0 = r.next() * (h + 60), sp = 0.85 + r.next() * 0.3
        let y = wrap(y0 + l.fall * sp * t, h + 60) - 30, x = wrap(x0 + vx * sp * t, w + 80) - 40
        p.move(to: CGPoint(x: x, y: y))
        p.addLine(to: CGPoint(x: x - vx * sp * l.len, y: y - l.fall * sp * l.len))
      }
      c.stroke(p, with: .color(rgb(ink.0, ink.1, ink.2, l.a)), style: StrokeStyle(lineWidth: l.lw, lineCap: .round))
    }
    // giọt bắn ở bậu
    var rs = Seq(21)
    for _ in 0..<9 {
      let per = 0.5 + rs.next() * 0.5, ph = rs.next() * per, x = 8 + rs.next() * (w - 16)
      let u = wrap(t + ph, per) / per
      guard u < 0.35 else { continue }
      let k = u / 0.35, s = 2 + 4 * k
      var p = Path()
      p.move(to: CGPoint(x: x - s, y: h - 6 - s * 0.8))
      p.addQuadCurve(to: CGPoint(x: x, y: h - 6), control: CGPoint(x: x - s * 0.4, y: h - 6 - s * 1.3))
      p.move(to: CGPoint(x: x + s, y: h - 6 - s * 0.8))
      p.addQuadCurve(to: CGPoint(x: x, y: h - 6), control: CGPoint(x: x + s * 0.4, y: h - 6 - s * 1.3))
      c.stroke(p, with: .color(rgb(ink.0, ink.1, ink.2, 0.55 * (1 - k))), lineWidth: 0.7)
    }
    // giọt bám kính trượt từng nấc, để lại vệt ướt ngắn
    var rd = Seq(31)
    for _ in 0..<7 {
      let x = 10 + rd.next() * (w - 20), y0 = rd.next() * h * 0.7, step = 0.8 + rd.next() * 1.6, ph = rd.next() * 5
      let tt = t + ph
      let k = (tt / step).rounded(.down), f = min(1, wrap(tt, step) / 0.25)
      let y = wrap(y0 + (k + f) * 9, h + 20) - 10
      var trail = Path()
      trail.move(to: CGPoint(x: x, y: max(0, y - 12)))
      trail.addLine(to: CGPoint(x: x, y: y - 2))
      c.stroke(trail, with: .color(night ? rgb(200, 205, 255, 0.1) : .white.opacity(0.22)), lineWidth: 1)
      c.fill(Path(ellipseIn: CGRect(x: x - 1.4, y: y - 1.8, width: 2.8, height: 3.6)),
             with: .color(night ? rgb(210, 214, 255, 0.55) : .white.opacity(0.8)))
      c.fill(Path(ellipseIn: CGRect(x: x - 0.4, y: y, width: 1.8, height: 1.8)),
             with: .color(night ? rgb(20, 20, 40, 0.5) : rgb(60, 70, 90, 0.35)))
    }
  }

  static func snow(_ c: inout GraphicsContext, t: Double, night: Bool) {
    let wind = 5 + 2 * sin(t * 0.11)
    let layers: [(n: Int, size: Double, fall: Double, amp: Double, a: Double, seed: UInt32, k: Double)] = [
      (70, 0.55, 9, 2, 0.55, 3, 0.5), (38, 1.05, 14, 3.5, 0.8, 4, 0.8), (9, 1.9, 21, 5, 0.9, 5, 1),
    ]
    let ink = night ? (236.0, 238.0, 255.0) : (255.0, 255.0, 255.0)
    for l in layers {
      var r = Seq(l.seed)
      for _ in 0..<l.n {
        let x0 = r.next() * (w + 40), y0 = r.next() * (h + 20), ph = r.next() * 6.3, per = 6 + r.next() * 8
        let v = 0.8 + r.next() * 0.4, sz = l.size * (0.75 + r.next() * 0.5)
        let y = wrap(y0 + l.fall * v * t, h + 20) - 10
        let x = wrap(x0 + wind * l.k * t + sin(t * 2 * .pi / per + ph) * l.amp, w + 40) - 20
        let edge = min(1, (y + 10) / 30, (h - y) / 24)
        guard edge > 0 else { continue }
        if l.k == 1 {
          let rr = sz * 1.5
          c.fill(Path(ellipseIn: CGRect(x: x - rr, y: y - rr, width: rr * 2, height: rr * 2)), with: .radialGradient(
            Gradient(stops: [
              .init(color: rgb(ink.0, ink.1, ink.2, l.a * edge), location: 0),
              .init(color: rgb(ink.0, ink.1, ink.2, l.a * edge * 0.6), location: 0.55),
              .init(color: rgb(ink.0, ink.1, ink.2, 0), location: 1),
            ]), center: CGPoint(x: x, y: y), startRadius: 0, endRadius: rr))
        } else {
          c.fill(Path(ellipseIn: CGRect(x: x - sz, y: y - sz, width: sz * 2, height: sz * 2)),
                 with: .color(rgb(ink.0, ink.1, ink.2, l.a * edge)))
        }
      }
    }
    // tuyết đọng trên bậu: gò mềm, viền bóng xanh nhạt
    let base = h - 4
    var mound = Path()
    mound.move(to: CGPoint(x: 0, y: base))
    mound.addCurve(to: CGPoint(x: w * 0.5, y: base - 10), control1: CGPoint(x: w * 0.15, y: base - 12), control2: CGPoint(x: w * 0.35, y: base - 8))
    mound.addCurve(to: CGPoint(x: w, y: base - 10), control1: CGPoint(x: w * 0.68, y: base - 13), control2: CGPoint(x: w * 0.86, y: base - 7))
    mound.addLine(to: CGPoint(x: w, y: h))
    mound.addLine(to: CGPoint(x: 0, y: h))
    mound.closeSubpath()
    c.fill(mound, with: .color(night ? rgb(207, 212, 238) : .white))
    var shade = Path()
    shade.move(to: CGPoint(x: 0, y: base + 1.5))
    shade.addLine(to: CGPoint(x: w, y: base + 1.5))
    c.stroke(shade, with: .color(night ? rgb(150, 160, 210, 0.6) : rgb(170, 190, 220, 0.7)), lineWidth: 1)
  }

  static func fog(_ c: inout GraphicsContext, t: Double, night: Bool, top: Double, dense: Double) {
    let ink = night ? (150.0, 148.0, 190.0) : (240.0, 242.0, 246.0)
    c.fill(Path(CGRect(x: 0, y: h * top, width: w, height: h * (1 - top))), with: .linearGradient(
      Gradient(colors: [rgb(ink.0, ink.1, ink.2, 0), rgb(ink.0, ink.1, ink.2, dense * (night ? 0.55 : 0.8))]),
      startPoint: CGPoint(x: 0, y: h * top), endPoint: CGPoint(x: 0, y: h)))
    c.drawLayer { l in
      l.addFilter(.blur(radius: 7))
      for (li, band) in [(3.0, 0.0, 0.35), (6, 0.12, 0.45), (10, 0.24, 0.55)].enumerated() {
        var r = Seq(UInt32(41 + li))
        let y = h * (top + band.1 + 0.08)
        for _ in 0..<5 {
          let ww = 60 + r.next() * 50, x = wrap(r.next() * (w + 120) + t * band.0, w + 120) - 60
          let yy = y + r.next() * 14, hh = 8 + r.next() * 6
          l.fill(Path(ellipseIn: CGRect(x: x - ww / 2, y: yy - hh, width: ww, height: hh * 2)),
                 with: .color(rgb(ink.0, ink.1, ink.2, band.2 * dense * (night ? 0.7 : 0.9))))
        }
      }
    }
  }

  /// Gợn sóng theo phối cảnh + vệt trăng lấp lánh trên mặt nước của cảnh biển đã mua.
  static func sea(_ c: inout GraphicsContext, t: Double, weather: KoaWeather, horizon hz: Double, moonX mx: Double) {
    let rough = weather == .rain ? 1.8 : 1.0
    let dim = weather == .rain ? 0.35 : weather == .cloudy ? 0.5 : weather == .fog ? 0 : 1
    let n = 16
    for k in 1...n {
      let u = Double(k) / Double(n), y = hz + (h - hz) * u * u
      let len = 3 + u * 16, gap = len * 1.6
      let off = wrap(t * (4 + u * 10) * (k.isMultiple(of: 2) ? -1 : 1), len + gap)
      var p = Path()
      var x = -gap + off
      while x < w {
        p.move(to: CGPoint(x: x, y: y))
        p.addLine(to: CGPoint(x: x + len, y: y))
        x += len + gap
      }
      c.stroke(p, with: .color(rgb(150, 165, 230, 0.12 + 0.18 * u)), lineWidth: 0.5 + u * 0.9)
      guard dim > 0 else { continue }
      var r = Seq(UInt32(100 + k))
      let width = (4 + u * 30) * rough, count = 3 + Int((u * 7).rounded())
      for _ in 0..<count {
        let dx = (r.next() * 2 - 1) * width
        let fl = 0.5 + 0.5 * sin(t * (2 + r.next() * 4) + r.next() * 6)
        let a = (1 - abs(dx) / width) * fl * dim
        let l = 1.5 + u * 6 * (0.5 + r.next())
        guard a >= 0.08 else { continue }
        c.fill(Path(CGRect(x: mx + dx - l / 2, y: y - 0.6 - u * 0.4, width: l, height: 0.9 + u * 1.1)),
               with: .color(rgb(255, 236, 190, a)))
      }
    }
  }
}
