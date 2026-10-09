public import Foundation
public import Observation

/// "Insight hôm nay" của tab Trợ lý (#527) — `hooks/use-smart-nudges.ts` +
/// phần insight của `(tabs)/assistant.tsx` @ fac9ac2.
///
/// Như RN: gọi `ai-smart-nudges` với `lang` + ngày địa phương + `tzOffset`
/// (giờ của MÁY — server không đoán sáng / tối theo UTC); mỗi ngày một lần,
/// nhớ theo (người dùng · ngày · ngôn ngữ · dấu dữ liệu). Dấu dữ liệu là ba
/// cờ "đã ghi ngủ / đã ăn / đã tập" (`s-w` = có ngủ, có buổi, chưa ăn) — đổi
/// cờ thì đọc lại, nên tối đa bốn lượt gọi AI một ngày. Hỏng thì thử lại một
/// lần (`retry: 1`). Mốc "Cập nhật HH:mm" là lúc kết quả về, sống qua lần mở
/// lại app (bộ nhớ đệm bền). Chấm màu theo `priority`; `icon` của server bị bỏ
/// qua như RN.
public enum SmartNudges {
  public enum Priority: String, Sendable, Hashable, Codable { case high, medium, low }

  public struct Nudge: Sendable, Hashable, Codable {
    public let type: String
    public let message: String
    public let priority: Priority

    public init(type: String, message: String, priority: Priority) {
      self.type = type
      self.message = message
      self.priority = priority
    }
  }

  /// Một kết quả đã về + lúc về.
  public struct Entry: Sendable, Hashable, Codable {
    public let nudges: [Nudge]
    public let at: EpochMillis

    public init(nudges: [Nudge], at: EpochMillis) {
      self.nudges = nudges
      self.at = at
    }
  }

  /// `stamp` từ hàng `daily_logs` hôm nay.
  public static func stamp(_ log: JSONValue?) -> String {
    (JS.number(log?["sleep_duration_min"]) > 0 ? "s" : "-")
      + (JS.number(log?["kcal"]) > 0 ? "m" : "-")
      + (JS.number(log?["workout_count"]) > 0 ? "w" : "-")
  }

  public static func key(userId: String, date: LocalDate, lang: String, stamp: String) -> String {
    "smart_nudges|\(userId)|\(date)|\(lang)|\(stamp)"
  }

  /// `res.data?.nudges ?? []` — phần tử thiếu chữ bị bỏ; `priority` lạ coi
  /// như "low" (chấm xanh, như nhánh cuối của RN).
  public static func parse(_ data: JSONValue?) -> [Nudge] {
    guard case .array(let items)? = data?["nudges"] else { return [] }
    return items.compactMap { n in
      guard let message = n["message"]?.stringValue, !message.isEmpty else { return nil }
      return Nudge(
        type: n["type"]?.stringValue ?? "", message: message,
        priority: n["priority"]?.stringValue.flatMap(Priority.init(rawValue:)) ?? .low)
    }
  }
}

/// Bộ nhớ đệm bền của insight (RN: persister của React Query).
public protocol SmartNudgesCache: Sendable {
  func entry(_ key: String) -> SmartNudges.Entry?
  func store(_ entry: SmartNudges.Entry, for key: String)
}

/// Insight hôm nay của MỘT tài khoản.
@MainActor @Observable
public final class SmartNudgesBook {
  public enum Phase: Sendable, Hashable {
    case idle
    case loading
    case failed(EdgeFunction.Failure)
    case ready(SmartNudges.Entry)
  }

  public let userId: String
  public private(set) var phase: Phase = .idle

  @ObservationIgnored private let edge: any EdgeCaller
  @ObservationIgnored private let cache: any SmartNudgesCache
  @ObservationIgnored private let clock: @Sendable () -> EpochMillis
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var currentKey: String?
  @ObservationIgnored private var generation = 0

  public init(
    userId: String, edge: any EdgeCaller, cache: any SmartNudgesCache,
    clock: @escaping @Sendable () -> EpochMillis = { SystemWallClock().nowMillis() }
  ) {
    self.userId = userId
    self.edge = edge
    self.cache = cache
    self.clock = clock
  }

  public func close() { closed = true }

  /// Đọc insight cho (ngày · ngôn ngữ · dấu). Đã có trong bộ nhớ đệm thì
  /// không gọi AI (`staleTime: Infinity`); `force` = chạm "thử lại".
  public func load(date: LocalDate, lang: String, stamp: String, tzOffset: Int, force: Bool = false) async {
    let key = SmartNudges.key(userId: userId, date: date, lang: lang, stamp: stamp)
    if !force, key == currentKey, case .ready = phase { return }
    if !force, key == currentKey, case .loading = phase { return }
    currentKey = key
    if !force, let hit = cache.entry(key) {
      phase = .ready(hit)
      return
    }
    generation += 1
    let mine = generation
    phase = .loading
    let body: [String: JSONValue] = [
      "lang": .string(lang), "date": .string(date.description), "tzOffset": .number(Double(tzOffset)),
    ]
    var last: EdgeFunction.Failure = .unknown
    // Một lần + một lần thử lại (`retry: 1`).
    for _ in 0..<2 {
      do {
        let data = try await edge.call(.smartNudges, body: body)
        guard !closed, mine == generation else { return }
        let entry = SmartNudges.Entry(nudges: SmartNudges.parse(data), at: clock())
        cache.store(entry, for: key)
        phase = .ready(entry)
        return
      } catch {
        last = error
        guard !closed, mine == generation else { return }
      }
    }
    phase = .failed(last)
  }
}
