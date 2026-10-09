public import Foundation
public import Observation

/// Xu hướng sẵn sàng 7 ngày (#527) — `ReadinessTrendCard` của
/// `components/ascnd/today-widgets.tsx` + `useReadinessHistory(7)` của
/// `hooks/use-fitness-data.ts` @ fac9ac2.
///
/// Như RN: các ngày có điểm từ 7 ngày trước tới hôm nay (`localDaysAgoStr(7)`,
/// tức tối đa 8 ngày), cũ → mới; mỗi ngày một thanh tô theo vùng (75+ tập,
/// 50–74 vừa phải, < 50 phục hồi); TB (làm tròn) / cao nhất / thấp nhất; ẩn
/// khi chưa đủ 2 ngày.
public enum ReadinessTrend {
  public struct Point: Sendable, Hashable {
    public let date: LocalDate
    /// `Number(readiness_score) || 0`.
    public let value: Double
  }

  public enum Zone: String, Sendable, Hashable, CaseIterable {
    case train, moderate, recover
  }

  /// `readinessZone`: 75+ tập luyện, 50–74 vừa phải, dưới 50 phục hồi.
  public static func zone(_ v: Double) -> Zone { v >= 75 ? .train : v >= 50 ? .moderate : .recover }

  public struct Stats: Sendable, Hashable {
    /// `Math.round` trung bình.
    public let average: Double
    public let max: Double
    public let min: Double
  }

  /// `nil` khi dưới 2 ngày — thẻ ẩn.
  public static func stats(_ points: [Point]) -> Stats? {
    guard points.count >= 2 else { return nil }
    let values = points.map(\.value)
    return Stats(
      average: JS.round(values.reduce(0, +) / Double(values.count)), max: values.max() ?? 0, min: values.min() ?? 0)
  }

  public static func query(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "date, readiness_score, readiness_status",
      filters: [
        .eq("user_id", .string(userId)), .gte("date", .string(today.adding(days: -7).description)),
        .or("readiness_score.not.is.null"),
      ],
      order: RowQuery.Order(column: "date", ascending: true))
  }

  /// Hàng → điểm. Hàng không có ngày đọc được thì bỏ; điểm rỗng (server đã
  /// lọc, phòng hờ) cũng bỏ, không vẽ thành 0.
  public static func points(_ rows: [JSONValue]) -> [Point] {
    rows.compactMap { r in
      guard let s = r["date"]?.stringValue, let d = LocalDate(s), JS.present(r["readiness_score"]) else { return nil }
      let v = JS.number(r["readiness_score"])
      return Point(date: d, value: JS.truthy(v) ? v : 0)
    }
  }
}

/// Xu hướng sẵn sàng của MỘT tài khoản. Đóng khi phiên đổi.
@MainActor @Observable
public final class ReadinessTrendBook {
  public let userId: String
  public private(set) var today: LocalDate
  /// `nil` khi chưa đọc được (đọc hỏng thì giữ số cũ, như thẻ RN — thẻ chỉ ẩn).
  public private(set) var points: [ReadinessTrend.Point]?

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private var closed = false

  public init(userId: String, today: LocalDate, store: any RowStore) {
    self.userId = userId
    self.today = today
    self.store = store
  }

  public func close() { closed = true }

  public var stats: ReadinessTrend.Stats? { points.flatMap(ReadinessTrend.stats) }

  public func load() async {
    let q = ReadinessTrend.query(userId: userId, today: today)
    let store = self.store
    do {
      let rows = try await store.select(q)
      guard !closed else { return }
      points = ReadinessTrend.points(rows)
    } catch {
      // RN: lỗi đọc → thẻ không hiện (`!history`). Giữ số cũ nếu đã có.
      _ = error
    }
  }

  public func move(to today: LocalDate) async {
    if today != self.today { self.today = today }
    await load()
  }
}
