import ASCNDCore
import ASCNDLiveActivity
import SwiftUI
import UIKit

@main
struct ASCNDApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @State private var rest: RestTimerController

  init() {
    let store = RestTimerStore()
    let controller = RestTimerController(
      driver: ActivityKitRestDriver(),
      restored: store.load(),
      persist: { timer, target in store.save(timer, target) })
    // RT-6: hết giờ tự nhiên → một rung "thành công", đúng một lần.
    controller.onRestFinished = { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    _rest = State(initialValue: controller)
    // Gán ngay trong init: khi hệ thống mở app ở nền chỉ để chạy nút ±15 của
    // Island, không có view nào xuất hiện — intent vẫn phải tìm được controller.
    RestIntentRouter.adjust = { delta in controller.adjust(by: delta) }
  }

  var body: some Scene {
    WindowGroup {
      RootTabView()
        .environment(rest)
        .task { await rest.reconcile() }
    }
    .onChange(of: scenePhase) { _, phase in
      // Quay lại foreground: tính lại từ `endsAt` ngay, đóng quãng nghỉ đã hết
      // trong lúc app ở nền (RT-4, RT-5).
      if phase == .active { rest.settle() }
    }
  }
}
