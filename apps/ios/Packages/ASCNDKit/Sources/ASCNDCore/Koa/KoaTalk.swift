/// Koa trò chuyện trong phòng (01/11, Kiệt: "mỗi biểu cảm phải đi với một câu thoại, đúng với
/// hoạt động thật của người dùng"). Một `Topic` là một việc thật, luôn kèm đúng một nét mặt,
/// nên mặt và câu không lệch nhau. Câu chữ nằm ở bảng dịch, khoá theo `Topic`.
public enum KoaTalk {
  public enum Topic: String, Sendable, Hashable, CaseIterable, Codable {
    case greet, trained, record, comeback, restDay, allDone, rested, shortSleep, overate
    case emptyLate, fed, nudge, birthday, calm, poke
  }

  /// Nét mặt của một câu: lên đỉnh, lắng lại. `flaps`: có mấp máy miệng khi nói. Mặt mệt, mặt
  /// lo thì giữ yên, miệng cười mở sẽ làm câu nghe hời hợt.
  public struct Face: Sendable, Hashable {
    public let peak: KoaFlags.Expression
    public let settle: KoaFlags.Expression
    public let flaps: Bool
  }

  public static func face(_ t: Topic) -> Face {
    switch t {
    case .greet, .birthday: Face(peak: .grin, settle: .happy, flaps: true)
    case .trained: Face(peak: .grin, settle: .content, flaps: true)
    case .record, .allDone: Face(peak: .delighted, settle: .happy, flaps: true)
    case .comeback: Face(peak: .surprised, settle: .warm, flaps: true)
    case .restDay, .fed: Face(peak: .warm, settle: .content, flaps: true)
    case .rested: Face(peak: .happy, settle: .content, flaps: true)
    case .shortSleep: Face(peak: .sleepy, settle: .sleepy, flaps: false)
    case .overate, .nudge: Face(peak: .sheepish, settle: .content, flaps: false)
    case .emptyLate: Face(peak: .plead, settle: .sheepish, flaps: false)
    case .calm: Face(peak: .happy, settle: .thinking, flaps: true)
    case .poke: Face(peak: .surprised, settle: .grin, flaps: false)
    }
  }

  /// Số câu khác nhau của mỗi chủ đề trong bảng dịch.
  public static func variants(_ t: Topic) -> Int {
    switch t {
    case .poke: 4
    case .rested, .shortSleep, .overate, .birthday, .nudge: 1
    default: 2
    }
  }

  public struct Beat: Sendable, Hashable {
    public let topic: Topic
    public let variant: Int
    /// Giây bóng thoại ở lại.
    public let seconds: Double

    public init(topic: Topic, variant: Int, seconds: Double? = nil) {
      self.topic = topic
      self.variant = variant
      self.seconds = seconds ?? (topic == .poke ? 1.8 : 3.6)
    }

    /// Nét mặt ở giây `t` của câu: đỉnh, mấp máy theo nhịp không đều, rồi lắng.
    public func expression(at t: Double) -> KoaFlags.Expression {
      let f = KoaTalk.face(topic)
      if t < 0.7 { return f.peak }
      guard f.flaps, t < seconds - 0.9 else { return f.settle }
      return KoaTalk.mouths[Int(t * 8) % KoaTalk.mouths.count]
    }
  }

  /// Nhịp miệng: lẫn lúc khép để không thành vòng lặp đều.
  static let mouths: [KoaFlags.Expression] = [.say2, .say1, .say3, .content, .say1, .say2, .content, .say3, .say1, .content]

  /// Sổ các chủ đề đã nói hôm nay, theo tài khoản: một chuyện chỉ kể một lần mỗi ngày.
  public struct Log: Sendable, Hashable, Codable {
    public var day: String
    public var said: [Topic]
    public var userId = ""

    public init(day: String, said: [Topic] = [], userId: String = "") {
      self.day = day
      self.said = said
      self.userId = userId
    }

    public func today(_ day: String) -> Log { self.day == day ? self : Log(day: day, userId: userId) }
  }

  /// Chuyện đáng nói nhất lúc này, CHỈ từ sự thật của ngày. `nil` = im lặng cũng được.
  /// `greeting`: người xem vừa quay lại sau một lúc vắng.
  public static func pick(_ facts: KoaCompanion.Facts, log: Log, greeting: Bool) -> Topic? {
    var order: [Topic] = []
    if facts.mood == .birthday { order.append(.birthday) }
    if facts.recordToday { order.append(.record) }
    if facts.comebackKey != nil { order.append(.comeback) }
    if facts.mood == .allDone { order.append(.allDone) }
    if facts.trainedToday { order.append(.trained) }
    switch facts.mood {
    case .overate: order.append(.overate)
    case .shortSleep: order.append(.shortSleep)
    case .rested: order.append(.rested)
    case .emptyLate: order.append(.emptyLate)
    case .worry: order.append(.nudge)
    case .fed: order.append(.fed)
    default: break
    }
    if facts.restDay { order.append(.restDay) }
    if greeting { order.insert(.greet, at: 0) }
    order.append(.calm)
    return order.first { !log.said.contains($0) }
  }

  /// Lịch nói trong một lượt ở phòng: câu đầu sau khi Koa kịp nhìn người xem, tối đa ba câu,
  /// nói ít thì mỗi câu mới có giá trị.
  public struct Schedule: Sendable, Hashable {
    public static let first = 2.0
    public static let gap = 26.0
    public static let maxPerVisit = 3

    public var nextAt: Double
    public var spoken = 0

    public init(openedAt: Double) { nextAt = openedAt + Self.first }

    public func due(at t: Double) -> Bool { spoken < Self.maxPerVisit && t >= nextAt }

    public mutating func spoke(at t: Double, seconds: Double) {
      spoken += 1
      nextAt = t + seconds + Self.gap
    }
  }

  /// Nét mặt lúc không nói. Mặt cười lớn là ĐỈNH, giữ mãi thành sticker: lên đỉnh rồi lắng về
  /// mặt nghỉ, thỉnh thoảng mỉm một nhịp ngắn. Đổi mặt kèm chớp mắt (`blinkDue`) để giấu bước
  /// nhảy, vì bản vẽ không có khung trung gian.
  public struct Rest: Sendable, Hashable {
    public static let peakHold = 1.6
    public static let softHold = 3.4

    private var held: KoaFlags.Expression?
    private var heldFor = 0.0
    private var clock = 0.0
    private var smileAt: Double
    private var shown: KoaFlags.Expression?
    /// Khung này mặt vừa đổi.
    public private(set) var blinkDue = false

    public init(firstSmile: Double = 7) { smileAt = firstSmile }

    /// `raw`: mặt của hành vi (`nil` = không có), `day`: mặt của ngày. `nil` = giữ nguyên mặt ngày.
    public mutating func step(
      _ dt: Double, raw: KoaFlags.Expression?, day: KoaFlags.Expression, gap: () -> Double
    ) -> KoaFlags.Expression? {
      clock += dt
      if raw != held {
        held = raw
        heldFor = 0
      } else {
        heldFor += dt
      }
      let out = resolve(raw, day: day, gap: gap)
      blinkDue = out != shown
      shown = out
      return out
    }

    private mutating func resolve(
      _ raw: KoaFlags.Expression?, day: KoaFlags.Expression, gap: () -> Double
    ) -> KoaFlags.Expression? {
      if let raw {
        guard raw == .grin || raw == .delighted else { return raw }
        if heldFor < Self.peakHold { return raw }
        return heldFor < Self.softHold ? .happy : .content
      }
      // tròn mắt suốt ngày cũng thành sticker; lo thì để câu nói lo, mặt vẫn thư thái
      guard [.happy, .grin, .delighted, .surprised].contains(day) else { return nil }
      if clock >= smileAt {
        if clock >= smileAt + 1.3 { smileAt = clock + gap() } else { return .warm }
      }
      return .content
    }
  }
}

/// Co giãn kiểu hoạt hình: thân vươn dài khi nhảy lên, bẹp xuống lúc tiếp đất rồi nảy về, giữ thể
/// tích gần như cũ (rộng ra khi lùn đi). Đây là nguyên tắc số một của Disney, squash and stretch.
public struct KoaSquash: Sendable, Hashable {
  static let stretch = 0.012
  static let maxStretch = 0.1
  static let landing = 0.13

  private var amount = 0.0
  private var velocity = 0.0
  private var lastHop = 0.0

  public init() {}

  public var y: Double { 1 + amount }
  public var x: Double { 1 - amount * 0.7 }

  /// `hop`: Koa đang cao hơn mặt đứng bao nhiêu.
  public mutating func step(_ dt: Double, hop: Double) {
    guard dt > 0 else { return }
    let airborne = hop > 0.5
    if lastHop > 0.5, !airborne { amount = -Self.landing }
    lastHop = hop
    let target = airborne ? min(Self.maxStretch, hop * Self.stretch) : 0
    // lò xo hơi non: nảy qua một nhịp nhỏ rồi lắng
    let w = 22.0, damping = 0.45
    velocity += (-2 * damping * w * velocity - w * w * (amount - target)) * min(dt, 1.0 / 30)
    amount += velocity * min(dt, 1.0 / 30)
  }
}
