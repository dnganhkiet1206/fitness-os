import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Hộp thông báo (#527, lát 9) — `app/community-inbox.tsx` @ fac9ac2 trên
/// `CommunityInboxBook`.
///
/// Như RN: mở màn = đánh dấu cả hộp đã đọc, dòng chưa đọc lúc mở giữ chấm
/// "mới" tới khi rời màn; dòng gộp lượt thích nói người mới nhất và "N người
/// khác"; tên người (hoặc tên thử thách) in đậm trong câu của app, ba dòng;
/// huy hiệu loại việc ở góc avatar; chạm: theo dõi → hồ sơ, còn lại → bài.
///
/// Chưa có (lát thử thách): thẻ "đã đạt mà chưa nhận" trên cùng, và chạm dòng
/// mốc thử thách mở thử thách (màn thử thách cộng đồng chưa port).
struct CommunityInboxView: View {
  let book: CommunityInboxBook
  @Environment(\.openCommunityUser) private var openUser
  @State private var openPost: CommunityPostRoute?
  /// Một lần mỗi lần MỞ màn — quay lại từ một bài không chụp lại chấm "mới".
  @State private var opened = false

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text("community.inbox.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task {
      guard !opened else { return }
      opened = true
      await book.beginViewing(lang: AppServices.appLang)
    }
    .refreshable { await book.load(lang: AppServices.appLang) }
    .communityUserLinks()
    .navigationDestination(item: $openPost) { CommunityPostScreen(postId: $0.id) }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) {
        Task { await book.load(lang: AppServices.appLang) }
      }
    case .ready where book.items.isEmpty:
      DSEmptyState(
        systemImage: "bell", title: String(localized: "community.inbox.empty"),
        message: String(localized: "community.inbox.emptyhint"))
    case .ready:
      DSCard {
        VStack(spacing: 0) {
          ForEach(Array(book.items.enumerated()), id: \.element.id) { i, x in
            if i > 0 { Divider() }
            row(x)
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
      case .challenge, nil: break
      }
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        if x.challenge != nil {
          Image(systemName: "trophy.fill")
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            .frame(width: 44, height: 44)
            .accessibilityHidden(true)
        } else {
          MascotAvatar(mascotId: x.actors.first?.mascotId, size: 44)
            .overlay(alignment: .bottomTrailing) {
              Image(systemName: Self.icon(x.kind))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .frame(width: 20, height: 20)
                .background(DS.Color.secondary.swiftUI, in: Circle())
                .overlay(Circle().stroke(DS.Color.background.swiftUI, lineWidth: 2))
                .offset(x: 2, y: 2)
            }
            .accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(Self.sentence(parts))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(3)
            .multilineTextAlignment(.leading)
          Text(verbatim: when)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if isNew {
          Circle().fill(DS.Color.primary.swiftUI).frame(width: 8, height: 8)
        }
      }
      .padding(.vertical, DS.Spacing.sm)
      .frame(minHeight: 60)
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
