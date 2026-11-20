public import Observation

/// "Báo cáo của tôi" (#915, lát 2) — người dùng thường xem báo cáo mình đã
/// gửi kèm trạng thái (đang mở / đã xử lý / đã bác), theo mẫu Support Inbox
/// của Facebook (nghiên cứu 17/11, mẫu 11: người báo không bao giờ nghe lại
/// thì ngừng báo cáo).
///
/// Đọc qua RPC `community_my_reports()` (migration 20261117070000): đọc trực
/// tiếp bảng `community_reports` thì lấy được báo cáo (RLS cho phép), nhưng
/// KHÔNG lấy được trích nội dung đích — bài vừa báo cáo tự ẩn khỏi chính
/// người báo (`community_post_hides` + policy RESTRICTIVE). RPC trả trích
/// đoạn (tối đa 160 ký tự) và cờ `removed`.
///
/// Hàng KHÔNG điều hướng: bài đã báo cáo vốn ẩn khỏi người báo nên chạm vào
/// chỉ thấy màn lỗi; trích đoạn inline là đủ để nhớ mình đã báo cáo cái gì.
/// Nội dung đã gỡ càng không mở được.
public struct MyReport: Sendable, Hashable, Identifiable {
  public let id: String
  public let reasonRaw: String
  public let reason: CommunityReportReason?
  public let note: String?
  public let status: ModReportStatus
  public let createdAt: String
  public let targetType: ModTargetType?
  /// `nil` = báo cáo một NGƯỜI (không phải bài/bình luận).
  public var isUserReport: Bool { targetType == nil }
  public let targetId: String
  public let excerpt: String
  public let removed: Bool

  public init?(row: JSONValue) {
    guard let id = row["id"]?.stringValue,
      let status = row["status"]?.stringValue.flatMap(ModReportStatus.init(rawValue:)),
      let targetId = row["target_id"]?.stringValue
    else { return nil }
    self.id = id
    reasonRaw = row["reason"]?.stringValue ?? ""
    reason = CommunityReportReason(rawValue: reasonRaw)
    note = row["note"]?.stringValue
    self.status = status
    createdAt = row["created_at"]?.stringValue ?? ""
    targetType = row["target_type"]?.stringValue.flatMap(ModTargetType.init(rawValue:))
    self.targetId = targetId
    excerpt = row["excerpt"]?.stringValue ?? ""
    removed = JS.truthyValue(row["removed"] ?? .null)
  }
}

public protocol CommunityMyReportsRemote: Sendable {
  /// `community_my_reports()`: báo cáo của chính mình, mới → cũ.
  func myReports() async throws -> [JSONValue]
}

/// Báo cáo của MỘT tài khoản.
@MainActor @Observable
public final class MyReportsBook {
  public let userId: String
  public private(set) var phase: CommunityFeedBook.Phase = .loading
  public private(set) var failure: ModerationFailure?
  public private(set) var reports: [MyReport] = []

  @ObservationIgnored private let remote: any CommunityMyReportsRemote
  @ObservationIgnored private var generation = 0

  public init(userId: String, remote: any CommunityMyReportsRemote) {
    self.userId = userId
    self.remote = remote
  }

  public func load() async {
    generation += 1
    let gen = generation
    if reports.isEmpty { phase = .loading }
    do {
      let rows = try await remote.myReports()
      guard gen == generation else { return }
      reports = rows.compactMap(MyReport.init(row:))
      failure = nil
      phase = .ready
    } catch {
      guard gen == generation else { return }
      failure = Self.map(error)
      if phase != .ready { phase = .failed }
    }
  }

  static func map(_ error: any Error) -> ModerationFailure {
    if let f = error as? ModerationFailure { return f }
    if let f = error as? CommunityModerationFailure, f == .offline { return .offline }
    return .server(code: nil)
  }
}
