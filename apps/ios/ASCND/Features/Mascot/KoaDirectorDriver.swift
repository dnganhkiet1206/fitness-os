import ASCNDCore
import Observation
import SwiftUI

/// Koa có ý định trong phòng (29/10, phần 2): giữ `KoaDirector.Director` giữa các khung
/// của `TimelineView` (như `KoaClock` — ô nhớ, không phải trạng thái của view). Đạo diễn
/// quyết định Koa làm gì; view chỉ vẽ `Frame` của khung hiện tại.
@MainActor @Observable
final class KoaDirectorDriver {
  @ObservationIgnored private(set) var director = KoaDirector.Director(seed: UInt64.random(in: 1...UInt64.max))
  @ObservationIgnored private var last: Double?
  @ObservationIgnored private(set) var frame: KoaDirector.Frame?
  /// Ngữ cảnh của khung tới (app cập nhật).
  @ObservationIgnored var context = KoaDirector.Context()
  /// Koa đang di chuyển (đi, nhảy, quay người): đồng hồ 60 khung / giây; đứng yên thì 30
  /// là đủ cho ánh nhìn / chớp mắt (đỡ CPU). Chỉ đổi khi trạng thái đổi.
  private(set) var moving = false
  /// Chỗ đứng khi đồng hồ dừng (Giảm chuyển động): view đọc chỗ này, vì không có khung mới.
  private(set) var placed: KoaRoomMap.Spot?

  /// Một khung: tiến đồng hồ tới `date`.
  func step(_ date: Date, heroWidth: Double) -> KoaDirector.Frame {
    // cỡ hình thật trên màn (gồm phóng theo cấp) — để bước chân tính đúng đơn vị, không trượt
    director.walker.tuning.heroWidth = heroWidth
    let now = date.timeIntervalSinceReferenceDate
    let dt = last.map { min(0.1, max(0, now - $0)) } ?? 0
    last = now
    let f = director.step(dt, ctx: context)
    frame = f
    let walking = f.walk != nil
    if walking != moving {
      // không đổi trạng thái quan sát giữa lúc SwiftUI đang dựng view
      Task { @MainActor in self.moving = walking }
    }
    return f
  }

  /// Đồng hồ dừng (Giảm chuyển động, rời màn): lần chạy sau bắt đầu lại từ mốc mới.
  func pause() { last = nil }

  func request(_ r: KoaDirector.Request) { director.request(r) }

  /// Giảm chuyển động: đứng ngay ở chỗ chạm, không đi.
  func place(_ s: KoaRoomMap.Spot) {
    director.place(s)
    frame = nil
    placed = KoaRoomMap.clamp(s)
  }
}
