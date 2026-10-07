// Settings/Profile shell — C sở hữu (#387).
//
// Presentation shell: account summary, language, appearance,
// sign-out confirmation, app/version/about.
// Không Supabase/Keychain; không quyết logout policy (#241).
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

  @State private var showSignOutConfirm = false
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
    onThemeChange: @escaping (String) -> Void = { _ in }
  ) {
    self.account = account
    self.onSignOut = onSignOut
    self.onLanguageChange = onLanguageChange
    self.showsLanguage = showsLanguage
    self.language = language
    self.theme = theme
    self.onThemeChange = onThemeChange
    _selectedLanguage = State(initialValue: language)
    _selectedTheme = State(initialValue: theme)
  }

  public var body: some View {
    NavigationStack {
      List {
        // Account
        Section {
          if let account, let email = account.email {
            HStack {
              Text(account.displayName ?? email)
                .font(DS.TextStyle.headline)
              Spacer()
              Text(email)
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .accessibilityElement(children: .combine)
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
            Picker(
              String(localized: "settings.language"),
              selection: $selectedLanguage
            ) {
              // Tên ngôn ngữ viết bằng CHÍNH ngôn ngữ ấy, không dịch — người
              // không đọc được ngôn ngữ đang chọn vẫn tìm ra ngôn ngữ của mình
              // (như RN `i18n.ts` LANGUAGES, như Cài đặt iOS). `verbatim`: không
              // tra xcstrings bằng chính chuỗi hiển thị.
              ForEach(Self.languages, id: \.code) { lang in
                Text(verbatim: lang.endonym).tag(lang.code)
              }
            }
            .onChange(of: selectedLanguage) { _, new in
              onLanguageChange(new)
            }
          } header: {
            Text(String(localized: "settings.language"))
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
        } header: {
          Text(String(localized: "settings.about"))
        }

        // Sign out
        if account != nil {
          Section {
            Button(role: .destructive) {
              showSignOutConfirm = true
            } label: {
              Text(String(localized: "settings.signOut"))
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
            }
          }
        }
      }
      .navigationTitle(Text("settings.title"))
      .confirmationDialog(
        String(localized: "settings.signOut.confirm.title"),
        isPresented: $showSignOutConfirm,
        titleVisibility: .visible
      ) {
        Button(
          String(localized: "settings.signOut"),
          role: .destructive,
          action: onSignOut
        )
        Button(
          String(localized: "settings.cancel"),
          role: .cancel
        ) {}
      } message: {
        Text(String(localized: "settings.signOut.confirm.message"))
      }
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
