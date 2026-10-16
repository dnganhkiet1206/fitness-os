import ASCNDCore
import ASCNDDesignSystem
import SwiftUI
import UIKit

/// Hộp thông báo (#527, lát 9) — `app/community-inbox.tsx` @ fac9ac2 trên
/// `CommunityInboxBook`.
///
/// Như RN: mở màn = đánh dấu cả hộp đã đọc, dòng chưa đọc lúc mở giữ chấm
/// "mới" tới khi rời màn; dòng gộp lượt thích nói người mới nhất và "N người
/// khác"; tên người (hoặc tên thử thách) in đậm trong câu của app, ba dòng;
/// huy hiệu loại việc ở góc avatar; chạm: theo dõi → hồ sơ, còn lại → bài.
///
/// Lát 14: thẻ thử thách "đã đạt mà chưa nhận" đứng TRÊN mọi thông báo (việc
/// còn phải làm, có hạn — không mang chấm "mới"); chạm dòng mốc thử thách mở
/// thử thách.
///
/// 16/10 (chủ dự án): thành mục Thông báo của cả app — mở từ chuông trên trang
/// Hôm nay (thay viên chuỗi ngày; chuông và nút hồ sơ ở tab Cộng đồng bỏ). Thêm
/// tin nhắc việc của app (`AppNotice`) cạnh thẻ thử thách ở "Cần làm", và bộ lọc
/// Tất cả / Cộng đồng / Nhắc việc. Tin nhắn không vào đây (tab Cộng đồng có nút
/// riêng).
struct CommunityInboxView: View {
  let book: CommunityInboxBook
  var challenges: CommunityChallengesBook?
  var notices: [AppNotice] = []
  var onNotice: ((AppNotice) -> Void)?
  @State private var filter: Filter = .all
  @Environment(AppServices.self) private var services
  @Environment(\.openURL) private var openURL
  /// Đã hỏi quyền mà iOS vẫn từ chối (người dùng từng bấm "Không cho phép") —
  /// chỉ còn Cài đặt của máy mới bật lại được.
  @State private var denied = false

  enum Filter: CaseIterable { case all, community, reminders }

  /// Dòng gọn (16/10, chủ dự án: "các thanh thông báo to quá, làm gọn và dễ
  /// nhìn"): biểu tượng 34, chữ 15, giờ 12, dòng ~52 — gần Trung tâm thông báo
  /// của iOS hơn thẻ chữ lớn trước đây.
  static let iconSize: CGFloat = 34
  static let textFont = Font.system(size: 15)
  static let timeFont = Font.system(size: 12)
  @State private var openChallenge: ChallengeRoute?
  @Environment(\.openCommunityUser) private var openUser
  @State private var openPost: CommunityPostRoute?
  /// Một lần mỗi lần MỞ màn — quay lại từ một bài không chụp lại chấm "mới".
  @State private var opened = false

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        CommunityPageTitle(text: String(localized: "community.inbox.title"))
        if needsEnable { enableCard }
        filterChips
        content
      }
      .padding(DS.Spacing.md)
    }
    .communityPage()
    .task {
      guard !opened else { return }
      opened = true
      await book.beginViewing(lang: AppServices.appLang)
    }
    .refreshable { await book.load(lang: AppServices.appLang) }
    .communityUserLinks()
    // Bài mở bằng màn bật lên kèm thẻ (15/10), như feed.
    .communityPostSheet(Binding(get: { openPost.map { CommunityPostSheetRoute(id: $0.id) } }, set: { openPost = $0.map { CommunityPostRoute(id: $0.id) } }))
    .navigationDestination(item: $openChallenge) { route in
      if let challenges { CommunityChallengeView(book: challenges, id: route.id) }
    }
  }

  private var due: [CommunityChallenges.Pending] { challenges?.pending ?? [] }

  /// "Bạn đã đạt **tên** · Nhận 100 xu · còn 4 ngày".
  private var dueCard: some View {
    NoticeGroup {
      VStack(spacing: 0) {
        ForEach(Array(due.enumerated()), id: \.element.id) { i, p in
          if i > 0 { Divider() }
          let halves = String(localized: "community.inbox.reached \(Self.mark)").components(separatedBy: Self.mark)
          let before = halves.first ?? "", after = halves.dropFirst().joined(separator: p.challenge.title)
          let line = CommunityChallengeText.claimLine(p)
          Button {
            openChallenge = ChallengeRoute(id: p.challenge.id)
          } label: {
            HStack(spacing: DS.Spacing.sm) {
              Image(systemName: "trophy.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(DS.Color.readinessYellow.swiftUI)
                .frame(width: Self.iconSize, height: Self.iconSize)
                .background(DS.Color.readinessYellow.swiftUI.opacity(0.14), in: Circle())
                .accessibilityHidden(true)
              VStack(alignment: .leading, spacing: 2) {
                Text(Self.sentence((before: before, name: p.challenge.title, after: after)))
                  .font(Self.textFont)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .lineLimit(3)
                  .multilineTextAlignment(.leading)
                Text(verbatim: line)
                  .font(Self.timeFont)
                  .foregroundStyle(p.daysLeft == 0 ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(verbatim: "\(before)\(p.challenge.title)\(after), \(line)"))
          .accessibilityAddTraits(.isButton)
        }
      }
    }
  }

  /// Thẻ "Bật thông báo" (16/10, chủ dự án: "app chưa gửi thông báo"): trước đây
  /// mọi nhắc nhở mặc định tắt và quyền chỉ được hỏi trong Cài đặt → Nhắc nhở,
  /// nên phần lớn người dùng không bao giờ nhận thông báo nào.
  private var needsEnable: Bool {
    let r = services.reminders
    return r.isAvailable && !r.permission
  }

  private var enableCard: some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: "bell.badge.fill")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(width: Self.iconSize, height: Self.iconSize)
        .background(DS.Color.foreground.swiftUI, in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text("notif.enable.title")
          .font(Self.textFont.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text("notif.enable.body")
          .font(Self.timeFont)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button {
        Task { await enable() }
      } label: {
        Text(denied ? "notif.enable.settings" : "notif.enable.button")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(DS.Color.background.swiftUI)
          .padding(.horizontal, 14)
          .frame(minHeight: 32)
          .background(DS.Color.foreground.swiftUI, in: Capsule())
          .frame(minHeight: 44)
          .contentShape(Capsule())
      }
      .buttonStyle(.plain)
    }
    .padding(.vertical, 10)
    .padding(.horizontal, 14)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.06), lineWidth: 0.75)
    }
  }

  /// Bật bộ nhắc nên có (ghi bữa 20:00, ghi giấc ngủ 8:00 — tự bỏ qua khi hôm đó
  /// đã ghi; nhận thưởng thử thách vốn bật) và xin quyền; thông báo cộng đồng đi
  /// theo quyền ấy. Bị từ chối rồi thì mở Cài đặt của máy.
  private func enable() async {
    if denied {
      if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
      return
    }
    let r = services.reminders
    // Nhận thưởng thử thách bật sẵn nên `anyEnabled` luôn đúng: xét riêng các nhắc
    // theo giờ. Người đã tự chọn nhắc nào thì giữ nguyên lựa chọn ấy.
    let chosen = ReminderKey.allCases.contains { $0 != .challengeClaim && r.prefs.isEnabled($0) }
    if !chosen {
      await r.setEnabled(.meal, true)
      await r.setEnabled(.sleepLog, true)
    } else {
      await r.setEnabled(.challengeClaim, r.prefs.isEnabled(.challengeClaim))
    }
    await r.refreshPermission()
    denied = !r.permission
    if r.permission { CommunityAlerts.schedule() }
  }

  private var showsReminders: Bool { filter != .community }
  private var showsCommunity: Bool { filter != .reminders }
  private var hasReminders: Bool { !notices.isEmpty || !due.isEmpty }

  private var filterChips: some View {
    HStack(spacing: 6) {
      ForEach(Filter.allCases, id: \.self) { f in
        let on = filter == f
        Button {
          filter = f
        } label: {
          Text(Self.title(f))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(on ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
            .padding(.horizontal, 12)
            .frame(minHeight: 30)
            .background(on ? DS.Color.foreground.swiftUI : DS.Color.card.swiftUI, in: Capsule())
            .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(on ? 0 : 0.10), lineWidth: 0.75) }
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
    .sensoryFeedback(.selection, trigger: filter)
  }

  static func title(_ f: Filter) -> String {
    switch f {
    case .all: String(localized: "notif.filter.all")
    case .community: String(localized: "tab.community")
    case .reminders: String(localized: "notif.filter.reminders")
    }
  }

  /// Tin nhắc việc của app: chuỗi sắp đứt, xu đang chờ.
  private var noticeCard: some View {
    NoticeGroup {
      VStack(spacing: 0) {
        ForEach(Array(notices.enumerated()), id: \.element.id) { i, n in
          if i > 0 { Divider() }
          let (symbol, tint, text) = Self.look(n)
          Button {
            onNotice?(n)
          } label: {
            HStack(spacing: DS.Spacing.sm) {
              Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: Self.iconSize, height: Self.iconSize)
                .background(tint.opacity(0.14), in: Circle())
                .accessibilityHidden(true)
              Text(verbatim: text)
                .font(Self.textFont)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
              Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .accessibilityHidden(true)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: text))
        }
      }
    }
  }

  static func look(_ n: AppNotice) -> (String, Color, String) {
    switch n {
    case .streakRisk(let days):
      ("flame.fill", DS.Color.metricOrangeGraphic.swiftUI, String(localized: "notif.streak.risk \(days)"))
    case .coinsWaiting(let coins):
      ("circle.circle.fill", DS.Color.readinessYellow.swiftUI, String(localized: "notif.coins \(coins)"))
    }
  }

  private func sectionTitle(_ key: LocalizedStringKey) -> some View {
    Text(key)
      .font(DS.TextStyle.footnote.weight(.semibold))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.top, DS.Spacing.xs)
      .accessibilityAddTraits(.isHeader)
  }

  @ViewBuilder private var content: some View {
    if showsReminders, hasReminders {
      sectionTitle("notif.section.todo")
      if !notices.isEmpty { noticeCard }
      if !due.isEmpty { dueCard }
    }
    if showsCommunity { communityContent }
    if filter == .reminders, !hasReminders {
      DSEmptyState(
        systemImage: "checkmark.circle", title: String(localized: "notif.reminders.empty"),
        message: String(localized: "notif.reminders.emptyhint"))
    }
  }

  @ViewBuilder private var communityContent: some View {
    switch book.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    case .failed:
      // Một dòng nhỏ, không phải khung lỗi nửa màn (16/10): tin nhắc việc phía
      // trên vẫn dùng được.
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: "exclamationmark.triangle")
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .accessibilityHidden(true)
        Text("notif.community.failed")
          .font(Self.textFont)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer(minLength: 0)
        Button(String(localized: "common.retry")) {
          Task { await book.load(lang: AppServices.appLang) }
        }
        .font(Self.textFont.weight(.semibold))
        .frame(minHeight: 44)
      }
    case .ready where book.items.isEmpty && (filter == .community || !hasReminders):
      DSEmptyState(
        systemImage: "bell", title: String(localized: "community.inbox.empty"),
        message: String(localized: "community.inbox.emptyhint"))
    case .ready:
      if !book.items.isEmpty {
        if filter == .all, hasReminders { sectionTitle("tab.community") }
        NoticeGroup {
          VStack(spacing: 0) {
            ForEach(Array(book.items.enumerated()), id: \.element.id) { i, x in
              if i > 0 { Divider() }
              row(x)
            }
          }
        }
      }
    }
  }

  private func row(_ x: CommunityInbox.Item) -> some View {
    let parts = Self.parts(x)
    let when = PostHeaderView.agoText(x.at)
    let isNew = book.isNew(x)
    return Button {
      switch CommunityInbox.target(x) {
      case .user(let id): openUser?(id)
      case .post(let id): openPost = CommunityPostRoute(id: id)
      case .challenge(let id): openChallenge = ChallengeRoute(id: id)
      case nil: break
      }
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        if x.challenge != nil {
          Image(systemName: "trophy.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            .frame(width: Self.iconSize, height: Self.iconSize)
            .background(DS.Color.readinessYellow.swiftUI.opacity(0.14), in: Circle())
            .accessibilityHidden(true)
        } else {
          MascotAvatar(mascotId: x.actors.first?.mascotId, size: Self.iconSize)
            .overlay(alignment: .bottomTrailing) {
              Image(systemName: Self.icon(x.kind))
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .frame(width: 16, height: 16)
                .background(DS.Color.secondary.swiftUI, in: Circle())
                .overlay(Circle().stroke(DS.Color.background.swiftUI, lineWidth: 2))
                .offset(x: 2, y: 2)
            }
            .accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(Self.sentence(parts))
            .font(Self.textFont)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          Text(verbatim: when)
            .font(Self.timeFont)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if isNew {
          Circle().fill(DS.Color.primary.swiftUI).frame(width: 8, height: 8)
        }
      }
      .padding(.vertical, 10)
      .frame(minHeight: 52)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      Text(
        verbatim: "\(parts.before)\(parts.name)\(parts.after), \(when)"
          + (isNew ? ", \(String(localized: "community.inbox.unread"))" : "")))
    .accessibilityAddTraits(.isButton)
  }

  /// Câu của app, tên in đậm.
  static func sentence(_ p: (before: String, name: String, after: String)) -> AttributedString {
    var name = AttributedString(p.name)
    name.inlinePresentationIntent = .stronglyEmphasized
    return AttributedString(p.before) + name + AttributedString(p.after)
  }

  /// Ký tự đánh dấu chỗ của tên trong câu đã dịch — tách như
  /// `sentence(x).split('{name}')` của RN.
  private static let mark = "\u{E000}"

  static func parts(_ x: CommunityInbox.Item) -> (before: String, name: String, after: String) {
    let m = mark
    let s: String =
      switch CommunityInbox.sentence(x) {
      case .follow: String(localized: "community.inbox.follow \(m)")
      case .comment: String(localized: "community.inbox.comment \(m)")
      case .reply: String(localized: "community.inbox.reply \(m)")
      case .mention: String(localized: "community.inbox.mention \(m)")
      case .save: String(localized: "community.inbox.save \(m)")
      case .tryWorkout: String(localized: "community.inbox.try \(m)")
      case .challengeDone: String(localized: "community.inbox.done \(m)")
      case .challengeHalf: String(localized: "community.inbox.half \(m)")
      case .like: String(localized: "community.inbox.like \(m)")
      case .likeMany(let n):
        n == 1
          ? String(localized: "community.inbox.likemany.one \(m) \(n)")
          : String(localized: "community.inbox.likemany.other \(m) \(n)")
      }
    let name = x.challenge?.title ?? x.actors.first?.displayName ?? ""
    let halves = s.components(separatedBy: m)
    return (halves.first ?? s, name, halves.dropFirst().joined(separator: name))
  }

  static func icon(_ k: CommunityInbox.Kind) -> String {
    switch k {
    case .like: "heart.fill"
    case .comment: "bubble.right.fill"
    case .follow: "person.badge.plus"
    case .reply: "arrowshape.turn.up.left.fill"
    case .mention: "at"
    case .save: "bookmark.fill"
    case .tryWorkout: "dumbbell.fill"
    case .challengeMilestone: "trophy.fill"
    }
  }
}

struct CommunityPostRoute: Hashable, Identifiable {
  let id: String
}

/// Khung gọn cho một nhóm dòng thông báo: nền thẻ, bo 18, lề ngang 14, không lề
/// dọc thừa (DSCard dày quá cho danh sách — 16/10, chủ dự án).
private struct NoticeGroup<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    content
      .padding(.horizontal, 14)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.06), lineWidth: 0.75)
      }
  }
}
