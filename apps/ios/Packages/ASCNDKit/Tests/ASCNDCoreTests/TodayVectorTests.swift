import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Runner Swift cho `spec/vectors/today-controller.json` — đọc CHÍNH tệp
/// vector: TC-1 `TodayRules.cta`, TC-2 ngày tương lai của controller, TC-3
/// khoá tiến trình ngày, TC-4 bằng chứng buổi đã ghi (`sessionTicks` /
/// `mergeProgress`). Ca không có phép kiểm → đỏ.
@MainActor
struct TodayVectorTests {
  private static let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
  private static let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  private static let today = LocalDate("2026-10-05")!

  private static func cases() throws -> [JSONValue] {
    let url = RepoPaths.specVectors.appendingPathComponent("today-controller.json")
    let doc = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let list)? = doc["vectors"] else { return [] }
    return list
  }

  private static func rows(_ input: JSONValue?) -> [(key: String, exerciseName: String)] {
    guard case .array(let a)? = input?["rows"] else { return [] }
    return a.map { ($0["key"]?.stringValue ?? "", $0["exerciseName"]?.stringValue ?? "") }
  }

  private static func setNames(_ input: JSONValue?) -> [String?] {
    guard case .array(let a)? = input?["sets"] else { return [] }
    return a.map { $0["exerciseName"]?.stringValue }
  }

  private static func flags(_ v: JSONValue?) -> [String: Bool] {
    guard case .object(let o)? = v else { return [:] }
    return o.compactMapValues(\.boolValue)
  }

  @Test func everyVectorHasANativeCheck() async throws {
    let all = try Self.cases()
    #expect(!all.isEmpty)
    for c in all {
      guard let id = c["id"]?.stringValue else { continue }
      let input = c["input"], expected = c["expected"]
      switch id.prefix(4) {
      case "TC-1":
        let got = TodayRules.cta(
          unknown: input?["unknown"]?.boolValue == true, planned: input?["planned"]?.boolValue == true,
          rest: input?["rest"]?.boolValue == true, done: input?["done"]?.boolValue == true)
        #expect(got.rawValue == expected?["cta"]?.stringValue, "\(id)")

      case "TC-2":
        let offset: Int
        switch input?["dateStr"]?.stringValue {
        case "today": offset = 0
        case "tomorrow": offset = 1
        case "yesterday": offset = -1
        default:
          Issue.record("\(id): dateStr lạ")
          continue
        }
        let c = WorkoutSessionController(
          plan: .init(date: Self.today.adding(days: offset), templateId: "t", templateName: "W", rows: []),
          userId: "u1", store: InMemoryWorkoutStore(), clock: Self.clock, timeZone: Self.saigon)
        #expect(c.isFuture == (expected?["future"]?.boolValue == true), "\(id)")

      case "TC-3":
        let date = try #require(LocalDate(input?["date"]?.stringValue ?? ""))
        let tpl = try #require(input?["templateId"]?.stringValue)
        #expect(DayProgressStore.key(date: date, templateId: tpl) == expected?["key"]?.stringValue, "\(id)")

      case "TC-4":
        if expected?["merged"] != nil {
          let got = TodayRules.mergeProgress(
            stored: Self.flags(input?["stored"]), rows: Self.rows(input), setNames: Self.setNames(input))
          #expect(got == Self.flags(expected?["merged"]), "\(id): chứng cứ chỉ lấp chỗ trống")
        } else {
          let got = TodayRules.sessionTicks(rows: Self.rows(input), setNames: Self.setNames(input))
          #expect(got == Self.flags(expected?["ticks"]), "\(id)")
        }

      default:
        Issue.record("today-controller.json: ca \(id) chưa có phép kiểm Swift")
      }
    }
  }

  /// Đủ 16 tổ hợp cờ (RN `tools/plan-actuals.mjs` quét đúng thế): bảng chân lý
  /// viết lại từ thứ tự luật, không từ code.
  @Test func ctaCoversAllSixteenCombinations() {
    for bits in 0..<16 {
      let unknown = bits & 1 != 0, planned = bits & 2 != 0, rest = bits & 4 != 0, done = bits & 8 != 0
      let want: TodayCta = unknown ? .none : done ? .extra : planned ? .start : rest ? .logFree : .pick
      #expect(TodayRules.cta(unknown: unknown, planned: planned, rest: rest, done: done) == want)
    }
  }
}
