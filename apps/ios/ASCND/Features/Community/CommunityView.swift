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
  var body: some View {
    NavigationStack { CommunityScreen() }
  }
}

/// Nội dung Cộng đồng, không kèm NavigationStack — GĐ3 (Kiệt duyệt 21/10): bỏ khỏi
/// thanh tab, mở từ dòng "Cộng đồng" cuối tab Tiến bộ (đẩy vào ngăn của Tiến bộ).
struct CommunityScreen: View {
  /// Đẩy vào ngăn của Tiến bộ: bảng tin ẩn thanh điều hướng, nên tự có nút quay lại.
  var pushed = false
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityFeedBook?
  @State private var challenges: CommunityChallengesBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityFeedView(book: book, challenges: challenges, showsBack: pushed)
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
    .task {
      guard !built else { return }
      book = services.makeCommunityFeed(userId: flow.today.userId)
      // GĐ2 (Kiệt 21/10, PRODUCT_DECISION_V1 QĐ 5): thử thách cộng đồng ẩn cho tới khi
      // đủ người tham gia — không dựng sổ thì bảng tin không có khối / lối vào nào.
      // Dữ liệu trên server giữ nguyên. Bật lại: dựng lại sổ ở đây.
      challenges = nil
      built = true
    }
    .onChange(of: services.session.session?.userId) { _, id in
      if id != flow.today.userId { book?.close() }
    }
  }
}

struct CommunityFeedView: View {
  let book: CommunityFeedBook
  var challenges: CommunityChallengesBook?
  /// GĐ3: mở từ Tiến bộ (không còn là tab) — nút quay lại ở đầu trang.
  var showsBack = false
  @Environment(\.dismiss) private var dismiss
  @Environment(AppServices.self) private var services
  /// Tin nhắn (15/10) — `nil` khi chưa có nguồn (server chưa có nhắn tin).
  @State private var messages: DMInboxBook?
  @State private var challengeRoute: ChallengeRoute?
  @State private var openAllChallenges = false
  @Environment(\.weightUnit) private var unit
  /// "Tìm người để theo dõi" khi tab Đang theo dõi trống.
  @State private var findPeople = false
  @State private var shareRoute: ShareRoute?
  /// "Thịnh hành" chốt theo mỗi lần tải feed — thích / bỏ thích không làm
  /// bài nhảy chỗ ngay dưới ngón tay.
  @State private var trendIds: [String] = []
  /// Bài đang mở màn bình luận bật lên.
  @State private var commentsFor: OpenPost?

  struct OpenPost: Hashable, Identifiable {
    let id: String
    /// Màn bật lên kèm cả thẻ đầy đủ (từ danh sách Thịnh hành — nơi bài chỉ là một dòng).
    var withPost = false
  }
  /// "Đã thấy" theo tab + đang ở đầu feed (lát 17).
  @State private var ledger = CommunityFeedHold.Ledger()
  @State private var atTop = true
  /// Thanh chọn trang đang ghim (đã cuộn qua đầu trang) → có nền kính.
  @State private var pickerPinned = false
  @State private var swipes = 0
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
        // Thanh "Đang theo dõi / Khám phá" GHIM ở đầu khi cuộn; vuốt ngang trên
        // feed để đổi trang (15/10, chủ dự án).
        LazyVStack(spacing: DS.Spacing.md, pinnedViews: [.sectionHeaders]) {
          topBar
            .id(Self.topId)
          Section {
            if book.phase == .ready { header }
            if book.tab == .discover, let challenges { challengeBlock(challenges) }
            content(hold.shown)
          } header: {
            tabPicker
          }
        }
        .padding(DS.Spacing.md)
      }
      .simultaneousGesture(tabSwipe)
      // MỘT bộ theo dõi cuộn trên ScrollView (hai cái làm `statusBarScrim` ở ngoài
      // không nhận được cuộn — tiêu đề chồng lên đồng hồ).
      .onScrollGeometryChange(for: ScrollMarks.self) { g in
        let y = Double(g.contentOffset.y + g.contentInsets.top)
        return ScrollMarks(atTop: CommunityFeedHold.atTop(y), pinned: y > 64)
      } action: { _, m in
        atTop = m.atTop
        if m.pinned != pickerPinned { withAnimation(DSMotion.animation(.easeOut(duration: 0.2), reduceMotion: reduceMotion)) { pickerPinned = m.pinned } }
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
      trendIds = CommunityLayout.trending(hold.shown, now: EpochMillis(Date())).map(\.id)
    }
    .sensoryFeedback(.selection, trigger: released)
    // Đầu trang trong nội dung như Hôm nay / Tập luyện (thiết kế lại 14/10).
    .toolbar(.hidden, for: .navigationBar)
    .statusBarScrim()
    .background { TodayAmbient(accent: nil) }
    .communityUserLinks()
    .communityPostActions(userId: book.userId, host: book)
    .navigationDestination(isPresented: $findPeople) { CommunitySearchScreen() }
    .environment(\.openCommunityComments) { commentsFor = OpenPost(id: $0.id) }
    .sheet(item: $commentsFor) { p in
      // Feed không còn đẩy sang màn bài (15/10, chủ dự án: "màn này giờ thừa rồi
      // gỡ đi") — thẻ đã đủ thông tin; chạm thẻ / nút bình luận mở màn bật lên.
      CommunityCommentsSheet(postId: p.id, showsPost: p.withPost) { Task { await book.load() } }
    }
    .navigationDestination(item: $shareRoute) { route in
      switch route {
      case .workout: CommunityShareWorkoutScreen { Task { await book.load() } }
      case .progress: CommunityShareProgressScreen { Task { await book.load() } }
      case .recipe: CommunityShareRecipeScreen { Task { await book.load() } }
      }
    }
    .task { if book.phase == .loading { await book.load() } }
    .task {
      if messages == nil, let src = services.makeDirectMessages() {
        let m = DMInboxBook(userId: book.userId, source: src)
        messages = m
        await m.load()
      }
    }
    .task { if challenges?.phase == .loading { await loadChallenges() } }
    .navigationDestination(item: $challengeRoute) { route in
      if let challenges { CommunityChallengeView(book: challenges, id: route.id, fromAll: route.fromAll) }
    }
    .navigationDestination(isPresented: $openAllChallenges) {
      if let challenges { CommunityChallengesView(book: challenges) }
    }
    .refreshable {
      await book.load()
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

  /// "Cộng đồng" lớn + nút tin nhắn. Chuông chuyển về trang Hôm nay thành mục
  /// Thông báo của cả app, nút hồ sơ bỏ (16/10, chủ dự án).
  private var topBar: some View {
    HStack(spacing: DS.Spacing.sm) {
      if showsBack {
        Button { dismiss() } label: { roundIcon("chevron.left", dot: false) }
          .buttonStyle(TodayPressStyle())
          .accessibilityLabel(Text("common.back"))
      }
      Text(String(localized: "tab.community"))
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      // Chỉ khi hộp thư đọc được (server có nhắn tin) — không thì một nút dẫn tới màn lỗi.
      if let messages, messages.phase == .ready {
        NavigationLink { MessagesInboxView(book: messages) } label: {
          roundIcon("paperplane", dot: messages.unreadCount > 0)
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("dm.title"))
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
      composeRow
    }
  }

  /// Đăng bài (15/10, chủ dự án: "thêm nút đăng bài hiện chưa có" — ba viên màu
  /// trước đây trông như bộ lọc): hàng "Hôm nay bạn tập gì?" kiểu Threads, cả hàng
  /// là một menu chọn loại bài (không thêm "+" ở đầu trang — tiêu đề sẽ xuống dòng).
  private var composeRow: some View {
    Menu {
      postMenu
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        MascotAvatar(mascotId: book.posts.first { $0.mine }?.author?.mascotId, size: 36)
        Text("community.compose.prompt")
          .font(.system(size: 15))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
        Spacer(minLength: 0)
        Image(systemName: "plus")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(DS.Color.background.swiftUI)
          .frame(width: 34, height: 34)
          .background(DS.Color.foreground.swiftUI, in: Circle())
      }
      .padding(.leading, 8)
      .padding(.trailing, 6)
      .frame(height: 50)
      .background(DS.Color.card.swiftUI, in: Capsule())
      .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75) }
      .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text("community.compose"))
  }

  /// Ba loại bài — mỗi loại một màn đăng riêng (lát 11–13).
  @ViewBuilder private var postMenu: some View {
    Button { shareRoute = .workout } label: {
      Label(String(localized: "community.share.chip.workout"), systemImage: PostArtView.glyph(.workout))
    }
    Button { shareRoute = .progress } label: {
      Label(String(localized: "community.share.chip.progress"), systemImage: PostArtView.glyph(.progress))
    }
    Button { shareRoute = .recipe } label: {
      Label(String(localized: "community.share.chip.recipe"), systemImage: PostArtView.glyph(.recipe))
    }
  }

  struct ScrollMarks: Equatable {
    let atTop: Bool
    let pinned: Bool
  }

  /// Thanh chọn trang + tìm kiếm (15/10, chủ dự án: đầu trang có 4 nút, đưa tìm
  /// kiếm vào chỗ khác cho gọn) — thanh ghim khi cuộn nên tìm kiếm luôn trong tầm tay.
  private var tabPicker: some View {
    HStack(spacing: DS.Spacing.sm) {
      Picker(selection: Binding(get: { book.tab }, set: { t in Task { await book.select(t) } })) {
        Text("community.tab.following").tag(CommunityFeed.Tab.following)
        Text("community.tab.discover").tag(CommunityFeed.Tab.discover)
      } label: {
        Text("tab.community")
      }
      .pickerStyle(.segmented)
      NavigationLink { CommunitySearchScreen() } label: {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 36, height: 36)
          .background(DS.Color.foreground.swiftUI.opacity(0.07), in: Circle())
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityLabel(Text("community.search.open"))
    }
    .padding(.vertical, DS.Spacing.xs)
    .background {
      // nền kính chỉ khi đã ghim — ở đầu trang thanh nằm trên nền như cũ
      Rectangle()
        .fill(.bar)
        .overlay { DS.Color.background.swiftUI.opacity(0.75) }
        .padding(.horizontal, -DS.Spacing.md)
        .padding(.top, -80)
        .opacity(pickerPinned ? 1 : 0)
    }
    .sensoryFeedback(.selection, trigger: swipes)
  }

  /// Vuốt ngang rõ ràng (không phải cuộn dọc) trên danh sách bài: trái → Khám phá,
  /// phải → Đang theo dõi.
  private var tabSwipe: some Gesture {
    DragGesture(minimumDistance: 24).onEnded { v in
      let dx = v.translation.width
      let dy = v.translation.height
      guard abs(dx) > 70, abs(dx) > abs(dy) * 1.6 else { return }
      let next: CommunityFeed.Tab = dx < 0 ? .discover : .following
      guard next != book.tab else { return }
      swipes += 1
      Task { await book.select(next) }
    }
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
      // Feed kiểu Apple News pha Instagram (15/10): "Thịnh hành" đánh số ở
      // Khám phá, rồi nhịp thẻ lớn → thẻ hàng → lưới (`CommunityLayout`).
      // Chạm một lần mở bài + bình luận (`community-post`).
      //
      // Một khối "Thịnh hành" (15/10, chủ dự án chọn): bài của server — 7 ngày, xếp
      // theo thử / lưu / bình luận (trước là thẻ "Hữu ích tuần này" riêng); server
      // chưa có bài nào đủ điểm thì xếp 72 giờ trên các bài đã tải như cũ.
      let trend: [CommunityFeed.Post] =
        book.tab != .discover ? []
        : !book.useful.isEmpty ? Array(book.useful.prefix(3))
        : trendIds.compactMap { id in shown.first { $0.id == id } }
      let rest = shown.filter { p in !trend.contains { $0.id == p.id } }
      let slots = CommunityLayout.slots(rest)
      if let first = trend.first {
        NewsSectionTitle(title: String(localized: "community.trending"), tint: NewsPalette.trending)
        HeroPostCard(post: first, artURL: first.art.flatMap(book.artURL), unit: unit) { commentsFor = OpenPost(id: first.id) }
        if trend.count > 1 {
          TrendingList(posts: Array(trend.dropFirst()), start: 2) { commentsFor = OpenPost(id: $0.id, withPost: true) }
        }
        if !slots.isEmpty { NewsSectionTitle(title: String(localized: "community.foryou")) }
      }
      ForEach(slots) { slot in
        slotView(slot)
          .onAppear { if slot.id == slots.last?.id { Task { await book.loadMore() } } }
      }
      footer
    }
  }

  @ViewBuilder private func slotView(_ slot: CommunityLayout.Slot) -> some View {
    switch slot {
    case .hero(let p):
      HeroPostCard(post: p, artURL: p.art.flatMap(book.artURL), unit: unit) { commentsFor = OpenPost(id: p.id) }
    case .row(let p):
      RowPostCard(post: p, artURL: p.art.flatMap(book.artURL), unit: unit) { commentsFor = OpenPost(id: p.id) }
    case .grid(let a, let b):
      HStack(alignment: .top, spacing: DS.Spacing.md) {
        tappable(a) { GridPostCard(post: a, artURL: a.art.flatMap(book.artURL), unit: unit) }
        tappable(b) { GridPostCard(post: b, artURL: b.art.flatMap(book.artURL), unit: unit) }
      }
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  /// Thẻ lưới không có nút ở đáy — chạm cả thẻ mở bài.
  private func tappable<Card: View>(_ post: CommunityFeed.Post, @ViewBuilder _ card: () -> Card) -> some View {
    card()
      .onTapGesture { commentsFor = OpenPost(id: post.id) }
      .accessibilityAddTraits(.isButton)
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

// MARK: - Thẻ bài (thiết kế lại 15/10 — chủ dự án: "thiên về bài đăng, kiểu
// Apple mà vẫn có yếu tố gym aesthetics")
//
// Một BÀI ĐĂNG trên mặt trắng: ai · khi nào, dòng loại bài; lời người đăng
// đứng TRƯỚC (chữ lớn); rồi tệp đính kèm. Chất phòng tập nằm ở tệp đính kèm
// của buổi tập — một "bảng điểm" than, số lớn đậm, nhãn chữ hoa giãn, viên PR
// vàng. Tiến bộ / công thức là mặt lõm sáng, số lớn, màu loại bài chỉ ở nhãn.

/// Màu của loại bài.
enum PostTint {
  /// Mặt đặc (nút chia sẻ, ô Hữu ích, vòng "Đang tập hôm nay").
  static func fill(_ k: CommunityFeed.Kind) -> Color {
    switch k {
    case .workout: DS.Color.metricRose.solid
    case .progress: DS.Color.metricSteel.solid
    case .recipe: DS.Color.metricOrange.solid
    }
  }

  /// Nhãn / nét trên mặt sáng (đổi theo chế độ).
  static func ink(_ k: CommunityFeed.Kind) -> Color {
    switch k {
    case .workout: DS.Color.metricRose.swiftUI
    case .progress: DS.Color.metricSteel.swiftUI
    case .recipe: DS.Color.metricOrange.swiftUI
    }
  }

  /// "Bảng điểm" của buổi tập — than ấm cố định ở mọi chế độ.
  static let board = Color(red: 0.11, green: 0.105, blue: 0.10)
  /// Chữ phụ trên mặt màu / bảng điểm.
  static let soft = Color.white.opacity(0.62)
  /// Mặt lõm trên mặt màu.
  static let inset = Color.white.opacity(0.14)
}

struct PostCardView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  /// Màn chi tiết (`full` của RN): mọi bài tập / nguyên liệu thay vì ba.
  var full = false
  /// Số bình luận đang biết ở màn chi tiết (gồm câu mình vừa gửi).
  var commentCount: Int?
  /// Bản vẽ để xuất ảnh chia sẻ (15/10): không nút, đáy là dải thương hiệu.
  var forShare = false
  /// Xem trước ở màn đăng bài (15/10, chủ dự án: "nút tim và bình luận không nên
  /// xuất hiện trong mục đăng bài"): không có hàng tim / bình luận / lưu.
  var preview = false
  @Environment(\.communityPostActions) private var actions
  /// Tim lớn giữa thẻ khi chạm hai lần để thích.
  @State private var burst = 0
  @State private var showsBurst = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      PostHeaderView(post: post)
      if !post.caption.isEmpty {
        Text(verbatim: post.caption)
          .font(.system(size: 16))
          .lineSpacing(2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if artURL != nil, !forShare {
        PostArtView(kind: post.kind, url: artURL, alt: post.art.map(Self.alt))
      }
      switch post.kind {
      case .workout: WorkoutPostBody(workout: post.workout, unit: unit, full: full)
      case .progress: if let p = post.progress { ProgressPostBody(progress: p, unit: unit) }
      case .recipe: if let r = post.recipe { RecipePostBody(recipe: r, full: full) }
      }
      if !forShare, post.kind == .recipe, let add = actions?.addToMeal, (post.recipe?.kcal ?? 0) > 0 {
        PostAction(title: String(localized: "community.addtomeal"), symbol: "plus", tint: DS.Color.foreground.swiftUI) {
          add(post)
        }
      }
      if !forShare, post.kind == .workout, let tryIt = actions?.tryWorkout,
        CommunityTry.offered(post) || CommunityTry.redo(post)
      {
        TryWorkoutButton(
          busy: actions?.trying.contains(post.id) ?? false, tint: DS.Color.foreground.swiftUI, redo: CommunityTry.redo(post)
        ) {
          tryIt(post)
        }
      }
      Group {
        if forShare {
          HStack(spacing: 6) {
            Image("BrandMark").resizable().interpolation(.high).frame(width: 16, height: 16)
            Text(String(localized: "brand.name")).font(.system(size: 13, weight: .heavy)).tracking(1.5)
            Spacer(minLength: 0)
            Text(String(localized: "community.share.cta")).font(DS.TextStyle.caption)
          }
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minHeight: 32)
        } else if preview {
          EmptyView()
        } else if let actions {
          PostActionsRow(post: post, context: actions, commentCount: commentCount)
        } else {
          PostCountsView(post: post, commentCount: commentCount)
        }
      }
      .padding(.top, -4)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .dsCard()
    .overlay {
      if showsBurst {
        Image(systemName: "heart.fill")
          .font(.system(size: 92))
          .foregroundStyle(DS.Color.readinessRed.swiftUI)
          .shadow(color: .black.opacity(0.2), radius: 12)
          .transition(.scale(scale: 0.4).combined(with: .opacity))
          .accessibilityHidden(true)
      }
    }
    .shadow(color: .black.opacity(forShare ? 0 : 0.05), radius: 10, y: 4)
    // Chạm hai lần để thích (15/10) — chỉ BẬT, không bao giờ bỏ thích; nút tim
    // ở đáy vẫn là lối bật / tắt.
    .onTapGesture(count: 2) { doubleTapLike() }
    .sensoryFeedback(.impact(weight: .medium), trigger: burst)
    .accessibilityAction(named: Text(String(localized: "community.like"))) { doubleTapLike() }
  }

  private func doubleTapLike() {
    guard !forShare, let actions else { return }
    burst += 1
    withAnimation(DSMotion.animation(.spring(duration: 0.35, bounce: 0.5), reduceMotion: reduceMotion)) { showsBurst = true }
    Task {
      try? await Task.sleep(for: .milliseconds(650))
      withAnimation(DSMotion.animation(.easeOut(duration: 0.25), reduceMotion: reduceMotion)) { showsBurst = false }
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

/// Một hành động phụ của bài: viên mảnh, chữ màu loại bài.
private struct PostAction: View {
  let title: String
  let symbol: String
  let tint: Color
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: symbol)
        .font(DS.TextStyle.footnote.weight(.semibold))
        // Viên đặc trung tính (15/10, chủ dự án: "nút thử lại màu đỏ như bị lỗi").
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(tint, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
  }
}

/// "Thử buổi này" (`tryBtn` của RN).
struct TryWorkoutButton: View {
  let busy: Bool
  var tint: Color = DS.Color.foreground.swiftUI
  /// Bài của chính mình: "Thử lại" (không ghi lượt thử).
  var redo = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(
        redo ? String(localized: "community.redo") : String(localized: "community.try"),
        systemImage: "figure.strengthtraining.traditional")
        .font(DS.TextStyle.footnote.weight(.semibold))
        // Viên đặc trung tính (15/10, chủ dự án: "nút thử lại màu đỏ như bị lỗi").
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(tint, in: Capsule())
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

  /// Ai · khi nào; dòng dưới là loại bài; menu "⋯" (khi màn có ngữ cảnh lệnh).
  var body: some View {
    HStack(alignment: .center, spacing: DS.Spacing.sm) {
      author
      if let actions {
        Button {
          actions.openMenu(post)
        } label: {
          Image(systemName: "ellipsis")
            .font(.body.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
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
      // Tên đặt thẳng lên nút (#527): nhãn gộp của `who` không chắc còn khi nó
      // nằm trong Button, và VoiceOver phải đọc được người sẽ mở.
      .accessibilityLabel(Text(verbatim: whoSpoken))
    } else {
      who
    }
  }

  private var who: some View {
    HStack(spacing: 10) {
      MascotAvatar(mascotId: post.author?.mascotId, size: 38)
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Text(verbatim: post.author?.displayName ?? "—")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
          if post.author?.isOfficial == true {
            Image(systemName: "checkmark.seal.fill")
              .font(.caption)
              .foregroundStyle(DS.Color.metricBlue.swiftUI)
              .accessibilityLabel(Text("community.verified"))
          }
          Text(verbatim: "· \(Self.agoText(post.createdAt))")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Text(verbatim: kindLine)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
  }

  /// Câu VoiceOver của khối tác giả: tên, dấu xác minh, thời gian, loại bài.
  private var whoSpoken: String {
    var parts = [post.author?.displayName ?? "—"]
    if post.author?.isOfficial == true { parts.append(String(localized: "community.verified")) }
    parts.append(Self.agoText(post.createdAt))
    parts.append(kindLine)
    return parts.joined(separator: ", ")
  }

  /// "Buổi tập · Chest day" / "Tiến bộ" / "Công thức · Bún gà" (+ "· Chỉ người theo dõi").
  private var kindLine: String {
    var parts = [KindTag.text(post.kind)]
    switch post.kind {
    case .workout: if let t = post.workout.title, !t.isEmpty { parts.append(t) }
    case .recipe: if let t = post.recipe?.title, !t.isEmpty { parts.append(t) }
    case .progress: break
    }
    if post.followersOnly { parts.append(String(localized: "community.followersonly")) }
    return parts.joined(separator: " · ")
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
      DS.Color.foreground.swiftUI.opacity(0.05)
      Image(systemName: Self.glyph(kind))
        .font(.system(size: 34, weight: .light))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.5))
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
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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

/// Tên loại bài.
enum KindTag {
  static func text(_ k: CommunityFeed.Kind) -> String {
    switch k {
    case .workout: String(localized: "community.workout")
    case .progress: String(localized: "community.kind.progress")
    case .recipe: String(localized: "community.recipe")
    }
  }
}

/// Nhãn chữ hoa giãn — giọng của bảng điểm phòng tập.
private struct CapsLabel: View {
  let text: String
  var color: Color

  var body: some View {
    Text(verbatim: text)
      .font(.system(size: 10, weight: .bold))
      .textCase(.uppercase)
      .tracking(1.4)
      .foregroundStyle(color)
      .lineLimit(1)
  }
}

/// Một số lớn đậm + nhãn chữ hoa.
private struct BoardStat: View {
  let value: String
  let label: String
  var color: Color = .white
  var soft: Color = PostTint.soft

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(verbatim: value)
        .font(.system(size: 28, weight: .heavy).monospacedDigit())
        .tracking(-0.5)
        .foregroundStyle(color)
        .lineLimit(1)
        .minimumScaleFactor(0.55)
      CapsLabel(text: label, color: soft)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

/// Dòng dữ liệu (bài tập / nguyên liệu).
private struct DataLine: View {
  let name: String
  let value: String
  let rule: Bool
  var color: Color
  var soft: Color
  var ruleColor: Color

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Text(verbatim: name).font(DS.TextStyle.footnote).foregroundStyle(color).lineLimit(1)
      Spacer(minLength: 0)
      Text(verbatim: value).font(DS.TextStyle.mono(.footnote)).foregroundStyle(soft)
    }
    .frame(minHeight: 34)
    .overlay(alignment: .top) { if rule { Rectangle().fill(ruleColor).frame(height: 0.5) } }
    .accessibilityElement(children: .combine)
  }
}

/// "PR" — viên vàng.
struct RecordChip: View {
  var body: some View {
    Text(String(localized: "community.pr.short"))
      .font(.system(size: 10, weight: .heavy))
      .tracking(1)
      .foregroundStyle(Color(red: 0.12, green: 0.1, blue: 0.02))
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(DS.Color.readinessYellow.bright, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
      .accessibilityLabel(Text(String(localized: "community.pr")))
  }
}

/// Tách "1.234 kg" thành ("1.234", "kg") cho số lớn.
private func splitUnit(_ s: String) -> (String, String) {
  guard let i = s.lastIndex(of: " ") else { return (s, "") }
  return (String(s[..<i]), String(s[s.index(after: i)...]))
}

/// Buổi tập: "bảng điểm" than — tên buổi chữ hoa, PR, ba số, các bài.
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
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        CapsLabel(text: workout.title ?? String(localized: "community.workout"), color: PostTint.soft)
        Spacer(minLength: 0)
        if workout.pr { RecordChip() }
      }
      HStack(alignment: .top, spacing: 0) {
        if let v = CommunityCard.volumeText(workout.volumeKg, unit: unit, locale: .app) {
          let (n, u) = splitUnit(v)
          BoardStat(value: n, label: String(localized: "community.stat.lifted \(u)"))
        }
        if let m = workout.minutes {
          divider
          BoardStat(value: CommunityCard.number(m), label: String(localized: "community.stat.minutes"))
            .padding(.leading, 12)
        }
        if workout.exerciseCount > 0 {
          divider
          BoardStat(value: CommunityCard.number(workout.exerciseCount), label: String(localized: "community.stat.exercises"))
            .padding(.leading, 12)
        }
      }
      if !workout.exercises.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(lines.enumerated()), id: \.offset) { i, e in
            DataLine(
              name: e.exerciseName, value: CommunityCard.setText(e, unit: unit, locale: .app), rule: true,
              color: .white, soft: PostTint.soft, ruleColor: .white.opacity(0.12))
          }
          if more > 0 {
            DataLine(name: Self.moreText(more), value: "", rule: true, color: PostTint.soft, soft: PostTint.soft,
                     ruleColor: .white.opacity(0.12))
          }
        }
      }
    }
    .padding(14)
    .background(PostTint.board, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }

  private var divider: some View {
    Rectangle().fill(.white.opacity(0.12)).frame(width: 0.75, height: 40)
  }
}

/// Tiến bộ: mặt lõm sáng — nhãn màu thép, tiêu đề, các ô chênh lệch + đường.
struct ProgressPostBody: View {
  let progress: CommunityPayloads.Progress
  let unit: WeightUnit

  static func title(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.progress.title.one \(n)") : String(localized: "community.progress.title.other \(n)")
  }

  var body: some View {
    let tiles = CommunityCard.tiles(progress, unit: unit)
    let ink = PostTint.ink(.progress)
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        CapsLabel(text: Self.title(Int(progress.weeks)), color: ink)
        Spacer(minLength: 0)
        if let lead = tiles.first {
          Text("community.progress.fromto \(lead.startText(locale: .app)) \(lead.endText(locale: .app))")
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
      }
      HStack(alignment: .top, spacing: 12) {
        ForEach(tiles, id: \.kind) { tile($0, ink: ink) }
      }
    }
    .padding(14)
    .background(DS.Color.foreground.swiftUI.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }

  /// Nhãn của một ô (thẻ và chữ chia sẻ dùng chung).
  static func label(_ t: CommunityCard.Tile) -> String {
    switch t.kind {
    case .weight: String(localized: "community.progress.weight")
    case .waist: String(localized: "community.progress.waist")
    case .lift: t.liftName ?? ""
    }
  }

  private func tile(_ t: CommunityCard.Tile, ink: Color) -> some View {
    let label = Self.label(t)
    return VStack(alignment: .leading, spacing: 4) {
      BoardStat(value: t.deltaText(locale: .app), label: label, color: DS.Color.foreground.swiftUI, soft: DS.Color.mutedForeground.swiftUI)
      if t.series.count >= 2 {
        Chart(Array(t.series.enumerated()), id: \.offset) { point in
          LineMark(x: .value("i", point.offset), y: .value("v", point.element))
            .foregroundStyle(ink)
            .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round))
            .interpolationMethod(.monotone)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
        .frame(height: 30)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "\(label): \(t.startText(locale: .app)) → \(t.endText(locale: .app))"))
  }
}

/// Công thức: mặt lõm sáng — nhãn cam, kcal lớn, ba chất, nguyên liệu.
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
    let fg = DS.Color.foreground.swiftUI
    let muted = DS.Color.mutedForeground.swiftUI
    VStack(alignment: .leading, spacing: 10) {
      CapsLabel(text: recipe.title.isEmpty ? String(localized: "community.recipe") : recipe.title, color: PostTint.ink(.recipe))
      HStack(alignment: .top, spacing: 8) {
        BoardStat(value: CommunityCard.grouped(recipe.kcal, locale: .app), label: "kcal", color: fg, soft: muted)
        BoardStat(value: "\(CommunityCard.grouped(recipe.protein, locale: .app))g", label: String(localized: "logMeal.protein"), color: fg, soft: muted)
        BoardStat(value: "\(CommunityCard.grouped(recipe.carbs, locale: .app))g", label: String(localized: "logMeal.carbs"), color: fg, soft: muted)
        BoardStat(value: "\(CommunityCard.grouped(recipe.fat, locale: .app))g", label: String(localized: "logMeal.fat"), color: fg, soft: muted)
      }
      if !recipe.ingredients.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(lines.enumerated()), id: \.offset) { _, x in
            DataLine(name: Self.ingredientName(x), value: Self.kcal(x.kcal), rule: true, color: fg, soft: muted,
                     ruleColor: fg.opacity(0.08))
          }
          if more > 0 {
            DataLine(name: Self.moreText(more), value: "", rule: true, color: muted, soft: muted, ruleColor: fg.opacity(0.08))
          }
        }
      }
    }
    .padding(14)
    .background(DS.Color.foreground.swiftUI.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
