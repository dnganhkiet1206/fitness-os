import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chi tiết một người cho admin (#915, giai đoạn 2) — port của
/// `native/src/app/admin/user.tsx` (RN web): hồ sơ, đổi vai trò (lý do bắt
/// buộc), tạm khoá đăng, bài của họ, báo cáo về họ, báo cáo họ đã gửi, lịch
/// sử kiểm toán.
///
/// Bài / báo cáo chạm vào thì mở màn chi tiết kiểm duyệt của đích đó — cần
/// một `ModerationBook` riêng (tạo lười qua services khi chạm lần đầu; sổ
/// quản trị không biết màn đích).
struct AdminUserScreen: View {
  let book: AdminBook
  let userId: String

  @Environment(AppServices.self) private var services
  @State private var sheet: Sheet?
  @State private var moderation: ModerationBook?
  @State private var openTarget: ModTargetRef?

  /// Hộp báo UIKit, hiện ngay khi gán (xem `ConfirmAlert`).
  private var message: String? {
    get { nil }
    nonmutating set { if let newValue { ConfirmAlert.ok(newValue) } }
  }

  private enum Sheet: Identifiable {
    case role(AppRole)
    case restrict
    case unrestrict
    var id: String {
      switch self {
      case .role(let r): "role-\(r.rawValue)"
      case .restrict: "restrict"
      case .unrestrict: "unrestrict"
      }
    }
  }

  var body: some View {
    content
      .navigationTitle(Text("community.admin.user.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.loadUser(id: userId) }
      .task { await book.loadUser(id: userId) }
      .sheet(item: $sheet) { s in reasonSheet(s) }
      .navigationDestination(item: $openTarget) { t in
        if let moderation { ModerationTargetScreen(book: moderation, type: t.type, id: t.id) }
      }
  }

  @ViewBuilder private var content: some View {
    switch book.userPhase {
    case .loading:
      DSLoadingView()
    case .failed:
      if book.userFailure == .gone {
        DSEmptyState(
          systemImage: "person.slash", title: String(localized: "community.admin.user.title"),
          message: String(localized: "community.admin.user.gone"))
      } else {
        DSErrorView(
          message: book.userFailure.map(ModerationFailureText.text) ?? String(localized: "community.mod.loadfailed")
        ) { Task { await book.loadUser(id: userId) } }
      }
    case .notStaff:
      DSEmptyState(
        systemImage: "shield.slash", title: String(localized: "community.admin.user.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      if let d = book.userDetail {
        detailView(d)
      } else {
        DSEmptyState(
          systemImage: "person.slash", title: String(localized: "community.admin.user.title"),
          message: String(localized: "community.admin.user.gone"))
      }
    }
  }

  // MARK: - Nội dung

  private func detailView(_ d: AdminUserDetail) -> some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        profileCard(d)
        roleCard(d)
        restrictionCard(d)
        postsCard(d)
        reportsAgainstCard(d)
        historyCard(d)
      }
      .padding(DS.Spacing.md)
    }
  }

  private func profileCard(_ d: AdminUserDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: DS.Spacing.sm) {
          Text(verbatim: d.name)
            .font(DS.TextStyle.title3)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          Text(verbatim: ModerationFailureText.roleText(d.role))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, DS.Spacing.xs)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        if let p = d.profile, !p.handle.isEmpty {
          Text(verbatim: "@\(p.handle)")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        if let email = d.email, !email.isEmpty {
          Text(verbatim: email)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        if let p = d.profile, !p.bio.isEmpty {
          Text(verbatim: p.bio)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        HStack(spacing: DS.Spacing.md) {
          AdminStat(label: String(localized: "community.mod.authorstats.posts"), value: d.posts.count)
          AdminStat(
            label: String(localized: "community.mod.authorstats.against"), value: d.reportsAgainst.count,
            warn: !d.reportsAgainst.filter { $0.status == .open }.isEmpty)
          AdminStat(label: String(localized: "community.mod.authorstats.filed"), value: d.reportsFiled)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// Đổi vai trò: một nút cho mỗi vai trò KHÁC vai trò hiện tại (mở sheet
  /// lý do bắt buộc). Không đổi vai trò của chính mình — màn ẩn nút, sổ và
  /// server cũng chặn. Hạ admin cuối cùng thì server chặn, màn hiện lỗi rõ
  /// (`.lastAdmin`).
  private func roleCard(_ d: AdminUserDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.admin.role.title")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if d.userId == book.userId {
          Text("community.admin.role.self")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          let busy = book.settingRole(user: d.userId)
          ForEach(AppRole.allCases.filter { $0 != d.role }, id: \.self) { role in
            DSButton(
              String(localized: "community.admin.role.changeto \(ModerationFailureText.roleText(role))"),
              style: .secondary
            ) { sheet = .role(role) }
            .disabled(busy)
          }
          if busy { ProgressView().frame(maxWidth: .infinity) }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func restrictionCard(_ d: AdminUserDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.mod.restrict.title")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if let r = book.restriction {
          Text("community.mod.restrict.active \(ModerationTargetScreen.dateText(r.until))")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
          if !r.reason.isEmpty {
            Text("community.mod.restrict.reason \(r.reason)")
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          DSButton(String(localized: "community.mod.unrestrict"), style: .secondary) { sheet = .unrestrict }
            .disabled(book.restricting(user: d.userId))
        } else if book.restrictionKnown, d.userId != book.userId, !d.role.isStaff {
          DSButton(String(localized: "community.mod.restrict.title"), style: .secondary) { sheet = .restrict }
            .disabled(book.restricting(user: d.userId))
        } else if d.userId == book.userId {
          Text("community.mod.restrict.self")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else if d.role.isStaff {
          Text("community.mod.restrict.staff")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func postsCard(_ d: AdminUserDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("community.admin.user.posts")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if d.posts.isEmpty {
          Text("community.admin.user.noposts")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          ForEach(d.posts) { p in
            Button { openTargetRef(.post, id: p.id) } label: {
              VStack(alignment: .leading, spacing: DS.Spacing.xs) {
                HStack(spacing: DS.Spacing.sm) {
                  if let kind = p.kind {
                    Text(verbatim: ModerationTargetScreen.kindText(kind))
                      .font(DS.TextStyle.footnote)
                      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  }
                  Text(verbatim: PostHeaderView.agoText(p.createdAt))
                    .font(DS.TextStyle.footnote)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  Spacer(minLength: 0)
                  if p.removed {
                    Text("community.mod.target.removed")
                      .font(DS.TextStyle.caption.weight(.semibold))
                      .foregroundStyle(DS.Color.destructive.swiftUI)
                  } else if p.hidden {
                    Text("community.mod.target.hidden")
                      .font(DS.TextStyle.caption.weight(.semibold))
                      .foregroundStyle(DS.Color.readinessYellow.swiftUI)
                  }
                }
                if !p.caption.isEmpty {
                  Text(verbatim: p.caption)
                    .font(DS.TextStyle.body)
                    .foregroundStyle(DS.Color.foreground.swiftUI)
                    .lineLimit(2)
                }
                if p.reports > 0 {
                  Text(verbatim: ModQueueRow.countText(p.reports))
                    .font(DS.TextStyle.footnote)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func reportsAgainstCard(_ d: AdminUserDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("community.admin.user.reportsagainst")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if d.reportsAgainst.isEmpty {
          Text("community.admin.user.noreports")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          ForEach(d.reportsAgainst) { r in
            Button { openTargetRef(r.targetType, id: r.targetId) } label: {
              VStack(alignment: .leading, spacing: DS.Spacing.xs) {
                HStack(spacing: DS.Spacing.sm) {
                  Text(verbatim: r.reason.map(HiddenNoticeView.reasonText) ?? r.reasonRaw)
                    .font(DS.TextStyle.body)
                    .foregroundStyle(DS.Color.foreground.swiftUI)
                  Spacer(minLength: 0)
                  Text(verbatim: Self.reportStatusText(r.status))
                    .font(DS.TextStyle.caption.weight(.semibold))
                    .foregroundStyle(
                      r.status == .open ? DS.Color.metricBlue.swiftUI : DS.Color.mutedForeground.swiftUI)
                }
                Text(verbatim: PostHeaderView.agoText(r.createdAt))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func historyCard(_ d: AdminUserDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("community.mod.target.history")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if d.history.isEmpty {
          Text("community.mod.dashboard.empty")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          ForEach(d.history) { row in
            ModAuditRowView(row: row) { openTargetRef($0.type, id: $0.id) }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: - Sheet lý do + lệnh

  private func openTargetRef(_ type: ModTargetType, id: String) {
    if moderation == nil { moderation = services.makeModeration(userId: book.userId) }
    openTarget = ModTargetRef(type: type, id: id)
  }

  @ViewBuilder private func reasonSheet(_ s: Sheet) -> some View {
    switch s {
    case .role(let role):
      ModerationReasonSheet(
        title: String(localized: "community.admin.role.changeto \(ModerationFailureText.roleText(role))"),
        requiresReason: true,
        confirmTitle: String(localized: "community.admin.role.changeto \(ModerationFailureText.roleText(role))"),
        destructive: role == .user
      ) { reason, _ in Task { await runSetRole(role, reason: reason) } }
    case .restrict:
      ModerationReasonSheet(
        title: String(localized: "community.mod.restrict.title"),
        message: String(localized: "community.mod.restrict.body"),
        requiresReason: true, confirmTitle: String(localized: "community.mod.restrict.title"), destructive: true,
        durations: [
          .init(hours: 24, label: String(localized: "community.mod.restrict.day")),
          .init(hours: 168, label: String(localized: "community.mod.restrict.week")),
        ],
        presets: true
      ) { reason, hours in Task { await runRestrict(hours: hours ?? 24, reason: reason) } }
    case .unrestrict:
      ModerationReasonSheet(
        title: String(localized: "community.mod.unrestrict"),
        requiresReason: true, confirmTitle: String(localized: "community.mod.unrestrict")
      ) { reason, _ in Task { await runUnrestrict(reason: reason) } }
    }
  }

  private func runSetRole(_ role: AppRole, reason: String) async {
    switch await book.setRole(user: userId, role: role, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  private func runRestrict(hours: Int, reason: String) async {
    switch await book.restrict(user: userId, hours: hours, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  private func runUnrestrict(reason: String) async {
    switch await book.unrestrict(user: userId, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  static func reportStatusText(_ s: ModReportStatus) -> String {
    switch s {
    case .open: String(localized: "community.mod.reports.open")
    case .actioned: String(localized: "community.mod.reports.actioned")
    case .dismissed: String(localized: "community.mod.reports.dismissed")
    }
  }
}
