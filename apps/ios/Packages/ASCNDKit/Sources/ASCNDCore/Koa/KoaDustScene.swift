import Foundation

// MARK: - Dọn bụi (storyboard động cảnh B, Kiệt duyệt 06/11)
//
// Chép từ kịch bản storyboard `animb3.py` của Agent B (dựng lại từ lịch sử phiên 08/11, thư mục nháp đã mất):
// lau kệ ba tầng → nhảy hai nhịp sang lau bảng kỷ lục → phủi cây bằng chổi lông → chổi cán dài quét mạng nhện, mạng
// nhện rơi trúng đầu, lắc đầu hất ra → nhảy lên bục trượt khăn hình số 8 (cắt sang góc 3/4 trên cao) → đổ nước lau nhà
// vào xô, bọt trào ngập phòng → bọt tan, phòng sạch, bọt dính đầy Koa → xoay tít hoá lốc xoáy → chóng mặt, sao bay →
// sạch bong, nháy mắt → khép vòng tròn. Phần mở đầu (hạt bụi rơi trúng mũi, hắt xì, nhờ ghi bữa sáng) là thẻ "Koa nhờ"
// trong app: đoạn diễn bắt đầu lúc Koa nhảy mừng, như các món của cảnh A.
extension KoaRepairScene {
  public enum DustRegion: Sendable, Hashable { case shelf, board, plant, web, stage }

  public struct DustState: Sendable, Hashable {
    /// Giây của storyboard (lớp vẽ tính bọt, hạt bụi, lấp lánh theo đó — tất định).
    public var t = 0.0
    /// Màng xám cả phòng 0…0,27 và độ sạch sau khi bọt tan 0…1.
    public var grey = 0.0, clean = 0.0
    /// Đang lau chỗ nào; chỗ khăn / chổi (toạ độ phòng) — vết sạch tích lại theo các khung trước.
    public var wipe: DustRegion?
    public var paw: Pt?
    /// Mạng nhện góc bảng còn treo; mạng nhện rơi (tâm, góc, mờ).
    public var webOn = true
    public var webFall: Pt?
    public var webAngle = 0.0, webAlpha = 0.0
    /// Lá cây lắc theo cú phủi (độ) và bụi còn trên lá 0…1.
    public var plantSway = 0.0, plantDust = 1.0
    /// Xô (cỡ 0…1), bọt sủi trên miệng xô (giây kể từ lúc đổ xong), dòng nước từ bình.
    public var bucket = 0.0
    public var bubbling: Double?
    public var pour = false
    /// Bọt dính trên người Koa 0…1.
    public var foamOnKoa = 0.0
    /// Xoay tít: góc (độ) và tiến độ; đoạn nhanh nhất thành lốc xoáy.
    public var spin: Double?
    public var spinU = 0.0
    public var tornado = false
    /// Sao bay quanh đầu khi chóng mặt (tiến độ).
    public var stars: Double?
    /// Hai miếng khăn dưới chân (trượt trên bục).
    public var pads = false
    /// Góc 3/4 trên cao: vị trí trên hình số 8 (đơn vị bán kính) và pha.
    public var high: Pt?
    public var highPhase = 0.0
    /// Lấp lánh khắp phòng (giây kể từ lúc sạch) và vòng tròn khép quanh mặt (0…1).
    public var twinkle: Double?
    public var iris: Double?
  }

  public enum Dust {
    /// Mốc thời gian của storyboard (giây).
    public static let T: [String: Double] = [
      "mote": 0.5, "inhale": 1.55, "choo": 2.35, "look": 2.9, "ask": 3.8, "tap": 6.9, "yay": 7.35, "down": 8.2, "shelf": 8.95,
      "shelf_end": 11.0, "go_board": 11.05, "board": 12.05, "board_end": 13.4, "plant": 13.45, "plant_end": 15.0, "web": 15.05,
      "web_end": 16.7, "webfall": 16.0, "onhead": 16.75, "shake": 17.05, "up": 17.65, "skate": 18.4, "top0": 18.65,
      "top1": 20.75, "skate_end": 21.0, "fin": 21.1, "bottle": 21.5, "pour": 21.8, "pour_end": 22.6, "erupt": 23.0,
      "full": 24.0, "dissolve": 24.5, "reveal": 25.4, "spin": 26.0, "spin_end": 26.9, "dizzy_end": 27.7, "done": 27.7,
      "wink": 29.6, "end": 31.0,
    ]
    static func T(_ k: String) -> Double { T[k]! }
    /// Đoạn trong app bắt đầu lúc Koa nhảy mừng (phần nhờ đã ở thẻ "Koa nhờ").
    public static let start = 6.9 + 4.0 / 30
    public static var duration: Double { T("end") - start }

    /// Tầng kệ đang lau: (từ, đến, tầng) — trên (có cận cảnh) → giữa → dưới.
    static let rows: [(Double, Double, Int)] = [(8.95, 9.95, 0), (9.95, 10.5, 1), (10.5, 11.0, 2)]
    /// Chỗ Koa đứng trên sàn (px ảnh phòng).
    static let shelfX = 520.0, boardX = 900.0, plantX = 1000.0, webX = 960.0
    /// Đồ vật (px ảnh phòng): tâm tán lá, mạng nhện ở góc bảng kỷ lục, xô.
    public static let plantPx = (x: 1060.0, y: 1735.0)
    public static let webPx = (x: 1258.0, y: 1400.0)
    public static let bucketPx = (x: 800.0, y: 1996.0)
    /// Vùng bụi bám (px ảnh): kệ, bảng kỷ lục; mặt bục là elip quanh (616, 2010).
    public static let shelfRegionPx = (x: 8.0, y: 1425.0, w: 400.0, h: 470.0)
    public static let boardRegionPx = (x: 900.0, y: 1425.0, w: 350.0, h: 215.0)
    /// Góc 3/4 trên cao: tâm mặt bục, bán trục, độ dày thành (px khung màn 1260 × 2736).
    public static let high = (cx: 640.0, cy: 1560.0, rx: 600.0, ry: 270.0, th: 95.0)
    public static func highPos(_ fx: Double, _ fy: Double) -> (x: Double, y: Double) {
      (high.cx + 0.72 * high.rx * fx, high.cy + 0.72 * high.ry * 2 * fy)
    }

    static let yay = Line("Để tớ dọn!", key: "koa.repair.dust.yay", at: 7.35 + 0.35)
    static let oops = Line("Hì… không sao!", key: "koa.repair.dust.oops", at: 17.05 + 0.5)
    static let done = Line("Sạch bong rồi nè!", key: "koa.repair.dust.done", at: 27.7 + 0.45)

    /// Tiếng (giây tính từ đầu đoạn trong app).
    public static var cues: [Cue] {
      var c: [(Double, String, Double)] = []
      for l in [yay, oops, done] {
        for (i, r) in l.syllables.enumerated() { c.append((r.lowerBound, "koa-talk-\((i * 7 + l.text.count) % 10 + 1)", 0.55)) }
      }
      c += [(T("tap") + 0.45, "koa-coin", 0.6), (T("yay"), "koa-v-yay", 0.7), (T("yay") + 0.8, "koa-rustle", 0.6),
            (T("down") + 0.1, "koa-hop", 0.6), (T("down") + 0.6, "koa-land", 0.6)]
      for k in 0..<6 { c.append((T("shelf") + 0.15 + Double(k) * 0.36, "koa-sweep", 0.5)) }
      for k in 0..<2 {
        c.append((T("go_board") + 0.1 + Double(k) * 0.48, "koa-hop", 0.4))
        c.append((T("go_board") + 0.42 + Double(k) * 0.48, "koa-step-wood-1", 0.5))
      }
      for k in 0..<5 { c.append((T("board") + 0.15 + Double(k) * 0.36, "koa-sweep", 0.5)) }
      c += [(9.5, "koa-coin", 0.6), (T("plant") + 0.1, "koa-rustle", 0.6)]
      for k in 0..<3 { c.append((T("plant") + 0.4 + Double(k) * 0.45, "koa-rustle", 0.5)) }
      c.append((T("web") + 0.15, "koa-rustle", 0.5))
      for k in 0..<2 { c.append((T("web") + 0.45 + Double(k) * 0.6, "koa-sweep", 0.5)) }
      c += [(T("webfall"), "koa-v-hm", 0.5), (T("onhead"), "koa-v-oi", 0.9), (T("shake"), "koa-v-nonono", 0.6),
            (T("top0"), "koa-sweep", 0.7), (T("top1") - 0.05, "koa-sweep", 0.6), (T("fin") + 0.12, "koa-land", 0.6),
            (T("bottle"), "koa-rustle", 0.6)]
      for k in 0..<5 { c.append((T("pour") + 0.25 + Double(k) * 0.1, "koa-boop-\(k % 3 + 1)", 0.35)) }
      for k in 0..<4 { c.append((T("pour_end") + Double(k) * 0.1, "koa-boop-\((k + 1) % 3 + 1)", 0.45)) }
      c += [(T("erupt"), "koa-sweep", 0.9), (T("erupt") + 0.05, "koa-v-oi", 0.9), (T("erupt") + 0.4, "koa-sweep", 0.7)]
      for k in 0..<8 { c.append((T("dissolve") + Double(k) * 0.11, "koa-tick", 0.35)) }
      c += [(T("dissolve") + 0.7, "koa-v-hm", 0.6), (T("spin"), "koa-sweep", 0.9), (T("spin") + 0.3, "koa-sweep", 0.7),
            (T("spin") + 0.6, "koa-sweep", 0.8), (T("spin_end"), "koa-land", 0.5), (T("spin_end") + 0.15, "koa-bird", 0.6),
            (T("dizzy_end") + 0.1, "koa-v-giggle", 0.6), (T("wink"), "koa-boop-2", 0.6),
            (T("up") + 0.1, "koa-hop", 0.6), (T("up") + 0.6, "koa-land", 0.6)]
      for k in 0..<5 { c.append((T("skate") + Double(k) * 0.42, "koa-sweep", 0.45)) }
      c += [(T("skate") + 0.3, "koa-v-giggle", 0.5), (T("done") + 0.2, "koa-coin", 0.6), (T("done") + 0.3, "koa-cheer", 0.6)]
      return c.filter { $0.0 >= start }.map { Cue(t: $0.0 - start, name: $0.1, volume: $0.2) }.sorted { $0.t < $1.t }
    }

    /// Cả đoạn: chuyển động phụ, rồi chỗ khăn / chổi đo từ bàn tay thật và mạng nhện rơi lên đỉnh đầu thật.
    public static func shots(fps: Double = 30) -> [Shot] {
      var out = (0..<Int(duration * fps)).map { shot(at: Double($0) / fps) }
      secondary(&out, fps: fps)
      for i in out.indices {
        let t = Double(i) / fps + start
        var s = out[i]
        switch s.dust.wipe {
        case .shelf?, .board?:
          if let p = paw(s, t: t) { s.dust.paw = local(s, p.x, p.y) }
        case .plant?: s.dust.paw = Pt(roomX(plantPx.x + 60 * sin(t * 9)), roomY(plantPx.y - 30))
        case .web?: s.dust.paw = Pt(roomX(webPx.x - 70), roomY(webPx.y + 55))
        case .stage?: s.dust.paw = Pt(s.x, s.feet + 6 + 4 / pxPerUnit)
        case nil: break
        }
        if T("webfall") <= t, t < T("shake") + 0.6, let top = KoaRender.anchors(options(s, t: t))["head_top_fur"] {
          let head = local(s, top.x, top.y)
          if t < T("onhead") {
            let u = ease(seg(t, T("webfall"), T("onhead")))
            s.dust.webFall = Pt(lerp(roomX(webPx.x - 60), head.x, u) + 25 / pxPerUnit * sin(u * 9),
                                lerp(roomY(webPx.y + 50), head.y + 10 / pxPerUnit, u * u))
            s.dust.webAngle = 30 * sin(u * 7); s.dust.webAlpha = 0.95
          } else if t < T("shake") + 0.15 {
            s.dust.webFall = Pt(head.x, head.y + 30 / pxPerUnit); s.dust.webAngle = 0; s.dust.webAlpha = 0.95
          } else {
            let u = seg(t, T("shake") + 0.15, T("shake") + 0.6)
            s.dust.webFall = Pt(head.x + 260 / pxPerUnit * u, head.y + (30 - 220 * u + 300 * u * u) / pxPerUnit)
            s.dust.webAngle = 200 * u; s.dust.webAlpha = 1 - u
          }
        }
        out[i] = s
      }
      return out
    }

    /// Một khung, `t` tính từ đầu đoạn trong app.
    public static func shot(at time: Double) -> Shot {
      let t = time + start
      var s = Shot()
      var px = stagePx.x, feet = stagePx.feet, w = stagePx.w, lift = 0.0
      var exprs: [(Double, KoaFlags.Expression)] = [(0, .content)]
      var p = KoaWalk.Pose()
      p.weight = 1
      var d = DustState()
      d.t = t
      s.blink = blink(t, [T("shelf") - 0.1, T("board") - 0.1, T("done") + 1.6])
      if t < T("down") {                                  // trên bục: mừng, "Để tớ dọn!", rút khăn
        exprs = [(0, .delighted), (T("yay") + 0.35, .happy)]
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        let h = hop(t, T("tap") + 0.45, 0.07, 0.28, 50)
        lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
        s.mouth = yay.mouth(at: t)
        if t >= T("yay") + 0.8 {
          let k = backOut(seg(t, T("yay") + 0.8, T("yay") + 1.05))
          s.prop = .cloth(angle: -20, scale: k); p.armRight = -40 * k
        }
        let a = ease(seg(t, T("yay") + 0.3, T("yay") + 0.5)) * (1 - seg(t, T("down") - 0.1, T("down") + 0.1))
        if a > 0 { s.bubble = yay.bubble(at: t, x: roomX(330), y: roomY(1090), width: 380 / pxPerUnit, alpha: a) }
      } else if t < T("go_board") {                       // xuống sàn, lau kệ ba tầng
        exprs = [(0, .happy), (T("shelf"), .focus)]
        if t < T("shelf") {
          let h = hop(t, T("down"), 0.12, 0.5, 0)
          let u = seg(t, T("down") + 0.12, T("down") + 0.62)
          px = lerp(stagePx.x, shelfX, ease(u)); w = lerp(stagePx.w, floorPx.w, ease(u))
          feet = lerp(stagePx.feet, floorPx.feet, ease(u)) - (h.phase == .air ? 150 * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -60; p.armLeft = 60 * sin(.pi * u)
          p.left.lift = h.phase == .air ? 10 : 0; p.right.lift = p.left.lift
          s.prop = .cloth(angle: -20, scale: 1)
        } else {
          px = shelfX; feet = floorPx.feet; w = floorPx.w; s.flip = true
          let v = (t - T("shelf")) * 2 * .pi * 1.4
          let row = rows.first { t < $0.1 }?.2 ?? 2
          let base = [-112.0, -82, -52][row]
          p.armRight = base + 16 * sin(v); p.armLeft = -6; p.turn = 0.32; p.sway = 2 + 2 * sin(v)
          p.bob = 2 * abs(sin(v)) - 4 * Double(row); p.lean = 3 * Double(row)
          s.gaze = .init(x: 0.5, y: 0.2 * Double(row) - 0.2, k: 1)
          s.prop = .cloth(angle: -30, scale: 1); d.wipe = .shelf
        }
      } else if t < T("plant") {                          // nhảy hai nhịp sang bảng kỷ lục, lau
        exprs = [(0, .happy), (T("board"), .focus)]
        feet = floorPx.feet; w = floorPx.w
        if t < T("board") {
          let k = t < T("go_board") + 0.48 ? 0.0 : 1.0
          let h = hop(t, T("go_board") + 0.48 * k, 0.08, 0.36, 60)
          let x0 = lerp(shelfX, boardX, k / 2), x1 = lerp(shelfX, boardX, (k + 1) / 2)
          let u = seg(t, T("go_board") + 0.48 * k + 0.08, T("go_board") + 0.48 * k + 0.44)
          px = lerp(x0, x1, ease(u)); lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.turn = 0.6; p.armRight = -40
          p.left.lift = h.phase == .air ? 8 : 0; p.right.lift = p.left.lift
          s.prop = .cloth(angle: -20, scale: 1)
        } else {
          px = boardX
          let v = (t - T("board")) * 2 * .pi * 1.4
          lift = 18 * max(0, sin(v))                      // nhón lên với tới bảng
          p.armRight = -132 + 18 * sin(v); p.armLeft = -8; p.turn = 0.32; p.sway = 2 * sin(v)
          p.left.lift = 4 * max(0, sin(v)); p.right.lift = p.left.lift
          s.gaze = .init(x: 0.5, y: -0.7, k: 1)
          s.prop = .cloth(angle: -10, scale: 1); d.wipe = .board
        }
      } else if t < T("web") {                            // bước sang chậu cây, phủi lá bằng chổi lông
        exprs = [(0, .happy), (T("plant") + 0.35, .focus)]
        feet = floorPx.feet; w = floorPx.w
        let u = seg(t, T("plant"), T("plant") + 0.35)
        px = lerp(boardX, plantX, ease(u))
        let v = (t - T("plant")) * 2 * .pi * 2.2
        let pat = t >= T("plant") + 0.35
        p.armRight = pat ? -70 + 22 * sin(v) : -40; p.armLeft = -6; p.turn = pat ? 0.35 : 0.5
        p.left.lift = u < 1 ? 8 * sin(.pi * u) : 0; p.bob = pat ? 2 * abs(sin(v)) : 0
        s.gaze = .init(x: 0.5, y: 0.25, k: 1)
        s.prop = .duster(angle: pat ? -30 + 18 * sin(v) : -10, scale: backOut(seg(t, T("plant") - 0.1, T("plant") + 0.15)), length: 110)
        d.wipe = pat ? .plant : nil
      } else if t < T("up") {                             // chổi cán dài quét mạng nhện → rơi trúng đầu
        feet = floorPx.feet; w = floorPx.w
        let u = seg(t, T("web"), T("web") + 0.35)
        px = lerp(plantX, webX, ease(u))
        if t < T("webfall") {
          exprs = [(0, .happy), (T("web") + 0.4, .focus)]
          let v = (t - T("web") - 0.4) * 2 * .pi * 1.6
          p.armRight = -128 + 12 * sin(v); p.armLeft = -10; p.turn = 0.3
          s.gaze = .init(x: 0.8, y: -0.6, k: 1)
          s.prop = .duster(angle: -18 + 10 * sin(v), scale: backOut(seg(t, T("web"), T("web") + 0.3)), length: 0)
          d.wipe = t >= T("web") + 0.4 ? .web : nil
        } else if t < T("onhead") {
          exprs = [(0, .happy)]
          s.gaze = .init(x: 0.5, y: -0.8, k: 1)
          p.armRight = -128; p.armLeft = -10; p.turn = 0.3
          s.prop = .duster(angle: -18, scale: 1, length: 0)
        } else if t < T("shake") {                        // mạng nhện chụp xuống đầu: hốt hoảng
          exprs = [(0, .yikes)]
          lift = hop(t, T("onhead"), 0, 0.18, 22).lift
          p.armRight = -40; p.armLeft = 40
        } else {                                          // lắc đầu hất mạng nhện ra
          exprs = [(0, .oof), (T("shake") + 0.5, .sheepish)]
          s.mouth = oops.mouth(at: t)
          let a = ease(seg(t, T("shake") + 0.45, T("shake") + 0.65)) * (1 - seg(t, T("up") - 0.1, T("up")))
          if a > 0 { s.bubble = oops.bubble(at: t, x: roomX(700), y: roomY(1290), width: 420 / pxPerUnit, alpha: a) }
          let k = seg(t, T("shake"), T("shake") + 0.5), w3 = sin(k * 2 * .pi * 3) * (1 - k)
          p.headLag = 6 * w3; p.earLag = 14 * w3; p.sway = 3 * w3
        }
      } else if t < T("fin") {                            // lên bục, trượt khăn hình số 8
        exprs = [(0, .happy), (T("skate"), .grin)]
        if t < T("skate") {
          let h = hop(t, T("up"), 0.12, 0.5, 0)
          let u = seg(t, T("up") + 0.12, T("up") + 0.62)
          px = lerp(webX, 820, ease(u)); w = lerp(floorPx.w, stagePx.w, ease(u))
          feet = lerp(floorPx.feet, stagePx.feet, ease(u)) - (h.phase == .air ? 120 * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -150 * sin(.pi * u); p.armLeft = 150 * sin(.pi * u)
          p.left.lift = h.phase == .air ? 10 : 0; p.right.lift = p.left.lift
        } else {
          let u = t - T("skate"), sw = sin(u * 2 * .pi * 0.8)
          let ph = u / (T("skate_end") - T("skate")) * 2 * .pi + 0.6
          let fx = sin(ph), fy = sin(2 * ph) / 2           // số 8 trên mặt bục (đơn vị bán kính)
          px = 616 + 380 * fx; feet = stagePx.feet + 50 * fy
          p.armRight = -62 + 12 * sw; p.armLeft = 62 + 12 * sw; p.sway = 6 * sw; p.shift = 5 * sw; p.bob = -3
          p.turn = 0.25 * sw; p.left.lift = max(0, 4 * sw); p.right.lift = max(0, -4 * sw)
          if T("top0") <= t, t < T("top1") {              // góc 3/4 trên cao: người quay theo hướng trượt
            let dx = cos(ph), dy = cos(2 * ph) + 1e-6
            p.turn = 0.85 * dx / (dx * dx + dy * dy).squareRoot()
            d.high = Pt(fx, fy); d.highPhase = ph
          }
          d.pads = true; d.wipe = .stage
        }
      } else if t < T("done") {                           // nước lau nhà → xô → bọt ngập phòng → sạch, bọt dính Koa → xoay tít
        let kx = 560.0, xEnd = 616 + 380 * sin(2 * .pi + 0.6)
        px = lerp(xEnd, kx, eout(seg(t, T("fin"), T("fin") + 0.4)))
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        if t < T("bottle") {                              // dừng trượt, quay sang xô vừa kéo tới
          exprs = [(0, .happy)]
          p.turn = 0.4 * ease(seg(t, T("fin") + 0.2, T("bottle"))); p.lean = -8 * (1 - ease(seg(t, T("fin"), T("fin") + 0.4)))
        } else if t < T("pour_end") {                     // rút bình, tinh nghịch, đổ vào xô
          exprs = [(0, .tease), (T("pour"), .focus)]
          let pu = ease(seg(t, T("pour"), T("pour") + 0.3))
          p.turn = 0.4; p.armRight = lerp(-30, -108, pu); p.armLeft = -6
          s.gaze = .init(x: 0.6, y: 0.5, k: 1)
          s.prop = .bottle(angle: lerp(10, 168, pu), scale: backOut(seg(t, T("bottle"), T("bottle") + 0.25)))
          d.pour = T("pour") + 0.25 <= t && t < T("pour_end") - 0.05
        } else if t < T("erupt") {                        // xô sủi lục bục: ghé nhìn
          exprs = [(0, .surprised)]
          p.turn = 0.4; p.lean = 6 * ease(seg(t, T("pour_end"), T("erupt"))); p.armRight = -30
          s.gaze = .init(x: 0.6, y: 0.6, k: 1); s.gesture = .curious; s.gestureAmount = ease(seg(t, T("pour_end"), T("pour_end") + 0.2))
          s.prop = .bottle(angle: 30, scale: 1)
        } else if t < T("dissolve") {                     // bọt trào: giật nảy, giơ tay
          exprs = [(0, .yikes)]
          let h = hop(t, T("erupt"), 0.05, 0.3, 60)
          lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
          px = kx - 60 * ease(seg(t, T("erupt"), T("erupt") + 0.35))
          p.armRight = -150; p.armLeft = 150; p.earLag = -10
        } else {
          px = kx - 60
          if t < T("spin") {                              // lộ ra: bọt đầy mặt, ngơ ngác, khuỵu lấy đà
            exprs = [(0, .oof), (T("dissolve") + 0.6, .sheepish), (T("reveal") + 0.2, .oof)]
            d.foamOnKoa = 1
            if t >= T("reveal") + 0.2 {
              let u = ease(seg(t, T("reveal") + 0.2, T("spin")))
              s.stretchY = 1 - 0.09 * u; s.stretchX = 1 + 0.05 * u
              p.armRight = 30 * u; p.armLeft = -30 * u
            }
          } else if t < T("spin_end") {                   // xoay kiểu hoạt hình → lốc xoáy (bóng mờ) → hãm, vượt đà
            let u = seg(t, T("spin"), T("spin_end"))
            exprs = [(0, .oof)]
            let a = 1080 * (1 - pow(1 - u, 2.2)), c = cos(a * .pi / 180)
            s.stretchX = max(0.14, abs(c)); s.flip = c < 0
            d.spin = a; d.spinU = u; d.tornado = 0.18 < u && u < 0.82
            s.stretchY = 1 + 0.06 * sin(.pi * u)
            p.turn = 0.9 * sin(a * .pi / 180); p.armRight = -100; p.armLeft = 100; p.earLag = 14; p.bob = 6
            d.foamOnKoa = 1 - ease(min(1, u * 1.4))
          } else {                                        // hãm lại: lảo đảo, mắt xoắn ốc, sao bay quanh đầu
            let u = seg(t, T("spin_end"), T("dizzy_end"))
            exprs = [(0, .dizzy)]
            let q = 1 - 0.1 * exp(-8 * u) * cos(2 * .pi * 3 * u)
            s.stretchY = q; s.stretchX = 2 - q
            let w1 = sin(u * 2 * .pi * 1.6) * (1 - u * 0.7)
            p.sway = 9 * w1; p.headLag = 4 * sin(u * 2 * .pi * 1.6 + 1) * (1 - u * 0.7); p.turn = 0.25 * sin(u * 2 * .pi * 1.6)
            d.stars = u
          }
        }
      } else {                                            // sạch bong → nháy mắt → khép vòng tròn
        exprs = [(0, .delighted), (T("wink"), .happytired)]
        px = 500
        s.gesture = .taDa; s.gestureAmount = backOut(seg(t, T("done") + 0.2, T("done") + 0.5))
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        s.mouth = done.mouth(at: t)
        s.prop = .cloth(angle: 20, scale: 1)
        d.twinkle = t - (T("done") + 0.3)
        let a = ease(seg(t, T("done") + 0.35, T("done") + 0.6)) * (1 - seg(t, T("wink"), T("wink") + 0.3))
        if a > 0 { s.bubble = done.bubble(at: t, x: roomX(330), y: roomY(1020), width: 600 / pxPerUnit, alpha: a) }
        if t >= T("wink") + 0.35 { d.iris = seg(t, T("wink") + 0.35, T("end") - 0.15) }
      }
      face(&s, t, exprs)
      s.pose = p
      // phòng: màng xám rút dần theo từng chỗ đã sạch; bọt tan thì sạch hết
      d.clean = ease(seg(t, T("dissolve"), T("dissolve") + 0.9))
      let prog = 0.35 * seg(t, T("shelf"), T("shelf_end")) + 0.3 * seg(t, T("board"), T("board_end")) + 0.2 * seg(t, T("skate"), T("skate_end"))
      d.grey = 0.27 * (1 - prog) * (1 - d.clean)
      d.webOn = t < T("webfall")
      if T("plant") <= t, t < T("web") + 1.0 {
        let n = Int(max(0, min(t, T("plant_end")) - T("plant") - 0.35) * 2.2) + 1
        d.plantSway = (0..<n).reduce(0.0) { $0 + settle(t, T("plant") + 0.35 + Double($1) / 2.2, 3.2, 3.5, 5) }
      }
      d.plantDust = 1 - (t >= T("plant") ? seg(t, T("plant") + 0.35, T("plant_end")) : 0)
      if t >= T("fin") {
        d.bucket = backOut(seg(t, T("fin") + 0.1, T("fin") + 0.4))
        if T("pour_end") <= t, t < T("erupt") + 0.4 { d.bubbling = t - T("pour_end") }
      }
      s.dust = d
      let onStage = clamp((w - floorPx.w) / (stagePx.w - floorPx.w))
      s.x = roomX(px) + koaShift.x * onStage
      s.feet = roomY(feet - lift) - 6 + koaShift.y * onStage   // hero vẽ chân thấp hơn `y` 6 đơn vị
      s.lift = lift / pxPerUnit
      s.scale = w / stagePx.w
      s.camera = camera(t)
      s.repaired = t >= T("dissolve") + 0.9
      return s
    }

    /// Góc máy — mỗi góc một lý do (xem storyboard): (giây, zoom, tâm x, tâm y) px ảnh.
    static let cam: [(Double, Double, Double, Double)] = [
      (6.95, 1.0, 630, 1368), (8.2, 1.0, 630, 1368),
      (8.9, 1.35, 380, 1620), (9.2, 1.35, 380, 1620),        // sang kệ: thấy trọn Koa và cả kệ
      (9.3, 2.4, 380, 1590), (9.9, 2.4, 380, 1590),          // CẬN CẢNH đúng chỗ khăn đang lau
      (10.0, 1.35, 380, 1620), (11.0, 1.35, 380, 1620), (11.3, 1.35, 380, 1620),
      (11.55, 1.55, 960, 1600), (13.4, 1.55, 960, 1600), (13.5, 1.55, 960, 1600),    // lia nhanh sang bảng kỷ lục
      (13.72, 1.95, 1040, 1720), (15.0, 1.95, 1040, 1720), (15.15, 1.95, 1040, 1720), // đẩy vào chậu cây
      (15.45, 1.5, 1060, 1560), (16.7, 1.5, 1060, 1560),    // lùi: Koa, cán chổi, mạng nhện
      (16.85, 2.0, 960, 1620), (17.6, 2.0, 960, 1620),      // mạng nhện chụp trúng đầu: cận mặt
      (18.1, 1.0, 630, 1368), (21.1, 1.0, 630, 1368),       // toàn cảnh: lên bục, trượt khăn
      (21.5, 1.4, 680, 1720), (23.0, 1.4, 680, 1720),       // cận trung Koa + xô
      (23.1, 1.0, 630, 1368), (25.0, 1.0, 630, 1368),       // bọt trào: toàn cảnh
      (25.3, 1.9, 520, 1640), (25.85, 1.9, 520, 1640),      // bọt tan: mặt Koa đầy bọt
      (26.05, 1.3, 540, 1650), (26.9, 1.3, 540, 1650),      // lùi cho cú xoay
      (27.1, 1.55, 520, 1560), (27.7, 1.55, 520, 1560),     // đẩy nhanh vào mặt chóng mặt
      (28.2, 1.15, 600, 1500), (31.0, 1.15, 600, 1500),     // kéo ra: phòng sạch bong
    ]
    static let snaps: Set<Double> = [9.3, 16.85, 23.1, 25.3, 27.1]

    static func camera(_ t: Double) -> Camera {
      var k = 0
      while k + 1 < cam.count, cam[k + 1].0 <= t { k += 1 }
      let a = cam[k], b = cam[min(k + 1, cam.count - 1)]
      let u = b.0 == a.0 ? 0 : clamp((t - a.0) / (b.0 - a.0))
      let e = snaps.contains(b.0) ? eout(u) : ease(u)
      var c = Camera()
      // máy nghiêng: bọt trào ngập phòng, mạng nhện chụp trúng đầu — khoảnh khắc "mất kiểm soát"
      c.roll = -7 * sin(.pi * seg(t, T("erupt"), T("dissolve") + 0.3)) + 5 * sin(.pi * seg(t, T("onhead"), T("shake") + 0.5))
      c.zoom = lerp(a.1, b.1, e) * (1 + 0.025 * abs(c.roll))
      c.x = roomX(lerp(a.2, b.2, e)); c.y = roomY(lerp(a.3, b.3, e))
      let sh = settle(t, T("erupt"), 14, 8, 6) + settle(t, T("spin_end"), 8, 7, 9) + settle(t, T("down") + 0.62, 6, 9, 12)
        + settle(t, T("up") + 0.62, 6, 9, 12)
      c.shake = sh / pxPerUnit
      return c
    }
  }
}
