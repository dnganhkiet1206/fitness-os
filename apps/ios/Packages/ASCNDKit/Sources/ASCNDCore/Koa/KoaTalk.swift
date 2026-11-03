/// Koa trò chuyện trong phòng (01/11, Kiệt: "mỗi biểu cảm phải đi với một câu thoại, đúng với
/// hoạt động thật của người dùng"). Một `Topic` là một việc thật, luôn kèm đúng một nét mặt,
/// nên mặt và câu không lệch nhau. Câu chữ nằm ở bảng dịch, khoá theo `Topic`.
public enum KoaTalk {
  public enum Topic: String, Sendable, Hashable, CaseIterable, Codable {
    case greet, trained, record, comeback, restDay, allDone, rested, shortSleep, overate
    case emptyLate, fed, nudge, birthday, calm, poke
    /// Mốc mới của hành trình (`KoaMomentFeed`): câu do app lấy từ mốc, không theo bảng dịch.
    case milestone
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
    case .milestone: Face(peak: .grin, settle: .happy, flaps: true)
    }
  }

  /// Số câu khác nhau của mỗi chủ đề trong bảng dịch.
  public static func variants(_ t: Topic) -> Int {
    switch t {
    case .poke: 4
    case .rested, .shortSleep, .overate, .birthday, .nudge, .milestone: 1
    default: 2
    }
  }

  public struct Beat: Sendable, Hashable {
    public let topic: Topic
    public let variant: Int
    /// Giây bóng thoại ở lại.
    public let seconds: Double
    /// Khẩu hình theo đúng câu nói (`visemes`), mỗi hình một nhịp `mouthStep`.
    public let mouth: [KoaFlags.Expression]

    public init(topic: Topic, variant: Int, line: String = "") {
      self.topic = topic
      self.variant = variant
      mouth = KoaTalk.face(topic).flaps ? KoaTalk.visemes(line) : []
      // đủ lâu để đọc: phần miệng nói xong rồi còn nán lại một nhịp
      seconds = max(topic == .poke ? 1.8 : 2.8, KoaTalk.mouthStart + Double(mouth.count) * KoaTalk.mouthStep + 1.2)
    }

    /// Nét mặt ở giây `t` của câu: đỉnh, mấp máy theo nhịp không đều, rồi lắng.
    public func expression(at t: Double) -> KoaFlags.Expression {
      let f = KoaTalk.face(topic)
      if t < KoaTalk.mouthStart { return f.peak }
      let i = Int((t - KoaTalk.mouthStart) / KoaTalk.mouthStep)
      return i < mouth.count ? mouth[i] : f.settle
    }
  }

  /// Miệng bắt đầu nói sau khi mặt lên đỉnh, mỗi khẩu hình giữ một nhịp.
  static let mouthStart = 0.7
  static let mouthStep = 0.12

  /// Khẩu hình theo chữ, như cách Duolingo cho nhân vật nói (viseme): "a" há to, "o", "u" tròn môi,
  /// "e", "i" kéo ngang, "m", "b", "p" khép lại, dấu câu ngừng hơi. Ký tự dấu tiếng Việt quy về chữ
  /// gốc. Phụ âm khác giữ nguyên hình trước để miệng không giật theo từng chữ.
  public static func visemes(_ text: String) -> [KoaFlags.Expression] {
    let plain = text.folding(options: .diacriticInsensitive, locale: .init(identifier: "vi")).lowercased()
    var out: [KoaFlags.Expression] = []
    var last = KoaFlags.Expression.content
    for ch in plain {
      switch ch {
      case "a": last = .say2
      case "o", "u", "w": last = .say1
      case "e", "i", "y": last = .say3
      case "m", "b", "p", "f", "v": last = .content
      case " ": continue
      case ",", ".", "!", "?", ":", ";":
        out += [.content, .content]
        last = .content
        continue
      default:
        if !ch.isLetter && !ch.isNumber { continue }
      }
      if out.last != last || out.count % 3 == 0 { out.append(last) }
    }
    out.append(.content)
    return out
  }

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
    // mốc mới đi trước mọi chuyện của ngày; lời chào vẫn mở đầu
    if facts.milestone { order.insert(.milestone, at: 0) }
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
  /// mặt nghỉ, thỉnh thoảng mỉm một nhịp ngắn. Đổi giữa hai mặt mở mắt thì kèm chớp mắt (`blinkDue`)
  /// để giấu bước nhảy, vì bản vẽ không có khung trung gian.
  public struct Rest: Sendable, Hashable {
    public static let peakHold = 2.6
    public static let softHold = 5.6
    public static let smileHold = 2.4
    /// Mặt vừa đổi ở lại ít nhất ngần này giây: đổi dồn dập thì người xem chưa đọc kịp mặt cũ.
    public static let minHold = 1.8

    private var held: KoaFlags.Expression?
    private var heldFor = 0.0
    private var clock = 0.0
    private var smileAt: Double
    private var shown: KoaFlags.Expression?
    private var shownAt = 0.0
    private var started = false
    /// Khung này mặt vừa đổi.
    public private(set) var blinkDue = false

    public init(firstSmile: Double = 7) { smileAt = firstSmile }

    /// `raw`: mặt của hành vi (`nil` = không có), `day`: mặt của ngày. `nil` = giữ nguyên mặt ngày.
    public mutating func step(
      _ dt: Double, raw: KoaFlags.Expression?, day: KoaFlags.Expression, gap: () -> Double
    ) -> KoaFlags.Expression? {
      advance(dt, raw: raw)
      var out = resolve(raw, day: day, gap: gap)
      if started, out != shown {
        if clock - shownAt < Self.minHold { out = shown } else { shownAt = clock }
      }
      // mắt đang nhắm hay sắp nhắm thì không chớp: chớp chỉ để giấu bước đổi giữa hai mặt mở mắt
      blinkDue = started && out != shown && !KoaFlags.eyesClosed(out) && !KoaFlags.eyesClosed(shown)
      started = true
      shown = out
      return out
    }

    /// Koa đang nói, mặt do câu nói quyết: đồng hồ vẫn chạy, nếu không thì nói xong mặt cũ quay lại.
    public mutating func speaking(_ dt: Double, raw: KoaFlags.Expression?, face: KoaFlags.Expression) {
      advance(dt, raw: raw)
      blinkDue = false
      started = true
      if face != shown { shownAt = clock }
      shown = face
    }

    private mutating func advance(_ dt: Double, raw: KoaFlags.Expression?) {
      clock += dt
      if raw != held {
        held = raw
        heldFor = 0
      } else {
        heldFor += dt
      }
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
        if clock >= smileAt + Self.smileHold { smileAt = clock + gap() } else { return .warm }
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
