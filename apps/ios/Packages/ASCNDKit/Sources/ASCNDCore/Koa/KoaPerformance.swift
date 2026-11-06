import Foundation

/// Koa diễn một cú quay liền (05/11 lần 4, Kiệt: "mọi chuyển động chưa có sự liên kết với nhau").
///
/// Bản trước ghép các dáng có sẵn (cầm tạ, ngồi, `cheer`) rồi đổi qua lại: dù có nén / nảy vẫn là từng khối rời.
/// Ở đây KHÔNG đổi dáng: một rig liên tục (`KoaWalk.Pose`: nhún, nghiêng, lắc, hai tay quanh vai, hai bàn chân,
/// tai; hướng nhìn của đầu; độ giơ tay chữ V qua `gestureAmount` của `cheer`) chạy theo keyframe trên MỘT dòng
/// thời gian. Lớp phụ tính tự động theo nguyên tắc hoạt hình:
/// - **theo đà / kéo trễ** (follow-through, drag): đầu, tai, tay là lò xo đuổi theo thân, nên khi thân dừng
///   chúng còn đi tiếp rồi mới lắng;
/// - **lệch nhịp** (overlapping action): mắt dẫn đầu, đầu dẫn thân, tay theo sau — không bộ phận nào chuyển cùng
///   lúc;
/// - **nén / giãn** theo vận tốc và gia tốc của thân (giãn khi bay lên, nén khi tiếp đất).
///
/// Mọi thứ nướng sẵn (`bake`) ở 120 Hz rồi tra theo thời gian, nên phát lại y hệt mỗi lần.
public enum KoaPerformance {
  public typealias Scene = KoaReaction.Scene

  public enum Ease: Sendable { case linear, inOut, out, `in`, back }

  public struct Key: Sendable {
    public let t: Double
    public let v: Double
    public let ease: Ease
    public init(_ t: Double, _ v: Double, _ ease: Ease = .inOut) { self.t = t; self.v = v; self.ease = ease }
  }

  /// Một kênh: các mốc, nội suy theo đường cong của mốc ĐẾN.
  public struct Track: Sendable {
    public let keys: [Key]
    public init(_ keys: [Key]) { self.keys = keys.sorted { $0.t < $1.t } }

    public func at(_ t: Double) -> Double {
      guard let first = keys.first else { return 0 }
      if t <= first.t { return first.v }
      for (a, b) in zip(keys, keys.dropFirst()) where t <= b.t {
        let p = (t - a.t) / max(1, b.t - a.t)
        return a.v + (b.v - a.v) * KoaPerformance.curve(b.ease, p)
      }
      return keys.last!.v
    }
  }

  static func curve(_ e: Ease, _ p: Double) -> Double {
    switch e {
    case .linear: p
    case .inOut: KoaReaction.ease(p)
    case .out: 1 - pow(1 - p, 3)
    case .in: p * p * p
    case .back: KoaReaction.backOut(p)
    }
  }

  /// Chữ / hiệu ứng hiện trong một khoảng.
  public struct Cue: Sendable {
    public let from: Double
    public let to: Double
    public let title: String?
    public let subtitle: String?
    public let chip: String?
    public let stats: [KoaReaction.Stat]
    public let effects: Set<KoaReaction.Effect>
    public let haptic: KoaReaction.Haptic
    init(
      _ from: Double, _ to: Double, title: String? = nil, subtitle: String? = nil, chip: String? = nil,
      stats: [KoaReaction.Stat] = [], effects: Set<KoaReaction.Effect> = [], haptic: KoaReaction.Haptic = .none
    ) {
      self.from = from; self.to = to; self.title = title; self.subtitle = subtitle; self.chip = chip; self.stats = stats
      self.effects = effects; self.haptic = haptic
    }
  }

  /// Kịch bản một cảnh: kênh chính (tay vẽ keyframe) + mặt + chữ.
  public struct Script: Sendable {
    public let ms: Double
    /// Thân nhún (đơn vị hình, dương = lên).
    var bob: Track
    /// Nghiêng tới (độ) / lắc ngang (độ).
    var lean: Track
    var sway: Track
    /// Tay quanh vai (độ): trái dương = giơ ra ngoài, phải âm = giơ ra ngoài.
    var armL: Track
    var armR: Track
    /// Hai tay chữ V (`cheer`) 0…1. KHÔNG dùng trong cảnh phản ứng: `cheer` vẽ lớp tay ĐÈ lên đầu (`armsFront`),
    /// nhảy ăn mừng thì cả cánh tay phủ lên hai má (Kiệt 06/11). Ăn mừng = tay rig dang ≤ `maxArmRaise`.
    var cheer: Track
    /// Tai cụp (độ, dương = cụp xuống).
    var ears: Track
    /// Hướng nhìn của đầu.
    var lookX: Track
    var lookY: Track
    /// Quay mặt 2.5D.
    var turn: Track
    /// Máy: độ phóng, tâm phóng (0 = mặt, 1 = cả người).
    var zoom: Track
    var focus: Track
    /// Run tay (nâng tạ nặng), biên độ độ.
    var tremble: Track
    /// Mặt theo thời gian (đổi dưới cú chớp của `KoaFigureView`).
    let faces: [(t: Double, e: KoaFlags.Expression)]
    /// Đồ cầm tay.
    let hand: String?
    let cues: [Cue]
    /// Chớp trắng lúc này (ms) — cú cắt có chủ ý duy nhất.
    let flashAt: Double?
    /// Cuối cảnh thu vào vòng đồng hồ nghỉ, từ mốc này.
    let ringFrom: Double?
    /// Tiếng theo nhịp (ms, tên `koa-rx-…`, độ to tương đối). Tối giản: mỗi nhịp diễn quan trọng một tiếng nhỏ.
    var sounds: [Sound] = []
  }

  public struct Sound: Sendable, Hashable {
    public let t: Double
    public let name: String
    public let gain: Double
  }

  /// Một khung đã tính: đưa thẳng cho `KoaFigureView`.
  public struct Frame: Sendable {
    public var walk = KoaWalk.Pose()
    public var look = (x: 0.0, y: 0.0)
    public var eyes = (x: 0.0, y: 0.0)
    public var turn = 0.0
    public var cheer = 0.0
    public var expression = KoaFlags.Expression.happy
    /// Nén / giãn cả hình (neo ở chân).
    public var sx = 1.0
    public var sy = 1.0
    /// Phần bay lên khỏi sàn (đơn vị hình), dời CẢ hình ra ngoài khung vẽ. Nhún trong khung giữ ≤ `inCanvasBob`:
    /// nhún lớn trong khung làm đầu / tai bị cắt bằng ở mép khung lúc nhảy (Kiệt 06/11: "khung khi koa nhảy lên").
    public var air = 0.0
    public var zoom = 1.0
    public var focus = 1.0
    public var ring = 0.0
    public var flash = 0.0
  }

  public static let hz = 120.0
  /// Nhún tối đa trong khung vẽ (đơn vị hình); phần cao hơn là `Frame.air`.
  public static let inCanvasBob = 6.0
  /// Hạ thân trong khung tối đa (đơn vị hình); sâu hơn là nén cả hình.
  public static let minCanvasBob = -3.0
  /// Đầu nghiêng theo đà tối đa (độ).
  public static let maxHeadLag = 4.0
  /// Nhìn thẳng thì `lean` / `sway` của dáng đi là nghiêng NGANG trên màn: quá ±1,5° Koa lệch sang một bên như
  /// què một chân (Kiệt 06/11). Mệt / lấy đà diễn bằng nhún, gục đầu, tai cụp.
  public static let maxTilt = 1.5
  /// 06/11 (lần 3, Kiệt: "giơ tay thấp quá nên không vui"): 110° (chữ V, tay sau má, không chèn mặt), nhờ tay đã lật (`flipRaisedArms`) và gốc vai nhấc
  /// dưới cằm (`KoaRender.shoulderTuck`). Lần 2: quá ~52° thì mép dưới cánh tay rời khỏi cạnh thân, lộ góc nách mà bản vẽ chưa từng vẽ (tay một mảnh
  /// vẽ để buông xuống). Giơ cao hơn cần vẽ thêm tay giơ — chờ Kiệt duyệt art.
  /// Trước đó: tay giơ quá chừng này (độ) là vòng ra SAU má: lớp đầu che tay, chỉ còn đồ cầm tay lòi ra ở mép má như cắm vào
  /// mặt (Kiệt 06/11). Vai (80 / 160, 178), tay dài ~68, má rộng tới x ≈ 40 / 200. Giơ cao hơn thì dùng dáng `cheer`
  /// (có lật hình tay để bàn tay hướng ra ngoài).
  public static let maxArmRaise = 110.0

  /// Nướng cả cảnh: kênh chính + lớp phụ (lò xo theo đà, lệch nhịp, nén / giãn).
  public static func bake(_ s: Script) -> [Frame] {
    let dt = 1000 / hz
    let n = Int((s.ms / dt).rounded()) + 1
    var out: [Frame] = []
    out.reserveCapacity(n)
    // lò xo: (giá trị, vận tốc)
    var head = (0.0, 0.0), ear = (0.0, 0.0), armLagL = (0.0, 0.0), armLagR = (0.0, 0.0)
    var prevBob = s.bob.at(0), prevVel = 0.0, prevLean = s.lean.at(0)
    func spring(_ st: inout (Double, Double), to target: Double, k: Double, damp: Double) {
      let h = dt / 1000
      let acc = k * (target - st.0) - damp * st.1
      st.1 += acc * h
      st.0 += st.1 * h
    }
    for i in 0..<n {
      let t = Double(i) * dt
      var f = Frame()
      let bob = s.bob.at(t), lean = s.lean.at(t)
      let vel = (bob - prevBob) / dt * 1000            // đơn vị hình / giây
      let acc = (vel - prevVel) / dt * 1000
      let leanVel = (lean - prevLean) / dt * 1000
      prevBob = bob; prevVel = vel; prevLean = lean
      // đầu: trễ theo thân (kéo ngược hướng chuyển động), lò xo vừa → vượt đà nhẹ rồi lắng
      spring(&head, to: -0.045 * vel - 0.35 * leanVel / 10, k: 180, damp: 16)
      // tai: mềm hơn đầu, trễ hơn
      spring(&ear, to: -0.09 * vel + head.0 * 1.4, k: 90, damp: 7)
      // tay: kéo trễ khi thân nhún (thân lên thì tay tụt lại, thân xuống thì tay văng lên)
      // (giới hạn ±22°: cú bật nhảy ~700 đơn vị / giây từng kéo tay văng gần 90°, test bắt 05/11)
      let drag = max(-22, min(22, 0.045 * vel))
      spring(&armLagL, to: drag, k: 120, damp: 11)
      spring(&armLagR, to: -drag, k: 120, damp: 11)
      let tremble = s.tremble.at(t)
      let shake = tremble * sin(t * 0.075) * sin(t * 0.031 + 1)
      f.walk.flipRaisedArms = true
      f.walk.lean = max(-maxTilt, min(maxTilt, lean))
      f.walk.sway = max(-maxTilt, min(maxTilt, s.sway.at(t)))
      f.walk.armLeft = min(maxArmRaise, s.armL.at(t) + armLagL.0)
      f.walk.armRight = max(-maxArmRaise, s.armR.at(t) + armLagR.0 + shake)
      // ±4°: nghiêng hơn thì lộ khe giữa cằm và vai lúc nhảy (Kiệt 06/11)
      f.walk.headLag = max(-maxHeadLag, min(maxHeadLag, head.0))
      f.walk.earLag = max(-14, min(14, ear.0))
      let ears = s.ears.at(t)
      f.walk.earLeft = ears; f.walk.earRight = ears
      // bay: hai bàn chân rời sàn đúng bằng phần thân nhún lên trên 6 đơn vị
      f.walk.bob = max(minCanvasBob, min(bob, inCanvasBob))
      f.air = max(0, bob - inCanvasBob)
      // ngồi xuống sâu hơn `minCanvasBob`: nén CẢ hình (kể cả bàn chân) thay vì hạ thân xuống giữa hai chân đứng yên —
      // hạ sâu thì vệt bóng chân (theo thân) lệch khỏi bàn chân, lộ hai vạch giữa hai chân (Kiệt 06/11)
      let crouch = min(0, bob - minCanvasBob)
      // lệch nhịp: đầu nhìn trước thân 70 ms, mắt trước đầu 70 ms
      f.look = (s.lookX.at(t + 70), s.lookY.at(t + 70))
      f.eyes = (s.lookX.at(t + 140), s.lookY.at(t + 140))
      f.turn = s.turn.at(t + 70)
      f.cheer = max(0, s.cheer.at(t - 60))             // tay chữ V theo sau thân 60 ms
      f.expression = s.faces.last { $0.t <= t }?.e ?? s.faces.first?.e ?? .happy
      // nén / giãn theo vận tốc (giãn khi bay) và gia tốc (nén khi tiếp đất)
      let stretch = max(-0.12, min(0.12, vel * 0.0011 - max(0, acc) * 0.000012))
      f.sy = (1 + stretch) * (1 + crouch * 0.008); f.sx = (1 - stretch * 0.6) * (1 - crouch * 0.005)
      f.zoom = s.zoom.at(t); f.focus = s.focus.at(t)
      if let r = s.ringFrom, t > r { f.ring = KoaReaction.ease(min(1, (t - r) / (s.ms - r))) }
      if let fl = s.flashAt, t >= fl, t < fl + 160 { f.flash = 1 - (t - fl) / 160 }
      out.append(f)
    }
    return out
  }

  static let cache = KoaMemo<String, [Frame]>(capacity: 8)

  public static func frames(_ scene: Scene) -> [Frame] { cache.value(scene.rawValue) { bake(script(scene)) } }

  public static func frame(_ scene: Scene, at t: Double) -> Frame {
    let fs = frames(scene)
    return fs[max(0, min(fs.count - 1, Int((t / 1000 * hz).rounded())))]
  }

  public static func duration(_ scene: Scene) -> Double { script(scene).ms }
  public static func cues(_ scene: Scene) -> [Cue] { script(scene).cues }

  /// Chữ thật của buổi vừa xong thay cho số mẫu (07/11: Kiệt duyệt storyboard xong buổi). Giữ nguyên mốc thời
  /// gian, hiệu ứng, rung của bản đã duyệt; chỉ đổi chữ. `gains == nil` (buổi thứ hai trong ngày, tập quá ngày
  /// liền) thì pháo giấy vẫn bắn nhưng không có dòng Gains.
  public static func cues(_ scene: Scene, content: KoaReaction.Content?) -> [Cue] {
    guard let content else { return cues(scene) }
    let all = cues(scene)
    let main = all.firstIndex { $0.title != nil && $0.stats.isEmpty }
    return all.enumerated().map { i, c in
      if i == main {
        return Cue(c.from, c.to, title: content.title, subtitle: content.subtitle, effects: c.effects, haptic: c.haptic)
      }
      if !c.stats.isEmpty { return Cue(c.from, c.to, stats: content.stats, effects: c.effects, haptic: c.haptic) }
      if c.title != nil {
        return Cue(c.from, c.to, title: content.gains?.title, subtitle: content.gains?.subtitle, effects: c.effects,
                   haptic: c.haptic)
      }
      return c
    }
  }
  public static func hand(_ scene: Scene) -> String? { script(scene).hand }
  public static func sounds(_ scene: Scene) -> [Sound] { script(scene).sounds.sorted { $0.t < $1.t } }

  static func S(_ t: Double, _ name: String, _ gain: Double = 1) -> Sound { Sound(t: t, name: "koa-rx-\(name)", gain: gain) }

  /// Tiếng của từng cảnh, khớp đúng nhịp diễn (Kiệt 05/11: tối giản, dễ chịu, sang, hợp storyboard).
  static let soundsOf: [Scene: [Sound]] = [
    .set: [S(0, "lift", 0.6), S(1600, "exhale", 0.8), S(1700, "set"), S(2700, "exhale", 0.45)],
    .record: [S(40, "lift", 0.9), S(860, "record"), S(1950, "whoosh", 0.8), S(1980, "sparkle", 0.8), S(2010, "gains", 0.7),
              S(2420, "land"), S(2950, "tick", 0.6), S(3150, "pump", 0.7), S(3620, "pump", 0.55)],
    .done: [S(0, "exhale", 0.8), S(1300, "inhale", 0.9), S(2950, "tick", 0.5), S(3550, "tick", 0.5), S(3700, "tick", 0.45),
            S(3850, "tick", 0.4), S(4850, "whoosh", 0.8), S(4860, "done"), S(4900, "sparkle", 0.7), S(5320, "land")],
  ]

  // MARK: - Kịch bản (số liệu mẫu)

  static func T(_ k: Key...) -> Track { Track(k) }
  static let zero = T(Key(0, 0))

  public static func script(_ scene: Scene) -> Script {
    var s = rawScript(scene)
    s.sounds = soundsOf[scene] ?? []
    return s
  }

  static func rawScript(_ scene: Scene) -> Script {
    switch scene {
    case .set:
      // 07/11 lần 2 (Kiệt: "biểu cảm xảy ra nhanh quá, story chưa có ý nghĩa; thay cho đồng hồ nghỉ cũ"): đây chỉ là
      // MỞ ĐẦU của màn nghỉ (`KoaRestStory`), mỗi nét mặt giữ ≥ 0,9 s. Rep cuối gồng đẩy tạ lên, run tay → giữ
      // đỉnh → hạ tạ thở "phù" → mệt, thở dốc, tai cụp. Sau đó màn nghỉ nối tiếp bằng nhịp thở cùng người dùng.
      Script(
        ms: 4200,
        bob: T(Key(0, 0), Key(500, -5), Key(1300, -6), Key(1700, 3, .out), Key(2100, -4), Key(2600, -7), Key(3400, -6),
               Key(4200, -6)),
        lean: T(Key(0, 0), Key(900, -0.6), Key(1700, 0.3), Key(2600, 1.0), Key(4200, 0.9)),
        sway: T(Key(0, 0), Key(2600, 0), Key(3200, 0.3), Key(3800, -0.2), Key(4200, 0)),
        armL: T(Key(0, 0), Key(900, 6), Key(1700, -4), Key(2600, -8), Key(4200, -8)),
        armR: T(Key(0, -6), Key(200, -12), Key(900, -95, .out), Key(1300, -98), Key(1900, -10, .inOut), Key(2300, 4),
                Key(4200, 6)),
        cheer: zero,
        ears: T(Key(0, 0), Key(900, -5), Key(1700, 4), Key(2600, 12), Key(4200, 13)),
        lookX: T(Key(0, 0.1), Key(900, 0.25), Key(1700, 0), Key(4200, 0)),
        lookY: T(Key(0, -0.2), Key(900, -0.45), Key(1300, -0.45), Key(1900, 0.15), Key(2600, 0.4), Key(4200, 0.35)),
        turn: T(Key(0, 0.15), Key(1700, 0), Key(4200, 0)),
        zoom: T(Key(0, 1.0), Key(1300, 1.04), Key(4200, 1.0)),
        focus: T(Key(0, 1), Key(4200, 1)),
        tremble: T(Key(0, 0), Key(800, 0), Key(950, 3), Key(1300, 3), Key(1400, 0)),
        faces: [(0, .grit), (1600, .puff), (2600, .pant)],
        hand: "dumbbell",
        cues: [Cue(1700, 4200, title: "XONG SET!", subtitle: "Squat · set 1/2", haptic: .success),
               Cue(2600, 4200, effects: [.sweat])],
        flashAt: nil, ringFrom: nil)
    case .record:
      // Nâng tạ nặng run tay → chạm đỉnh (chớp, cận mặt hét) → ngồi xuống lấy đà → bật nhảy chữ V → tiếp đất
      // nén → đấm tay lên trời hai nhịp, quay sang người xem.
      Script(
        ms: 4500,
        bob: T(Key(0, 0), Key(300, -6), Key(850, -8), Key(1000, 2, .out), Key(1450, 0), Key(1750, -13), Key(1950, 36, .out),
               Key(2200, 40), Key(2420, -10, .in), Key(2650, 3, .out), Key(2900, 0), Key(3300, -3), Key(3500, 2), Key(3800, -3),
               Key(4000, 1)),
        lean: T(Key(0, 0), Key(800, -1), Key(1100, -0.4), Key(1750, 1.2), Key(2000, -0.8), Key(2450, 1), Key(2800, 0)),
        sway: T(Key(0, 0), Key(2900, 0), Key(3300, 0.6), Key(3700, -0.4), Key(4100, 0.4)),
        armL: T(Key(0, 2), Key(800, 8), Key(1700, -20), Key(1850, -26), Key(2060, 110), Key(2220, 102.6), Key(2420, 85.5),
                Key(2620, 110), Key(2900, 30), Key(3200, 10), Key(4500, 6)),
        armR: T(Key(0, -8), Key(820, -49.7, .out), Key(1050, -50.8), Key(1600, -28.9, .inOut), Key(1800, 22),
                Key(2060, -110), Key(2220, -102.6), Key(2420, -85.5), Key(2620, -110), Key(2900, 0), Key(3000, 12), Key(3220, -110), Key(3340, -102.6), Key(3460, -80.6), Key(3560, -90.5),
                Key(3740, -110), Key(3860, -103.8), Key(4100, -88), Key(4500, -90.5)),
        cheer: zero,
        ears: T(Key(0, 0), Key(900, -6), Key(1100, -2), Key(2000, -8), Key(2600, 0)),
        lookX: T(Key(0, 0), Key(2900, 0), Key(3200, 0.45), Key(4500, 0.3)),
        lookY: T(Key(0, -0.3), Key(850, -0.45), Key(950, -0.65, .out), Key(1500, -0.3), Key(1750, 0.25), Key(2000, -0.4),
                 Key(2450, 0.1), Key(2800, -0.15), Key(4500, -0.2)),
        turn: T(Key(0, 0), Key(2900, 0), Key(3300, 0.45), Key(4500, 0.35)),
        zoom: T(Key(0, 1.05), Key(850, 1.3), Key(860, 2.05), Key(1350, 2.15), Key(1800, 0.92, .inOut), Key(2900, 0.95),
                Key(3600, 1.1), Key(4500, 1.12)),
        focus: T(Key(0, 1), Key(850, 1), Key(860, 0), Key(1350, 0), Key(1800, 1), Key(4500, 1)),
        tremble: T(Key(0, 0), Key(300, 4), Key(820, 7), Key(860, 0)),
        faces: [(0, .strain), (860, .roar), (1700, .delighted), (2900, .roar)],
        hand: "dumbbell",
        cues: [Cue(0, 850, effects: [.speedLines], haptic: .heavy),
               Cue(860, 1750, title: "KỶ LỤC MỚI!", subtitle: "82,5 kg × 5", effects: [.shake], haptic: .success),
               Cue(1950, 4500, effects: [.confetti]),
               Cue(2000, 2950, title: "+2,5 kg", subtitle: "so với lần trước", haptic: .soft),
               Cue(2950, 4500, chip: "🏆 Kỷ lục Squat")],
        flashAt: 860, ringFrom: nil)
    case .done:
      // Đứng thở dốc, tai cụp → hít một hơi thật sâu, đứng thẳng, tai dựng → liếc sang, quay lại nhếch mép (cận) →
      // khoe tay, số liệu đếm lên → ngồi lấy đà, nhảy chữ V ăn mừng.
      Script(
        ms: 7500,
        bob: T(Key(0, -8), Key(500, -6), Key(900, -9), Key(1300, -10), Key(1800, 6, .out), Key(2200, 2), Key(2600, 3),
               Key(3200, 0), Key(4400, 0), Key(4650, -13), Key(4850, 34, .out), Key(5100, 38), Key(5320, -9, .in),
               Key(5550, 2, .out), Key(5800, 0)),
        lean: T(Key(0, 1.2), Key(1300, 1.4), Key(1800, -0.6), Key(2300, 0), Key(4600, 1.2), Key(4900, -0.8), Key(5350, 0.8), Key(5700, 0)),
        sway: T(Key(0, 0), Key(400, 0.4), Key(800, -0.4), Key(1200, 0.3), Key(1700, 0), Key(3200, 0), Key(3600, 0.4), Key(4100, -0.4),
                Key(4400, 0)),
        armL: T(Key(0, -4), Key(1300, -6), Key(1800, 8), Key(2300, 2), Key(3200, 4), Key(3300, -8), Key(3560, 110),
                Key(3700, 102.6), Key(4400, 105.2),
                Key(4650, -24), Key(4880, 110), Key(5050, 103.8), Key(5320, 88), Key(5550, 110), Key(6200, 102.6), Key(6800, 110),
                Key(7500, 107.5)),
        armR: T(Key(0, 4), Key(1300, 6), Key(1800, -8), Key(2300, -2), Key(3200, -4), Key(3300, 8), Key(3560, -110),
                Key(3700, -102.6), Key(4400, -105.2),
                Key(4650, 24), Key(4880, -110), Key(5050, -103.8), Key(5320, -88), Key(5550, -110), Key(6200, -102.6), Key(6800, -110),
                Key(7500, -107.5)),
        cheer: zero,
        ears: T(Key(0, 14), Key(1300, 15), Key(1900, -6, .out), Key(2400, 0), Key(4600, -6), Key(5400, 0)),
        lookX: T(Key(0, 0), Key(1900, 0), Key(2300, -0.65), Key(2750, -0.55), Key(3000, 0.25, .out), Key(3600, 0.1),
                 Key(4400, 0)),
        lookY: T(Key(0, 0.45), Key(1300, 0.5), Key(1800, -0.25), Key(2300, 0), Key(3000, -0.2), Key(3600, -0.1),
                 Key(4650, 0.25), Key(4900, -0.4), Key(5400, 0)),
        turn: T(Key(0, 0), Key(2000, 0), Key(2400, -0.5), Key(2750, -0.45), Key(3050, 0.25), Key(3600, 0.1), Key(4400, 0)),
        zoom: T(Key(0, 0.95), Key(1300, 1.0), Key(2300, 1.2), Key(2800, 1.25), Key(3150, 1.9, .inOut), Key(3500, 1.95),
                Key(3900, 1.0, .inOut), Key(4400, 0.9), Key(6300, 0.95), Key(7500, 0.95)),
        focus: T(Key(0, 1), Key(2800, 1), Key(3150, 0), Key(3500, 0), Key(3900, 1)),
        tremble: zero,
        faces: [(0, .pant), (1500, .content), (2950, .smug), (4600, .delighted)],
        hand: nil,
        cues: [Cue(0, 1700, title: "XONG BUỔI!", subtitle: "Full Body A", effects: [.sweat], haptic: .success),
               // 3 thẻ số liệu giữ tới hết cảnh để người dùng đọc (Kiệt 06/11)
               Cue(3550, 7500, stats: [KoaReaction.Stat(value: 42, unit: "phút", label: "thời gian"),
                                       KoaReaction.Stat(value: 4860, unit: "kg", label: "tổng khối lượng"),
                                       KoaReaction.Stat(value: 18, unit: "", label: "set")], haptic: .soft),
               Cue(4850, 7500, title: "+12 Gains", subtitle: "còn 98 tới Lifter", effects: [.confetti], haptic: .success)],
        flashAt: nil, ringFrom: nil)
    }
  }
}
