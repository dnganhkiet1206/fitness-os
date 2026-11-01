import ASCNDCore
import ASCNDLiveActivity
import SwiftUI
import UIKit

@main
struct ASCNDApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @State private var rest: RestTimerController
  @State private var services: AppServices
  /// Link `ascnd://` tới một màn, chờ phiên mở (#527 deep link lát 2).
  @State private var links = DeepLinkInbox()
  /// Khoá Face ID (#527 mục 7) — cửa sổ riêng trên mọi sheet.
  @State private var lock = AppLockController()
  @State private var lockWindow = AppLockWindow()

  init() {
    let store = RestTimerStore()
    let controller = RestTimerController(
      driver: ActivityKitRestDriver(),
      restored: store.load(),
      persist: { timer, target in store.save(timer, target) })
    // RT-6: hết giờ tự nhiên → một rung "thành công", đúng một lần.
    controller.onRestFinished = { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    _rest = State(initialValue: controller)
    // Đo lường (15/10): chỉ khởi động khi có khoá — xem Telemetry.swift.
    // Chế độ UI test (Debug): không gửi gì lên Sentry / PostHog.
    if !AppServices.uiTest { Telemetry.start() }
    let services = AppServices()
    // Ngôn ngữ theo iPhone (Kiệt 23/10), nhưng MỘT nguồn cho mọi chữ (25/10: thẻ Tuần
    // của Koa lẫn Việt / Anh trên máy Kiệt): `Text("khoá")` tra theo `\.locale` của app,
    // `String(localized:)` tra theo bundle — hai nguồn có thể lệch. Ghim cả hai vào cùng
    // ngôn ngữ iOS đang hiện cho app (`preferences.lang`, cũng là ngôn ngữ của AI).
    AppLanguage.shared.set(services.preferences.lang.rawValue)
    _services = State(initialValue: services)
    // Làm mới nền cho thông báo cộng đồng (16/10) — cần dịch vụ khi không có view.
    CommunityAlerts.services = services
    // Quãng nghỉ (và Live Activity trên màn khoá, có tên bài) của người vừa
    // rời đi không ở lại cho người sau.
    services.onSessionEnded { controller.handle(.cancel) }
    // Gán ngay trong init: khi hệ thống mở app ở nền chỉ để chạy nút ±15 của
    // Island, không có view nào xuất hiện — intent vẫn phải tìm được controller.
    RestIntentRouter.adjust = { delta in controller.adjust(by: delta) }
    RestIntentRouter.setPaused = { paused in controller.setPaused(paused) }
    // Nút "+1 ly" trên widget Koa (đợt 2C).
    KoaIntentRouter.addWater = { await services.addWaterFromWidget() }
  }

  /// Hiện / ẩn cửa sổ khoá theo trạng thái; cùng ngôn ngữ và sáng / tối với app.
  private func showLock() {
    lockWindow.update(lock: lock, lang: services.preferences.lang.rawValue)
    Self.applyTheme(services.preferences.theme)
  }

  static func applyTheme(_ theme: AppPreferences.Theme) {
    let style: UIUserInterfaceStyle =
      switch theme {
      case .system: .unspecified
      case .light: .light
      case .dark: .dark
      }
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows { window.overrideUserInterfaceStyle = style }
    }
  }

  var body: some Scene {
    WindowGroup {
      // Dải trạng thái kết nối ở trên mọi màn, kể cả Đăng nhập (`_layout.tsx`).
      // Xếp TRÊN app, không phủ (Kiệt duyệt phương án A 28/10): dải đẩy trang xuống
      // thay vì đè chữ ASCND ở đầu Hôm nay. `safeAreaInset` không đi qua TabView
      // (UIKit) nên trang dưới tab vẫn bị đè — VStack thì app thật sự nhỏ lại.
      VStack(spacing: 0) {
        ConnectionBanner()
        RootGate()
      }
        // `Text("key")` của SwiftUI tra theo `\.locale`; ngày giờ / số cũng
        // định dạng theo ngôn ngữ đã chọn.
        .environment(\.locale, Locale(identifier: services.preferences.lang.rawValue))
        // Theme đã chọn cho CẢ CỬA SỔ (16/10, lỗi chủ dự án báo: đổi sáng ↔ tối thì
        // Cài đặt / Hồ sơ — đang mở dạng sheet — không đổi theo). `preferredColorScheme`
        // ở gốc không đẩy xuống sheet đang mở, nhất là khi về "Theo máy" (`nil`);
        // đặt `overrideUserInterfaceStyle` của cửa sổ thì mọi màn, sheet, alert đổi
        // cùng lúc. "Theo máy" = `.unspecified`.
        .onChange(of: services.preferences.theme, initial: true) { _, theme in Self.applyTheme(theme) }
        .onAppear { Self.applyTheme(services.preferences.theme) }
        .environment(rest)
        .environment(services)
        .environment(lock)
        .onChange(of: lock.locked) { _, _ in showLock() }
        .onChange(of: lock.covered) { _, _ in showLock() }
        .onChange(of: lock.enabled) { _, _ in showLock() }
        .environment(links)
        // Phiên trước, Island sau (#252): mở app khi phiên đã mất lúc app
        // không chạy thì quãng nghỉ đã lưu là của người trước — không phát lại.
        .task {
          await services.start()
          await rest.reconcile(signedIn: services.session.session != nil)
          #if DEBUG
            await CommunityAlerts.postTestIfAsked(services: services)
          #endif
        }
        // Phiên đổi (đăng nhập, đăng xuất, đổi tài khoản) → vòng sync biết
        // gửi hàng của ai; bản ghi của tài khoản khác không bao giờ đi.
        .onChange(of: services.session.session?.userId, initial: true) { _, user in
          services.sync.setSignedInUser(user)
          // Lúc mở app phiên còn `.loading` (chưa khôi phục): `nil` ở đây KHÔNG phải
          // đăng xuất — xoá widget lúc này làm mỗi lần mở app widget trống và Koa phải
          // vẽ lại trên luồng chính (Sentry APPLE-IOS-B, 26/10). Đăng xuất thật: bên dưới.
          if user != nil { services.widgets.setUser(user) }
          Telemetry.setUser(user)
        }
        .onChange(of: services.session.phase == .signedOut, initial: true) { _, signedOut in
          if signedOut { services.widgets.setUser(nil) }
        }
        // `ascnd://` (#527 deep link): link email auth (xác nhận đăng ký, đặt
        // lại mật khẩu) mở phiên; link khác tới màn của nó (`DeepLink`).
        .onOpenURL { url in
          Task {
            if await services.session.open(url) { return }
            if let target = DeepLink.target(url) { links.receive(target) }
          }
        }
    }
    .onChange(of: scenePhase, initial: true) { _, phase in
      lock.scenePhaseChanged(phase)
      showLock()
    }
    .onChange(of: scenePhase) { _, phase in
      // Quay lại foreground: tính lại từ `endsAt` ngay, đóng quãng nghỉ đã hết
      // trong lúc app ở nền (RT-4, RT-5); thử gửi hàng đợi.
      if phase == .active {
        rest.settle()
        services.didBecomeActive()
        // `app_opened` (ngày 1 / ngày 7… cho tỉ lệ quay lại) — tắt khi chưa có khoá.
        Telemetry.appOpened()
      } else if phase == .background {
        services.didEnterBackground()
        CommunityAlerts.schedule()
      }
    }
    // Tin cộng đồng khi app không mở (16/10): iOS gọi lượt làm mới nền.
    .backgroundTask(.appRefresh(CommunityAlerts.taskId)) {
      await CommunityAlerts.runInBackground()
    }
  }
}
