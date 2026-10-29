import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Tổng kết tuần (#527) — `app/weekly-review.tsx` @ fac9ac2 trên `WeeklyReviewBook`.
///
/// Số liệu như RN:
/// - lùi / tiến từng tuần (Thứ Hai → Chủ nhật), không quá tuần này;
/// - TB kcal, TB protein, TB giấc ngủ, khối lượng + số buổi, mức sẵn sàng + ACWR,
///   thực phẩm bổ sung (chỉ khi có kế hoạch), nước — % so với tuần trước ở kcal /
///   protein / khối lượng;
/// - tuần có dữ liệu: cột 7 ngày (kcal, giấc ngủ theo mục tiêu, khối lượng + đường
///   12 tuần), đường mức sẵn sàng, khuyến nghị tuần tới; tuần trống: "Chưa có dữ liệu".
///
/// Bố cục gọn (Kiệt duyệt mock v2, 29/10): một thẻ lịch tập có vòng 7 ngày, một thẻ
/// trung bình (hàng + thanh tới mục tiêu), một biểu đồ có nút chọn thay cho bốn
/// biểu đồ, Koa nhận xét trong một thẻ, khuyến nghị của app và của AI chung một
/// danh sách "Tuần tới". % so với tuần trước của kcal / protein chỉ còn trong
/// VoiceOver; của khối lượng vẫn hiện.
///
/// Khác RN / chưa có: lời khuyên ACWR theo băng của thẻ sẵn sàng (xem
/// `WeeklyReview`); câu khuyến nghị có cả tiếng Tây Ban Nha (RN: chỉ vi / en);
/// một nguồn đọc hỏng là màn lỗi có thử lại (RN vẽ số của phần đọc được); lỗi
/// phân tích AI hiện ngay trong thẻ, có thử lại (RN: hộp thoại).
///
/// Phân tích AI (`ai-weekly-review`) như RN: chỉ gọi khi bấm; tuần đã phân tích
/// thì hiện lại kết quả (nhớ theo tuần · ngôn ngữ · số ngày có dữ liệu); tóm tắt,
/// nhận xét theo miền (chấm màu theo `category`, không theo emoji của mô hình),
/// việc nên làm; rung "thành công" khi có kết quả.
struct WeeklyReviewView: View {
  let book: WeeklyReviewBook
  let lang: AppPreferences.Lang
  /// Lịch đã áp + lịch sử Gains cho khối "theo lịch" (GĐ2); `nil` ở preview.
  @Environment(WorkoutFlow.self) private var flow: WorkoutFlow?
  @Environment(AppServices.self) private var services: AppServices?
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.weightUnit) private var weightUnit
  @State private var chart: ChartKind = .kcal

  enum ChartKind: Hashable, CaseIterable {
    case kcal, sleep, training, readiness
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        weekNav
        planBlock
        content
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "wr.title"))
    .ascndPage()
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sensoryFeedback(.selection, trigger: book.weekOffset)
    .sensoryFeedback(.selection, trigger: chart)
    // Kết quả AI vừa về (`Haptics.success()` khi `analyze.data` có).
    .sensoryFeedback(.success, trigger: book.analysis(lang: lang.rawValue)) { _, new in
      guard case .ready = new else { return false }
      return true
    }
  }

  private var big: Bool { typeSize.isAccessibilitySize }
  /// Chuyển động chung của màn; `nil` khi bật Giảm chuyển động.
  private var motion: Animation? { DSMotion.animation(.snappy(duration: 0.35), reduceMotion: reduceMotion) }
  /// Đổi tab biểu đồ: lò xo hơi chậm, gần như không nảy, cho chiều cao thẻ.
  private var tabMotion: Animation? { DSMotion.animation(.spring(duration: 0.5, bounce: 0.12), reduceMotion: reduceMotion) }
  private var muted: Color { DS.Color.mutedForeground.swiftUI }
  /// Tuần đang chạy (không tiến được nữa): trung bình chưa tính hôm nay.
  private var running: Bool { !book.canGoForward }

  // MARK: - Tuần

  private var weekNav: some View {
    let start = book.weekStart
    let style = Date.FormatStyle().day().month(.abbreviated).locale(.app)
    let label = "\(start.calendarDate.formatted(style)) – \(start.adding(days: 6).calendarDate.formatted(style))"
    return HStack(spacing: 0) {
      Button {
        Task { await book.step(-1) }
      } label: {
        Image(systemName: "chevron.left").frame(width: 36, height: 44).contentShape(Rectangle())
      }
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .accessibilityLabel(Text(String(localized: "wr.prevWeek.a11y")))
      Text(verbatim: label)
        .font(DS.TextStyle.body.monospacedDigit())
        .foregroundStyle(muted)
      Button {
        Task { await book.step(1) }
      } label: {
        Image(systemName: "chevron.right").frame(width: 36, height: 44).contentShape(Rectangle())
      }
      .foregroundStyle(book.canGoForward ? DS.Color.foreground.swiftUI : muted.opacity(0.35))
      .disabled(!book.canGoForward)
      .accessibilityLabel(Text(String(localized: "wr.nextWeek.a11y")))
      Spacer(minLength: 0)
    }
    .padding(.leading, -10)
    .padding(.top, -DS.Spacing.sm)
  }

  // MARK: - Theo lịch (GĐ2)

  /// Mở đầu bằng lịch tập thật: buổi / đích, vòng 7 ngày (đã tập, có lịch, nghỉ),
  /// buổi dời, ngày nghỉ đã chọn, Gains tuần. Không thêm điểm số mới.
  @ViewBuilder private var planBlock: some View {
    if let flow, let library = flow.today.library, let history = services?.koaGainsHistory {
      let today = flow.today.today
      let s = KoaWeek.summary(weekStart: book.weekStart, today: today, library: library, history: history.days)
      let days = KoaWeek.days(
        weekStart: book.weekStart, today: today, library: library, trained: Set(history.days.map(\.date)))
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          let head = big ? AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Spacing.sm)) : AnyLayout(HStackLayout(alignment: .top))
          head {
            VStack(alignment: .leading, spacing: 2) {
              Text("wr.plan.title")
                .font(DS.TextStyle.caption)
                .foregroundStyle(muted)
              (Text(verbatim: "\(s.done) ")
                .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                + Text(String(localized: "wr.plan.of \(s.target)"))
                .font(DS.TextStyle.headline)
                .foregroundStyle(muted))
                .monospacedDigit()
                .contentTransition(.numericText(value: Double(s.done)))
                .animation(motion, value: s.done)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("wr.plan.title"))
            .accessibilityValue(Text(String(localized: "dp.week.count \(s.done) \(s.target)")))
            if !big { Spacer(minLength: DS.Spacing.sm) }
            Text(String(localized: "wr.plan.gainsPill \(s.gains)"))
              .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
              .foregroundStyle(DS.Color.readinessGreen.swiftUI)
              .padding(.horizontal, 10)
              .padding(.vertical, 5)
              .background(DS.Color.readinessGreen.swiftUI.opacity(0.16), in: Capsule())
              .padding(.top, big ? 0 : 4)
              .accessibilityLabel(Text(String(localized: "wr.plan.gains \(s.gains)")))
          }
          DayRing(days: days, today: today).id(book.weekStart)
          let notes = [
            s.moved > 0 ? String(localized: "wr.plan.moved \(s.moved)") : nil,
            s.chosenRest > 0 ? String(localized: "wr.plan.rest \(s.chosenRest)") : nil,
          ].compactMap { $0 }
          if !notes.isEmpty {
            Text(verbatim: notes.joined(separator: " · "))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(muted)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  static func dayLabel(_ d: KoaWeek.Day) -> String {
    let w = d.date.calendarDate.formatted(Date.FormatStyle().weekday(.wide).locale(.app))
    if d.trained { return String(localized: "wr.day.trained \(w)") }
    if d.planned { return String(localized: "wr.day.planned \(w)") }
    if d.rest { return String(localized: "wr.day.rest \(w)") }
    return String(localized: "wr.day.free \(w)")
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView(message: String(localized: "wr.loading"))
    case .failed:
      DSErrorView(message: String(localized: "wr.loadFailed")) {
        Task { await book.load() }
      }
    case .ready(let s):
      averages(s)
      if s.daysWithData > 0 {
        chartCard(s)
        if book.canAnalyze { aiSection.animation(motion, value: book.analysis(lang: lang.rawValue)) }
        nextWeek(s.recommendations)
      } else {
        DSCard {
          Text(String(localized: "wr.noData"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(muted)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }

  // MARK: - Trung bình

  /// Số theo ngôn ngữ của app (lỗi 21/10: "1950", "8.0h", "1.4L" cạnh "2.508",
  /// "121,7" ở mọi màn khác) và nước theo đơn vị người dùng chọn (oz / ml).
  @ViewBuilder private func averages(_ s: WeeklyReview.Summary) -> some View {
    let c = s.cards
    let oz = (services?.preferences.volumeUnit ?? .ml) == .oz
    let water: (String, String) = oz
      ? (Self.n(Water.displayVolume(s.avgWaterMl, .oz), 0), "/ \(Self.n(Water.displayVolume(s.waterTargetMl, .oz), 0)) oz")
      : (Self.n(s.avgWaterMl / 1000, 1), "/ \(Self.n(s.waterTargetMl / 1000, 1)) L")
    Text(String(localized: running ? "wr.avg.running" : "wr.avg.header"))
      .font(DS.TextStyle.footnote)
      .foregroundStyle(muted)
      .padding(.horizontal, DS.Spacing.xs)
      .padding(.bottom, -DS.Spacing.sm)
      .accessibilityAddTraits(.isHeader)
    DSCard {
      VStack(spacing: 0) {
        metricRow(
          icon: "flame.fill", tint: DS.Color.metricOrange.swiftUI, label: String(localized: "wr.metric.kcal"),
          value: Self.n(s.avgKcal, 0), sub: "/ \(Self.n(s.kcalTarget, 0))", fraction: s.avgKcal / s.kcalTarget,
          delta: c.kcal.delta, order: 0)
        rule
        metricRow(
          icon: "fork.knife", tint: DS.Color.readinessYellowGraphic.swiftUI,
          label: String(localized: "wr.metric.protein"), value: Self.n(s.avgProtein, 0),
          sub: "/ \(Self.n(s.proteinTarget, 0)) g", fraction: s.avgProtein / s.proteinTarget, delta: c.protein.delta, order: 1)
        rule
        metricRow(
          icon: "moon.fill", tint: DS.Color.metricPurple.swiftUI, label: String(localized: "wr.metric.sleep"),
          value: Self.n(s.avgSleepHours, 1), sub: "/ \(Self.n(s.sleepTargetHours, 0)) h",
          fraction: s.avgSleepHours / s.sleepTargetHours, delta: nil, order: 2)
        rule
        metricRow(
          icon: "drop.fill", tint: DS.Color.metricCyan.swiftUI, label: String(localized: "wr.metric.water"),
          value: water.0, sub: water.1, fraction: s.avgWaterMl / s.waterTargetMl, delta: nil, order: 3)
        if let supp = c.supplements {
          rule
          metricRow(
            icon: "pills.fill", tint: DS.Color.metricViolet.swiftUI, label: String(localized: "wr.supplements"),
            value: supp.value, sub: String(localized: "wr.supp.days \(s.supplementDays)"), fraction: s.supplementAdherence.map { Double($0) / 100 }, delta: nil,
            order: 4)
        }
      }
      .id(book.weekStart)
    }
    DSCard {
      let pair = big ? AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Spacing.md)) : AnyLayout(HStackLayout(alignment: .top, spacing: 0))
      pair {
        figure(
          label: String(localized: "wr.volume"),
          value: "\(Self.n(Double(weightUnit.volume(s.totalVolume)), 0)) \(weightUnit.label)", sub: Self.sessions(c.sessions),
          note: c.volume.delta.map(Self.vsLast), noteTint: c.volume.delta.map(Self.deltaTint))
        if !big {
          Rectangle().fill(DS.Color.border.swiftUI).frame(width: 0.5).padding(.horizontal, DS.Spacing.md)
        }
        let need = s.readinessDays < WeeklyReview.minReadinessDays
          ? String(localized: "wr.readiness.needDays \(WeeklyReview.minReadinessDays)") : nil
        let acwr = s.acwr.map { String(localized: "wr.loadRatio \(Self.n($0, 2))") }
        figure(
          label: String(localized: "wr.readiness"), value: c.readiness.value,
          sub: [need, acwr].compactMap { $0 }.joined(separator: " · "), note: nil, noteTint: nil)
      }
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var rule: some View {
    Rectangle().fill(DS.Color.border.swiftUI).frame(height: 0.5).padding(.leading, 40)
  }

  /// Một hàng kiểu Sức khoẻ: ô biểu tượng màu, tên + thanh tới mục tiêu, số + mục tiêu.
  private func metricRow(
    icon: String, tint: Color, label: String, value: String, sub: String, fraction: Double?, delta: Int?,
    order: Int
  ) -> some View {
    let layout = big
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
      : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
    // Thanh chạy đủ bề ngang dưới hàng, nên mọi thanh dài bằng nhau dù số rộng hẹp.
    return VStack(alignment: .leading, spacing: 8) {
      layout {
        HStack(spacing: 12) {
          Image(systemName: icon)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 28, height: 28)
            .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          Text(label)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        if !big { Spacer(minLength: DS.Spacing.sm) }
        (Text(verbatim: value).font(DS.TextStyle.title2.monospacedDigit()).foregroundStyle(DS.Color.foreground.swiftUI)
          + Text(verbatim: " \(sub)").font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(muted))
          .lineLimit(big ? nil : 1)
          .padding(.leading, big ? 40 : 0)
          .contentTransition(.numericText())
          .animation(motion, value: value)
      }
      if let fraction, fraction.isFinite {
        ProgressLine(fraction: fraction, tint: tint, order: order).padding(.leading, 40)
      }
    }
    .padding(.vertical, 10)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: label))
    .accessibilityValue(Text(verbatim: a11yValue(value: value, delta: delta, sub: sub)))
  }

  private func figure(label: String, value: String, sub: String, note: String?, noteTint: Color?) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(verbatim: label).font(DS.TextStyle.footnote).foregroundStyle(muted)
      Text(verbatim: value)
        .font(DS.TextStyle.title2.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .contentTransition(.numericText())
        .animation(motion, value: value)
      if !sub.isEmpty {
        Text(verbatim: sub).font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(muted)
      }
      if let note {
        Text(verbatim: note).font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(noteTint ?? muted)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  static func vsLast(_ d: Int) -> String {
    d == 0
      ? String(localized: "wr.vsLast.same")
      : d > 0 ? String(localized: "wr.vsLast.up \(d)") : String(localized: "wr.vsLast.down \(abs(d))")
  }

  static func deltaTint(_ d: Int) -> Color {
    d == 0 ? DS.Color.mutedForeground.swiftUI : d > 0 ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI
  }

  /// Số `digits` chữ thập phân (bỏ số 0 thừa), theo ngôn ngữ của app.
  static func n(_ x: Double, _ digits: Int) -> String {
    x.formatted(.number.precision(.fractionLength(0...digits)).locale(.app))
  }

  private func a11yValue(value: String, delta: Int?, sub: String) -> String {
    var parts = ["\(value) \(sub)"]
    if let d = delta, d != 0 {
      parts.append(d > 0 ? String(localized: "wr.delta.up \(abs(d))") : String(localized: "wr.delta.down \(abs(d))"))
    }
    return parts.joined(separator: ", ")
  }

  // MARK: - Biểu đồ

  /// Cột của Calo / Ngủ và chiều cao chung của vùng biểu đồ (cột + nhãn ngày, hay cột thấp
  /// + đường 12 tuần, hay đường sẵn sàng) — để đổi tab không đổi chiều cao thẻ.
  static let barHeight: CGFloat = 128
  static let chartArea: CGFloat = 190

  private func chartCard(_ s: WeeklyReview.Summary) -> some View {
    let partial = running ? s.days.firstIndex { $0.date == flow?.today.today } : nil
    // Đường 12 tuần chỉ có nghĩa khi có ít nhất hai tuần tập (một tuần thì chỉ là một vạch).
    let trend = (s.volumeWeeks.dropLast().filter { $0.tonnes > 0 }.count + (s.totalVolume > 0 ? 1 : 0)) >= 2
    let volumes = s.days.map { $0.volume > 0 ? Double(weightUnit.volume($0.volume)) : 0 }
    let title: String = switch chart {
    case .kcal: String(localized: "wr.chart.head.kcal")
    case .sleep: String(localized: "wr.chart.head.sleep")
    case .training: String(localized: "wr.chart.head.training \(weightUnit.label)")
    case .readiness: String(localized: "wr.chart.head.readiness")
    }
    // Chú thích nét đứt chỉ khi cột hôm nay thật sự có (không có thì không có nét đứt nào để nói).
    let todayValue: Double = partial.map { i in
      switch chart {
      case .kcal: s.days[i].kcal
      case .sleep: s.days[i].sleepHours
      case .training: s.days[i].volume
      case .readiness: 0
      }
    } ?? 0
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        // Đổi tab trong một transaction lò xo. Vùng biểu đồ cao bằng nhau ở mọi tab nên thẻ
        // không co giãn (trang không giật khi đang ở cuối); ở cỡ chữ trợ năng thì để thẻ tự
        // cao lên cho chữ khỏi bị cắt, và co giãn theo lò xo.
        Picker(String(localized: "wr.chart.picker"), selection: $chart.animation(tabMotion)) {
          Text("wr.metric.kcal").tag(ChartKind.kcal)
          Text("wr.metric.sleep").tag(ChartKind.sleep)
          Text("wr.tab.training").tag(ChartKind.training)
          Text("wr.tab.readiness").tag(ChartKind.readiness)
        }
        .pickerStyle(.segmented)
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Text(verbatim: title)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(muted)
            .accessibilityHidden(true)
          switch chart {
          case .kcal:
            WeekBars(
              days: s.days, values: s.days.map(\.kcal), tint: DS.Color.metricOrange.swiftUI,
              target: s.kcalTarget, targetLabel: Self.n(s.kcalTarget, 0), unit: "", partial: partial)
              .accessibilityLabel(Text(String(localized: "wr.chart.nutrition")))
          case .sleep:
            WeekBars(
              days: s.days, values: s.days.map(\.sleepHours), tint: DS.Color.metricPurple.swiftUI,
              target: s.sleepTargetHours, targetLabel: "\(Self.n(s.sleepTargetHours, 0))h", unit: "h", partial: partial)
              .accessibilityLabel(Text(String(localized: "wr.chart.sleep")))
          case .training:
            WeekBars(
              days: s.days, values: volumes, tint: DS.Color.metricRose.swiftUI, target: nil,
              targetLabel: nil, unit: "", partial: partial, barHeight: trend ? 64 : Self.barHeight)
              .accessibilityLabel(Text(String(localized: "wr.chart.volume")))
            if trend { volumeTrend(s) }
          case .readiness:
            readinessChart(s)
          }
        }
        .frame(height: big ? nil : Self.chartArea, alignment: .top)
        // Đổi tab hay đổi tuần thì cột mọc lại từ đáy.
        .id(ChartID(kind: chart, week: book.weekStart))
        .transition(.asymmetric(
          insertion: .opacity.combined(with: .scale(scale: 0.97, anchor: .top)).animation(tabMotion?.delay(0.08)),
          removal: .opacity.animation(DSMotion.animation(.easeOut(duration: 0.12), reduceMotion: reduceMotion))))
        // Dòng chú thích luôn giữ chỗ (ẩn bằng độ trong) để thẻ cao bằng nhau ở mọi tab.
        let caption = todayValue > 0
        if partial != nil {
          Text("wr.chart.partial")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(muted)
            .opacity(caption ? 1 : 0)
            .accessibilityHidden(!caption)
        }
      }
    }
  }

  private func volumeTrend(_ s: WeeklyReview.Summary) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text("wr.chart.trend12w")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(muted)
      // Mười hai cột nhỏ, không phải đường: tuần trống là vạch nền thay vì kéo đường xuống 0,
      // nên một hai tuần có tập không thành một vạch dựng đứng ở mép phải.
      // Cột cuối là tuần đang xem: lịch sử `volumeHistory` dừng TRƯỚC ngày đầu tuần (như RN),
      // nên Core luôn cho tuần này 0 — lấy tổng của chính tuần (`totalVolume`) thay vào.
      let weeks = s.volumeWeeks.map(\.tonnes).dropLast() + [s.totalVolume / 1000]
      let maxT = Swift.max(weeks.max() ?? 0, 0.001)
      HStack(alignment: .bottom, spacing: 4) {
        ForEach(weeks.indices, id: \.self) { i in
          let t = weeks[i]
          let last = i == weeks.count - 1
          RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(t > 0 ? DS.Color.metricRose.swiftUI.opacity(last ? 1 : 0.45) : DS.Color.ringTrack.swiftUI)
            .frame(height: t > 0 ? Swift.max(36 * t / maxT, 4) : 3)
            .frame(maxWidth: .infinity)
        }
      }
      .frame(height: 36, alignment: .bottom)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "wr.chart.volume12w")))
      .accessibilityValue(Text(verbatim: weeks.map { "\(Self.plain($0))t" }.joined(separator: ", ")))
    }
  }

  @ViewBuilder private func readinessChart(_ s: WeeklyReview.Summary) -> some View {
    let points = s.days.filter { $0.readiness > 0 }
    if points.isEmpty {
      Text("wr.chart.noReadiness")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(muted)
        .frame(maxWidth: .infinity, minHeight: big ? 80 : Self.chartArea, alignment: .center)
    } else {
      Chart(points, id: \.date) { d in
        LineMark(x: .value("d", d.date.daysSinceEpoch), y: .value("r", d.readiness))
          .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
          .interpolationMethod(.monotone)
        PointMark(x: .value("d", d.date.daysSinceEpoch), y: .value("r", d.readiness))
          .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
      }
      .chartXScale(domain: s.days[0].date.daysSinceEpoch...s.days[6].date.daysSinceEpoch)
      .chartYScale(domain: 0...100)
      .chartYAxis { AxisMarks(values: [0, 50, 100]) }
      .chartXAxis(.hidden)
      .frame(height: big ? 120 : Self.chartArea)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "wr.chart.readiness")))
      .accessibilityValue(
        Text(verbatim: points.map { "\(Self.weekday($0.date)): \(Self.plain($0.readiness))" }.joined(separator: ", ")))
    }
  }

  // MARK: - Phân tích AI

  @ViewBuilder private var aiSection: some View {
    switch book.analysis(lang: lang.rawValue) {
    case .ready(let a):
      aiResult(a)
        .transition(.opacity.combined(with: .offset(y: 12)))
    case let state:
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          IntelligenceBadge(size: 17)
            .accessibilityAddTraits(.isHeader)
          Text(String(localized: "wr.ai.hint"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(muted)
          if case .failed(let f) = state {
            Label(Self.failureText(f), systemImage: "exclamationmark.triangle")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          if state == .loading {
            IntelligenceOrb(size: 40)
              .frame(maxWidth: .infinity)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(Text(String(localized: "wr.ai.analyzing")))
          }
          DSButton(String(localized: "wr.ai.analyze")) {
            Task { await book.analyze(lang: lang.rawValue) }
          }
          .disabled(state == .loading)
        }
      }
    }
  }

  /// Một thẻ: lời nhận xét rồi các nhận xét theo miền thành hàng có chấm màu.
  private func aiResult(_ a: WeeklyAnalysis) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: 0) {
        VStack(alignment: .leading, spacing: 2) {
          // Lỗi 21/10: AI tự chấm "Điểm tuần 55" — thêm một con số cạnh sẵn sàng, Gains,
          // xu, chuỗi. Không hiện điểm; giữ lời nhận xét.
          Text(String(localized: "wr.ai.take"))
            .font(DS.TextStyle.headline)
            .accessibilityAddTraits(.isHeader)
          IntelligenceBadge(size: 11)
        }
        .padding(.bottom, DS.Spacing.sm)
        if !a.summary.isEmpty {
          Text(a.summary)
            .font(.callout)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, DS.Spacing.sm)
        }
        ForEach(a.insights.indices, id: \.self) { i in
          let ins = a.insights[i]
          Rectangle().fill(DS.Color.border.swiftUI).frame(height: 0.5)
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Circle()
              .fill(Self.insightTint(ins.category))
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              HStack(spacing: 4) {
                Text(ins.title).font(DS.TextStyle.body.weight(.semibold))
                if let t = ins.trend {
                  Image(systemName: Self.trendIcon(t))
                    .font(.caption2)
                    .foregroundStyle(muted)
                    .accessibilityLabel(Text(Self.trendLabel(t)))
                }
              }
              Text(ins.detail)
                .font(DS.TextStyle.footnote)
                .foregroundStyle(muted)
                .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
          }
          .padding(.vertical, 10)
          .accessibilityElement(children: .combine)
          .modifier(Reveal(order: i))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// Màu chấm theo miền — cùng màu với hàng số của miền đó; miền lạ → xám.
  static func insightTint(_ category: String) -> Color {
    switch category {
    case "nutrition": DS.Color.metricOrange.swiftUI
    case "training": DS.Color.metricRose.swiftUI
    case "sleep": DS.Color.metricPurple.swiftUI
    case "recovery": DS.Color.readinessGreen.swiftUI
    default: DS.Color.mutedForeground.swiftUI
    }
  }

  static func trendIcon(_ t: WeeklyAnalysis.Insight.Trend) -> String {
    switch t {
    case .up: "arrow.up.right"
    case .down: "arrow.down.right"
    case .stable: "arrow.right"
    }
  }

  static func trendLabel(_ t: WeeklyAnalysis.Insight.Trend) -> String {
    switch t {
    case .up: String(localized: "wr.ai.trend.up")
    case .down: String(localized: "wr.ai.trend.down")
    case .stable: String(localized: "wr.ai.trend.stable")
    }
  }

  /// `PRIORITY_COLOR`: cao đỏ, vừa cam, thấp xám (xám ấm của app, không còn
  /// xanh xám `#a8b2c4` cũ — 20/10); lạ → màu viền.
  static func priorityColor(_ p: WeeklyAnalysis.Advice.Priority?) -> Color {
    switch p {
    case .high?: DS.Color.destructive.swiftUI
    case .medium?: DS.Color.metricOrange.swiftUI
    case .low?: DS.Color.mutedForeground.swiftUI
    case nil: DS.Color.border.swiftUI
    }
  }

  static func priorityLabel(_ p: WeeklyAnalysis.Advice.Priority?) -> String {
    switch p {
    case .high?: String(localized: "wr.ai.priority.high")
    case .medium?: String(localized: "wr.ai.priority.medium")
    case .low?: String(localized: "wr.ai.priority.low")
    case nil: ""
    }
  }

  /// `AI_FAILURE_KEY`.
  static func failureText(_ f: EdgeFunction.Failure) -> String {
    switch f {
    case .notDeployed: String(localized: "ai.failure.notDeployed")
    case .providerError: String(localized: "ai.failure.providerError")
    case .overloaded: String(localized: "ai.failure.overloaded")
    case .unauthorised: String(localized: "ai.failure.signedOut")
    case .rateLimited: String(localized: "ai.failure.rateLimited")
    case .quotaExceeded: String(localized: "ai.failure.quota")
    case .offline: String(localized: "ai.failure.offline")
    case .unknown: String(localized: "ai.failure.unknown")
    }
  }

  // MARK: - Tuần tới

  /// Khuyến nghị của app (luật) rồi việc nên làm của AI, đánh số trong một thẻ. Số
  /// mang màu: loại của luật (cảnh báo / tốt / thông tin) hay ưu tiên của AI.
  @ViewBuilder private func nextWeek(_ recs: [WeeklyReview.Recommendation]) -> some View {
    let ai: [WeeklyAnalysis.Advice] = {
      if case .ready(let a) = book.analysis(lang: lang.rawValue) { return a.recommendations }
      return []
    }()
    let items: [(String, String?, Color, String)] =
      recs.map { (Self.text($0), nil, Self.style($0.kind).0, "") }
      + ai.map { ($0.action, $0.reason.isEmpty ? nil : $0.reason, Self.priorityColor($0.priority), Self.priorityLabel($0.priority)) }
    if !items.isEmpty {
      DSCard {
        VStack(alignment: .leading, spacing: 0) {
          Text("wr.next")
            .font(DS.TextStyle.headline)
            .accessibilityAddTraits(.isHeader)
            .padding(.bottom, DS.Spacing.xs)
          ForEach(items.indices, id: \.self) { i in
            let it = items[i]
            if i > 0 { Rectangle().fill(DS.Color.border.swiftUI).frame(height: 0.5).padding(.leading, 26) }
            HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
              Text(verbatim: "\(i + 1)")
                .font(DS.TextStyle.body.weight(.bold).monospacedDigit())
                .foregroundStyle(it.2)
                .frame(minWidth: 18, alignment: .leading)
              Text(verbatim: it.0)
                .font(DS.TextStyle.body)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .fixedSize(horizontal: false, vertical: true)
              Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .accessibilityElement(children: .combine)
            .accessibilityValue(Text(verbatim: it.3))
            .accessibilityHint(Text(verbatim: it.1 ?? ""))
            .modifier(Reveal(order: i))
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  static func style(_ k: WeeklyReview.Recommendation.Kind) -> (Color, String) {
    switch k {
    case .warning: (DS.Color.destructive.swiftUI, "exclamationmark.triangle.fill")
    case .success: (DS.Color.readinessGreen.swiftUI, "checkmark.circle.fill")
    case .info: (DS.Color.metricBlue.swiftUI, "waveform.path.ecg")
    }
  }

  /// Câu của một khuyến nghị theo `id`, chữ chèn sẵn từ Core.
  static func text(_ r: WeeklyReview.Recommendation) -> String {
    var a = r.args + ["", ""]
    // Tỉ lệ tải theo ngôn ngữ của app ("0,58"), như mọi số khác trên màn.
    if r.id.hasPrefix("acwr"), let x = Double(a[0]) { a[0] = n(x, 2) }
    switch r.id {
    case "acwrHigh": return String(localized: "wr.rec.acwrHigh \(a[0])")
    case "acwrSlightlyHigh": return String(localized: "wr.rec.acwrSlightlyHigh \(a[0])")
    case "acwrLow": return String(localized: "wr.rec.acwrLow \(a[0])")
    case "acwrOptimal": return String(localized: "wr.rec.acwrOptimal \(a[0])")
    case "deload": return String(localized: "wr.rec.deload")
    case "overloadRecovered": return String(localized: "wr.rec.overloadRecovered")
    case "overloadCapacity": return String(localized: "wr.rec.overloadCapacity")
    case "sleepDebt": return String(localized: "wr.rec.sleepDebt \(a[0]) \(a[1])")
    case "proteinLow": return String(localized: "wr.rec.proteinLow \(a[0]) \(a[1])")
    case "volumeUp": return String(localized: "wr.rec.volumeUp \(a[0])")
    default: return r.id
    }
  }

  /// `{n} {n:session|sessions}` — số ít / số nhiều là hai khoá (catalog không dùng plural variation).
  static func sessions(_ n: Int) -> String {
    n == 1 ? String(localized: "wr.sessions.one \(n)") : String(localized: "wr.sessions.other \(n)")
  }

  /// `Math.round(v * 10) / 10` viết kiểu JS (không phân nhóm nghìn, như RN).
  static func plain(_ v: Double) -> String {
    let r = (v * 10 + 0.5).rounded(.down) / 10
    return r == r.rounded() && abs(r) < 1e15 ? String(Int(r)) : String(r)
  }

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
  }

  /// Nhãn dưới cột và vòng ngày: "T2"…"CN", "Mo"…"Su" — vừa bảy cột cả ở cỡ trợ năng.
  static func shortWeekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.short).locale(.app))
  }
}

/// Khoá của biểu đồ đang xem: đổi tab hay đổi tuần thì dựng lại để cột mọc lại.
private struct ChartID: Hashable {
  let kind: WeeklyReviewView.ChartKind
  let week: LocalDate
}

/// Thanh mảnh tới mục tiêu (kẹp 0…1; vượt mục tiêu vẫn đầy). Lần đầu hiện thì chạy
/// từ 0, các hàng nối nhau theo `order`; Giảm chuyển động thì hiện đầy ngay.
private struct ProgressLine: View {
  let fraction: Double
  let tint: Color
  var order = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false

  var body: some View {
    let f = min(max(fraction, 0), 1) * (shown || reduceMotion ? 1 : 0)
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(DS.Color.ringTrack.swiftUI)
        Capsule().fill(tint).frame(width: geo.size.width * f)
      }
    }
    .frame(height: 4)
    .animation(DSMotion.animation(.spring(duration: 0.5, bounce: 0.1), reduceMotion: reduceMotion), value: fraction)
    .onAppear {
      guard !shown else { return }
      withAnimation(
        DSMotion.animation(
          .spring(duration: 0.8, bounce: 0.1).delay(0.15 + 0.07 * Double(order)), reduceMotion: reduceMotion)
      ) { shown = true }
    }
    .accessibilityHidden(true)
  }
}

/// Bảy vòng như vòng ngày của Fitness: đặc = đã tập, viền = có buổi theo lịch, xám = không.
/// Vòng đã tập nảy vào lần lượt; Giảm chuyển động thì hiện ngay.
private struct DayRing: View {
  let days: [KoaWeek.Day]
  let today: LocalDate
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false

  var body: some View {
    let tint = DS.Color.metricRose.swiftUI
    let on = shown || reduceMotion
    HStack(spacing: 0) {
      ForEach(Array(days.enumerated()), id: \.element.date) { i, d in
        VStack(spacing: 4) {
          ZStack {
            Circle().strokeBorder(d.planned ? tint.opacity(0.6) : DS.Color.border.swiftUI, lineWidth: 1.5)
            if d.trained {
              Circle().fill(tint)
                .overlay {
                  Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
                }
                .scaleEffect(on ? 1 : 0.3)
                .opacity(on ? 1 : 0)
                .animation(
                  DSMotion.animation(.spring(duration: 0.45, bounce: 0.45).delay(0.1 + 0.06 * Double(i)), reduceMotion: reduceMotion),
                  value: on)
            }
          }
          .frame(width: 28, height: 28)
          Text(verbatim: WeeklyReviewView.shortWeekday(d.date))
            .font(DS.TextStyle.caption.weight(d.date == today ? .bold : .medium))
            .foregroundStyle(d.date == today ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: WeeklyReviewView.dayLabel(d)))
      }
    }
    .onAppear { shown = true }
  }
}

/// Hiện dần từ dưới lên, nối nhau theo `order` (hàng nhận xét, hàng "Tuần tới").
private struct Reveal: ViewModifier {
  let order: Int
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false

  func body(content: Content) -> some View {
    let on = shown || reduceMotion
    content
      .opacity(on ? 1 : 0)
      .offset(y: on ? 0 : 10)
      .onAppear {
        guard !shown else { return }
        withAnimation(
          DSMotion.animation(.spring(duration: 0.5, bounce: 0.05).delay(0.06 * Double(order)), reduceMotion: reduceMotion)
        ) { shown = true }
      }
  }
}

/// Cột 7 ngày (`WeekBars`): cao theo giá trị lớn nhất (hoặc mục tiêu), vạch
/// mục tiêu nét đứt nếu có, nhãn thứ + giá trị dưới mỗi cột ("·" khi trống).
/// `partial`: cột của hôm nay khi tuần đang chạy — viền nét đứt, ngày chưa xong.
private struct WeekBars: View {
  let days: [WeeklyReview.Day]
  let values: [Double]
  let tint: Color
  let target: Double?
  let targetLabel: String?
  let unit: String
  let partial: Int?
  var barHeight: CGFloat = WeeklyReviewView.barHeight
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var grown = false

  var body: some View {
    let maxV = Swift.max(values.max() ?? 0, target ?? 0, 1)
    let on = grown || reduceMotion
    VStack(spacing: 6) {
      GeometryReader { geo in
        let h = geo.size.height
        ZStack(alignment: .bottom) {
          HStack(alignment: .bottom, spacing: 8) {
            ForEach(values.indices, id: \.self) { i in
              let v = values[i]
              let full = v > 0 ? Swift.max(h * v / maxV, 4) : 3
              let height = on ? full : 3
              let shape = RoundedRectangle(cornerRadius: 5, style: .continuous)
              Group {
                if i == partial {
                  shape.strokeBorder(tint.opacity(0.7), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                } else {
                  shape.fill(v > 0 ? tint : DS.Color.ringTrack.swiftUI)
                }
              }
              .frame(height: height)
              .frame(maxWidth: .infinity)
              // Cột mọc từ đáy, trái sang phải.
              .animation(
                DSMotion.animation(.spring(duration: 0.6, bounce: 0.15).delay(0.04 * Double(i)), reduceMotion: reduceMotion),
                value: on)
            }
          }
          if let target, target > 0 {
            let y = h - h * target / maxV
            Path { p in
              p.move(to: CGPoint(x: 0, y: y))
              p.addLine(to: CGPoint(x: geo.size.width, y: y))
            }
            .stroke(tint.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            if let targetLabel {
              Text(String(localized: "wr.chart.target \(targetLabel)"))
                .font(DS.TextStyle.caption.monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .position(x: geo.size.width / 2, y: Swift.max(y - 9, 6))
            }
          }
        }
        .frame(maxHeight: .infinity, alignment: .bottom)
      }
      .frame(height: barHeight)
      .onAppear { grown = true }
      HStack(spacing: 8) {
        ForEach(days.indices, id: \.self) { i in
          VStack(spacing: 0) {
            Text(verbatim: WeeklyReviewView.shortWeekday(days[i].date))
              .font(DS.TextStyle.caption)
              .foregroundStyle(i == partial ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
              .minimumScaleFactor(0.5)
            Text(verbatim: values[i] > 0 ? "\(WeeklyReviewView.plain(values[i]))\(unit)" : "·")
              .font(.system(size: 9).monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
              .minimumScaleFactor(0.6)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityValue(
      Text(
        verbatim: days.indices.map {
          "\(WeeklyReviewView.weekday(days[$0].date)): \(values[$0] > 0 ? "\(WeeklyReviewView.plain(values[$0]))\(unit)" : "—")"
        }.joined(separator: ", ")))
  }
}
