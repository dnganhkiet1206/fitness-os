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
/// Chưa có (các lát sau, #527): mở bài / bình luận, thích / lưu / menu, Thử
/// workout, Thêm vào bữa, soạn bài, tìm kiếm, hộp thư, thử thách nổi bật.
/// Hàng thích · bình luận · lưu là số đếm chỉ đọc. Ảnh đại diện là emoji của
/// linh vật (chưa có hình linh vật native).
struct CommunityTab: View {
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityFeedBook?
  @State private var built = false

  var body: some View {
    NavigationStack {
      Group {
        if let book {
          CommunityFeedView(book: book)
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
      built = true
    }
    .onChange(of: services.session.session?.userId) { _, id in
      if id != flow.today.userId { book?.close() }
    }
  }
}

struct CommunityFeedView: View {
  let book: CommunityFeedBook
  @Environment(\.weightUnit) private var unit

  var body: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        Picker(selection: Binding(get: { book.tab }, set: { t in Task { await book.select(t) } })) {
          Text("community.tab.following").tag(CommunityFeed.Tab.following)
          Text("community.tab.discover").tag(CommunityFeed.Tab.discover)
        } label: {
          Text("tab.community")
        }
        .pickerStyle(.segmented)
        if book.phase == .ready { header }
        if book.tab == .discover, !book.useful.isEmpty { UsefulThisWeekCard(posts: book.useful) }
        content
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .toolbar {
      // Lát 2: sửa hồ sơ của mình (RN: avatar ở đầu trang → trang người dùng
      // của mình → Sửa hồ sơ; trang người dùng đến ở lát 5).
      if book.hasProfile == true {
        ToolbarItem(placement: .topBarTrailing) {
          NavigationLink {
            profileScreen
          } label: {
            Image(systemName: "person.crop.circle")
          }
          .accessibilityLabel(Text("community.profile.edit"))
        }
      }
    }
    .task { if book.phase == .loading { await book.load() } }
    .refreshable { await book.load() }
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
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView().frame(minHeight: 240)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.load() } }
        .frame(minHeight: 240)
    case .ready where book.posts.isEmpty:
      if book.tab == .following {
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
      ForEach(book.posts) { post in
        PostCardView(post: post, artURL: post.art.flatMap(book.artURL), unit: unit)
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

// MARK: - Thẻ bài

struct PostCardView: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit

  var body: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        PostHeaderView(post: post)
        PostArtView(kind: post.kind, url: artURL, alt: post.art.map(Self.alt))
        switch post.kind {
        case .workout: WorkoutPostBody(workout: post.workout, unit: unit)
        case .progress: if let p = post.progress { ProgressPostBody(progress: p, unit: unit) }
        case .recipe: if let r = post.recipe { RecipePostBody(recipe: r) }
        }
        if !post.caption.isEmpty {
          Text(verbatim: post.caption)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        PostCountsView(post: post)
      }
    }
  }

  /// Chữ thay ảnh theo ngôn ngữ app (RN: `vi` → `alt_vi`, còn lại `alt_en`).
  static func alt(_ a: CommunityFeed.Art) -> String {
    Locale.app.language.languageCode?.identifier == "vi" ? a.altVi : a.altEn
  }
}

struct PostHeaderView: View {
  let post: CommunityFeed.Post

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      MascotAvatar(mascotId: post.author?.mascotId, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Text(verbatim: post.author?.displayName ?? "—")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
          if post.author?.isOfficial == true {
            Image(systemName: "checkmark.seal.fill")
              .font(.footnote)
              .foregroundStyle(DS.Color.metricBlue.swiftUI)
              .accessibilityLabel(Text("community.verified"))
          }
        }
        Text(verbatim: meta)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
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

/// Ảnh minh hoạ 16:9; chưa có / tải hỏng thì nền với biểu tượng loại bài.
struct PostArtView: View {
  let kind: CommunityFeed.Kind
  let url: URL?
  let alt: String?

  var body: some View {
    ZStack {
      DS.Color.secondary.swiftUI
      Image(systemName: Self.glyph(kind))
        .font(.system(size: 40, weight: .light))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.45))
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
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
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

/// Mặt lõm chứa dòng dữ liệu của thẻ (`m.inset`).
private struct InsetPanel<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    VStack(spacing: 0) { content }
      .padding(.horizontal, DS.Spacing.md)
      .background(DS.Color.recessBg.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .overlay(RoundedRectangle(cornerRadius: DS.Radius.md).stroke(DS.Color.recessBorder.swiftUI, lineWidth: 1))
  }
}

private struct PanelLine: View {
  let name: String
  let value: String
  let rule: Bool

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Text(verbatim: name).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI).lineLimit(1)
      Spacer(minLength: 0)
      Text(verbatim: value).font(DS.TextStyle.body.monospacedDigit()).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(minHeight: 44)
    .overlay(alignment: .top) { if rule { Divider() } }
    .accessibilityElement(children: .combine)
  }
}

private struct StatLabel: View {
  let systemImage: String
  let text: String
  var tint: Color = DS.Color.mutedForeground.swiftUI

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: systemImage).font(.footnote).foregroundStyle(tint).accessibilityHidden(true)
      Text(verbatim: text).font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(DS.Color.foreground.swiftUI)
    }
  }
}

struct WorkoutPostBody: View {
  let workout: CommunityPayloads.Workout
  let unit: WeightUnit

  /// `{n:exercise|exercises}` của RN: số ít khi n == 1.
  static func moreText(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.moreexercises.one \(n)") : String(localized: "community.moreexercises.other \(n)")
  }

  var body: some View {
    let lines = workout.exercises.prefix(CommunityCard.previewLines)
    let more = workout.exercises.count - lines.count
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(verbatim: workout.title ?? String(localized: "community.workout"))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      HStack(spacing: DS.Spacing.md) {
        if let m = workout.minutes {
          StatLabel(systemImage: "clock", text: String(localized: "community.minutes \(CommunityCard.number(m))"))
        }
        if let v = CommunityCard.volumeText(workout.volumeKg, unit: unit, locale: .app) {
          StatLabel(systemImage: "dumbbell", text: v)
        }
        if workout.pr { StatLabel(systemImage: "trophy", text: "PR", tint: DS.Color.readinessYellow.swiftUI) }
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
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(verbatim: Self.title(Int(progress.weeks)))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      if let lead = tiles.first {
        Text("community.progress.fromto \(lead.startText) \(lead.endText)")
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        ForEach(tiles, id: \.kind) { tile($0) }
      }
    }
  }

  private func tile(_ t: CommunityCard.Tile) -> some View {
    let label =
      switch t.kind {
      case .weight: String(localized: "community.progress.weight")
      case .waist: String(localized: "community.progress.waist")
      case .lift: t.liftName ?? ""
      }
    let (icon, tint): (String, Color) =
      switch t.kind {
      case .weight: ("scalemass", DS.Color.metricBeige.swiftUI)
      case .waist: ("ruler", DS.Color.readinessYellowGraphic.swiftUI)
      case .lift: ("dumbbell", DS.Color.metricOrange.swiftUI)
      }
    return VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Image(systemName: icon).font(.caption2).foregroundStyle(tint)
        Text(verbatim: label).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI).lineLimit(1)
      }
      Text(verbatim: t.deltaText)
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      if t.series.count >= 2 {
        Chart(Array(t.series.enumerated()), id: \.offset) { point in
          LineMark(x: .value("i", point.offset), y: .value("v", point.element))
            .foregroundStyle(tint)
            .interpolationMethod(.linear)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
        .frame(height: 28)
      } else {
        Color.clear.frame(height: 28)
      }
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.recessBg.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "\(label): \(t.startText) → \(t.endText)"))
  }
}

struct RecipePostBody: View {
  let recipe: CommunityPayloads.Recipe

  static func moreText(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.moreingredients.one \(n)") : String(localized: "community.moreingredients.other \(n)")
  }

  var body: some View {
    let lines = recipe.ingredients.prefix(CommunityCard.previewLines)
    let more = recipe.ingredients.count - lines.count
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(verbatim: recipe.title.isEmpty ? String(localized: "community.recipe") : recipe.title)
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      StatLabel(systemImage: "flame", text: Self.kcal(recipe.kcal))
      HStack(spacing: DS.Spacing.sm) {
        chip(String(localized: "logMeal.protein"), recipe.protein)
        chip(String(localized: "logMeal.carbs"), recipe.carbs)
        chip(String(localized: "logMeal.fat"), recipe.fat)
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

  private func chip(_ label: String, _ grams: Double) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: label).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI).lineLimit(1)
      Text(verbatim: "\(CommunityCard.grouped(grams, locale: .app)) g")
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.recessBg.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .combine)
  }
}

/// Thích · bình luận · lưu — lát này chỉ đọc (nút thật ở lát tương tác).
struct PostCountsView: View {
  let post: CommunityFeed.Post

  var body: some View {
    HStack(spacing: DS.Spacing.lg) {
      count(post.liked ? "heart.fill" : "heart", post.likeCount, String(localized: "community.like"),
            tint: post.liked ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI)
      count("bubble.right", post.commentCount, String(localized: "community.comment"))
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

  var body: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Text("community.useful.title")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Text("community.useful.sub")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        ForEach(Array(posts.enumerated()), id: \.element.id) { i, p in row(p, rule: i > 0) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func row(_ p: CommunityFeed.Post, rule: Bool) -> some View {
    let title = CommunityCard.usefulTitle(p) ?? Self.fallback(p.kind)
    let who = p.author.map { "@\($0.handle)" } ?? ""
    let why = CommunityCard.reasons(p).map(Self.reason).joined(separator: " · ")
    return HStack(spacing: DS.Spacing.sm) {
      Image(systemName: PostArtView.glyph(p.kind))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title).font(DS.TextStyle.body.weight(.semibold)).foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(2)
        if !who.isEmpty {
          Text(verbatim: who).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI).lineLimit(1)
        }
        Text(verbatim: why).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.foreground.swiftUI)
      }
      Spacer(minLength: 0)
    }
    .frame(minHeight: 56)
    .padding(.vertical, DS.Spacing.sm)
    .overlay(alignment: .top) { if rule { Divider() } }
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
