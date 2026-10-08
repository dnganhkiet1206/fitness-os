public import Foundation

/// Một tháng của màn "Buổi tập đã ghi" — RN `sessions.tsx` (`months`).
public struct HistoryMonth: Sendable, Hashable, Identifiable {
  /// `YYYY-MM` theo NGÀY ĐỊA PHƯƠNG của buổi (RN `localDateStr(at).slice(0, 7)`):
  /// buổi 23:30 ngày 31 thuộc tháng của nơi người ấy đang ở.
  public let key: String
  public let year: Int
  public let month: Int
  /// Mới trước, đúng thứ tự của `HistoryBook.entries`.
  public let entries: [HistoryEntry]
  /// Σ `volume_load` của tháng.
  public let volumeKg: Int
  /// Buổi nặng nhất của tháng — cho thanh tỉ lệ ở từng hàng.
  public let peakKg: Int
  /// % khối lượng so với tháng trước; `nil` khi không được so (xem `group`).
  public let changePercent: Int?

  public var id: String { key }
}

public enum HistoryMonths {
  /// Nhóm theo tháng, mới trước, và so mỗi tháng với tháng liền trước nó.
  ///
  /// Hai tháng KHÔNG được so (RN `sessions.tsx`, khối "two months are
  /// disqualified"):
  /// - tháng đang chạy — mới qua vài ngày, so với một tháng trọn là đầu tháng
  ///   nào cũng thành "tụt dốc";
  /// - tháng liền trước là tháng CŨ NHẤT trên màn — cửa sổ 90 ngày cắt ngang
  ///   nó, chỉ còn một phần tháng.
  /// Tháng trước có khối lượng 0 cũng không so (chia cho 0).
  /// Làm tròn như `Math.round` (nửa lên về phía +∞, kể cả số âm).
  public static func group(_ entries: [HistoryEntry], timeZone: TimeZone, now: EpochMillis) -> [HistoryMonth] {
    var order: [String] = []
    var rows: [String: [HistoryEntry]] = [:]
    var ym: [String: (Int, Int)] = [:]
    for e in entries {
      let d = LocalDate(e.at, in: timeZone)
      let key = Self.key(d)
      if rows[key] == nil {
        order.append(key)
        ym[key] = (d.year, d.month)
      }
      rows[key, default: []].append(e)
    }
    let running = Self.key(LocalDate(now, in: timeZone))
    let volume = order.map { k in rows[k]!.reduce(0) { $0 + $1.volumeKg } }
    return order.enumerated().map { i, k in
      let list = rows[k]!
      var change: Int?
      let olderIndex = i + 1
      if k != running, olderIndex < order.count, olderIndex != order.count - 1, volume[olderIndex] > 0 {
        let ratio = Double(volume[i] - volume[olderIndex]) / Double(volume[olderIndex]) * 100
        change = Int((ratio + 0.5).rounded(.down))
      }
      return HistoryMonth(
        key: k, year: ym[k]!.0, month: ym[k]!.1, entries: list, volumeKg: volume[i],
        peakKg: list.map(\.volumeKg).max() ?? 0, changePercent: change)
    }
  }

  private static func key(_ d: LocalDate) -> String {
    d.month < 10 ? "\(d.year)-0\(d.month)" : "\(d.year)-\(d.month)"
  }
}
