import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ tập luyện (#527 N3) — `TrainingCard` của `today-widgets-2.tsx:400`
/// @ fac9ac2 trên `TrainingCardBook`, mở từ hàng "Tập luyện tuần này" của Hôm
/// nay (`docs/design/today/RN-PARITY.md`: thẻ đầy đủ là một màn riêng, hàng
/// chỉ báo phần trăm).
///
/// Như RN, theo thứ tự: câu kết luận (tô màu vùng) và việc nên làm → hai số
/// nó so (tải 7 ngày / tuần thói quen, tổng tạ in nhỏ) → ngày tập cơ so với
/// mục tiêu → ghi chú khi buổi gần nhất đã quá 7 ngày → biểu đồ 8 tuần với
/// vạch thói quen vẽ SAU các cột → buổi gần nhất (chạm → lịch sử). Chưa ghi
/// buổi nào là một trạng thái có chữ, không phải thẻ biến mất.
///
/// Khác RN (`NATIVE_IMPROVEMENTS.md`): đang tải là một vòng chờ, không vẽ
/// trạng thái "chưa có buổi nào" trong lúc truy vấn chưa về; đọc hỏng lần đầu
/// là lỗi + thử lại; chữ đủ vi / en / es (RN chỉ vi / en); "1 set" số ít.
struct TrainingCardView: View {
  let book: TrainingCardBook
  /// ACWR engine đã ghi cho hôm nay (`daily_logs.acwr`); `nil` = chưa có.
  let acwr: Double?

  @Environment(\.weightUnit) private var unit
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(WorkoutFlow.self) private var flow: WorkoutFlow?
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var showsHelp = false
  @State private var showsHistory = false

  var body: some View {
    ScrollView {
      Group {
        switch book.phase {
        case .loading:
          DSLoadingView().frame(maxWidth: .infinity, minHeight: 240)
        case .failed:
          DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
        case .ready:
          DSCard { content(book.card(acwr: acwr, goal: goal)) }
        }
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(Text(String(localized: "tc.title")))
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button { showsHelp = true } label: {
          Image(systemName: "questionmark.circle").frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text(String(localized: "tc.help.a11y")))
      }
    }
    .refreshable { await book.load() }
    .sheet(isPresented: $showsHelp) { TrainingExplainerSheet() }
    .navigationDestination(isPresented: $showsHistory) {
      if let history = flow?.history { WorkoutHistoryView(book: history) }
    }
    // Luôn đọc lại khi mở: buổi vừa ghi phải vào thẻ ngay (sổ giữ thẻ cũ trong
    // lúc đọc, nên không nháy về trạng thái tải).
    .task { await book.load() }
  }

  /// `profile === undefined` của RN: hồ sơ chưa nạp thì dòng ngày tập cơ đợi.
  private var goal: TrainingCard.Goal {
    guard let profile, profile.loaded else { return .unloaded }
    return .loaded(profile.profile?.goal)
  }

  @ViewBuilder private func content(_ card: TrainingCard.Card?) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      if let card {
        if card.hasPR { prBadge }
        verdict(card)
        compare(card)
        if card.showStrength, let target = card.strengthTarget { strength(done: card.strengthDone, target: target) }
        if card.latest.stale {
          Text(String(localized: "tc.stale \(card.latest.age)"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        if card.showTrend { trend(card) }
        latest(card.latest)
      } else {
        Text(String(localized: "tc.empty"))
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: - Phần của thẻ

  private var prBadge: some View {
    Label(String(localized: "tc.pr"), systemImage: "trophy.fill")
      .font(DS.TextStyle.caption.weight(.semibold))
      .foregroundStyle(DS.Color.readinessYellow.swiftUI)
      .padding(.horizontal, DS.Spacing.sm)
      .padding(.vertical, 4)
      .background(Capsule().fill(DS.Color.readinessYellow.swiftUI.opacity(0.14)))
  }

  /// Màu vùng khi có kết luận; không có thì cột mới nhất vẽ như mọi cột.
  private func tint(_ card: TrainingCard.Card) -> Color {
    card.judged ? ReadinessCardView.toneColor(card.zone.tone) : DS.Color.foreground.swiftUI.opacity(0.20)
  }

  @ViewBuilder private func verdict(_ card: TrainingCard.Card) -> some View {
    if card.judged {
      let line =
        card.percent == 0
        ? String(localized: "tc.verdict.same")
        : card.heavier
          ? String(localized: "tc.verdict.heavier \(card.percent)")
          : String(localized: "tc.verdict.lighter \(card.percent)")
      VStack(alignment: .leading, spacing: 4) {
        Text(verbatim: line)
          .font(DS.TextStyle.headline)
          .foregroundStyle(tint(card))
        Text(Self.advice(card.zone))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.8))
      }
      .padding(DS.Spacing.sm + 2)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint(card).opacity(0.08)))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(tint(card).opacity(0.27), lineWidth: 1))
      .accessibilityElement(children: .combine)
    } else {
      Text(String(localized: "tc.needHistory"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func compare(_ card: TrainingCard.Card) -> some View {
    let sessions =
      card.weekSessions == 1 ? String(localized: "tc.sessions.one") : String(localized: "tc.sessions \(card.weekSessions)")
    let weekSub = card.weekVolume > 0 ? "\(sessions) · \(kg(card.weekVolume))" : sessions
    let habitBase = String(localized: "tc.habit.sub")
    let habitSub = card.habitVolume > 0 ? "\(habitBase) · \(kg(card.habitVolume))" : habitBase
    // Cỡ chữ trợ năng: hai ô chồng lên nhau, vạch ngăn nằm ngang — hai cột ở
    // cỡ đó chỉ còn một từ mỗi dòng.
    let stacked = typeSize.isAccessibilitySize
    let layout =
      stacked
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Spacing.sm))
      : AnyLayout(HStackLayout(alignment: .top, spacing: DS.Spacing.md))
    return layout {
      cell(String(localized: "tc.week.label"), Self.int(card.weekLoad), weekSub, muted: false)
      Rectangle().fill(DS.Color.foreground.swiftUI.opacity(0.1))
        .frame(width: stacked ? nil : 1, height: stacked ? 1 : nil)
        .accessibilityHidden(true)
      cell(String(localized: "tc.habit.label"), card.habitLoad > 0 ? Self.int(card.habitLoad) : "—", habitSub, muted: true)
    }
    .fixedSize(horizontal: false, vertical: true)
  }

  private func cell(_ label: String, _ value: String, _ sub: String, muted: Bool) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(verbatim: value)
        .font(.custom("Menlo", size: 22, relativeTo: .title2).weight(.semibold))
        .foregroundStyle(muted ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
      Text(verbatim: sub)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  /// Chấm là mục tiêu, tô bằng số đã tập; vượt mục tiêu thì chấm thôi tô thêm
  /// và con số mang phần dư — sàn sức khoẻ, không phải bảng điểm.
  private func strength(done: Int, target: Int) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "tc.strength.label"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 4) {
        ForEach(0..<target, id: \.self) { i in
          Circle()
            .fill(i < done ? DS.Color.readinessGreen.swiftUI : DS.Color.foreground.swiftUI.opacity(0.12))
            .frame(width: 8, height: 8)
        }
      }
      .accessibilityHidden(true)
      Text(verbatim: "\(done)/\(target)")
        .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(done >= target ? DS.Color.readinessGreen.swiftUI : DS.Color.foreground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }

  private func trend(_ card: TrainingCard.Card) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      (typeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout())) {
        Text(String(localized: "tc.trend.title"))
          .font(DS.TextStyle.footnote.weight(.semibold))
        if !typeSize.isAccessibilitySize { Spacer() }
        if card.habitVolume > 0 {
          HStack(spacing: 4) {
            DashedRule().frame(width: 14, height: 1)
            Text(String(localized: "tc.trend.habit \(kg(card.habitVolume))"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
      }
      // Vạch thói quen vẽ SAU các cột (overlay): vẽ trước thì cột che mất nó
      // đúng lúc tuần nào cũng sát thói quen — trường hợp nó tồn tại để giải thích.
      HStack(alignment: .bottom, spacing: 4) {
        ForEach(Array(card.trend.enumerated()), id: \.offset) { i, w in
          let last = i == card.trend.count - 1
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(
              w.volume == 0
                ? DS.Color.foreground.swiftUI.opacity(0.10)
                : last ? tint(card) : DS.Color.foreground.swiftUI.opacity(0.20)
            )
            .frame(height: card.barHeight(i))
            .frame(maxWidth: .infinity)
        }
      }
      .frame(height: TrainingCard.trendHeight, alignment: .bottom)
      .overlay(alignment: .bottom) {
        if let y = card.habitLine {
          DashedRule().frame(height: 1).offset(y: -y).allowsHitTesting(false)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "tc.trend.title")))
      .accessibilityValue(Text(verbatim: card.trend.map { kg($0.volume) }.joined(separator: ", ")))
      HStack {
        Text(String(localized: "tc.trend.start"))
        Spacer()
        Text(String(localized: "tc.trend.now")).fontWeight(.semibold)
      }
      .font(DS.TextStyle.caption)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  /// Buổi gần nhất — sự kiện bên dưới lời diễn giải, và lối sang các buổi khác.
  private func latest(_ l: TrainingCard.Latest) -> some View {
    let sets = l.sets == 1 ? String(localized: "tc.sets.one") : String(localized: "tc.sets \(l.sets)")
    var meta = "\(sets) · \(kg(l.volume))"
    if let rpe = l.rpe { meta += " · " + String(localized: "tc.effort \(Self.plain(rpe))") }
    return Button {
      showsHistory = flow?.history != nil
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        VStack(alignment: .leading, spacing: 2) {
          HStack {
            Text(verbatim: l.name ?? String(localized: "tc.latest.workout"))
              .font(DS.TextStyle.body.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1)
            Spacer()
            Text(verbatim: Self.when(l.age))
              .font(DS.TextStyle.caption)
              .foregroundStyle(l.stale ? DS.Color.readinessYellow.swiftUI : DS.Color.mutedForeground.swiftUI)
          }
          Text(verbatim: meta)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint(Text(String(localized: "tc.latest.a11y")))
  }

  // MARK: - Chữ

  /// `Math.round(displayWeight(v)).toLocaleString()` + nhãn đơn vị.
  private func kg(_ v: Double) -> String { "\(Self.int(unit.display(v))) \(unit.label)" }

  /// `Math.round(x).toLocaleString()` theo ngôn ngữ của app.
  static func int(_ x: Double) -> String {
    guard x.isFinite else { return "—" }
    return Int((x + 0.5).rounded(.down)).formatted(.number.locale(.app))
  }

  /// `${n}` của JS: 8 → "8", 8.5 → "8.5".
  static func plain(_ v: Double) -> String { v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : String(v) }

  /// "Hôm nay" / "Hôm qua" / "5 ngày trước".
  static func when(_ days: Int) -> String {
    switch days {
    case 0: String(localized: "tc.when.today")
    case 1: String(localized: "tc.when.yesterday")
    default: String(localized: "tc.when.ago \(days)")
    }
  }

  /// Mỗi vùng là một việc nên làm, không phải một chữ phải tự hiểu.
  static func advice(_ z: ReadinessCard.AcwrZone) -> String {
    switch z {
    case .detraining: String(localized: "tc.advice.detraining")
    case .low: String(localized: "tc.advice.low")
    case .optimal: String(localized: "tc.advice.optimal")
    case .elevated: String(localized: "tc.advice.elevated")
    case .spike: String(localized: "tc.advice.spike")
    }
  }
}

/// Vạch nét đứt của "thói quen" — cùng màu chữ phụ, không ăn chạm.
private struct DashedRule: View {
  var body: some View {
    GeometryReader { geo in
      Path { p in
        p.move(to: CGPoint(x: 0, y: 0.5))
        p.addLine(to: CGPoint(x: geo.size.width, y: 0.5))
      }
      .stroke(DS.Color.mutedForeground.swiftUI, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
    }
    .accessibilityHidden(true)
  }
}

/// Thẻ đang nói gì (#527 N3) — `training-explainer.tsx` @ fac9ac2. Năm băng
/// ĐỌC từ `ReadinessCard.AcwrZone` (cùng bảng thẻ vẽ theo), không gõ lại.
struct TrainingExplainerSheet: View {
  @Environment(\.dismiss) private var dismiss

  private struct Row: Identifiable {
    let term: String
    let body: String
    var id: String { term }
  }

  private let latestRows: [Row] = [
    Row(term: String(localized: "tx.latest.when.term"), body: String(localized: "tx.latest.when.body")),
    Row(term: String(localized: "tx.latest.sets.term"), body: String(localized: "tx.latest.sets.body")),
    Row(term: String(localized: "tx.latest.effort.term"), body: String(localized: "tx.latest.effort.body")),
    Row(term: String(localized: "tx.latest.volume.term"), body: String(localized: "tx.latest.volume.body")),
    Row(term: String(localized: "tx.latest.load.term"), body: String(localized: "tx.latest.load.body")),
    Row(term: String(localized: "tx.latest.noload.term"), body: String(localized: "tx.latest.noload.body")),
    Row(term: String(localized: "tx.latest.strength.term"), body: String(localized: "tx.latest.strength.body")),
  ]

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text(String(localized: "tx.lede")).font(DS.TextStyle.body)
          section(String(localized: "tx.top.title"))
          para(String(localized: "tx.top.body1"))
          para(String(localized: "tx.top.body2"))
          term(String(localized: "tx.habit.term"), String(localized: "tx.habit.body"))
          para(String(localized: "tx.acwr.name"))
          section(String(localized: "tx.chart.title"))
          para(String(localized: "tx.chart.body1"))
          para(String(localized: "tx.chart.body2"))
          section(String(localized: "tx.levels.title"))
          VStack(alignment: .leading, spacing: 6) {
            ForEach(ReadinessCard.AcwrZone.allCases, id: \.self) { z in
              HStack(spacing: DS.Spacing.sm) {
                Circle().fill(ReadinessCardView.toneColor(z.tone)).frame(width: 7, height: 7)
                  .accessibilityHidden(true)
                Text(verbatim: z.band)
                  .font(.custom("Menlo", size: 12, relativeTo: .caption))
                  .frame(width: 84, alignment: .leading)
                Text(Self.zoneWhat(z))
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              .accessibilityElement(children: .combine)
            }
          }
          Text(String(localized: "tx.bothEnds"))
            .font(DS.TextStyle.caption.italic())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          section(String(localized: "tx.latest.title"))
          ForEach(latestRows) { r in term(r.term, r.body) }
          section(String(localized: "tx.markers.title"))
          term(String(localized: "tc.pr"), String(localized: "tx.pr.body"))
          Text(String(localized: "tx.caveat"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(DS.Spacing.sm + 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(DS.Color.secondary.swiftUI))
        }
        .padding(DS.Spacing.md)
      }
      .ascndPage()
      .navigationTitle(Text(String(localized: "tc.title")))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "common.close")) { dismiss() }
        }
      }
    }
    .presentationDetents([.large])
  }

  private func section(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.caption.weight(.bold))
      .textCase(.uppercase)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.top, DS.Spacing.sm)
      .accessibilityAddTraits(.isHeader)
  }

  private func para(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func term(_ term: String, _ body: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(verbatim: term).font(DS.TextStyle.footnote.weight(.bold).monospacedDigit())
      Text(verbatim: body)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }

  static func zoneWhat(_ z: ReadinessCard.AcwrZone) -> String {
    switch z {
    case .detraining: String(localized: "tx.zone.detraining")
    case .low: String(localized: "tx.zone.low")
    case .optimal: String(localized: "tx.zone.optimal")
    case .elevated: String(localized: "tx.zone.elevated")
    case .spike: String(localized: "tx.zone.spike")
    }
  }
}
