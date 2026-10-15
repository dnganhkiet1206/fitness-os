import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

// MARK: - Feed kiểu Apple News pha Instagram (15/10, chủ dự án duyệt mock v2)
//
// Mỗi bài có DẢI CHUYÊN MỤC trên đầu (logo + tên, như "News+"), tiêu đề đậm là
// lời người đăng, "ảnh" là mảng màu theo chuyên mục kèm con số lớn khi bài chưa
// có ảnh thật. Ba hình thẻ: lớn (ảnh rộng trên), hàng (ảnh vuông phải), lưới
// (hai thẻ nhỏ). Xếp nhịp ở `CommunityLayout` (ASCNDCore). Màn chi tiết vẫn
// dùng `PostCardView` đầy đủ.

extension CommunityLayout.Category {
  var title: String {
    switch self {
    case .health: String(localized: "community.cat.health")
    case .food: String(localized: "community.cat.food")
    case .ascnd: String(localized: "brand.name")
    }
  }

  var symbol: String {
    switch self {
    case .health: "waveform.path.ecg"
    case .food: "fork.knife"
    case .ascnd: "triangle.fill"
    }
  }

  /// Chữ / logo trên mặt sáng.
  var ink: Color {
    switch self {
    case .health: DS.Color.metricSteel.swiftUI
    case .food: DS.Color.metricOrange.swiftUI
    case .ascnd: DS.Color.metricRose.swiftUI
    }
  }
}

/// Tiêu đề của thẻ: lời người đăng; không có thì tên buổi / món / "Tiến bộ N tuần".
enum PostHeadline {
  static func text(_ p: CommunityFeed.Post) -> String {
    let caption = p.caption.trimmingCharacters(in: .whitespacesAndNewlines)
    if !caption.isEmpty { return caption }
    switch p.kind {
    case .workout:
      return p.workout.title.flatMap { $0.isEmpty ? nil : $0 }
        ?? String(localized: "community.workout")
    case .recipe:
      return p.recipe.map { $0.title.isEmpty ? String(localized: "community.recipe") : $0.title }
        ?? ""
    case .progress:
      return p.progress.map { ProgressPostBody.title(Int($0.weeks)) } ?? KindTag.text(.progress)
    }
  }
}

/// Dải chuyên mục: logo + tên chuyên mục · loại bài.
struct CategoryBand: View {
  let post: CommunityFeed.Post

  var body: some View {
    let cat = CommunityLayout.Category.of(post.kind)
    HStack(spacing: 5) {
      Image(systemName: cat.symbol).font(.system(size: 11, weight: .bold))
      Text(verbatim: cat.title).font(.system(size: 13, weight: .bold))
      if cat == .ascnd {
        Text(verbatim: "· \(KindTag.text(post.kind))")
          .font(.system(size: 13))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
    }
    .foregroundStyle(cat.ink)
    .padding(.horizontal, 16)
    .frame(height: 32)
    .background(DS.Color.foreground.swiftUI.opacity(0.04))
    .accessibilityElement(children: .combine)
  }
}

/// Tác giả nhỏ trên tiêu đề (vị trí "tên báo" của Apple News).
private struct FeedAuthor: View {
  let post: CommunityFeed.Post
  var size: CGFloat = 20

  var body: some View {
    HStack(spacing: 6) {
      MascotAvatar(mascotId: post.author?.mascotId, size: size)
      Text(verbatim: post.author?.displayName ?? "—")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
      if post.author?.isOfficial == true {
        Image(systemName: "checkmark.seal.fill").font(.caption2).foregroundStyle(
          DS.Color.metricBlue.swiftUI)
      }
    }
  }
}

/// Đáy thẻ: "2 giờ trước" · tim + số (chạm để thích) · "⋯".
private struct FeedFooter: View {
  let post: CommunityFeed.Post
  @Environment(\.communityPostActions) private var actions
  @State private var taps = 0

  var body: some View {
    HStack(spacing: 2) {
      Text(verbatim: PostHeaderView.agoText(post.createdAt))
        .font(.system(size: 13))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
      Spacer(minLength: 0)
      if let actions {
        Button {
          taps += 1
          Task { _ = await actions.actions.toggle(.like, postId: post.id, host: actions.host) }
        } label: {
          HStack(spacing: 4) {
            Image(systemName: post.liked ? "heart.fill" : "heart")
              .foregroundStyle(
                post.liked ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI
              )
              .contentTransition(.symbolEffect(.replace))
              .symbolEffect(.bounce.up.byLayer, value: post.liked)
            if post.likeCount > 0 {
              Text(verbatim: "\(post.likeCount)")
                .font(.system(size: 13).monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .contentTransition(.numericText(value: Double(post.likeCount)))
            }
          }
          .font(.system(size: 14))
          .frame(minWidth: 44, minHeight: 36)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: taps)
        .accessibilityLabel(
          Text(verbatim: "\(String(localized: "community.like")) · \(post.likeCount)")
        )
        .accessibilityAddTraits(post.liked ? .isSelected : [])
        Button {
          actions.openMenu(post)
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 36, height: 36, alignment: .trailing)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("community.post.more"))
      }
    }
  }
}

/// "Ảnh" của thẻ: ảnh thật nếu có; không có thì mảng màu chuyên mục + số lớn.
struct PostArtTile: View {
  enum Shape { case wide, square, grid }

  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  let shape: Shape

  private var big: CGFloat {
    switch shape {
    case .wide: 60
    case .square: 22
    case .grid: 28
    }
  }

  var body: some View {
    ZStack {
      fill
      if let artURL {
        AsyncImage(url: artURL) { phase in
          if let image = phase.image { image.resizable().scaledToFill() }
        }
      }
    }
    .clipped()
    .accessibilityHidden(true)
  }

  @ViewBuilder private var fill: some View {
    switch post.kind {
    case .workout: workout
    case .recipe: recipe
    case .progress: progress
    }
  }

  private var workout: some View {
    let w = post.workout
    let volume = CommunityCard.volumeText(w.volumeKg, unit: unit, locale: .app)
    let (n, u) = Self.split(
      volume ?? w.minutes.map {
        "\(CommunityCard.number($0)) \(String(localized: "community.stat.minutes"))"
      } ?? "")
    return ZStack(alignment: .topLeading) {
      PostTint.board
      VStack(alignment: .leading, spacing: 0) {
        if shape != .square {
          HStack {
            Text(verbatim: w.title ?? String(localized: "community.workout"))
              .font(.system(size: 11, weight: .bold)).tracking(1.3).textCase(.uppercase)
              .foregroundStyle(PostTint.soft).lineLimit(1)
            Spacer(minLength: 0)
            if w.pr { RecordChip() }
          }
        }
        Spacer(minLength: 0)
        HStack(alignment: .firstTextBaseline, spacing: 3) {
          Text(verbatim: n)
            .font(.system(size: big, weight: .heavy).monospacedDigit()).tracking(
              shape == .wide ? -2 : -0.5
            )
            .foregroundStyle(.white)
          Text(verbatim: u).font(.system(size: shape == .wide ? 20 : 12, weight: .semibold))
            .foregroundStyle(PostTint.soft)
        }
        .lineLimit(1).minimumScaleFactor(0.5)
        if shape == .wide {
          Text(verbatim: Self.workoutLine(w))
            .font(.system(size: 12)).foregroundStyle(PostTint.soft).padding(.top, 4)
        } else if shape == .square, w.pr {
          RecordChip().padding(.top, 4)
        }
      }
      .padding(shape == .square ? 10 : 16)
    }
  }

  private var recipe: some View {
    ZStack {
      DS.Color.metricOrange.solid
      VStack(spacing: 4) {
        Image(systemName: "frying.pan")
          .font(.system(size: shape == .wide ? 48 : 30, weight: .regular))
        if let kcal = post.recipe?.kcal, kcal > 0 {
          Text(verbatim: RecipePostBody.kcal(kcal))
            .font(.system(size: shape == .wide ? 20 : 13, weight: .bold).monospacedDigit())
        }
      }
      .foregroundStyle(.white)
    }
  }

  private var progress: some View {
    let tile = post.progress.flatMap { CommunityCard.tiles($0, unit: unit).first }
    return ZStack(alignment: .topLeading) {
      DS.Color.metricSteel.solid
      VStack(alignment: .leading, spacing: 6) {
        if let tile {
          if shape == .wide {
            HStack {
              Text(verbatim: ProgressPostBody.label(tile))
                .font(.system(size: 11, weight: .bold)).tracking(1.3).textCase(.uppercase)
              Spacer(minLength: 0)
              Text(verbatim: "\(tile.startText) → \(tile.endText)").font(
                .system(size: 12).monospacedDigit())
            }
            .foregroundStyle(.white.opacity(0.75))
            .lineLimit(1)
          }
          Text(verbatim: tile.deltaText)
            .font(.system(size: shape == .wide ? 44 : big, weight: .heavy).monospacedDigit())
            .tracking(-0.8)
            .foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.5)
          Spacer(minLength: 0)
          if tile.series.count >= 2 {
            Chart(Array(tile.series.enumerated()), id: \.offset) { point in
              LineMark(x: .value("i", point.offset), y: .value("v", point.element))
                .foregroundStyle(.white.opacity(0.85))
                .lineStyle(StrokeStyle(lineWidth: shape == .wide ? 3 : 2.2, lineCap: .round))
                .interpolationMethod(.monotone)
            }
            .chartXAxis(.hidden).chartYAxis(.hidden)
            .chartYScale(domain: .automatic(includesZero: false))
            .frame(height: shape == .wide ? 60 : 28)
          }
        } else {
          Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 30)).foregroundStyle(
            .white)
        }
      }
      .padding(shape == .square ? 10 : 16)
    }
  }

  /// "5 bài · 42 phút".
  static func workoutLine(_ w: CommunityPayloads.Workout) -> String {
    var parts: [String] = []
    if w.exerciseCount > 0 {
      parts.append(
        "\(CommunityCard.number(w.exerciseCount)) \(String(localized: "community.stat.exercises"))")
    }
    if let m = w.minutes {
      parts.append("\(CommunityCard.number(m)) \(String(localized: "community.stat.minutes"))")
    }
    return parts.joined(separator: " · ")
  }

  static func split(_ s: String) -> (String, String) {
    guard let i = s.firstIndex(of: " ") else { return (s, "") }
    return (String(s[..<i]), String(s[s.index(after: i)...]))
  }
}

/// Mặt thẻ chung: trắng, bo 20, viền mảnh.
private struct NewsCardSurface: ViewModifier {
  func body(content: Content) -> some View {
    content
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(DS.Color.card.swiftUI)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.06), lineWidth: 0.75)
      }
      .shadow(color: .black.opacity(0.04), radius: 8, y: 3)
      .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

/// Thẻ lớn: dải chuyên mục, ảnh rộng, tác giả, tiêu đề đậm, đáy.
struct HeroPostCard: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  /// Mở bài — chỉ phần trên đáy; tim / "⋯" ở đáy là nút riêng.
  var open: () -> Void = {}

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        CategoryBand(post: post)
        PostArtTile(post: post, artURL: artURL, unit: unit, shape: .wide)
          .frame(height: 200)
        VStack(alignment: .leading, spacing: 6) {
          FeedAuthor(post: post)
          Text(verbatim: PostHeadline.text(post))
            .font(.system(size: 22, weight: .bold)).tracking(-0.4)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
      }
      .contentShape(Rectangle())
      .onTapGesture(perform: open)
      .accessibilityAddTraits(.isButton)
      FeedFooter(post: post).padding(.horizontal, 16).padding(.bottom, 6)
    }
    .modifier(NewsCardSurface())
  }
}

/// Thẻ hàng (đúng mẫu Apple News chủ dự án gửi): tiêu đề trái, ảnh vuông phải.
struct RowPostCard: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  var open: () -> Void = {}

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        CategoryBand(post: post)
        HStack(alignment: .top, spacing: 14) {
          VStack(alignment: .leading, spacing: 6) {
            FeedAuthor(post: post)
            Text(verbatim: PostHeadline.text(post))
              .font(.system(size: 19, weight: .bold)).tracking(-0.3)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(4)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          PostArtTile(post: post, artURL: artURL, unit: unit, shape: .square)
            .frame(width: 104, height: 104)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
      }
      .contentShape(Rectangle())
      .onTapGesture(perform: open)
      .accessibilityAddTraits(.isButton)
      FeedFooter(post: post).padding(.horizontal, 16).padding(.bottom, 6)
    }
    .modifier(NewsCardSurface())
  }
}

/// Thẻ nhỏ của lưới hai cột.
struct GridPostCard: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit

  var body: some View {
    let cat = CommunityLayout.Category.of(post.kind)
    VStack(alignment: .leading, spacing: 0) {
      PostArtTile(post: post, artURL: artURL, unit: unit, shape: .grid)
        .frame(height: 124)
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Image(systemName: cat.symbol).font(.system(size: 10, weight: .bold))
          Text(verbatim: cat.title).font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(cat.ink)
        Text(verbatim: PostHeadline.text(post))
          .font(.system(size: 16, weight: .bold)).tracking(-0.2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(3)
          .frame(maxWidth: .infinity, alignment: .leading)
        Spacer(minLength: 0)
        Text(
          verbatim: "\(PostHeaderView.agoText(post.createdAt)) · \(post.author?.displayName ?? "—")"
        )
        .font(.system(size: 12))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
      }
      .padding(12)
      .frame(maxHeight: .infinity, alignment: .top)
    }
    .modifier(NewsCardSurface())
  }
}

/// Tiêu đề mục kiểu Apple News: chữ lớn đậm, mũi tên nhỏ.
struct NewsSectionTitle: View {
  let title: String
  var tint: Color = DS.Color.foreground.swiftUI

  var body: some View {
    HStack(spacing: 4) {
      Text(verbatim: title).font(.system(size: 24, weight: .bold)).tracking(-0.5)
      Image(systemName: "chevron.right").font(.system(size: 17, weight: .bold)).opacity(0.6)
      Spacer(minLength: 0)
    }
    .foregroundStyle(tint)
    .padding(.top, DS.Spacing.sm)
    .accessibilityAddTraits(.isHeader)
  }
}

/// Danh sách thịnh hành đánh số (từ số 2 — số 1 là thẻ lớn ngay trên).
struct TrendingList: View {
  let posts: [CommunityFeed.Post]
  let start: Int
  let open: (CommunityFeed.Post) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(posts.enumerated()), id: \.element.id) { i, p in
        let cat = CommunityLayout.Category.of(p.kind)
        Button {
          open(p)
        } label: {
          HStack(alignment: .top, spacing: 14) {
            Text(verbatim: "\(start + i)")
              .font(.system(size: 30, weight: .heavy).monospacedDigit())
              .foregroundStyle(NewsPalette.trending)
              .frame(width: 24, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
              HStack(spacing: 4) {
                Image(systemName: cat.symbol).font(.system(size: 10, weight: .bold))
                Text(verbatim: cat.title).font(.system(size: 12, weight: .bold))
              }
              .foregroundStyle(cat.ink)
              Text(verbatim: PostHeadline.text(p))
                .font(.system(size: 16, weight: .bold)).tracking(-0.2)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
              Text(
                verbatim: "\(p.author?.displayName ?? "—") · \(PostHeaderView.agoText(p.createdAt))"
              )
              .font(.system(size: 12))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
            }
            Spacer(minLength: 0)
          }
          .padding(.vertical, 12)
          .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .overlay(alignment: .top) {
          if i > 0 {
            Rectangle().fill(DS.Color.foreground.swiftUI.opacity(0.08)).frame(height: 0.5)
          }
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 2)
    .modifier(NewsCardSurface())
  }
}

enum NewsPalette {
  /// Hồng "Trending" của Apple News — dùng hồng của app.
  static let trending = DS.Color.metricRose.swiftUI
}
