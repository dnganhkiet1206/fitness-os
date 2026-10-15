import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Tab Cộng đồng (#527, lát 1: feed chỉ đọc) — `(tabs)/community.tsx`,
/// `post-card.tsx` + ba thẻ bài, `post-parts.tsx` (đầu thẻ, ảnh), `feed-more.tsx`,
/// `useful-this-week.tsx` @ fac9ac2 trên `CommunityFeedBook`.
///
/// Như RN: hai tab (mặc định Khám phá); nhãn tạm khoá đăng hoặc lời mời tạo hồ
/// sơ (đang đọc / đọc hồ sơ hỏng thì không nói gì); "Hữu ích tuần này" chỉ ở
/// Khám phá, rỗng thì không vẽ; đọc hỏng là thẻ lỗi có thử lại (≠ trống); trống
/// theo tab; trang kế tải khi tới gần đáy, hỏng thì đuôi feed nói ra và thử lại
/// được; thẻ Workout / Tiến trình / Công thức như RN, ba dòng đầu.
///
/// Lát 3: chạm thẻ (hoặc hàng Hữu ích) mở `CommunityPostScreen`.
///
/// Lát 6: thích / lưu / menu "⋯" trên thẻ. Lát 8: kính lúp mở tìm kiếm.
/// Lát 9: chuông mở hộp thông báo (chấm khi có dòng chưa đọc). Lát 11: thẻ
/// soạn bài đầu feed (có hồ sơ, không bị khoá đăng) → chia sẻ buổi tập; lát
/// 12: tiến trình; lát 13: công thức.
///
/// Lát 14: thẻ thử thách nổi bật ở đầu Khám phá + "Tất cả thử thách".
///
/// Lát 17: bài mới về khi đang đọc giữa feed thì bị giữ sau viên "N bài mới"
/// (`CommunityFeedHold`), chạm thì lên đầu và thấy chúng.
///
/// Chưa có (các lát sau, #527): Thêm vào bữa. Ảnh đại diện là hình linh vật thật (`MascotAvatar`).
struct CommunityTab: View {
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityFeedBook?
  @State private var inbox: CommunityInboxBook?
  @State private var challenges: CommunityChallengesBook?
  @State private var built = false

  var body: some View {
    NavigationStack {
      Group {
        if let book {
          CommunityFeedView(book: book, inbox: inbox, challenges: challenges)
        } else if built {
          ContentUnavailableView {
            Label("tab.community", systemImage: "person.2")
          } description: {
            Text("placeholder.building")
          }
        } else {
          DSLoadingView()
        }
      }
      .navigationTitle(Text("tab.community"))
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityFeed(userId: flow.today.userId)
      inbox = services.makeCommunityInbox(userId: flow.today.userId)
      challenges = services.makeCommunityChallenges(userId: flow.today.userId)
      built = true
    }
    .onChange(of: services.session.session?.userId) { _, id in
      if id != flow.today.userId { book?.close() }
    }
  }
}

struct CommunityFeedView: View {
  let book: CommunityFeedBook
  var inbox: CommunityInboxBook?
  var challenges: CommunityChallengesBook?
  @State private var challengeRoute: ChallengeRoute?
  @State private var openAllChallenges = false
  @Environment(\.weightUnit) private var unit
  /// "Tìm người để theo dõi" khi tab Đang theo dõi trống.
  @State private var findPeople = false
  @State private var shareRoute: ShareRoute?
  @State private var openPost: OpenPost?

  struct OpenPost: Hashable, Identifiable { let id: String }
  /// "Đã thấy" theo tab + đang ở đầu feed (lát 17).
  @State private var ledger = CommunityFeedHold.Ledger()
  @State private var atTop = true
  @State private var released = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  enum ShareRoute: Hashable, Identifiable {
    case workout, progress, recipe
    var id: Self { self }
  }

  /// Bài vẽ ra / bài giữ lại (chỉ khi đang ở giữa feed).
  private var hold: (shown: [CommunityFeed.Post], held: [CommunityFeed.Post]) {
    CommunityFeedHold.split(book.posts, tab: book.tab.rawValue, atTop: atTop, ledger: ledger)
  }

  var body: some View {
    let hold = hold
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: DS.Spacing.md) {
          topBar
            .id(Self.topId)
          Picker(selection: Binding(get: { book.tab }, set: { t in Task { await book.select(t) } })) {
            Text("community.tab.following").tag(CommunityFeed.Tab.following)
            Text("community.tab.discover").tag(CommunityFeed.Tab.discover)
          } label: {
            Text("tab.community")
          }
          .pickerStyle(.segmented)
          if book.phase == .ready { header }
          if book.tab == .discover, let challenges { challengeBlock(challenges) }
          if book.tab == .discover, !book.useful.isEmpty { UsefulThisWeekCard(posts: book.useful) }
          content(hold.shown)
        }
        .padding(DS.Spacing.md)
      }
      .onScrollGeometryChange(for: Bool.self) { g in
        CommunityFeedHold.atTop(Double(g.contentOffset.y + g.contentInsets.top))
      } action: { _, top in
        atTop = top
      }
      .overlay(alignment: .top) {
        if book.phase == .ready, !hold.held.isEmpty {
          NewPostsPill(held: hold.held) {
            // mọi bài đang về thành đã thấy NGAY, rồi lên đầu
            released += 1
            ledger.release(book.posts.map(\.id), tab: book.tab.rawValue)
            withAnimation(reduceMotion ? nil : .snappy) { proxy.scrollTo(Self.topId, anchor: .top) }
          }
          .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
        }
      }
    }
    // đã vẽ thì đã thấy — sổ chỉ thêm
    .onChange(of: hold.shown.map(\.id), initial: true) { _, ids in
      if book.phase == .ready { ledger.ack(ids, tab: book.tab.rawValue) }
    }
    .sensoryFeedback(.selection, trigger: released)
    // Đầu trang trong nội dung như Hôm nay / Tập luyện (thiết kế lại 14/10).
    .toolbar(.hidden, for: .navigationBar)
    .statusBarScrim()
    .background { TodayAmbient(accent: nil) }
    .communityUserLinks()
    .communityPostActions(userId: book.userId, host: book)
    .navigationDestination(isPresented: $findPeople) { CommunitySearchScreen() }
    .navigationDestination(item: $openPost) { p in
      CommunityPostScreen(postId: p.id) { Task { await book.load() } }
    }
    .navigationDestination(item: $shareRoute) { route in
      switch route {
      case .workout: CommunityShareWorkoutScreen { Task { await book.load() } }
      case .progress: CommunityShareProgressScreen { Task { await book.load() } }
      case .recipe: CommunityShareRecipeScreen { Task { await book.load() } }
      }
    }
    .task { if book.phase == .loading { await book.load() } }
    .task { if inbox?.phase == .loading { await inbox?.load(lang: AppServices.appLang) } }
    .task { if challenges?.phase == .loading { await loadChallenges() } }
    .navigationDestination(item: $challengeRoute) { route in
      if let challenges { CommunityChallengeView(book: challenges, id: route.id, fromAll: route.fromAll) }
    }
    .navigationDestination(isPresented: $openAllChallenges) {
      if let challenges { CommunityChallengesView(book: challenges) }
    }
    .refreshable {
      await book.load()
      await inbox?.load(lang: AppServices.appLang)
      await loadChallenges()
    }
  }

  /// Lưu hồ sơ xong: đọc lại feed (nhãn mời / tên tác giả trên bài của mình).
  private var profileScreen: some View {
    CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
  }

  /// Hạn chế đăng → nhãn; chưa có hồ sơ → lời mời; chưa biết → im.
  @ViewBuilder private var header: some View {
    if let r = book.restriction {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Text("community.restricted.title")
            .font(DS.TextStyle.title2)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text("community.restricted.notice \(Self.untilText(r.until))")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          if let reason = r.reason, !reason.isEmpty {
            Text("community.restricted.reason \(reason)")
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    } else if book.hasProfile == false {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Text("community.setup.title")
            .font(DS.TextStyle.title2)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text("community.setup.hint")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          NavigationLink {
            profileScreen
          } label: {
            Text("community.setup.cta")
              .font(DS.TextStyle.headline)
              .frame(maxWidth: .infinity, minHeight: 44)
          }
          .buttonStyle(.borderedProminent)
          .buttonBorderShape(.capsule)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    } else if book.hasProfile == true {
      composer
    }
  }

  /// Tổng quan; khi không có thẻ nổi bật thì đọc lịch sử để biết có nên mời
  /// sang trang thử thách không.
  private func loadChallenges() async {
    guard let challenges else { return }
    await challenges.load(lang: AppServices.appLang)
    if challenges.featured == nil { await challenges.loadHistory(lang: AppServices.appLang) }
  }

  /// Thẻ thử thách nổi bật (lát 14); không có thẻ mà đã từng hoàn thành thì
  /// chỉ còn lối "Tất cả thử thách".
  @ViewBuilder private func challengeBlock(_ c: CommunityChallengesBook) -> some View {
    if let ch = c.featured {
      ChallengeHeroCard(book: c, ch: ch, open: { challengeRoute = $0 }, openAll: { openAllChallenges = true })
    } else if !c.history.isEmpty {
      SeeAllChallengesLink { openAllChallenges = true }
    }
  }

  // MARK: - Đầu trang (thiết kế lại 14/10, mock v2)

  /// "Cộng đồng" lớn + nút tròn: tìm, chuông (chấm khi có mới), hồ sơ.
  private var topBar: some View {
    HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "tab.community"))
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      NavigationLink { CommunitySearchScreen() } label: { roundIcon("magnifyingglass", dot: false) }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("community.search.open"))
      if let inbox {
        let hasNew = inbox.hasNew || !(challenges?.pending.isEmpty ?? true)
        NavigationLink { CommunityInboxView(book: inbox, challenges: challenges) } label: { roundIcon("bell", dot: hasNew) }
          .buttonStyle(TodayPressStyle())
          .accessibilityLabel(hasNew ? Text("community.inbox.opennew") : Text("community.inbox.title"))
      }
      if book.hasProfile == true {
        NavigationLink { CommunityUserScreen(targetId: book.userId) } label: { roundIcon("person.crop.circle", dot: false) }
          .buttonStyle(TodayPressStyle())
          .accessibilityLabel(Text("community.user.mine"))
      }
    }
    .padding(.top, DS.Spacing.sm)
  }

  private func roundIcon(_ symbol: String, dot: Bool) -> some View {
    Image(systemName: symbol)
      .font(.body.weight(.semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .frame(width: 40, height: 40)
      .background(Circle().fill(.thinMaterial))
      .overlay(Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
      .overlay(alignment: .topTrailing) {
        if dot {
          Circle().fill(DS.Color.readinessRed.swiftUI).frame(width: 9, height: 9)
            .overlay(Circle().strokeBorder(DS.Color.background.swiftUI, lineWidth: 1.5))
            .offset(x: -2, y: 2)
        }
      }
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(Rectangle())
  }

  /// Có hồ sơ, không bị khoá: "Đang tập hôm nay" (khi có người) + ba nút
  /// chia sẻ màu đặc — mỗi loại bài một màn riêng (lát 11–13).
  private var composer: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      let faces = CommunityToday.faces(book.posts, me: book.userId, now: EpochMillis(Date()), timeZone: .current)
      if !faces.isEmpty { TodayFaces(faces: faces) }
      HStack(spacing: DS.Spacing.sm) {
        shareChip(.workout, "community.share.chip.workout")
        shareChip(.progress, "community.share.chip.progress")
        shareChip(.recipe, "community.share.chip.recipe")
      }
    }
  }

  private func shareChip(_ route: ShareRoute, _ key: String.LocalizationValue) -> some View {
    let kind: CommunityFeed.Kind = switch route {
    case .workout: .workout
    case .progress: .progress
    case .recipe: .recipe
    }
    return Button {
      shareRoute = route
    } label: {
      Label(String(localized: key), systemImage: PostArtView.glyph(kind))
        .font(DS.TextStyle.footnote.weight(.bold))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(PostTint.fill(kind), in: Capsule())
    }
    .buttonStyle(TodayPressStyle())
  }

  private static let topId = "community.feed.top"

  @ViewBuilder private func content(_ shown: [CommunityFeed.Post]) -> some View {
    switch book.phase {
    case .loading:
      DSLoadingView().frame(minHeight: 240)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.load() } }
        .frame(minHeight: 240)
    case .ready where book.posts.isEmpty:
      if book.tab == .following, book.hasProfile == true {
        // Có hồ sơ: gợi ý người ngay tại chỗ, theo dõi một chạm (14/10) —
        // thay vì một nút dẫn sang màn tìm kiếm.
        FollowSuggestionsCard(userId: book.userId, findMore: { findPeople = true }) {
          Task { await book.load() }
        }
      } else if book.tab == .following {
        DSEmptyState(
          systemImage: "person.2", title: String(localized: "community.empty.following"),
          message: String(localized: "community.empty.following.hint"),
          actionTitle: String(localized: "community.opendiscover")
        ) { Task { await book.select(.discover) } }
      } else {
        DSEmptyState(
          systemImage: "person.crop.circle", title: String(localized: "community.empty.discover"),
          message: String(localized: "community.empty.discover.hint"))
      }
    case .ready:
      ForEach(shown) { post in
        // Lát 3: chạm thẻ mở bài + bình luận (`community-post`). Chạm một lần
        // (sau khi chắc không phải chạm hai lần để thích, 15/10) thay cho
        // NavigationLink — link nuốt cú chạm đầu của chạm hai lần.
        PostCardView(post: post, artURL: post.art.flatMap(book.artURL), unit: unit)
          .contentShape(Rectangle())
          .onTapGesture { openPost = OpenPost(id: post.id) }
          .accessibilityAddTraits(.isButton)
          .onAppear { if post.id == book.posts.last?.id { Task { await book.loadMore() } } }
      }
      footer
    }
  }

  @ViewBuilder private var footer: some View {
    if book.loadingMore {
      HStack(spacing: DS.Spacing.sm) {
        ProgressView()
        Text("community.more.loading").font(DS.TextStyle.footnote)
      }
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 44)
      .accessibilityElement(children: .combine)
    } else if book.moreFailed {
      VStack(spacing: DS.Spacing.sm) {
        Text("community.more.failed")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        DSButton(String(localized: "async.retry"), style: .secondary) { Task { await book.loadMore() } }
      }
      .frame(maxWidth: .infinity)
    } else if !book.canLoadMore {
      Text("community.feedend")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
  }

  /// `toLocaleDateString(locale, {day, month: 'short', hour, minute})`.
  static func untilText(_ iso: String) -> String {
    guard let t = EpochMillis(iso8601: iso) else { return iso }
    let d = Date(timeIntervalSince1970: TimeInterval(t.millis) / 1000)
    return d.formatted(Date.FormatStyle().day().month(.abbreviated).hour().minute().locale(.app))
  }
}

// MARK: - Thẻ bài (thiết kế lại 14/10 — chủ dự án chọn mock v2)
//
// Mặt trên ĐẶC MÀU theo loại bài, chữ trắng, số lớn Menlo — màu khớp phần
// tương ứng của app: buổi tập = hồng Tập luyện, tiến bộ = xám thép (cân
// nặng), công thức = cam Bữa ăn. Đáy thẻ là dải sáng chứa thích / bình luận /
// lưu / chia sẻ. Không ảnh thì không chừa khung xám: mặt màu chính là hình.

/// Màu của loại bài (mặt đặc, chữ trắng).
enum PostTint {
  static func fill(_ k: CommunityFeed.Kind) -> Color {
    switch k {
    case .workout: DS.Color.metricRose.solid
    case .progress: DS.Color.metricSteel.solid
    case .recipe: DS.Color.metricOrange.solid
    }
  }

  /// Chữ phụ trên mặt màu.
  static let soft = Color.white.opacity(0.78)
  /// Mặt lõm trên mặt màu.
  static let inset = Color.white.opacity(0.14)
}

struct PostCardView: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  /// Màn chi tiết (`full` của RN): mọi bài tập / nguyên liệu thay vì ba.
  var full = false
  /// Số bình luận đang biết ở màn chi tiết (gồm câu mình vừa gửi).
  var commentCount: Int?
  /// Bản vẽ để xuất ảnh chia sẻ (15/10): không nút, đáy là dải thương hiệu.
  var forShare = false
  @Environment(\.communityPostActions) private var actions
  /// Tim lớn giữa thẻ khi chạm hai lần để thích.
  @State private var burst = 0
  @State private var showsBurst = false

  var body: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        PostHeaderView(post: post)
        if artURL != nil {
          PostArtView(kind: post.kind, url: artURL, alt: post.art.map(Self.alt))
        }
        switch post.kind {
        case .workout: WorkoutPostBody(workout: post.workout, unit: unit, full: full)
        case .progress: if let p = post.progress { ProgressPostBody(progress: p, unit: unit) }
        case .recipe: if let r = post.recipe { RecipePostBody(recipe: r, full: full) }
        }
        if !post.caption.isEmpty {
          Text(verbatim: post.caption)
            .font(DS.TextStyle.body)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        if !forShare, post.kind == .recipe, let add = actions?.addToMeal, (post.recipe?.kcal ?? 0) > 0 {
          Button {
            add(post)
          } label: {
            Label(String(localized: "community.addtomeal"), systemImage: "plus")
              .font(DS.TextStyle.headline)
              .foregroundStyle(PostTint.fill(.recipe))
              .frame(maxWidth: .infinity, minHeight: 46)
              .background(Color.white, in: Capsule())
              .contentShape(Capsule())
          }
          .buttonStyle(TodayPressStyle())
        }
        if !forShare, post.kind == .workout, let tryIt = actions?.tryWorkout, CommunityTry.offered(post) {
          TryWorkoutButton(busy: actions?.trying.contains(post.id) ?? false, tint: PostTint.fill(.workout)) {
            tryIt(post)
          }
        }
      }
      .padding(DS.Spacing.card)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(PostTint.fill(post.kind))
      // Mọi chữ / biểu tượng mặc định trong mặt màu là sáng.
      .environment(\.colorScheme, .dark)

      Group {
        if forShare {
          HStack(spacing: 6) {
            Image(systemName: "triangle.fill").font(.caption2)
            Text(verbatim: "ASCND").font(.system(size: 13, weight: .heavy)).tracking(1.5)
            Spacer(minLength: 0)
            Text(String(localized: "community.share.cta")).font(DS.TextStyle.caption)
          }
          .foregroundStyle(Color(white: 0.15))
          .frame(minHeight: 44)
        } else if let actions {
          PostActionsRow(post: post, context: actions, commentCount: commentCount)
        } else {
          PostCountsView(post: post, commentCount: commentCount)
        }
      }
      .padding(.horizontal, DS.Spacing.card)
      .padding(.vertical, 2)
      .frame(maxWidth: .infinity)
      .background(forShare ? Color.white : DS.Color.card.swiftUI)
    }
    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    .overlay {
      if showsBurst {
        Image(systemName: "heart.fill")
          .font(.system(size: 96))
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.25), radius: 12)
          .transition(.scale(scale: 0.4).combined(with: .opacity))
          .accessibilityHidden(true)
      }
    }
    .shadow(color: .black.opacity(forShare ? 0 : 0.08), radius: 14, y: 6)
    // Chạm hai lần để thích (15/10) — chỉ BẬT, không bao giờ bỏ thích; nút tim
    // ở đáy vẫn là lối bật / tắt.
    .onTapGesture(count: 2) { doubleTapLike() }
    .sensoryFeedback(.impact(weight: .medium), trigger: burst)
    .accessibilityAction(named: Text(String(localized: "community.like"))) { doubleTapLike() }
  }

  private func doubleTapLike() {
    guard !forShare, let actions else { return }
    burst += 1
    withAnimation(.spring(duration: 0.35, bounce: 0.5)) { showsBurst = true }
    Task {
      try? await Task.sleep(for: .milliseconds(650))
      withAnimation(.easeOut(duration: 0.25)) { showsBurst = false }
    }
    if !post.liked {
      Task { _ = await actions.actions.toggle(.like, postId: post.id, host: actions.host) }
    }
  }

  /// Chữ thay ảnh theo ngôn ngữ app (RN: `vi` → `alt_vi`, còn lại `alt_en`).
  static func alt(_ a: CommunityFeed.Art) -> String {
    Locale.app.language.languageCode?.identifier == "vi" ? a.altVi : a.altEn
  }
}

/// "Thử buổi này" (`tryBtn` của RN): viên trắng chữ màu trên mặt màu.
struct TryWorkoutButton: View {
  let busy: Bool
  var tint: Color = DS.Color.foreground.swiftUI
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(String(localized: "community.try"), systemImage: "play.fill")
        .font(DS.TextStyle.headline)
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity, minHeight: 46)
        .background(Color.white, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .disabled(busy)
    .opacity(busy ? 0.6 : 1)
  }
}

struct PostHeaderView: View {
  let post: CommunityFeed.Post
  @Environment(\.openCommunityUser) private var openUser
  @Environment(\.communityPostActions) private var actions

  /// Ai · khi nào · menu "⋯" (khi màn có ngữ cảnh lệnh).
  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      author
      if let actions {
        Button {
          actions.openMenu(post)
        } label: {
          Image(systemName: "ellipsis")
            .font(.body.weight(.semibold))
            .foregroundStyle(PostTint.soft)
            .frame(width: 44, height: 44, alignment: .trailing)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("community.post.more"))
      }
    }
  }

  /// Có tác giả → chạm mở hồ sơ (`ZoomLink` của RN); không có → chỉ là chữ.
  @ViewBuilder private var author: some View {
    if let author = post.author, let openUser {
      Button {
        openUser(author.userId)
      } label: {
        who
      }
      .buttonStyle(.plain)
    } else {
      who
    }
  }

  private var who: some View {
    HStack(spacing: DS.Spacing.sm) {
      MascotAvatar(mascotId: post.author?.mascotId, size: 40)
        .overlay(Circle().strokeBorder(.white.opacity(0.85), lineWidth: 2))
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Text(verbatim: post.author?.displayName ?? "—")
            .font(DS.TextStyle.headline)
            .foregroundStyle(.white)
            .lineLimit(1)
          if post.author?.isOfficial == true {
            Image(systemName: "checkmark.seal.fill")
              .font(.footnote)
              .foregroundStyle(.white)
              .accessibilityLabel(Text("community.verified"))
          }
        }
        Text(verbatim: meta)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(PostTint.soft)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
  }

  private var meta: String {
    let ago = Self.agoText(post.createdAt)
    return post.followersOnly ? "\(ago) · \(String(localized: "community.followersonly"))" : ago
  }

  static func agoText(_ iso: String, now: Date = Date()) -> String {
    switch CommunityPayloads.ago(iso, now: EpochMillis(now)) {
    case .justNow: String(localized: "community.ago.now")
    case .minutes(let n): String(localized: "community.ago.min \(n)")
    case .hours(let n): String(localized: "community.ago.hour \(n)")
    case .days(let n): String(localized: "community.ago.day \(n)")
    case .date(let d): d.formatted(Date.FormatStyle().day().month(.abbreviated).locale(.app))
    case .invalid: ""
    }
  }
}

/// Ảnh minh hoạ 16:9 (chỉ khi bài có ảnh); tải hỏng thì mặt lõm có biểu tượng.
struct PostArtView: View {
  let kind: CommunityFeed.Kind
  let url: URL?
  let alt: String?

  var body: some View {
    ZStack {
      PostTint.inset
      Image(systemName: Self.glyph(kind))
        .font(.system(size: 36, weight: .light))
        .foregroundStyle(.white.opacity(0.5))
        .accessibilityHidden(true)
      if let url {
        AsyncImage(url: url) { phase in
          if let image = phase.image {
            image.resizable().scaledToFill()
              .accessibilityLabel(Text(verbatim: alt ?? ""))
          }
        }
      }
    }
    .aspectRatio(16 / 9, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
    .accessibilityHidden(url == nil)
  }

  static func glyph(_ k: CommunityFeed.Kind) -> String {
    switch k {
    case .workout: "dumbbell"
    case .progress: "chart.line.uptrend.xyaxis"
    case .recipe: "frying.pan"
    }
  }
}

/// Nhãn loại bài nhỏ, chữ hoa, trên mặt màu ("BUỔI TẬP").
private struct KindTag: View {
  let kind: CommunityFeed.Kind

  var body: some View {
    Label(Self.text(kind), systemImage: PostArtView.glyph(kind))
      .font(DS.TextStyle.caption.weight(.bold))
      .textCase(.uppercase)
      .tracking(0.6)
      .foregroundStyle(PostTint.soft)
  }

  static func text(_ k: CommunityFeed.Kind) -> String {
    switch k {
    case .workout: String(localized: "community.workout")
    case .progress: String(localized: "community.kind.progress")
    case .recipe: String(localized: "community.recipe")
    }
  }
}

/// Một số lớn Menlo + nhãn nhỏ dưới.
private struct BigStat: View {
  let value: String
  let label: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: value)
        .font(.system(size: 30, weight: .semibold, design: .monospaced))
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(PostTint.soft)
        .lineLimit(1)
    }
    .accessibilityElement(children: .combine)
  }
}

/// Mặt lõm trong mặt màu chứa dòng dữ liệu.
private struct InsetPanel<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    VStack(spacing: 0) { content }
      .padding(.horizontal, DS.Spacing.md)
      .background(PostTint.inset, in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
  }
}

private struct PanelLine: View {
  let name: String
  let value: String
  let rule: Bool

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Text(verbatim: name).font(DS.TextStyle.body).foregroundStyle(.white).lineLimit(1)
      Spacer(minLength: 0)
      Text(verbatim: value).font(DS.TextStyle.body.monospacedDigit()).foregroundStyle(PostTint.soft)
    }
    .frame(minHeight: 44)
    .overlay(alignment: .top) { if rule { Rectangle().fill(.white.opacity(0.15)).frame(height: 0.5) } }
    .accessibilityElement(children: .combine)
  }
}

/// "Kỷ lục" — viên vàng.
private struct RecordChip: View {
  var body: some View {
    Label(String(localized: "community.pr"), systemImage: "trophy.fill")
      .font(DS.TextStyle.caption.weight(.bold))
      .foregroundStyle(Color(red: 0.25, green: 0.14, blue: 0.01))
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(DS.Color.readinessYellow.bright, in: Capsule())
  }
}

/// Tách "1.234 kg" thành ("1.234", "kg") cho số lớn.
private func splitUnit(_ s: String) -> (String, String) {
  guard let i = s.lastIndex(of: " ") else { return (s, "") }
  return (String(s[..<i]), String(s[s.index(after: i)...]))
}

struct WorkoutPostBody: View {
  let workout: CommunityPayloads.Workout
  let unit: WeightUnit
  var full = false

  /// `{n:exercise|exercises}` của RN: số ít khi n == 1.
  static func moreText(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.moreexercises.one \(n)") : String(localized: "community.moreexercises.other \(n)")
  }

  var body: some View {
    let lines = workout.exercises.prefix(full ? workout.exercises.count : CommunityCard.previewLines)
    let more = workout.exercises.count - lines.count
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .center) {
          KindTag(kind: .workout)
          Spacer(minLength: 0)
          if workout.pr { RecordChip() }
        }
        Text(verbatim: workout.title ?? String(localized: "community.workout"))
          .font(.system(size: 26, weight: .bold))
          .foregroundStyle(.white)
      }
      HStack(alignment: .top, spacing: DS.Spacing.lg) {
        if let v = CommunityCard.volumeText(workout.volumeKg, unit: unit, locale: .app) {
          let (n, u) = splitUnit(v)
          BigStat(value: n, label: String(localized: "community.stat.lifted \(u)"))
        }
        if let m = workout.minutes {
          BigStat(value: CommunityCard.number(m), label: String(localized: "community.stat.minutes"))
        }
        if workout.exerciseCount > 0 {
          BigStat(value: CommunityCard.number(workout.exerciseCount), label: String(localized: "community.stat.exercises"))
        }
      }
      if !workout.exercises.isEmpty {
        InsetPanel {
          ForEach(Array(lines.enumerated()), id: \.offset) { i, e in
            PanelLine(name: e.exerciseName, value: CommunityCard.setText(e, unit: unit), rule: i > 0)
          }
          if more > 0 {
            PanelLine(name: Self.moreText(more), value: "", rule: true)
          }
        }
      }
    }
  }
}

struct ProgressPostBody: View {
  let progress: CommunityPayloads.Progress
  let unit: WeightUnit

  static func title(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.progress.title.one \(n)") : String(localized: "community.progress.title.other \(n)")
  }

  var body: some View {
    let tiles = CommunityCard.tiles(progress, unit: unit)
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 4) {
        KindTag(kind: .progress)
        Text(verbatim: Self.title(Int(progress.weeks)))
          .font(.system(size: 26, weight: .bold))
          .foregroundStyle(.white)
        if let lead = tiles.first {
          Text("community.progress.fromto \(lead.startText) \(lead.endText)")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(PostTint.soft)
        }
      }
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        ForEach(tiles, id: \.kind) { tile($0) }
      }
    }
  }

  /// Nhãn của một ô (thẻ và chữ chia sẻ dùng chung).
  static func label(_ t: CommunityCard.Tile) -> String {
    switch t.kind {
    case .weight: String(localized: "community.progress.weight")
    case .waist: String(localized: "community.progress.waist")
    case .lift: t.liftName ?? ""
    }
  }

  private func tile(_ t: CommunityCard.Tile) -> some View {
    let label = Self.label(t)
    let icon =
      switch t.kind {
      case .weight: "scalemass"
      case .waist: "ruler"
      case .lift: "dumbbell"
      }
    return VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Image(systemName: icon).font(.caption2)
        Text(verbatim: label).font(DS.TextStyle.caption).lineLimit(1)
      }
      .foregroundStyle(PostTint.soft)
      Text(verbatim: t.deltaText)
        .font(.system(size: 22, weight: .semibold, design: .monospaced))
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      if t.series.count >= 2 {
        Chart(Array(t.series.enumerated()), id: \.offset) { point in
          LineMark(x: .value("i", point.offset), y: .value("v", point.element))
            .foregroundStyle(.white)
            .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            .interpolationMethod(.monotone)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
        .frame(height: 30)
      } else {
        Color.clear.frame(height: 30)
      }
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(PostTint.inset, in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "\(label): \(t.startText) → \(t.endText)"))
  }
}

struct RecipePostBody: View {
  let recipe: CommunityPayloads.Recipe
  var full = false

  static func moreText(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.moreingredients.one \(n)") : String(localized: "community.moreingredients.other \(n)")
  }

  var body: some View {
    let lines = recipe.ingredients.prefix(full ? recipe.ingredients.count : CommunityCard.previewLines)
    let more = recipe.ingredients.count - lines.count
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 4) {
        KindTag(kind: .recipe)
        Text(verbatim: recipe.title.isEmpty ? String(localized: "community.recipe") : recipe.title)
          .font(.system(size: 26, weight: .bold))
          .foregroundStyle(.white)
      }
      HStack(alignment: .top, spacing: DS.Spacing.lg) {
        BigStat(value: CommunityCard.grouped(recipe.kcal, locale: .app), label: "kcal")
        BigStat(value: "\(CommunityCard.grouped(recipe.protein, locale: .app))g", label: String(localized: "logMeal.protein"))
        BigStat(value: "\(CommunityCard.grouped(recipe.carbs, locale: .app))g", label: String(localized: "logMeal.carbs"))
        BigStat(value: "\(CommunityCard.grouped(recipe.fat, locale: .app))g", label: String(localized: "logMeal.fat"))
      }
      if !recipe.ingredients.isEmpty {
        InsetPanel {
          ForEach(Array(lines.enumerated()), id: \.offset) { i, x in
            PanelLine(name: Self.ingredientName(x), value: Self.kcal(x.kcal), rule: i > 0)
          }
          if more > 0 {
            PanelLine(name: Self.moreText(more), value: "", rule: true)
          }
        }
      }
    }
  }

  static func kcal(_ v: Double) -> String { "\(CommunityCard.grouped(v, locale: .app)) kcal" }

  /// Khối lượng CHỈ khi biết — dòng gõ tay không có món gốc thì im.
  static func ingredientName(_ x: CommunityPayloads.Ingredient) -> String {
    guard let g = x.grams else { return x.name }
    return "\(x.name)  \(CommunityCard.grouped(g, locale: .app)) g"
  }
}

/// Thích · bình luận · lưu — lát này chỉ đọc (nút thật ở lát tương tác).
struct PostCountsView: View {
  let post: CommunityFeed.Post
  var commentCount: Int?

  var body: some View {
    HStack(spacing: DS.Spacing.lg) {
      count(post.liked ? "heart.fill" : "heart", post.likeCount, String(localized: "community.like"),
            tint: post.liked ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI)
      count("bubble.right", commentCount ?? post.commentCount, String(localized: "community.comment"))
      Spacer(minLength: 0)
      count(post.saved ? "bookmark.fill" : "bookmark", post.saveCount, String(localized: "community.save"),
            tint: post.saved ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
    }
  }

  private func count(_ icon: String, _ n: Int, _ label: String, tint: Color = DS.Color.mutedForeground.swiftUI)
    -> some View
  {
    HStack(spacing: 6) {
      Image(systemName: icon).foregroundStyle(tint)
      if n > 0 {
        Text(verbatim: "\(n)").font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .frame(minHeight: 44)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "\(label), \(n)"))
  }
}

// MARK: - Hữu ích tuần này

struct UsefulThisWeekCard: View {
  let posts: [CommunityFeed.Post]

  /// Hàng thẻ màu trượt ngang (thiết kế lại 14/10): cùng màu theo loại với
  /// thẻ bài — mỗi thẻ: loại, tiêu đề, @tác giả, lý do ("12 người đã thử").
  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        Text("community.useful.title")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Text("community.useful.sub")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 4)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: DS.Spacing.sm) {
          ForEach(posts) { p in
            NavigationLink {
              CommunityPostScreen(postId: p.id)
            } label: {
              tile(p)
            }
            .buttonStyle(TodayPressStyle())
          }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
      }
      .scrollClipDisabled()
    }
  }

  private func tile(_ p: CommunityFeed.Post) -> some View {
    let title = CommunityCard.usefulTitle(p) ?? Self.fallback(p.kind)
    let who = p.author.map { "@\($0.handle)" } ?? ""
    let why = CommunityCard.reasons(p).map(Self.reason).joined(separator: " · ")
    return VStack(alignment: .leading, spacing: 6) {
      Image(systemName: PostArtView.glyph(p.kind))
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: 30, height: 30)
        .background(.white.opacity(0.18), in: Circle())
        .accessibilityHidden(true)
      Text(verbatim: title)
        .font(DS.TextStyle.headline)
        .foregroundStyle(.white)
        .lineLimit(2)
        .multilineTextAlignment(.leading)
      Spacer(minLength: 0)
      if !why.isEmpty {
        Text(verbatim: why)
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
      }
      if !who.isEmpty {
        Text(verbatim: who).font(DS.TextStyle.caption).foregroundStyle(PostTint.soft).lineLimit(1)
      }
    }
    .padding(DS.Spacing.md)
    .frame(width: 176, height: 150, alignment: .topLeading)
    .background(PostTint.fill(p.kind), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: [title, who, why].filter { !$0.isEmpty }.joined(separator: ", ")))
  }

  static func fallback(_ k: CommunityFeed.Kind) -> String {
    switch k {
    case .workout: String(localized: "community.useful.training")
    case .recipe: String(localized: "community.useful.recipe")
    case .progress: String(localized: "community.useful.progress")
    }
  }

  static func reason(_ r: CommunityCard.Reason) -> String {
    switch r {
    case .tries(let n):
      n == 1 ? String(localized: "community.useful.tries.one \(n)") : String(localized: "community.useful.tries.other \(n)")
    case .saves(let n):
      n == 1 ? String(localized: "community.useful.saves.one \(n)") : String(localized: "community.useful.saves.other \(n)")
    case .comments(let n):
      n == 1
        ? String(localized: "community.useful.comments.one \(n)") : String(localized: "community.useful.comments.other \(n)")
    case .likes(let n):
      n == 1 ? String(localized: "community.useful.likes.one \(n)") : String(localized: "community.useful.likes.other \(n)")
    }
  }
}

/// Viên "N bài mới" (`new-posts-pill.tsx`): mũi tên lên, tối đa ba gương mặt
/// của người vừa đăng, con số. Nổi ở đầu feed.
private struct NewPostsPill: View {
  let held: [CommunityFeed.Post]
  let action: () -> Void

  var body: some View {
    let n = held.count
    Button(action: action) {
      HStack(spacing: DS.Spacing.xs) {
        Image(systemName: "arrow.up").font(DS.TextStyle.footnote.weight(.bold))
        HStack(spacing: -6) {
          ForEach(CommunityFeedHold.faces(held), id: \.userId) { a in
            MascotAvatar(mascotId: a.mascotId, size: 22)
              .overlay(Circle().strokeBorder(DS.Color.primary.swiftUI, lineWidth: 1.5))
          }
        }
        Text(n == 1 ? String(localized: "community.newposts.one \(n)") : String(localized: "community.newposts.other \(n)"))
          .font(DS.TextStyle.footnote.weight(.semibold))
      }
      .foregroundStyle(DS.Color.primaryForeground.swiftUI)
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 44)
      .background(DS.Color.primary.swiftUI, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .padding(.top, DS.Spacing.sm)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      Text(n == 1 ? String(localized: "community.newposts.a11y.one \(n)") : String(localized: "community.newposts.a11y.other \(n)")))
    .accessibilityAddTraits(.isButton)
  }
}

/// "Đang tập hôm nay": người đăng bài trong ngày, vòng màu theo loại bài mới
/// nhất của họ; chạm mở hồ sơ. Chỉ từ bài đang có trong feed.
private struct TodayFaces: View {
  let faces: [CommunityToday.Face]
  @Environment(\.openCommunityUser) private var openUser

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "community.today.title"))
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.horizontal, 4)
        .accessibilityAddTraits(.isHeader)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: DS.Spacing.md) {
          ForEach(faces) { f in
            Button {
              openUser?(f.author.userId)
            } label: {
              VStack(spacing: 4) {
                MascotAvatar(mascotId: f.author.mascotId, size: 50)
                  .padding(3)
                  .overlay(Circle().strokeBorder(PostTint.fill(f.kind), lineWidth: 3))
                Text(verbatim: f.author.displayName.split(separator: " ").last.map(String.init) ?? f.author.displayName)
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .lineLimit(1)
                  .frame(maxWidth: 64)
              }
            }
            .buttonStyle(TodayPressStyle())
            .accessibilityLabel(Text(verbatim: f.author.displayName))
          }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
      }
      .scrollClipDisabled()
    }
  }
}

/// Bảng tin "Đang theo dõi" trống (14/10): gợi ý người (`community_follow_
/// suggestions`, cùng nguồn với màn tìm kiếm), nút Theo dõi tại chỗ; theo dõi
/// được ai thì "Xem bảng tin" đọc lại feed.
private struct FollowSuggestionsCard: View {
  let userId: String
  let findMore: () -> Void
  let showFeed: () -> Void
  @Environment(AppServices.self) private var services
  @Environment(\.openCommunityUser) private var openUser
  @State private var book: CommunitySearchBook?
  @State private var followed: Set<String> = []
  @State private var message: String?

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 4) {
        Text("community.empty.following")
          .font(DS.TextStyle.title2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text("community.suggest.lead")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 4)
      if let book, book.suggestionsPhase == .ready, !book.suggestions.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(book.suggestions.prefix(5).enumerated()), id: \.element.id) { i, p in
            if i > 0 { Divider().padding(.leading, 68).opacity(0.5) }
            row(p, book: book)
          }
        }
        .todayCard()
      } else if book?.suggestionsPhase == .loading || book == nil {
        ProgressView().frame(maxWidth: .infinity, minHeight: 88)
      }
      if !followed.isEmpty {
        Button(action: showFeed) {
          Label(String(localized: "community.suggest.showfeed"), systemImage: "arrow.down")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.primaryForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(DS.Color.primary.swiftUI, in: Capsule())
        }
        .buttonStyle(TodayPressStyle())
      }
      Button(action: findMore) {
        Label(String(localized: "community.search.find"), systemImage: "magnifyingglass")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .buttonStyle(.plain)
    }
    .task {
      if book == nil { book = services.makeCommunitySearch(userId: userId, mode: .people) }
      await book?.loadSuggestions()
    }
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  private func row(_ p: CommunitySearch.Person, book: CommunitySearchBook) -> some View {
    let on = p.iFollow
    let label = on ? String(localized: "community.user.unfollowstate") : String(localized: "community.user.follow")
    return HStack(spacing: DS.Spacing.sm) {
      Button {
        openUser?(p.author.userId)
      } label: {
        HStack(spacing: DS.Spacing.sm) {
          MascotAvatar(mascotId: p.author.mascotId, size: 44)
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: p.author.displayName)
              .font(DS.TextStyle.body.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1)
            Text(verbatim: CommunitySearchView.whyText(CommunitySearch.why(p)))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(verbatim: p.author.displayName))
      Button {
        Task {
          switch await book.follow(p.author.userId, on: !on) {
          case .failed(let f): message = CommunityPostView.failureText(f)
          case .done: if !on { followed.insert(p.author.userId) } else { followed.remove(p.author.userId) }
          default: break
          }
        }
      } label: {
        Text(verbatim: label)
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(on ? DS.Color.foreground.swiftUI : DS.Color.primaryForeground.swiftUI)
          .padding(.horizontal, DS.Spacing.md)
          .frame(minHeight: 36)
          .background(on ? DS.Color.secondary.swiftUI : DS.Color.primary.swiftUI, in: Capsule())
          .frame(minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(book.following.contains(p.author.userId))
      .sensoryFeedback(.selection, trigger: on)
      .accessibilityLabel(Text(verbatim: "\(label) \(p.author.displayName)"))
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
  }
}
