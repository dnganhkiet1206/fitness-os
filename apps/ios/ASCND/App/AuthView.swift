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
  @State private var busy = false
  @State private var errorMessage: String?
  @State private var resetSent = false

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
      return !email.isEmpty && !password.isEmpty
    case .signup:
      return !name.isEmpty && !email.isEmpty && !password.isEmpty
    case .forgot:
      return !email.isEmpty
    }
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
