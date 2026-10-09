import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn huy chương (#527) — `app/awards.tsx` @ fac9ac2 trên `AwardsBook`.
///
/// Như RN:
/// - đầu màn: ô huy chương vàng, "Đã đạt N / 29 huy chương", vòng phần trăm;
/// - tám nhóm theo miền (Buổi tập gộp `first_workout`), mỗi nhóm đếm "x/y";
/// - mỗi huy chương: đĩa theo hạng (chưa mở thì xám), mốc trên mặt đĩa
///   ("10K"), tên + mô tả theo ngôn ngữ app (`award-text.json`, chép máy từ
///   RN), thanh tiến độ "12 / 30" chỉ khi biết CẢ HAI đầu (nguồn hỏng không vẽ
///   thành 0%), ngày đạt + nút chia sẻ khi đã có;
/// - mở màn là xét và trao một lần (`checkAndGrant`), từng cái một.
///
/// Vừa trao: thêm vào hàng ăn mừng (`fireCelebration`) — pháo hoa + thẻ hiện ở
/// gốc Hôm nay — kèm một dòng + VoiceOver trên màn này. Khác RN: Koa chưa
/// "ăn mừng" theo (`triggerMascotAction`); RN
/// không báo lỗi đọc (vẽ như chưa có gì) — ở đây đọc hỏng là màn lỗi có thử lại.
struct AwardsView: View {
  let book: AwardsBook
  let lang: AppPreferences.Lang

  @Environment(AppServices.self) private var services

  var body: some View {
    content
      .navigationTitle(String(localized: "aw.title"))
      .task { if case .loading = book.phase { await book.load() } }
      .refreshable { await book.load() }
      .onChange(of: book.newlyGranted) { _, keys in
        // `enqueueAward` của `useCheckAwards`: chữ theo ngôn ngữ app, khoá để
        // thẻ vẽ ĐÚNG tấm đĩa. Thẻ tự đọc cho VoiceOver.
        for key in keys {
          guard let def = Awards.def(key) else { continue }
          let text = AwardText.text(key, lang: lang)
          services.celebrations.enqueue(
            title: text?.title ?? key, description: text?.desc ?? "", icon: def.icon, tier: def.tier.rawValue,
            awardKey: key)
        }
      }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView(message: String(localized: "aw.loading"))
    case .failed:
      DSErrorView(message: String(localized: "aw.loadFailed")) {
        Task { await book.load() }
      }
    case .ready:
      ScrollView {
        VStack(spacing: DS.Spacing.lg) {
          hero
          if !book.newlyGranted.isEmpty {
            ForEach(book.newlyGranted, id: \.self) { key in
              Label(
                String(localized: "aw.granted \(AwardText.text(key, lang: lang)?.title ?? key)"),
                systemImage: "sparkles"
              )
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.readinessYellow.swiftUI)
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
          ForEach(Awards.Domain.allCases, id: \.self) { domain($0) }
        }
        .padding(DS.Spacing.md)
      }
    }
  }

  // MARK: - Đầu màn

  private var hero: some View {
    let earned = book.earnedCount
    let total = Awards.catalogue.count
    let pct = Awards.percent(earned: earned, total: total)
    return VStack(spacing: DS.Spacing.sm) {
      Image(systemName: "medal.fill")
        .font(.system(size: 30))
        .foregroundStyle(MedalDisc.gold)
        .frame(width: 64, height: 64)
        .background(DS.Color.readinessYellow.swiftUI.opacity(0.12), in: RoundedRectangle(cornerRadius: DS.Radius.lg))
        .accessibilityHidden(true)
      Text(String(localized: "aw.hero \(earned) \(total)"))
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      ZStack {
        Circle().stroke(DS.Color.ringTrack.swiftUI, lineWidth: 4)
        Circle()
          .trim(from: 0, to: Double(pct) / 100)
          .stroke(
            LinearGradient(
              colors: [MedalDisc.gold, DS.Color.metricOrangeGraphic.swiftUI], startPoint: .topLeading,
              endPoint: .bottomTrailing),
            style: StrokeStyle(lineWidth: 4, lineCap: .round)
          )
          .rotationEffect(.degrees(-90))
        Text(verbatim: "\(pct)%").font(DS.TextStyle.headline.monospacedDigit())
      }
      .frame(width: 64, height: 64)
      .accessibilityHidden(true)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }

  // MARK: - Nhóm

  private func domain(_ d: Awards.Domain) -> some View {
    let list = d.awards
    let done = list.filter { book.earned[$0.key] != nil }.count
    // Mọi type trong một nhóm đọc cùng một nguồn — lấy type đầu là đủ.
    let current = Awards.current(d.types[0], book.sources)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: MedalDisc.symbol(list.first?.icon ?? "trophy"))
          .font(.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        Text(Self.domainName(d))
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Rectangle().fill(DS.Color.mutedForeground.swiftUI.opacity(0.2)).frame(height: 1)
        Text(verbatim: "\(done)/\(list.count)")
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
      LazyVGrid(columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm) {
        ForEach(list) { award in
          MedalCard(award: award, earned: book.earned[award.key], current: current, lang: lang)
        }
      }
    }
  }

  static func domainName(_ d: Awards.Domain) -> String {
    switch d {
    case .streak: String(localized: "aw.domain.streak")
    case .workouts: String(localized: "aw.domain.workouts")
    case .pr: String(localized: "aw.domain.pr")
    case .steps: String(localized: "aw.domain.steps")
    case .nutrition: String(localized: "aw.domain.nutrition")
    case .water: String(localized: "aw.domain.water")
    case .sleep: String(localized: "aw.domain.sleep")
    case .body: String(localized: "aw.domain.body")
    }
  }
}

/// Một thẻ huy chương (`MedalCard`).
private struct MedalCard: View {
  let award: Awards.Def
  let earned: EarnedAward?
  let current: Double?
  let lang: AppPreferences.Lang

  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let text = AwardText.text(award.key, lang: lang)
    let title = text?.title ?? earned?.title ?? ""
    let desc = text?.desc ?? earned?.description ?? ""
    let progress = Awards.progress(award, earned: earned != nil, current: current)
    VStack(spacing: DS.Spacing.xs) {
      MedalDisc(award: award, earned: earned != nil)
        .frame(width: 72, height: 72)
        .accessibilityHidden(true)
      Text(title)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(earned == nil ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        .lineLimit(1)
      Text(desc)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
        .lineLimit(2)
      if let progress, let current, let need = award.requirement {
        VStack(spacing: 2) {
          ProgressView(value: Swift.max(0.02, progress))
            .tint(MedalDisc.onSurface(award.tier, dark: scheme == .dark))
          Text(
            verbatim:
              "\(current.formatted(.number.locale(.app))) / \(need.formatted(.number.locale(.app)))"
          )
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      if let earned {
        HStack {
          if let at = earned.earnedAt {
            Text(verbatim: at.date.formatted(.dateTime.day().month(.abbreviated).year().locale(.app)))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          ShareLink(item: "🏅 \(title) — \(desc)! #ASCND") {
            Image(systemName: "square.and.arrow.up")
              .font(.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .accessibilityLabel(Text(String(localized: "aw.share.a11y")))
        }
      }
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(verbatim: "\(title). \(desc)"))
    .accessibilityValue(Text(a11yValue(progress: progress)))
  }

  private func a11yValue(progress: Double?) -> String {
    if let at = earned?.earnedAt {
      return String(localized: "aw.earnedOn \(at.date.formatted(.dateTime.day().month(.wide).year().locale(.app)))")
    }
    if progress != nil, let current, let need = award.requirement {
      return "\(String(localized: "aw.locked")), \(current.formatted(.number.locale(.app))) / \(need.formatted(.number.locale(.app)))"
    }
    return String(localized: "aw.locked")
  }
}

/// Đĩa huy chương (`Medal` của `medal.tsx`): vành chuyển màu dọc, mặt chuyển
/// màu xuyên tâm lệch trên trái, CÙNG một dáng theo miền ở hai bán kính
/// (`MedalGeometry`, tròn khi `nil`), vệt sáng chỉ trên mặt tròn, mốc lớn ở
/// giữa (glyph nhỏ phía trên, bỏ khi đĩa dưới 56 điểm); chưa mở thì xám.
struct MedalDisc: View {
  let type: String
  let tier: Awards.Tier
  let icon: String
  let requirement: Int?
  let earned: Bool

  init(type: String, tier: Awards.Tier, icon: String, requirement: Int?, earned: Bool) {
    self.type = type
    self.tier = tier
    self.icon = icon
    self.requirement = requirement
    self.earned = earned
  }

  init(award: Awards.Def, earned: Bool) {
    self.init(type: award.type, tier: award.tier, icon: award.icon, requirement: award.requirement, earned: earned)
  }

  /// `TIER_CONFIG` / `LOCKED`: (color, light, dark).
  static func metal(_ tier: Awards.Tier?) -> (Color, Color, Color) {
    switch tier {
    case .bronze?: (Color(hex: "#c47b3d"), Color(hex: "#e8a86a"), Color(hex: "#7d4a20"))
    case .silver?: (Color(hex: "#c7cad1"), Color(hex: "#f2f4f8"), Color(hex: "#7e828c"))
    case .gold?: (Color(hex: "#ffd93d"), Color(hex: "#fff3ab"), Color(hex: "#b0790a"))
    case .platinum?: (Color(hex: "#b45cff"), Color(hex: "#ddb0ff"), Color(hex: "#6b2fa0"))
    case nil: (Color(hex: "#4a4a55"), Color(hex: "#5c5c68"), Color(hex: "#2a2a31"))
    }
  }

  /// Màu hạng trên nền (`onLight` / `onDark`) — cho thanh tiến độ.
  static func onSurface(_ tier: Awards.Tier, dark: Bool) -> Color {
    switch tier {
    case .bronze: Color(hex: dark ? "#c47b3d" : "#8f4f1f")
    case .silver: Color(hex: dark ? "#c7cad1" : "#7f838d")
    case .gold: Color(hex: dark ? "#ffd93d" : "#a47a00")
    case .platinum: Color(hex: dark ? "#b45cff" : "#6f2da8")
    }
  }

  static var gold: Color { DS.Color.readinessYellow.swiftUI }

  var body: some View {
    let (color, light, dark) = Self.metal(earned ? tier : nil)
    let glyph = Color.white.opacity(earned ? 0.92 : 0.55)
    let rim = MedalGeometry.path(type: type, r: MedalGeometry.rimRadius)
    let face = MedalGeometry.path(type: type, r: MedalGeometry.faceRadius)
    GeometryReader { geo in
      let k = geo.size.width / 72
      ZStack {
        MedalShape(d: rim, r: MedalGeometry.rimRadius)
          .fill(LinearGradient(colors: [light, dark], startPoint: .top, endPoint: .bottom))
        MedalShape(d: face, r: MedalGeometry.faceRadius)
          .fill(
            RadialGradient(
              stops: [.init(color: light, location: 0), .init(color: color, location: 0.55), .init(color: dark, location: 1)],
              // `cx=36% cy=30% r=78%` của khung mặt đĩa (8…64), quy về hộp 72.
              center: UnitPoint(x: (8 + 0.36 * 56) / 72, y: (8 + 0.30 * 56) / 72), startRadius: 0,
              endRadius: 56 * k * 0.78)
          )
        if face == nil {
          MedalSheen().fill(Color.white.opacity(0.20))
        }
        if let mark = Awards.mark(requirement) {
          VStack(spacing: 0) {
            if geo.size.width >= 56 {
              Image(systemName: Self.symbol(icon)).font(.system(size: (13 * k).rounded()))
            }
            Text(verbatim: mark).font(.system(size: (22 * k).rounded(), weight: .heavy)).tracking(-k)
              .lineLimit(1).minimumScaleFactor(0.6)
          }
          .foregroundStyle(glyph)
        } else {
          Image(systemName: Self.symbol(icon)).font(.system(size: (30 * k).rounded())).foregroundStyle(glyph)
        }
      }
    }
  }

  /// Biểu tượng lucide của danh mục → SF Symbol gần nghĩa nhất.
  static func symbol(_ icon: String) -> String {
    switch icon {
    case "flame": "flame.fill"
    case "calendar-days": "calendar"
    case "calendar-check": "calendar.badge.checkmark"
    case "calendar-range": "calendar.circle.fill"
    case "sunrise": "sunrise.fill"
    case "medal": "medal.fill"
    case "gem": "diamond.fill"
    case "crown": "crown.fill"
    case "dumbbell": "dumbbell.fill"
    case "activity": "waveform.path.ecg"
    case "zap": "bolt.fill"
    case "shield": "shield.fill"
    case "trending-up": "chart.line.uptrend.xyaxis"
    case "trophy": "trophy.fill"
    case "footprints": "figure.walk"
    case "route": "point.topleft.down.to.point.bottomright.curvepath"
    case "mountain": "mountain.2.fill"
    case "utensils": "fork.knife"
    case "salad": "leaf.fill"
    case "chef-hat": "frying.pan.fill"
    case "droplet": "drop.fill"
    case "droplets": "drop.circle.fill"
    case "glass-water": "waterbottle.fill"
    case "moon": "moon.fill"
    case "moon-star": "moon.stars.fill"
    case "bed-double": "bed.double.fill"
    case "scale": "scalemass.fill"
    case "chart-line": "chart.xyaxis.line"
    case "target": "target"
    default: "trophy.fill"
    }
  }
}

/// Một dáng của `MedalGeometry` trong hộp 72×72, co theo khung vẽ; `nil` là
/// hình tròn bán kính `r` quanh tâm (36, 36).
struct MedalShape: Shape {
  let d: String?
  let r: Double

  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 72
    func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    guard let d else {
      return Path(ellipseIn: CGRect(x: rect.minX + (36 - r) * k, y: rect.minY + (36 - r) * k, width: 2 * r * k, height: 2 * r * k))
    }
    var p = Path()
    for c in MedalGeometry.commands(d) {
      switch c {
      case .move(let x, let y): p.move(to: pt(x, y))
      case .line(let x, let y): p.addLine(to: pt(x, y))
      case .quad(let cx, let cy, let x, let y): p.addQuadCurve(to: pt(x, y), control: pt(cx, cy))
      case .close: p.closeSubpath()
      }
    }
    return p
  }
}

/// Vệt sáng góc trên trái của mặt tròn (`MedalGeometry.sheen`).
struct MedalSheen: Shape {
  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 72
    var p = Path()
    p.addLines(MedalGeometry.sheen.map { CGPoint(x: rect.minX + $0.x * k, y: rect.minY + $0.y * k) })
    p.closeSubpath()
    return p
  }
}

/// Tên + mô tả huy chương (`AWARD_TEXT`), chép máy vào `award-text.json`
/// (`apps/ios/tools/award-text/gen.mjs --check`). `nil` khi khoá lạ — màn dùng
/// chữ đã lưu trong hàng (`awardText(key, lang, fallback)`).
enum AwardText {
  struct Entry: Decodable, Sendable {
    let title: [String: String]
    let desc: [String: String]
  }

  private struct File: Decodable {
    let awards: [String: Entry]
  }

  static let all: [String: Entry] = {
    guard let url = Bundle.main.url(forResource: "award-text", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let file = try? JSONDecoder().decode(File.self, from: data)
    else { return [:] }
    return file.awards
  }()

  static func text(_ key: String, lang: AppPreferences.Lang) -> (title: String, desc: String)? {
    guard let e = all[key], let t = e.title[lang.rawValue], let d = e.desc[lang.rawValue] else { return nil }
    return (t, d)
  }

  /// Tiếng Anh — giá trị lịch sử ghi vào hàng `awards` (RN: `text.title.en`).
  static func english(_ key: String) -> (title: String, description: String) {
    (all[key]?.title["en"] ?? key, all[key]?.desc["en"] ?? "")
  }
}
