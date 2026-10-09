public import Foundation
public import Observation

/// Số đo cơ thể (#527) — `app/measurements-trend.tsx` +
/// `useMeasurementHistory` (`use-today-data.ts`) @ fac9ac2.
///
/// Như RN: 12 số đo của `body_measurements` (cổ … bắp chân, % mỡ), mỗi số đo
/// một đường: chỉ những lần đo có số dương hữu hạn, cần ≥ 2 điểm; số mới nhất,
/// chênh lệch so với điểm cũ nhất trong khung (làm tròn 0.1), hướng lên /
/// xuống / ngang. Chữ số như JS in (`String(n)`).
///
/// Khác RN:
/// - Trục ngày đọc cột `date` của bảng (RN đọc `measured_at` — cột không tồn
///   tại, mọi điểm ra ngày `NaN-NaN-NaN`), và đọc thẳng như ngày lịch (RN đi
///   qua `new Date('YYYY-MM-DD')` = nửa đêm UTC, lùi một ngày ở múi giờ âm).
/// - 24 lần đo MỚI NHẤT (RN: `order(date asc).limit(24)` = 24 lần CŨ nhất —
///   từ lần đo thứ 25 trở đi màn không bao giờ đổi nữa).
public enum Measurements {
  public struct Field: Sendable, Hashable {
    /// Cột của `body_measurements`.
    public let key: String
    /// Khoá chuỗi (`measure.*`).
    public let labelKey: String
    public let unit: String
  }

  public static let fields: [Field] = [
    Field(key: "neck_cm", labelKey: "measure.neck", unit: "cm"),
    Field(key: "shoulders_cm", labelKey: "measure.shoulders", unit: "cm"),
    Field(key: "chest_cm", labelKey: "measure.chest", unit: "cm"),
    Field(key: "waist_cm", labelKey: "measure.waist", unit: "cm"),
    Field(key: "hips_cm", labelKey: "measure.hips", unit: "cm"),
    Field(key: "bicep_left_cm", labelKey: "measure.bicepl", unit: "cm"),
    Field(key: "bicep_right_cm", labelKey: "measure.bicepr", unit: "cm"),
    Field(key: "thigh_left_cm", labelKey: "measure.thighl", unit: "cm"),
    Field(key: "thigh_right_cm", labelKey: "measure.thighr", unit: "cm"),
    Field(key: "calf_left_cm", labelKey: "measure.calfl", unit: "cm"),
    Field(key: "calf_right_cm", labelKey: "measure.calfr", unit: "cm"),
    Field(key: "body_fat_pct", labelKey: "measure.bodyfat", unit: "%"),
  ]

  public static let limit = 24

  public enum Direction: String, Sendable, Hashable { case up, down, flat }

  public struct Point: Sendable, Hashable {
    public let date: LocalDate?
    public let value: Double
  }

  public struct Series: Sendable, Hashable, Identifiable {
    public let field: Field
    /// Cũ → mới.
    public let points: [Point]
    public let last: Double
    public let delta: Double
    public let direction: Direction
    public var id: String { field.key }

    /// `{s.last}{s.unit}`: "75.5cm", "18.7%".
    public var lastText: String { "\(ReadinessEngine.jsString(last))\(field.unit)" }
    /// `+1.5cm` / `-0.4cm` / `0cm`.
    public var deltaText: String {
      let sign = delta > 0 ? "+" : ""
      return sign + ReadinessEngine.jsString(delta) + field.unit
    }
  }

  /// 24 lần đo mới nhất (đảo lại cũ → mới ở `series`).
  public static func query(userId: String) -> RowQuery {
    RowQuery(
      table: "body_measurements", columns: "*", filters: [.eq("user_id", .string(userId))],
      order: RowQuery.Order(column: "date", ascending: false), limit: limit)
  }

  /// Các đường có ≥ 2 điểm, theo thứ tự `fields`. `rows` cũ → mới.
  public static func series(_ rows: [JSONValue]) -> [Series] {
    fields.compactMap { f in
      let points = rows.compactMap { r -> Point? in
        let v = JS.number(r[f.key])
        guard v.isFinite, v > 0 else { return nil }
        return Point(date: r["date"]?.stringValue.flatMap(LocalDate.init), value: v)
      }
      guard points.count >= 2 else { return nil }
      let last = points[points.count - 1].value
      let delta = JS.round((last - points[0].value) * 10) / 10
      let dir: Direction = delta > 0.05 ? .up : delta < -0.05 ? .down : .flat
      return Series(field: f, points: points, last: last, delta: delta, direction: dir)
    }
  }
}

/// Màn Số đo cơ thể của MỘT tài khoản.
@MainActor @Observable
public final class MeasurementsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready([Measurements.Series])
  }

  public let userId: String
  public private(set) var phase: Phase = .loading

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private var closed = false

  public init(userId: String, store: any RowStore) {
    self.userId = userId
    self.store = store
  }

  public func close() { closed = true }

  /// Đọc hỏng → lỗi có thử lại (như RN `LoadFailed`); đọc lại hỏng khi đã có số
  /// thì giữ số.
  public func load() async {
    let rows: [JSONValue]
    do {
      rows = try await store.select(Measurements.query(userId: userId))
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed
      return
    }
    guard !closed else { return }
    phase = .ready(Measurements.series(rows.reversed()))
  }
}
