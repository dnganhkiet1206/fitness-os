// Màn đăng nhập thật — C sở hữu UI (#294).
//
// Thay `SignInView` tạm của A (verbatim, chỉ email + mật khẩu).
// Theo baseline `auth-screen.tsx` @ fac9ac2: 3 chế độ signin/signup/forgot,
// Sign in with Apple, lỗi bằng chữ người đọc được.
//
// Ranh giới: View CHỈ gọi `SessionStore` (signIn/signUp/signInWithApple/
// resetPassword). Không đụng Keychain, Supabase client, dọn dữ liệu (A9).
import ASCNDCore
import ASCNDDesignSystem
import AuthenticationServices
import CryptoKit
import SwiftUI

/// 3 chế độ của màn auth (baseline `auth-screen.tsx`).
enum AuthMode: Hashable {
  case signin
  case signup
  case forgot
}

struct AuthView: View {
  @Environment(AppServices.self) private var services

  @State private var mode: AuthMode = .signin
  @State private var name = ""
  @State private var email = ""
  @State private var password = ""
  @State private var confirmPassword = ""
  @State private var busy = false
  @State private var errorMessage: String?
  @State private var resetSent = false
  /// Đã chạm submit — hiện lỗi field (#313).
  @State private var attemptedSubmit = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.lg) {
          // Logo / tiêu đề.
          VStack(spacing: DS.Spacing.sm) {
            Text("ASCND")
              .font(DS.TextStyle.hero)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .accessibilityAddTraits(.isHeader)
            Text(subtitle)
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .multilineTextAlignment(.center)
          }
          .padding(.top, DS.Spacing.xl)

          DSCard {
            VStack(spacing: DS.Spacing.md) {
              if mode == .signup {
                authField(
                  title: String(localized: "auth.name"),
                  text: $name,
                  contentType: .name,
                  keyboard: .default
                )
              }

              authField(
                title: String(localized: "auth.email"),
                text: $email,
                contentType: .username,
                keyboard: .emailAddress
              )
              fieldError(emailError)

              if mode != .forgot {
                SecureField(
                  String(localized: "auth.password"),
                  text: $password
                )
                .textContentType(mode == .signup ? .newPassword : .password)
                .font(DS.TextStyle.body)
                .padding(DS.Spacing.sm)
                .frame(minHeight: 48)
                .background(DS.Color.secondary.swiftUI)
                .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
                .accessibilityLabel(Text(String(localized: "auth.password")))
                fieldError(passwordError)

                // Nhập lại mật khẩu (chỉ signup, #313).
                if mode == .signup {
                  SecureField(
                    String(localized: "auth.confirmPassword"),
                    text: $confirmPassword
                  )
                  .textContentType(.newPassword)
                  .font(DS.TextStyle.body)
                  .padding(DS.Spacing.sm)
                  .frame(minHeight: 48)
                  .background(DS.Color.secondary.swiftUI)
                  .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
                  .accessibilityLabel(Text(String(localized: "auth.confirmPassword")))
                  fieldError(confirmError)
                }
              }

              if let errorMessage {
                Text(errorMessage)
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.destructive.swiftUI)
                  .multilineTextAlignment(.center)
                  .accessibilityLabel(Text(errorMessage))
              }

              if resetSent {
                Text(String(localized: "auth.resetSent"))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.metricBlue.swiftUI)
                  .multilineTextAlignment(.center)
              }

              DSButton(
                busy
                  ? String(localized: "auth.working")
                  : primaryActionTitle,
                style: .primary,
                action: { Task { await submit() } }
              )
              .disabled(!canSubmit || busy)
              .opacity(canSubmit && !busy ? 1 : 0.5)

              if mode == .signin {
                Button(String(localized: "auth.forgot")) {
                  mode = .forgot
                  errorMessage = nil
                }
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.metricBlue.swiftUI)
                .frame(minHeight: 44)
              }
            }
          }

          // Sign in with Apple (chỉ signin/signup).
          if mode != .forgot {
            SignInWithAppleButton(
              onRequest: configureAppleRequest,
              onCompletion: handleAppleCompletion
            )
            .signInWithAppleButtonStyle(.black)
            .frame(minHeight: 48)
            .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
            .accessibilityLabel(Text(String(localized: "auth.apple")))
          }

          // Chuyển chế độ.
          if mode != .forgot {
            Button {
              mode = mode == .signin ? .signup : .signin
              errorMessage = nil
            } label: {
              Text(mode == .signin
                ? String(localized: "auth.switchToSignup")
                : String(localized: "auth.switchToSignin"))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.metricBlue.swiftUI)
            }
            .frame(minHeight: 44)
            .accessibilityLabel(
              Text(mode == .signin
                ? String(localized: "auth.switchToSignup")
                : String(localized: "auth.switchToSignin"))
            )
          } else {
            Button(String(localized: "auth.backToSignin")) {
              mode = .signin
              errorMessage = nil
              resetSent = false
            }
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
            .frame(minHeight: 44)
          }
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(Text(String(localized: "auth.title")))
      .navigationBarTitleDisplayMode(.inline)
    }
  }

  // MARK: - Nội dung theo chế độ

  private var subtitle: String {
    switch mode {
    case .signin: String(localized: "auth.subtitle.signin")
    case .signup: String(localized: "auth.subtitle.signup")
    case .forgot: String(localized: "auth.subtitle.forgot")
    }
  }

  private var primaryActionTitle: String {
    switch mode {
    case .signin: String(localized: "auth.signin")
    case .signup: String(localized: "auth.signup")
    case .forgot: String(localized: "auth.resetPassword")
    }
  }

  private var canSubmit: Bool {
    switch mode {
    case .signin:
      return emailError == nil && passwordError == nil
        && !email.isEmpty && !password.isEmpty
    case .signup:
      return emailError == nil && passwordError == nil && confirmError == nil
        && !name.isEmpty && !email.isEmpty && !password.isEmpty
        && !confirmPassword.isEmpty
    case .forgot:
      return emailError == nil && !email.isEmpty
    }
  }

  /// Email hợp lệ? (format cơ bản — server validate kỹ, #313).
  private var emailError: String? {
    guard !email.isEmpty else { return nil }
    // Format cơ bản: có @ và dấu chấm sau @.
    let parts = email.split(separator: "@")
    guard parts.count == 2,
          parts[1].contains("."),
          !parts[0].isEmpty,
          !parts[1].isEmpty else {
      return String(localized: "auth.error.emailInvalid")
    }
    return nil
  }

  /// Mật khẩu đủ mạnh? (tối thiểu 6 ký tự — theo Supabase default, #313).
  private var passwordError: String? {
    guard mode != .forgot, !password.isEmpty else { return nil }
    guard password.count >= 6 else {
      return String(localized: "auth.error.passwordShort")
    }
    return nil
  }

  /// Nhập lại khớp? (chỉ signup, #313).
  private var confirmError: String? {
    guard mode == .signup, !confirmPassword.isEmpty else { return nil }
    guard confirmPassword == password else {
      return String(localized: "auth.error.passwordMismatch")
    }
    return nil
  }

  private func authField(
    title: String,
    text: Binding<String>,
    contentType: UITextContentType,
    keyboard: UIKeyboardType
  ) -> some View {
    TextField(title, text: text)
      .textContentType(contentType)
      .keyboardType(keyboard)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .font(DS.TextStyle.body)
      .padding(DS.Spacing.sm)
      .frame(minHeight: 48)
      .background(DS.Color.secondary.swiftUI)
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
      .accessibilityLabel(Text(title))
  }

  // MARK: - Gửi

  private func submit() async {
    guard canSubmit, !busy else { return }
    busy = true
    defer { busy = false }
    errorMessage = nil
    resetSent = false
    do {
      switch mode {
      case .signin:
        try await services.session.signIn(email: email, password: password)
      case .signup:
        try await services.session.signUp(email: email, password: password, name: name)
      case .forgot:
        try await services.session.resetPassword(email: email)
        resetSent = true
      }
    } catch {
      errorMessage = readableError(error)
    }
  }

  /// Lỗi bằng chữ người đọc được, không `"\(error)"` (#294).
  private func readableError(_ error: Error) -> String {
    let desc = error.localizedDescription.lowercased()
    if desc.contains("invalid login") || desc.contains("invalid credentials") {
      return String(localized: "auth.error.invalidCredentials")
    }
    if desc.contains("already registered") || desc.contains("already exists") {
      return String(localized: "auth.error.alreadyRegistered")
    }
    if desc.contains("network") || desc.contains("offline") || desc.contains("connection") {
      return String(localized: "auth.error.network")
    }
    return String(localized: "auth.error.generic")
  }

  // MARK: - Sign in with Apple

  @State private var appleNonce = ""

  private func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
    // Nonce ngẫu nhiên + SHA256 — `AppleSignInNonce` (#245) chưa có nên tự
    // tạo ở đây bằng CryptoKit (chuẩn Apple).
    let nonce = randomNonce()
    appleNonce = nonce
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(nonce)
  }

  private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
    Task {
      busy = true
      defer { busy = false }
      do {
        switch result {
        case .success(let auth):
          guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let token = String(data: tokenData, encoding: .utf8)
          else {
            errorMessage = String(localized: "auth.error.generic")
            return
          }
          try await services.session.signInWithApple(
            identityToken: token, rawNonce: appleNonce
          )
          errorMessage = nil
        case .failure:
          errorMessage = String(localized: "auth.error.appleCancelled")
        }
      } catch {
        errorMessage = readableError(error)
      }
    }
  }

  private func randomNonce(length: Int = 32) -> String {
    let chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._"
    var result = ""
    var bytes = [UInt8](repeating: 0, count: length)
    _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
    for b in bytes {
      result.append(chars[chars.index(chars.startIndex, offsetBy: Int(b) % chars.count)])
    }
    return result
  }

  private func sha256(_ input: String) -> String {
    let digest = SHA256.hash(data: Data(input.utf8))
    return digest.compactMap { String(format: "%02x", $0) }.joined()
  }
}

// MARK: - Preview

#Preview("signin — Light") {
  AuthView()
    .environment(AppServices())
    .preferredColorScheme(.light)
}

#Preview("signin — Dark") {
  AuthView()
    .environment(AppServices())
    .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXXL") {
  AuthView()
    .environment(AppServices())
    .dynamicTypeSize(.accessibility3)
}

/// Modifier hiện lỗi dưới field (#313).
private struct FieldErrorModifier: ViewModifier {
  let message: String?

  func body(content: Content) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      content
      if let message {
        Text(message)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .accessibilityLabel(Text(message))
      }
    }
  }
}

extension View {
  fileprivate func fieldError(_ message: String?) -> some View {
    modifier(FieldErrorModifier(message: message))
  }
}
