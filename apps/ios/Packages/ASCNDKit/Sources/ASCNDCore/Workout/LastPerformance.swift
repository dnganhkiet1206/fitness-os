public import Foundation
public import Observation

/// "Lần trước" của một bài (#331) — port phần `performancesFrom`
/// (`native/src/lib/exercise-performance.ts` @ fac9ac2) mà dòng "Lần trước
/// 55 kg × 9" trên màn tập dùng (`exercise-progress.tsx:lastSetText`,
/// `day-plan.tsx:783`): buổi GẦN NHẤT có bài ấy trong 90 ngày, chỉ tính set
/// làm thật (khởi động bị loại).
///
/// Chưa port (ghi rõ): loại bài (`exercise-kind.ts`) và cân nặng ngày tập —
/// với bài bodyweight có đeo tạ, RN cộng cân nặng vào tạ; native hiện chỉ
/// hiện tạ đeo. Trend / e1RM / kỷ lục theo cửa sổ thuộc màn Insight, không
/// thuộc dòng này.
public struct LastPerformance: Sendable, Hashable, Codable {
  /// Set đỉnh THẬT của buổi: tạ nặng nhất, bằng tạ thì nhiều rep nhất.
  public struct TopSet: Sendable, Hashable, Codable {
    public let weightKg: Double
    public let reps: Int
    public init(weightKg: Double, reps: Int) {
      self.weightKg = weightKg
      self.reps = reps
    }
  }

  public let exerciseKey: String
  /// Tên như lần gõ gần nhất — để hiện, không để so.
  public let exerciseName: String
  public let sessionId: String
  public let at: EpochMillis
  /// Ngày LỊCH địa phương của buổi (`dayOf`): 06:30 sáng thứ Ba ở UTC+7 là
  /// thứ Ba, không phải thứ Hai như `at.slice(0, 10)`.
  public let date: LocalDate
  public let setCount: Int
  public let totalReps: Int
  public let totalVolumeKg: Double
  /// `nil` khi không có set nào có rep (chỉ có set giữ).
  public let topSet: TopSet?
  /// Lần giữ lâu nhất, với bài giữ.
  public let bestDurationSec: Int?

  /// Thứ màn hiện, không kèm đơn vị/chữ (bản địa hoá là việc của C):
  /// set giữ chỉ có thời gian, hoặc tạ × reps (tạ 0 = bodyweight).
  public enum Display: Sendable, Hashable {
    case hold(seconds: Int)
    case bodyweight(reps: Int)
    case loaded(weightKg: Double, reps: Int)
  }

  /// `lastSetText`, với set đỉnh thật thay cho cặp max ghép rời.
  public var display: Display? {
    if let d = bestDurationSec, topSet == nil { return .hold(seconds: d) }
    guard let top = topSet else { return nil }
    return top.weightKg > 0 ? .loaded(weightKg: top.weightKg, reps: top.reps) : .bodyweight(reps: top.reps)
  }
}

/// Một hàng `workout_sessions` như truy vấn lịch sử trả về.
public struct SessionHistoryRow: Sendable, Hashable {
  public let id: String
  public let at: EpochMillis
  public let sets: JSONValue?

  public init(id: String, at: EpochMillis, sets: JSONValue?) {
    self.id = id
    self.at = at
    self.sets = sets
  }
}

public enum PerformanceHistory {
  /// `INSIGHT_DAYS` (`use-exercise-insights.ts:36`).
  public static let windowDays = 90

  /// Buổi gần nhất của mỗi bài, khoá theo `exerciseKey`.
  ///
  /// RN BUG FOUND: `lastSetText` ghép `bestWeightKg` (tạ nặng nhất) với
  /// `bestReps` (số rep nhiều nhất) — hai cực trị tính ĐỘC LẬP trên mọi set.
  /// Buổi `100 kg × 3` + `60 kg × 12` hiện "Lần trước 100 kg × 12": một set
  /// chưa từng xảy ra, đúng ở con số người dùng sắp cố vượt. Native: `topSet`
  /// là một set có thật. Test: topSetIsARealSet.
  public static func lastByExercise(_ rows: [SessionHistoryRow], timeZone: TimeZone) -> [String: LastPerformance] {
    // Cũ → mới, để "gần nhất" là cái ghi sau cùng (`lastByKey` của RN); cùng
    // thời điểm thì giữ thứ tự đến (sắp xếp ổn định).
    let ordered = rows.enumerated().sorted { a, b in
      a.element.at != b.element.at ? a.element.at < b.element.at : a.offset < b.offset
    }.map(\.element)
    var out: [String: LastPerformance] = [:]
    for row in ordered {
      var byExercise: [String: [RecordSet]] = [:]
      var order: [String] = []
      for s in PersonalRecords.sets(fromJSON: row.sets) where working(s) {
        let key = PersonalRecords.exerciseKey(s.exerciseName)
        guard !key.isEmpty else { continue }
        if byExercise[key] == nil { order.append(key) }
        byExercise[key, default: []].append(s)
      }
      for key in order {
        guard let sets = byExercise[key], let last = sets.last else { continue }
        out[key] = summarize(key: key, name: last.exerciseName, row: row, sets: sets, timeZone: timeZone)
      }
    }
    return out
  }

  /// `working`: không khởi động, tạ hữu hạn ≥ 0, có rep hoặc có thời gian giữ.
  static func working(_ s: RecordSet) -> Bool {
    !s.warmup && s.weightKg.isFinite && s.weightKg >= 0 && (s.reps >= 1 || (s.durationSec ?? 0) > 0)
  }

  static func summarize(key: String, name: String, row: SessionHistoryRow, sets: [RecordSet], timeZone: TimeZone) -> LastPerformance {
    var totalReps = 0
    var volume = 0.0
    var top: LastPerformance.TopSet?
    var hold: Int?
    for s in sets {
      let reps = max(0, s.reps)
      let w = WorkoutMath.round2(s.weightKg)
      totalReps += reps
      volume += w * Double(reps)
      if reps > 0, top.map({ w > $0.weightKg || (w == $0.weightKg && reps > $0.reps) }) ?? true {
        top = .init(weightKg: w, reps: reps)
      }
      if let d = s.durationSec, d > 0, d > (hold ?? 0) { hold = d }
    }
    return LastPerformance(
      exerciseKey: key, exerciseName: name.trimmingCharacters(in: .whitespacesAndNewlines),
      sessionId: row.id, at: row.at, date: LocalDate(row.at, in: timeZone), setCount: sets.count,
      totalReps: totalReps, totalVolumeKg: WorkoutMath.round2(volume), topSet: top, bestDurationSec: hold)
  }
}

/// Nguồn lịch sử cho "lần trước" (`ASCNDBackend.SupabasePerformanceSource`).
public protocol PerformanceSource: Sendable {
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow]
}

public protocol PerformanceCache: Sendable {
  func load(userId: String) async throws -> [String: LastPerformance]?
  func save(userId: String, _ table: [String: LastPerformance]) async throws
}

/// "Lần trước" của mọi bài, local-first — cùng mẫu với `RecordBook`.
///
/// RN behavior: đọc 90 ngày buổi tập mỗi lần mở màn; offline thì không có dòng.
/// Native behavior: bảng cache hiện ngay (kể cả offline), làm mới từ server;
///   buổi vừa chốt thành "lần trước" ngay (`absorb`), không đợi sync.
@MainActor @Observable
public final class PerformanceBook {
  public let userId: String
  public private(set) var table: [String: LastPerformance] = [:]
  @ObservationIgnored private let source: any PerformanceSource
  @ObservationIgnored private let cache: any PerformanceCache
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone

  public init(
    userId: String, source: any PerformanceSource, cache: any PerformanceCache,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.clock = clock
    self.timeZone = timeZone
  }

  /// Buổi gần nhất có bài `name`, hoặc `nil` (không có dòng nào để hiện).
  public func last(for name: String) -> LastPerformance? {
    table[PersonalRecords.exerciseKey(name)]
  }

  public func load() async {
    if table.isEmpty, let cached = try? await cache.load(userId: userId) {
      table = cached
    }
    await refresh()
  }

  public func refresh() async {
    let since = clock.nowMillis() - Int64(PerformanceHistory.windowDays) * 86_400_000
    guard let rows = try? await source.sessions(userId: userId, since: since) else { return }
    table = PerformanceHistory.lastByExercise(rows, timeZone: timeZone)
    try? await cache.save(userId: userId, table)
  }

  /// Buổi vừa chốt (hàng outbox: `id`, `date_time`, `sets`) thành "lần trước".
  /// Bản ghi lại (#296, #398) thay hẳn phần của buổi ấy: bài vừa bị gỡ hết set
  /// không còn trỏ vào buổi này.
  public func absorb(row: JSONValue) async {
    guard let id = row["id"]?.stringValue, let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return }
    table = table.filter { $0.value.sessionId != id }
    let fresh = PerformanceHistory.lastByExercise([SessionHistoryRow(id: id, at: at, sets: row["sets"])], timeZone: timeZone)
    for (key, p) in fresh where table[key].map({ $0.at <= p.at }) ?? true {
      table[key] = p
    }
    try? await cache.save(userId: userId, table)
  }

  /// Buổi bị xoá trên máy (gỡ set cuối cùng, #398): mọi bài không còn trỏ vào
  /// nó. Bài ấy mất dòng "lần trước" tới lần làm mới sau — server mới biết buổi
  /// trước đó của nó.
  public func forget(sessionId: String) async {
    let kept = table.filter { $0.value.sessionId != sessionId }
    guard kept.count != table.count else { return }
    table = kept
    try? await cache.save(userId: userId, table)
  }
}
