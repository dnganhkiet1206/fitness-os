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

  /// Tấm form email đang mở (màn chào tối → form trượt lên).
  @State private var formOpen = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    hero
      .sheet(isPresented: $formOpen) { formSheet }
  }

  // MARK: - Màn chào (16/10, chủ dự án chọn kiểu app gym cao cấp, kết hợp mock 1 + 2)

  /// Nền đen ấm; logo ASCND trắng cỡ lớn với quầng lửa cam "thở" phía sau (mock 2);
  /// một đường nhịp tim cam chạy ngang qua, slogan lớn ba dòng (mock 1); nút trắng
  /// nổi bật + nút viền ở đáy. Luôn tối, không theo giao diện sáng / tối.
  private var hero: some View {
    ZStack {
      AuthHero.ink.ignoresSafeArea()
      AuthHeroBackdrop(reduceMotion: reduceMotion)
        .ignoresSafeArea()
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        Spacer(minLength: 0)
        Text("auth.hero.slogan")
          .font(.system(size: 46, weight: .black))
          .textCase(.uppercase)
          .tracking(-1)
          .lineSpacing(-6)
          .foregroundStyle(AuthHero.paper)
          .minimumScaleFactor(0.6)
          .accessibilityAddTraits(.isHeader)
        Text("auth.hero.tagline")
          .font(.system(size: 15))
          .foregroundStyle(AuthHero.paper.opacity(0.65))
          .padding(.top, 12)
          .padding(.bottom, 28)
        if AppleFeatureGates.signInWithApple(info: Bundle.main.infoDictionary) {
          SignInWithAppleButton(onRequest: configureAppleRequest, onCompletion: handleAppleCompletion)
            .signInWithAppleButtonStyle(.white)
            .frame(height: 52)
            .clipShape(Capsule())
            .accessibilityLabel(Text(String(localized: "auth.apple")))
            .padding(.bottom, 10)
        }
        heroButton(String(localized: "auth.hero.email"), filled: true) { open(.signin) }
        heroButton(String(localized: "auth.hero.create"), filled: false) { open(.signup) }
          .padding(.top, 10)
        if let errorMessage, !formOpen {
          Text(errorMessage)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(Color(red: 1, green: 0.55, blue: 0.5))
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
        }
      }
      .padding(.horizontal, 24)
      .padding(.bottom, 20)
    }
    .environment(\.colorScheme, .dark)
  }

  private func heroButton(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 16, weight: filled ? .bold : .semibold))
        .foregroundStyle(filled ? AuthHero.ink : AuthHero.paper)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(filled ? AuthHero.paper : Color.clear, in: Capsule())
        .overlay { Capsule().strokeBorder(AuthHero.paper.opacity(filled ? 0 : 0.28), lineWidth: 1) }
        .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
  }

  private func open(_ m: AuthMode) {
    mode = m
    errorMessage = nil
    resetSent = false
    attemptedSubmit = false
    formOpen = true
  }

  // MARK: - Tấm form email

  private var formSheet: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text(primaryActionTitle)
            .font(.system(size: 28, weight: .heavy))
            .foregroundStyle(AuthHero.paper)
            .accessibilityAddTraits(.isHeader)
          Text(subtitle)
            .font(DS.TextStyle.body)
            .foregroundStyle(AuthHero.paper.opacity(0.6))
            .padding(.bottom, DS.Spacing.sm)
          form
        }
        .padding(.horizontal, 24)
        .padding(.top, DS.Spacing.sm)
      }
      .scrollDismissesKeyboard(.interactively)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.close")) { formOpen = false }
        }
      }
    }
    .environment(\.colorScheme, .dark)
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .presentationBackground(AuthHero.sheet)
  }

  private var form: some View {
    VStack(spacing: DS.Spacing.md) {
      if mode == .signup {
        authField(title: String(localized: "auth.name"), text: $name, contentType: .name, keyboard: .default)
      }
      authField(title: String(localized: "auth.email"), text: $email, contentType: .username, keyboard: .emailAddress)
        // Nối VÀO ô: đứng riêng thì là `self.fieldError` — bọc chính
        // AuthView vào thân nó, lồng vô hạn, tràn stack (SIGSEGV) lúc mở.
        .fieldError(attemptedSubmit ? emailError : nil)
      if mode != .forgot {
        secureField(String(localized: "auth.password"), text: $password, newPassword: mode == .signup)
          .fieldError(attemptedSubmit ? passwordError : nil)
        // Nhập lại mật khẩu (chỉ signup, #313).
        if mode == .signup {
          secureField(String(localized: "auth.confirmPassword"), text: $confirmPassword, newPassword: true)
            .fieldError(attemptedSubmit ? confirmError : nil)
        }
      }
      if let errorMessage {
        Text(errorMessage)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(Color(red: 1, green: 0.55, blue: 0.5))
          .multilineTextAlignment(.center)
          .accessibilityLabel(Text(errorMessage))
      }
      if resetSent {
        Text(String(localized: "auth.resetSent"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(AuthHero.ember)
          .multilineTextAlignment(.center)
      }
      heroButton(busy ? String(localized: "auth.working") : primaryActionTitle, filled: true) {
        Task { await submit() }
      }
      .disabled(busy)
      .opacity(canSubmit && !busy ? 1 : 0.5)
      .padding(.top, DS.Spacing.xs)

      if mode == .signin {
        textLink(String(localized: "auth.forgot")) {
          mode = .forgot
          errorMessage = nil
          attemptedSubmit = false
        }
      }
      if mode != .forgot {
        textLink(mode == .signin ? String(localized: "auth.switchToSignup") : String(localized: "auth.switchToSignin")) {
          mode = mode == .signin ? .signup : .signin
          errorMessage = nil
          attemptedSubmit = false
        }
      } else {
        textLink(String(localized: "auth.backToSignin")) {
          mode = .signin
          errorMessage = nil
          resetSent = false
          attemptedSubmit = false
        }
      }
    }
  }

  private func textLink(_ title: String, action: @escaping () -> Void) -> some View {
    Button(title, action: action)
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(AuthHero.paper.opacity(0.8))
      .frame(maxWidth: .infinity, minHeight: 44)
  }

  private func secureField(_ title: String, text: Binding<String>, newPassword: Bool) -> some View {
    SecureField(title, text: text)
      // Đăng ký: `.newPassword` để iOS gợi ý mật khẩu mạnh.
      .textContentType(newPassword ? .newPassword : .password)
      .font(DS.TextStyle.body)
      .modifier(AuthFieldStyle())
      .accessibilityLabel(Text(title))
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
      .modifier(AuthFieldStyle())
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

/// Bảng màu màn chào: đen ấm, giấy, lửa cam.
enum AuthHero {
  static let ink = Color(red: 0.05, green: 0.047, blue: 0.043)
  static let sheet = Color(red: 0.09, green: 0.085, blue: 0.078)
  static let paper = Color(red: 0.957, green: 0.937, blue: 0.906)
  static let ember = Color(red: 1, green: 0.45, blue: 0.1)
}

/// Ô nhập trên nền tối: nền giấy mờ 8 %, viền mảnh, bo 16, cao 52.
private struct AuthFieldStyle: ViewModifier {
  func body(content: Content) -> some View {
    content
      .foregroundStyle(AuthHero.paper)
      .padding(.horizontal, 16)
      .frame(minHeight: 52)
      .background(AuthHero.paper.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .strokeBorder(AuthHero.paper.opacity(0.12), lineWidth: 0.75)
      }
  }
}

/// Logo ASCND trắng cỡ lớn + quầng lửa cam thở chậm (mock 2) + đường nhịp tim cam
/// chạy ngang qua (mock 1). Giảm chuyển động: đứng yên, nhịp tim vẽ đủ.
private struct AuthHeroBackdrop: View {
  let reduceMotion: Bool

  var body: some View {
    TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { tl in
      let t = reduceMotion ? 0 : tl.date.timeIntervalSinceReferenceDate
      GeometryReader { geo in
        let w = geo.size.width, logo = min(w * 0.58, 250), cy = geo.size.height * 0.27
        let breath = reduceMotion ? 0.5 : 0.5 + 0.5 * sin(t * 2 * .pi / 3.2)
        ZStack {
          RadialGradient(
            colors: [AuthHero.ember.opacity(0.55), AuthHero.ember.opacity(0)], center: .center,
            startRadius: 0, endRadius: logo * 1.25
          )
          .frame(width: logo * 2.6, height: logo * 2.6)
          .scaleEffect(1 + 0.08 * breath)
          .opacity(0.6 + 0.35 * breath)
          .position(x: w / 2, y: cy)
          pulse(width: w, y: cy + logo * 0.08, t: t)
          Image("BrandMark")
            .renderingMode(.template)
            .resizable()
            .interpolation(.high)
            .foregroundStyle(AuthHero.paper)
            .frame(width: logo, height: logo)
            .position(x: w / 2, y: cy)
        }
      }
    }
  }

  /// Đường nhịp tim cam: đoạn sáng chạy từ trái sang phải mỗi 2,6 s, hai đầu mờ.
  private func pulse(width w: CGFloat, y: CGFloat, t: TimeInterval) -> some View {
    let mid = w / 2
    var path = Path()
    path.move(to: CGPoint(x: -10, y: y))
    path.addLine(to: CGPoint(x: mid - 70, y: y))
    path.addLine(to: CGPoint(x: mid - 50, y: y - 46))
    path.addLine(to: CGPoint(x: mid - 22, y: y + 58))
    path.addLine(to: CGPoint(x: mid + 6, y: y - 28))
    path.addLine(to: CGPoint(x: mid + 22, y: y))
    path.addLine(to: CGPoint(x: w + 10, y: y))
    let p = reduceMotion ? 1 : (t.truncatingRemainder(dividingBy: 2.6) / 2.6)
    let head = CGFloat(-0.1 + 1.4 * p), tail = head - 0.45
    return path
      .trimmedPath(from: max(0, reduceMotion ? 0 : tail), to: min(1, reduceMotion ? 1 : head))
      .stroke(
        LinearGradient(
          colors: [AuthHero.ember.opacity(0), AuthHero.ember, AuthHero.ember.opacity(0)], startPoint: .leading,
          endPoint: .trailing),
        style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
      )
      .shadow(color: AuthHero.ember.opacity(0.7), radius: 6)
  }
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
          .foregroundStyle(Color(red: 1, green: 0.55, blue: 0.5))
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
