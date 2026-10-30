import ASCNDCore
import Observation
import SwiftUI
import os

/// Signpost của Koa (30/10): Instruments › os_signpost / Points of Interest, phân loại "Koa".
/// Bao từng bước đạo diễn (`director`) và từng lần dựng hình (`figure`). Gần như không tốn gì
/// khi không ghi.
enum KoaSignpost {
  static let poster = OSSignposter(subsystem: "com.ascnd.fitnessos", category: "Koa")
}

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
  /// Có chuyển động thấy được (đi, nhảy, chớp mắt, mắt / đầu đang chuyển, dáng đang đổi, lá
  /// rung, vừa chạm Koa): đồng hồ 60 khung / giây. Còn lại (thở, nhún nhẹ khi đứng — vài phần
  /// mười điểm ảnh mỗi khung) 30 là đủ, không thấy khác. Giữ 60 thêm 0,25 giây sau chuyển
  /// động cuối để không nhấp nháy giữa hai nhịp. Chỉ đổi khi trạng thái đổi.
  private(set) var moving = false
  /// Lá cây đang rung (phòng vẽ sẵn bỏ phần từ chậu cây trở lên, lớp trên vẽ phần ấy).
  private(set) var swaying = false
  @ObservationIgnored private var lively = 0.0
  @ObservationIgnored private var boostUntil = 0.0
  @ObservationIgnored private var prevGaze: KoaGaze.Output?

  /// Người dùng chạm / kê lên Koa: phản ứng (nhảy, nhìn theo ngón tay) chạy 60 khung / giây.
  func boost() {
    boostUntil = Date.now.timeIntervalSinceReferenceDate + 1.5
    if !moving { moving = true }
  }

  /// Khung này có chuyển động thấy được không.
  static func lively(_ f: KoaDirector.Frame, prev: KoaGaze.Output?) -> Bool {
    if f.moving || f.gaze.blink > 0 || f.plantSway != 0 { return true }
    if f.dayAmount > 0.02 && f.dayAmount < 0.98 && f.walk == nil { return true }
    if f.gestureAmount > 0.01 && f.gestureAmount < 0.99 { return true }
    guard let p = prev else { return true }
    let d =
      abs(f.gaze.eyes.x - p.eyes.x) + abs(f.gaze.eyes.y - p.eyes.y) + abs(f.gaze.head.x - p.head.x)
      + abs(f.gaze.head.y - p.head.y)
    // mắt liếc nhỏ / đầu trôi nhẹ: 30 khung là đủ; chỉ cú quay nhìn lớn mới cần 60
    return d > 0.05
  }
  /// Chỗ đứng khi đồng hồ dừng (Giảm chuyển động): view đọc chỗ này, vì không có khung mới.
  private(set) var placed: KoaRoomMap.Spot?

  #if DEBUG
    /// Kịch bản đo hiệu năng cố định (chỉ bản Debug, cờ chạy `-koaBench rest|walk`): `rest`
    /// đứng yên (không đi), `walk` đi qua lại giữa hai điểm trên bục mãi. Hạt cố định.
    enum Bench: String { case rest, walk }
    static let bench: Bench? = {
      let a = ProcessInfo.processInfo.arguments
      guard let i = a.firstIndex(of: "-koaBench"), i + 1 < a.count else { return nil }
      return Bench(rawValue: a[i + 1])
    }()
    @ObservationIgnored private var benchLeg = false
    @ObservationIgnored private var benchAsked = false
    @ObservationIgnored private var benchAskedDuring: KoaDirector.Kind?
  #endif

  init() {
    #if DEBUG
      if Self.bench != nil { director = KoaDirector.Director(seed: 42) }
    #endif
  }

  /// Một khung: tiến đồng hồ tới `date`.
  func step(_ date: Date, heroWidth: Double) -> KoaDirector.Frame {
    #if DEBUG
      if let b = Self.bench {
        context.canWalk = b == .walk
        context.workoutToday = false
        // hỏi lại khi việc đang làm đổi mà chưa phải đi (lời chào lúc mở phòng có thể đè yêu cầu)
        if director.current == .walkTo || director.current != benchAskedDuring { benchAsked = false }
        if b == .walk, director.current != .walkTo, !benchAsked {
          benchLeg.toggle()
          benchAsked = true
          benchAskedDuring = director.current
          director.request(.walkTo(KoaRoomMap.Spot(.stage, benchLeg ? 120 : 270, 440)))
        }
      }
    #endif
    // cỡ hình thật trên màn (gồm phóng theo cấp) — để bước chân tính đúng đơn vị, không trượt
    director.walker.tuning.heroWidth = heroWidth
    let now = date.timeIntervalSinceReferenceDate
    let dt = last.map { min(0.1, max(0, now - $0)) } ?? 0
    last = now
    let sp = KoaSignpost.poster.beginInterval("director")
    let f = director.step(dt, ctx: context)
    KoaSignpost.poster.endInterval("director", sp)
    frame = f
    if Self.lively(f, prev: prevGaze) { lively = now + 0.25 }
    prevGaze = f.gaze
    let fast = now < lively || now < boostUntil
    let sway = f.plantSway != 0
    if fast != moving || sway != swaying {
      // không đổi trạng thái quan sát giữa lúc SwiftUI đang dựng view
      Task { @MainActor in
        self.moving = fast
        self.swaying = sway
      }
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
