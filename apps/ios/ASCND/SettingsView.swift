// Settings/Profile shell — C sở hữu (#387).
//
// Presentation shell: account summary, language, appearance,
// sign-out confirmation, app/version/about.
// Không Supabase/Keychain; không quyết logout policy (#241).
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thông tin account — A cung cấp sau.
public struct AccountSummary: Hashable, Sendable {
  public let email: String?
  public let displayName: String?

  public init(email: String? = nil, displayName: String? = nil) {
    self.email = email
    self.displayName = displayName
  }
}

public struct SettingsView: View {
  let account: AccountSummary?
  var onSignOut: () -> Void
  var onLanguageChange: (String) -> Void
  /// Ngôn ngữ đang dùng (`vi` / `en` / `es`) — bộ chọn bắt đầu từ đây, không
  /// từ một giá trị cứng.
  var language: String
  /// Theme đã chọn: `system` / `light` / `dark` (`ascnd_theme`).
  var theme: String
  var onThemeChange: (String) -> Void
  /// Hiện bộ chọn ngôn ngữ. Production tắt cho tới khi đổi ngôn ngữ trong app
  /// đổi được chữ thật (#527 Phase 1): chữ app hiện theo ngôn ngữ máy, một bộ
  /// chọn không đổi gì là một nút hỏng.
  var showsLanguage: Bool
  /// Dựng form đổi mật khẩu cho phiên đang mở (`settings.tsx:658`); `nil` khi
  /// không có phiên (preview, đã đăng xuất) — không hiện hàng.
  var makePasswordChange: (@MainActor () -> PasswordChangeController)?
  /// Ngôn ngữ của văn bản pháp lý (`settings.tsx:739`); `nil` thì không hiện hàng.
  var legalLang: AppPreferences.Lang?
  /// Apple Health (15/10, audit toàn app: thẻ đồng bộ lặp ở Hôm nay và Trợ lý) —
  /// thẻ đầy đủ ở đây; các tab chỉ còn một dòng. `nil` → không hiện.
  var healthSync: (@MainActor () async throws(HealthSync.Failure) -> Void)?
  /// Đã kết nối Apple Health chưa (18/10: hàng Health có hai trạng thái).
  var healthConnected: (@MainActor () async -> Bool)?
  /// Bước chân từ iPhone khi không kết nối Health (18/10).
  var phoneSteps: PhoneSteps?
  var healthAvailable = false
  /// Xoá tài khoản (App Store 5.1.1(v); 16/10, chủ dự án: "không có tuỳ chọn xoá
  /// tài khoản"). `nil` → không hiện hàng.
  var deleteAccount: (@MainActor () async -> AccountDeletion)?

  /// Vừa đổi mật khẩu xong — RN `toast.success(settingsPasswordChanged)`;
  /// app chưa có toast nên báo ngay dưới hàng, tới khi rời Cài đặt.
  @State private var passwordChanged = false
  @State private var deleting = false
  @State private var deleteResult: AccountDeletion?
  @State private var selectedLanguage: String
  @State private var selectedTheme: String

  /// Theme như RN `settings.tsx`: "Theo máy" đứng đầu (mặc định), rồi sáng, tối.
  static let themes = ["system", "light", "dark"]

  static func themeLabel(_ code: String) -> String {
    switch code {
    case "light": String(localized: "settings.theme.light")
    case "dark": String(localized: "settings.theme.dark")
    default: String(localized: "settings.system")
    }
  }

  /// Ngôn ngữ app hỗ trợ: mã + tên bằng chính ngôn ngữ ấy (endonym).
  static let languages: [(code: String, endonym: String)] = [
    ("vi", "Tiếng Việt"), ("en", "English"), ("es", "Español"),
  ]

  private func runDelete() {
    guard let deleteAccount else { return }
    deleting = true
    deleteResult = nil
    Task {
      let result = await deleteAccount()
      deleting = false
      deleteResult = result
    }
  }

  /// Chữ báo sau khi xoá không xong (xoá xong thì app đã đăng xuất).
  static func deleteText(_ r: AccountDeletion) -> String? {
    switch r {
    case .deleted: nil
    case .failed(partial: true): String(localized: "settings.delete.partial")
    case .failed(partial: false): String(localized: "settings.delete.failed")
    case .offline: String(localized: "settings.delete.offline")
    case .notSignedIn: String(localized: "settings.delete.failed")
    }
  }

  /// Version từ bundle — không hardcode.
  private var appVersion: String {
    Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
  }

  public init(
    account: AccountSummary? = nil,
    onSignOut: @escaping () -> Void = {},
    onLanguageChange: @escaping (String) -> Void = { _ in },
    showsLanguage: Bool = true,
    language: String = "vi",
    theme: String = "system",
    onThemeChange: @escaping (String) -> Void = { _ in },
    makePasswordChange: (@MainActor () -> PasswordChangeController)? = nil,
    legalLang: AppPreferences.Lang? = nil,
    healthAvailable: Bool = false,
    healthSync: (@MainActor () async throws(HealthSync.Failure) -> Void)? = nil,
    healthConnected: (@MainActor () async -> Bool)? = nil,
    phoneSteps: PhoneSteps? = nil,
    deleteAccount: (@MainActor () async -> AccountDeletion)? = nil
  ) {
    self.account = account
    self.onSignOut = onSignOut
    self.onLanguageChange = onLanguageChange
    self.showsLanguage = showsLanguage
    self.language = language
    self.theme = theme
    self.onThemeChange = onThemeChange
    self.makePasswordChange = makePasswordChange
    self.legalLang = legalLang
    self.healthAvailable = healthAvailable
    self.healthSync = healthSync
    self.healthConnected = healthConnected
    self.phoneSteps = phoneSteps
    self.deleteAccount = deleteAccount
    _selectedLanguage = State(initialValue: language)
    _selectedTheme = State(initialValue: theme)
  }

  public var body: some View {
    NavigationStack {
      List {
        // Account — tên, mục tiêu, trình độ ở trang Hồ sơ (15/10, một trang Hồ sơ);
        // ở đây chỉ còn email đăng nhập.
        Section {
          if let account, let email = account.email {
            if let name = account.displayName {
              LabeledContent(name) { Text(verbatim: email) }
            } else {
              Label { Text(verbatim: email) } icon: { Image(systemName: "envelope") }
            }
          } else {
            Text(String(localized: "settings.notSignedIn"))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        } header: {
          Text(String(localized: "settings.account"))
        }

        // Giao diện — NGAY TRÊN ngôn ngữ như RN: hai tuỳ chọn của MÁY đứng cạnh nhau.
        Section {
          Picker(String(localized: "settings.appearance"), selection: $selectedTheme) {
            ForEach(Self.themes, id: \.self) { t in
              Text(Self.themeLabel(t)).tag(t)
            }
          }
          .pickerStyle(.segmented)
          .onChange(of: selectedTheme) { _, new in
            onThemeChange(new)
          }
        } header: {
          Text(String(localized: "settings.appearance"))
        }

        // Language
        if showsLanguage {
          Section {
            // Một chữ "Ngôn ngữ" (15/10, audit: tiêu đề mục và tên dòng lặp nhau) —
            // dòng có icon như Nhắc nhở / Đổi mật khẩu, mục không còn tiêu đề.
            Picker(
              selection: $selectedLanguage
            ) {
              // Tên ngôn ngữ viết bằng CHÍNH ngôn ngữ ấy, không dịch — người
              // không đọc được ngôn ngữ đang chọn vẫn tìm ra ngôn ngữ của mình
              // (như RN `i18n.ts` LANGUAGES, như Cài đặt iOS). `verbatim`: không
              // tra xcstrings bằng chính chuỗi hiển thị.
              ForEach(Self.languages, id: \.code) { lang in
                Text(verbatim: lang.endonym).tag(lang.code)
              }
            } label: {
              Label(String(localized: "settings.language"), systemImage: "globe")
            }
            .onChange(of: selectedLanguage) { _, new in
              onLanguageChange(new)
            }
          }
        }

        // Apple Health chỉ ở đây (18/10, chủ dự án): chưa kết nối → "Kết nối";
        // đã kết nối → "Đã kết nối". Đồng bộ tự chạy (mở app + nền), không có nút.
        if let healthSync, healthAvailable {
          HealthSettingsSection(sync: healthSync, isConnected: healthConnected ?? { false }, phoneSteps: phoneSteps)
        }

        // Nhắc nhở — thông báo cục bộ (`settings.tsx:604`, `nav.push('/reminders')`).
        Section {
          NavigationLink {
            RemindersView()
          } label: {
            Label {
              VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "reminders.title"))
                Text(String(localized: "reminders.desc"))
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
            } icon: {
              Image(systemName: "bell")
            }
          }
        }

        // Đổi mật khẩu (`settings.tsx:658`, `nav.push('/change-password')`).
        if account != nil, let makePasswordChange {
          Section {
            NavigationLink {
              ChangePasswordView(controller: makePasswordChange()) { passwordChanged = true }
            } label: {
              Label(String(localized: "settings.changePassword"), systemImage: "key")
            }
          } footer: {
            if passwordChanged {
              Label(String(localized: "settings.passwordChanged"), systemImage: "checkmark.circle.fill")
                .foregroundStyle(DS.Color.readinessGreen.swiftUI)
            }
          }
        }

        // About
        Section {
          HStack {
            Text(String(localized: "settings.version"))
            Spacer()
            Text(appVersion)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .monospacedDigit()
          }
          // Pháp lý (`settings.tsx:739`, `nav.push('/legal')`): đủ bốn tab.
          if let legalLang {
            NavigationLink {
              LegalView(lang: legalLang)
            } label: {
              Label(String(localized: "settings.legal"), systemImage: "checkmark.shield")
            }
          }
        } header: {
          Text(String(localized: "settings.about"))
        }

        // Đăng xuất + xoá tài khoản.
        if account != nil {
          Section {
            Button(role: .destructive) {
              ConfirmAlert.present(
                title: String(localized: "settings.signOut.confirm.title"),
                message: String(localized: "settings.signOut.confirm.message"),
                confirm: String(localized: "settings.signOut"),
                cancel: String(localized: "settings.cancel"),
                action: onSignOut)
            } label: {
              Text(String(localized: "settings.signOut"))
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
            }
          }
          if deleteAccount != nil {
            Section {
              Button(role: .destructive) {
                ConfirmAlert.present(
                  title: String(localized: "settings.delete.title"),
                  message: String(localized: "settings.delete.message"),
                  confirm: String(localized: "settings.delete.confirm"),
                  cancel: String(localized: "settings.cancel"),
                  action: runDelete)
              } label: {
                HStack(spacing: 8) {
                  if deleting { ProgressView() }
                  Text(deleting ? String(localized: "settings.delete.progress") : String(localized: "settings.delete"))
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
              }
              .disabled(deleting)
              if let deleteResult, let text = Self.deleteText(deleteResult) {
                Text(text)
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.destructive.swiftUI)
              }
            } footer: {
              Text(String(localized: "settings.delete.footer"))
            }
          }
        }
      }
      .navigationTitle(Text("settings.title"))
      .ascndPage()
    }
  }
}

// MARK: - Preview

#Preview("Settings — signed in") {
  SettingsView(
    account: .init(email: "test@example.com", displayName: "Kiệt")
  )
}

#Preview("Settings — signed out") {
  SettingsView(account: nil)
    .preferredColorScheme(.dark)
}

/// Mục Apple Health của Cài đặt (18/10): một hàng, hai trạng thái.
/// Bước chân từ cảm biến iPhone — bật một lần, chỉ khi không dùng Apple Health.
public struct PhoneSteps {
  let isOn: @MainActor () -> Bool
  let enable: @MainActor () async -> Bool

  public init(isOn: @escaping @MainActor () -> Bool, enable: @escaping @MainActor () async -> Bool) {
    self.isOn = isOn
    self.enable = enable
  }
}

private struct HealthSettingsSection: View {
  let sync: @MainActor () async throws(HealthSync.Failure) -> Void
  let isConnected: @MainActor () async -> Bool
  var phoneSteps: PhoneSteps?
  @State private var stepsOn = false

  @State private var connected: Bool?
  @State private var running = false
  @State private var failure: HealthSync.Failure?

  var body: some View {
    Section {
      HStack(spacing: 12) {
        Image(systemName: "heart.fill")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white)
          .frame(width: 28, height: 28)
          .background(DS.Color.destructive.swiftUI, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
          .accessibilityHidden(true)
        Text(String(localized: "hs.title"))
        Spacer(minLength: 0)
        if connected == true {
          Label(String(localized: "hs.connected"), systemImage: "checkmark.circle.fill")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        } else if running {
          ProgressView()
        } else if connected == false {
          Button(String(localized: "hcard.connect")) { Task { await connect() } }
            .font(DS.TextStyle.footnote.weight(.semibold))
            .buttonStyle(.bordered)
            .tint(DS.Color.foreground.swiftUI)
        }
      }
      .frame(minHeight: 44)
      .accessibilityElement(children: .combine)
      // Không dùng Health: vẫn có bước chân tự động từ iPhone.
      if connected == false, let phoneSteps {
        HStack(spacing: 12) {
          Image(systemName: "figure.walk")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(DS.Color.readinessGreen.swiftUI, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .accessibilityHidden(true)
          Text(String(localized: "steps.phone"))
          Spacer(minLength: 0)
          if stepsOn {
            Label(String(localized: "steps.phone.on"), systemImage: "checkmark.circle.fill")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.readinessGreen.swiftUI)
          } else {
            Button(String(localized: "steps.phone.enable")) {
              Task { stepsOn = await phoneSteps.enable() }
            }
            .font(DS.TextStyle.footnote.weight(.semibold))
            .buttonStyle(.bordered)
            .tint(DS.Color.foreground.swiftUI)
          }
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
      }
      if let failure {
        Text(HealthSyncCard.message(.failed(failure)))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
    } footer: {
      Text(String(localized: connected == true ? "hs.auto" : "hs.brings"))
    }
    .task {
      connected = await isConnected()
      stepsOn = phoneSteps?.isOn() ?? false
    }
  }

  private func connect() async {
    guard !running else { return }
    running = true
    failure = nil
    defer { running = false }
    do throws(HealthSync.Failure) {
      try await sync()
    } catch {
      // Không có dữ liệu cũng là đã kết nối xong (quyền đã hỏi).
      if error != .noData { failure = error }
    }
    connected = await isConnected()
  }
}
