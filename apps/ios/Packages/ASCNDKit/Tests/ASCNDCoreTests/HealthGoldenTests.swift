@testable import ASCNDCore
import Foundation
import Testing

/// Đồng bộ Apple Health so với CHÍNH mã RN (`health.ts`, `step-days.ts`,
/// `health-days.ts`) chạy trên HealthKit giả ở sáu múi giờ
/// (`apps/ios/tools/health-golden`): cùng mẫu HealthKit vào, cùng giấc ngủ /
/// sinh trắc / buổi tập / bước / ngày bị chạm ra, và cùng cửa sổ truy vấn.
struct HealthGoldenTests {
  static func ms(_ v: JSONValue?) -> EpochMillis? { v?.stringValue.flatMap { EpochMillis(iso8601: $0) } }
  static func int(_ v: Int?) -> JSONValue { v.map { .number(Double($0)) } ?? .null }

  static func sleepJSON(_ s: HealthData.Sleep?) -> JSONValue {
    guard let s else { return .null }
    return .object([
      "external_id": .string(s.externalId), "bedtime": .string(s.bedtime), "waketime": .string(s.waketime),
      "asleep_min": int(s.asleepMin), "deep_min": int(s.deepMin), "light_min": int(s.lightMin), "rem_min": int(s.remMin),
    ])
  }

  static func bioJSON(_ b: HealthData.Biometrics?) -> JSONValue {
    guard let b else { return .null }
    return .object([
      "hr_bpm": int(b.hrBpm), "hrv_sdnn_ms": int(b.hrvSdnnMs), "spo2_pct": int(b.spo2Pct),
      "resp_rate_rpm": int(b.respRateRpm), "source": .string(HealthData.appleSource), "date_time": .string(b.dateTime),
      "external_id": b.externalId.map(JSONValue.string) ?? .null, "confidence": .number(1),
    ])
  }

  static func workoutJSON(_ w: HealthData.Workout) -> JSONValue {
    .object([
      "external_id": .string(w.externalId), "date_time": .string(w.dateTime), "minutes": int(w.minutes),
      "kcal": int(w.kcal), "activity_type": int(w.activityType),
    ])
  }

  static func external(_ v: JSONValue) -> String? { v["metadata"]?["HKExternalUUID"]?.stringValue }

  @Test func everyCaseMatchesRN() throws {
    let url = try #require(Bundle.module.url(forResource: "health-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let cases)? = root["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    var checked = 0
    for c in cases {
      if case .array(let names)? = c["names"] {
        for n in names {
          #expect(
            HealthData.activityName(n["type"]?.intValue ?? -1, lang: n["lang"]?.stringValue ?? "") == n["name"]?.stringValue)
        }
        continue
      }
      let tz = try #require(TimeZone(identifier: c["tz"]?.stringValue ?? ""))
      let now = try #require(Self.ms(c["now"]))
      let today = try #require(LocalDate(c["today"]?.stringValue ?? ""))
      let label = "\(c["tz"]?.stringValue ?? "") \(c["now"]?.stringValue ?? "")"
      #expect(LocalDate(now, in: tz) == today, "\(label): hôm nay")
      let f = try #require(c["fixture"]), e = try #require(c["expected"])

      func array(_ v: JSONValue?) -> [JSONValue] {
        if case .array(let a)? = v { return a }
        return []
      }
      let sleep = HealthData.lastNight(
        try array(f["sleep"]).map {
          HealthData.SleepSample(
            start: try #require(Self.ms($0["startDate"])), end: try #require(Self.ms($0["endDate"])),
            value: $0["value"]?.intValue ?? -1, externalUUID: Self.external($0))
        })
      #expect(Self.sleepJSON(sleep) == e["sleep"], "\(label): giấc ngủ")

      func reading(_ id: String) -> HealthData.Reading? {
        guard let s = f["latest"]?[id], s != .null, let q = s["quantity"]?.doubleValue, let at = Self.ms(s["startDate"]) else {
          return nil
        }
        return HealthData.Reading(value: q, at: at, uuid: s["uuid"]?.stringValue ?? "")
      }
      let bio = HealthData.latestBiometrics(
        hr: reading("HKQuantityTypeIdentifierRestingHeartRate"),
        hrv: reading("HKQuantityTypeIdentifierHeartRateVariabilitySDNN"),
        spo2: reading("HKQuantityTypeIdentifierOxygenSaturation"),
        resp: reading("HKQuantityTypeIdentifierRespiratoryRate"))
      #expect(Self.bioJSON(bio) == e["bio"], "\(label): sinh trắc")

      let workouts = HealthData.workouts(
        try array(f["workouts"]).map {
          HealthData.WorkoutSample(
            uuid: $0["uuid"]?.stringValue ?? "", start: try #require(Self.ms($0["startDate"])),
            durationSec: $0["duration"]?["quantity"]?.doubleValue, kcal: $0["totalEnergyBurned"]?["quantity"]?.doubleValue,
            activityType: $0["workoutActivityType"]?.intValue ?? 0, externalUUID: Self.external($0))
        })
      #expect(JSONValue.array(workouts.map(Self.workoutJSON)) == e["workouts"], "\(label): buổi tập")

      let steps = HealthData.dailySteps(
        try array(f["stepBuckets"]).map {
          HealthData.StepBucket(start: try #require(Self.ms($0["startDate"])), sum: $0["sumQuantity"]?["quantity"]?.doubleValue)
        }, today: today, in: tz)
      #expect(
        JSONValue.array(steps.map { .object(["date": .string($0.date.description), "steps": Self.int($0.steps)]) })
          == e["stepDays"], "\(label): bước theo ngày")

      #expect(Self.int(HealthData.total(f["totals"]?["HKQuantityTypeIdentifierStepCount"]?.doubleValue)) == e["steps"])
      #expect(Self.int(HealthData.total(f["totals"]?["HKQuantityTypeIdentifierActiveEnergyBurned"]?.doubleValue)) == e["kcal"])
      #expect(Self.int(HealthData.total(f["totals"]?["HKQuantityTypeIdentifierAppleExerciseTime"]?.doubleValue)) == e["minutes"])

      let touched = HealthData.touchedDays(bio: bio != nil, sleep: sleep, workouts: workouts, today: today, in: tz)
      #expect(JSONValue.array(touched.map { .string($0.description) }) == e["touched"], "\(label): ngày bị chạm")

      // Cửa sổ truy vấn HealthKit.
      let w = HealthData.windows(now: now, in: tz)
      for q in array(c["queries"]) {
        let a = q["args"]
        switch q["op"]?.stringValue {
        case "category":
          #expect(Self.ms(a?["start"]) == w.sleepSince && Self.ms(a?["end"]) == now, "\(label): cửa sổ ngủ")
        case "quantity", "workouts":
          #expect(Self.ms(a?["start"]) == w.weekAgo, "\(label): 7 ngày")
        case "statistics":
          #expect(Self.ms(a?["start"]) == w.todayStart && Self.ms(a?["end"]) == now, "\(label): từ nửa đêm")
        case "collection":
          #expect(Self.ms(a?["anchor"]) == w.todayStart && Self.ms(a?["start"]) == w.stepHistoryStart, "\(label): 14 ngày bước")
        default:
          Issue.record("\(label): truy vấn lạ \(q)")
        }
      }
      checked += 1
    }
    #expect(checked >= 200)
  }
}
