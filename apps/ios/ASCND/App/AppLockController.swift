import ASCNDCore
import ASCNDDesignSystem
import LocalAuthentication
import Observation
import SwiftUI

/// Khoá app bằng Face ID (#527 mục 7, Kiệt duyệt mock v2 01/11) — `use-app-lock.tsx`
/// của RN, luật thời gian ở `AppLock` (Core).
///
/// - Lưu trên máy (`ascnd_app_lock`, như RN), không lên server: khoá là của chiếc máy.
/// - Bật được khi máy có Face ID / Touch ID đã cài; bật phải qua một lần Face ID.
/// - Mở khoá: `.deviceOwnerAuthentication` — Face ID, hỏng thì mật mã máy (không ai bị
///   khoá ngoài app).
/// - Che nội dung ngay khi app không còn ở trước (màn chuyển app của iOS chụp lại
///   màn hình lúc ấy).
@MainActor
@Observable
final class AppLockController {
  static let enabledKey = "ascnd_app_lock"
  static let relockKey = "ascnd_app_lock_relock"

  private(set) var enabled: Bool
  private(set) var relock: AppLock.Relock
  /// Đang cần mở khoá.
  private(set) var locked: Bool
  /// App không ở trước — che nội dung (màn chuyển app).
  private(set) var covered = false
  private(set) var authenticating = false
  @ObservationIgnored private var backgroundedAt: Date?

  init() {
    let d = UserDefaults.standard
    let on = d.bool(forKey: Self.enabledKey) && Self.biometricsAvailable
    enabled = on
    relock = d.string(forKey: Self.relockKey).flatMap(AppLock.Relock.init) ?? .immediately
    locked = on
  }

  /// Máy có Face ID / Touch ID và đã cài khuôn mặt / vân tay.
  static var biometricsAvailable: Bool {
    LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
  }

  /// "Face ID" hay "Touch ID" — theo máy.
  static var biometryName: String {
    let c = LAContext()
    _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    return c.biometryType == .touchID ? "Touch ID" : "Face ID"
  }

  /// Bật: hỏi Face ID một lần trước (chắc chắn mở lại được). Tắt: không hỏi.
  func setEnabled(_ on: Bool) async {
    if on {
      guard Self.biometricsAvailable, await authenticate() else { return }
    }
    enabled = on
    locked = false
    UserDefaults.standard.set(on, forKey: Self.enabledKey)
  }

  func setRelock(_ r: AppLock.Relock) {
    relock = r
    UserDefaults.standard.set(r.rawValue, forKey: Self.relockKey)
  }

  func unlock() async {
    guard locked, !authenticating else { return }
    if await authenticate() { locked = false }
  }

  func scenePhaseChanged(_ phase: ScenePhase) {
    guard enabled else {
      covered = false
      return
    }
    switch phase {
    case .background:
      covered = true
      if backgroundedAt == nil { backgroundedAt = Date() }
    case .inactive:
      // Hộp Face ID của chính app cũng làm app "inactive" — không che lại khi ấy.
      if !authenticating { covered = true }
    case .active:
      covered = false
      if let since = backgroundedAt, AppLock.needsUnlock(away: Date().timeIntervalSince(since), relock: relock) {
        locked = true
      }
      backgroundedAt = nil
      if locked { Task { await unlock() } }
    @unknown default:
      break
    }
  }

  private func authenticate() async -> Bool {
    authenticating = true
    defer { authenticating = false }
    let c = LAContext()
    c.localizedFallbackTitle = String(localized: "lock.passcode")
    do {
      return try await c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: String(localized: "lock.reason"))
    } catch {
      return false
    }
  }
}

/// Màn khoá (mock v2 ảnh 2): chữ ASCND nhỏ, Face ID trong vòng vàng, "Chào mừng trở
/// lại", nội dung app mờ phía sau; "Mở khoá" và "Dùng mật mã" (cùng một hộp hệ thống,
/// hộp tự cho nhập mật mã khi Face ID hỏng).
struct AppLockScreen: View {
  let lock: AppLockController
  /// Chỉ che (màn chuyển app) — không có nút.
  var coverOnly = false
  @ScaledMetric(relativeTo: .largeTitle) private var ring: CGFloat = 92

  var body: some View {
    ZStack {
      Rectangle().fill(.ultraThinMaterial)
      DS.Color.background.swiftUI.opacity(0.72)
      VStack(spacing: 0) {
        Text("brand.name")
          .font(.system(size: 13, weight: .semibold))
          .tracking(5)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.top, 72)
          .accessibilityHidden(true)
        Spacer()
        if !coverOnly {
          ZStack {
            Circle().stroke(DS.Color.goldAccent, lineWidth: 1.5)
            Image(systemName: AppLockController.biometryName == "Touch ID" ? "touchid" : "faceid")
              .font(.system(size: ring * 0.48, weight: .light))
              .foregroundStyle(DS.Color.foreground.swiftUI)
          }
          .frame(width: ring, height: ring)
          .accessibilityHidden(true)
          Text("lock.welcome")
            .font(DS.TextStyle.title)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .multilineTextAlignment(.center)
            .padding(.top, DS.Spacing.lg)
            .accessibilityAddTraits(.isHeader)
          Text(verbatim: String(localized: "lock.hint \(AppLockController.biometryName)"))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
            .padding(.top, 6)
        }
        Spacer()
        if !coverOnly {
          VStack(spacing: DS.Spacing.sm) {
            Button {
              Task { await lock.unlock() }
            } label: {
              Text("lock.unlock").frame(maxWidth: .infinity).frame(minHeight: 50)
            }
            .buttonStyle(.dsPill)
            .disabled(lock.authenticating)
            Text("lock.passcode.note")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .multilineTextAlignment(.center)
          }
          .padding(.horizontal, DS.Spacing.lg)
          .padding(.bottom, 48)
        }
      }
      .padding(.horizontal, DS.Spacing.md)
    }
    .ignoresSafeArea()
    .accessibilityElement(children: coverOnly ? .ignore : .contain)
    .accessibilityLabel(coverOnly ? Text("brand.name") : Text(""))
  }
}

extension DS.Color {
  /// Vàng ánh kim của phòng Koa (mock v2) — đậm hơn ở nền sáng.
  static var goldAccent: Color {
    Color(UIColor { $0.userInterfaceStyle == .dark
      ? UIColor(red: 0.85, green: 0.72, blue: 0.47, alpha: 1) : UIColor(red: 0.55, green: 0.42, blue: 0.13, alpha: 1) })
  }
}

/// Cửa sổ riêng trên mọi thứ (sheet, bàn phím, hộp thoại) — lớp phủ trong cây SwiftUI
/// không che được sheet đang mở (Cài đặt, bình luận…).
@MainActor
final class AppLockWindow {
  private var window: UIWindow?

  /// `lang`: ngôn ngữ của app — cửa sổ mới không nhận `\.locale` của cây chính.
  func update(lock: AppLockController, lang: String) {
    let show = lock.enabled && (lock.locked || lock.covered)
    guard show else {
      window?.isHidden = true
      window = nil
      return
    }
    let coverOnly = !lock.locked
    if window == nil {
      guard
        let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
          .first(where: { $0.activationState != .unattached })
      else { return }
      let w = UIWindow(windowScene: scene)
      w.windowLevel = .alert + 1
      w.backgroundColor = .clear
      window = w
    }
    let host = UIHostingController(
      rootView: AppLockScreen(lock: lock, coverOnly: coverOnly).environment(\.locale, Locale(identifier: lang)))
    host.view.backgroundColor = .clear
    window?.rootViewController = host
    window?.isHidden = false
  }
}
