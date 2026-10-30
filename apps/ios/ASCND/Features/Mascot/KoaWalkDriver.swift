import ASCNDCore
import Observation
import SwiftUI

/// Koa đi trong phòng (29/10): giữ `KoaWalk.Walker` giữa các khung của `TimelineView`
/// (như `KoaClock` — ô nhớ, không phải trạng thái của view). Chỉ `active` là quan sát
/// được: còn đi / còn khép chân thì đồng hồ chạy, đứng yên hẳn thì đồng hồ dừng (0 % CPU
/// thêm so với trước).
@MainActor @Observable
final class KoaWalkDriver {
  /// Đồng hồ của sân khấu chạy khi đang đi.
  private(set) var active = false
  @ObservationIgnored private(set) var walker = KoaWalk.Walker(
    x: StudioScene.stageMark.x, y: StudioScene.stageMark.y)
  @ObservationIgnored private var last: Double?
  /// Lần cuối người dùng chạm sàn — Koa không tự đi dạo ngay sau đó.
  @ObservationIgnored private(set) var touchedAt = Date.distantPast

  /// Một khung: tiến đồng hồ tới `date`, trả về dáng đi (`nil` khi đứng yên hẳn — hình
  /// vẽ y như trước khi có đi bộ).
  func frame(_ date: Date, heroWidth: Double) -> KoaWalk.Pose? {
    // cỡ hình thật trên màn (gồm phóng theo cấp) — để bước chân tính đúng đơn vị, không trượt
    walker.tuning.heroWidth = heroWidth
    let now = date.timeIntervalSinceReferenceDate
    if let last { walker.step(now - last) }
    last = now
    if !walker.isMoving {
      last = nil
      // dừng đồng hồ sau khung này (không đổi trạng thái giữa lúc SwiftUI đang dựng view)
      Task { @MainActor in if !self.walker.isMoving { self.active = false } }
      return nil
    }
    return walker.pose
  }

  /// Dáng đi hiện tại mà không tiến đồng hồ.
  var pose: KoaWalk.Pose? { walker.isMoving ? walker.pose : nil }

  /// Chạm sàn → đi tới đó. Giảm chuyển động: đứng ngay ở đó, không đi.
  func go(to x: Double, _ y: Double, reduceMotion: Bool, byUser: Bool = true) {
    if byUser { touchedAt = .now }
    if reduceMotion {
      walker.place(at: x, y)
      active = false
      return
    }
    walker.walk(to: x, y)
    active = true
  }

  /// Bật Giảm chuyển động / rời màn giữa chừng: đứng lại ngay tại chỗ.
  func halt() {
    walker.place(at: walker.x, walker.y)
    last = nil
    active = false
  }

  /// Đi dạo một điểm ngẫu nhiên trên sàn, đủ xa chỗ đang đứng; đôi khi về bục.
  func wander() {
    let f = walker.floor
    var p = (x: StudioScene.stageMark.x, y: StudioScene.stageMark.y)
    if Double.random(in: 0..<1) > 0.3 || hypot(walker.x - p.x, walker.y - p.y) < 30 {
      for _ in 0..<8 {
        p = (Double.random(in: f.minX...f.maxX), Double.random(in: f.minY...f.maxY))
        if hypot(walker.x - p.x, walker.y - p.y) > 70 { break }
      }
    }
    go(to: p.x, p.y, reduceMotion: false, byUser: false)
  }
}
