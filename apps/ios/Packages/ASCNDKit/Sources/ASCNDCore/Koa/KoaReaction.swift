import Foundation

/// Koa phản ứng toàn màn hình (05/11, Kiệt: "phản ứng của Koa sẽ là full màn hình có storyboard đầy đủ").
///
/// Storyboard thuần dữ liệu: cảnh → các khung, mỗi khung có thời lượng, dáng / mặt Koa, "máy quay" 2D
/// (đẩy / lùi / lia trên hình vector, không góc 3D), chữ, hiệu ứng và rung. Bản mock phát bằng màn Debug
/// `KoaReactionPreview`; bản thật dùng lại đúng dữ liệu này. Mock trước đó (ảnh render 3D) đọc ra lệch
/// nét Koa và không cử động thật (Kiệt: "sao nhìn kì vậy").
public enum KoaReaction {
  public enum Scene: String, Sendable, CaseIterable {
    /// Bấm "Xong set" (không kỷ lục). Đồng hồ nghỉ đã chạy ngầm.
    case set
    /// Set vừa xong là kỷ lục.
    case record
    /// Kết thúc buổi, trước màn tổng kết.
    case done
    /// Màn nghỉ giữa hiệp (07/11, Kiệt: "tại sao không làm theo kiểu như khi buổi tập xong"): cùng bộ máy, cùng
    /// ngôn ngữ hình của cảnh xong buổi. Mở đầu ngay khi xong set…
    case restIntro
    /// …một cú vươn vai giữa quãng nghỉ (nghỉ đủ dài)…
    case restStretch
    /// …và 3,5 s cuối: nhún đếm ngược, hết giờ giơ tay chữ V "Lượt mình!".
    case restGo
    /// Hoạt động xen giữa quãng nghỉ (07/11, Kiệt: "thêm nhiều hoạt động hơn để đỡ nhàm chán"): giãn hông, xoay vai,
    /// chạy bước nhỏ, hít sâu, vẫy tay, gồng khoe cơ, liếc đồng hồ gật gù.
    case restSide, restShoulders, restJog, restBreath, restWave, restFlex, restGlance
  }

  public enum Focus: Sendable, Hashable {
    /// Cả người.
    case body
    /// Mặt (cận).
    case face
  }

  public enum Effect: Sendable, Hashable { case speedLines, sweat, confetti, flash, shake }

  public enum Motion: Sendable, Hashable {
    case none
    /// Nhún lấy đà → bật lên → tiếp đất có nén (cú nhảy ăn mừng).
    case jump
    /// Ngồi phịch: nén xuống rồi nảy nhẹ.
    case plop
    /// Thu nhỏ bay vào vòng đồng hồ nghỉ (cuối cảnh "ghi set").
    case intoRing
  }

  public enum Haptic: Sendable, Hashable { case none, soft, success, heavy }

  public struct Stat: Sendable, Hashable {
    public let value: Double
    public let unit: String
    public let label: String
    public init(value: Double, unit: String, label: String) { self.value = value; self.unit = unit; self.label = label }
  }

  /// Chữ thật của một cảnh (bản mock dùng số mẫu trong kịch bản).
  public struct Content: Sendable, Hashable {
    public struct Gains: Sendable, Hashable {
      public let title: String
      public let subtitle: String?
      public init(title: String, subtitle: String?) { self.title = title; self.subtitle = subtitle }
    }
    public let title: String
    public let subtitle: String?
    public let stats: [Stat]
    public let gains: Gains?
    public init(title: String, subtitle: String?, stats: [Stat], gains: Gains?) {
      self.title = title; self.subtitle = subtitle; self.stats = stats; self.gains = gains
    }
  }

  public struct Shot: Sendable {
    public let ms: Double
    public let label: String
    public let expression: KoaFlags.Expression
    public let pose: KoaFlags.Pose
    public let gesture: KoaGesture?
    /// Quay mặt 2.5D đầu → cuối khung (−1…1).
    public let turn: (Double, Double)
    public let focus: Focus
    /// Độ phóng của máy đầu → cuối khung (1 = cả người vừa khung).
    public let zoom: (Double, Double)
    public let title: String?
    public let subtitle: String?
    public let chip: String?
    public let stats: [Stat]
    public let effects: Set<Effect>
    public let motion: Motion
    public let haptic: Haptic
    /// Đầu diễn riêng (như Duolingo tách đầu / thân): hướng nhìn của đầu đầu → cuối khung (x, y −1…1).
    public let look: (from: (Double, Double), to: (Double, Double))
    /// Cắt cứng có chủ ý (chớp trắng). Mặc định máy lướt liền từ khung trước sang (`blendMs`).
    public let cut: Bool

    init(
      _ ms: Double, _ label: String, _ expression: KoaFlags.Expression, pose: KoaFlags.Pose = .idle, gesture: KoaGesture? = nil,
      turn: (Double, Double) = (0, 0), focus: Focus = .body, zoom: (Double, Double) = (1, 1), title: String? = nil,
      subtitle: String? = nil, chip: String? = nil, stats: [Stat] = [], effects: Set<Effect> = [], motion: Motion = .none,
      haptic: Haptic = .none, look: ((Double, Double), (Double, Double)) = ((0, 0), (0, 0)), cut: Bool = false
    ) {
      self.look = (look.0, look.1); self.cut = cut
      self.ms = ms; self.label = label; self.expression = expression; self.pose = pose; self.gesture = gesture
      self.turn = turn; self.focus = focus; self.zoom = zoom; self.title = title; self.subtitle = subtitle
      self.chip = chip; self.stats = stats; self.effects = effects; self.motion = motion; self.haptic = haptic
    }
  }

  /// Chữ trong mock (số liệu mẫu). Bản thật lấy từ set / buổi vừa ghi.
  public static func shots(_ scene: Scene) -> [Shot] {
    switch scene {
    case .restIntro, .restStretch, .restGo, .restSide, .restShoulders, .restJog, .restBreath, .restWave, .restFlex, .restGlance:
      []
    case .set:
      [
        Shot(500, "CẬN MẶT", .grit, pose: .lifting, focus: .face, zoom: (1.0, 1.12), effects: [.speedLines, .shake], haptic: .soft,
             look: ((0, -0.35), (0, -0.1))),
        Shot(800, "TRUNG CẢNH", .puff, pose: .lifting, turn: (0.35, 0.35), zoom: (1.25, 1.15), title: "XONG SET!",
             subtitle: "Squat · 80 kg × 5", haptic: .success, look: ((0, -0.1), (0.2, 0.35))),
        Shot(700, "TOÀN CẢNH", .gymPant, pose: .relaxing, zoom: (1.0, 1.0), subtitle: "Thở chút nào · nghỉ 1:30",
             effects: [.sweat], motion: .plop, look: ((0, 0.45), (0, 0.25))),
        Shot(450, "VÀO THẺ NGHỈ", .gymPant, pose: .relaxing, motion: .intoRing, look: ((0, 0.25), (0, 0))),
      ]
    case .record:
      [
        Shot(700, "ĐẨY MÁY", .strain, pose: .lifting, zoom: (1.05, 1.3), effects: [.speedLines], haptic: .heavy,
             look: ((0, 0), (0, -0.4))),
        Shot(650, "CẬN MẶT", .roar, focus: .face, zoom: (1.0, 1.06), title: "KỶ LỤC MỚI!", subtitle: "82,5 kg × 5",
             effects: [.flash, .shake], haptic: .success, look: ((0, -0.6), (0, -0.3)), cut: true),
        Shot(1600, "TOÀN CẢNH", .delighted, gesture: .cheer, zoom: (0.95, 1.0), title: "+2,5 kg", subtitle: "so với lần trước",
             effects: [.confetti], motion: .jump, haptic: .soft, look: ((0, -0.3), (0, 0))),
        Shot(1150, "TRUNG CẢNH", .confident, gesture: .taDa, turn: (0, 0.4), zoom: (1.15, 1.2), chip: "🏆 Kỷ lục Squat",
             effects: [.confetti], look: ((0.5, 0), (0.25, -0.15))),
      ]
    case .done:
      [
        Shot(1100, "TOÀN CẢNH", .gymPant, pose: .relaxing, zoom: (0.9, 1.0), title: "XONG BUỔI!", subtitle: "Full Body A",
             effects: [.sweat], motion: .plop, haptic: .success, look: ((0, 0.5), (0, 0.3))),
        Shot(800, "TRUNG CẢNH", .content, turn: (-0.5, -0.3), zoom: (1.2, 1.25), look: ((-0.7, 0), (-0.35, 0.15))),
        Shot(700, "CẬN MẶT", .smug, turn: (0.2, 0.3), focus: .face, zoom: (1.0, 1.08), look: ((0.35, -0.05), (0.2, -0.25))),
        Shot(1700, "TOÀN CẢNH", .confident, gesture: .taDa, zoom: (0.92, 0.95),
             stats: [Stat(value: 42, unit: "phút", label: "thời gian"), Stat(value: 4860, unit: "kg", label: "tổng khối lượng"),
                     Stat(value: 18, unit: "", label: "set")], haptic: .soft, look: ((0, 0), (0.25, 0.05))),
        Shot(1700, "ĂN MỪNG", .delighted, gesture: .cheer, zoom: (0.95, 1.0), title: "+12 Gains", subtitle: "còn 98 tới Lifter",
             effects: [.confetti], motion: .jump, haptic: .success, look: ((0, -0.35), (0, 0))),
      ]
    }
  }

  public static func duration(_ scene: Scene) -> Double { shots(scene).reduce(0) { $0 + $1.ms } }

  /// Khung đang chiếu lúc `t` (ms từ đầu cảnh) và tiến độ trong khung 0…1. Quá cuối thì giữ khung cuối.
  public static func at(_ scene: Scene, _ t: Double) -> (index: Int, progress: Double) {
    let all = shots(scene)
    var start = 0.0
    for (i, s) in all.enumerated() {
      if t < start + s.ms || i == all.count - 1 { return (i, max(0, min(1, (t - start) / s.ms))) }
      start += s.ms
    }
    return (0, 0)
  }

  /// Máy lướt liền từ khung trước sang khung mới trong chừng này (ms), thay cho cắt cứng.
  public static let blendMs = 300.0
  /// Đổi dáng (tư thế / dáng biểu cảm): thân nén xuống trong chừng này (ms), đổi dáng lúc nén sâu nhất.
  public static let poseSquashMs = 90.0

  /// Nén – đổi – nảy khi đổi dáng, `ms` sau khi sang khung mới: độ nén và còn vẽ dáng cũ hay chưa.
  /// Giấu cú đổi trong động tác thay cho mờ chồng hai hình.
  public static func poseSwap(_ ms: Double) -> (sx: Double, sy: Double, old: Bool) {
    if ms < 0 { return (1, 1, true) }
    if ms < poseSquashMs { let k = ease(ms / poseSquashMs); return (1 + 0.1 * k, 1 - 0.13 * k, true) }
    let u = ms - poseSquashMs
    guard u < 420 else { return (1, 1, false) }
    // bật lên từ chỗ nén, vượt đà rồi lắng (lò xo tắt dần)
    let k = -0.13 * exp(-u / 85) * cos(u / 38)
    return (1 - 0.77 * k, 1 + k, false)
  }
  /// Dáng biểu cảm hiện dần có vượt đà (ms).
  public static let gestureInMs = 300.0

  /// Hiện dần có vượt đà (ease-out-back): 0 → ~1,08 → 1.
  public static func backOut(_ p: Double) -> Double {
    let c1 = 1.70158 * 0.9, c3 = c1 + 1, q = min(1, max(0, p)) - 1
    return 1 + c3 * q * q * q + c1 * q * q
  }

  /// Nén / nảy theo đà sau mỗi lần đổi khung (lò xo tắt dần): (sx, sy) ở `ms` sau khi đổi.
  public static func settle(_ ms: Double) -> (sx: Double, sy: Double) {
    guard ms >= 0, ms < 450 else { return (1, 1) }
    let k = 0.05 * exp(-ms / 110) * cos(ms / 45)
    return (1 + k, 1 - k)
  }

  /// Dịu hai đầu.
  public static func ease(_ p: Double) -> Double { p < 0.5 ? 2 * p * p : 1 - pow(-2 * p + 2, 2) / 2 }

  /// Độ dời dọc (đơn vị: phần chiều cao hình, âm = lên) và nén / giãn (sx, sy) của thân Koa.
  public static func body(_ m: Motion, _ p: Double) -> (dy: Double, sx: Double, sy: Double) {
    switch m {
    case .none, .intoRing: return (0, 1, 1)
    case .plop:
      if p < 0.18 { let k = p / 0.18; return (0, 1 + 0.10 * k, 1 - 0.12 * k) }
      let k = (p - 0.18) / 0.82
      let b = exp(-5 * k) * cos(10 * k)
      return (0, 1 + 0.10 * b, 1 - 0.12 * b)
    case .jump:
      // 0–0,15 nhún · 0,15–0,55 bay (parabol) · 0,55–0,7 tiếp đất nén · sau đó đứng
      if p < 0.15 { let k = p / 0.15; return (0, 1 + 0.08 * k, 1 - 0.1 * k) }
      if p < 0.55 { let k = (p - 0.15) / 0.4; return (-0.22 * 4 * k * (1 - k), 0.96, 1.06) }
      if p < 0.7 { let k = (p - 0.55) / 0.15; let s = sin(k * .pi); return (0, 1 + 0.08 * s, 1 - 0.1 * s) }
      return (0, 1, 1)
    }
  }
}
