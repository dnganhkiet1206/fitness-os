public import Foundation

/// Koa nhớ và có khí sắc (30/10): nối đạo diễn hành vi với đời thật của người dùng.
///
/// `KoaMood` trả lời "hôm nay mặt Koa thế nào", `KoaDirector` trả lời "giờ Koa làm gì". Tệp
/// này là phần giữa: những gì Koa còn mang theo khi người dùng rời phòng rồi quay lại.
///
/// - `Facts`: sự thật app đã biết (Gains, lịch tuần, `KoaMood`). Không có sự kiện nào tự sinh.
/// - `Memory`: lưu trên máy theo tài khoản. Mỗi khoảnh khắc chỉ một lần theo khoá của nó.
/// - `Affect`: khí sắc liên tục, TÍNH RA từ ký ức theo giờ thật, nên không reset khi đổi màn
///   và tự phai. Không có giá trị nào giảm vì người dùng không tập: nghỉ không bị phạt.
public enum KoaCompanion {
  /// Khoảnh khắc thật đáng phản ứng, ưu tiên từ trên xuống.
  public enum Moment: String, Sendable, Hashable, Codable, CaseIterable {
    /// Quay lại sau ≥ 3 ngày không tập (`KoaGains.returning`): mừng, không trách.
    case comeback
    /// Lên hạng Gains.
    case rankUp
    /// Buổi hôm nay có kỷ lục cá nhân.
    case record
    /// Buổi tập đã ghi hôm nay.
    case workout
  }

  public struct Facts: Sendable, Hashable {
    /// Ngày địa phương, làm khoá một lần mỗi ngày.
    public var day: String
    public var trainedToday: Bool
    public var recordToday: Bool
    public var restDay: Bool
    /// `KoaSchedule.comebackKey`: một đợt quay lại, `nil` = không phải đang quay lại.
    public var comebackKey: String?
    public var rank: Int
    /// Vì sao Koa có nét mặt hôm nay.
    public var mood: KoaMood.Reason

    public init(
      day: String, trainedToday: Bool = false, recordToday: Bool = false, restDay: Bool = false,
      comebackKey: String? = nil, rank: Int = 0, mood: KoaMood.Reason = .calm
    ) {
      self.day = day
      self.trainedToday = trainedToday
      self.recordToday = recordToday
      self.restDay = restDay
      self.comebackKey = comebackKey
      self.rank = rank
      self.mood = mood
    }

    /// Đọc từ Gains, cùng nguồn với thẻ hạng và trạng thái "pump".
    public init(gains: KoaGains.State, today: LocalDate, mood: KoaMood.Reason) {
      let trained = gains.lastSession == today
      self.init(
        day: today.description, trainedToday: trained, recordToday: trained && gains.lastRecord,
        restDay: gains.restToday, comebackKey: KoaSchedule.comebackKey(gains), rank: gains.rank, mood: mood)
    }
  }

  /// Khí sắc, mỗi trục 0…1. Quyết định Koa HAY làm gì, không phải cho điểm người dùng.
  public struct Affect: Sendable, Hashable {
    /// Năng lượng: thấp thì nghỉ nhiều, đi chậm, tai hơi cụp.
    public var energy: Double
    /// Tự hào sau việc thật: đứng thẳng hơn, hay ngắm bảng số và kệ tạ.
    public var pride: Double
    /// Gần gũi sau khi được chạm: hay nhìn người xem, đứng gần hơn.
    public var warmth: Double
    /// Ngày nghỉ đã đặt: thư thả (khác với mệt).
    public var calm: Bool

    public init(energy: Double = 0.6, pride: Double = 0, warmth: Double = 0, calm: Bool = false) {
      self.energy = energy
      self.pride = pride
      self.warmth = warmth
      self.calm = calm
    }
  }

  /// Tự hào giảm một nửa sau 3 giờ, gần gũi sau 20 phút (giây).
  public static let prideHalfLife = 3 * 3600.0
  public static let warmthHalfLife = 20 * 60.0
  /// Rời phòng trong chừng này giây thì quay lại Koa còn ở chỗ cũ.
  public static let spotMemory = 30 * 60.0

  public struct Memory: Sendable, Hashable, Codable {
    /// Hạng đã biết; `nil` = lần đầu (lấy làm mốc, không ăn mừng hạng có sẵn).
    public var rank: Int?
    public var workoutDay: String?
    public var recordDay: String?
    public var comebackKey: String?
    public var pride = 0.0
    public var prideAt = 0.0
    public var warmth = 0.0
    public var warmthAt = 0.0
    /// Chỗ đứng lần cuối: `true` = trên bục.
    public var onStage = true
    public var x: Double?
    public var d: Double?
    public var spotAt = 0.0
    /// Đồ vật vừa ghé (mới nhất cuối), để lần sau không ghé lại đúng món đó.
    public var visited: [String] = []

    public init() {}

    static func decayed(_ v: Double, from t: Double, to now: Double, halfLife: Double) -> Double {
      v * pow(0.5, max(0, now - t) / halfLife)
    }

    /// Ghi nhận sự thật. Hạng lần đầu thấy chỉ là mốc.
    public mutating func observe(_ f: Facts) {
      if rank == nil { rank = f.rank }
    }

    /// Khoảnh khắc chưa phản ứng, nếu có.
    public func moment(_ f: Facts) -> Moment? {
      if let k = f.comebackKey, k != comebackKey { return .comeback }
      if let r = rank, f.rank > r { return .rankUp }
      if f.recordToday, recordDay != f.day { return .record }
      if f.trainedToday, workoutDay != f.day { return .workout }
      return nil
    }

    /// Đã phản ứng. Việc của cùng một buổi gộp một lần: lên hạng thì không ăn mừng kỷ lục rồi
    /// lại ăn mừng buổi tập.
    public mutating func react(_ m: Moment, _ f: Facts, at now: Double) {
      if m == .comeback {
        comebackKey = f.comebackKey
        warmth = min(1, affect(f, at: now).warmth + 0.6)
        warmthAt = now
        return
      }
      rank = max(rank ?? 0, f.rank)
      if f.recordToday { recordDay = f.day }
      if f.trainedToday { workoutDay = f.day }
      pride = m == .workout ? 0.7 : 1
      prideAt = now
    }

    /// Người dùng chạm Koa.
    public mutating func touched(_ f: Facts, at now: Double) {
      warmth = min(1, Self.decayed(warmth, from: warmthAt, to: now, halfLife: warmthHalfLife) + 0.25)
      warmthAt = now
    }

    public mutating func remember(_ s: KoaRoomMap.Spot, visited v: [String], at now: Double) {
      onStage = s.plane == .stage
      x = s.x
      d = s.d
      spotAt = now
      visited = Array(v.suffix(3))
    }

    /// Chỗ đứng để tiếp tục, nếu mới rời đi chưa lâu.
    public func resumeSpot(at now: Double) -> KoaRoomMap.Spot? {
      guard let x, let d, now >= spotAt, now - spotAt < spotMemory else { return nil }
      let s = KoaRoomMap.Spot(onStage ? .stage : .floor, x, d)
      return KoaRoomMap.valid(s) ? s : nil
    }

    public func affect(_ f: Facts, at now: Double) -> Affect {
      Affect(
        energy: KoaCompanion.energy(f), pride: Self.decayed(pride, from: prideAt, to: now, halfLife: prideHalfLife),
        warmth: Self.decayed(warmth, from: warmthAt, to: now, halfLife: warmthHalfLife), calm: f.restDay)
    }
  }

  /// Năng lượng theo lý do của nét mặt hôm nay. Ngày nghỉ không phải mệt: chỉ chậm lại.
  public static func energy(_ f: Facts) -> Double {
    let e: Double
    switch f.mood {
    case .night: e = 0.25
    case .shortSleep: e = 0.35
    case .emptyLate: e = 0.45
    case .worry, .overate: e = 0.5
    case .unread, .calm: e = 0.6
    case .fed: e = 0.65
    case .trained: e = 0.75
    case .birthday: e = 0.8
    case .rested, .allDone: e = 0.9
    }
    return f.restDay ? min(e, 0.55) : e
  }
}
