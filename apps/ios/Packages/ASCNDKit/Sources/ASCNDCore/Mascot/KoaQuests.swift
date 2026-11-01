public import Foundation

/// Nhiệm vụ tập luyện mới (#527 phần 4, Kiệt duyệt 29/10): làm theo gợi ý tăng tải —
/// trong buổi hôm nay, ít nhất một bài nặng hơn hay nhiều rep hơn lần trước của chính
/// bài ấy (đúng hai lời khuyên của thẻ "Tăng tải hôm nay": thêm tạ / thêm rep).
/// +20 xu (`reward_prices['quest:overload']`, khoá `d:<ngày>:overload`) và +3 Gains.
///
/// Gains không có sổ riêng trên server, nên ngày đã tăng tải đọc lại từ CHÍNH dòng sổ
/// xu ấy (`KoaGainsSync`) — hai máy cùng sổ ra cùng một số, và không phụ thuộc cửa sổ
/// 90 ngày của phân tích bài tập.
public enum OverloadQuest {
  public static let coins = 20
  public static let gains = 3
  public static let suffix = ":overload"

  public static func refKey(_ day: LocalDate) -> String { "d:\(day)\(suffix)" }

  /// Ngày của một khoá `d:<ngày>:overload`; khoá khác → `nil`.
  public static func day(of refKey: String) -> LocalDate? {
    guard refKey.hasPrefix("d:"), refKey.hasSuffix(suffix) else { return nil }
    return LocalDate(String(refKey.dropFirst(2).dropLast(suffix.count)))
  }

  /// Buổi của `day` có ít nhất một bài tăng tải so với lần trước của nó.
  public static func achieved(on day: LocalDate, _ performances: [ExercisePerformance]) -> Bool {
    let today = performances.filter { $0.date == day }
    return today.contains { now in
      let before = performances.filter { $0.exerciseKey == now.exerciseKey && $0.date < day }
      guard let prev = before.max(by: { $0.at < $1.at }) else { return false }
      return progressed(now, over: prev)
    }
  }

  /// Nặng hơn mà không tụt quá 2 rep ở set đỉnh, hay cùng mức tạ mà nhiều rep hơn;
  /// bài không tạ: nhiều rep hơn. Bài tính giờ không tính (không có lời khuyên).
  static func progressed(_ now: ExercisePerformance, over prev: ExercisePerformance) -> Bool {
    guard now.kind != .timed else { return false }
    if let w = now.bestWeightKg, let pw = prev.bestWeightKg, w > 0, pw > 0 {
      let reps = now.topSetReps ?? now.bestReps ?? 0
      let prevReps = prev.topSetReps ?? prev.bestReps ?? 0
      if w > pw + 0.01 { return reps >= max(1, prevReps - 2) }
      if abs(w - pw) <= 0.01 { return reps > prevReps }
      return false
    }
    guard let r = now.bestReps, let pr = prev.bestReps else { return false }
    return r > pr
  }
}

/// Khám phá app — mỗi tính năng có sẵn là một nhiệm vụ MỘT LẦN trọn đời (#527 phần 4,
/// Kiệt duyệt 29/10: bảy việc, chỉ xu). Khoá `x:<việc>` → `reward_prices['explore:<việc>']`;
/// server giữ "một lần" bằng `UNIQUE(user_id, ref_key)`, ngoài trần ngày. Xong rồi thì
/// nhiệm vụ biến mất khỏi phòng.
public enum ExploreQuest: String, Sendable, Hashable, CaseIterable {
  case photo, voice, mealcam, barcode, reminder, review, askkoa

  public var refKey: String { "x:\(rawValue)" }

  /// Phải khớp migration `koa_quests_v2`.
  public var coins: Int {
    switch self {
    case .photo: 40
    case .voice: 25
    case .mealcam: 30
    case .barcode: 25
    case .reminder: 20
    case .review: 30
    case .askkoa: 25
    }
  }
}

/// Thưởng tự nhận (tăng tải, khám phá) mà lời gọi hỏng vì mạng — giữ lại để nhận bù
/// khi có mạng / lần mở Hôm nay sau (31/10, rà mất mạng). Trước đây mất mạng đúng lúc
/// ấy là mất: khám phá chỉ thử lại khi dùng lại tính năng, tăng tải không thử lại
/// (mất cả +3 Gains của ngày). Gửi lại an toàn: server bỏ trùng theo `ref_key`.
public enum QuestRetry {
  public struct Pending: Codable, Sendable, Hashable {
    public let ref: String
    public let reason: String
    public init(ref: String, reason: String) {
      self.ref = ref
      self.reason = reason
    }
  }

  /// Giữ tối đa chừng này khoá (mới nhất) — chặn hàng lớn mãi nếu server luôn từ chối.
  public static let limit = 20

  /// Lỗi nào đáng thử lại: chưa tới server (mất mạng) hay không rõ đã tới chưa.
  /// Server đã trả lời có tên (trần ngày, khoá lạ, chưa đăng nhập…) thì thôi.
  public static func shouldRetry(_ f: MascotFailure) -> Bool {
    switch f {
    case .offline, .server(code: nil): true
    default: false
    }
  }

  /// Thêm một khoá (không trùng), giữ `limit` khoá mới nhất.
  public static func adding(_ p: Pending, to list: [Pending]) -> [Pending] {
    Array((list.filter { $0.ref != p.ref } + [p]).suffix(limit))
  }
}
