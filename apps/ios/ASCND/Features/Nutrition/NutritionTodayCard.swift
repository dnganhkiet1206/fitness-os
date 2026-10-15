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
/// - ba trạng thái của vòng (dưới mục tiêu / trong dải +10 % / vượt), vòng
///   thứ hai khi vượt; còn lại / vừa đủ / thặng dư theo `NutritionToday.ring`;
/// - macro: chạm để lật giữa "đã ăn / mục tiêu" và "phần còn lại"; vượt quá
///   10 % thì chữ đỏ.
///
/// Khác RN (thiết kế lại 13/10, `docs/design/nutrition/REDESIGN.md`): giữa
/// vòng là SỐ CÒN LẠI thay cho số đã ăn; rãnh tô nhạt màu bữa thay cho xám; ba
/// thanh mảnh + một dòng chất xơ thay cho bốn ô 2×2; mục tiêu và đã ăn xuống
/// chân thẻ, cùng lối "7 ngày" (trước là thẻ riêng) và nút "?".
///
/// - nút "?" ở góc thẻ mở tấm giải thích mục tiêu calo; lời nhắc "Tập xong mà
///   số calo không tăng lên?" hiện tối đa 3 lần, thôi khi đã mở giải thích.
struct NutritionTodayCard: View {
  let book: NutritionTodayBook
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var showLeft = false
  @State private var helpOpen = false
  /// Lời nhắc "?" (`useHelpTopic('nutrition')`): tối đa 3 lần, thôi khi đã mở.
  @State private var nudge = false

  var body: some View {
    switch book.phase {
    case .loading:
      placeholder
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let totals):
      VStack(spacing: DS.Spacing.sm) {
        card(totals)
        if nudge { nudgeRow }
      }
      .sheet(isPresented: $helpOpen) { NutritionExplainerSheet() }
      .task {
        guard !nudge, ReadinessCardView.nudges.shouldNudge(HelpNudge.nutrition, userId: book.userId) else { return }
        nudge = true
        ReadinessCardView.nudges.noteNudged(HelpNudge.nutrition, userId: book.userId)
      }
    }
  }

  /// `openHelp`: tắt lời nhắc, mở giải thích, chủ đề này xong.
  private func openHelp() {
    nudge = false
    helpOpen = true
    ReadinessCardView.nudges.noteHelpOpened(HelpNudge.nutrition, userId: book.userId)
  }

  /// `HelpNudge`: dải chạm-để-mở và nút đóng là hai nút cạnh nhau.
  private var nudgeRow: some View {
    HStack(spacing: DS.Spacing.sm) {
      Button { openHelp() } label: {
        HStack(spacing: DS.Spacing.sm) {
          Image(systemName: "questionmark.circle")
            .font(.caption)
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
            .accessibilityHidden(true)
          Text(String(localized: "nc.nudge.text"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Button {
        // Ẩn không phải là đọc: lần hiện đã được đếm.
        nudge = false
      } label: {
        Image(systemName: "xmark")
          .font(.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "rd.nudge.dismiss")))
    }
    .padding(.horizontal, DS.Spacing.sm)
    .background(DS.Color.metricBlue.swiftUI.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  // MARK: - Thẻ

  /// Thẻ ngân sách (thiết kế lại 13/10, `docs/design/nutrition/REDESIGN.md`):
  /// vòng mang SỐ CÒN LẠI — câu người dùng hỏi — ba thanh macro bên cạnh,
  /// chân thẻ nói đã ăn / mục tiêu và mở xu hướng 7 ngày. Luật số không đổi
  /// (`NutritionToday.ring` / `tiles`). Chạm phần trên lật macro giữa "đã ăn /
  /// mục tiêu" và "còn lại" như RN.
  private func card(_ t: NutritionToday.Totals) -> some View {
    let target = NutritionToday.calorieTarget(profile?.profile)
    let ring = NutritionToday.ring(kcal: t.kcal, target: target)
    let tiles = NutritionToday.tiles(t, targets: NutritionToday.macroTargets(profile?.profile))
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Button {
        if reduceMotion { showLeft.toggle() } else { withAnimation(.easeInOut(duration: 0.25)) { showLeft.toggle() } }
      } label: {
        // Cỡ chữ trợ năng: vòng ở trên, macro chiếm cả bề ngang bên dưới.
        (typeSize.isAccessibilitySize
          ? AnyLayout(VStackLayout(alignment: .center, spacing: DS.Spacing.md))
          : AnyLayout(HStackLayout(alignment: .center, spacing: DS.Spacing.md))) {
          ringView(ring)
          VStack(alignment: .leading, spacing: 9) {
            ForEach(Array(zip(Macro.allCases, tiles)).prefix(3), id: \.0) { m, tile in
              barView(m, tile)
            }
            if let fiber = tiles.last { fiberLine(fiber) }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle(scale: 0.99))
      .sensoryFeedback(.selection, trigger: showLeft)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: summary(t, ring: ring, target: target, tiles: tiles)))
      .accessibilityHint(Text(String(localized: "nc.toggleHint")))

      Divider().opacity(0.6)
      footer(kcal: t.kcal, target: target)
    }
    .padding([.top, .horizontal], DS.Spacing.card)
    .padding(.bottom, DS.Spacing.xs)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
  }

  /// Chân thẻ: "Đã ăn N · mục tiêu M", nút "?" (giải thích mục tiêu), "7 ngày ›"
  /// (xu hướng — trước là một thẻ riêng dưới thẻ này).
  private func footer(kcal: Double, target: Double) -> some View {
    HStack(alignment: .center, spacing: DS.Spacing.xs) {
      Text(String(localized: "nc.footer \(DiaryView.whole(kcal)) \(DiaryView.whole(target))"))
        .font(DS.TextStyle.footnote.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(2)
        .minimumScaleFactor(0.85)
      Button { openHelp() } label: {
        Image(systemName: "questionmark.circle")
          .font(.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 32, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "nc.help")))
      Spacer(minLength: DS.Spacing.xs)
      NavigationLink(value: InsightsRoute(userId: book.userId)) {
        HStack(spacing: 2) {
          Text(String(localized: "nc.week"))
          Image(systemName: "chevron.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "insights.link")))
    }
  }

  /// Màu của vòng: màu bữa dưới mục tiêu, cam đậm trong dải, đỏ khi vượt.
  private func ringColor(_ band: NutritionToday.Band) -> Color {
    switch band {
    case .under: MascotRoomView.signalColor(.meal)
    case .inBand: DS.Color.metricOrange.swiftUI
    case .over: DS.Color.readinessRed.swiftUI
    }
  }

  /// Màu chữ của dòng trạng thái.
  private func tone(_ band: NutritionToday.Band) -> Color {
    switch band {
    case .under: DS.Color.foreground.swiftUI
    case .inBand: DS.Color.metricOrange.swiftUI
    case .over: DS.Color.readinessRed.swiftUI
    }
  }

  /// Vòng 104: rãnh tô nhạt màu bữa (rỗng vẫn là "chỗ để ăn", không phải khối
  /// xám), giữa vòng là số còn lại / vượt / vừa đủ.
  private func ringView(_ r: NutritionToday.Ring) -> some View {
    let color = ringColor(r.band)
    return ZStack {
      Circle().stroke(MascotRoomView.signalColor(.meal).opacity(0.16), lineWidth: 10)
      Circle()
        .trim(from: 0, to: r.fill / 100)
        .stroke(color, style: StrokeStyle(lineWidth: 10, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if r.overFill > 0 {
        Circle()
          .trim(from: 0, to: r.overFill / 100)
          .stroke(DS.Color.readinessRed.swiftUI, style: StrokeStyle(lineWidth: 4, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .padding(13)
      }
      VStack(spacing: 0) {
        switch r.line {
        case .remaining(let n):
          Text(verbatim: DiaryView.whole(n))
            .font(.custom("Menlo", size: 20, relativeTo: .title3).weight(.bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(String(localized: "nc.ring.left")).font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        case .surplus(let d):
          Text(verbatim: "+" + DiaryView.whole(d))
            .font(.custom("Menlo", size: 20, relativeTo: .title3).weight(.bold))
            .foregroundStyle(DS.Color.readinessRed.swiftUI)
          Text(String(localized: "nc.ring.over")).font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.readinessRed.swiftUI)
        case .onTarget:
          Image(systemName: "checkmark")
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(tone(r.band))
          Text(String(localized: "nc.ring.onTarget")).font(DS.TextStyle.caption)
            .foregroundStyle(tone(r.band))
        }
      }
      .lineLimit(1)
      .minimumScaleFactor(0.6)
      .padding(.horizontal, 14)
      // Vòng có cỡ cố định: chữ bên trong không lớn quá mức vòng chứa được.
      .dynamicTypeSize(...DynamicTypeSize.xLarge)
    }
    .frame(width: 104, height: 104)
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

  /// Một thanh macro: nhãn, "ăn/mục tiêu g" (hoặc "còn N g" khi lật), thanh 5pt.
  private func barView(_ m: Macro, _ tile: NutritionToday.Tile) -> some View {
    let overColor = tile.overHard ? DS.Color.readinessRed.swiftUI : m.tint
    return VStack(alignment: .leading, spacing: 4) {
      (typeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
        : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 4))) {
        Text(verbatim: m.label)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
        Text(verbatim: showLeft
          ? "\(tile.leftText) g \(wordText(tile.word))"
          : "\(Units.display(tile.eaten, locale: .app))/\(Units.display(tile.target, locale: .app)) g")
          .font(.custom("Menlo", size: 12, relativeTo: .footnote))
          .foregroundStyle(tile.over ? overColor : DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(m.tint.opacity(0.14))
          Capsule().fill(tile.over ? overColor : m.tint).frame(width: geo.size.width * tile.fill / 100)
        }
      }
      .frame(height: 5)
    }
  }

  /// Chất xơ: một dòng nhỏ dưới ba thanh — có mục tiêu, nhưng không phải ngân sách.
  private func fiberLine(_ tile: NutritionToday.Tile) -> some View {
    (typeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(spacing: 4))) {
      Text(verbatim: Macro.fiber.label)
      Text(verbatim: "\(Units.display(tile.eaten, locale: .app))/\(Units.display(tile.target, locale: .app)) g")
        .font(.custom("Menlo", size: 12, relativeTo: .footnote))
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
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
        : "\(m.label): \(Units.display(tile.eaten, locale: .app))/\(Units.display(tile.target, locale: .app))g")
    }
    return parts.joined(separator: ". ")
  }

  // MARK: - Đang tải

  /// Khung cùng hình với thẻ, không số nào.
  private var placeholder: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.md) {
        Circle().stroke(MascotRoomView.signalColor(.meal).opacity(0.16), lineWidth: 10).frame(width: 104, height: 104)
        VStack(alignment: .leading, spacing: 14) {
          ForEach(0..<3, id: \.self) { _ in
            RoundedRectangle(cornerRadius: 3).fill(DS.Color.muted.swiftUI).frame(height: 10)
          }
          RoundedRectangle(cornerRadius: 3).fill(DS.Color.muted.swiftUI).frame(width: 80, height: 8)
        }
      }
      Divider().opacity(0.6)
      RoundedRectangle(cornerRadius: 3).fill(DS.Color.muted.swiftUI).frame(width: 160, height: 10)
        .frame(minHeight: 44, alignment: .leading)
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "nc.loading")))
  }
}
