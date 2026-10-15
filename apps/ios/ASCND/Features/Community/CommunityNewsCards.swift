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

/// Logo chuyên mục: ASCND dùng đúng logo thương hiệu (`BrandMark`, có bản sáng /
/// tối), hai chuyên mục kia là biểu tượng hệ thống.
struct CategoryGlyph: View {
  let cat: CommunityLayout.Category
  let size: CGFloat

  var body: some View {
    if cat == .ascnd {
      Image("BrandMark")
        .resizable()
        .interpolation(.high)
        .scaledToFit()
        .frame(width: size * 1.45, height: size * 1.45)
        .accessibilityHidden(true)
    } else {
      Image(systemName: cat.symbol).font(.system(size: size, weight: .bold))
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
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let cat = CommunityLayout.Category.of(post.kind)
    HStack(spacing: 5) {
      CategoryGlyph(cat: cat, size: 11)
      // trên nền ảnh tối: tên chuyên mục trắng, logo giữ màu chuyên mục
      Text(verbatim: cat.title).font(.system(size: 13, weight: .bold))
        .foregroundStyle(scheme == .dark ? Color.white.opacity(0.92) : cat.ink)
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
    // trên nền ảnh tối (thẻ lớn) không kẻ dải — ảnh liền một khối
    .background(scheme == .dark ? Color.clear : DS.Color.foreground.swiftUI.opacity(0.04))
    .accessibilityElement(children: .combine)
  }
}

/// Tác giả trên tiêu đề (vị trí "tên báo" của Apple News). Lớn hơn từ 15/10 và
/// chạm mở trang cá nhân (chủ dự án: "tên người đăng nên được làm lớn hơn và khi
/// bấm vào thì vào trang cá nhân của họ").
private struct FeedAuthor: View {
  let post: CommunityFeed.Post
  var size: CGFloat = 26
  @Environment(\.openCommunityUser) private var openUser

  var body: some View {
    if let author = post.author, let openUser {
      Button {
        openUser(author.userId)
      } label: {
        who
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityHint(Text("community.openprofile"))
    } else {
      who
    }
  }

  private var who: some View {
    HStack(spacing: 8) {
      MascotAvatar(mascotId: post.author?.mascotId, size: size)
      Text(verbatim: post.author?.displayName ?? "—")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
      if post.author?.isOfficial == true {
        Image(systemName: "checkmark.seal.fill").font(.footnote).foregroundStyle(DS.Color.metricBlue.swiftUI)
          .accessibilityLabel(Text("community.verified"))
      }
    }
    .frame(minHeight: 32)
    .contentShape(Rectangle())
  }
}

extension EnvironmentValues {
  /// Mở màn bình luận bật lên của một bài (feed đặt; `nil` → không có nút).
  @Entry var openCommunityComments: ((CommunityFeed.Post) -> Void)? = nil
}

/// Đáy thẻ: "2 giờ trước" · tim + số (chạm để thích) · bình luận (mở màn bật
/// lên, 15/10) · "⋯".
private struct FeedFooter: View {
  let post: CommunityFeed.Post
  @Environment(\.communityPostActions) private var actions
  @Environment(\.openCommunityComments) private var openComments
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
                .font(.system(size: 15, weight: .medium).monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .contentTransition(.numericText(value: Double(post.likeCount)))
            }
          }
          // Lớn hơn, vùng chạm rộng (15/10, chủ dự án: "nút tim, bình luận đang nhỏ quá khó bấm").
          .font(.system(size: 21))
          .padding(.horizontal, 6)
          .frame(minWidth: 52, minHeight: 48)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: taps)
        .accessibilityLabel(
          Text(verbatim: "\(String(localized: "community.like")) · \(post.likeCount)")
        )
        .accessibilityAddTraits(post.liked ? .isSelected : [])
        if let openComments {
          Button {
            openComments(post)
          } label: {
            HStack(spacing: 4) {
              Image(systemName: "bubble.right")
              if post.commentCount > 0 {
                Text(verbatim: "\(post.commentCount)").font(.system(size: 15, weight: .medium).monospacedDigit())
              }
            }
            .font(.system(size: 21))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, 6)
            .frame(minWidth: 52, minHeight: 48)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: "\(String(localized: "community.comment")) · \(post.commentCount)"))
        }
        Button {
          actions.openMenu(post)
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 48, alignment: .trailing)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("community.post.more"))
      }
    }
  }
}

/// Hành động chính của bài, nằm ngay trên ảnh (15/10, chủ dự án: "cho nút thử
/// nằm ngay trên thẻ luôn"): "Thử buổi này" cho buổi tập của người khác
/// (`CommunityTry.offered`), "Thêm vào bữa" cho công thức có kcal. Viên kính mờ
/// tối, chữ trắng — hợp với ảnh tối.
struct CardAction: View {
  let post: CommunityFeed.Post
  /// `false` trên mặt sáng (thẻ hàng): viên đặc màu chữ, chữ màu nền.
  var onArt = true
  @Environment(\.communityPostActions) private var actions

  var body: some View {
    if let actions {
      if post.kind == .workout, let tryIt = actions.tryWorkout, CommunityTry.offered(post) {
        pill(String(localized: "community.try"), "figure.strengthtraining.traditional", busy: actions.trying.contains(post.id)) {
          tryIt(post)
        }
      } else if post.kind == .workout, let tryIt = actions.tryWorkout, CommunityTry.redo(post) {
        // Bài của chính mình: "Thử lại" (chủ dự án) — chép vào Buổi tập, không ghi lượt thử.
        pill(String(localized: "community.redo"), "figure.strengthtraining.traditional", busy: actions.trying.contains(post.id)) {
          tryIt(post)
        }
      } else if post.kind == .recipe, let add = actions.addToMeal, (post.recipe?.kcal ?? 0) > 0 {
        pill(String(localized: "community.addtomeal"), "plus", busy: false) { add(post) }
      }
    }
  }

  private func pill(_ title: String, _ symbol: String, busy: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if busy { ProgressView().controlSize(.small).tint(.white) } else { Image(systemName: symbol) }
        Text(verbatim: title)
      }
      .font(.system(size: 14, weight: .semibold))
      .lineLimit(1)
      .foregroundStyle(onArt ? Color.white : DS.Color.background.swiftUI)
      .padding(.horizontal, 14)
      .frame(height: 36)
      .background {
        if onArt {
          Capsule().fill(.ultraThinMaterial)
            .overlay { Capsule().strokeBorder(.white.opacity(0.22), lineWidth: 0.5) }
            .environment(\.colorScheme, .dark)
        } else {
          Capsule().fill(DS.Color.foreground.swiftUI)
        }
      }
      .frame(minHeight: 44)
      .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .disabled(busy)
  }
}

/// "Ảnh" của thẻ: ảnh thật nếu có; không có thì một bức "ảnh" vẽ từ dữ liệu
/// (15/10, chủ dự án: "thay vì màu plain thì cho một vài hiệu ứng") — nền lưới
/// chuyển màu (MeshGradient) theo chuyên mục, mỗi bài lệch nhẹ một kiểu nên hai
/// thẻ không giống hệt; biểu tượng lớn chìm; ánh sáng trên / tối dưới như ảnh
/// thật; nét dữ liệu: đường + vùng sáng cho tiến bộ, vòng ba chất cho món,
/// bảng điểm cho buổi tập; nhãn trên mặt kính mờ.
struct PostArtTile: View {
  enum Shape { case wide, square, grid }

  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  let shape: Shape
  /// Khi ảnh trải cả dưới phần chữ (thẻ lớn / lưới): nội dung chỉ nằm trong
  /// `contentHeight` trên cùng, nền ảnh phủ hết.
  var contentHeight: CGFloat?
  /// Chừa phía trên nội dung (dải chuyên mục nằm trên nền ảnh).
  var contentInset: CGFloat = 0

  private var big: CGFloat {
    switch shape {
    case .wide: 72
    case .square: 28
    case .grid: 34
    }
  }

  private var pad: CGFloat { shape == .square ? 10 : 16 }

  var body: some View {
    // Mọi lớp nằm trong overlay của một khung trống: biểu tượng chìm cỡ lớn
    // không bao giờ đẩy khung to ra / tràn lên dải chuyên mục.
    Color.clear
      .overlay { ArtBackdrop(kind: post.kind, seed: post.id, shape: shape) }
      .overlay(alignment: .top) { content.frame(height: contentHeight).padding(.top, contentInset) }
      .overlay {
        if let artURL {
          AsyncImage(url: artURL) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
          }
        }
      }
      .clipped()
    .accessibilityHidden(true)
  }

  @ViewBuilder private var content: some View {
    switch post.kind {
    case .workout: workout
    case .recipe: recipe
    case .progress: progress
    }
  }

  // MARK: buổi tập — bảng điểm dưới đèn

  private var workout: some View {
    let w = post.workout
    let volume = CommunityCard.volumeText(w.volumeKg, unit: unit, locale: .app)
    let (n, u) = Self.split(
      volume ?? w.minutes.map { "\(CommunityCard.number($0)) \(String(localized: "community.stat.minutes"))" } ?? "")
    return VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        if shape != .square {
          GlassTag(text: w.title ?? String(localized: "community.workout"))
        }
        Spacer(minLength: 0)
        if w.pr, shape != .square { RecordChip() }
      }
      Spacer(minLength: 0)
      HStack(alignment: .firstTextBaseline, spacing: 3) {
        Text(verbatim: n)
          .font(.system(size: big, weight: .heavy).monospacedDigit())
          .fontWidth(.condensed)
          .tracking(shape == .wide ? -1 : -0.3)
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.35), radius: 8, y: 2)
        Text(verbatim: u)
          .font(.system(size: shape == .wide ? 20 : 12, weight: .semibold))
          .foregroundStyle(.white.opacity(0.7))
      }
      .lineLimit(1).minimumScaleFactor(0.5)
      if shape == .wide {
        Text(verbatim: PostArtTile.workoutLine(w))
          .font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.7)).padding(.top, 2)
      } else if shape == .square, w.pr {
        RecordChip().padding(.top, 4)
      }
    }
    .padding(pad)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  // MARK: món — vòng ba chất

  private var recipe: some View {
    let r = post.recipe
    let kcal = r?.kcal ?? 0
    return Group {
      if shape == .wide {
        HStack(alignment: .center, spacing: 16) {
          VStack(alignment: .leading, spacing: 8) {
            if let t = r?.title, !t.isEmpty { GlassTag(text: t) }
            Spacer(minLength: 0)
            if kcal > 0 {
              HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: CommunityCard.grouped(kcal, locale: .app))
                  .font(.system(size: 56, weight: .heavy).monospacedDigit()).fontWidth(.condensed).tracking(-1)
                Text(String(localized: "nc.kcal")).font(.system(size: 18, weight: .semibold)).opacity(0.75)
              }
              .foregroundStyle(.white)
              .shadow(color: .black.opacity(0.25), radius: 8, y: 2)
            }
            if let r { macroLine(r) }
          }
          Spacer(minLength: 0)
          if let r { MacroRing(protein: r.protein, carbs: r.carbs, fat: r.fat, size: 104, line: 12) }
        }
        .padding(pad)
      } else {
        VStack(spacing: 6) {
          if let r {
            ZStack {
              MacroRing(protein: r.protein, carbs: r.carbs, fat: r.fat, size: shape == .square ? 62 : 70, line: 7)
              Image(systemName: "fork.knife").font(.system(size: shape == .square ? 18 : 20, weight: .semibold))
                .foregroundStyle(.white)
            }
          }
          if kcal > 0 {
            Text(verbatim: RecipePostBody.kcal(kcal))
              .font(.system(size: 12, weight: .bold).monospacedDigit())
              .foregroundStyle(.white)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }

  private func macroLine(_ r: CommunityPayloads.Recipe) -> some View {
    HStack(spacing: 6) {
      ForEach(
        [("P", r.protein, MacroRing.tints[0]), ("C", r.carbs, MacroRing.tints[1]), ("F", r.fat, MacroRing.tints[2])],
        id: \.0
      ) { label, grams, tint in
        HStack(spacing: 4) {
          Circle().fill(tint).frame(width: 6, height: 6)
          Text(verbatim: "\(label) \(CommunityCard.grouped(grams, locale: .app))g")
        }
        .font(.system(size: 12, weight: .semibold).monospacedDigit())
        .foregroundStyle(.white)
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(.ultraThinMaterial.opacity(0.7), in: Capsule())
        .environment(\.colorScheme, .dark)
      }
    }
  }

  // MARK: tiến bộ — đường sáng, vùng mờ, điểm cuối phát sáng

  private var progress: some View {
    let tile = post.progress.flatMap { CommunityCard.tiles($0, unit: unit).first }
    return ZStack(alignment: .topLeading) {
      if let tile, tile.series.count >= 2 {
        TrendGlow(series: tile.series, line: shape == .wide ? 3 : 2.2)
          .padding(.top, shape == .wide ? 90 : shape == .grid ? 46 : 40)
      }
      VStack(alignment: .leading, spacing: 6) {
        if let tile {
          if shape == .wide {
            HStack {
              GlassTag(text: ProgressPostBody.label(tile))
              Spacer(minLength: 0)
              Text(verbatim: "\(tile.startText) → \(tile.endText)")
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle(.white.opacity(0.8))
            }
            .lineLimit(1)
          }
          Text(verbatim: tile.deltaText)
            .font(.system(size: shape == .wide ? 56 : big, weight: .heavy).monospacedDigit())
            .fontWidth(.condensed)
            .tracking(-0.8)
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.25), radius: 8, y: 2)
            .lineLimit(1).minimumScaleFactor(0.5)
        }
        Spacer(minLength: 0)
      }
      .padding(pad)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  /// "5 bài · 42 phút".
  static func workoutLine(_ w: CommunityPayloads.Workout) -> String {
    var parts: [String] = []
    if w.exerciseCount > 0 {
      parts.append("\(CommunityCard.number(w.exerciseCount)) \(String(localized: "community.stat.exercises"))")
    }
    if let m = w.minutes { parts.append("\(CommunityCard.number(m)) \(String(localized: "community.stat.minutes"))") }
    return parts.joined(separator: " · ")
  }

  static func split(_ s: String) -> (String, String) {
    guard let i = s.firstIndex(of: " ") else { return (s, "") }
    return (String(s[..<i]), String(s[s.index(after: i)...]))
  }
}

/// Nền "ảnh": lưới chuyển màu theo chuyên mục + biểu tượng chìm + ánh sáng.
struct ArtBackdrop: View {
  let kind: CommunityFeed.Kind
  let seed: String
  let shape: PostArtTile.Shape

  /// Số nhỏ ổn định theo id bài (không dùng `hashValue` — đổi mỗi lần chạy).
  private var jitter: (Float, Float, Double) {
    let n = seed.unicodeScalars.reduce(UInt32(7)) { ($0 &* 31) &+ $1.value }
    let a = Float(n % 100) / 100, b = Float((n / 100) % 100) / 100
    return (0.35 + a * 0.3, 0.35 + b * 0.3, Double(n % 30) - 15)
  }

  var body: some View {
    let (cx, cy, tilt) = jitter
    ZStack {
      MeshGradient(
        width: 3, height: 3,
        points: [
          [0, 0], [0.5, 0], [1, 0],
          [0, 0.5], [cx, cy], [1, 0.5],
          [0, 1], [0.5, 1], [1, 1],
        ],
        colors: Self.palette(kind))
      // biểu tượng lớn chìm, lệch góc — như bóng đồ vật trong ảnh
      Image(systemName: Self.watermark(kind))
        .font(.system(size: shape == .wide ? 190 : shape == .grid ? 110 : 90, weight: .bold))
        .foregroundStyle(.white.opacity(kind == .workout ? 0.06 : 0.08))
        .rotationEffect(.degrees(-18 + tilt))
        .offset(x: shape == .wide ? 110 : 34, y: shape == .wide ? 30 : 24)
        .blendMode(.plusLighter)
      // ánh sáng trên, tối dưới
      LinearGradient(
        colors: [.white.opacity(0.14), .clear, .black.opacity(0.22)], startPoint: .top, endPoint: .bottom)
      // đèn phòng tập: quầng màu chuyên mục hắt từ góc trên
      RadialGradient(
        colors: [Self.glow(kind).opacity(0.55), Self.glow(kind).opacity(0.12), .clear], center: .topTrailing,
        startRadius: 0, endRadius: shape == .wide ? 300 : 140)
        .blendMode(.plusLighter)
      Grain(seed: UInt64(seed.unicodeScalars.reduce(UInt32(7)) { ($0 &* 31) &+ $1.value }))
    }
    .overlay {
      // viền kim loại mảnh bên trong
      Rectangle().strokeBorder(
        LinearGradient(colors: [.white.opacity(0.18), .white.opacity(0.02)], startPoint: .top, endPoint: .bottom),
        lineWidth: 0.75)
    }
  }

  static func watermark(_ k: CommunityFeed.Kind) -> String {
    switch k {
    case .workout: "dumbbell.fill"
    case .progress: "waveform.path.ecg"
    case .recipe: "leaf.fill"
    }
  }

  /// Nền tối trầm hơi ánh màu chuyên mục — "gym premium" (15/10).
  static func palette(_ k: CommunityFeed.Kind) -> [Color] {
    func c(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r, green: g, blue: b) }
    switch k {
    case .workout:
      return [
        c(0.10, 0.09, 0.09), c(0.14, 0.10, 0.11), c(0.30, 0.08, 0.12),
        c(0.07, 0.07, 0.07), c(0.12, 0.09, 0.10), c(0.18, 0.07, 0.09),
        c(0.03, 0.03, 0.03), c(0.06, 0.06, 0.06), c(0.09, 0.07, 0.08),
      ]
    case .progress:
      return [
        c(0.07, 0.09, 0.13), c(0.10, 0.14, 0.21), c(0.16, 0.24, 0.38),
        c(0.05, 0.07, 0.10), c(0.09, 0.13, 0.20), c(0.12, 0.19, 0.29),
        c(0.03, 0.04, 0.06), c(0.05, 0.07, 0.10), c(0.07, 0.10, 0.15),
      ]
    case .recipe:
      return [
        c(0.11, 0.08, 0.06), c(0.18, 0.11, 0.06), c(0.40, 0.20, 0.07),
        c(0.08, 0.06, 0.04), c(0.15, 0.09, 0.05), c(0.25, 0.13, 0.06),
        c(0.04, 0.03, 0.02), c(0.07, 0.05, 0.04), c(0.10, 0.07, 0.05),
      ]
    }
  }

  /// Màu "đèn" hắt từ góc trên.
  static func glow(_ k: CommunityFeed.Kind) -> Color {
    switch k {
    case .workout: Color(red: 0.95, green: 0.25, blue: 0.32)
    case .progress: Color(red: 0.35, green: 0.58, blue: 0.95)
    case .recipe: Color(red: 1.0, green: 0.55, blue: 0.18)
    }
  }
}

/// Hạt nhám rất nhẹ — mặt ảnh có chất liệu, không phẳng lì. Cố định theo
/// hạt giống để không nhấp nháy khi cuộn.
private struct Grain: View {
  let seed: UInt64

  var body: some View {
    Canvas { ctx, size in
      var x = seed | 1
      func next() -> Double {
        x ^= x << 13; x ^= x >> 7; x ^= x << 17
        return Double(x % 10_000) / 10_000
      }
      let n = min(1600, Int(size.width * size.height / 70))
      for _ in 0..<n {
        let r = CGRect(x: next() * size.width, y: next() * size.height, width: 1, height: 1)
        ctx.fill(Path(r), with: .color(.white.opacity(0.03 + next() * 0.07)))
      }
    }
    .drawingGroup()
    .allowsHitTesting(false)
  }
}

/// Nhãn chữ hoa trên mặt kính mờ.
private struct GlassTag: View {
  let text: String

  var body: some View {
    Text(verbatim: text)
      .font(.system(size: 11, weight: .bold)).tracking(1.2).textCase(.uppercase)
      .foregroundStyle(.white)
      .lineLimit(1)
      .padding(.horizontal, 9).padding(.vertical, 5)
      .background(.ultraThinMaterial.opacity(0.8), in: Capsule())
      .overlay { Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 0.5) }
      .environment(\.colorScheme, .dark)
  }
}

/// Vòng ba chất (đạm · tinh bột · béo) theo kcal mỗi chất.
private struct MacroRing: View {
  let protein: Double
  let carbs: Double
  let fat: Double
  let size: CGFloat
  let line: CGFloat

  static let tints: [Color] = [.white, Color(red: 1, green: 0.88, blue: 0.62), Color(red: 1, green: 0.72, blue: 0.62)]

  var body: some View {
    let parts = [protein * 4, carbs * 4, fat * 9]
    let total = max(parts.reduce(0, +), 1)
    let gap = 0.012
    ZStack {
      Circle().stroke(.white.opacity(0.18), lineWidth: line)
      ForEach(0..<3, id: \.self) { i in
        let start = parts[..<i].reduce(0, +) / total
        let end = start + parts[i] / total
        Circle()
          .trim(from: start + gap, to: max(start + gap, end - gap))
          .stroke(Self.tints[i], style: StrokeStyle(lineWidth: line, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
    }
    .frame(width: size, height: size)
    .shadow(color: .black.opacity(0.2), radius: 6, y: 2)
  }
}

/// Đường tiến bộ: vùng sáng mờ dưới đường, điểm cuối phát sáng.
private struct TrendGlow: View {
  let series: [Double]
  let line: CGFloat

  var body: some View {
    let points = Array(series.enumerated())
    let lo = series.min() ?? 0, hi = series.max() ?? 1
    let floor = lo - max(hi - lo, 0.001) * 0.6
    Chart {
      ForEach(points, id: \.offset) { p in
        // vùng từ đáy chuỗi (không từ 0 — từ 0 thì đường bị ép phẳng)
        AreaMark(x: .value("i", p.offset), yStart: .value("lo", floor), yEnd: .value("v", p.element))
          .foregroundStyle(
            LinearGradient(colors: [.white.opacity(0.32), .white.opacity(0)], startPoint: .top, endPoint: .bottom))
          .interpolationMethod(.monotone)
        LineMark(x: .value("i", p.offset), y: .value("v", p.element))
          .foregroundStyle(.white)
          .lineStyle(StrokeStyle(lineWidth: line, lineCap: .round))
          .interpolationMethod(.monotone)
      }
      if let last = points.last {
        PointMark(x: .value("i", last.offset), y: .value("v", last.element))
          .symbolSize(line * 28)
          .foregroundStyle(.white)
          .shadow(color: .white.opacity(0.9), radius: 6)
      }
    }
    .chartXAxis(.hidden).chartYAxis(.hidden)
    .chartYScale(domain: floor...(hi + max(hi - lo, 0.001) * 0.15))
    .chartXScale(range: .plotDimension(startPadding: 0, endPadding: line * 6))
  }
}

/// Nhoè dần chính ảnh (progressive blur) — không phủ màu (15/10, chủ dự án: "làm
/// cho ảnh blur chứ bạn thêm lớp phủ nhìn không tự nhiên"). Ảnh trải xuống dưới
/// phần chữ; từ `start` trở xuống, một bản nhoè của chính nó hiện dần qua `ramp`.
private struct ProgressiveBlur: ViewModifier {
  let start: CGFloat
  var ramp: CGFloat = 70
  var radius: CGFloat = 22

  func body(content: Content) -> some View {
    content.overlay {
      content
        .blur(radius: radius, opaque: true)
        .mask {
          VStack(spacing: 0) {
            Color.clear.frame(height: start)
            LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: ramp)
            Color.black
          }
        }
        .allowsHitTesting(false)
    }
  }
}

/// Mặt thẻ chung: trắng, bo 22, viền mảnh; màu "đèn" của ảnh tràn nhẹ xuống mặt
/// chữ, viền trên sáng hơn viền dưới như mép kính bắt sáng. (Quầng màu phía sau
/// thẻ đã gỡ 15/10 theo chủ dự án.)
private struct NewsCardSurface: ViewModifier {
  var kind: CommunityFeed.Kind?
  @Environment(\.colorScheme) private var scheme

  private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 22, style: .continuous) }

  func body(content: Content) -> some View {
    let dark = scheme == .dark
    content
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        ZStack {
          DS.Color.card.swiftUI
          if let kind {
            RadialGradient(
              colors: [ArtBackdrop.glow(kind).opacity(dark ? 0.22 : 0.10), .clear], center: .top, startRadius: 40,
              endRadius: 460)
          }
        }
      }
      .clipShape(shape)
      .overlay {
        shape.strokeBorder(
          LinearGradient(
            colors: [.white.opacity(dark ? 0.16 : 0.9), DS.Color.foreground.swiftUI.opacity(dark ? 0.04 : 0.06)],
            startPoint: .top, endPoint: .bottom),
          lineWidth: 0.75)
      }
      .shadow(color: .black.opacity(dark ? 0.25 : 0.05), radius: 10, y: 4)
      .contentShape(shape)
  }
}

/// Thẻ lớn: dải chuyên mục, ảnh rộng, tác giả, tiêu đề đậm, đáy.
struct HeroPostCard: View {
  static let art: CGFloat = 220
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  /// Mở bài — chỉ phần trên đáy; tim / "⋯" ở đáy là nút riêng.
  var open: () -> Void = {}

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Ảnh trải cả thẻ — cả dải chuyên mục lẫn phần chữ (chữ sáng) nằm trên
      // chính ảnh; đáy là ảnh đã nhoè, không có đường cắt nào.
      VStack(alignment: .leading, spacing: 0) {
        CategoryBand(post: post)
        VStack(alignment: .leading, spacing: 6) {
          Color.clear.frame(height: Self.art)
          FeedAuthor(post: post)
          Text(verbatim: PostHeadline.text(post))
            .font(.system(size: 22, weight: .bold)).tracking(-0.4)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
          // Hành động nằm dưới tiêu đề, căn trái như thẻ hàng (15/10, chủ dự án: "sắp
          // xếp bố cục cho chuẩn") — không nổi giữa vùng số.
          CardAction(post: post).padding(.top, 2)
        }
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
        .onTapGesture(perform: open)
        .accessibilityAddTraits(.isButton)
        FeedFooter(post: post).padding(.horizontal, 16).padding(.bottom, 6)
      }
      .environment(\.colorScheme, .dark)
      .background {
        PostArtTile(post: post, artURL: artURL, unit: unit, shape: .wide, contentHeight: Self.art, contentInset: 32)
          .modifier(ProgressiveBlur(start: Self.art - 8))
      }
    }
    .modifier(NewsCardSurface(kind: post.kind))
  }
}

/// Thẻ hàng (đúng mẫu Apple News chủ dự án gửi): tiêu đề trái, ảnh vuông phải.
struct RowPostCard: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit
  /// Trang cá nhân: tác giả đã ở thẻ vận động viên — không lặp lại trên từng bài.
  var showsAuthor = true
  var open: () -> Void = {}

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        CategoryBand(post: post)
        HStack(alignment: .top, spacing: 14) {
          VStack(alignment: .leading, spacing: 6) {
            if showsAuthor { FeedAuthor(post: post) }
            Text(verbatim: PostHeadline.text(post))
              .font(.system(size: 19, weight: .bold)).tracking(-0.3)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(4)
              .fixedSize(horizontal: false, vertical: true)
            CardAction(post: post, onArt: false).padding(.top, 2)
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
    .modifier(NewsCardSurface(kind: post.kind))
  }
}

/// Thẻ nhỏ của lưới hai cột.
struct GridPostCard: View {
  let post: CommunityFeed.Post
  let artURL: URL?
  let unit: WeightUnit

  var body: some View {
    let cat = CommunityLayout.Category.of(post.kind)
    VStack(alignment: .leading, spacing: 4) {
      Color.clear.frame(height: 124)
      HStack(spacing: 4) {
        CategoryGlyph(cat: cat, size: 10)
        Text(verbatim: cat.title).font(.system(size: 12, weight: .bold))
      }
      .foregroundStyle(cat.ink)
      Text(verbatim: PostHeadline.text(post))
        .font(.system(size: 16, weight: .bold)).tracking(-0.2)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(3)
        .frame(maxWidth: .infinity, alignment: .leading)
      Spacer(minLength: 0)
      Text(verbatim: "\(PostHeaderView.agoText(post.createdAt)) · \(post.author?.displayName ?? "—")")
        .font(.system(size: 12))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
    }
    .padding([.horizontal, .bottom], 12)
    .frame(maxHeight: .infinity, alignment: .top)
    .environment(\.colorScheme, .dark)
    .background {
      PostArtTile(post: post, artURL: artURL, unit: unit, shape: .grid, contentHeight: 124)
        .modifier(ProgressiveBlur(start: 96, ramp: 50, radius: 18))
    }
    .modifier(NewsCardSurface(kind: post.kind))
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
                CategoryGlyph(cat: cat, size: 10)
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
