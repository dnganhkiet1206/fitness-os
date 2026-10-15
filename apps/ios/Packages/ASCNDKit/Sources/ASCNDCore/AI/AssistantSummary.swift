import Foundation

/// Thẻ "Tóm tắt" của tab Trợ lý (15/10, chủ dự án duyệt mock v2 — theo nguyên tắc
/// Apple Health mới: tóm tắt trước, điểm sẵn sàng có NHÃN CHỮ, so với mức thường
/// của chính mình). Chỉ đổi cách hiển thị — điểm vẫn tính 0–100 như cũ.
public enum AssistantSummary {
  /// Nhãn hành động của điểm sẵn sàng.
  public enum Readiness: String, Sendable, Hashable {
    /// Xanh — sẵn sàng tập.
    case go
    /// Vàng — giữ nhịp.
    case pace
    /// Đỏ — phục hồi.
    case recover
  }

  /// So với mức thường (trung bình 7 ngày) của chính người dùng.
  public enum Versus: String, Sendable, Hashable { case above, typical, below }

  /// Điểm 0–100 → thang 0–10 (làm tròn), như vòng của Apple Health.
  public static func score10(_ readiness: Int?) -> Int? {
    readiness.map { min(10, max(0, Int((Double($0) / 10).rounded()))) }
  }

  public static func readiness(status: String?, score: Int?) -> Readiness? {
    guard score != nil else { return nil }
    switch status {
    case "green": return .go
    case "yellow": return .pace
    case "red": return .recover
    default:
      guard let s = score else { return nil }
      return s >= 67 ? .go : s >= 34 ? .pace : .recover
    }
  }

  /// Hôm nay so với trung bình các ngày CÓ dữ liệu trước hôm nay; cần ≥ 3 ngày.
  /// Lệch dưới `band` điểm coi như bình thường.
  public static func versus(today: Int?, bars: [MetricAnalysis.Bar], band: Double = 8) -> Versus? {
    guard let today else { return nil }
    let past = bars.filter { !$0.missing && !$0.today }.map(\.value)
    guard past.count >= 3 else { return nil }
    let avg = past.reduce(0, +) / Double(past.count)
    let d = Double(today) - avg
    return d > band ? .above : d < -band ? .below : .typical
  }

  /// Hướng 7 ngày từ các cột có dữ liệu (`MetricAnalysis.direction`, cần đủ điểm).
  public static func trend(_ bars: [MetricAnalysis.Bar]) -> MetricAnalysis.Direction? {
    MetricAnalysis.direction(bars.filter { !$0.missing }.map(\.value))
  }
}
