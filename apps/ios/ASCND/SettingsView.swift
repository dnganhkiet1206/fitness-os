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

  @State private var showSignOutConfirm = false
  @State private var selectedLanguage = "vi"

  public init(
    account: AccountSummary? = nil,
    onSignOut: @escaping () -> Void = {},
    onLanguageChange: @escaping (String) -> Void = { _ in }
  ) {
    self.account = account
    self.onSignOut = onSignOut
    self.onLanguageChange = onLanguageChange
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

        // Language
        Section {
          Picker(
            String(localized: "settings.language"),
            selection: $selectedLanguage
          ) {
            Text("Tiếng Việt").tag("vi")
            Text("English").tag("en")
            Text("Español").tag("es")
          }
          .onChange(of: selectedLanguage) { _, new in
            onLanguageChange(new)
          }
        } header: {
          Text(String(localized: "settings.language"))
        }

        // Appearance (placeholder — hệ thống)
        Section {
          HStack {
            Text(String(localized: "settings.appearance"))
            Spacer()
            Text(String(localized: "settings.system"))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        } header: {
          Text(String(localized: "settings.appearance"))
        }

        // About
        Section {
          HStack {
            Text(String(localized: "settings.version"))
            Spacer()
            Text("1.0.0")
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
