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
    let moments = KoaJourney.moments(h.days, week: h.week, today: today)
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
    case .comeback: "arrow.uturn.backward.circle.fill"
    }
  }
}

/// Nhịp 30 ngày: số buổi trong cửa sổ cuốn chiếu và một chấm cho mỗi ngày.
struct KoaRhythmCard: View {
  let state: KoaRhythm.State

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("rhythm.title")
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(String(localized: "rhythm.sessions \(state.sessions)"))
        .font(.system(size: 26, weight: .bold).monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 15), spacing: 5) {
        ForEach(Array(state.days.enumerated()), id: \.offset) { _, d in dot(d) }
      }
      .accessibilityHidden(true)
      HStack(spacing: DS.Spacing.sm) {
        legend(Self.trained, "rhythm.trained")
        legend(Self.rest, "rhythm.rest")
        if state.days.contains(.paused) { legend(Self.paused, "rhythm.paused") }
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

  private func legend(_ c: Color, _ key: LocalizedStringKey) -> some View {
    HStack(spacing: 4) {
      Circle().fill(c).frame(width: 7, height: 7)
      Text(key).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }
}

/// Hành trình cùng Koa: tổng kết tháng và các mốc thật, mới nhất ở trên.
struct KoaJourneyView: View {
  @Environment(AppServices.self) private var services
  @Environment(\.locale) private var locale

  var body: some View {
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let lang = AppPreferences.Lang(rawValue: String(locale.identifier.prefix(2))) ?? .vi
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if let h = services.koaGainsHistory {
          let moments = KoaJourney.moments(h.days, week: h.week, today: today)
          header(rank: KoaGains.compute(h.days, week: h.week, today: today).rank)
          month(moments, days: h.days, today: today)
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
    .navigationTitle(Text("journey.title"))
    .ascndPage()
    .task { await services.ensureKoaGainsHistory() }
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

  /// Tháng này; đầu tháng chưa có buổi thì tháng trước.
  @ViewBuilder private func month(_ moments: [KoaJourney.Moment], days: [KoaGains.Day], today: LocalDate) -> some View {
    let now = KoaJourney.month(moments, days: days, year: today.year, month: today.month)
    let prev = today.adding(days: -today.day)
    let shown = now.sessions > 0 ? now : KoaJourney.month(moments, days: days, year: prev.year, month: prev.month)
    if shown.sessions > 0 {
      VStack(alignment: .leading, spacing: 4) {
        Text(String(localized: "journey.month \(monthName(shown))"))
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.8)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(String(localized: "journey.month.sessions \(shown.sessions)"))
          .font(.system(size: 26, weight: .bold).monospacedDigit())
        Text(
          shown.records + shown.fullWeeks == 0
            ? String(localized: "journey.month.quiet")
            : String(localized: "journey.month.body \(shown.records) \(shown.fullWeeks)"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(DS.Spacing.md)
      .todayCard()
      .accessibilityElement(children: .combine)
    }
  }

  private func monthName(_ m: KoaJourney.Month) -> String {
    let date = Calendar.current.date(from: DateComponents(year: m.year, month: m.month, day: 1)) ?? .now
    return date.formatted(.dateTime.month(.wide).locale(locale))
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
