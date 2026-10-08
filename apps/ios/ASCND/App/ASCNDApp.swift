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
    // Ngôn ngữ đã chọn (hoặc theo máy, như `deviceDefaultLang` của RN) cho
    // MỌI lần tra chữ, từ khung hình đầu tiên (#527 · 1.7).
    AppLanguage.shared.set(services.preferences.lang.rawValue)
    _services = State(initialValue: services)
    // Quãng nghỉ (và Live Activity trên màn khoá, có tên bài) của người vừa
    // rời đi không ở lại cho người sau.
    services.onSessionEnded { controller.handle(.cancel) }
    // Gán ngay trong init: khi hệ thống mở app ở nền chỉ để chạy nút ±15 của
    // Island, không có view nào xuất hiện — intent vẫn phải tìm được controller.
    RestIntentRouter.adjust = { delta in controller.adjust(by: delta) }
    RestIntentRouter.setPaused = { paused in controller.setPaused(paused) }
  }

  static func colorScheme(_ theme: AppPreferences.Theme) -> ColorScheme? {
    switch theme {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  var body: some Scene {
    WindowGroup {
      RootGate()
        // Dải trạng thái kết nối ở trên mọi màn, kể cả Đăng nhập (`_layout.tsx`).
        .overlay(alignment: .top) { ConnectionBanner() }
        // `Text("key")` của SwiftUI tra theo `\.locale`; ngày giờ / số cũng
        // định dạng theo ngôn ngữ đã chọn.
        .environment(\.locale, Locale(identifier: services.preferences.lang.rawValue))
        // Theme đã chọn cho cả cửa sổ (sheet, alert theo cùng). "Theo máy" là
        // `nil`: iOS luôn có sáng / tối, nên luật "máy không nói thì tối" của
        // RN không có ca nào ở đây.
        .preferredColorScheme(Self.colorScheme(services.preferences.theme))
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
