public import Foundation
public import Observation

// Exercise Insights (#419) — màn "Phân tích bài tập" (`app/exercise-insight.tsx`).
//
// Nguồn baseline (`fac9ac2`), port nguyên công thức, không thêm chỉ số nào:
// - `useExerciseInsights` (`hooks/use-exercise-insights.ts`): 90 ngày buổi
//   tập + 90 ngày cân nặng + loại bài khai báo → `performancesFrom` → `insightsFrom`;
// - `lib/exercise-performance.ts`: mỗi (buổi, bài) một dòng — tổng, cực trị,
//   e1RM (Epley, ≤ 10 rep), kỷ lục so với các buổi TRƯỚC nó;
// - `lib/exercise-trend.ts`: chỉ số tiến bộ theo loại bài, xu hướng (nửa sau
//   so nửa đầu của 6 buổi gần nhất), độ tin, sẵn sàng tăng tải, bằng chứng.
//
// Golden: `Fixtures/insights-golden.json` sinh bằng chính mã RN biên dịch
// (`apps/ios/tools/insights-golden`), không chép tay con số nào.

/// Một bài trong một buổi (`ExercisePerformance`).
public struct ExercisePerformance: Sendable, Hashable, Codable {
  public let exerciseKey: String
  public let exerciseName: String
  public let sessionId: String
  public let at: EpochMillis
  /// Ngày địa phương của buổi (`dayOf`).
  public let date: LocalDate
  public let kind: ExerciseKind
  public let setCount: Int
  public let totalReps: Int
  public let totalVolumeKg: Double
  public let bestWeightKg: Double?
  public let bestReps: Int?
  public let bestE1rmKg: Double?
  public let bestDurationSec: Int?
  /// Kỷ lục của buổi so với các buổi trước nó trong cửa sổ, tốt nhất trước.
  public let records: [PersonalRecord]
  public let bodyweightKg: Double?
}

extension PerformanceHistory {
  /// `E1RM_MAX_REPS`: quá 10 rep thì ước lượng không còn nghĩa.
  public static let e1rmMaxReps = 10

  /// `estimate1rm`: Epley `w × (1 + reps/30)`; 1 rep là chính nó.
  public static func estimate1rm(_ weightKg: Double, reps: Int) -> Double? {
    guard weightKg.isFinite, weightKg > 0, reps >= 1, reps <= e1rmMaxReps else { return nil }
    if reps == 1 { return WorkoutMath.round2(weightKg) }
    return WorkoutMath.round2(weightKg * (1 + Double(reps) / 30))
  }

  /// `usesE1rm`: chỉ bài nặng và bài bodyweight.
  static func usesE1rm(_ kind: ExerciseKind) -> Bool { kind == .compound || kind == .bodyweight }

  /// `performancesFrom`: mọi (buổi, bài) trong `rows`, cũ trước.
  ///
  /// Loại bài quyết định trên MỌI set làm thật của bài trước khi xét buổi nào;
  /// kỷ lục của một buổi so với lịch sử TRƯỚC nó, và cả buổi được gộp vào lịch
  /// sử SAU khi mọi bài của nó đã xét (squat và bench cùng ngày không thành
  /// lịch sử của nhau).
  public static func performances(
    _ rows: [SessionHistoryRow], weighIns: [WeighIn] = [], declaredKinds: [String: String] = [:],
    timeZone: TimeZone
  ) -> [ExercisePerformance] {
    var allSets: [String: [RecordSet]] = [:]
    for row in rows {
      for s in PersonalRecords.sets(fromJSON: row.sets) where working(s) {
        let key = PersonalRecords.exerciseKey(s.exerciseName)
        if !key.isEmpty { allSets[key, default: []].append(s) }
      }
    }
    var kinds: [String: ExerciseKind] = [:]
    for (key, sets) in allSets { kinds[key] = ExerciseKind.resolve(declared: declaredKinds[key], sets: sets) }

    // Cũ → mới; cùng thời điểm giữ thứ tự đến (sort của JS ổn định).
    let ordered = rows.enumerated().sorted { a, b in
      a.element.at != b.element.at ? a.element.at < b.element.at : a.offset < b.offset
    }.map(\.element)
    var prior: [String: [RecordSet]] = [:]
    var out: [ExercisePerformance] = []
    for row in ordered {
      let date = LocalDate(row.at, in: timeZone)
      let bodyweightKg = WeighIn.bodyweight(on: date, weighIns)
      var byExercise: [String: [RecordSet]] = [:]
      var order: [String] = []
      for s in PersonalRecords.sets(fromJSON: row.sets) where working(s) {
        let key = PersonalRecords.exerciseKey(s.exerciseName)
        guard !key.isEmpty else { continue }
        if byExercise[key] == nil { order.append(key) }
        byExercise[key, default: []].append(s)
      }
      for key in order {
        guard let sets = byExercise[key], let lastSet = sets.last else { continue }
        let kind = kinds[key] ?? .compound
        let priorSets = prior[key] ?? []
        let records = priorSets.isEmpty ? [] : PersonalRecords.findRecords(sets, bests: PersonalRecords.bests(from: priorSets))
        var totalReps = 0
        var volume = 0.0
        var bestWeight: Double?
        var bestReps: Int?
        var bestE1rm: Double?
        var bestHold: Int?
        for s in sets {
          let reps = max(0, s.reps)
          let w = WorkoutMath.round2(s.weightKg)
          totalReps += reps
          volume += w * Double(reps)
          if reps > 0 {
            if bestWeight.map({ w > $0 }) ?? true { bestWeight = w }
            if bestReps.map({ reps > $0 }) ?? true { bestReps = reps }
            if usesE1rm(kind) {
              // Bài bodyweight được tải bởi cơ thể: không biết cân nặng thì
              // không có ước lượng (không phải ước lượng của riêng tạ đeo).
              let load = kind == .bodyweight ? bodyweightKg.map { $0 + w } : w
              if let e = load.flatMap({ estimate1rm($0, reps: reps) }), bestE1rm.map({ e > $0 }) ?? true {
                bestE1rm = e
              }
            }
          }
          if let d = s.durationSec, d > 0, bestHold.map({ d > $0 }) ?? true { bestHold = d }
        }
        out.append(ExercisePerformance(
          exerciseKey: key, exerciseName: lastSet.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines),
          sessionId: row.id, at: row.at, date: date, kind: kind, setCount: sets.count, totalReps: totalReps,
          totalVolumeKg: WorkoutMath.round2(volume), bestWeightKg: bestWeight, bestReps: bestReps,
          bestE1rmKg: bestE1rm, bestDurationSec: bestHold, records: records, bodyweightKg: bodyweightKg))
      }
      for key in order { prior[key, default: []].append(contentsOf: byExercise[key] ?? []) }
    }
    return out.enumerated().sorted { a, b in
      a.element.at != b.element.at ? a.element.at < b.element.at : a.offset < b.offset
    }.map(\.element)
  }
}

/// `lib/exercise-trend.ts`.
public enum ExerciseTrend {
  public enum Trend: String, Sendable, Hashable, Codable {
    case improving = "IMPROVING", stable = "STABLE", plateau = "PLATEAU", declining = "DECLINING"
    case insufficientData = "INSUFFICIENT_DATA"

    /// Thứ tự danh sách: thứ cần người đọc nhất lên trước.
    var rank: Int {
      switch self {
      case .declining: 0
      case .plateau: 1
      case .improving: 2
      case .stable: 3
      case .insufficientData: 4
      }
    }
  }

  public enum Readiness: String, Sendable, Hashable, Codable {
    case notReady = "NOT_READY", maintain = "MAINTAIN", readyToProgress = "READY_TO_PROGRESS"
  }

  /// `Confidence` (`user-state.ts:65`).
  public enum Confidence: String, Sendable, Hashable, Codable { case none, low, medium, high }

  public enum IndexUnit: String, Sendable, Hashable, Codable {
    case kg, kgRep = "kg-rep", sec
  }

  /// `MIN_SESSIONS` (`load-progression.ts:87`).
  public static let minSessions = 3
  public static let plateauSessions = 4
  public static let meaningfulChange = 0.03
  public static let trendWindow = 6
  public static let staleFloorDays = 21
  public static let volatileAbove = 0.15

  public static func indexUnit(_ kind: ExerciseKind) -> IndexUnit {
    switch kind {
    case .timed: .sec
    case .compound: .kg
    case .bodyweight, .isolation: .kgRep
    }
  }

  /// Một con số "tốt hơn là lớn hơn" cho một buổi, theo loại bài.
  public static func performanceIndex(_ p: ExercisePerformance, bodyweightScale: Bool) -> Double? {
    switch p.kind {
    case .timed:
      return p.bestDurationSec.map(Double.init)
    case .compound:
      return p.bestE1rmKg
    case .bodyweight:
      guard let reps = p.bestReps else { return nil }
      guard bodyweightScale, let bw = p.bodyweightKg else { return Double(reps) }
      return WorkoutMath.round2((bw + (p.bestWeightKg ?? 0)) * Double(reps))
    case .isolation:
      guard let reps = p.bestReps, let w = p.bestWeightKg else { return nil }
      return WorkoutMath.round2(w * Double(reps))
    }
  }

  public struct Reading: Sendable, Hashable {
    public let trend: Trend
    public let lastTrainedDays: Int?
    public let stale: Bool
    public let sessions: Int
    public let current: Double?
    public let previous: Double?
    public let changePct: Double?
    public let unit: IndexUnit
    public let series: [Double]
    public let dates: [LocalDate]
    public let bodyweightUnknown: Bool
  }

  /// `dayGap`: số ngày lịch giữa hai ngày (không qua giờ, nên không lệch DST).
  static func dayGap(_ from: LocalDate, _ to: LocalDate) -> Int { to.daysSinceEpoch - from.daysSinceEpoch }

  static func medianGapDays(_ dates: [LocalDate]) -> Double? {
    guard dates.count >= 2 else { return nil }
    var gaps: [Int] = []
    for i in 1..<dates.count {
      let g = dayGap(dates[i - 1], dates[i])
      if g > 0 { gaps.append(g) }
    }
    guard !gaps.isEmpty else { return nil }
    gaps.sort()
    let mid = gaps.count / 2
    return gaps.count % 2 == 1 ? Double(gaps[mid]) : Double(gaps[mid - 1] + gaps[mid]) / 2
  }

  /// `readTrend`: 6 buổi gần nhất, một thang cho cả cửa sổ; nửa sau so nửa
  /// đầu (lẻ thì bỏ buổi giữa), mỗi nửa lấy đỉnh.
  public static func readTrend(_ history: [ExercisePerformance], today: LocalDate) -> Reading {
    let kind = history.last?.kind ?? .compound
    let unit = indexUnit(kind)
    let window = Array(history.suffix(trendWindow))
    let measurable = window.filter { performanceIndex($0, bodyweightScale: false) != nil }
    let bodyweightUnknown = kind == .bodyweight && measurable.contains { $0.bodyweightKg == nil }
    var series: [Double] = []
    var dates: [LocalDate] = []
    for p in window {
      if let v = performanceIndex(p, bodyweightScale: !bodyweightUnknown), v.isFinite {
        series.append(v)
        dates.append(p.date)
      }
    }
    let lastTrainedDays = dates.last.map { max(0, dayGap($0, today)) }
    let gap = medianGapDays(dates)
    let stale = lastTrainedDays.map { Double($0) > max(Double(staleFloorDays), (gap ?? 0) * 2) } ?? false
    func reading(_ trend: Trend, _ current: Double?, _ previous: Double?, _ change: Double?) -> Reading {
      Reading(
        trend: trend, lastTrainedDays: lastTrainedDays, stale: stale, sessions: series.count, current: current,
        previous: previous, changePct: change, unit: unit, series: series, dates: dates,
        bodyweightUnknown: bodyweightUnknown)
    }
    guard series.count >= minSessions else { return reading(.insufficientData, nil, nil, nil) }
    let half = series.count / 2
    let previous = series.prefix(half).max()!
    let current = series.suffix(half).max()!
    let change = previous > 0 ? (current - previous) / previous : nil
    let trend: Trend
    if let change {
      if change >= meaningfulChange {
        trend = .improving
      } else if change <= -meaningfulChange {
        trend = .declining
      } else {
        trend = series.count >= plateauSessions ? .plateau : .stable
      }
    } else {
      trend = .insufficientData
    }
    return reading(trend, current, previous, change)
  }

  /// Sụt sâu nhất từ một đỉnh trước đó, theo tỉ lệ của đỉnh.
  public static func worstDrawdown(_ series: [Double]) -> Double {
    var best = -Double.infinity
    var worst = 0.0
    for v in series {
      if best > 0 { worst = max(worst, (best - v) / best) }
      if v > best { best = v }
    }
    return worst
  }

  public static func confidence(_ t: Reading) -> Confidence {
    if t.sessions == 0 { return .none }
    if t.sessions < minSessions || t.stale || worstDrawdown(t.series) > volatileAbove { return .low }
    if t.bodyweightUnknown { return .medium }
    return t.sessions >= plateauSessions ? .high : .medium
  }

  public static func readiness(_ t: Reading) -> Readiness {
    if t.trend == .insufficientData || t.trend == .declining { return .notReady }
    if t.stale || t.trend != .improving { return .maintain }
    let c = confidence(t)
    if c == .low || c == .none { return .notReady }
    guard let last = t.series.last, let peak = t.series.max() else { return .maintain }
    return last >= peak * (1 - meaningfulChange) ? .readyToProgress : .maintain
  }

  /// `Math.round` của JS (nửa làm tròn LÊN, cả với số âm).
  static func jsRound3(_ x: Double) -> Double { (x * 1000 + 0.5).rounded(.down) / 1000 }

  /// Vì sao màn nói điều nó nói — mỗi dòng một sự thật đọc được (`Evidence`).
  public enum Evidence: Sendable, Hashable {
    public struct BestSet: Sendable, Hashable {
      public let weightKg: Double?
      public let reps: Int?
      public let durationSec: Int?
      public let bodyweightKg: Double?
    }
    case series(unit: IndexUnit, values: [Double], dates: [LocalDate])
    case bestSets([BestSet])
    case bestSet(weightKg: Double?, reps: Int?)
    case e1rm(Double)
    case change(from: Double, to: Double, unit: IndexUnit, pct: Double)
    case noUpwardTrend(sessions: Int)
    case tooFewSessions(have: Int, need: Int)
    case bodyweightUnknown
    case lastTrained(days: Int, stale: Bool)
    case volatile(spread: Double)
    case windowBest(of: PersonalRecords.Kind, value: Double, previous: Double, atWeightKg: Double?, daysAgo: Int?)
  }
}

/// Phân tích một bài (`ExerciseInsight`).
public struct ExerciseInsight: Sendable, Hashable, Identifiable {
  public var id: String { exerciseKey }
  public let exerciseKey: String
  public let exerciseName: String
  public let kind: ExerciseKind
  public let lastTrainedDays: Int?
  public let stale: Bool
  public let trend: ExerciseTrend.Trend
  public let readiness: ExerciseTrend.Readiness
  public let confidence: ExerciseTrend.Confidence
  public let sessions: Int
  public let current: Double?
  public let previous: Double?
  public let changePct: Double?
  public let unit: ExerciseTrend.IndexUnit
  public let bestWeightKg: Double?
  public let bestReps: Int?
  public let bestE1rmKg: Double?
  public let bestDurationSec: Int?
  public let evidence: [ExerciseTrend.Evidence]
  public let generatedAt: EpochMillis
}

extension ExerciseTrend {
  /// `insightFor`: lịch sử một bài (cũ trước) → phân tích; rỗng → `nil`.
  public static func insight(
    _ history: [ExercisePerformance], today: LocalDate, now: EpochMillis
  ) -> ExerciseInsight? {
    guard let last = history.last else { return nil }
    let t = readTrend(history, today: today)
    let window = Array(history.suffix(trendWindow))
    func pick(_ v: (ExercisePerformance) -> Double?) -> Double? { window.compactMap(v).max() }

    var evidence: [Evidence] = []
    if t.sessions > 0 {
      evidence.append(.series(unit: t.unit, values: t.series, dates: t.dates))
      evidence.append(.bestSets(window.filter { performanceIndex($0, bodyweightScale: false) != nil }.map {
        .init(
          weightKg: $0.bestWeightKg, reps: $0.bestReps, durationSec: $0.bestDurationSec,
          bodyweightKg: $0.kind == .bodyweight ? $0.bodyweightKg : nil)
      }))
    }
    if t.sessions < minSessions { evidence.append(.tooFewSessions(have: t.sessions, need: minSessions)) }
    if let change = t.changePct, let current = t.current, let previous = t.previous {
      evidence.append(.change(from: previous, to: current, unit: t.unit, pct: jsRound3(change)))
    }
    if t.trend == .plateau { evidence.append(.noUpwardTrend(sessions: t.sessions)) }
    if let days = t.lastTrainedDays { evidence.append(.lastTrained(days: days, stale: t.stale)) }
    let spread = worstDrawdown(t.series)
    if t.sessions >= minSessions, spread > volatileAbove { evidence.append(.volatile(spread: jsRound3(spread))) }
    if t.bodyweightUnknown { evidence.append(.bodyweightUnknown) }
    evidence.append(.bestSet(weightKg: last.bestWeightKg, reps: last.bestReps))
    let e1 = pick(\.bestE1rmKg)
    if let e1 { evidence.append(.e1rm(e1)) }
    // Kỷ lục trong cửa sổ: chỉ cái mới nhất — cái còn đúng.
    for p in window.reversed() {
      guard let r = p.records.first else { continue }
      let days = t.lastTrainedDays.map { dayGap(p.date, window.last!.date) + $0 }
      evidence.append(.windowBest(of: r.kind, value: r.value, previous: r.previous, atWeightKg: r.atWeight, daysAgo: days))
      break
    }
    return ExerciseInsight(
      exerciseKey: last.exerciseKey, exerciseName: last.exerciseName, kind: last.kind,
      lastTrainedDays: t.lastTrainedDays, stale: t.stale, trend: t.trend, readiness: readiness(t),
      confidence: confidence(t), sessions: t.sessions, current: t.current, previous: t.previous,
      changePct: t.changePct, unit: t.unit, bestWeightKg: pick(\.bestWeightKg),
      bestReps: pick { $0.bestReps.map(Double.init) }.map { Int($0) }, bestE1rmKg: e1,
      bestDurationSec: pick { $0.bestDurationSec.map(Double.init) }.map { Int($0) }, evidence: evidence,
      generatedAt: now)
  }

  /// `insightsFrom`: mọi bài, xếp theo xu hướng (giảm → chững → tiến → ổn →
  /// chưa đủ), rồi bài bỏ lâu trước, rồi bài nhiều buổi trước. Cùng hạng giữ
  /// thứ tự xuất hiện (sort của JS ổn định).
  public static func insights(
    _ performances: [ExercisePerformance], today: LocalDate, now: EpochMillis
  ) -> [ExerciseInsight] {
    var byKey: [String: [ExercisePerformance]] = [:]
    var order: [String] = []
    for p in performances {
      if byKey[p.exerciseKey] == nil { order.append(p.exerciseKey) }
      byKey[p.exerciseKey, default: []].append(p)
    }
    let out = order.compactMap { insight(byKey[$0] ?? [], today: today, now: now) }
    return out.enumerated().sorted { x, y in
      let a = x.element, b = y.element
      if a.trend.rank != b.trend.rank { return a.trend.rank < b.trend.rank }
      if a.stale != b.stale { return a.stale }
      if a.sessions != b.sessions { return a.sessions > b.sessions }
      return x.offset < y.offset
    }.map(\.element)
  }
}

// MARK: - Read model

/// Bản lưu trên máy của phân tích: chính các hàng buổi tập và lần cân của
/// cửa sổ — phân tích tính lại từ đây (nó phụ thuộc "hôm nay").
public struct InsightSnapshot: Sendable, Hashable, Codable {
  public let rows: [SessionHistoryRow]
  public let weighIns: [WeighIn]

  public init(rows: [SessionHistoryRow], weighIns: [WeighIn]) {
    self.rows = rows
    self.weighIns = weighIns
  }
}

public protocol InsightCache: Sendable {
  func load(userId: String) async throws -> InsightSnapshot?
  func save(userId: String, _ snapshot: InsightSnapshot) async throws
}

/// Phân tích bài tập, local-first — cùng mẫu với `HistoryBook`.
///
/// RN behavior: mỗi lần mở màn đọc lại 90 ngày; offline thì lỗi, không có gì.
/// Native behavior: bản trên máy hiện ngay (kể cả offline); buổi vừa chốt /
///   vừa xoá đổi phân tích ngay (`absorb` / `forget`), không đợi sync. Phân
///   tích luôn tính lại từ hàng buổi tập — một công thức, một chỗ.
@MainActor @Observable
public final class InsightBook {
  public let userId: String
  /// Mọi (buổi, bài) trong cửa sổ, cũ trước.
  public private(set) var performances: [ExercisePerformance] = []
  /// Theo thứ tự của màn (`insightsFrom`).
  public private(set) var insights: [ExerciseInsight] = []
  public private(set) var loaded = false
  public private(set) var failure: TodayController.RefreshFailure?

  @ObservationIgnored private let source: any PerformanceSource
  @ObservationIgnored private let cache: any InsightCache
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var rows: [SessionHistoryRow] = []
  @ObservationIgnored private var weighIns: [WeighIn] = []
  /// Loại bài khai báo trong thư viện (`exercises.exercise_kind`, #420).
  @ObservationIgnored public var declaredKinds: [String: String] = [:] {
    didSet { recompute() }
  }

  public init(
    userId: String, source: any PerformanceSource, cache: any InsightCache,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.clock = clock
    self.timeZone = timeZone
  }

  /// Lịch sử một bài (cũ trước) — cho biểu đồ của C.
  public func history(for name: String) -> [ExercisePerformance] {
    let key = PersonalRecords.exerciseKey(name)
    return performances.filter { $0.exerciseKey == key }
  }

  public func insight(for name: String) -> ExerciseInsight? {
    let key = PersonalRecords.exerciseKey(name)
    return insights.first { $0.exerciseKey == key }
  }

  /// Bản trên máy trước, rồi server.
  public func load() async {
    if !loaded, let cached = try? await cache.load(userId: userId) {
      rows = cached.rows
      weighIns = cached.weighIns
      loaded = true
      recompute()
    }
    await refresh()
  }

  public func refresh() async {
    let since = clock.nowMillis() - Int64(PerformanceHistory.windowDays) * 86_400_000
    do {
      let fresh = try await source.sessions(userId: userId, since: since)
      // Cân nặng hỏng thì vẫn phân tích được, chỉ thiếu thang cơ thể (RN:
      // `weights.data ?? []`; ở đây giữ lần cân đã biết).
      weighIns = (try? await source.weighIns(userId: userId, since: LocalDate(since, in: timeZone))) ?? weighIns
      rows = fresh
      loaded = true
      failure = nil
      recompute()
      try? await cache.save(userId: userId, InsightSnapshot(rows: rows, weighIns: weighIns))
    } catch {
      failure = TodayController.failure([error])
    }
  }

  /// Hàng outbox vừa bền (chốt / nối / gỡ set): buổi ấy thay bản cũ của nó.
  public func absorb(row: JSONValue) async {
    guard let id = row["id"]?.stringValue,
      let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return }
    rows.removeAll { $0.id == id }
    rows.append(SessionHistoryRow(id: id, at: at, sets: row["sets"]))
    loaded = true
    recompute()
    try? await cache.save(userId: userId, InsightSnapshot(rows: rows, weighIns: weighIns))
  }

  /// Buổi bị xoá trên máy (gỡ set cuối cùng #398, xoá từ lịch sử #400).
  public func forget(sessionId: String) async {
    let before = rows.count
    rows.removeAll { $0.id == sessionId }
    guard rows.count != before else { return }
    recompute()
    try? await cache.save(userId: userId, InsightSnapshot(rows: rows, weighIns: weighIns))
  }

  /// Tính lại từ hàng — gọi khi "hôm nay" đổi (ra tiền cảnh sau nửa đêm).
  public func recompute() {
    let now = clock.nowMillis()
    let since = now - Int64(PerformanceHistory.windowDays) * 86_400_000
    // Bản cache / buổi nuốt vào có thể đã trượt khỏi cửa sổ 90 ngày.
    let window = rows.filter { $0.at >= since }
    performances = PerformanceHistory.performances(
      window, weighIns: weighIns, declaredKinds: declaredKinds, timeZone: timeZone)
    insights = ExerciseTrend.insights(performances, today: LocalDate(now, in: timeZone), now: now)
  }
}
