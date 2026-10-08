import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Đổi mật khẩu (#527 Phase 8) — `app/change-password.tsx` @ fac9ac2, trên
/// `PasswordChangeController` (#441). Mở từ Cài đặt (`settings.tsx:658`).
///
/// Như RN: hai ô bảo mật (mới, nhập lại), lỗi "tối thiểu 6" khi đã gõ mà chưa
/// đủ, lỗi "không khớp" khi ô nhập lại có chữ mà khác, nút tắt khi chưa lưu
/// được và tắt LUÔN sau khi xong; xong thì quay lại và báo "đã đổi". Không hỏi
/// mật khẩu cũ, không đăng xuất.
///
/// Khác RN (có chủ đích): lỗi được gọi đúng tên (`PasswordChangeFailure`)
/// thay vì chuỗi thô của server; chuỗi "tối thiểu 6" đi qua xcstrings thay vì
/// ternary `vi ? … : …` (RN ra tiếng Anh cho `es`).
struct ChangePasswordView: View {
  @State private var controller: PasswordChangeController
  /// Báo cho Cài đặt rằng đã đổi — app chưa có toast (RN `toast.success`).
  var onChanged: () -> Void

  @Environment(\.dismiss) private var dismiss
  @FocusState private var focus: Field?

  enum Field: Hashable { case new, confirm }

  init(controller: PasswordChangeController, onChanged: @escaping () -> Void = {}) {
    _controller = State(initialValue: controller)
    self.onChanged = onChanged
  }

  var body: some View {
    Form {
      Section {
        SecureField(String(localized: "settings.newPassword"), text: $controller.newPassword)
          .textContentType(.newPassword)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused($focus, equals: .new)
          .submitLabel(.next)
          .onSubmit { focus = .confirm }
          .frame(minHeight: 44)
          .accessibilityLabel(Text(String(localized: "settings.newPassword")))
      } header: {
        Text(String(localized: "settings.newPassword"))
      } footer: {
        if controller.tooShort {
          Text(String(localized: "auth.error.passwordShort")).foregroundStyle(DS.Color.destructive.swiftUI)
        }
      }

      Section {
        SecureField(String(localized: "settings.confirmPassword"), text: $controller.confirmation)
          .textContentType(.newPassword)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused($focus, equals: .confirm)
          .submitLabel(.done)
          .onSubmit { Task { await submit() } }
          .frame(minHeight: 44)
          .accessibilityLabel(Text(String(localized: "settings.confirmPassword")))
      } header: {
        Text(String(localized: "settings.confirmPassword"))
      } footer: {
        if controller.mismatch {
          Text(String(localized: "settings.passwordMismatch")).foregroundStyle(DS.Color.destructive.swiftUI)
        }
      }

      if let failure = controller.failure {
        Section {
          Label {
            Text(Self.message(failure))
          } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
          }
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .font(DS.TextStyle.footnote)
        }
      }

      Section {
        Button {
          Task { await submit() }
        } label: {
          HStack {
            Spacer()
            if controller.saved {
              Image(systemName: "checkmark").accessibilityLabel(Text(String(localized: "settings.passwordChanged")))
            } else if controller.saving {
              ProgressView()
            } else {
              Text(String(localized: "settings.changePassword")).font(DS.TextStyle.headline)
            }
            Spacer()
          }
          .frame(minHeight: 44)
        }
        .disabled(!controller.canSave)
      }
    }
    .navigationTitle(Text(String(localized: "settings.changePassword")))
    .navigationBarTitleDisplayMode(.inline)
    .onChange(of: controller.failure) { _, failure in
      if let failure {
        AccessibilityNotification.Announcement(Self.message(failure)).post()
      }
    }
  }

  private func submit() async {
    focus = nil
    guard await controller.submit() else { return }
    AccessibilityNotification.Announcement(String(localized: "settings.passwordChanged")).post()
    onChanged()
    dismiss()
  }

  /// Lời theo thứ người dùng làm được; mã thô của server không bao giờ ra màn.
  static func message(_ f: PasswordChangeFailure) -> String {
    switch f {
    case .offline: String(localized: "auth.error.network")
    case .samePassword: String(localized: "settings.password.error.same")
    case .weakPassword: String(localized: "settings.password.error.weak")
    case .reauthenticationNeeded: String(localized: "settings.password.error.reauth")
    case .signedOut: String(localized: "settings.password.error.signedOut")
    case .rateLimited: String(localized: "settings.password.error.rateLimited")
    case .server: String(localized: "auth.error.generic")
    }
  }
}
