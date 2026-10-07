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
              fieldError(attemptedSubmit ? emailError : nil)

              if mode != .forgot {
                SecureField(
                  String(localized: "auth.password"),
                  text: $password
                )
                // Đăng ký: `.newPassword` để iOS gợi ý mật khẩu mạnh.
                .textContentType(mode == .signup ? .newPassword : .password)
                .font(DS.TextStyle.body)
                .padding(DS.Spacing.sm)
                .frame(minHeight: 48)
                .background(DS.Color.secondary.swiftUI)
                .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
                .accessibilityLabel(Text(String(localized: "auth.password")))
                fieldError(attemptedSubmit ? passwordError : nil)

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
                  fieldError(attemptedSubmit ? confirmError : nil)
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
              .disabled(busy)
              .opacity(canSubmit && !busy ? 1 : 0.5)

              if mode == .signin {
                Button(String(localized: "auth.forgot")) {
                  mode = .forgot
                  errorMessage = nil
                  attemptedSubmit = false
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
              attemptedSubmit = false
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
              attemptedSubmit = false
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
        && !trimmedEmail.isEmpty && !password.isEmpty
    case .signup:
      return emailError == nil && passwordError == nil && confirmError == nil
        && !name.isEmpty && !trimmedEmail.isEmpty && !password.isEmpty
        && !confirmPassword.isEmpty
    case .forgot:
      return emailError == nil && !trimmedEmail.isEmpty
    }
  }

  /// Email hợp lệ? (format cơ bản — server validate kỹ, #313).
  /// Email đã bỏ khoảng trắng hai đầu — baseline `email.trim()`
  /// (`auth-screen.tsx:99`); autofill hay để dư dấu cách.
  private var trimmedEmail: String {
    email.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var emailError: String? {
    let email = trimmedEmail
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
    // Đánh dấu đã chạm submit — lỗi field chỉ hiện từ đây (#313).
    attemptedSubmit = true
    guard canSubmit, !busy else { return }
    busy = true
    defer { busy = false }
    errorMessage = nil
    resetSent = false
    do {
      switch mode {
      case .signin:
        try await services.session.signIn(email: trimmedEmail, password: password)
      case .signup:
        try await services.session.signUp(email: trimmedEmail, password: password, name: name)
      case .forgot:
        try await services.session.resetPassword(email: trimmedEmail)
        resetSent = true
      }
    } catch {
      errorMessage = readableError(error)
    }
  }

  /// Lỗi bằng chữ người đọc được, không `"\(error)"` (#294).
  private func readableError(_ error: Error) -> String {
    // URLError có localizedDescription theo ngôn ngữ máy — so chuỗi tiếng Anh
    // trượt trên máy tiếng Việt. Hỏi theo mã lỗi trước (NetworkFailure của A).
    if NetworkFailure.isOffline(error) {
      return String(localized: "auth.error.network")
    }
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

  /// Nonce theo từng lượt xin quyền (`state` ↔ nonce thô), không dùng chung
  /// một biến: lượt sau không được ghi đè nonce của lượt trước (#523 P1).
  @State private var appleNonces = AppleSignInNonces()

  private func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
    // Nonce ngẫu nhiên + SHA256 bằng CryptoKit (chuẩn Apple). `state` gắn
    // nonce với ĐÚNG lượt này; Apple trả lại nó trong credential.
    let nonce = randomNonce()
    let state = randomNonce()
    appleNonces.register(state: state, rawNonce: nonce)
    request.requestedScopes = [.fullName, .email]
    request.state = state
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
                let token = String(data: tokenData, encoding: .utf8),
                // Nonce của ĐÚNG lượt đã tạo credential này, dùng một lần.
                // Không có (state thiếu/lạ/đã dùng) thì dừng, không đoán.
                let rawNonce = appleNonces.take(state: credential.state)
          else {
            errorMessage = String(localized: "auth.error.generic")
            return
          }
          try await services.session.signInWithApple(
            identityToken: token, rawNonce: rawNonce
          )
          errorMessage = nil
        case .failure(let error):
          // Chỉ huỷ thật mới nói "đã huỷ"; lỗi khác (thiếu capability,
          // không phản hồi…) là lỗi chung.
          if (error as? ASAuthorizationError)?.code == .canceled {
            errorMessage = String(localized: "auth.error.appleCancelled")
          } else {
            errorMessage = String(localized: "auth.error.generic")
          }
        }
      } catch {
        errorMessage = readableError(error)
      }
    }
  }

  /// Nonce từ CSPRNG hệ thống. Bản trước bỏ qua status của
  /// `SecRandomCopyBytes`: lỗi → mảng giữ nguyên toàn 0 → nonce toàn "0",
  /// đoán được. `SystemRandomNumberGenerator` không trả về im lặng khi hỏng;
  /// `randomElement` chọn đều, không phụ thuộc số ký tự của bảng.
  private func randomNonce(length: Int = 32) -> String {
    let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var rng = SystemRandomNumberGenerator()
    return String((0..<length).map { _ in chars.randomElement(using: &rng)! })
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
