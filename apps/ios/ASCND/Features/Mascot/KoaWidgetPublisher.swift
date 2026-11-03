import ASCNDCore
import SwiftUI
import UIKit
import WidgetKit

/// Đẩy Koa của Hôm nay ra widget (#527, đợt 2C).
///
/// Widget là một "thẻ vận động viên" của Koa (Kiệt chọn mock A 20/10: kim loại đen
/// như thẻ hồ sơ, Koa làm avatar). Widget không chạy bộ vẽ Canvas của Koa, nên ở
/// đây vẽ sẵn ảnh Koa ngày / đêm vào App Group — chỉ vẽ lại khi Koa đổi (nét mặt,
/// đồ, linh vật) — và ghi phần chữ (CÙNG câu với Hôm nay). Đăng xuất: `WidgetRefresher`
/// xoá cả dữ liệu lẫn ảnh (`WidgetDataStore.clear`).
@MainActor
final class KoaWidgetPublisher {
  static let kind = "com.ascnd.fitnessos.widgets.koa"

  static let scale: CGFloat = 3

  private let store = WidgetDataStore()
  /// Koa đã vẽ ra App Group — nhớ qua các lần mở app (Sentry APPLE-IOS-B, 26/10:
  /// mỗi lần mở app vẽ lại hai ảnh 3x trên luồng chính, treo hơn 2 giây).
  private var imageKey: String? = UserDefaults.standard.string(forKey: KoaWidgetPublisher.imageKeyDefault)
  private var version = 0
  private var last: KoaWidgetData?
  private var pending: Snapshot?
  private var drawing: Task<Void, Never>?

  static let imageKeyDefault = "koaWidget.imageKey"

  struct Snapshot: Equatable {
    var userId: String
    var mascotId: String
    var emotion: KoaEmotion.Emotion
    var equipped: [String]
    var line: String
    var next: String?
    var done: Int
    var total: Int
    var streak: Int
    var day: LocalDate
    /// Tuần của Koa: ngày có buổi / buổi theo lịch (`nil` = chưa có lịch).
    var weekDone: Int?
    var weekTarget: Int?
    var checks: [String] = []
    var nextQuest: MascotRules.Quest?
    /// Cấp của Koa (ô "CẤP" của thẻ).
    var level = 1
    /// Hạng vóc dáng (Gains) của Koa trên widget.
    var build = 0
    /// Gains của Koa (GĐ2: ô số của thẻ thay "Cấp").
    var gains = 0
    /// Giờ ngủ của người dùng: widget chuyển Koa đi ngủ đúng giờ ấy.
    var sleep = KoaMood.SleepWindow.standard
  }

  static func imageKey(_ s: Snapshot) -> String {
    "\(s.userId)|\(s.mascotId)|\(s.emotion.rawValue)|\(s.equipped.joined(separator: ","))|\(s.build)|rest"
  }

  func publish(_ s: Snapshot) {
    // Trạng thái tạm lúc mở app (chưa tải xong ngày) rồi quay về Koa cũ: bỏ bản chờ.
    if Self.imageKey(s) != imageKey || !imagesExist { scheduleDraw(s) } else { pending = nil }
    var data = KoaWidgetData(
      day: s.day.description, line: s.line, next: s.next, done: s.done, total: s.total, streak: s.streak,
      nightLine: String(localized: "koa.say.night"), imageVersion: version, checks: s.checks,
      nextQuest: s.nextQuest?.rawValue)
    data.short = Self.short(s)
    data.sleep = s.sleep
    data.level = s.level
    data.gains = s.gains
    data.weekDone = s.weekDone
    data.weekTarget = s.weekTarget
    // App vừa dựng lại Hôm nay: số ly từ widget đã nằm trong số thật.
    guard data != last || (store.koa()?.waterTaps ?? 0) > 0 else { return }
    last = data
    store.writeKoa(data)
    WidgetCenter.shared.reloadTimelines(ofKind: Self.kind)
  }

  /// Câu ngắn của cỡ nhỏ: việc còn thiếu tiếp theo, hay "xong hết".
  static func short(_ s: Snapshot) -> String {
    if s.total > 0, s.done >= s.total { return String(localized: "koa.short.allDone") }
    switch s.nextQuest {
    case .meal: return String(localized: "koa.short.meal")
    case .water: return String(localized: "koa.short.water")
    case .sleep: return String(localized: "koa.short.sleep")
    case .workout: return String(localized: "koa.short.workout")
    case .steps, .recovery, nil: return String(localized: "koa.short.keep \(s.done) \(s.total)")
    }
  }

  /// Phiên kết thúc: lần sau vẽ lại từ đầu (ảnh đã bị `clear` xoá).
  func reset() {
    drawing?.cancel()
    drawing = nil
    pending = nil
    imageKey = nil
    UserDefaults.standard.removeObject(forKey: Self.imageKeyDefault)
    last = nil
  }

  private var imagesExist: Bool {
    guard let dir = store.containerURL else { return false }
    return [false, true].allSatisfy {
      FileManager.default.fileExists(atPath: dir.appendingPathComponent(WidgetDataStore.koaImageName(night: $0, dark: true)).path)
    }
  }

  /// Vẽ SAU khi màn đầu đã hiện, từng ảnh một, nhường luồng chính giữa hai ảnh — widget
  /// chờ được vài giây, người dùng thì không. Koa đổi tiếp trong lúc chờ: chỉ vẽ bản mới nhất.
  private func scheduleDraw(_ s: Snapshot) {
    pending = s
    guard drawing == nil else { return }
    drawing = Task { [weak self] in
      try? await Task.sleep(for: .seconds(2))
      while let self, let s = self.pending, !Task.isCancelled {
        self.pending = nil
        if Self.imageKey(s) == self.imageKey, self.imagesExist { continue }
        guard await self.render(s), !Task.isCancelled else { break }
        let key = Self.imageKey(s)
        self.imageKey = key
        UserDefaults.standard.set(key, forKey: Self.imageKeyDefault)
        self.version += 1
        if self.pending == nil { self.publish(s) }
      }
      self?.drawing = nil
    }
  }

  /// Avatar trên thẻ: Koa đứng tự do, bản đèn (thẻ luôn tối), ngày và đêm.
  static let avatarSize: CGFloat = 150
  /// Koa của Live Activity quãng nghỉ: nhỏ hơn avatar, vẽ 2x để không kéo dài lần vẽ.
  static let restSize: CGFloat = 110

  private func render(_ s: Snapshot) async -> Bool {
    guard let dir = store.containerURL else { return false }
    var ok = true
    for night in [false, true] {
      await Task.yield()
      let figure = MascotFigureView(
        mascotId: s.mascotId, emotion: night ? .sleep : s.emotion, equipped: s.equipped, size: Self.avatarSize,
        animated: false, paper: false, build: s.build)
      let r = ImageRenderer(content: figure)
      r.scale = Self.scale
      guard let png = r.uiImage?.pngData() else {
        ok = false
        continue
      }
      let url = dir.appendingPathComponent(WidgetDataStore.koaImageName(night: night, dark: true))
      do { try png.write(to: url, options: .atomic) } catch { ok = false }
    }
    for koa in RestKoa.allCases {
      await Task.yield()
      let figure = MascotFigureView(
        mascotId: s.mascotId, emotion: koa.emotion, equipped: s.equipped, size: Self.restSize,
        animated: false, paper: false, build: s.build)
      let r = ImageRenderer(content: figure)
      r.scale = 2
      guard let png = r.uiImage?.pngData() else {
        ok = false
        continue
      }
      let url = dir.appendingPathComponent(WidgetDataStore.restImageName(koa))
      do { try png.write(to: url, options: .atomic) } catch { ok = false }
    }
    return ok
  }
}
