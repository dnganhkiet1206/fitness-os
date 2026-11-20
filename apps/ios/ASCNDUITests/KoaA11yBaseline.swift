import Foundation

/// Mốc của bộ kiểm accessibility Koa (KOA-T47): số vấn đề TỐI ĐA được phép, theo màn và loại.
///
/// - Loại không ghi ở một màn = 0 vấn đề được phép: thêm một lỗi loại mới là đỏ ngay.
/// - Số ghi ở đây là nợ đã biết (đo trên CI, iPhone Pro, tiếng Anh, dữ liệu mẫu của máy chủ giả).
///   Sửa bớt thì HẠ số xuống trong cùng PR, để lỗi cũ không quay lại lặng lẽ.
/// - Nâng số chỉ khi chủ ý, kèm lý do trong PR (ví dụ thêm một dòng chữ phụ cùng kiểu đang nợ).
/// - Dòng "không kiểm xong" (bộ kiểm hết giờ) không tính: không có số để so.
enum KoaA11yBaseline {
  /// Đo 20/11 (KOA-T47): số lớn nhất giữa simulator iPhone 17 Pro trên máy, lượt CI 18/11 (run 44273080244) và
  /// lượt CI của #983 (run 44798542637) — vài số đổi theo ngày (chấm của tháng, thứ trong tuần) và theo máy
  /// (CI: Phòng thay đồ 10 mục tương phản, máy 9; thẻ phòng có 1 mục elementDetection chỉ ở CI).
  static let allowed: [String: [String: Int]] = [
    "today": ["contrast": 13, "dynamicType": 5],
    "pause-sheet": ["contrast": 2, "dynamicType": 3, "elementDetection": 1, "textClipped": 4],
    "progress-rhythm": ["contrast": 7, "dynamicType": 14],
    "journey": ["contrast": 12, "dynamicType": 7, "textClipped": 2],
    // "tổng khối lượng" / "2,548 kg": số mẫu của bản xem trước (Debug, chữ Việt cứng trong KoaReaction.swift).
    "reaction": ["textClipped": 2],
    "room": ["dynamicType": 1],
    // 6/8 mục Dynamic Type là thanh nút dev của phòng ("dust 0…3", "hỏng …"), chỉ có ở bản Debug.
    "room-panel": ["contrast": 16, "dynamicType": 8, "elementDetection": 1],
    // hitRegion: ô số dư "Coins: 250" (không phải nút, bộ kiểm vẫn báo).
    "shop": ["contrast": 10, "dynamicType": 13, "hitRegion": 1, "textClipped": 4],
    // Gồm cả phần tử của buổi tập nằm dưới màn nghỉ Koa (bộ kiểm vẫn thấy chúng).
    "rest": ["contrast": 25, "dynamicType": 14, "textClipped": 4],
    "coach": ["dynamicType": 4, "textClipped": 1],
  ]

  struct Over: Equatable {
    let kind: String
    let count: Int
    let allowed: Int
  }

  /// Các loại vượt mốc của `screen`, từ các dòng `A11Y|màn|loại|mô tả|phần tử`.
  static func over(screen: String, lines: [String]) -> [Over] {
    var count: [String: Int] = [:]
    for line in lines {
      let cols = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
      guard cols.count >= 4, cols[0] == "A11Y", cols[1] == screen, cols[2] != "-" else { continue }
      if cols[3].hasPrefix("không kiểm xong") { continue }
      count[cols[2], default: 0] += 1
    }
    let limits = allowed[screen] ?? [:]
    return count.keys.sorted().compactMap { kind in
      let n = count[kind] ?? 0, cap = limits[kind] ?? 0
      return n > cap ? Over(kind: kind, count: n, allowed: cap) : nil
    }
  }
}
