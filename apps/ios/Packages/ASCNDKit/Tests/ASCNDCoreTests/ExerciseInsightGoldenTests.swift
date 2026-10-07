@testable import ASCNDCore
import Foundation
import Testing

/// Exercise Insights (#419) so với CHÍNH mã RN @ fac9ac2: `insights-golden.json`
/// là đầu ra của `performancesFrom` / `insightsFrom` biên dịch từ
/// `native/src/lib` (`apps/ios/tools/insights-golden`), chạy ở múi Sài Gòn.
/// So từng trường, đúng từng bit của số — không dung sai.
struct ExerciseInsightGoldenTests {
  struct Case {
    let name: String
    let rows: [SessionHistoryRow]
    let weighIns: [WeighIn]
    let declared: [String: String]
    let now: EpochMillis
    let performances: [JSONValue]
    let insights: [JSONValue]
  }

  static let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  static func cases() throws -> [Case] {
    let url = try #require(Bundle.module.url(forResource: "insights-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let list)? = root["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    return try list.map { c in
      func array(_ k: String) -> [JSONValue] {
        if case .array(let a)? = c[k] { return a }
        return []
      }
      var declared: [String: String] = [:]
      if case .object(let o)? = c["declaredKinds"] {
        for (k, v) in o { declared[k] = v.stringValue }
      }
      return Case(
        name: c["name"]?.stringValue ?? "?",
        rows: try array("sessions").map {
          SessionHistoryRow(
            id: $0["id"]?.stringValue ?? "",
            at: try #require($0["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) }), sets: $0["sets"])
        },
        weighIns: try array("weighIns").map {
          WeighIn(date: try #require($0["date"]?.stringValue.flatMap(LocalDate.init)), kg: $0["value"]?.doubleValue ?? 0)
        },
        declared: declared,
        now: try #require(c["now"]?.stringValue.flatMap { EpochMillis(iso8601: $0) }),
        performances: array("performances"), insights: array("insights"))
    }
  }

  @Test func performancesMatchRN() throws {
    let all = try Self.cases()
    #expect(all.count == 6)
    for c in all {
      let got = PerformanceHistory.performances(c.rows, weighIns: c.weighIns, declaredKinds: c.declared, timeZone: Self.saigon)
      #expect(got.map(Self.json) == c.performances, "\(c.name)")
    }
  }

  @Test func insightsMatchRN() throws {
    for c in try Self.cases() {
      let perfs = PerformanceHistory.performances(c.rows, weighIns: c.weighIns, declaredKinds: c.declared, timeZone: Self.saigon)
      let got = ExerciseTrend.insights(perfs, today: LocalDate(c.now, in: Self.saigon), now: c.now)
      #expect(got.count == c.insights.count, "\(c.name)")
      for (g, want) in zip(got, c.insights) {
        #expect(Self.json(g) == want, "\(c.name) · \(g.exerciseKey)")
      }
    }
  }

  /// Các ca phải phủ đủ mọi nhánh của RN, không thì golden không nói gì.
  @Test func goldenCoversEveryVerdict() throws {
    let multi = try #require(try Self.cases().first { $0.name == "multi" })
    let later = try #require(try Self.cases().first { $0.name == "later" })
    let trends = Set((multi.insights + later.insights).compactMap { $0["trend"]?.stringValue })
    #expect(trends == ["IMPROVING", "PLATEAU", "DECLINING", "INSUFFICIENT_DATA"])
    let readiness = Set(multi.insights.compactMap { $0["readiness"]?.stringValue })
    #expect(readiness == ["NOT_READY", "MAINTAIN", "READY_TO_PROGRESS"])
    let confidence = Set(multi.insights.compactMap { $0["confidence"]?.stringValue })
    #expect(confidence == ["none", "low", "medium", "high"])
    let kinds = Set(multi.performances.compactMap { $0["kind"]?.stringValue })
    #expect(kinds == ["compound", "bodyweight", "timed", "isolation"])
  }

  // MARK: - Swift → hình JSON của RN

  static func num(_ v: Double?) -> JSONValue { v.map(JSONValue.number) ?? .null }
  static func num(_ v: Int?) -> JSONValue { v.map { .number(Double($0)) } ?? .null }

  static func json(_ r: PersonalRecord) -> JSONValue {
    var o: [String: JSONValue] = [
      "exercise": .string(r.exercise), "kind": .string(r.kind.rawValue), "value": .number(r.value),
      "previous": .number(r.previous),
    ]
    if let w = r.atWeight { o["atWeight"] = .number(w) }
    return .object(o)
  }

  static func json(_ p: ExercisePerformance) -> JSONValue {
    .object([
      "exerciseKey": .string(p.exerciseKey), "exerciseName": .string(p.exerciseName),
      "sessionId": .string(p.sessionId), "at": .string(WorkoutSessionRecord.iso8601(p.at)),
      "date": .string(p.date.description), "kind": .string(p.kind.rawValue),
      "setCount": num(p.setCount), "totalReps": num(p.totalReps), "totalVolumeKg": num(p.totalVolumeKg),
      "bestWeightKg": num(p.bestWeightKg), "bestReps": num(p.bestReps), "bestE1rmKg": num(p.bestE1rmKg),
      "bestDurationSec": num(p.bestDurationSec), "records": .array(p.records.map(json)),
      "bodyweightKg": num(p.bodyweightKg),
    ])
  }

  static func json(_ e: ExerciseTrend.Evidence) -> JSONValue {
    switch e {
    case .series(let unit, let values, let dates):
      return .object([
        "kind": .string("series"), "unit": .string(unit.rawValue), "values": .array(values.map(JSONValue.number)),
        "dates": .array(dates.map { .string($0.description) }),
      ])
    case .bestSets(let sets):
      return .object(["kind": .string("best-sets"), "values": .array(sets.map {
        .object([
          "weightKg": num($0.weightKg), "reps": num($0.reps), "durationSec": num($0.durationSec),
          "bodyweightKg": num($0.bodyweightKg),
        ])
      })])
    case .bestSet(let w, let r):
      return .object(["kind": .string("best-set"), "weightKg": num(w), "reps": num(r)])
    case .e1rm(let v):
      return .object(["kind": .string("e1rm"), "value": .number(v)])
    case .change(let from, let to, let unit, let pct):
      return .object([
        "kind": .string("change"), "from": .number(from), "to": .number(to), "unit": .string(unit.rawValue), "pct": .number(pct),
      ])
    case .noUpwardTrend(let n):
      return .object(["kind": .string("no-upward-trend"), "sessions": num(n)])
    case .tooFewSessions(let have, let need):
      return .object(["kind": .string("too-few-sessions"), "have": num(have), "need": num(need)])
    case .bodyweightUnknown:
      return .object(["kind": .string("bodyweight-unknown")])
    case .lastTrained(let days, let stale):
      return .object(["kind": .string("last-trained"), "days": num(days), "stale": .bool(stale)])
    case .volatile(let spread):
      return .object(["kind": .string("volatile"), "spread": .number(spread)])
    case .windowBest(let of, let value, let previous, let at, let days):
      return .object([
        "kind": .string("window-best"), "of": .string(of.rawValue), "value": .number(value), "previous": .number(previous),
        "atWeightKg": num(at), "daysAgo": num(days),
      ])
    }
  }

  static func json(_ i: ExerciseInsight) -> JSONValue {
    .object([
      "exerciseKey": .string(i.exerciseKey), "lastTrainedDays": num(i.lastTrainedDays), "stale": .bool(i.stale),
      "exerciseName": .string(i.exerciseName), "kind": .string(i.kind.rawValue), "trend": .string(i.trend.rawValue),
      "readiness": .string(i.readiness.rawValue), "confidence": .string(i.confidence.rawValue),
      "sessions": num(i.sessions), "current": num(i.current), "previous": num(i.previous),
      "changePct": num(i.changePct), "unit": .string(i.unit.rawValue), "bestWeightKg": num(i.bestWeightKg),
      "bestReps": num(i.bestReps), "bestE1rmKg": num(i.bestE1rmKg), "bestDurationSec": num(i.bestDurationSec),
      "evidence": .array(i.evidence.map(json)),
    ])
  }
}
