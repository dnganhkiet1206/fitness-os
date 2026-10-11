import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ Dinh dưỡng hôm nay trên tab Dinh dưỡng (#527) — `NutritionCard`
/// (`interactive`) của `components/ascnd/dashboard-cards.tsx` @ fac9ac2 trên
/// `NutritionTodayBook` + `NutritionToday`.
///
/// RN behavior (giữ nguyên):
/// - đang tải: khung giữ chỗ cùng hình, KHÔNG phải một vòng "0 / 2.200";
///   đọc hỏng: lời báo lỗi có thử lại thay cho thẻ;
/// - vòng calo 124 điểm, dải màu ấm dần theo ba trạng thái (dưới mục tiêu /
///   trong dải +10 % / vượt), vòng thứ hai khi vượt; giữa vòng là số calo;
/// - bên cạnh: "Mục tiêu: N kcal / P%" (P không kẹp) và một dòng — còn lại,
///   vừa đủ, hoặc thặng dư (màu của trạng thái);
/// - bốn ô macro một màu nền, màu ở icon và thanh; chạm thẻ để lật mọi ô giữa
///   "đã ăn / mục tiêu" và "phần còn lại"; vượt thì ghi chú nói "+N g vượt mục
///   tiêu", vượt quá 10 % thì chữ đỏ.
///
/// Khác RN: nút "?" giải thích mục tiêu calo và lời nhắc kèm theo chưa port.
struct NutritionTodayCard: View {
  let book: NutritionTodayBook
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var showLeft = false

  var body: some View {
    switch book.phase {
    case .loading:
      placeholder
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let totals):
      card(totals)
    }
  }

  // MARK: - Thẻ

  private func card(_ t: NutritionToday.Totals) -> some View {
    let target = NutritionToday.calorieTarget(profile?.profile)
    let ring = NutritionToday.ring(kcal: t.kcal, target: target)
    let tiles = NutritionToday.tiles(t, targets: NutritionToday.macroTargets(profile?.profile))
    return Button {
      if reduceMotion { showLeft.toggle() } else { withAnimation(.easeInOut(duration: 0.25)) { showLeft.toggle() } }
    } label: {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text(String(localized: "nc.title"))
          .font(DS.TextStyle.caption.weight(.bold))
          .textCase(.uppercase)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        HStack(spacing: DS.Spacing.lg) {
          ringView(ring, kcal: t.kcal)
          side(ring, target: target)
        }
        LazyVGrid(columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm) {
          ForEach(Array(zip(Macro.allCases, tiles)), id: \.0) { m, tile in
            tileView(m, tile)
          }
        }
      }
      .padding(DS.Spacing.card)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .sensoryFeedback(.selection, trigger: showLeft)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: summary(t, ring: ring, target: target, tiles: tiles)))
    .accessibilityHint(Text(String(localized: "nc.toggleHint")))
  }

  /// Dải màu của vòng theo trạng thái — mỗi chặng bắt đầu nơi chặng trước dừng.
  private func gradient(_ band: NutritionToday.Band) -> [Color] {
    switch band {
    case .under: [DS.Color.metricBeige.swiftUI, DS.Color.metricOrangeGraphic.swiftUI]
    case .inBand: [DS.Color.metricOrangeGraphic.swiftUI, DS.Color.metricRose.swiftUI]
    case .over: [DS.Color.metricRose.swiftUI, DS.Color.readinessRed.swiftUI]
    }
  }

  /// Màu chữ của "%" và dòng trạng thái.
  private func tone(_ band: NutritionToday.Band) -> Color {
    switch band {
    case .under: DS.Color.foreground.swiftUI
    case .inBand: DS.Color.metricOrange.swiftUI
    case .over: DS.Color.readinessRed.swiftUI
    }
  }

  private func ringView(_ r: NutritionToday.Ring, kcal: Double) -> some View {
    ZStack {
      Circle().stroke(DS.Color.ringTrack.swiftUI, lineWidth: 10)
      Circle()
        .trim(from: 0, to: r.fill / 100)
        .stroke(
          AngularGradient(colors: gradient(r.band), center: .center),
          style: StrokeStyle(lineWidth: 10, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if r.overFill > 0 {
        Circle()
          .trim(from: 0, to: r.overFill / 100)
          .stroke(DS.Color.readinessRed.swiftUI, style: StrokeStyle(lineWidth: 4, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .padding(13)
      }
      VStack(spacing: 0) {
        Image(systemName: "flame.fill")
          .font(.caption)
          .foregroundStyle(r.band == .over ? DS.Color.readinessRed.swiftUI : r.band == .inBand
            ? DS.Color.metricOrangeGraphic.swiftUI : DS.Color.foreground.swiftUI)
        Text(verbatim: DiaryView.whole(kcal))
          .font(DS.TextStyle.title.monospacedDigit())
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        Text(String(localized: "nc.kcal"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 14)
    }
    .frame(width: 124, height: 124)
  }

  private func side(_ r: NutritionToday.Ring, target: Double) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(spacing: 4) {
        Text(String(localized: "nc.target \(DiaryView.whole(target))"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(verbatim: "/").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(verbatim: "\(Units.text(r.percentOfTarget))%")
          .font(DS.TextStyle.footnote.weight(.bold).monospacedDigit())
          .foregroundStyle(tone(r.band))
        Image(systemName: "target").font(.caption).foregroundStyle(tone(r.band))
      }
      .fixedSize(horizontal: false, vertical: true)
      Text(verbatim: lineText(r.line))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(r.line == .onTarget || isSurplus(r.line) ? tone(r.band) : DS.Color.foreground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func isSurplus(_ l: NutritionToday.Line) -> Bool {
    if case .surplus = l { return true }
    return false
  }

  private func lineText(_ l: NutritionToday.Line) -> String {
    switch l {
    case .onTarget: String(localized: "nc.onTarget")
    case .surplus(let d): String(localized: "nc.surplus \(DiaryView.whole(d))")
    case .remaining(let n): String(localized: "nc.remaining \(DiaryView.whole(n))")
    }
  }

  // MARK: - Ô macro

  enum Macro: CaseIterable, Hashable {
    case protein, carbs, fat, fiber

    var label: String {
      switch self {
      case .protein: String(localized: "logMeal.protein")
      case .carbs: String(localized: "logMeal.carbs")
      case .fat: String(localized: "logMeal.fat")
      case .fiber: String(localized: "foods.fiber")
      }
    }

    /// `MACRO_TINT`: màu ở icon và thanh, không ở nền ô.
    var tint: Color {
      switch self {
      case .protein: DS.Color.metricRose.swiftUI
      case .carbs: DS.Color.metricOrangeGraphic.swiftUI
      case .fat: DS.Color.metricBlue.swiftUI
      case .fiber: DS.Color.readinessGreen.swiftUI
      }
    }

    var icon: String {
      switch self {
      case .protein: "fork.knife"
      case .carbs: "leaf"
      case .fat: "drop"
      case .fiber: "carrot"
      }
    }
  }

  private func tileView(_ m: Macro, _ tile: NutritionToday.Tile) -> some View {
    let overColor = tile.overHard ? DS.Color.readinessRed.swiftUI : m.tint
    return VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Image(systemName: m.icon).font(.caption).foregroundStyle(m.tint)
        Text(verbatim: m.label)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      if showLeft {
        Text(verbatim: "\(tile.leftText)g")
          .font(DS.TextStyle.headline.monospacedDigit())
          .foregroundStyle(tile.over ? overColor : DS.Color.foreground.swiftUI)
        Text(verbatim: wordText(tile.word))
          .font(DS.TextStyle.caption)
          .foregroundStyle(tile.over ? overColor : DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      } else {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          Text(verbatim: Units.text(tile.eaten)).font(DS.TextStyle.headline.monospacedDigit())
          Text(verbatim: "/\(Units.text(tile.target))g")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        Text(verbatim: tile.over
          ? String(localized: "nc.overNote \(tile.leftText)") : String(localized: "nc.eaten"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(tile.over ? overColor : DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(DS.Color.ringTrack.swiftUI)
          Capsule().fill(m.tint).frame(width: geo.size.width * tile.fill / 100)
        }
      }
      .frame(height: 4)
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
  }

  private func wordText(_ w: NutritionToday.Word) -> String {
    switch w {
    case .left: String(localized: "nc.left")
    case .done: String(localized: "nc.done")
    case .over: String(localized: "nc.over")
    }
  }

  /// VoiceOver đọc cả thẻ thành một câu: calo, mục tiêu, trạng thái, rồi bốn macro.
  private func summary(
    _ t: NutritionToday.Totals, ring: NutritionToday.Ring, target: Double, tiles: [NutritionToday.Tile]
  ) -> String {
    var parts = [
      String(localized: "nc.a11y.kcal \(DiaryView.whole(t.kcal)) \(DiaryView.whole(target)) \(Int(ring.percentOfTarget))"),
      lineText(ring.line),
    ]
    for (m, tile) in zip(Macro.allCases, tiles) {
      parts.append(showLeft
        ? "\(m.label): \(tile.leftText)g \(wordText(tile.word))"
        : "\(m.label): \(Units.text(tile.eaten))/\(Units.text(tile.target))g")
    }
    return parts.joined(separator: ". ")
  }

  // MARK: - Đang tải

  /// Khung cùng hình với thẻ, không số nào.
  private var placeholder: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      RoundedRectangle(cornerRadius: 4).fill(DS.Color.muted.swiftUI).frame(width: 90, height: 12)
      HStack(spacing: DS.Spacing.lg) {
        Circle().stroke(DS.Color.ringTrack.swiftUI, lineWidth: 10).frame(width: 124, height: 124)
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          RoundedRectangle(cornerRadius: 4).fill(DS.Color.muted.swiftUI).frame(height: 12)
          RoundedRectangle(cornerRadius: 4).fill(DS.Color.muted.swiftUI).frame(width: 100, height: 12)
        }
      }
      LazyVGrid(columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm) {
        ForEach(0..<4, id: \.self) { _ in
          RoundedRectangle(cornerRadius: DS.Radius.sm).fill(DS.Color.background.swiftUI).frame(height: 72)
        }
      }
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "nc.loading")))
  }
}
