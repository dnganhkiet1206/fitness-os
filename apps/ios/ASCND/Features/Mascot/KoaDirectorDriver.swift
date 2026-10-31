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
  /// Koa đang ở chỗ gốc trên bục, dáng ngồi của cảm xúc được hiện (đọc trong `body`).
  private(set) var settled = true
  /// Đã tới chỗ đi ngủ. Tách khỏi `settled`: Koa đứng ở bục cũng là `settled`, nhưng phải đi tới đã.
  private(set) var inBed = false
  /// Lá cây đang rung (phòng vẽ sẵn bỏ phần từ chậu cây trở lên, lớp trên vẽ phần ấy).
  private(set) var swaying = false
  @ObservationIgnored private var lively = 0.0
  @ObservationIgnored private var boostUntil = 0.0
  @ObservationIgnored private var prevGaze: KoaGaze.Output?

  /// Người dùng chạm / kê lên Koa: phản ứng (nhảy, nhìn theo ngón tay) chạy 60 khung / giây,
  /// và Koa chú ý tới họ thay vì tự đi chỗ khác.
  func boost() {
    boostUntil = Date.now.timeIntervalSinceReferenceDate + 1.5
    if !moving { moving = true }
    director.interacted()
  }

  // MARK: Ký ức

  @ObservationIgnored private var memory = KoaCompanion.Memory()
  @ObservationIgnored private var facts: KoaCompanion.Facts?
  @ObservationIgnored private var owner: String?
  @ObservationIgnored private var affectAt = 0.0

  private static func key(_ userId: String) -> String { "koa.companion.\(userId)" }

  /// Sự thật mới của ngày. Lần đầu theo tài khoản: đọc ký ức, Koa đứng lại chỗ cũ nếu vừa rời đi.
  func sync(_ f: KoaCompanion.Facts?, userId: String) {
    guard let f, !userId.isEmpty else { return }
    let now = Date.now.timeIntervalSince1970
    if owner != userId {
      owner = userId
      memory =
        UserDefaults.standard.data(forKey: Self.key(userId))
        .flatMap { try? JSONDecoder().decode(KoaCompanion.Memory.self, from: $0) } ?? .init()
      if let s = memory.resumeSpot(at: now) { place(s) }
      director.recall(visited: memory.visited)
    }
    memory.observe(f)
    facts = f
    feel(now)
  }

  /// Khí sắc phai theo giờ thật: tính lại từ ký ức, không giữ trong trạng thái view.
  private func feel(_ now: Double) {
    affectAt = now
    guard let facts else { return }
    context.affect = memory.affect(facts, at: now)
    context.moment = memory.moment(facts)
    #if DEBUG
      if let forcedMoment { context.moment = forcedMoment }
    #endif
  }

  /// Được chạm: gần gũi hơn một chút.
  func touched() {
    guard let facts else { return }
    let now = Date.now.timeIntervalSince1970
    memory.touched(facts, at: now)
    feel(now)
  }

  /// Ghi ký ức, gồm chỗ đứng hiện tại (rời phòng, ra nền, sau mỗi khoảnh khắc).
  func save() {
    guard let owner else { return }
    memory.remember(director.spot(), visited: director.visited, at: Date.now.timeIntervalSince1970)
    if let data = try? JSONEncoder().encode(memory) { UserDefaults.standard.set(data, forKey: Self.key(owner)) }
  }

  /// Khung này có chuyển động thấy được không.
  static func lively(_ f: KoaDirector.Frame, prev: KoaGaze.Output?) -> Bool {
    if f.moving || f.gaze.blink > 0 || f.gaze.settling || f.plantSway != 0 { return true }
    if f.dayAmount > 0.02 && f.dayAmount < 0.98 { return true }
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
    /// Kịch bản đo hiệu năng cố định (chỉ bản Debug, cờ chạy `-koaBench rest|walk|floor`):
    /// `rest` đứng yên (không đi), `walk` đi qua lại giữa hai điểm trên bục mãi, `floor` như
    /// thế trên sàn (lớp che đồ vật bật). Hạt cố định. `live` chỉ mở thẳng phòng, Koa chạy như
    /// thật (ký ức, khí sắc) — để soát tay và quay video.
    enum Bench: String { case rest, walk, floor, live }
    static let bench: Bench? = {
      let a = ProcessInfo.processInfo.arguments
      guard let i = a.firstIndex(of: "-koaBench"), i + 1 < a.count else { return nil }
      return Bench(rawValue: a[i + 1])
    }()
    /// Soát hình khoảnh khắc khi không có sự kiện thật hôm nay (`-koaMoment record`), chỉ bản
    /// Debug. Không ghi vào ký ức.
    @ObservationIgnored private var forcedMoment: KoaCompanion.Moment? = {
      let a = ProcessInfo.processInfo.arguments
      guard let i = a.firstIndex(of: "-koaMoment"), i + 1 < a.count else { return nil }
      return KoaCompanion.Moment(rawValue: a[i + 1])
    }()
    @ObservationIgnored private var benchLeg = false
    @ObservationIgnored private var benchAsked = false
    @ObservationIgnored private var benchAskedDuring: KoaDirector.Kind?
  #endif

  init() {
    #if DEBUG
      if Self.bench != nil, Self.bench != .live { director = KoaDirector.Director(seed: 42) }
    #endif
  }

  /// Một khung: tiến đồng hồ tới `date`.
  func step(_ date: Date, heroWidth: Double) -> KoaDirector.Frame {
    #if DEBUG
      if let b = Self.bench, b != .live {
        context.canWalk = b != .rest
        context.moment = nil
        // hỏi lại khi việc đang làm đổi mà chưa phải đi (lời chào lúc mở phòng có thể đè yêu cầu)
        if director.current == .walkTo || director.current != benchAskedDuring { benchAsked = false }
        if b != .rest, director.current != .walkTo, !benchAsked {
          benchLeg.toggle()
          benchAsked = true
          benchAskedDuring = director.current
          let spot =
            b == .walk
            ? KoaRoomMap.Spot(.stage, benchLeg ? 120 : 270, 440) : KoaRoomMap.Spot(.floor, benchLeg ? 160 : 285, 372)
          director.request(.walkTo(spot))
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
    let wall = Date.now.timeIntervalSince1970
    #if DEBUG
      if f.reacted != nil, forcedMoment != nil { return f }
    #endif
    if let m = f.reacted, let facts {
      if m == .rankUp || m == .record { KoaSound.play(.chime) }
      memory.react(m, facts, at: wall)
      feel(wall)
      save()
    } else if wall - affectAt > 30 {
      feel(wall)
    }
    if Self.lively(f, prev: prevGaze) { lively = now + 0.25 }
    prevGaze = f.gaze
    let fast = now < lively || now < boostUntil
    let sway = f.plantSway != 0
    let bed = f.settled && context.bedtime
    if fast != moving || sway != swaying || f.settled != settled || bed != inBed {
      // không đổi trạng thái quan sát giữa lúc SwiftUI đang dựng view
      Task { @MainActor in
        self.moving = fast
        self.swaying = sway
        self.settled = f.settled
        self.inBed = bed
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
    settled = s == KoaRoomMap.stageMark || s == KoaRoomMap.door
    inBed = s == KoaRoomMap.door
  }
}
