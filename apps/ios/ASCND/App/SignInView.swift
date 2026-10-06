import SwiftUI

/// Màn đăng nhập TẠM của A (#273) — đủ để gate phiên và lát dọc chạy được
/// trên máy. KHÔNG phải thiết kế cuối: chữ `verbatim`, không DS, chỉ email +
/// mật khẩu. Màn thật (Sign in with Apple, đăng ký, quên mật khẩu, bản địa
/// hoá, DS) là việc của C — xem issue C-9.
struct SignInView: View {
  @Environment(AppServices.self) private var services
  @State private var email = ""
  @State private var password = ""
  @State private var busy = false
  @State private var error: String?

  var body: some View {
    Form {
      Section {
        TextField(text: $email) { Text(verbatim: "Email") }
          .textContentType(.username)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
        SecureField(text: $password) { Text(verbatim: "Password") }
          .textContentType(.password)
      } footer: {
        Text(verbatim: "Tài khoản ASCND thật (cùng Supabase với app RN). Buổi tập sẽ được ghi thật.")
      }
      Section {
        Button {
          busy = true
          Task {
            do {
              try await services.session.signIn(email: email, password: password)
              error = nil
            } catch {
              self.error = "\(error)"
            }
            busy = false
          }
        } label: {
          Text(verbatim: busy ? "…" : "Sign in")
        }
        .disabled(busy || email.isEmpty || password.isEmpty)
      }
      if let error {
        Section { Text(verbatim: error).foregroundStyle(.red).font(.footnote) }
      }
      if let problem = services.startupError {
        Section { Text(verbatim: problem).foregroundStyle(.red).font(.footnote) }
      }
    }
  }
}
