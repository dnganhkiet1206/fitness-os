public import Foundation

/// Lời nhắc buổi tập của Koa không lặp và không làm phiền (#800, Koa Ecosystem V2 quyết định 4):
/// - câu xoay vòng theo ngày, không dùng lại câu của lần nhắc ngay trước;
/// - bị bỏ qua 3 lần liền (bắn mà không mở) thì giãn ra 2 ngày một lần, mở một lần là về như cũ.
/// Nguồn: Duolingo KDD 2020 (`docs/research/ENGAGEMENT_RESEARCH.md`) — lặp câu và nhắc dồn làm
/// người dùng tắt thông báo.
public enum KoaNudge {
  /// Bỏ qua ngần này lần liền thì giãn ra.
  public static let ignoredLimit = 3
  /// Khoảng cách (ngày) khi đã giãn.
  public static let spacedEvery = 2

  /// Ngày `day` (độ lệch từ hôm nay) có được nhắc không, khi lần nhắc gần nhất ở `lastOffset`.
  public static func due(day: Int, lastOffset: Int?, every: Int) -> Bool {
    guard every > 1, let lastOffset else { return true }
    return day - lastOffset >= every
  }

  /// Câu cho lời nhắc lúc `at`: theo ngày (cùng ngày luôn ra cùng câu, nên đặt lại lịch không
  /// đổi chữ), khác câu `after` của lần nhắc ngay trước trong cùng kế hoạch. `nil` khi không có câu.
  public static func line(
    _ lines: [ReminderText], on at: Date, calendar: Calendar, after: Int?
  ) -> (index: Int, text: ReminderText)? {
    guard !lines.isEmpty else { return nil }
    let day = calendar.ordinality(of: .day, in: .era, for: at) ?? 0
    var i = day % lines.count
    if lines.count > 1, i == after { i = (i + 1) % lines.count }
    return (i, lines[i])
  }

  /// Sổ lời nhắc buổi tập đã đặt / đã bắn / đã mở, lưu theo tài khoản.
  public struct Ledger: Sendable, Hashable, Codable {
    /// Lời nhắc đã giao cho hệ điều hành, chưa tới giờ (giây từ 1970).
    public private(set) var scheduled: [Double] = []
    /// Số lần liền bắn mà không được mở.
    public private(set) var ignored = 0
    /// Lần bắn gần nhất.
    public private(set) var lastFired: Double?
    /// Lần mở gần nhất.
    public private(set) var lastOpened: Double?

    public init() {}

    /// Khoảng cách giữa hai lời nhắc lúc này.
    public var every: Int { ignored >= KoaNudge.ignoredLimit ? KoaNudge.spacedEvery : 1 }

    /// Lời nhắc đã tới giờ: mở rồi thì không tính, không thì thêm một lần bỏ qua.
    public mutating func settle(now: Date) {
      let t = now.timeIntervalSince1970
      for fired in scheduled.sorted() where fired <= t {
        lastFired = max(lastFired ?? fired, fired)
        if let opened = lastOpened, opened >= fired { ignored = 0 } else { ignored += 1 }
      }
      scheduled.removeAll { $0 <= t }
    }

    /// Người dùng chạm một lời nhắc buổi tập.
    public mutating func opened(at now: Date) {
      lastOpened = now.timeIntervalSince1970
      ignored = 0
    }

    /// Kế hoạch mới đã tới hệ điều hành: thay các lời nhắc còn chờ.
    public mutating func record(_ dates: [Date]) {
      scheduled = dates.map(\.timeIntervalSince1970).sorted()
    }

    /// Độ lệch ngày (≤ 0) của lần bắn gần nhất so với `now`.
    public func lastFiredOffset(now: Date, calendar: Calendar) -> Int? {
      guard let lastFired else { return nil }
      let a = calendar.startOfDay(for: Date(timeIntervalSince1970: lastFired))
      let b = calendar.startOfDay(for: now)
      return -(calendar.dateComponents([.day], from: a, to: b).day ?? 0)
    }
  }
}
