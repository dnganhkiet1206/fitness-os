@testable import ASCNDCore
import Foundation
import Testing

/// Ghi số đo (#527, `log-measurement`). Golden: `errorFor` / `hasValue` /
/// payload của `save` chép nguyên văn từ `log-measurement.tsx` @ fac9ac2, chạy
/// trên `plausible.ts` / `units.ts` biên dịch (`gen-measurement.mjs`).
struct MeasurementLogGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "measurement-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n)?: return n
    case .string("Infinity")?: return .infinity
    case .string("-Infinity")?: return -.infinity
    default: return nil
    }
  }

  static func problem(_ v: JSONValue?) -> MeasurementLog.Problem? {
    guard let v, v != .null, case .string(let lo)? = v["min"], case .string(let hi)? = v["max"],
      case .string(let u)? = v["unit"]
    else { return nil }
    return MeasurementLog.Problem(min: lo, max: hi, unit: u)
  }

  static func unit(_ v: JSONValue?) -> MeasurementLog.LengthUnit { v == .string("in") ? .inches : .cm }

  static func fields(_ v: JSONValue?) -> [MeasurementLog.Field: String] {
    guard case .object(let o)? = v else { return [:] }
    var out: [MeasurementLog.Field: String] = [:]
    for (k, x) in o {
      if let f = MeasurementLog.Field(rawValue: k), case .string(let s) = x { out[f] = s }
    }
    return out
  }

  /// Một ô: lỗi (ba vế của câu) và số gửi đi, ở cả cm lẫn in.
  @Test func singleFieldMatchesRN() throws {
    let cases = Self.array(try Self.golden()["single"])
    #expect(cases.count >= 100)
    for c in cases {
      guard case .string(let key)? = c["key"], let field = MeasurementLog.Field(rawValue: key),
        case .string(let text)? = c["text"]
      else {
        Issue.record("ca hỏng: \(c)")
        continue
      }
      let unit = Self.unit(c["unit"])
      #expect(MeasurementLog.problem(field, text, unit: unit) == Self.problem(c["error"]), "\(c)")
      #expect(MeasurementLog.value(field, text, unit: unit) == Self.num(c["payload"]), "\(c)")
    }
  }

  /// Cả form: lỗi từng ô, `hasValue`, `canSave`, và hàng gửi đi.
  @Test func formsMatchRN() throws {
    let forms = Self.array(try Self.golden()["forms"])
    #expect(forms.count == 200)
    #expect(forms.contains { $0["canSave"] == .bool(true) })
    #expect(forms.contains { $0["canSave"] == .bool(false) })
    let day = try #require(LocalDate("2026-10-10"))
    for c in forms {
      let unit = Self.unit(c["unit"])
      let fields = Self.fields(c["fields"])
      for f in MeasurementLog.Field.allCases {
        #expect(MeasurementLog.problem(f, fields[f] ?? "", unit: unit) == Self.problem(c["errors"]?[f.rawValue]), "\(f) \(c)")
      }
      #expect(MeasurementLog.canSave(fields, unit: unit) == (c["canSave"] == .bool(true)), "\(c)")
      let row = MeasurementLog.row(userId: "u1", date: day, fields: fields, unit: unit)
      guard case .object(let o) = row, case .object(let want)? = c["payload"] else {
        Issue.record("hàng hỏng: \(c)")
        continue
      }
      #expect(o["user_id"] == .string("u1"))
      #expect(o["date"] == .string("2026-10-10"))
      #expect(Set(o.keys).subtracting(["user_id", "date"]) == Set(want.keys), "\(c)")
      for (k, v) in want {
        #expect(o[k]?.doubleValue == Self.num(v), "\(k) \(c)")
      }
    }
  }
}

/// Outbox giả + nguồn ghi giả.
private final class Outbox: PlanWriteStore, @unchecked Sendable {
  private let lock = NSLock()
  private var rows: [OutboxEntry] = []
  var entries: [OutboxEntry] { lock.withLock { rows } }
  func enqueue(_ entries: [OutboxEntry]) async throws { lock.withLock { rows += entries } }
  func pending(userId: String) async throws -> [OutboxEntry] {
    lock.withLock { rows.filter { $0.userId == userId } }
  }
}

private final class Source: MeasurementLogSource, @unchecked Sendable {
  private let lock = NSLock()
  private var _rows: [JSONValue] = []
  let fails: (any Error)?
  init(fails: (any Error)? = nil) { self.fails = fails }
  var rows: [JSONValue] { lock.withLock { _rows } }
  func upsert(_ row: JSONValue) async throws {
    if let fails { throw fails }
    lock.withLock { _rows.append(row) }
  }
}

private struct Clock: WallClock {
  let date: Date
  func now() -> Date { date }
}

@MainActor
struct MeasurementLoggerTests {
  static let utc = TimeZone(identifier: "UTC")!
  /// 2026-10-10 12:00 UTC.
  fileprivate static let noon = Clock(date: Date(timeIntervalSince1970: 1_791_633_600))

  fileprivate static func logger(_ source: Source, _ store: Outbox?) -> MeasurementLogger {
    MeasurementLogger(userId: "u1", source: source, store: store, clock: noon, timeZone: utc, makeId: { "ID-1" })
  }

  /// Có mạng: một hàng `{user_id, date, ô có số}` (in → cm, làm tròn 0,1), rồi nút chết.
  @Test func onlineSavesOneRowThenLocks() async throws {
    let source = Source()
    let l = Self.logger(source, Outbox())
    let day = try #require(LocalDate("2026-10-09"))
    let out = await l.submit(fields: [.waist: "32", .bodyFat: "18.5", .neck: ""], unit: .inches, date: day, online: true)
    #expect(out == .saved)
    #expect(l.done)
    #expect(
      source.rows == [
        .object([
          "user_id": .string("u1"), "date": .string("2026-10-09"), "waist_cm": .number(81.3), "body_fat_pct": .number(18.5),
        ])
      ])
    #expect(await l.submit(fields: [.waist: "80"], unit: .cm, date: day, online: true) == .unavailable)
  }

  /// Mất mạng: xếp đúng một hàng outbox `measurement`, cùng hàng như bản online.
  @Test func offlineQueuesTheSameRow() async throws {
    let store = Outbox()
    let source = Source()
    let l = Self.logger(source, store)
    let day = try #require(LocalDate("2026-10-10"))
    #expect(await l.submit(fields: [.chest: "100"], unit: .cm, date: day, online: false) == .queued)
    #expect(source.rows.isEmpty)
    let e = try #require(store.entries.first)
    #expect(store.entries.count == 1)
    #expect(e.kind == MeasurementLog.kind)
    #expect(e.id == "id-1")
    #expect(e.payload == .object(["user_id": .string("u1"), "date": .string("2026-10-10"), "chest_cm": .number(100)]))
    #expect(MeasurementLog.isRow(e))
    #expect(await l.submit(fields: [.chest: "101"], unit: .cm, date: day, online: false) == .unavailable)
    #expect(store.entries.count == 1, "chạm lần hai không xếp thêm")
  }

  /// Không ô nào là số / có ô sai: không gửi gì.
  @Test func invalidFormsSendNothing() async throws {
    let source = Source()
    let l = Self.logger(source, Outbox())
    let day = try #require(LocalDate("2026-10-10"))
    #expect(await l.submit(fields: [:], unit: .cm, date: day, online: true) == .invalid)
    #expect(await l.submit(fields: [.waist: "80", .bodyFat: "90"], unit: .cm, date: day, online: true) == .invalid)
    #expect(await l.submit(fields: [.waist: "5"], unit: .cm, date: day, online: true) == .invalid)
    #expect(source.rows.isEmpty)
    #expect(!l.done)
  }

  /// Lỗi khi gửi: nói đúng loại, không khoá nút (thử lại được).
  @Test func failuresDoNotLock() async throws {
    let day = try #require(LocalDate("2026-10-10"))
    let offline = Self.logger(Source(fails: URLError(.notConnectedToInternet)), Outbox())
    #expect(await offline.submit(fields: [.hips: "95"], unit: .cm, date: day, online: true) == .offline)
    #expect(!offline.done)
    struct Boom: Error {}
    let failed = Self.logger(Source(fails: Boom()), Outbox())
    #expect(await failed.submit(fields: [.hips: "95"], unit: .cm, date: day, online: true) == .failed)
    #expect(!failed.done)
  }

  /// Ngày sau hôm nay kẹp về hôm nay (`maximumDate`).
  @Test func futureDateIsToday() async throws {
    let source = Source()
    let l = Self.logger(source, Outbox())
    let future = try #require(LocalDate("2026-12-01"))
    #expect(await l.submit(fields: [.calfLeft: "38"], unit: .cm, date: future, online: true) == .saved)
    #expect(source.rows.first?["date"] == .string("2026-10-10"))
  }

  /// Hàng outbox hỏng không bao giờ được gửi.
  @Test func badOutboxRowsAreRefused() {
    func entry(_ payload: JSONValue, user: String = "u1") -> OutboxEntry {
      OutboxEntry(id: "x", userId: user, kind: MeasurementLog.kind, payload: payload, createdAt: EpochMillis(Int64(0)))
    }
    let ok: JSONValue = .object(["user_id": .string("u1"), "date": .string("2026-10-10"), "waist_cm": .number(80)])
    #expect(MeasurementLog.isRow(entry(ok)))
    #expect(!MeasurementLog.isRow(entry(ok, user: "u2")), "không phải chủ")
    #expect(!MeasurementLog.isRow(entry(.object(["user_id": .string("u1"), "date": .string("2026-10-10")]))), "không ô nào")
    #expect(!MeasurementLog.isRow(entry(.object(["user_id": .string("u1"), "date": .string("x"), "waist_cm": .number(80)]))))
    #expect(
      !MeasurementLog.isRow(entry(.object(["user_id": .string("u1"), "date": .string("2026-10-10"), "waist_cm": .number(5)]))))
    #expect(
      !MeasurementLog.isRow(
        entry(.object(["user_id": .string("u1"), "date": .string("2026-10-10"), "notes": .string("hi")]))), "cột lạ")
  }
}
