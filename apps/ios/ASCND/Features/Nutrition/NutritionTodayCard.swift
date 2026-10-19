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
  /// Vòng / thanh chạy từ 0 lần đầu thẻ hiện.
  @State private var appeared = false
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

  /// Thẻ ngân sách (vẽ lại 19/10 lần hai, chủ dự án: "mục tiêu và calo còn lại
  /// bị trùng, nhiều màu quá, chưa có animation"): vòng mang SỐ CÒN LẠI; bên
  /// cạnh là ba hàng macro + chất xơ cùng MỘT màu nhấn (màu bữa; đỏ khi vượt);
  /// dưới là một dòng "Đã ăn N kcal · Đạt X% mục tiêu" — không lặp lại số mục
  /// tiêu (nó ở tấm giải thích). Vòng và thanh chạy từ 0 khi hiện, đổi mượt khi
  /// số đổi; số đổi bằng hiệu ứng đếm. Chạm lật "đã ăn / mục tiêu" ↔ "còn lại".
  private func card(_ t: NutritionToday.Totals) -> some View {
    let target = NutritionToday.calorieTarget(profile?.profile)
    let ring = NutritionToday.ring(kcal: t.kcal, target: target)
    let tiles = NutritionToday.tiles(t, targets: NutritionToday.macroTargets(profile?.profile))
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Button {
        if reduceMotion { showLeft.toggle() } else { withAnimation(.snappy(duration: 0.3)) { showLeft.toggle() } }
      } label: {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          (typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Spacing.md))
            : AnyLayout(HStackLayout(alignment: .center, spacing: DS.Spacing.lg))) {
            ringView(ring)
            // Bên cạnh vòng: đã ăn, số to — câu thứ hai người dùng hỏi.
            VStack(alignment: .leading, spacing: 2) {
              Label(String(localized: "nc.stat.eaten"), systemImage: "fork.knife")
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: DiaryView.whole(t.kcal))
                  .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                  .contentTransition(.numericText(value: t.kcal))
                Text(String(localized: "nc.kcal"))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              Text(String(localized: "nc.percentOfTarget \(Int(ring.percentOfTarget.rounded()))"))
                .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(tone(ring.band))
                .contentTransition(.numericText())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          // Macro: bốn viên gọn 2×2 (19/10 lần bốn — chủ dự án chọn "dòng chip
          // gọn"): "Đạm 35/121g", nền viên tô dần theo phần đã ăn.
          LazyVGrid(
            columns: typeSize.isAccessibilitySize
              ? [GridItem(.flexible())] : [GridItem(.flexible(), spacing: 8), GridItem(.flexible())],
            spacing: 8
          ) {
            ForEach(Array(zip(Macro.allCases, tiles)), id: \.0) { m, tile in
              macroChip(m, tile)
            }
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle(scale: 0.99))
      .sensoryFeedback(.selection, trigger: showLeft)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: summary(t, ring: ring, target: target, tiles: tiles)))
      .accessibilityHint(Text(String(localized: "nc.toggleHint")))

      Divider().opacity(0.6)
      footer
    }
    .padding([.top, .horizontal], DS.Spacing.card)
    .padding(.bottom, DS.Spacing.xs)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
    .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: t.kcal)
    .onAppear {
      guard !appeared else { return }
      if reduceMotion { appeared = true } else { withAnimation(.easeOut(duration: 0.8).delay(0.1)) { appeared = true } }
    }
  }

  /// Màu nhấn DUY NHẤT của thẻ (màu bữa) — 19/10: "thẻ bị nhiều màu quá".
  static var accent: Color { MascotRoomView.signalColor(.meal) }

  /// Một viên macro: "Đạm 35/121g" (hoặc "Đạm còn 86g" khi lật); nền viên tô
  /// màu nhấn theo phần đã ăn, chạy từ 0 khi hiện. Vượt quá 10 % thì đỏ.
  private func macroChip(_ m: Macro, _ tile: NutritionToday.Tile) -> some View {
    let color = tile.overHard ? DS.Color.readinessRed.swiftUI : Self.accent
    return HStack(spacing: 4) {
      Text(verbatim: m.label)
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer(minLength: 2)
      Text(verbatim: showLeft
        ? "\(tile.leftText)g \(wordText(tile.word))"
        : "\(Units.display(tile.eaten, locale: .app))/\(Units.display(tile.target, locale: .app))g")
        .font(DS.TextStyle.caption.weight(.medium).monospacedDigit())
        .foregroundStyle(tile.overHard ? DS.Color.readinessRed.swiftUI : DS.Color.foreground.swiftUI.opacity(0.7))
        .contentTransition(.numericText())
    }
    .lineLimit(1)
    .minimumScaleFactor(0.75)
    .padding(.horizontal, 12)
    .frame(minHeight: 36)
    .background {
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(DS.Color.secondary.swiftUI)
          Capsule().fill(color.opacity(0.28))
            .frame(width: geo.size.width * (appeared ? min(100, tile.fill) : 0) / 100)
        }
      }
    }
    .clipShape(Capsule())
  }



  /// Chân thẻ: "Mục tiêu tính thế nào?" (giải thích) và "7 ngày ›" (xu hướng).
  private var footer: some View {
    HStack(alignment: .center, spacing: DS.Spacing.xs) {
      Button { openHelp() } label: {
        Label(String(localized: "nc.howTarget"), systemImage: "questionmark.circle")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .frame(minHeight: 44)
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

  /// Màu của vòng: màu nhấn dưới mục tiêu và trong dải, đỏ khi vượt.
  private func ringColor(_ band: NutritionToday.Band) -> Color {
    switch band {
    case .under: Self.accent
    case .inBand: Self.accent
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

  /// Vòng 128: rãnh tô nhạt màu bữa (rỗng vẫn là "chỗ để ăn", không phải khối
  /// xám), giữa vòng là số còn lại / vượt / vừa đủ.
  private func ringView(_ r: NutritionToday.Ring) -> some View {
    let color = ringColor(r.band)
    return ZStack {
      Circle().stroke(MascotRoomView.signalColor(.meal).opacity(0.18), lineWidth: 13)
      Circle()
        .trim(from: 0, to: appeared ? r.fill / 100 : 0)
        .stroke(color, style: StrokeStyle(lineWidth: 13, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if r.overFill > 0 {
        Circle()
          .trim(from: 0, to: appeared ? r.overFill / 100 : 0)
          .stroke(DS.Color.readinessRed.swiftUI, style: StrokeStyle(lineWidth: 4, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .padding(16)
      }
      VStack(spacing: 0) {
        switch r.line {
        case .remaining(let n):
          Text(verbatim: DiaryView.whole(n))
            .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .contentTransition(.numericText(value: n))
          Text(String(localized: "nc.ring.left")).font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        case .surplus(let d):
          Text(verbatim: "+" + DiaryView.whole(d))
            .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
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
    .frame(width: 128, height: 128)
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
        Circle().stroke(MascotRoomView.signalColor(.meal).opacity(0.16), lineWidth: 13).frame(width: 128, height: 128)
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
