import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Điểm tới một đích kiểm duyệt (để điều hướng).
struct ModTargetRef: Hashable, Identifiable {
  let type: ModTargetType
  let id: String
  var targetId: String { "\(type.rawValue):\(id)" }
}

/// Câu báo lỗi của bảng kiểm duyệt — mỗi loại một câu.
@MainActor
enum ModerationFailureText {
  static func text(_ f: ModerationFailure) -> String {
    switch f {
    case .offline: String(localized: "community.mod.error.offline")
    case .forbidden: String(localized: "community.mod.error.forbidden")
    case .gone: String(localized: "community.mod.error.gone")
    case .server: String(localized: "community.mod.error.server")
    }
  }

  /// Tên hiển thị của một hành động trong nhật ký kiểm toán; hành động lạ
  /// (server thêm sau) hiện nguyên mã.
  static func auditAction(_ action: String) -> String {
    switch action {
    case "HIDE_POST": String(localized: "community.mod.audit.hidepost")
    case "RESTORE_POST": String(localized: "community.mod.audit.restorepost")
    case "REMOVE_POST": String(localized: "community.mod.audit.removepost")
    case "HIDE_COMMENT": String(localized: "community.mod.audit.hidecomment")
    case "RESTORE_COMMENT": String(localized: "community.mod.audit.restorecomment")
    case "REMOVE_COMMENT": String(localized: "community.mod.audit.removecomment")
    case "DISMISS_REPORT": String(localized: "community.mod.audit.dismissreport")
    case "APPROVE_APPEAL": String(localized: "community.mod.audit.approveappeal")
    case "REJECT_APPEAL": String(localized: "community.mod.audit.rejectappeal")
    case "RESTRICT_USER": String(localized: "community.mod.audit.restrictuser")
    case "UNRESTRICT_USER": String(localized: "community.mod.audit.unrestrictuser")
    default: action
    }
  }

  static func roleText(_ role: AppRole) -> String {
    switch role {
    case .user: String(localized: "community.mod.role.user")
    case .moderator: String(localized: "community.mod.role.moderator")
    case .admin: String(localized: "community.mod.role.admin")
    }
  }
}

/// Một dòng nhật ký kiểm toán: hành động + người làm + lý do + thời gian.
/// Chạm vào thì mở đích (khi dòng có đích).
struct ModAuditRowView: View {
  let row: ModAuditRow
  var onOpenTarget: ((ModTargetRef) -> Void)? = nil

  var body: some View {
    Button {
      if let t = row.targetType, let id = row.targetId { onOpenTarget?(ModTargetRef(type: t, id: id)) }
    } label: {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        HStack(spacing: DS.Spacing.sm) {
          Text(verbatim: ModerationFailureText.auditAction(row.action))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          Text(verbatim: PostHeaderView.agoText(row.createdAt))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        HStack(spacing: DS.Spacing.sm) {
          Text(verbatim: row.actor?.name ?? String(localized: "community.mod.role.system"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          if !row.reason.isEmpty {
            Text(verbatim: "· \(row.reason)")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(2)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(row.targetType == nil || row.targetId == nil)
    .accessibilityElement(children: .combine)
  }
}

/// Bảng kiểm duyệt Cộng đồng (#915, giai đoạn 1) — port của
/// `native/src/app/admin/index.tsx` (RN web, chỉ trên web) lên SwiftUI:
/// sáu số đếm + hoạt động gần đây + lối vào hai hàng đợi.
struct ModerationDashboardScreen: View {
  let book: ModerationBook
  @State private var openReports = false
  @State private var openAppeals = false
  @State private var openTarget: ModTargetRef?

  var body: some View {
    content
      .navigationTitle(Text("community.mod.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.load() }
      .task { if book.phase == .loading { await book.load() } }
      .navigationDestination(isPresented: $openReports) { ModerationReportsScreen(book: book) }
      .navigationDestination(isPresented: $openAppeals) { ModerationAppealsScreen(book: book) }
      .navigationDestination(item: $openTarget) { t in ModerationTargetScreen(book: book, type: t.type, id: t.id) }
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
        systemImage: "shield.slash", title: String(localized: "community.mod.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      dashboard
    }
  }

  private var dashboard: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        if let d = book.dashboard {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: DS.Spacing.md) {
            countTile(
              value: d.pendingReports, label: String(localized: "community.mod.dashboard.pendingreports"),
              icon: "flag", action: { openReports = true })
            countTile(
              value: d.pendingAppeals, label: String(localized: "community.mod.dashboard.pendingappeals"),
              icon: "arrow.uturn.backward", action: { openAppeals = true })
            countTile(
              value: d.hiddenPosts, label: String(localized: "community.mod.dashboard.hiddenposts"),
              icon: "eye.slash")
            countTile(
              value: d.hiddenComments, label: String(localized: "community.mod.dashboard.hiddencomments"),
              icon: "bubble.left.and.text.bubble.right")
            countTile(
              value: d.removedPosts, label: String(localized: "community.mod.dashboard.removedposts"),
              icon: "trash")
            countTile(
              value: d.reportsToday, label: String(localized: "community.mod.dashboard.reportstoday"),
              icon: "flag.2.crossed")
          }
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            Text("community.mod.dashboard.recent")
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .accessibilityAddTraits(.isHeader)
            if d.recent.isEmpty {
              Text("community.mod.dashboard.empty")
                .font(DS.TextStyle.body)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            } else {
              DSCard {
                VStack(spacing: DS.Spacing.md) {
                  ForEach(d.recent) { row in
                    ModAuditRowView(row: row) { openTarget = $0 }
                  }
                }
              }
            }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  /// Một ô số đếm. Có `action` thì là nút (mở hàng đợi tương ứng).
  @ViewBuilder
  private func countTile(value: Int, label: String, icon: String, action: (() -> Void)? = nil) -> some View {
    if let action {
      Button(action: action) { DSCard { tileBody(value: value, label: label, icon: icon, navigates: true) } }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: "\(label) · \(value)"))
    } else {
      DSCard { tileBody(value: value, label: label, icon: icon, navigates: false) }
        .accessibilityElement(children: .combine)
    }
  }

  private func tileBody(value: Int, label: String, icon: String, navigates: Bool) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: icon)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        Spacer(minLength: 0)
        if navigates {
          Image(systemName: "chevron.right")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
      }
      Text(verbatim: "\(value)")
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .contentTransition(.numericText(value: Double(value)))
      Text(verbatim: label)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
