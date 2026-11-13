import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Mốc nào của hành trình Koa đã nhắc (`KoaMomentFeed`). Lưu theo tài khoản; "đã thấy" chỉ có hiệu
/// lực từ lần mở app sau, nên trong một lần mở Hôm nay và phòng Koa nói cùng một mốc.
@MainActor
enum KoaMomentsStore {
  private static var launchSeen: [String: Set<String>] = [:]

  private static func key(_ userId: String) -> String { "koa.moments.seen.\(userId)" }

  static func seen(_ userId: String) -> Set<String> {
    if let s = launchSeen[userId] { return s }
    let s = Set(UserDefaults.standard.stringArray(forKey: key(userId)) ?? [])
    launchSeen[userId] = s
    return s
  }

  static func markSeen(_ id: String, userId: String) {
    var all = Set(UserDefaults.standard.stringArray(forKey: key(userId)) ?? [])
    guard all.insert(id).inserted else { return }
    UserDefaults.standard.set(Array(all), forKey: key(userId))
  }

  /// Mốc Koa nên nhắc lúc này, `nil` khi chưa đọc Gains hay không có gì mới.
  static func next(_ services: AppServices?, userId: String, today: LocalDate) -> KoaJourney.Moment? {
    guard let h = services?.koaGainsHistory else { return nil }
    let moments = KoaJourney.moments(h.days, week: h.week, logged: h.logged, today: today)
    return KoaMomentFeed.next(moments, seen: seen(userId), today: today)
  }

  /// Câu của Koa cho một mốc: ghi nhận việc đã làm, không thúc ép.
  static func line(_ m: KoaJourney.Moment, lang: AppPreferences.Lang) -> String {
    switch m.kind {
    case .firstSession: return String(localized: "journey.line.first")
    case .sessions: return String(localized: "journey.line.sessions \(m.value)")
    case .firstFullWeek: return String(localized: "journey.line.firstWeek")
    case .fullWeek: return String(localized: "journey.line.week")
    case .record: return String(localized: "journey.line.record")
    case .comeback: return String(localized: "journey.line.comeback \(m.value)")
    case .logDays: return String(localized: "journey.line.log \(m.value)")
    case .monthDone:
      // ngày của mốc là ngày 1 tháng sau: tháng vừa xong là tháng trước ngày ấy
      let done = KoaMonthRecap.Key(m.date).previous
      let name = KoaMonthText.monthName(done)
      return m.value > 0
        ? String(localized: "journey.line.month \(name) \(m.value)") : String(localized: "journey.line.month.log \(name)")
    case .tierUp:
      let t = KoaGains.tier(step: m.value)
      return String(localized: "journey.line.tier \(KoaTierText.name(rank: t.rank, tier: t.tier, lang: lang))")
    case .rankUp:
      let rank = MascotRules.ranks[min(m.value, MascotRules.ranks.count - 1)]
      return String(localized: "journey.line.rank \(rank.name(lang))")
    }
  }

  static func symbol(_ k: KoaJourney.Kind) -> String {
    switch k {
    case .firstSession: "flag.fill"
    case .sessions: "number"
    case .firstFullWeek, .fullWeek: "calendar.badge.checkmark"
    case .record: "trophy.fill"
    case .rankUp: "arrow.up.circle.fill"
    case .tierUp: "chevron.up.circle"
    case .logDays: "square.and.pencil.circle.fill"
    case .monthDone: "calendar.circle.fill"
    case .comeback: "arrow.uturn.backward.circle.fill"
    }
  }
}

/// Nhịp 30 ngày: số buổi trong cửa sổ cuốn chiếu và một chấm cho mỗi ngày.
struct KoaRhythmCard: View {
  let state: KoaRhythm.State
  /// 26 pt ở cỡ chữ mặc định, lớn theo Dynamic Type như chữ quanh nó (#795: ảnh chữ lớn cho
  /// thấy số buổi đứng yên 26 pt trong khi nhãn trên nó to gấp đôi).
  @ScaledMetric(relativeTo: .title) private var sessionsSize: CGFloat = 26

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("rhythm.title")
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(String(localized: "rhythm.sessions \(state.sessions)"))
        .font(.system(size: sessionsSize, weight: .bold).monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 15), spacing: 5) {
        ForEach(Array(state.days.enumerated()), id: \.offset) { _, d in dot(d) }
      }
      .accessibilityHidden(true)
      // Chữ lớn: ba chú thích không vừa một hàng thì xếp dọc, không cắt chữ (#795).
      ViewThatFits(in: .horizontal) {
        HStack(spacing: DS.Spacing.sm) { legends }
        VStack(alignment: .leading, spacing: 4) { legends }
      }
      Text(verbatim: compare)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard()
    .accessibilityElement(children: .combine)
  }

  private static let trained = DS.Color.readinessYellow.swiftUI
  private static let rest = Color(red: 0.36, green: 0.52, blue: 0.68)
  private static let paused = DS.Color.mutedForeground.swiftUI

  private var compare: String {
    if state.previous == 0 { return String(localized: "rhythm.start") }
    if state.change > 0 { return String(localized: "rhythm.more \(state.change)") }
    if state.change < 0 { return String(localized: "rhythm.less \(state.previous)") }
    return String(localized: "rhythm.same")
  }

  @ViewBuilder private func dot(_ d: KoaRhythm.Day) -> some View {
    switch d {
    case .trained: Circle().fill(Self.trained).aspectRatio(1, contentMode: .fit)
    case .rest: Circle().fill(Self.rest.opacity(0.75)).aspectRatio(1, contentMode: .fit)
    case .paused:
      Circle().strokeBorder(Self.paused, style: StrokeStyle(lineWidth: 1, dash: [2, 2])).aspectRatio(1, contentMode: .fit)
    case .open: Circle().fill(DS.Color.mutedForeground.swiftUI.opacity(0.18)).aspectRatio(1, contentMode: .fit)
    }
  }

  @ViewBuilder private var legends: some View {
    legend(.trained, "rhythm.trained")
    legend(.rest, "rhythm.rest")
    if state.days.contains(.paused) { legend(.paused, "rhythm.paused") }
  }

  /// Mẫu màu vẽ đúng dấu trong lưới: ngày tạm nghỉ là vòng nét đứt, không phải chấm đặc (#795).
  private func legend(_ day: KoaRhythm.Day, _ key: LocalizedStringKey) -> some View {
    HStack(spacing: 4) {
      dot(day).frame(width: 8, height: 8)
      Text(key).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }
}

/// Nhịp ghi 30 ngày (12/11, Kiệt duyệt mock "Ghi chép cũng nuôi Koa", lớp A): số ngày có ghi
/// bữa / nước / giấc ngủ trong 30 ngày, một chấm mỗi ngày, tách theo loại. Cùng dáng với
/// `KoaRhythmCard`; không có số liên tiếp, không nói gì về calo hay cân nặng.
struct KoaLogRhythmCard: View {
  let state: KoaLogRhythm.State
  @ScaledMetric(relativeTo: .title) private var countSize: CGFloat = 26

  static let tint = DS.Color.metricOrangeGraphic.swiftUI

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("logrhythm.title")
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(String(localized: "logrhythm.days \(state.logged)"))
        .font(.system(size: countSize, weight: .bold).monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 15), spacing: 5) {
        ForEach(Array(state.days.enumerated()), id: \.offset) { _, on in
          Circle()
            .fill(on ? Self.tint : DS.Color.mutedForeground.swiftUI.opacity(0.18))
            .aspectRatio(1, contentMode: .fit)
        }
      }
      .accessibilityHidden(true)
      // Chữ lớn: ba số không vừa một hàng thì xếp dọc, không cắt chữ.
      ViewThatFits(in: .horizontal) {
        HStack(spacing: DS.Spacing.md) { split }
        VStack(alignment: .leading, spacing: 4) { split }
      }
      .font(DS.TextStyle.caption.monospacedDigit())
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(verbatim: compare)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard()
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private var split: some View {
    Text(String(localized: "logrhythm.meals \(state.meals)"))
    Text(String(localized: "logrhythm.water \(state.water)"))
    Text(String(localized: "logrhythm.sleep \(state.sleep)"))
  }

  private var compare: String {
    if state.previous == 0 { return String(localized: "logrhythm.start") }
    if state.change > 0 { return String(localized: "logrhythm.more \(state.change)") }
    if state.change < 0 { return String(localized: "logrhythm.less \(state.previous)") }
    return String(localized: "logrhythm.same")
  }
}

/// Hành trình cùng Koa: tổng kết tháng và các mốc thật, mới nhất ở trên.
struct KoaJourneyView: View {
  @Environment(AppServices.self) private var services

  var body: some View {
    KoaJourneyContent(history: services.koaGainsHistory, today: LocalDate(SystemWallClock().nowMillis(), in: .current))
      .navigationTitle(Text("journey.title"))
      .ascndPage()
      .task { await services.ensureKoaGainsHistory() }
      // Mỗi lần mở màn hành trình (màn này không đẩy màn con, nên xuất hiện = mở).
      .onAppear { Telemetry.capture(.journeyOpened) }
  }
}

/// Nội dung màn hành trình, không cần `AppServices`: snapshot test dựng thẳng với một lịch sử
/// cố định (#795).
struct KoaJourneyContent: View {
  let history: AppServices.GainsHistory?
  let today: LocalDate
  @Environment(\.locale) private var locale

  var body: some View {
    let lang = AppPreferences.Lang(rawValue: String(locale.identifier.prefix(2))) ?? .vi
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if let h = history {
          // Mốc "tháng đã xong" chỉ để Koa nhắc ở Hôm nay; tháng có dải riêng ngay dưới (13/11).
          let moments = KoaJourney.moments(h.days, week: h.week, logged: h.logged, today: today)
            .filter { $0.kind != .monthDone }
          header(rank: KoaGains.compute(h.days, week: h.week, today: today).rank)
          KoaMonthSection(history: h, today: today)
          // Nhịp ghi (12/11): chỉ khi có ít nhất một ngày ghi trong 60 ngày (30 này + 30 trước), để
          // người chưa từng ghi không thấy một thẻ toàn chấm trống.
          let logRhythm = KoaLogRhythm.state(h.logKinds, today: today)
          if logRhythm.logged + logRhythm.previous > 0 { KoaLogRhythmCard(state: logRhythm) }
          if moments.isEmpty {
            Text("journey.empty")
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          } else {
            VStack(alignment: .leading, spacing: 0) {
              ForEach(moments) { m in row(m, lang: lang) }
            }
            .padding(.vertical, DS.Spacing.xs)
            .todayCard()
          }
        } else {
          DSLoadingView()
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  private func header(rank: Int) -> some View {
    HStack(spacing: DS.Spacing.md) {
      MascotFigureView(emotion: .proud, size: 84, animated: false, build: rank)
        .accessibilityHidden(true)
      Text("journey.lede")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func row(_ m: KoaJourney.Moment, lang: AppPreferences.Lang) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
      Image(systemName: KoaMomentsStore.symbol(m.kind))
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(m.major ? DS.Color.readinessYellow.swiftUI : DS.Color.mutedForeground.swiftUI)
        .frame(width: 22)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: KoaMomentsStore.line(m, lang: lang))
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        Text(verbatim: date(m.date))
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 10)
    .accessibilityElement(children: .combine)
  }

  private func date(_ d: LocalDate) -> String {
    let date = Calendar.current.date(from: DateComponents(year: d.year, month: d.month, day: d.day)) ?? .now
    return date.formatted(.dateTime.day().month(.abbreviated).year().locale(locale))
  }
}
