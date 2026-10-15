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
/// Hồ sơ của mình: Sửa hồ sơ · Quyền riêng tư (lát 10), Đã lưu (lát 7).
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
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var awards: AwardsBook?
  @State private var streak: Int?
  @State private var showsAwards = false
  /// Nhắn tin (15/10) — chỉ khi có nguồn; mở hội thoại với người này.
  @State private var dm: DMInboxBook?
  @State private var dmThread: DirectMessages.Thread?
  @Environment(\.dismiss) private var dismiss
  @State private var menuOpen = false
  @State private var confirmBlock = false
  @State private var message: String?
  @State private var taps = 0
  @State private var openPost: String?
  /// Một trang Hồ sơ (15/10, chủ dự án chọn "Một trang Hồ sơ"): hồ sơ của mình
  /// mang luôn mục tiêu tập (trước ở Cài đặt) và bánh răng mở Cài đặt.
  @Environment(ProfileBook.self) private var fitness: ProfileBook?
  @State private var showsSettings = false
  @State private var editingGoals = false

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    // Nền như feed; tiêu đề trống (handle đã nằm trong thẻ).
    .background { TodayAmbient(accent: nil) }
    .statusBarScrim()
    .navigationTitle(Text(verbatim: ""))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if book.isMe {
        ToolbarItem(placement: .topBarTrailing) {
          Button { showsSettings = true } label: {
            Image(systemName: "gearshape")
              .frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text("settings.title"))
        }
      }
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
    .sheet(isPresented: $showsSettings) { SettingsSheet() }
    .sheet(isPresented: $editingGoals) {
      if let fitness { EditProfileView(book: fitness) }
    }
    .refreshable { await book.load() }
    .communityPostSheet(Binding(get: { openPost.map { CommunityPostSheetRoute(id: $0) } }, set: { openPost = $0?.id }))
    .navigationDestination(isPresented: $showsAwards) {
      if let awards { AwardsView(book: awards, lang: services.preferences.lang) }
    }
    .task(id: book.isMe) { await loadMine() }
    .task(id: book.profile?.displayName) { await syncName() }
    .task {
      if dm == nil, let src = services.makeDirectMessages() { dm = DMInboxBook(userId: book.userId, source: src) }
    }
    .navigationDestination(item: $dmThread) { t in
      if let dm { ConversationScreen(inbox: dm, thread: t) }
    }
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
    case .gone where book.isMe:
      // Của mình mà chưa tạo hồ sơ cộng đồng: trang Hồ sơ vẫn có mục tiêu + tập luyện.
      heading
      createLink
      goals
      training
    case .gone:
      DSEmptyState(systemImage: "person.crop.circle.badge.questionmark", title: String(localized: "community.user.gone"))
    case .ready:
      if let p = book.profile {
        // Tiêu đề lớn trong nội dung như "Cộng đồng" (15/10, chủ dự án: "tiêu đề của
        // trang này chưa có").
        heading
        hero(p)
        primaryAction(p)
        if book.isMe {
          goals
          training
        }
        about(p)
        if !book.posts.isEmpty || book.showsKindRow {
          sectionTitle(String(localized: "community.pass.poststitle"))
        }
        if book.showsKindRow { kindRow }
        if book.showsJourney, let j = book.journey, !j.lines.isEmpty { JourneyCard(journey: j, unit: unit) }
        if let until = book.mutedUntil { mutedCard(p, until: until) }
        posts
      }
    }
  }

  // MARK: - Đầu trang

  private var heading: some View {
    Text("community.user.heading")
      .font(.largeTitle.bold())
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .accessibilityAddTraits(.isHeader)
  }

  /// Chưa có hồ sơ cộng đồng: một nút đặc tạo hồ sơ (tên, linh vật, giới thiệu).
  private var createLink: some View {
    NavigationLink {
      CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
    } label: {
      Text("profile.community.create")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(DS.Color.foreground.swiftUI, in: Capsule())
    }
    .buttonStyle(.plain)
  }

  // MARK: - Mục tiêu (chỉ mình thấy)

  /// Mục tiêu ngày · mục tiêu · trình độ (`settings.tsx:350`, trước ở Cài đặt) —
  /// chạm để sửa. Không công khai: chỉ hiện trên hồ sơ của mình.
  @ViewBuilder private var goals: some View {
    if let fitness {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(alignment: .firstTextBaseline) {
          sectionTitle(String(localized: "profile.goals"))
          Spacer(minLength: 0)
          Label("profile.goals.private", systemImage: "lock.fill")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Button { editingGoals = true } label: {
          VStack(spacing: 10) {
            goalRow("ep.dailyTarget", fitness.profile?.tdeeTargetKcal.map {
              "\(Int(($0 + 0.5).rounded(.down)).formatted(.number.locale(.app))) kcal"
            } ?? "—")
            Divider()
            goalRow("ep.goal", EditProfileView.label(EditProfileView.goals, fitness.profile?.goal))
            Divider()
            goalRow("ep.level", EditProfileView.label(EditProfileView.levels, fitness.profile?.trainingLevel))
          }
          .padding(14)
          .dsCard()
          .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text("ep.open.hint"))
      }
    }
  }

  private func goalRow(_ key: LocalizedStringKey, _ value: String) -> some View {
    HStack {
      Text(key).font(.system(size: 15)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Spacer(minLength: DS.Spacing.sm)
      Text(verbatim: value).font(.system(size: 15, weight: .semibold)).foregroundStyle(DS.Color.foreground.swiftUI)
    }
  }

  private func hero(_ p: CommunityFeed.Author) -> some View {
    AthletePassCard(
      author: p, posts: book.stats?.posts ?? book.posts.count, followers: book.followers, following: book.following,
      tries: book.stats?.tries ?? 0
    ) {
      // Của mình: chạm avatar → sửa hồ sơ (đổi linh vật / tên / tiểu sử).
      if book.isMe {
        NavigationLink {
          CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
        } label: {
          PassAvatar(author: p)
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("community.user.edit"))
      } else {
        PassAvatar(author: p)
      }
    }
    .padding(.top, DS.Spacing.xs)
  }

  // MARK: - Tập luyện của chính mình

  /// Chuỗi ngày (như viên 🔥 ở Hôm nay) · buổi tháng này · buổi có kỷ lục; nhịp tập
  /// 28 ngày; huy chương. Chỉ trên hồ sơ của mình — số của người khác cần server.
  @ViewBuilder private var training: some View {
    let s = ProfileTraining.summary(flow.history?.entries ?? [], now: EpochMillis(Date()), timeZone: .current)
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      sectionTitle(String(localized: "community.pass.training"))
      HStack(spacing: DS.Spacing.sm) {
        trainingTile(
          streak.map { "\($0)" } ?? "—", label: String(localized: "community.pass.streak"), symbol: "flame.fill",
          tint: DS.Color.metricOrange.swiftUI)
        trainingTile(
          "\(s.sessionsThisMonth)", label: String(localized: "community.pass.month"), symbol: "dumbbell.fill",
          tint: DS.Color.metricRose.swiftUI)
        trainingTile(
          "\(s.prSessions)", label: String(localized: "community.pass.prs"), symbol: "trophy.fill",
          tint: DS.Color.readinessYellow.swiftUI)
      }
      .fixedSize(horizontal: false, vertical: true)
      RhythmCard(days: s.rhythm)
      if let awards {
        RecentAwardsCard(book: awards, lang: services.preferences.lang) { showsAwards = true }
      }
    }
  }

  private func trainingTile(_ value: String, label: String, symbol: String, tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: symbol).font(.system(size: 13, weight: .bold)).foregroundStyle(tint)
      Text(verbatim: value)
        .font(.system(size: 26, weight: .heavy).monospacedDigit()).fontWidth(.condensed)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(verbatim: label)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(2).minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(12)
    .dsCard()
    .accessibilityElement(children: .combine)
  }

  /// Một tên (15/10, gộp tên): hồ sơ của mình có tên cộng đồng khác tên hồ sơ tập
  /// (tài khoản cũ) → hồ sơ tập theo tên cộng đồng — tên công khai là tên chính.
  private func syncName() async {
    guard book.isMe, let shown = book.profile?.displayName, let fitness, fitness.loaded,
      fitness.profile?.name != shown
    else { return }
    try? await fitness.saveName(shown)
  }

  /// Nạp chuỗi ngày + huy chương (chỉ hồ sơ của mình).
  private func loadMine() async {
    guard book.isMe, awards == nil else { return }
    awards = services.makeAwardsBook(userId: book.userId)
    let room = services.makeMascotRoom(userId: book.userId, today: LocalDate(EpochMillis(Date()), in: .current))
    async let a: Void = awards?.load() ?? ()
    async let r: Void = room?.load() ?? ()
    _ = await (a, r)
    if let room { streak = room.streak.count }
  }

  /// Dưới thẻ: huy hiệu (tiểu sử / đang theo dõi đã vào thẻ).
  @ViewBuilder private func about(_ p: CommunityFeed.Author) -> some View {
    if !book.badges.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle(String(localized: "community.pass.badges"))
        badges
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func sectionTitle(_ t: String) -> some View {
    Text(verbatim: t)
      .font(.system(size: 20, weight: .bold)).tracking(-0.3)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .padding(.top, DS.Spacing.sm)
      .accessibilityAddTraits(.isHeader)
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
        .frame(height: 30)
        .background(DS.Color.card.swiftUI, in: Capsule())
        .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.10), lineWidth: 0.75) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("community.user.badge \(b.title)"))
      }
    }
  }

  /// Hàng nút dưới thẻ: một nút dài + các nút tròn (không phải hai nút to bằng
  /// nhau kiểu TikTok). Của mình: Sửa hồ sơ · Đã lưu · Quyền riêng tư. Người khác:
  /// Theo dõi · Chia sẻ hồ sơ. (Nhắn tin: chờ server — MESSAGING-PLAN.md.)
  @ViewBuilder private func primaryAction(_ p: CommunityFeed.Author) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      if book.isMe {
        editLink
        NavigationLink {
          CommunitySavedScreen(userId: book.userId)
        } label: {
          roundIcon("bookmark")
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("community.saved.title"))
        NavigationLink {
          CommunityPrivacyScreen(userId: book.userId)
        } label: {
          roundIcon("lock")
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("community.privacy.title"))
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
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(DS.Color.background.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 44)
              .background(DS.Color.foreground.swiftUI, in: Capsule())
          }
        }
        .buttonStyle(.plain)
        .disabled(book.working)
        .accessibilityAddTraits(book.iFollow ? .isSelected : [])
      }
      if !book.isMe, let dm {
        Button {
          taps += 1
          Task { dmThread = await dm.open(with: p) }
        } label: {
          roundIcon("paperplane")
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("dm.open"))
      }
      ShareLink(
        item: PassShareImage(
          author: p, posts: book.stats?.posts ?? book.posts.count, followers: book.followers,
          following: book.following, tries: book.stats?.tries ?? 0),
        message: Text(String(localized: "community.pass.sharetext \(p.handle)")),
        preview: SharePreview(
          Text(verbatim: p.displayName),
          image: PassShareImage(
            author: p, posts: book.stats?.posts ?? book.posts.count, followers: book.followers,
            following: book.following, tries: book.stats?.tries ?? 0))
      ) {
        roundIcon("square.and.arrow.up")
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityLabel(Text("community.pass.share"))
    }
  }

  private func roundIcon(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.system(size: 16, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .frame(width: 44, height: 44)
      .background(DS.Color.card.swiftUI, in: Circle())
      .overlay { Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75) }
      .contentShape(Circle())
  }

  private var editLink: some View {
    NavigationLink {
      CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
    } label: {
      quiet(Text("community.user.edit"))
    }
    .buttonStyle(.plain)
  }

  /// Nút phụ cùng họ với nút tròn: mặt thẻ trắng + viền mảnh (15/10, hết lệch tông
  /// be / trắng).
  private func quiet(_ t: Text) -> some View {
    t.font(.system(size: 15, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(DS.Color.card.swiftUI, in: Capsule())
      .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75) }
  }

  /// Lọc loại bài: viên chữ — đang chọn đen đặc, còn lại mặt thẻ (thay segmented
  /// mặc định lệch tông).
  private var kindRow: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.sm) {
        ForEach([CommunityUser.KindFilter.all] + book.kinds, id: \.self) { k in
          let on = book.kind == k
          Button {
            taps += 1
            Task { await book.select(k) }
          } label: {
            Text(Self.kindLabel(k))
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(on ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
              .padding(.horizontal, 16)
              .frame(height: 36)
              .background(on ? DS.Color.foreground.swiftUI : DS.Color.card.swiftUI, in: Capsule())
              .overlay {
                Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(on ? 0 : 0.10), lineWidth: 0.75)
              }
              .frame(minHeight: 44)
              .contentShape(Capsule())
          }
          .buttonStyle(TodayPressStyle())
          .accessibilityAddTraits(on ? .isSelected : [])
        }
      }
    }
    .scrollClipDisabled()
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
      if book.isMe {
        // Trang của mình còn trống: lời mời thay vì một dòng "chưa có bài" (15/10).
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Image(systemName: "dumbbell.fill")
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(DS.Color.metricRose.swiftUI)
            .accessibilityHidden(true)
          Text("community.user.empty.mine.title")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text("community.user.empty.mine.body")
            .font(.system(size: 14))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .dsCard()
      } else if book.mutedUntil == nil {
        Text("community.user.empty")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
    case .ready:
      // Lưới hai cột thẻ có ảnh lớn — trang cá nhân như bộ hồ sơ thành tích (15/10).
      LazyVGrid(columns: [GridItem(.flexible(), spacing: DS.Spacing.md), GridItem(.flexible())], spacing: DS.Spacing.md) {
        ForEach(book.posts) { post in
          GridPostCard(post: post, artURL: post.art.flatMap(book.artURL), unit: unit)
            .frame(height: 250)
            .onTapGesture { openPost = post.id }
            .accessibilityAddTraits(.isButton)
            .onAppear { if post.id == book.posts.last?.id { Task { await book.loadMore() } } }
        }
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

/// Thẻ vận động viên (15/10, chủ dự án duyệt mock — "giống tiktok, sửa lại cho khác
/// biệt"): thẻ thành viên kim loại đen (`PassMaterial` — khác nền bài đăng); ba số
/// kiểu bảng điểm CHỈ từ dữ liệu server có — bài · người theo dõi · lượt người khác
/// thử buổi tập. Dùng chung cho trang cá nhân và ảnh chia sẻ hồ sơ.
struct AthletePassCard<Avatar: View>: View {
  let author: CommunityFeed.Author
  let posts: Int
  let followers: Int
  let following: Int
  let tries: Int
  @ViewBuilder var avatarSlot: () -> Avatar

  var body: some View {
    let p = author
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("community.pass.caption")
          .font(.system(size: 10, weight: .bold)).tracking(1.4)
          .foregroundStyle(.white.opacity(0.6))
        Spacer(minLength: 0)
        Image("BrandMark").resizable().interpolation(.high).frame(width: 18, height: 18)
          .environment(\.colorScheme, .dark)
          .accessibilityHidden(true)
      }
      HStack(spacing: 12) {
        avatarSlot()
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(verbatim: p.displayName)
              .font(.system(size: 22, weight: .bold)).tracking(-0.3)
              .foregroundStyle(.white)
              .lineLimit(2)
            if p.isOfficial {
              Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(DS.Color.metricBlue.bright)
                .accessibilityLabel(Text("community.verified"))
            }
          }
          Text(verbatim: "@\(p.handle) · \(String(localized: "community.user.followingcount")) \(following)")
            .font(.system(size: 13))
            .foregroundStyle(.white.opacity(0.6))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
      }
      .padding(.top, 14)
      if let bio = p.bio, !bio.isEmpty {
        Text(verbatim: bio)
          .font(.system(size: 14))
          .foregroundStyle(.white.opacity(0.85))
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 10)
      }
      HStack(spacing: 0) {
        stat(posts, label: String(localized: "community.pass.posts"))
        divider
        stat(followers, label: String(localized: "community.user.followers"))
        divider
        stat(tries, label: String(localized: "community.pass.tries"))
      }
      .padding(.top, 14)
      .overlay(alignment: .top) { Rectangle().fill(.white.opacity(0.14)).frame(height: 0.5) }
      .padding(.top, 16)
    }
    .padding(16)
    .background { PassMaterial() }
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay {
      // viền ánh bạc: sáng ở góc trên trái, tắt dần
      RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(
        LinearGradient(
          colors: [.white.opacity(0.45), .white.opacity(0.06), .white.opacity(0.18)], startPoint: .topLeading,
          endPoint: .bottomTrailing),
        lineWidth: 0.8)
    }
  }

  private func stat(_ n: Int, label: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: CommunityCard.number(Double(n)))
        .font(.system(size: 24, weight: .heavy).monospacedDigit()).fontWidth(.condensed)
        .foregroundStyle(.white)
      Text(verbatim: label)
        .font(.system(size: 10, weight: .bold)).tracking(1.1).textCase(.uppercase)
        .foregroundStyle(.white.opacity(0.6))
        .lineLimit(1).minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, 12)
    .accessibilityElement(children: .combine)
  }

  private var divider: some View {
    Rectangle().fill(.white.opacity(0.14)).frame(width: 0.5, height: 34).padding(.trailing, 12).padding(.top, 12)
  }
}

/// Avatar trên thẻ vận động viên.
struct PassAvatar: View {
  let author: CommunityFeed.Author

  var body: some View {
    MascotAvatar(mascotId: author.mascotId, size: 60)
      .overlay { Circle().strokeBorder(.white.opacity(0.25), lineWidth: 1) }
  }
}

/// Chia sẻ hồ sơ thành ẢNH của chính thẻ vận động viên (15/10).
struct PassShareImage: Transferable {
  let author: CommunityFeed.Author
  let posts: Int
  let followers: Int
  let following: Int
  let tries: Int

  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .png) { item in try await item.png() }
  }

  @MainActor private func png() throws -> Data {
    let card = AthletePassCard(author: author, posts: posts, followers: followers, following: following, tries: tries) {
      PassAvatar(author: author)
    }
    .frame(width: 360)
    .padding(20)
    .background(Color(white: 0.96))
    .environment(\.locale, Locale.app)
    let renderer = ImageRenderer(content: card)
    renderer.scale = 3
    guard let data = renderer.uiImage?.pngData() else { throw CocoaError(.fileWriteUnknown) }
    return data
  }
}

/// Nhịp tập 28 ngày: 2 hàng × 14 ô, ngày có tập tô hồng, đậm dần về gần đây.
private struct RhythmCard: View {
  let days: [Bool]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("community.pass.rhythm").font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Spacer(minLength: 0)
        Text(verbatim: "\(days.filter { $0 }.count)/\(days.count)")
          .font(.system(size: 13, weight: .semibold).monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 14), spacing: 5) {
        ForEach(Array(days.enumerated()), id: \.offset) { i, on in
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(on ? DS.Color.metricRose.swiftUI.opacity(0.55 + 0.45 * Double(i) / Double(max(days.count - 1, 1))) : DS.Color.foreground.swiftUI.opacity(0.06))
            .aspectRatio(1, contentMode: .fit)
        }
      }
    }
    .padding(14)
    .dsCard()
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("community.pass.rhythm"))
    .accessibilityValue(Text(verbatim: "\(days.filter { $0 }.count)/\(days.count)"))
  }
}

/// Chất liệu thẻ vận động viên: kim loại đen đơn sắc — chuyển than → đen, vân
/// xước chéo rất mảnh, logo ASCND dập chìm cỡ lớn, một vệt sáng chéo. Không màu
/// chuyên mục, không biểu tượng dụng cụ — để không lẫn với thẻ bài đăng.
private struct PassMaterial: View {
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(white: 0.17), Color(white: 0.07), Color(white: 0.11)], startPoint: .topLeading,
        endPoint: .bottomTrailing)
      Canvas { ctx, size in
        var x: CGFloat = -size.height
        while x < size.width {
          var path = Path()
          path.move(to: CGPoint(x: x, y: size.height))
          path.addLine(to: CGPoint(x: x + size.height, y: 0))
          ctx.stroke(path, with: .color(.white.opacity(0.035)), lineWidth: 0.5)
          x += 3
        }
      }
      .allowsHitTesting(false)
      Image("BrandMark")
        .resizable()
        .interpolation(.high)
        .scaledToFit()
        .frame(width: 210, height: 210)
        .environment(\.colorScheme, .dark)
        .opacity(0.07)
        .blendMode(.plusLighter)
        .offset(x: 120, y: 40)
        .accessibilityHidden(true)
      LinearGradient(
        stops: [
          .init(color: .clear, location: 0.25), .init(color: .white.opacity(0.10), location: 0.42),
          .init(color: .clear, location: 0.6),
        ], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
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
  /// `false`: hàng bám mép trái (`flexWrap` của RN, vd. chip đi chợ).
  var centered = true

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
      var x = bounds.minX + (centered ? (bounds.width - row.width) / 2 : 0)
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
