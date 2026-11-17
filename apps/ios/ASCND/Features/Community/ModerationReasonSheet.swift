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
///
/// Lý do mẫu (`presets`, giai đoạn 2): chip chọn nhanh ~8 lý do thường gặp —
/// chạm thì điền sẵn lý do, vẫn sửa / tự gõ được (nghiên cứu 17/11, mẫu 3:
/// lý do mẫu + tự gửi cho tác giả là công cụ nhất quán rẻ nhất). Chỉ hiện ở
/// nơi lý do nói về NỘI DUNG (ẩn / gỡ / khoá / từ chối kháng nghị) — bác báo
/// cáo, khôi phục, gỡ khoá thì lý do mang nghĩa khác nên không bày.
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
  /// Hiện chip lý do mẫu (chỉ nơi lý do nói về nội dung).
  var presets = false
  /// Lý do đã trim + thời hạn đã chọn (`nil` khi không có bộ chọn).
  var onConfirm: (String, Int?) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var reason = ""
  @State private var hours: Int?
  @FocusState private var editorFocused: Bool

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
        if presets {
          Section {
            LazyVGrid(
              columns: [GridItem(.adaptive(minimum: 90), spacing: DS.Spacing.sm)],
              alignment: .leading, spacing: DS.Spacing.sm
            ) {
              ForEach(ModReasonPreset.allCases, id: \.self) { preset in
                let label = Self.presetText(preset)
                Button(label) {
                  // "Khác" thì xoá ô lý do và đặt con trỏ vào ô — lý do tự
                  // gõ, không phải chữ "Khác".
                  if preset == .other {
                    reason = ""
                    editorFocused = true
                  } else {
                    reason = label
                  }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(reason == label ? DS.Color.primary.swiftUI : DS.Color.secondary.swiftUI)
              }
            }
          } header: {
            Text("community.mod.preset.title")
          }
        }
        Section {
          TextEditor(text: $reason)
            .frame(minHeight: 96)
            .focused($editorFocused)
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

  /// Nhãn của một lý do mẫu: năm lý do đầu dùng lại nhãn báo cáo
  /// (`community.reason.*`); ba lý do sau có khoá riêng.
  static func presetText(_ p: ModReasonPreset) -> String {
    switch p {
    case .rules: String(localized: "community.mod.preset.rules")
    case .duplicate: String(localized: "community.mod.preset.duplicate")
    case .advertising: String(localized: "community.mod.preset.advertising")
    default: p.reportReason.map(HiddenNoticeView.reasonText) ?? ""
    }
  }
}
