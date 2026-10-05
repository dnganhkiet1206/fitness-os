public import Foundation
public import Observation

/// "Lần trước" của một bài (#331) — port phần `performancesFrom`
/// (`native/src/lib/exercise-performance.ts` @ fac9ac2) mà dòng "Lần trước
/// 55 kg × 9" trên màn tập dùng (`exercise-progress.tsx:lastSetText`,
/// `day-plan.tsx:783`): buổi GẦN NHẤT có bài ấy trong 90 ngày, chỉ tính set
/// làm thật (khởi động bị loại).
///
/// Loại bài và cân nặng ngày tập (#417): bài bodyweight hiện cân nặng + tạ
/// đeo, như `lastSetText`. Trend / e1RM / kỷ lục theo cửa sổ thuộc màn Insight,
/// không thuộc dòng này.
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
  /// Loại bài, xác định trên CẢ cửa sổ — không theo từng buổi (#417).
  public let kind: ExerciseKind
  /// Cân nặng ngày tập (`bodyweightOn`); `nil` = không biết, không phải 0.
  public let bodyweightKg: Double?

  public init(
    exerciseKey: String, exerciseName: String, sessionId: String, at: EpochMillis, date: LocalDate, setCount: Int,
    totalReps: Int, totalVolumeKg: Double, topSet: TopSet?, bestDurationSec: Int?, kind: ExerciseKind = .compound,
    bodyweightKg: Double? = nil
  ) {
    self.exerciseKey = exerciseKey
    self.exerciseName = exerciseName
    self.sessionId = sessionId
    self.at = at
    self.date = date
    self.setCount = setCount
    self.totalReps = totalReps
    self.totalVolumeKg = totalVolumeKg
    self.topSet = topSet
    self.bestDurationSec = bestDurationSec
    self.kind = kind
    self.bodyweightKg = bodyweightKg
  }

  /// Cache trước #417 không có `kind` / `bodyweightKg`: compound, không biết.
  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    exerciseKey = try c.decode(String.self, forKey: .exerciseKey)
    exerciseName = try c.decode(String.self, forKey: .exerciseName)
    sessionId = try c.decode(String.self, forKey: .sessionId)
    at = try c.decode(EpochMillis.self, forKey: .at)
    date = try c.decode(LocalDate.self, forKey: .date)
    setCount = try c.decode(Int.self, forKey: .setCount)
    totalReps = try c.decode(Int.self, forKey: .totalReps)
    totalVolumeKg = try c.decode(Double.self, forKey: .totalVolumeKg)
    topSet = try c.decodeIfPresent(TopSet.self, forKey: .topSet)
    bestDurationSec = try c.decodeIfPresent(Int.self, forKey: .bestDurationSec)
    kind = try c.decodeIfPresent(ExerciseKind.self, forKey: .kind) ?? .compound
    bodyweightKg = try c.decodeIfPresent(Double.self, forKey: .bodyweightKg)
  }

  /// Thứ màn hiện, không kèm đơn vị/chữ (bản địa hoá là việc của C):
  /// set giữ chỉ có thời gian, hoặc tạ × reps (tạ 0 = bodyweight).
  public enum Display: Sendable, Hashable {
    case hold(seconds: Int)
    case bodyweight(reps: Int)
    case loaded(weightKg: Double, reps: Int)
  }

  /// `lastSetText`, với set đỉnh thật thay cho cặp max ghép rời. Bài
  /// bodyweight: tạ = cân nặng ngày tập + tạ đeo (`exercise-progress.tsx:84`);
  /// không biết cân nặng thì chỉ tạ đeo, như baseline.
  public var display: Display? {
    if let d = bestDurationSec, topSet == nil { return .hold(seconds: d) }
    guard let top = topSet else { return nil }
    let body = kind == .bodyweight ? (bodyweightKg ?? 0) : 0
    let load = WorkoutMath.round2(body + top.weightKg)
    return load > 0 ? .loaded(weightKg: load, reps: top.reps) : .bodyweight(reps: top.reps)
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
  ///
  /// Loại bài xác định trên MỌI set làm thật của bài trong `rows` trước khi
  /// xét buổi nào (`performancesFrom`, `:210`): hỏi theo từng buổi thì một
  /// ngày hít xà tay không đổi cả lịch sử hít xà đeo đai thành bodyweight.
  /// `declaredKinds`: `exercises.exercise_kind` theo `exerciseKey` — native
  /// chưa có thư viện bài (#420), nên thường rỗng, như phần lớn set của RN.
  public static func lastByExercise(
    _ rows: [SessionHistoryRow], weighIns: [WeighIn] = [], declaredKinds: [String: String] = [:],
    knownKinds: [String: ExerciseKind] = [:], timeZone: TimeZone
  ) -> [String: LastPerformance] {
    var allSets: [String: [RecordSet]] = [:]
    for row in rows {
      for s in PersonalRecords.sets(fromJSON: row.sets) where working(s) {
        let key = PersonalRecords.exerciseKey(s.exerciseName)
        if !key.isEmpty { allSets[key, default: []].append(s) }
      }
    }
    var kinds: [String: ExerciseKind] = [:]
    for (key, sets) in allSets {
      kinds[key] = declaredKinds[key].flatMap(ExerciseKind.init(rawValue:)) ?? knownKinds[key]
        ?? ExerciseKind.resolve(declared: nil, sets: sets)
    }
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
        let date = LocalDate(row.at, in: timeZone)
        out[key] = summarize(
          key: key, name: last.exerciseName, row: row, sets: sets, kind: kinds[key] ?? .compound,
          bodyweightKg: WeighIn.bodyweight(on: date, weighIns), timeZone: timeZone)
      }
    }
    return out
  }

  /// `working`: không khởi động, tạ hữu hạn ≥ 0, có rep hoặc có thời gian giữ.
  static func working(_ s: RecordSet) -> Bool {
    !s.warmup && s.weightKg.isFinite && s.weightKg >= 0 && (s.reps >= 1 || (s.durationSec ?? 0) > 0)
  }

  static func summarize(
    key: String, name: String, row: SessionHistoryRow, sets: [RecordSet], kind: ExerciseKind, bodyweightKg: Double?,
    timeZone: TimeZone
  ) -> LastPerformance {
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
      totalReps: totalReps, totalVolumeKg: WorkoutMath.round2(volume), topSet: top, bestDurationSec: hold,
      kind: kind, bodyweightKg: bodyweightKg)
  }
}

/// Nguồn lịch sử cho "lần trước" (`ASCNDBackend.SupabasePerformanceSource`).
public protocol PerformanceSource: Sendable {
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow]
  /// Các lần cân trong cửa sổ (`useWeightHistory(days)`, `weight_logs`).
  func weighIns(userId: String, since: LocalDate) async throws -> [WeighIn]
}

extension PerformanceSource {
  /// Nguồn không biết cân nặng: bài bodyweight hiện tạ đeo, như baseline khi
  /// chưa cân lần nào.
  public func weighIns(userId: String, since: LocalDate) async throws -> [WeighIn] { [] }
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
  /// Lần cân của lần làm mới gần nhất — để buổi vừa chốt cũng có cân nặng.
  @ObservationIgnored private var weighIns: [WeighIn] = []

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
    // Cân nặng hỏng thì vẫn có "lần trước", chỉ thiếu phần cơ thể (RN:
    // `weights.data ?? []`).
    let from = LocalDate(since, in: timeZone)
    weighIns = (try? await source.weighIns(userId: userId, since: from)) ?? weighIns
    table = PerformanceHistory.lastByExercise(rows, weighIns: weighIns, timeZone: timeZone)
    try? await cache.save(userId: userId, table)
  }

  /// Buổi vừa chốt (hàng outbox: `id`, `date_time`, `sets`) thành "lần trước".
  /// Bản ghi lại (#296, #398) thay hẳn phần của buổi ấy: bài vừa bị gỡ hết set
  /// không còn trỏ vào buổi này.
  public func absorb(row: JSONValue) async {
    guard let id = row["id"]?.stringValue, let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return }
    // Loại bài đã biết từ cả cửa sổ thắng phần suy từ một buổi lẻ.
    let known = table.mapValues(\.kind)
    table = table.filter { $0.value.sessionId != id }
    let fresh = PerformanceHistory.lastByExercise(
      [SessionHistoryRow(id: id, at: at, sets: row["sets"])], weighIns: weighIns, knownKinds: known, timeZone: timeZone)
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
