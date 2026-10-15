import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// MARK: - Trợ lý sức khoẻ v2 (15/10, chủ dự án duyệt mock — học từ Apple Health mới:
// tóm tắt trước, chi tiết khi chạm; điểm sẵn sàng có NHÃN CHỮ và so với mức
// thường của chính mình; mỗi mảng một thẻ với MỘT câu nhận xét).

/// Mặt thẻ chung của tab: trắng, bo 20, viền mảnh.
struct AssistantSurface: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.07), lineWidth: 0.75)
      }
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

/// Thẻ đầu: vòng sẵn sàng 0–10 + nhãn chữ + so với mức thường; dưới vạch là gợi
/// ý hôm nay (các dòng tóm tắt của `AssistantBrief`).
struct SummaryCard: View {
  let signal: AssistantSignalBook
  let metrics: MetricHistoryBook?
  let lang: AppPreferences.Lang
  let hour: Int
  let openTrends: () -> Void

  var body: some View {
    let s = signal.signal
    let ready = AssistantSummary.readiness(status: s.status, score: s.readiness)
    let tint = AssistantText.tint(ready)
    let score = AssistantSummary.score10(s.readiness)
    let bars: [MetricAnalysis.Bar] =
      if let metrics, metrics.kind == .readiness, case .ready(let a) = metrics.phase { a.bars } else { [] }
    let brief = signal.brief(hour: hour)
    VStack(alignment: .leading, spacing: 12) {
      Button(action: openTrends) {
        HStack(spacing: 14) {
          ZStack {
            Circle().stroke(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 7)
            Circle()
              .trim(from: 0, to: CGFloat(score ?? 0) / 10)
              .stroke(tint, style: StrokeStyle(lineWidth: 7, lineCap: .round))
              .rotationEffect(.degrees(-90))
            Text(verbatim: score.map(String.init) ?? "—")
              .font(.system(size: 22, weight: .bold).monospacedDigit())
              .foregroundStyle(DS.Color.foreground.swiftUI)
          }
          .frame(width: 64, height: 64)
          VStack(alignment: .leading, spacing: 2) {
            Text("metric.readiness")
              .font(.system(size: 13))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: AssistantText.label(ready))
              .font(.system(size: 21, weight: .bold)).tracking(-0.3)
              .foregroundStyle(ready == nil ? DS.Color.foreground.swiftUI : tint)
            Text(verbatim: AssistantText.versus(AssistantSummary.versus(today: s.readiness, bars: bars)))
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
    }
    .modifier(AssistantSurface())
    .accessibilityElement(children: .combine)
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
        HStack(spacing: 10) {
          Image(systemName: "sparkles")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(DS.Color.metricPurple.swiftUI)
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
