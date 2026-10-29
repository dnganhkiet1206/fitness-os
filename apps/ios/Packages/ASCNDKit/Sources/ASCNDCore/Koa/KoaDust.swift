public import Foundation

/// Phòng Koa bám bụi khi người dùng vắng (#527 phần 5, Kiệt duyệt mock bản 3 ngày 29/10).
///
/// Chỉ là lớp phủ (bụi trên kệ, mạng nhện, bụi chân tường) — không đổi màu phòng, không
/// trừ Gains, không đổi hạng. Luật (Kiệt chọn):
/// - mỗi ngày đã qua không tập, không phải ngày nghỉ có kế hoạch, ghi ít hơn 2 việc: +1
///   ngày bụi; 3 / 5 / 8 ngày → mức 1 / 2 / 3;
/// - một buổi tập (mọi loại, kể cả đi bộ từ Apple Health) dọn sạch;
/// - hai việc ghi trong một ngày (bữa, nước, giấc ngủ, cân) hạ một mức;
/// - trả 30 xu (`clean_koa_room`, khoá `clean:<ngày>`) dọn sạch hôm ấy.
/// Đếm từ hoạt động đầu tiên trong `window` ngày gần nhất — tài khoản mới không bụi.
public enum KoaDust {
  /// Ngày bụi để lên mức 1 / 2 / 3.
  public static let thresholds = [3, 5, 8]
  /// Giá dọn bằng xu — khớp hằng `PRICE` của migration `koa_room_clean`.
  public static let cleanCoins = 30
  /// Số ngày nhìn lại.
  public static let window = 21
  /// Việc ghi trong ngày để hạ một mức.
  public static let logsToSweep = 2

  public struct State: Sendable, Hashable {
    public let level: Int
    /// Ngày bụi đã tích.
    public let idle: Int
    public static let clean = State(level: 0, idle: 0)
  }

  public static func refKey(_ day: LocalDate) -> String { "clean:\(day)" }

  public static func day(ofClean ref: String) -> LocalDate? {
    ref.hasPrefix("clean:") ? LocalDate(String(ref.dropFirst(6))) : nil
  }

  public static func level(idle: Int) -> Int { thresholds.lastIndex { idle >= $0 }.map { $0 + 1 } ?? 0 }

  public static func compute(
    sessions: Set<LocalDate>, logs: [LocalDate: Int], cleaned: Set<LocalDate>, isRest: (LocalDate) -> Bool,
    today: LocalDate
  ) -> State {
    let from = today.adding(days: -window)
    let known = sessions.union(logs.filter { $0.value > 0 }.keys)
    guard let first = known.filter({ $0 >= from }).min() ?? (known.contains { $0 < from } ? from : nil) else {
      return .clean
    }
    var idle = 0
    var d = first
    while d <= today {
      if sessions.contains(d) || cleaned.contains(d) {
        idle = 0
      } else if (logs[d] ?? 0) >= logsToSweep {
        let l = level(idle: idle)
        idle = l >= 2 ? thresholds[l - 2] : 0
      } else if d < today, !isRest(d) {
        idle += 1
      }
      d = d.adding(days: 1)
    }
    return State(level: level(idle: idle), idle: idle)
  }
}

/// Đọc dữ liệu cho bụi: việc ghi theo ngày (`daily_logs`, `weight_logs`) và ngày đã dọn
/// bằng xu (sổ xu). Buổi tập lấy từ lịch sử Gains đã đọc.
public enum KoaDustSync {
  public static func dailyQuery(userId: String, from: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "date, kcal, water_ml, sleep_duration_min",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(from.description))])
  }

  public static func weightQuery(userId: String, from: LocalDate) -> RowQuery {
    RowQuery(
      table: "weight_logs", columns: "date",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(from.description))])
  }

  /// `or=` có `:` (ký tự dành riêng của PostgREST) nên giá trị bọc ngoặc kép.
  public static func cleanQuery(userId: String) -> RowQuery {
    RowQuery(
      table: "mascot_transactions", columns: "ref_key",
      filters: [.eq("user_id", .string(userId)), .or("ref_key.like.\"clean:*\"")], limit: 60)
  }

  /// Số việc ghi mỗi ngày: bữa (kcal > 0), nước, giấc ngủ, cân.
  public static func logCounts(daily: [JSONValue], weights: [JSONValue]) -> [LocalDate: Int] {
    var out: [LocalDate: Int] = [:]
    for r in daily {
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { continue }
      let n = [r["kcal"], r["water_ml"], r["sleep_duration_min"]].filter { ($0?.doubleValue ?? 0) > 0 }.count
      out[d, default: 0] += n
    }
    for d in Set(weights.compactMap { $0["date"]?.stringValue.flatMap(LocalDate.init) }) { out[d, default: 0] += 1 }
    return out
  }

  /// `nil` khi đọc hỏng — giữ bụi cũ (không bao giờ đổ bụi vì mất mạng).
  public static func load(
    userId: String, store: any RowStore, sessions: [KoaGains.Day], week: KoaGains.Week, today: LocalDate
  ) async -> KoaDust.State? {
    let from = today.adding(days: -KoaDust.window)
    guard let daily = try? await store.select(dailyQuery(userId: userId, from: from)),
      let weights = try? await store.select(weightQuery(userId: userId, from: from)),
      let cleans = try? await store.select(cleanQuery(userId: userId))
    else { return nil }
    return KoaDust.compute(
      sessions: Set(sessions.map(\.date)), logs: logCounts(daily: daily, weights: weights),
      cleaned: Set(cleans.compactMap { $0["ref_key"]?.stringValue.flatMap(KoaDust.day(ofClean:)) }),
      isRest: week.isRest, today: today)
  }
}
