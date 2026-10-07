import ASCNDCore
import ASCNDLiveActivity
import SwiftUI
import UIKit

@main
struct ASCNDApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @State private var rest: RestTimerController
  @State private var services: AppServices

  init() {
    let store = RestTimerStore()
    let controller = RestTimerController(
      driver: ActivityKitRestDriver(),
      restored: store.load(),
      persist: { timer, target in store.save(timer, target) })
    // RT-6: hết giờ tự nhiên → một rung "thành công", đúng một lần.
    controller.onRestFinished = { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    _rest = State(initialValue: controller)
    let services = AppServices()
    _services = State(initialValue: services)
    // Quãng nghỉ (và Live Activity trên màn khoá, có tên bài) của người vừa
    // rời đi không ở lại cho người sau.
    services.onSessionEnded { controller.handle(.cancel) }
    // Gán ngay trong init: khi hệ thống mở app ở nền chỉ để chạy nút ±15 của
    // Island, không có view nào xuất hiện — intent vẫn phải tìm được controller.
    RestIntentRouter.adjust = { delta in controller.adjust(by: delta) }
  }

  var body: some Scene {
    WindowGroup {
      RootGate()
        // Dải trạng thái kết nối ở trên mọi màn, kể cả Đăng nhập (`_layout.tsx`).
        .overlay(alignment: .top) { ConnectionBanner() }
        .environment(rest)
        .environment(services)
        .task { await rest.reconcile() }
        .task { await services.start() }
        // Phiên đổi (đăng nhập, đăng xuất, đổi tài khoản) → vòng sync biết
        // gửi hàng của ai; bản ghi của tài khoản khác không bao giờ đi.
        .onChange(of: services.session.session?.userId, initial: true) { _, user in
          services.sync.setSignedInUser(user)
        }
    }
    .onChange(of: scenePhase) { _, phase in
      // Quay lại foreground: tính lại từ `endsAt` ngay, đóng quãng nghỉ đã hết
      // trong lúc app ở nền (RT-4, RT-5); thử gửi hàng đợi.
      if phase == .active {
        rest.settle()
        services.didBecomeActive()
      } else if phase == .background {
        services.didEnterBackground()
      }
    }
  }
}
