import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chi tiết một đích kiểm duyệt (#915) — port của
/// `native/src/app/admin/target.tsx` (RN web) lên SwiftUI: nội dung, tác giả
/// (+ tạm khoá đăng), quyết định ẩn / khôi phục / gỡ / bác, kháng nghị, từng
/// báo cáo và lịch sử kiểm toán.
struct ModerationTargetScreen: View {
  let book: ModerationBook
  let type: ModTargetType
  let id: String

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var sheet: Sheet?
  /// Bài gốc của bình luận đang xét (mở bằng sheet bình luận như ở feed).
  @State private var parentPost: ParentPost?

  private struct ParentPost: Identifiable {
    let id: String
  }

  /// Hộp báo UIKit, hiện ngay khi gán (xem `ConfirmAlert`): màn này có thể nằm
  /// trong sheet chồng sheet, nơi `.alert` đặt sau khi chờ server không hiện.
  private var message: String? {
    get { nil }
    nonmutating set { if let newValue { ConfirmAlert.ok(newValue) } }
  }

  private enum Sheet: Identifiable {
    case decide(ModAction)
    case appeal(approve: Bool, appealId: String)
    case restrict
    case unrestrict
    var id: String {
      switch self {
      case .decide(let a): "decide-\(a.rawValue)"
      case .appeal(let ok, let aid): "appeal-\(ok)-\(aid)"
      case .restrict: "restrict"
      case .unrestrict: "unrestrict"
      }
    }
  }

  var body: some View {
    content
      .navigationTitle(Text("community.mod.target.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.loadTarget(type: type, id: id) }
      .task { await book.loadTarget(type: type, id: id) }
      .sheet(item: $sheet) { s in reasonSheet(s) }
      .sheet(item: $parentPost) { p in CommunityCommentsSheet(postId: p.id, showsPost: true) }
  }

  @ViewBuilder private var content: some View {
    switch book.targetPhase {
    case .loading:
      DSLoadingView()
    case .failed:
      if book.targetFailure == .gone {
        DSEmptyState(
          systemImage: "doc.text.magnifyingglass", title: String(localized: "community.mod.target.title"),
          message: String(localized: "community.mod.target.gone"))
      } else {
        DSErrorView(
          message: book.targetFailure.map(ModerationFailureText.text) ?? String(localized: "community.mod.loadfailed")
        ) { Task { await book.loadTarget(type: type, id: id) } }
      }
    case .notStaff:
      DSEmptyState(
        systemImage: "shield.slash", title: String(localized: "community.mod.target.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      if let detail = book.detail {
        detailView(detail)
      } else {
        DSEmptyState(
          systemImage: "doc.text.magnifyingglass", title: String(localized: "community.mod.target.title"),
          message: String(localized: "community.mod.target.gone"))
      }
    }
  }

  // MARK: - Nội dung

  private func detailView(_ d: ModTargetDetail) -> some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        contentCard(d)
        if let author = d.author { authorCard(d, author: author) }
        actionsCard(d)
        if let appeal = d.openAppeal { appealCard(d, appeal: appeal) }
        reportsCard(d)
        decidedAppealsCard(d)
        historyCard(d)
      }
      .padding(DS.Spacing.md)
    }
  }

  private func contentCard(_ d: ModTargetDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: DS.Spacing.sm) {
          Text(d.type == .post ? "community.mod.target.post" : "community.mod.target.comment")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          stateBadge(d)
        }
        if !d.target.excerpt.isEmpty {
          Text(verbatim: d.target.excerpt)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        // Bình luận cần ngữ cảnh bài gốc (Devin #916): mở bằng sheet bình
        // luận như ở feed — không đẩy thêm màn chi tiết kiểm duyệt, vì sổ
        // chi tiết dùng chung chỉ giữ một đích.
        if d.type == .comment, let postId = d.target.postId {
          DSButton(String(localized: "community.mod.target.viewPost"), style: .secondary) {
            parentPost = ParentPost(id: postId)
          }
        }
        HStack(spacing: DS.Spacing.sm) {
          if let kind = d.target.kind {
            Text(verbatim: Self.kindText(kind))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Text(verbatim: PostHeaderView.agoText(d.target.createdAt))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Spacer(minLength: 0)
          if let likes = d.target.likeCount, let comments = d.target.commentCount {
            Text(verbatim: "\(likes) · \(comments)")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityLabel(
                Text(verbatim: "\(String(localized: "community.like")) \(likes) · \(String(localized: "community.comment")) \(comments)"))
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder private func stateBadge(_ d: ModTargetDetail) -> some View {
    if d.target.removed {
      Text("community.mod.target.removed")
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.destructive.swiftUI)
        .padding(.horizontal, DS.Spacing.sm)
        .padding(.vertical, DS.Spacing.xs)
        .background(DS.Color.destructive.swiftUI.opacity(0.12), in: Capsule())
    } else if d.target.hidden {
      Text("community.mod.target.hidden")
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        .padding(.horizontal, DS.Spacing.sm)
        .padding(.vertical, DS.Spacing.xs)
        .background(DS.Color.readinessYellow.swiftUI.opacity(0.12), in: Capsule())
    } else {
      Text("community.mod.target.visible")
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        .padding(.horizontal, DS.Spacing.sm)
        .padding(.vertical, DS.Spacing.xs)
        .background(DS.Color.readinessGreen.swiftUI.opacity(0.12), in: Capsule())
    }
  }

  // MARK: - Tác giả + tạm khoá đăng

  private func authorCard(_ d: ModTargetDetail, author: ModTargetDetail.Author) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.mod.target.author")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        HStack(spacing: DS.Spacing.sm) {
          Text(verbatim: author.person.name)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          Text(verbatim: ModerationFailureText.roleText(author.role))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, DS.Spacing.xs)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        restrictionRow(d, author: author)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// Hàng tạm khoá đăng: đang khoá thì hiện tới bao giờ + vì sao và nút gỡ;
  /// chưa khoá thì nút khoá — trừ chính mình và người trong đội (server chặn,
  /// màn không bày nút không bấm được).
  @ViewBuilder private func restrictionRow(_ d: ModTargetDetail, author: ModTargetDetail.Author) -> some View {
    let me = author.person.userId == book.userId
    let staff = author.role.isStaff
    if let r = book.restriction {
      Text("community.mod.restrict.active \(Self.dateText(r.until))")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
      if !r.reason.isEmpty {
        Text("community.mod.restrict.reason \(r.reason)")
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      DSButton(
        String(localized: "community.mod.unrestrict"), style: .secondary,
        action: { sheet = .unrestrict }
      )
      .disabled(book.restricting(user: author.person.userId))
    } else if book.restrictionKnown, !me, !staff {
      DSButton(
        String(localized: "community.mod.restrict.title"), style: .secondary,
        action: { sheet = .restrict }
      )
      .disabled(book.restricting(user: author.person.userId))
    } else if me {
      Text("community.mod.restrict.self")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    } else if staff {
      Text("community.mod.restrict.staff")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  // MARK: - Quyết định

  /// Nút theo trạng thái (ADMIN.md): đang hiện → ẩn / bác báo cáo; đang ẩn →
  /// khôi phục / gỡ; đã gỡ → không còn quyết định nào ở đây (chỉ admin hoàn
  /// tác — giai đoạn 2).
  @ViewBuilder private func actionsCard(_ d: ModTargetDetail) -> some View {
    if !d.target.removed {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Text("community.mod.target.actions")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          let busy = book.deciding(type: type, id: id)
          if d.target.hidden {
            DSButton(String(localized: "community.mod.action.restore"), style: .secondary) { sheet = .decide(.restore) }
              .disabled(busy)
            DSButton(String(localized: "community.mod.action.remove"), style: .secondary) { sheet = .decide(.remove) }
              .disabled(busy)
          } else {
            DSButton(String(localized: "community.mod.action.hide"), style: .secondary) { sheet = .decide(.hide) }
              .disabled(busy)
            // `mod_dismiss` từ chối khi không có báo cáo mở (lỗi 'no open
            // reports') — không bày nút không bấm được (Devin #916).
            if d.reports.contains(where: { $0.status == .open }) {
              DSButton(String(localized: "community.mod.action.dismiss"), style: .secondary) { sheet = .decide(.dismiss) }
                .disabled(busy)
            }
          }
          if busy { ProgressView().frame(maxWidth: .infinity) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  private func appealCard(_ d: ModTargetDetail, appeal: ModTargetDetail.Appeal) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.mod.target.appeals")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if !appeal.message.isEmpty {
          Text(verbatim: appeal.message)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        Text(verbatim: PostHeaderView.agoText(appeal.createdAt))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        let busy = book.decidingAppeal(id: appeal.id)
        DSButton(String(localized: "community.mod.appeal.approve"), style: .secondary) {
          sheet = .appeal(approve: true, appealId: appeal.id)
        }
        .disabled(busy || d.target.removed)
        DSButton(String(localized: "community.mod.appeal.reject"), style: .secondary) {
          sheet = .appeal(approve: false, appealId: appeal.id)
        }
        .disabled(busy)
        if busy { ProgressView().frame(maxWidth: .infinity) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: - Báo cáo / kháng nghị đã quyết / lịch sử

  private func reportsCard(_ d: ModTargetDetail) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("community.mod.target.reports")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if d.reports.isEmpty {
          Text("community.mod.reports.empty")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          ForEach(d.reports) { r in
            VStack(alignment: .leading, spacing: DS.Spacing.xs) {
              HStack(spacing: DS.Spacing.sm) {
                Text(verbatim: r.reason.map(HiddenNoticeView.reasonText) ?? r.reasonRaw)
                  .font(DS.TextStyle.body)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Spacer(minLength: 0)
                if !r.counted {
                  Text("community.mod.reports.notcounted")
                    .font(DS.TextStyle.caption.weight(.semibold))
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                    .padding(.horizontal, DS.Spacing.sm)
                    .padding(.vertical, DS.Spacing.xs)
                    .background(DS.Color.secondary.swiftUI, in: Capsule())
                }
              }
              HStack(spacing: DS.Spacing.sm) {
                if let reporter = r.reporter {
                  Text(verbatim: reporter.name)
                    .font(DS.TextStyle.footnote)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                }
                Text(verbatim: PostHeaderView.agoText(r.createdAt))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              if let note = r.note, !note.isEmpty {
                Text(verbatim: note)
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
            }
            .accessibilityElement(children: .combine)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder private func decidedAppealsCard(_ d: ModTargetDetail) -> some View {
    let decided = d.appeals.filter { $0.status != .open }
    if !decided.isEmpty {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text("community.mod.target.appealsdecided")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          ForEach(decided) { a in
            VStack(alignment: .leading, spacing: DS.Spacing.xs) {
              HStack(spacing: DS.Spacing.sm) {
                Text(a.status == .restored ? "community.mod.appeals.restored" : "community.mod.appeals.upheld")
                  .font(DS.TextStyle.body)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Spacer(minLength: 0)
                Text(verbatim: PostHeaderView.agoText(a.createdAt))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              if !a.message.isEmpty {
                Text(verbatim: a.message)
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
            }
            .accessibilityElement(children: .combine)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  private func historyCard(_ d: ModTargetDetail) -> some View {
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
          ForEach(d.history) { row in ModAuditRowView(row: row) }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: - Sheet lý do + lệnh

  @ViewBuilder private func reasonSheet(_ s: Sheet) -> some View {
    switch s {
    case .decide(let action):
      ModerationReasonSheet(
        title: Self.actionText(action), requiresReason: action.requiresReason,
        confirmTitle: Self.actionText(action), destructive: action == .remove
      ) { reason, _ in Task { await runDecide(action, reason: reason) } }
    case .appeal(let approve, let appealId):
      ModerationReasonSheet(
        title: approve ? String(localized: "community.mod.appeal.approve") : String(localized: "community.mod.appeal.reject"),
        confirmTitle: approve ? String(localized: "community.mod.appeal.approve") : String(localized: "community.mod.appeal.reject"),
        destructive: !approve
      ) { reason, _ in Task { await runAppeal(appealId, approve: approve, reason: reason) } }
    case .restrict:
      ModerationReasonSheet(
        title: String(localized: "community.mod.restrict.title"),
        message: String(localized: "community.mod.restrict.body"),
        requiresReason: true, confirmTitle: String(localized: "community.mod.restrict.title"), destructive: true,
        durations: [
          .init(hours: 24, label: String(localized: "community.mod.restrict.day")),
          .init(hours: 168, label: String(localized: "community.mod.restrict.week")),
        ]
      ) { reason, hours in Task { await runRestrict(hours: hours ?? 24, reason: reason) } }
    case .unrestrict:
      ModerationReasonSheet(
        title: String(localized: "community.mod.unrestrict"),
        requiresReason: true, confirmTitle: String(localized: "community.mod.unrestrict")
      ) { reason, _ in Task { await runUnrestrict(reason: reason) } }
    }
  }

  private func runDecide(_ action: ModAction, reason: String) async {
    switch await book.decide(action, type: type, id: id, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  private func runAppeal(_ appealId: String, approve: Bool, reason: String) async {
    switch await book.decideAppeal(id: appealId, approve: approve, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  private func runRestrict(hours: Int, reason: String) async {
    guard let author = book.detail?.author else { return }
    switch await book.restrict(user: author.person.userId, hours: hours, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  private func runUnrestrict(reason: String) async {
    guard let author = book.detail?.author else { return }
    switch await book.unrestrict(user: author.person.userId, reason: reason) {
    case .done: message = String(localized: "community.mod.action.done")
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  // MARK: - Chữ

  static func actionText(_ a: ModAction) -> String {
    switch a {
    case .hide: String(localized: "community.mod.action.hide")
    case .restore: String(localized: "community.mod.action.restore")
    case .remove: String(localized: "community.mod.action.remove")
    case .dismiss: String(localized: "community.mod.action.dismiss")
    }
  }

  static func kindText(_ kind: CommunityFeed.Kind) -> String {
    switch kind {
    case .workout: String(localized: "community.workout")
    case .progress: String(localized: "community.kind.progress")
    case .recipe: String(localized: "community.recipe")
    }
  }

  /// Ngày giờ theo ngôn ngữ app ("17 thg 11, 10:00"); chuỗi lạ thì hiện nguyên.
  static func dateText(_ iso: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
    let f = DateFormatter()
    f.locale = Locale.app
    f.dateStyle = .medium
    f.timeStyle = .short
    return f.string(from: date)
  }
}
