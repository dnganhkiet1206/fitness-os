import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Sheet nhập lý do cho một quyết định kiểm duyệt (#915).
///
/// Lý do ghi vào `moderation_audit_log` cùng quyết định. Một số quyết định
/// (gỡ, tạm khoá đăng) bắt buộc phải có lý do — server từ chối khi trống
/// (22023). Sheet là view thường (không phải `.alert`), nên chạy được cả
/// trong sheet chồng sheet, nơi `.alert` đặt sau khi chờ server không hiện
/// (`ConfirmAlert`, 31/10).
struct ModerationReasonSheet: View {
  /// Một lựa chọn thời hạn tạm khoá đăng.
  struct DurationOption: Hashable {
    let hours: Int
    let label: String
  }

  let title: String
  var message: String? = nil
  var requiresReason = false
  var confirmTitle: String
  var destructive = false
  /// Rỗng = không có bộ chọn thời hạn.
  var durations: [DurationOption] = []
  /// Lý do đã trim + thời hạn đã chọn (`nil` khi không có bộ chọn).
  var onConfirm: (String, Int?) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var reason = ""
  @State private var hours: Int?

  private var canConfirm: Bool {
    !requiresReason || !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      Form {
        if let message {
          Section {
            Text(verbatim: message)
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        Section {
          TextEditor(text: $reason)
            .frame(minHeight: 96)
            .accessibilityLabel(Text(requiresReason ? "community.mod.reason.required" : "community.mod.reason.optional"))
        } header: {
          Text(requiresReason ? "community.mod.reason.required" : "community.mod.reason.optional")
        } footer: {
          Text("community.mod.reason.audit")
        }
        if !durations.isEmpty {
          Section {
            Picker(String(localized: "community.mod.restrict.duration"), selection: $hours) {
              ForEach(durations, id: \.hours) { d in
                Text(verbatim: d.label).tag(Optional(d.hours))
              }
            }
            .pickerStyle(.segmented)
          } header: {
            Text("community.mod.restrict.duration")
          }
        }
      }
      .navigationTitle(Text(verbatim: title))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(confirmTitle) {
            onConfirm(reason.trimmingCharacters(in: .whitespacesAndNewlines), hours)
            dismiss()
          }
          .disabled(!canConfirm)
          .foregroundStyle(destructive ? DS.Color.destructive.swiftUI : DS.Color.primary.swiftUI)
        }
      }
      .task { if hours == nil { hours = durations.first?.hours } }
    }
  }
}
