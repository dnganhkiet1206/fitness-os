import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Vận động (#527) — `app/steps.tsx` @ fac9ac2 trên `StepsBook`.
///
/// Như RN: số bước hôm nay (hàng đúng ngày hôm nay) + "Mục tiêu N" + %, thanh
/// tiến độ, nút −/+ 500 cho mục tiêu; ô trung bình ngày (7 hàng cuối) và xu
/// thế (3 hàng cuối so với 3 hàng trước — mũi tên ngang + màu trung tính khi
/// làm tròn ra 0); cột 7 ngày, ngày đạt mục tiêu tô màu chính. Kéo để đọc lại.
///
/// Khác RN: đọc hỏng có màn lỗi thử lại (RN vẽ như chưa có bước nào); mục tiêu
/// nhớ theo tài khoản.
struct StepsView: View {
  let book: StepsBook

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        switch book.phase {
        case .loading:
          DSLoadingView()
        case .failed:
          DSErrorView(message: String(localized: "steps.loadFailed")) {
            Task { await book.load() }
          }
        case .ready:
          if let s = book.stats {
            summary(s)
            statRow(s)
            week(s)
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("steps.title"))
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sensoryFeedback(.selection, trigger: book.goal)
  }

  private static func n(_ v: Double) -> String { Int(JS0.round(v)).formatted(.number.locale(.app)) }

  // MARK: - Hôm nay + mục tiêu

  private func summary(_ s: Steps.Stats) -> some View {
    let pct = Steps.percent(today: s.today, goal: book.goal)
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: Self.n(s.today))
              .font(DS.TextStyle.largeTitle.monospacedDigit())
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Text("steps.goal \(book.goal.formatted(.number.locale(.app)))")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          Text(verbatim: "\(Int(JS0.round(pct)))%")
            .font(DS.TextStyle.title.monospacedDigit())
            .foregroundStyle(DS.Color.primary.swiftUI)
        }
        .accessibilityElement(children: .combine)
        ProgressView(value: pct, total: 100)
          .tint(DS.Color.primary.swiftUI)
          .accessibilityHidden(true)
        HStack(spacing: DS.Spacing.md) {
          Spacer()
          goalButton("minus", label: "steps.goal.decrease", delta: -Steps.goalStep)
          Text(verbatim: book.goal.formatted(.number.locale(.app)))
            .font(DS.TextStyle.headline.monospacedDigit())
            .frame(minWidth: 64)
            .accessibilityHidden(true)
          goalButton("plus", label: "steps.goal.increase", delta: Steps.goalStep)
          Spacer()
        }
      }
    }
  }

  private func goalButton(_ symbol: String, label: LocalizedStringKey, delta: Int) -> some View {
    Button {
      book.adjustGoal(by: delta)
    } label: {
      Image(systemName: symbol)
        .font(.body.weight(.semibold))
        .frame(width: 44, height: 44)
        .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: 10))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(label))
    .accessibilityValue(Text(verbatim: book.goal.formatted(.number.locale(.app))))
  }

  // MARK: - Ô số

  private func statRow(_ s: Steps.Stats) -> some View {
    let trend = Int(JS0.round(s.trend))
    let tint =
      trend > 0
      ? DS.Color.readinessGreen.swiftUI : trend < 0 ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI
    let arrow = trend > 0 ? "arrow.up" : trend < 0 ? "arrow.down" : "arrow.right"
    return HStack(spacing: DS.Spacing.sm) {
      tile {
        Text(verbatim: Self.n(s.avg))
          .font(DS.TextStyle.title.monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
      } label: {
        Text("steps.dailyAvg")
      }
      tile {
        Label {
          Text(verbatim: "\(abs(trend))%").font(DS.TextStyle.title.monospacedDigit())
        } icon: {
          Image(systemName: arrow)
        }
        .foregroundStyle(tint)
      } label: {
        Text("steps.last7")
      }
    }
  }

  private func tile<V: View, L: View>(@ViewBuilder value: () -> V, @ViewBuilder label: () -> L) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      value()
      label()
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .combine)
  }

  // MARK: - 7 ngày

  private func week(_ s: Steps.Stats) -> some View {
    let goal = book.goal
    let top = Steps.maxWeek(s.last7, goal: goal)
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("steps.last7").font(DS.TextStyle.headline)
        Chart(s.last7) { d in
          BarMark(
            x: .value("day", d.date.description),
            // Cột thấp nhất vẫn thấy được (`Math.max(3, h)`).
            y: .value("steps", max(top * 0.03, d.steps))
          )
          .foregroundStyle(d.steps >= Double(goal) ? DS.Color.primary.swiftUI : DS.Color.secondary.swiftUI)
          .cornerRadius(4)
        }
        .chartYScale(domain: 0...max(top, 1))
        .chartYAxis(.hidden)
        .chartXAxis {
          AxisMarks(values: s.last7.map { $0.date.description }) { v in
            AxisValueLabel {
              if let text = v.as(String.self), let day = LocalDate(text) {
                Text(day.calendarDate, format: .dateTime.weekday(.abbreviated).locale(.app))
                  .font(DS.TextStyle.caption)
              }
            }
          }
        }
        .frame(height: 130)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("steps.last7"))
        .accessibilityValue(Text(verbatim: s.last7.map { Self.n($0.steps) }.joined(separator: ", ")))
      }
    }
  }
}

/// `Math.round` cho màn này (JS: nửa lên).
private enum JS0 {
  static func round(_ x: Double) -> Double { (x + 0.5).rounded(.down) }
}
