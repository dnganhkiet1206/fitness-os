import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Mở trang người dùng từ bất kỳ đâu trong Cộng đồng (avatar / tên tác giả /
/// `@handle` đã xác nhận). Gắn `communityUserLinks()` vào màn chứa; nút bên
/// trong thẻ (vốn nằm trong một `NavigationLink` tới bài) gọi hành động này
/// thay vì lồng thêm một liên kết.
struct OpenCommunityUser {
  let action: @MainActor (String) -> Void
  @MainActor func callAsFunction(_ userId: String) { action(userId) }
}

extension EnvironmentValues {
  @Entry var openCommunityUser: OpenCommunityUser? = nil
}

struct CommunityUserRoute: Hashable, Identifiable {
  let id: String
}

private struct CommunityUserLinks: ViewModifier {
  @State private var route: CommunityUserRoute?

  func body(content: Content) -> some View {
    content
      .environment(\.openCommunityUser, OpenCommunityUser { route = CommunityUserRoute(id: $0) })
      .navigationDestination(item: $route) { CommunityUserScreen(targetId: $0.id) }
  }
}

extension View {
  func communityUserLinks() -> some View { modifier(CommunityUserLinks()) }
}

/// Hồ sơ cộng đồng của một người (#527, lát 5) — `app/community-user.tsx` @
/// fac9ac2 trên `CommunityUserBook`.
///
/// Như RN: tên + huy hiệu chính thức, giới thiệu, người theo dõi / đang theo
/// dõi, một dòng thành tích (khi có bài), huy hiệu thử thách (khi người ấy bật);
/// người khác: Theo dõi (đã theo dõi = viên trầm) + menu ⋯ (tắt tiếng 30 ngày /
/// bỏ tắt tiếng, báo cáo, chặn có hỏi lại → đóng màn); chính mình: Sửa hồ sơ;
/// lọc theo loại khi có ≥ 2 loại (lọc ở server); thẻ Hành trình khi xem bài
/// Tiến trình; ghi chú "đang tắt tiếng đến …" + nút bỏ; bài theo trang 30.
///
/// Chưa có (lát sau): lối "Quyền riêng tư" trên hồ sơ của mình (màn chưa
/// port).
struct CommunityUserScreen: View {
  let targetId: String
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityUserBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityUserView(book: book)
      } else if built {
        ContentUnavailableView {
          Label("community.user.title", systemImage: "person.crop.circle")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityUser(userId: flow.today.userId, targetId: targetId)
      built = true
    }
  }
}

struct CommunityUserView: View {
  let book: CommunityUserBook
  @Environment(\.weightUnit) private var unit
  @Environment(\.dismiss) private var dismiss
  @State private var menuOpen = false
  @State private var confirmBlock = false
  @State private var message: String?
  @State private var taps = 0

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text(verbatim: book.profile.map { "@\($0.handle)" } ?? String(localized: "community.user.title")))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if book.profile != nil, !book.isMe {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            taps += 1
            menuOpen = true
          } label: {
            Image(systemName: "ellipsis")
              .frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text("community.post.more"))
        }
      }
    }
    .task { if book.phase == .loading { await book.load() } }
    .refreshable { await book.load() }
    .sensoryFeedback(.selection, trigger: taps)
    .communityUserLinks()
    .communityPostActions(userId: book.userId, host: book)
    .confirmationDialog(
      Text(verbatim: book.profile?.displayName ?? ""), isPresented: $menuOpen, titleVisibility: .visible
    ) {
      if let p = book.profile {
        if book.mutedUntil != nil {
          Button(String(localized: "community.user.unmute")) { Task { await unmute() } }
        } else {
          Button(String(localized: "community.user.mute \(p.handle)")) { Task { await mute(p.handle) } }
        }
        Button(String(localized: "community.post.report")) { Task { await report() } }
        Button(String(localized: "community.user.block \(p.handle)"), role: .destructive) { confirmBlock = true }
      }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
    .alert(
      Text(verbatim: String(localized: "community.user.blockconfirm \(book.profile?.handle ?? "")")),
      isPresented: $confirmBlock
    ) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
      Button(String(localized: "community.user.block \(book.profile?.handle ?? "")"), role: .destructive) {
        Task { await block() }
      }
    } message: {
      Text("community.user.blockbody")
    }
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView().frame(minHeight: 240)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.load() } }
        .frame(minHeight: 240)
    case .gone:
      DSEmptyState(systemImage: "person.crop.circle.badge.questionmark", title: String(localized: "community.user.gone"))
    case .ready:
      if let p = book.profile {
        hero(p)
        primaryAction(p)
        if book.showsKindRow { kindRow }
        if book.showsJourney, let j = book.journey, !j.lines.isEmpty { JourneyCard(journey: j, unit: unit) }
        if let until = book.mutedUntil { mutedCard(p, until: until) }
        posts
      }
    }
  }

  // MARK: - Đầu trang

  private func hero(_ p: CommunityFeed.Author) -> some View {
    VStack(spacing: DS.Spacing.sm) {
      MascotAvatar(mascotId: p.mascotId, size: 88)
      HStack(spacing: 6) {
        Text(verbatim: p.displayName)
          .font(DS.TextStyle.title2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .multilineTextAlignment(.center)
        if p.isOfficial {
          Image(systemName: "checkmark.seal.fill")
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
            .accessibilityLabel(Text("community.verified"))
        }
      }
      if let bio = p.bio, !bio.isEmpty {
        Text(verbatim: bio)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
      }
      HStack(spacing: DS.Spacing.xl) {
        count(book.followers, label: String(localized: "community.user.followers"))
        count(book.following, label: String(localized: "community.user.followingcount"))
      }
      .padding(.top, DS.Spacing.xs)
      // Một dòng chữ, chỉ khi có bài (server đếm trên bài người xem được thấy).
      if let s = book.stats, s.posts > 0 {
        Text(verbatim: Self.statsText(s))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
      }
      if !book.badges.isEmpty { badges }
    }
    .frame(maxWidth: .infinity)
    .padding(.top, DS.Spacing.sm)
  }

  private func count(_ n: Int, label: String) -> some View {
    VStack(spacing: 2) {
      Text(verbatim: "\(n)").font(DS.TextStyle.headline.monospacedDigit())
      Text(verbatim: label).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }

  private var badges: some View {
    // Viên xuống dòng tự do: ở 320 không viên nào bị mép cắt.
    FlowRows(spacing: DS.Spacing.xs) {
      ForEach(book.badges) { b in
        HStack(spacing: 5) {
          Image(systemName: "trophy.fill").font(.caption).foregroundStyle(DS.Color.readinessYellow.swiftUI)
          Text(verbatim: b.title).font(DS.TextStyle.footnote.weight(.semibold)).lineLimit(1)
        }
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(DS.Color.secondary.swiftUI, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("community.user.badge \(b.title)"))
      }
    }
    .padding(.horizontal, DS.Spacing.md)
  }

  @ViewBuilder private func primaryAction(_ p: CommunityFeed.Author) -> some View {
    if book.isMe {
      VStack(spacing: DS.Spacing.sm) {
        NavigationLink {
          CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
        } label: {
          quiet(Text("community.user.edit"))
        }
        .buttonStyle(.plain)
        // Thư viện Đã lưu: viên trầm riêng, rộng hết hàng; chỉ trên hồ sơ của mình.
        NavigationLink {
          CommunitySavedScreen(userId: book.userId)
        } label: {
          Label("community.saved.title", systemImage: "bookmark")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        .buttonStyle(.plain)
      }
    } else {
      Button {
        taps += 1
        Task {
          if case .failed(let f) = await book.toggleFollow() { message = CommunityPostView.failureText(f) }
        }
      } label: {
        if book.iFollow {
          quiet(Text("community.user.unfollowstate"))
        } else {
          Text("community.user.follow")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.primaryForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(DS.Color.primary.swiftUI, in: Capsule())
        }
      }
      .buttonStyle(.plain)
      .disabled(book.working)
      .accessibilityAddTraits(book.iFollow ? .isSelected : [])
    }
  }

  private func quiet(_ t: Text) -> some View {
    t.font(DS.TextStyle.headline)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(DS.Color.secondary.swiftUI, in: Capsule())
  }

  private var kindRow: some View {
    Picker(
      selection: Binding(get: { book.kind }, set: { k in Task { await book.select(k) } })
    ) {
      ForEach([CommunityUser.KindFilter.all] + book.kinds, id: \.self) { k in
        Text(Self.kindLabel(k)).tag(k)
      }
    } label: {
      Text("community.user.title")
    }
    .pickerStyle(.segmented)
  }

  private func mutedCard(_ p: CommunityFeed.Author, until: String) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("community.user.mutednotice \(p.handle) \(Self.dayText(until))")
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Button {
          Task { await unmute() }
        } label: {
          quiet(Text("community.user.unmute"))
        }
        .buttonStyle(.plain)
        .disabled(book.working)
      }
    }
  }

  @ViewBuilder private var posts: some View {
    switch book.postsPhase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.reloadPosts() } }
    case .ready where book.posts.isEmpty:
      // Đang tắt tiếng: ghi chú ở trên đã nói vì sao trang trống.
      if book.mutedUntil == nil {
        Text("community.user.empty")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
    case .ready:
      ForEach(book.posts) { post in
        NavigationLink {
          CommunityPostScreen(postId: post.id)
        } label: {
          PostCardView(post: post, artURL: post.art.flatMap(book.artURL), unit: unit)
        }
        .buttonStyle(.plain)
        .onAppear { if post.id == book.posts.last?.id { Task { await book.loadMore() } } }
      }
      if book.loadingMore {
        ProgressView().frame(maxWidth: .infinity, minHeight: 44)
      } else if book.moreFailed {
        Button(String(localized: "async.retry")) { Task { await book.loadMore() } }
          .frame(maxWidth: .infinity, minHeight: 44)
      }
    }
  }

  // MARK: - Hành động

  private func mute(_ handle: String) async {
    switch await book.mute() {
    case .done: message = String(localized: "community.user.muted \(handle)")
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  private func unmute() async {
    switch await book.unmute() {
    case .done: message = String(localized: "community.user.unmuted")
    case .failed(.nothingWritten): message = String(localized: "community.user.unmutegone")
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  private func report() async {
    switch await book.report() {
    case .done: message = String(localized: "community.post.reported")
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  private func block() async {
    switch await book.block() {
    case .done: dismiss()
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  // MARK: - Chữ

  static func kindLabel(_ k: CommunityUser.KindFilter) -> String {
    switch k {
    case .all: String(localized: "community.user.kind.all")
    case .workout: String(localized: "community.user.kind.workout")
    case .progress: String(localized: "community.user.kind.progress")
    case .recipe: String(localized: "community.user.kind.recipe")
    }
  }

  /// `nPgUserStats`: ba vế, mỗi vế số ít / số nhiều riêng.
  static func statsText(_ s: CommunityUser.Stats) -> String {
    let p =
      s.posts == 1
      ? String(localized: "community.user.stats.posts.one \(s.posts)")
      : String(localized: "community.user.stats.posts.other \(s.posts)")
    let l =
      s.likes == 1
      ? String(localized: "community.user.stats.likes.one \(s.likes)")
      : String(localized: "community.user.stats.likes.other \(s.likes)")
    let t =
      s.tries == 1
      ? String(localized: "community.user.stats.tries.one \(s.tries)")
      : String(localized: "community.user.stats.tries.other \(s.tries)")
    return "\(p) · \(l) · \(t)"
  }

  /// `toLocaleDateString(locale, { day: 'numeric', month: 'short' })`.
  static func dayText(_ iso: String) -> String {
    guard let t = EpochMillis(iso8601: iso) else { return iso }
    let d = Date(timeIntervalSince1970: TimeInterval(t.millis) / 1000)
    return d.formatted(Date.FormatStyle().day().month(.abbreviated).locale(.app))
  }
}

/// Thẻ "Hành trình" (`progress-journey.tsx`): mỗi chỉ số một dòng, từ số đầu
/// của lần đầu tới số cuối của lần mới nhất, kèm chênh lệch — không tô màu
/// tốt / xấu (app không biết mục tiêu của người được xem).
struct JourneyCard: View {
  let journey: ProgressJourney.Journey
  let unit: WeightUnit

  var body: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Text("community.user.journey.title")
          .font(DS.TextStyle.headline)
          .accessibilityAddTraits(.isHeader)
        Text(verbatim: subtitle)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          ForEach(journey.lines, id: \.key) { line in row(ProgressJourney.row(line, unit: unit)) }
        }
        .padding(.top, DS.Spacing.sm)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private var subtitle: String {
    guard let from = journey.firstAt, let to = journey.lastAt else { return "" }
    let n = journey.posts
    let a = Self.day(from, sameYear: sameYear), b = Self.day(to, sameYear: sameYear)
    return n == 1
      ? String(localized: "community.user.journey.sub.one \(n) \(a) \(b)")
      : String(localized: "community.user.journey.sub.other \(n) \(a) \(b)")
  }

  /// Năm chỉ hiện khi khoảng không nằm gọn trong năm nay.
  private var sameYear: Bool {
    let y = Calendar.current.component(.year, from: Date())
    return [journey.firstAt, journey.lastAt].allSatisfy { iso in
      iso.flatMap(Self.date).map { Calendar.current.component(.year, from: $0) == y } ?? false
    }
  }

  static func date(_ iso: String) -> Date? {
    EpochMillis(iso8601: iso).map { Date(timeIntervalSince1970: TimeInterval($0.millis) / 1000) }
  }

  static func day(_ iso: String, sameYear: Bool) -> String {
    guard let d = date(iso) else { return iso }
    let base = Date.FormatStyle().day().month(.abbreviated).locale(.app)
    return d.formatted(sameYear ? base : base.year())
  }

  private func row(_ r: ProgressJourney.Row) -> some View {
    let label: String =
      switch r.key {
      case .weight: String(localized: "community.user.journey.weight")
      case .waist: String(localized: "community.user.journey.waist")
      case .lift: r.name ?? ""
      }
    let icon: String =
      switch r.key {
      case .weight: "scalemass"
      case .waist: "ruler"
      case .lift: "dumbbell"
      }
    let color: Color =
      switch r.key {
      case .weight: DS.Color.metricBeige.swiftUI
      case .waist: DS.Color.readinessYellowGraphic.swiftUI
      case .lift: DS.Color.metricOrange.swiftUI
      }
    let a = ProgressJourney.number(r.start, locale: .app), b = ProgressJourney.number(r.end, locale: .app)
    let delta = r.deltaText(locale: .app)
    return HStack(alignment: .top, spacing: DS.Spacing.sm) {
      Image(systemName: icon).font(.subheadline).foregroundStyle(color).padding(.top, 2).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: label)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(2)
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Text(verbatim: "\(a) → \(b) \(r.unit)").font(DS.TextStyle.headline.monospacedDigit())
          Text(verbatim: delta)
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "\(label): \(a) → \(b) \(r.unit), \(delta)"))
  }
}

/// Hàng viên xuống dòng tự do, căn giữa (`flexWrap: 'wrap'`,
/// `justifyContent: 'center'`): không viên nào bị mép màn cắt.
struct FlowRows: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    let rows = Self.rows(subviews, width: width, spacing: spacing)
    let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(0, rows.count - 1))
    let used = rows.map(\.width).max() ?? 0
    return CGSize(width: proposal.width ?? used, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in Self.rows(subviews, width: bounds.width, spacing: spacing) {
      var x = bounds.minX + (bounds.width - row.width) / 2
      for i in row.items {
        let size = subviews[i].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
        let w = min(size.width, bounds.width)
        subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: w, height: size.height))
        x += w + spacing
      }
      y += row.height + spacing
    }
  }

  struct Row {
    var items: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  static func rows(_ subviews: Subviews, width: CGFloat, spacing: CGFloat) -> [Row] {
    var rows: [Row] = []
    var row = Row()
    for i in subviews.indices {
      let size = subviews[i].sizeThatFits(ProposedViewSize(width: width, height: nil))
      let w = min(size.width, width)
      let next = row.items.isEmpty ? w : row.width + spacing + w
      if !row.items.isEmpty, next > width {
        rows.append(row)
        row = Row()
      }
      row.width = row.items.isEmpty ? w : row.width + spacing + w
      row.height = max(row.height, size.height)
      row.items.append(i)
    }
    if !row.items.isEmpty { rows.append(row) }
    return rows
  }
}
