import ASCNDCore
import SwiftUI
import UIKit
import WidgetKit

/// Đẩy Koa của Hôm nay ra widget (#527, đợt 2C).
///
/// Widget không chạy bộ vẽ Canvas của Koa, nên ở đây vẽ sẵn ảnh phòng Koa (Kiệt
/// duyệt mock 20/10: Koa đứng trên bục trong phòng của mình, đúng sân khấu đã mua)
/// cho cỡ nhỏ / vừa × ngày / đêm × sáng / tối vào App Group — chỉ vẽ lại khi phòng
/// thật sự đổi (nét mặt, đồ, sân khấu, chuỗi trên tường, cấp) — và ghi phần chữ
/// (CÙNG câu với Hôm nay). Đăng xuất: `WidgetRefresher`
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
    /// Cấp (Koa lớn dần trên bục) — như sân khấu của phòng.
    var level = 1
  }

  func publish(_ s: Snapshot) {
    // Phòng vẽ cả bảng chuỗi trên tường và độ sáng theo năng lượng: đổi thì vẽ lại.
    let key = "\(s.userId)|\(s.mascotId)|\(s.emotion.rawValue)|\(s.equipped.joined(separator: ","))|\(s.streak)|"
      + "\(s.done)/\(s.total)|\(s.level)"
    if key != imageKey, render(s) {
      imageKey = key
      version += 1
    }
    var data = KoaWidgetData(
      day: s.day.description, line: s.line, next: s.next, done: s.done, total: s.total, streak: s.streak,
      nightLine: String(localized: "koa.say.night"), imageVersion: version, checks: s.checks,
      nextQuest: s.nextQuest?.rawValue)
    data.short = Self.short(s)
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

  /// Vùng của cảnh phòng (đơn vị 390 × 476) cho từng cỡ — đúng khung đã duyệt
  /// trong mock: cỡ nhỏ cắt vuông quanh Koa; cỡ vừa đặt Koa ở nửa trái, phần phải
  /// nằm dưới tấm chữ.
  static let smallRegion = CGRect(x: 25, y: 150, width: 340, height: 340)
  static let mediumRegion = CGRect(x: 72, y: 214, width: 535, height: 250)
  static let smallSize = CGSize(width: 170, height: 170)
  static let mediumSize = CGSize(width: 364, height: 170)

  private func render(_ s: Snapshot) -> Bool {
    guard let dir = store.containerURL else { return false }
    var ok = true
    for night in [false, true] {
      for dark in [false, true] {
        for medium in [false, true] {
          let size = medium ? Self.mediumSize : Self.smallSize
          let room = KoaRoomCrop(
            level: s.level, energy: s.total > 0 ? Double(s.done) / Double(s.total) : 0, streak: s.streak,
            emotion: night ? .sleep : s.emotion, equipped: s.equipped,
            region: medium ? Self.mediumRegion : Self.smallRegion
          )
          .frame(width: size.width, height: size.height)
          .environment(\.colorScheme, dark ? .dark : .light)
          let r = ImageRenderer(content: room)
          r.scale = Self.scale
          guard let png = r.uiImage?.pngData() else {
            ok = false
            continue
          }
          let url = dir.appendingPathComponent(WidgetDataStore.koaRoomImageName(medium: medium, night: night, dark: dark))
          do { try png.write(to: url, options: .atomic) } catch { ok = false }
        }
      }
    }
    return ok
  }
}

/// Sân khấu thật của phòng Koa (`MascotStage`), cắt theo `region` vừa khung.
struct KoaRoomCrop: View {
  let level: Int
  let energy: Double
  let streak: Int
  let emotion: KoaEmotion.Emotion
  let equipped: [String]
  let region: CGRect

  var body: some View {
    GeometryReader { g in
      let s = g.size.width / region.width
      ZStack(alignment: .topLeading) {
        MascotStage(level: level, energy: energy, streak: streak, celebrateSignal: 0, emotion: emotion, equipped: equipped)
          .frame(width: StudioScene.width * s, height: StudioScene.sceneBottom * s)
          .fixedSize()
          .offset(x: -region.minX * s, y: -region.minY * s)
      }
      .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
    }
    .clipped()
  }
}
