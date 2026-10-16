import Foundation

/// Nhịp hiện chữ của câu trả lời Koa Coach (16/10, chủ dự án: "hiệu ứng chữ bị
/// nhanh quá, dùng hiệu ứng chữ như ChatGPT").
///
/// Mạng trả về từng cục lớn không đều; hiện nguyên cục là chữ nhảy cả đoạn. Ở đây
/// app nhả ra đều tay theo từng từ: mỗi nhịp (`tick`) một ít, trọn từ, và nhanh
/// dần khi phần chờ hiện còn dài — để không bao giờ tụt lại quá xa câu trả lời.
public enum CoachReveal {
  /// Một nhịp ≈ một từ. 70 ms/từ ≈ 14 từ/giây lúc thong thả — bản 45 ms × cục
  /// lớn hiện xong một câu trả lời trong chưa tới 2 giây, chủ dự án thấy vẫn nhanh.
  public static let tick: Duration = .milliseconds(70)

  /// Vệt mờ ở đầu chữ đang chạy: ba đoạn ký tự cuối, từ nhạt tới gần đậm — từ mới
  /// "hiện dần" như ChatGPT thay vì bật ra.
  public static let fadeSteps: [(length: Int, opacity: Double)] = [(6, 0.2), (6, 0.45), (8, 0.75)]

  /// Số ký tự hiện sau nhịp này (đếm theo `Character`).
  public static func step(shown: Int, total: String) -> Int {
    let count = total.count
    guard shown < count else { return count }
    let backlog = count - shown
    var next = min(count, shown + min(12, max(1, backlog / 60)))
    // Trọn từ: đi tiếp tới khoảng trắng gần nhất (tối đa 16 ký tự nữa).
    let chars = Array(total)
    var extra = 0
    while next < count, !chars[next].isWhitespace, extra < 16 {
      next += 1
      extra += 1
    }
    return next
  }

  /// `count` ký tự đầu của `text`. Chữ đậm đang nhả dở (một `**` chưa đóng)
  /// được đóng tạm — không thì người dùng thấy dấu `**` thô cho tới khi cụm từ hết.
  public static func prefix(_ text: String, _ count: Int) -> String {
    let head = String(text.prefix(max(0, count)))
    guard count < text.count else { return head }
    let opens = head.components(separatedBy: "**").count - 1
    guard opens % 2 == 1 else { return head }
    // Không đóng ngay sau dấu mở (cụm rỗng `****` vẽ ra hai dấu sao).
    return head.hasSuffix("**") ? String(head.dropLast(2)) : head + "**"
  }
}
