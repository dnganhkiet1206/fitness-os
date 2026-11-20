import Foundation

/// Thời gian HOẠT ĐỘNG của màn nghỉ (KOA-T26, audit Koa 17/11): mili giây từ lúc mở màn, trừ
/// mọi quãng tạm dừng. Trước đây màn diễn của Koa chạy theo đồng hồ tường — đang dừng thì đồng
/// hồ đếm ngược đứng yên mà Koa vẫn diễn tiếp, tiếp tục thì nhảy cóc nhịp. Nút ±15 giây đổi
/// giờ kết thúc, không đổi thời gian đã nghỉ, nên không ảnh hưởng ở đây.
public struct RestActiveClock: Sendable, Equatable {
  private var pausedTotal: Double = 0
  private var pausedSince: Double?

  public init() {}

  /// `now`: mili giây từ lúc mở màn (đồng hồ tường); `paused`: bộ hẹn giờ đang dừng.
  /// Gọi lại cùng `now` cho cùng kết quả.
  public mutating func elapsed(now: Double, paused: Bool) -> Double {
    if paused {
      if pausedSince == nil { pausedSince = now }
    } else if let since = pausedSince {
      pausedTotal += max(0, now - since)
      pausedSince = nil
    }
    let frozenAt = pausedSince ?? now
    return max(0, frozenAt - pausedTotal)
  }
}
