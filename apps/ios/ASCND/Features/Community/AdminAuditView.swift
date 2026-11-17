import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Nhật ký kiểm toán cho admin (#915, giai đoạn 2) — port của
/// `native/src/app/admin/audit.tsx` (RN web): 200 dòng gần nhất + lọc theo
/// hành động (15 chip + Tất cả). Nhật ký chỉ đọc — không sửa, không xoá
/// (append-only ở server).
///
/// Chạm một dòng có đích thì mở màn chi tiết kiểm duyệt của đích đó (cần một
/// `ModerationBook` riêng, tạo lười như màn chi tiết người dùng).
struct AdminAuditScreen: View {
  let book: AdminBook

  @Environment(AppServices.self) private var services
  @State private var moderation: ModerationBook?
  @State private var openTarget: ModTargetRef?

  /// 15 hành động của `moderation_audit_log` (cùng danh sách với RN).
  static let actions = [
    "HIDE_POST", "RESTORE_POST", "REMOVE_POST",
    "HIDE_COMMENT", "RESTORE_COMMENT", "REMOVE_COMMENT",
    "DISMISS_REPORT", "APPROVE_APPEAL", "REJECT_APPEAL",
    "ADD_IMAGE", "REMOVE_IMAGE", "RESTORE_IMAGE",
    "ROLE_CHANGE", "RESTRICT_USER", "UNRESTRICT_USER",
  ]

  var body: some View {
    content
      .navigationTitle(Text("community.admin.audit.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.load() }
      .task { if book.phase == .loading { await book.load() } }
      .navigationDestination(item: $openTarget) { t in
        if let moderation { ModerationTargetScreen(book: moderation, type: t.type, id: t.id) }
      }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(
        message: book.failure.map(ModerationFailureText.text) ?? String(localized: "community.mod.loadfailed")
      ) { Task { await book.load() } }
    case .notStaff:
      DSEmptyState(
        systemImage: "shield.slash", title: String(localized: "community.admin.audit.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      list
    }
  }

  private var list: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.sm) {
            actionChip(label: String(localized: "community.admin.audit.all"), action: nil)
            ForEach(Self.actions, id: \.self) { a in
              actionChip(label: ModerationFailureText.auditAction(a), action: a)
            }
          }
        }
        if book.audit.isEmpty {
          DSEmptyState(
            systemImage: "list.clipboard", title: String(localized: "community.admin.audit.title"),
            message: String(localized: "community.admin.audit.empty"))
        } else {
          DSCard {
            VStack(spacing: DS.Spacing.md) {
              ForEach(book.audit) { row in
                ModAuditRowView(row: row) { t in openTargetRef(t) }
              }
            }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  private func actionChip(label: String, action: String?) -> some View {
    let selected = book.auditAction == action
    return Button {
      Task { await book.selectAuditAction(action) }
    } label: {
      Text(verbatim: label)
        .font(DS.TextStyle.footnote.weight(selected ? .semibold : .regular))
        .foregroundStyle(
          selected ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, DS.Spacing.sm)
        .background(
          selected ? DS.Color.foreground.swiftUI : DS.Color.secondary.swiftUI, in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private func openTargetRef(_ t: ModTargetRef) {
    if moderation == nil { moderation = services.makeModeration(userId: book.userId) }
    openTarget = t
  }
}
