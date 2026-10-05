public import Foundation

/// Trạng thái bền của một ngày tập — thứ phải sống sót khi app bị kill.
///
/// `progress` là điểm quay lại của baseline (`routine-day:<ngày>:<template>`).
/// `loggedSessionId` là thứ baseline KHÔNG có ở máy: ở RN, "ngày này đã chốt"
/// đọc từ server (`sessions.length > 0`) hoặc từ mutation đang treo
/// (`queue.isPending`). Native ghi nó cùng giao dịch với hàng outbox, nên mở lại
/// app lúc offline vẫn biết ngày đã chốt và nút Chốt vẫn tắt — luật chặn ghi
/// trùng không phụ thuộc vào việc có sóng hay không.
public struct DayState: Sendable, Hashable, Codable {
  public var progress: DayProgress
  public var loggedSessionId: String?

  public init(progress: DayProgress = DayProgress(), loggedSessionId: String? = nil) {
    self.progress = progress
    self.loggedSessionId = loggedSessionId
  }
}

/// Cổng lưu của màn tập. Core chỉ biết hợp đồng; `ASCNDStore` (GRDB) hiện thực
/// nó ở A2, test dùng bản trong bộ nhớ.
///
/// Hợp đồng — mọi hiện thực phải giữ:
/// - hàm trả về thì dữ liệu ĐÃ bền (commit xong), không phải "đã xếp hàng ghi";
/// - `commitFinish` là MỘT giao dịch: hàng outbox và trạng thái ngày cùng có
///   hoặc cùng không. Kill giữa chừng không bao giờ để lại "outbox có buổi mà
///   ngày chưa chốt" (chốt lại được → buổi thứ hai) hay ngược lại (ngày chốt mà
///   buổi không bao giờ gửi → mất set);
/// - `commitFinish` idempotent theo `entry.id`: gọi lại với cùng id không chèn
///   hàng thứ hai (INSERT OR IGNORE), và trả `false`;
/// - ngày đã chốt là KHOÁ, kiểm trong chính giao dịch: `commitFinish` với một
///   id khác, hay `saveDay` mang `loggedSessionId` khác, ném `DayAlreadyLogged`
///   và không ghi gì. Id idempotent chỉ chặn được cùng một controller bấm lại;
///   hai controller cùng mở một ngày (hai màn, khôi phục chồng lên nhau) sinh
///   hai id — chỉ khoá ở tầng lưu mới chặn được buổi thứ hai, và chặn được bản
///   chụp cũ "mở khoá" ngày đã chốt.
public protocol WorkoutStore: Sendable {
  func loadDay(_ key: String) async throws -> DayState?
  func saveDay(_ key: String, _ state: DayState) async throws
  /// `true` nếu hàng outbox mới được chèn, `false` nếu id đã có từ trước.
  @discardableResult
  func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool
}

/// Ngày đã được chốt bằng buổi `sessionId` — bởi controller khác, hay trước
/// lần mở này. Không phải lỗi đĩa: không có gì để thử lại.
public struct DayAlreadyLogged: Error, Sendable, Hashable {
  public let sessionId: String
  public init(sessionId: String) { self.sessionId = sessionId }
}

/// Lỗi ghi XUỐNG MÁY — khác hẳn `WriteFailure` (ghi lên server). Ghi máy hỏng
/// thì không có gì để thử lại sau: dữ liệu chưa bền, và màn phải nói thế.
public struct LocalWriteError: Error, Sendable, Hashable {
  public let message: String
  public init(_ message: String) { self.message = message }
}

extension LocalDate {
  /// Ngày lịch của thời điểm `t` ở múi `timeZone` — "hôm nay" của người dùng.
  /// Lệch múi lấy tại chính thời điểm ấy, nên đúng cả ngày đổi giờ.
  public init(_ t: EpochMillis, in timeZone: TimeZone) {
    let offset = Int64(timeZone.secondsFromGMT(for: t.date)) * 1000
    let local = t.millis + offset
    let dayMs: Int64 = 86_400_000
    let days = local >= 0 ? local / dayMs : (local - dayMs + 1) / dayMs
    self.init(daysSinceEpoch: Int(days))
  }
}
