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
    case .lastAdmin: String(localized: "community.admin.role.lastadmin")
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
    case "ADD_IMAGE": String(localized: "community.mod.audit.addimage")
    case "REMOVE_IMAGE": String(localized: "community.mod.audit.removeimage")
    case "RESTORE_IMAGE": String(localized: "community.mod.audit.restoreimage")
    case "ROLE_CHANGE": String(localized: "community.mod.audit.rolechange")
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
  @Environment(AppServices.self) private var services
  @State private var openReports = false
  @State private var openAppeals = false
  @State private var openTarget: ModTargetRef?
  /// Sổ quản trị — tạo trong `.task` khi mở bảng (xem `ensureAdmin`).
  /// Moderator không thấy mục này, không tạo sổ, không gọi RPC admin nào.
  @State private var admin: AdminBook?
  @State private var adminDestination: AdminDestination?

  /// Ba màn quản trị (giai đoạn 2) — cùng một sổ, tải một lần.
  enum AdminDestination: Hashable {
    case users, audit, art
  }

  var body: some View {
    content
      .navigationTitle(Text("community.mod.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.load() }
      .task {
        if book.phase == .loading { await book.load() }
        ensureAdmin()
      }
      .onChange(of: book.role) { _, _ in ensureAdmin() }
      .navigationDestination(isPresented: $openReports) { ModerationReportsScreen(book: book) }
      .navigationDestination(isPresented: $openAppeals) { ModerationAppealsScreen(book: book) }
      .navigationDestination(item: $openTarget) { t in ModerationTargetScreen(book: book, type: t.type, id: t.id) }
      .navigationDestination(item: $adminDestination) { dest in
        if let admin {
          switch dest {
          case .users: AdminUsersScreen(book: admin)
          case .audit: AdminAuditScreen(book: admin)
          case .art: AdminArtScreen(book: admin)
          }
        } else {
          // Lưới an toàn: sổ lẽ ra đã có từ `.task`; không bao giờ để
          // màn trắng khi `makeAdmin` trả `nil`.
          DSLoadingView()
        }
      }
  }

  /// Tạo sổ quản trị ngay khi mở bảng (sau khi biết vai trò) — KHÔNG tạo
  /// trong cùng một lần chạm với `adminDestination`: đích điều hướng được
  /// xử lý khi sổ còn `nil` nên màn trắng (E2E run 44255708452, flow 14).
  /// `checkRole()` set `role` trước khi `load()` set `phase = .ready` nên
  /// sổ luôn có trước khi mục Quản trị hiện ra cho người chạm vào.
  private func ensureAdmin() {
    if admin == nil, book.role == .admin, let a = services.makeAdmin(userId: book.userId) {
      admin = a
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
          // Quản trị (giai đoạn 2): chỉ admin thấy. Moderator không có mục
          // này — và sổ quản trị chỉ tạo khi chạm vào.
          if book.role == .admin {
            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              Text("community.admin.title")
                .font(DS.TextStyle.headline)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .accessibilityAddTraits(.isHeader)
              DSCard {
                VStack(spacing: DS.Spacing.md) {
                  adminRow(
                    label: String(localized: "community.admin.users.title"), icon: "person.2",
                    destination: .users)
                  Divider()
                  adminRow(
                    label: String(localized: "community.admin.audit.title"), icon: "list.clipboard",
                    destination: .audit)
                  Divider()
                  adminRow(
                    label: String(localized: "community.admin.art.title"), icon: "photo",
                    destination: .art)
                }
              }
            }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  /// Một hàng của mục Quản trị: chạm thì mở màn. Sổ đã tạo từ `.task` khi
  /// mở bảng — không tạo ở đây: tạo + đặt đích trong cùng một action thì
  /// đích được xử lý khi sổ còn `nil`, màn trắng (E2E run 44255708452).
  private func adminRow(label: String, icon: String, destination: AdminDestination) -> some View {
    Button {
      adminDestination = destination
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: icon)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        Text(verbatim: label)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
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
