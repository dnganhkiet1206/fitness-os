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
        // Chưa đọc được xu hướng → không vẽ đường (19/10: thẻ nói "Chưa đủ dữ
        // liệu" mà vẫn vẽ một đường dốc xuống — người xem đọc nó như xu hướng).
        if case .ready(let a) = book.phase, AssistantSummary.trend(a.bars) != nil {
          Sparkline(values: a.bars.filter { !$0.missing }.map(\.value))
        }
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
