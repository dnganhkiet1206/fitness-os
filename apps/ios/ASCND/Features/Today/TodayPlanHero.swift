import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ việc chính của Today (#527 GĐ1, mock `daily-plan-today.html`): MỘT hành
/// động, lý do bằng số thật, tối đa hai phương án. Chỉ vẽ `DailyPlan.Result` —
/// không quyết định gì ở đây.
struct TodayPlanHero: View {
  let result: DailyPlan.Result
  /// Buổi hôm nay đang là bản nhẹ (đã chọn "Tập nhẹ hơn").
  var lighterOn = false
  /// Buổi hôm nay là buổi ngắn (quay lại sau ≥ 4 tuần nghỉ).
  var shortOn = false
  /// Ngày tập gần nhất (Gains) — dòng "Lần cuối" của thẻ quay lại.
  var lastSession: LocalDate?
  /// Đang ghi một phương án (dời / nghỉ) — khoá nút để không bấm hai lần.
  var busy = false
  var failed = false
  let onPrimary: () -> Void
  let onAlternative: (DailyPlan.Alternative) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(verbatim: eyebrow)
        .font(.system(size: 11, weight: .semibold))
        .tracking(1.2)
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      if let title {
        Text(verbatim: title)
          .font(DS.TextStyle.title)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
      }
      if let why {
        Text(verbatim: why)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      if case .comeback = result.action, let lastSession {
        Text(verbatim: String(localized: "dp.comeback.last \(Self.weekday(lastSession)) \(Self.day(lastSession))"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if let tip = comebackTip {
        Text(verbatim: tip)
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
          .padding(.horizontal, 10)
          .padding(.vertical, 8)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(DS.Color.metricOrangeGraphic.swiftUI.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
          .fixedSize(horizontal: false, vertical: true)
      }
      if shortOn, result.action.session != nil {
        Label(String(localized: "dp.short.on"), systemImage: "arrow.down.circle")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI)
      } else if lighterOn, result.action.session != nil {
        Label(String(localized: "dp.lighter.on"), systemImage: "arrow.down.circle")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI)
      }
      if let primary {
        DSButton(primary, style: .primary, action: onPrimary)
          .disabled(busy)
          .padding(.top, DS.Spacing.xs)
      }
      if !shownAlternatives.isEmpty {
        VStack(spacing: 2) {
          ForEach(shownAlternatives, id: \.self) { alt in
            Button { onAlternative(alt) } label: {
              Text(verbatim: Self.label(alt))
                .font(DS.TextStyle.footnote.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.plain)
            .foregroundStyle(DS.Color.primary.swiftUI)
            .disabled(busy)
          }
        }
      }
      if failed {
        Text("dp.failed")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
    .redacted(reason: result.action == .loading ? .placeholder : [])
    .accessibilityElement(children: .contain)
  }

  /// "Tập nhẹ hơn" đã chọn thì không mời chọn lại.
  private var shownAlternatives: [DailyPlan.Alternative] {
    result.alternatives.filter { !(lighterOn && $0 == .lighter) }
  }

  /// Bước gợi ý khi quay lại (`DailyPlan.comebackStep`).
  private var comebackStep: DailyPlan.ComebackStep? {
    guard case .comeback = result.action, case .returning(let days) = result.reason else { return nil }
    return DailyPlan.comebackStep(daysOff: days)
  }

  /// Câu gợi ý theo số ngày nghỉ — ẩn khi người dùng đã chọn một bản.
  private var comebackTip: String? {
    guard !lighterOn, !shortOn, let step = comebackStep else { return nil }
    return switch step {
    case .asBefore: String(localized: "dp.comeback.tip.asBefore")
    case .lighter: String(localized: "dp.comeback.tip.lighter")
    case .short: String(localized: "dp.comeback.tip.short")
    }
  }

  // MARK: - Chữ

  private var eyebrow: String {
    switch result.action {
    case .loading: String(localized: "today.loading")
    case .resume: String(localized: "dp.eyebrow.resume")
    case .setUpWeek: String(localized: "dp.eyebrow.start")
    case .start: String(localized: "dp.eyebrow.today")
    case .comeback: String(localized: "dp.eyebrow.welcome")
    case .postWorkoutMeal, .progress: String(localized: "dp.eyebrow.done")
    case .recovery: String(localized: "dp.eyebrow.rest")
    case .nextSession, .logFree: String(localized: "dp.eyebrow.next")
    }
  }

  private var title: String? {
    switch result.action {
    case .loading: nil
    case .resume(let s), .start(let s), .comeback(let s), .nextSession(_, let s):
      String(localized: "dp.title.session \(s.name) \(s.minutes)")
    case .setUpWeek: String(localized: "dp.title.setUpWeek")
    case .postWorkoutMeal: String(localized: "dp.title.meal")
    case .progress: String(localized: "dp.title.progress")
    case .recovery: String(localized: "dp.title.recovery")
    case .logFree: String(localized: "dp.title.logFree")
    }
  }

  private var why: String? { Self.reason(result.reason) }

  private var primary: String? {
    switch result.action {
    case .loading: nil
    case .resume: String(localized: "dp.cta.resume")
    case .start:
      if case .lowRecovery = result.reason { String(localized: "dp.cta.planned") } else { String(localized: "today.start") }
    case .comeback:
      switch lighterOn || shortOn ? .asBefore : comebackStep ?? .asBefore {
      case .asBefore: String(localized: "today.start")
      case .lighter: String(localized: "dp.cta.lighter")
      case .short: String(localized: "dp.cta.short")
      }
    case .setUpWeek: String(localized: "dp.title.setUpWeek")
    case .postWorkoutMeal: String(localized: "dp.cta.meal")
    case .progress: String(localized: "dp.cta.progress")
    case .recovery: String(localized: "dp.cta.recovery")
    case .nextSession: String(localized: "dp.cta.viewPlan")
    case .logFree: String(localized: "dp.cta.logFree")
    }
  }

  /// Lý do cho người đọc — dùng chung với widget / lời nhắc.
  static func reason(_ r: DailyPlan.Reason) -> String? {
    switch r {
    case .none: return nil
    case .planned: return String(localized: "dp.why.planned")
    case .anotherSession: return String(localized: "dp.why.another")
    case .lowRecovery(let signals):
      let list = signals.map(signal).joined(separator: ", ")
      return String(localized: "dp.why.low \(list)")
    case .returning(let days): return String(localized: "dp.why.returning \(days)")
    case .proteinLeft(let g): return String(localized: "dp.why.protein \(g)")
    case .trainedToday: return String(localized: "dp.why.trained")
    case .restDay: return String(localized: "dp.why.rest")
    case .noSchedule: return String(localized: "dp.why.noSchedule")
    case .nextOn(let date): return String(localized: "dp.why.next \(weekday(date)) \(day(date))")
    }
  }

  static func signal(_ s: DailyPlan.Signal) -> String {
    switch s {
    case .shortSleep(let m, let t): String(localized: "dp.signal.sleep \(duration(m)) \(duration(t))")
    case .lowHRV(let p): String(localized: "dp.signal.hrv \(p)")
    case .highRestingHR(let b): String(localized: "dp.signal.rhr \(b)")
    }
  }

  static func label(_ a: DailyPlan.Alternative) -> String {
    switch a {
    case .lighter: String(localized: "dp.alt.lighter")
    case .postpone(let to):
      to == today().adding(days: 1)
        ? String(localized: "dp.alt.tomorrow") : String(localized: "dp.alt.postpone \(weekday(to))")
    case .makeRest: String(localized: "dp.alt.rest")
    case .logFree: String(localized: "dp.alt.logFree")
    case .viewSession: String(localized: "dp.alt.viewSession")
    case .viewPlan: String(localized: "dp.alt.viewPlan")
    case .fullSession: String(localized: "dp.alt.fullSession")
    }
  }

  /// "5 giờ 10" — giờ + phút theo đơn vị của máy.
  static func duration(_ minutes: Int) -> String {
    Duration.seconds(minutes * 60).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated))
  }

  static func weekday(_ d: LocalDate) -> String {
    [
      String(localized: "onboarding.day.mon"), String(localized: "onboarding.day.tue"),
      String(localized: "onboarding.day.wed"), String(localized: "onboarding.day.thu"),
      String(localized: "onboarding.day.fri"), String(localized: "onboarding.day.sat"),
      String(localized: "onboarding.day.sun"),
    ][WorkoutPlanning.routineIndex(d)]
  }

  static func day(_ d: LocalDate) -> String {
    // Nửa đêm UTC của ngày ấy, định dạng theo UTC — không lệch ngày theo múi giờ máy.
    let utc = Date(timeIntervalSince1970: TimeInterval(d.daysSinceEpoch) * 86_400)
    var style = Date.FormatStyle.dateTime.day().month(.abbreviated)
    style.timeZone = TimeZone(identifier: "UTC")!
    return utc.formatted(style)
  }

  static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}

/// "Tuần của Koa" (GĐ1): bảy ngày theo lịch đã áp — đã tập, có buổi, nghỉ, hôm nay.
/// Chỉ "đã tập" khi có buổi ghi thật (Kiệt 21/10), không dựa vào việc mở màn.
struct TodayWeekStrip: View {
  struct Day: Hashable {
    let date: LocalDate
    let trained: Bool
    let planned: Bool
    let rest: Bool
  }

  let days: [Day]
  let today: LocalDate
  /// Đích tuần (`KoaGains.Week.target`); `nil` = chưa có lịch.
  let target: Int?
  /// Dòng "Tuần của Koa · x/y" phía trên (thẻ ở phòng Koa đã có tiêu đề riêng).
  var showsHeader = true

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if showsHeader {
      HStack {
        Text("dp.week")
        Spacer()
        if let target {
          Text(String(localized: "dp.week.count \(days.filter(\.trained).count) \(target)"))
        } else {
          Text("dp.week.none")
        }
      }
      .font(.system(size: 11, weight: .semibold))
      .tracking(0.6)
      .textCase(.uppercase)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      HStack(spacing: 4) {
        ForEach(days, id: \.self) { d in
          VStack(spacing: 4) {
            Text(verbatim: TodayPlanHero.weekday(d.date))
              .font(.system(size: 10.5, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            dot(d)
          }
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(DS.Color.secondary.swiftUI.opacity(0.6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          .overlay {
            if d.date == today {
              RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(DS.Color.primary.swiftUI, lineWidth: 1.5)
            }
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(verbatim: TodayPlanHero.weekday(d.date)))
          .accessibilityValue(Text(verbatim: state(d)))
        }
      }
    }
  }

  private func dot(_ d: Day) -> some View { Self.marker(trained: d.trained, planned: d.planned) }

  /// Ký hiệu một ngày — dùng chung cho dải và cho chú thích ở thẻ Tuần của Koa.
  @ViewBuilder static func marker(trained: Bool, planned: Bool) -> some View {
    if trained {
      Circle().fill(DS.Color.readinessGreen.swiftUI).frame(width: 8, height: 8)
    } else if planned {
      Circle().stroke(DS.Color.foreground.swiftUI, lineWidth: 1.5).frame(width: 8, height: 8)
    } else {
      Circle().stroke(DS.Color.mutedForeground.swiftUI.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
        .frame(width: 8, height: 8)
    }
  }

  private func state(_ d: Day) -> String {
    if d.trained { return String(localized: "today.status.done") }
    if d.planned { return String(localized: "today.status.todo") }
    if d.rest { return String(localized: "today.status.rest") }
    return String(localized: "today.status.unplanned")
  }

  /// Bảy ngày (T2 → CN) của tuần chứa `today`, theo kế hoạch đã áp.
  static func days(today: LocalDate, library: TemplateSnapshot?, trained: Set<LocalDate>) -> [Day] {
    let monday = today.adding(days: -WorkoutPlanning.routineIndex(today))
    return (0..<7).map { o in
      let d = monday.adding(days: o)
      let p = library?.plan(for: d, today: today)
      return Day(date: d, trained: trained.contains(d), planned: p?.template != nil, rest: p?.status == .rest)
    }
  }
}
