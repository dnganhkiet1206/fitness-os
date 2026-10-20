import ASCNDCore
import SwiftUI
import UIKit
import WidgetKit

/// Đẩy Koa của Hôm nay ra widget (#527, đợt 2C).
///
/// Widget không chạy bộ vẽ Canvas của Koa, nên ở đây vẽ sẵn bốn ảnh tĩnh (ngày /
/// đêm × giấy / đèn) vào App Group — chỉ vẽ lại khi Koa thật sự đổi (nét mặt, đồ,
/// linh vật) — và ghi phần chữ (CÙNG câu với Hôm nay). Đăng xuất: `WidgetRefresher`
/// xoá cả dữ liệu lẫn ảnh (`WidgetDataStore.clear`).
@MainActor
final class KoaWidgetPublisher {
  static let kind = "com.ascnd.fitnessos.widgets.koa"
  /// Cỡ vẽ (điểm) × tỉ lệ: đủ nét cho widget vừa, nhẹ cho bộ nhớ widget.
  static let size: CGFloat = 150
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
  }

  func publish(_ s: Snapshot) {
    let key = "\(s.userId)|\(s.mascotId)|\(s.emotion.rawValue)|\(s.equipped.joined(separator: ","))"
    if key != imageKey, render(s) {
      imageKey = key
      version += 1
    }
    let data = KoaWidgetData(
      day: s.day.description, line: s.line, next: s.next, done: s.done, total: s.total, streak: s.streak,
      nightLine: String(localized: "koa.say.night"), imageVersion: version)
    guard data != last else { return }
    last = data
    store.writeKoa(data)
    WidgetCenter.shared.reloadTimelines(ofKind: Self.kind)
  }

  /// Phiên kết thúc: lần sau vẽ lại từ đầu (ảnh đã bị `clear` xoá).
  func reset() {
    imageKey = nil
    last = nil
  }

  private func render(_ s: Snapshot) -> Bool {
    guard let dir = store.containerURL else { return false }
    var ok = true
    for night in [false, true] {
      for dark in [false, true] {
        let figure = MascotFigureView(
          mascotId: s.mascotId, emotion: night ? .sleep : s.emotion, equipped: s.equipped, size: Self.size,
          animated: false, paper: !dark)
        let r = ImageRenderer(content: figure)
        r.scale = Self.scale
        guard let png = r.uiImage?.pngData() else {
          ok = false
          continue
        }
        let url = dir.appendingPathComponent(WidgetDataStore.koaImageName(night: night, dark: dark))
        do { try png.write(to: url, options: .atomic) } catch { ok = false }
      }
    }
    return ok
  }
}
