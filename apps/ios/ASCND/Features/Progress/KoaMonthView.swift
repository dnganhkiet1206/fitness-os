import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Tháng của bạn với Koa" (13/11, Kiệt duyệt mock `docs/design/mocks/koa-month-recap.html` cả ba đề
/// xuất: có Chia sẻ, Koa nhắc đầu tháng, dải 12 tháng tải dần). Số tính lại trong `KoaMonthRecap`.
enum KoaMonthText {
  static func monthName(_ k: KoaMonthRecap.Key, style: Date.FormatStyle.Symbol.Month = .wide) -> String {
    k.first.calendarDate.formatted(.dateTime.month(style).locale(.app))
  }

  static func monthYear(_ k: KoaMonthRecap.Key) -> String {
    k.first.calendarDate.formatted(.dateTime.month(.wide).year().locale(.app))
  }

  /// Tên thứ theo ngôn ngữ app, thứ Hai = 0 (`WorkoutPlanning.routineIndex`).
  static func weekday(_ i: Int, short: Bool = false) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.locale = .app
    let symbols = short ? cal.veryShortStandaloneWeekdaySymbols : cal.standaloneWeekdaySymbols
    // Calendar: Chủ nhật = 0
    return symbols[(i + 1) % 7]
  }

  /// Tên thứ giữa câu: tiếng Việt viết thường ("thứ hai"); tiếng Anh giữ hoa ("Monday"); tiếng Tây Ban
  /// Nha vốn đã thường ("lunes").
  static func midSentence(_ name: String) -> String {
    Locale.app.language.languageCode?.identifier == "vi" ? name.lowercased() : name
  }

  static func koaLine(_ r: KoaMonthRecap.Recap) -> String {
    switch KoaMonthRecap.line(r) {
    case .quiet: String(localized: "month.line.quiet")
    case .loggedOnly(let n): String(localized: "month.line.logged \(n)")
    case .lighter: String(localized: "month.line.lighter")
    case .usual(let days):
      String(localized: "month.line.usual \(midSentence(weekday(days[0]))) \(midSentence(weekday(days[1])))")
    case .sessions(let n): String(localized: "month.line.sessions \(n)")
    }
  }

  /// "2 kỷ lục · 13 ngày có ghi" — chỉ những gì có.
  static func summary(_ r: KoaMonthRecap.Recap) -> String {
    var parts: [String] = []
    if r.records > 0 { parts.append(String(localized: "month.records \(r.records)")) }
    if r.fullWeeks > 0 { parts.append(String(localized: "month.fullweeks \(r.fullWeeks)")) }
    if r.logged > 0 { parts.append(String(localized: "logrhythm.days \(r.logged)")) }
    return parts.isEmpty ? String(localized: "journey.month.quiet") : parts.joined(separator: " · ")
  }
}

/// Thẻ tháng ở đầu Hành trình (chạm mở trang tháng) và dải các tháng trước bên dưới.
struct KoaMonthSection: View {
  let history: AppServices.GainsHistory
  let today: LocalDate
  @State private var limit = KoaMonthRecap.pageSize
  @ScaledMetric(relativeTo: .title) private var sessionsSize: CGFloat = 26

  var body: some View {
    let months = KoaMonthRecap.months(days: history.days, logged: history.logged, today: today)
    let current = recap(KoaMonthRecap.Key(today))
    // đầu tháng chưa làm gì thì thẻ là tháng trước, như trước 13/11
    let shown = current.quiet && months.count > 1 ? recap(months[1]) : current
    if !shown.quiet {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        NavigationLink {
          KoaMonthView(history: history, key: shown.key, today: today)
        } label: {
          card(shown)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("journey.month")
        let rest = months.filter { $0 != shown.key }
        if !rest.isEmpty { strip(Array(rest.prefix(limit)), more: rest.count > limit) }
      }
    }
  }

  private func recap(_ k: KoaMonthRecap.Key) -> KoaMonthRecap.Recap {
    KoaMonthRecap.recap(k, days: history.days, week: history.week, logKinds: history.logKinds, today: today)
  }

  private func card(_ r: KoaMonthRecap.Recap) -> some View {
    HStack(alignment: .center, spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 4) {
        Text(String(localized: "journey.month \(KoaMonthText.monthName(r.key))"))
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.8)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(String(localized: "journey.month.sessions \(r.sessions)"))
          .font(.system(size: sessionsSize, weight: .bold).monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(verbatim: KoaMonthText.summary(r))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .contentShape(Rectangle())
    .todayCard()
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }

  private func strip(_ keys: [KoaMonthRecap.Key], more: Bool) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.sm) {
        ForEach(keys) { k in
          NavigationLink {
            KoaMonthView(history: history, key: k, today: today)
          } label: {
            tile(recap(k))
          }
          .buttonStyle(.plain)
        }
        if more {
          Button {
            limit += KoaMonthRecap.pageSize
          } label: {
            Text("month.more")
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(width: 76, height: 96)
              .todayCard(radius: DS.Radius.md)
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.vertical, 2)
    }
    .scrollClipDisabled()
  }

  private func tile(_ r: KoaMonthRecap.Recap) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(verbatim: KoaMonthText.monthName(r.key, style: .abbreviated))
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
      Label { Text(verbatim: "\(r.sessions)") } icon: { Image(systemName: "dumbbell.fill") }
        .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Label { Text(verbatim: "\(r.logged)") } icon: { Image(systemName: "square.and.pencil") }
        .font(DS.TextStyle.footnote.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(alignment: .bottom, spacing: 2) {
        ForEach(Array(r.weeks.enumerated()), id: \.offset) { _, n in
          RoundedRectangle(cornerRadius: 1.5)
            .fill(KoaMonthView.tint.opacity(n > 0 ? 1 : 0.25))
            .frame(height: max(3, CGFloat(min(n, 3)) / 3 * 18))
        }
      }
      .frame(height: 18, alignment: .bottom)
    }
    .frame(width: 76, alignment: .leading)
    .padding(DS.Spacing.sm)
    .todayCard(radius: DS.Radius.md)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      Text(verbatim: "\(KoaMonthText.monthYear(r.key)): \(String(localized: "journey.month.sessions \(r.sessions)")), \(String(localized: "logrhythm.days \(r.logged)"))"))
    .accessibilityAddTraits(.isButton)
  }
}

/// Trang "Tháng N của bạn": tập, ghi, ngày hay tập, mốc nổi bật, một câu Koa và nút Chia sẻ.
struct KoaMonthView: View {
  let history: AppServices.GainsHistory
  let key: KoaMonthRecap.Key
  let today: LocalDate
  @Environment(AppServices.self) private var services: AppServices?
  @Environment(\.colorScheme) private var scheme
  @State private var shareImage: Image?

  static let tint = DS.Color.readinessYellow.swiftUI

  var body: some View {
    let r = KoaMonthRecap.recap(key, days: history.days, week: history.week, logKinds: history.logKinds, today: today)
    let rank = KoaGains.compute(history.days, week: history.week, today: today).rank
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        hero(r, rank: rank)
        stats(r)
        // một hai buổi thì không có "ngày hay tập" để nói (cùng ngưỡng với `usualDays`)
        if r.sessions >= 4 { weekdays(r) }
        if !r.highlights.isEmpty { highlights(r) }
        koa(r, rank: rank)
        if let shareImage {
          ShareLink(
            item: shareImage,
            preview: SharePreview(Text(verbatim: String(localized: "month.title \(KoaMonthText.monthName(key))")), image: shareImage)
          ) {
            Label(String(localized: "month.share"), systemImage: "square.and.arrow.up")
          }
          .buttonStyle(.dsPillSecondary)
          .frame(maxWidth: .infinity)
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(verbatim: String(localized: "month.title \(KoaMonthText.monthName(key))")))
    .ascndPage()
    .task(id: scheme) { shareImage = render(r, rank: rank) }
  }

  private func hero(_ r: KoaMonthRecap.Recap, rank: Int) -> some View {
    VStack(spacing: 6) {
      MascotFigureView(emotion: r.quiet ? .idle : .proud, size: 96, animated: false, build: rank)
        .accessibilityHidden(true)
      Text(String(localized: "journey.month.sessions \(r.sessions)"))
        .font(DS.TextStyle.largeTitle.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      if let compare = compare(r) {
        Text(verbatim: compare)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .frame(maxWidth: .infinity)
    .multilineTextAlignment(.center)
    .accessibilityElement(children: .combine)
  }

  private func compare(_ r: KoaMonthRecap.Recap) -> String? {
    guard r.previousSessions > 0 || r.sessions > 0 else { return nil }
    if r.previousSessions == 0 { return nil }
    if r.change > 0 { return String(localized: "month.more.sessions \(r.change)") }
    if r.change < 0 { return String(localized: "month.before \(r.previousSessions)") }
    return String(localized: "month.same")
  }

  private func stats(_ r: KoaMonthRecap.Recap) -> some View {
    let lang = AppPreferences.Lang(rawValue: AppServices.appLang) ?? .vi
    // Chỉ những gì có: ô "0 kỷ lục" đọc như chưa đạt (mock 13/11 chỉ hiện số khác 0).
    var tiles: [(String, String)] = [
      (r.records, String(localized: "month.stat.records")),
      (r.fullWeeks, String(localized: "month.stat.fullweeks")),
      (r.logged, String(localized: "month.stat.logged")),
    ].filter { $0.0 > 0 }.map { ("\($0.0)", $0.1) }
    if let up = r.rankUps.last {
      let name = MascotRules.ranks[min(up, MascotRules.ranks.count - 1)].name(lang)
      tiles.append((name, String(localized: "month.stat.rank")))
    } else if let step = r.tierUps.last {
      let t = KoaGains.tier(step: step)
      tiles.append((KoaTierText.name(rank: t.rank, tier: t.tier, lang: lang), String(localized: "month.stat.tier")))
    }
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      if !tiles.isEmpty {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible(), spacing: DS.Spacing.sm)], spacing: DS.Spacing.sm) {
          ForEach(tiles, id: \.1) { value, label in
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: value)
                .font(DS.TextStyle.title.monospacedDigit())
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
              Text(verbatim: label)
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(DS.Spacing.sm + 4)
            .todayCard(radius: DS.Radius.lg)
            .accessibilityElement(children: .combine)
          }
        }
      }
      if r.logged > 0 {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: DS.Spacing.md) { split(r) }
          VStack(alignment: .leading, spacing: 4) { split(r) }
        }
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.horizontal, 4)
      }
    }
  }

  @ViewBuilder private func split(_ r: KoaMonthRecap.Recap) -> some View {
    Text(String(localized: "logrhythm.meals \(r.meals)"))
    Text(String(localized: "logrhythm.water \(r.water)"))
    Text(String(localized: "logrhythm.sleep \(r.sleep)"))
  }

  private func weekdays(_ r: KoaMonthRecap.Recap) -> some View {
    let top = r.weekdays.max() ?? 0
    let usual = Set(r.usualDays)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("month.weekdays")
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(alignment: .bottom, spacing: 6) {
        ForEach(0..<7, id: \.self) { i in
          VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 4)
              .fill(usual.contains(i) ? Self.tint : DS.Color.mutedForeground.swiftUI.opacity(r.weekdays[i] > 0 ? 0.45 : 0.15))
              .frame(height: top > 0 ? max(4, CGFloat(r.weekdays[i]) / CGFloat(top) * 56) : 4)
            Text(verbatim: KoaMonthText.weekday(i, short: true))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: 80, alignment: .bottom)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(
        Text(verbatim: (0..<7).filter { r.weekdays[$0] > 0 }.map { "\(KoaMonthText.weekday($0)) \(r.weekdays[$0])" }.joined(separator: ", ")))
    }
    .padding(DS.Spacing.md)
    .todayCard()
  }

  private func highlights(_ r: KoaMonthRecap.Recap) -> some View {
    let lang = AppPreferences.Lang(rawValue: AppServices.appLang) ?? .vi
    let records = services?.koaShelfRecords?.records ?? [:]
    return VStack(alignment: .leading, spacing: 0) {
      ForEach(r.highlights) { m in
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Image(systemName: KoaMomentsStore.symbol(m.kind))
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(m.major ? Self.tint : DS.Color.mutedForeground.swiftUI)
            .frame(width: 22)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: m.kind == .record ? records[m.date].map { String(localized: "month.record \($0.exercise)") } ?? KoaMomentsStore.line(m, lang: lang) : KoaMomentsStore.line(m, lang: lang))
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
            Text(m.date.calendarDate, format: .dateTime.day().month(.abbreviated).locale(.app))
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer(minLength: 0)
        }
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
      }
    }
    .padding(.vertical, DS.Spacing.xs)
    .todayCard()
  }

  private func koa(_ r: KoaMonthRecap.Recap, rank: Int) -> some View {
    HStack(alignment: .top, spacing: DS.Spacing.sm) {
      MascotFigureView(emotion: r.quiet ? .idle : .happy, size: 52, animated: false, build: rank)
        .accessibilityHidden(true)
      Text(verbatim: KoaMonthText.koaLine(r))
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(uiColor: .systemGray5), in: RoundedRectangle(cornerRadius: 16))
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  /// Ảnh dọc để chia sẻ: chỉ tháng, số buổi, số ngày ghi và Koa. Không calo, không cân.
  @MainActor private func render(_ r: KoaMonthRecap.Recap, rank: Int) -> Image? {
    let card = KoaMonthShareCard(recap: r, rank: rank).environment(\.colorScheme, scheme)
    let renderer = ImageRenderer(content: card)
    renderer.scale = 3
    return renderer.uiImage.map { Image(uiImage: $0) }
  }
}

/// Ảnh chia sẻ của trang tháng (1080 × 1350 ở scale 3).
struct KoaMonthShareCard: View {
  let recap: KoaMonthRecap.Recap
  let rank: Int

  var body: some View {
    VStack(spacing: 14) {
      Spacer(minLength: 0)
      MascotFigureView(emotion: .proud, size: 150, animated: false, build: rank)
      Text(verbatim: KoaMonthText.monthYear(recap.key))
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(1)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(String(localized: "journey.month.sessions \(recap.sessions)"))
        .font(.system(size: 44, weight: .bold).monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      if recap.logged > 0 {
        Text(String(localized: "logrhythm.days \(recap.logged)"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
      Image("BrandMark")
        .resizable()
        .renderingMode(.template)
        .scaledToFit()
        .frame(height: 22)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(28)
    .frame(width: 360, height: 450)
    .background(DS.Color.background.swiftUI)
  }
}
