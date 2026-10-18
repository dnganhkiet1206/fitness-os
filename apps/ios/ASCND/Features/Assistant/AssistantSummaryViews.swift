import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// MARK: - Trợ lý sức khoẻ v2 (15/10, chủ dự án duyệt mock — học từ Apple Health mới:
// tóm tắt trước, chi tiết khi chạm; điểm sẵn sàng có NHÃN CHỮ và so với mức
// thường của chính mình; mỗi mảng một thẻ với MỘT câu nhận xét).

/// Mặt thẻ của tab = mặt thẻ chung `dsCard` (15/10, gom kiểu thẻ).
struct AssistantSurface: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .dsCard()
  }
}

/// Nhãn nhỏ đầu thẻ: icon + tên mảng, màu của mảng.
struct AssistantCaption: View {
  let symbol: String
  let text: String
  let tint: Color

  var body: some View {
    Label {
      Text(verbatim: text)
    } icon: {
      Image(systemName: symbol)
    }
    .font(.system(size: 13, weight: .semibold))
    .foregroundStyle(tint)
    .labelStyle(.titleAndIcon)
  }
}

enum AssistantText {
  static func label(_ r: AssistantSummary.Readiness?) -> String {
    switch r {
    case .go: String(localized: "assistant.ready.go")
    case .pace: String(localized: "assistant.ready.pace")
    case .recover: String(localized: "assistant.ready.recover")
    case nil: String(localized: "metric.note.needsData")
    }
  }

  static func tint(_ r: AssistantSummary.Readiness?) -> Color {
    switch r {
    case .go: DS.Color.readinessGreen.swiftUI
    case .pace: DS.Color.readinessYellow.swiftUI
    case .recover: DS.Color.readinessRed.swiftUI
    case nil: DS.Color.mutedForeground.swiftUI
    }
  }

  static func versus(_ v: AssistantSummary.Versus?) -> String {
    switch v {
    case .above: String(localized: "assistant.vs.above")
    case .typical: String(localized: "assistant.vs.typical")
    case .below: String(localized: "assistant.vs.below")
    case nil: String(localized: "assistant.vs.none")
    }
  }

  static func trend(_ d: MetricAnalysis.Direction?) -> String {
    switch d {
    case .up: String(localized: "assistant.trend.up")
    case .down: String(localized: "assistant.trend.down")
    case .flat: String(localized: "assistant.trend.flat")
    case nil: String(localized: "assistant.trend.none")
    }
  }

  static func kind(_ k: MetricAnalysis.Kind) -> String {
    switch k {
    case .readiness: String(localized: "metric.readiness")
    case .sleep: String(localized: "metric.sleep")
    case .kcal: String(localized: "metric.kcal")
    case .hr: String(localized: "metric.hr")
    }
  }
}

/// Thẻ đầu: vòng sẵn sàng 0–100 (`ReadinessGauge`, chung với Hôm nay) + nhãn chữ + so với mức thường; dưới vạch là gợi
/// ý hôm nay (các dòng tóm tắt của `AssistantBrief`).
struct SummaryCard: View {
  let signal: AssistantSignalBook
  let metrics: MetricHistoryBook?
  let lang: AppPreferences.Lang
  let hour: Int
  let openTrends: () -> Void
  /// "Ghi giấc ngủ" — khi đêm qua chưa có (điểm hôm nay cần nó).
  var logSleep: (() -> Void)?

  var body: some View {
    let s = signal.signal
    let bars: [MetricAnalysis.Bar] =
      if let metrics, metrics.kind == .readiness, case .ready(let a) = metrics.phase { a.bars } else { [] }
    // Cùng quyết định với Hôm nay (`AssistantSummary.shown`): hôm nay chưa có điểm
    // → điểm gần nhất, ghi rõ ngày.
    // Điểm chỉ dựa vào tải tập (17/10): như Hôm nay — "chưa đủ dữ liệu", không số.
    let provisional = AssistantSummary.provisional(score: s.readiness, hasRecovery: s.hasRecovery)
    let shown = provisional ? nil : AssistantSummary.shown(
      today: s.readiness, status: s.status,
      recent: bars.filter { !$0.missing && !$0.today }.map { ($0.date, Int($0.value.rounded())) })
    let ready = shown?.level
    let tint = AssistantText.tint(ready)
    let note = provisional
      ? String(localized: "rd.provisional.reason")
      : ReadinessGauge.staleNote(shown) ?? AssistantText.versus(AssistantSummary.versus(today: s.readiness, bars: bars))
    let brief = signal.brief(hour: hour)
    VStack(alignment: .leading, spacing: 12) {
      Button(action: openTrends) {
        HStack(spacing: 14) {
          ReadinessGauge(shown: shown)
          VStack(alignment: .leading, spacing: 2) {
            Text("metric.readiness")
              .font(.system(size: 13))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: provisional ? String(localized: "rd.provisional.title") : AssistantText.label(ready))
              .font(.system(size: 21, weight: .bold)).tracking(-0.3)
              .foregroundStyle(ready == nil ? DS.Color.foreground.swiftUI : tint)
            Text(verbatim: note)
              .font(.system(size: 13))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 0)
          Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityElement(children: .combine)
      if s.sleepMin == 0, let logSleep {
        AssistantActionPill(title: String(localized: "assistant.action.sleep"), symbol: "moon.fill", action: logSleep)
      }
      if !brief.lines.isEmpty {
        Rectangle().fill(DS.Color.foreground.swiftUI.opacity(0.08)).frame(height: 0.5)
        VStack(alignment: .leading, spacing: 6) {
          ForEach(brief.lines) { line in
            Text(verbatim: line.text(lang))
              .font(.system(size: 15))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    }
    .padding(2)
    .modifier(AssistantSurface())
  }

  /// "hôm qua" / "Thứ Ba".
  static func dayText(_ d: LocalDate) -> String {
    var c = DateComponents()
    c.year = d.year
    c.month = d.month
    c.day = d.day
    guard let date = Calendar.current.date(from: c) else { return d.description }
    if Calendar.current.isDateInYesterday(date) { return String(localized: "dm.yesterday").lowercased() }
    return date.formatted(Date.FormatStyle().weekday(.wide).locale(.app))
  }
}

/// Viên hành động nhỏ trong thẻ (Ghi giấc ngủ / Ghi bữa / Đồng bộ).
struct AssistantActionPill: View {
  let title: String
  let symbol: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: symbol)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(DS.Color.background.swiftUI)
        .padding(.horizontal, 14)
        .frame(height: 34)
        .background(DS.Color.foreground.swiftUI, in: Capsule())
        .frame(minHeight: 44)
        .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
  }
}

/// Thẻ xu hướng 7 ngày (loại đang chọn) — một câu + đường nhỏ; chạm mở bảng đầy đủ.
struct TrendHighlight: View {
  let book: MetricHistoryBook
  let lang: AppPreferences.Lang
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          AssistantCaption(
            symbol: "chart.line.uptrend.xyaxis", text: String(localized: "assistant.trend \(AssistantText.kind(book.kind))"),
            tint: DS.Color.metricRose.swiftUI)
          switch book.phase {
          case .ready(let a):
            Text(verbatim: AssistantText.trend(AssistantSummary.trend(a.bars)))
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Text(verbatim: a.headline(lang))
              .font(.system(size: 13))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(2)
          default:
            Text(verbatim: AssistantText.trend(nil))
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
          }
        }
        Spacer(minLength: 0)
        if case .ready(let a) = book.phase { Sparkline(values: a.bars.filter { !$0.missing }.map(\.value)) }
      }
      .modifier(AssistantSurface())
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityElement(children: .combine)
  }
}

/// Đường nhỏ, điểm cuối tô đậm.
private struct Sparkline: View {
  let values: [Double]

  var body: some View {
    if values.count >= 2 {
      let lo = values.min() ?? 0
      let hi = values.max() ?? 1
      let span = max(hi - lo, 0.001)
      GeometryReader { g in
        let pts = values.enumerated().map { i, v in
          CGPoint(
            x: g.size.width * CGFloat(i) / CGFloat(values.count - 1),
            y: g.size.height - 4 - (g.size.height - 8) * CGFloat((v - lo) / span))
        }
        ZStack {
          Path { p in
            p.addLines(pts)
          }
          .stroke(DS.Color.metricRose.swiftUI, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
          if let last = pts.last {
            Circle().fill(DS.Color.metricRose.swiftUI).frame(width: 7, height: 7).position(last)
          }
        }
      }
      .frame(width: 86, height: 40)
      .accessibilityHidden(true)
    }
  }
}

/// Một mảng: nhãn + một câu (+ dòng phụ, + thanh tiến độ).
struct AreaHighlight: View {
  let symbol: String
  let title: String
  let tint: Color
  let headline: String
  var detail: String?
  var progress: Double?
  /// Hành động khi mảng chưa có dữ liệu (dữ liệu → hành động, như Apple Health).
  var action: (title: String, symbol: String, run: () -> Void)?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      AssistantCaption(symbol: symbol, text: title, tint: tint)
      Text(verbatim: headline)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      if let detail {
        Text(verbatim: detail)
          .font(.system(size: 13))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let progress {
        GeometryReader { g in
          ZStack(alignment: .leading) {
            Capsule().fill(tint.opacity(0.14))
            Capsule().fill(tint).frame(width: g.size.width * min(1, max(0, progress)))
          }
        }
        .frame(height: 5)
        .padding(.top, 6)
      }
      if let action {
        AssistantActionPill(title: action.title, symbol: action.symbol, action: action.run).padding(.top, 4)
      }
    }
    .modifier(AssistantSurface())
    .accessibilityElement(children: .contain)
  }
}

/// Ô "Hỏi coach về hôm nay…" — chạm mở chat; đang có cuộc trò chuyện thì có dòng
/// "Tiếp tục: …".
struct AskCoachBar: View {
  let lastAsked: String?
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 6) {
        // Không ký hiệu ASCND Intelligence ở đây: thẻ Insight ngay trên đã mang nó.
        HStack(spacing: 10) {
          Text("assistant.ask")
            .font(.system(size: 15))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Spacer(minLength: 0)
          Image(systemName: "arrow.up")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(width: 34, height: 34)
            .background(DS.Color.foreground.swiftUI, in: Circle())
        }
        .padding(.leading, 16)
        .padding(.trailing, 6)
        .frame(height: 50)
        .background(DS.Color.card.swiftUI, in: Capsule())
        .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.10), lineWidth: 0.75) }
        if let lastAsked {
          Label {
            Text("assistant.coach.continue \(lastAsked)").lineLimit(1)
          } icon: {
            Image(systemName: "clock")
          }
          .font(.system(size: 13))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.leading, 16)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text("assistant.coach.open.a11y"))
  }
}

/// Thẻ sẵn sàng mở sẵn (yếu tố HRV · nhịp tim nghỉ · giấc ngủ · tải tập) cho màn
/// "Xu hướng 7 ngày" — dùng lại `ReadinessCardView` của Hôm nay.
struct ReadinessFactors: View {
  let makeBook: () -> ReadinessBook?
  let lang: AppPreferences.Lang
  @State private var book: ReadinessBook?

  var body: some View {
    // Khung luôn có (kể cả lúc chưa dựng sổ) — `Group` rỗng không chạy `.task`.
    VStack {
      if let book {
        ReadinessCardView(book: book, lang: lang, startExpanded: true)
          .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      } else {
        Color.clear.frame(height: 1)
      }
    }
    .task {
      guard book == nil, let b = makeBook() else { return }
      book = b
      await b.load()
    }
  }
}
