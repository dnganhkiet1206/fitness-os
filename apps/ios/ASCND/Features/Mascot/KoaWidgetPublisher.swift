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
  private var imageKey: String?
  private var version = 0
  private var last: KoaWidgetData?

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
    var checks: [String] = []
    var nextQuest: MascotRules.Quest?
    /// Cấp của Koa (ô "CẤP" của thẻ).
    var level = 1
  }

  func publish(_ s: Snapshot) {
    let key = "\(s.userId)|\(s.mascotId)|\(s.emotion.rawValue)|\(s.equipped.joined(separator: ","))"
    if key != imageKey, render(s) {
      imageKey = key
      version += 1
    }
    var data = KoaWidgetData(
      day: s.day.description, line: s.line, next: s.next, done: s.done, total: s.total, streak: s.streak,
      nightLine: String(localized: "koa.say.night"), imageVersion: version, checks: s.checks,
      nextQuest: s.nextQuest?.rawValue)
    data.short = Self.short(s)
    data.level = s.level
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
    case .steps, nil: return String(localized: "koa.short.keep \(s.done) \(s.total)")
    }
  }

  /// Phiên kết thúc: lần sau vẽ lại từ đầu (ảnh đã bị `clear` xoá).
  func reset() {
    imageKey = nil
    last = nil
  }

  /// Avatar trên thẻ: Koa đứng tự do, bản đèn (thẻ luôn tối), ngày và đêm.
  static let avatarSize: CGFloat = 150

  private func render(_ s: Snapshot) -> Bool {
    guard let dir = store.containerURL else { return false }
    var ok = true
    for night in [false, true] {
      let figure = MascotFigureView(
        mascotId: s.mascotId, emotion: night ? .sleep : s.emotion, equipped: s.equipped, size: Self.avatarSize,
        animated: false, paper: false)
      let r = ImageRenderer(content: figure)
      r.scale = Self.scale
      guard let png = r.uiImage?.pngData() else {
        ok = false
        continue
      }
      let url = dir.appendingPathComponent(WidgetDataStore.koaImageName(night: night, dark: true))
      do { try png.write(to: url, options: .atomic) } catch { ok = false }
    }
    return ok
  }
}
