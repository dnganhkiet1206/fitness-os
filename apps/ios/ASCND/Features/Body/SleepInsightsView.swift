import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Giấc ngủ — 7 ngày (#527) — `app/sleep-insights.tsx` @ fac9ac2 trên
/// `SleepInsightsBook`.
///
/// Như RN: đọc hỏng là lỗi có thử lại (không phải "chưa có dữ liệu"); một thẻ
/// chủ: giờ ngủ trung bình + dòng "đạt / thiếu … so với mục tiêu", ba cột
/// chống lưng (chất lượng · deep — "—" khi không ai đo tầng · nợ ngủ), cột
/// chồng nông · REM · sâu (sâu ở đáy), đêm không đo tầng là cột RỖNG RUỘT, đường
/// mục tiêu; thẻ nhận xét; sổ các đêm mới → cũ (giờ ngủ thật — `asleepMinutes`
/// — chứ không phải giờ nằm), xoá hỏi lại rồi dựng lại điểm.
///
/// Khác RN: nợ ngủ trên số đêm đã ghi; trống thì không có nút "Ghi giấc ngủ"
/// (`log-sleep` chưa port); màu tầng theo bảng DS (`metricPurple` / `metricBlue`).
struct SleepInsightsView: View {
  let book: SleepInsightsBook
  let lang: AppPreferences.Lang

  @State private var confirm: SleepInsights.Night?
  @State private var outcome: SleepInsightsBook.DeleteOutcome?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        switch book.phase {
        case .loading:
          DSLoadingView()
        case .failed:
          DSErrorView(message: String(localized: "sleep.loadFailed")) {
            Task { await book.load() }
          }
        case .ready(let nights, let target):
          if let s = SleepInsights.stats(nights, targetHours: target) {
            hero(s, nights: nights, target: target)
            let tips = SleepInsights.insights(s, targetHours: target)
            if !tips.isEmpty { insights(tips) }
            log(nights)
          } else {
            DSEmptyState(
              systemImage: "moon.zzz", title: String(localized: "sleep.empty.title"),
              message: String(localized: "sleep.empty.message"))
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("sleep.title"))
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sensoryFeedback(trigger: outcome) { _, new in
      switch new {
      case .deleted?: .success
      case .failed?, .nothingWritten?, .rebuildFailed?: .error
      case nil: nil
      }
    }
    .alert(
      Text("sleep.delete.title"), isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
      presenting: confirm
    ) { night in
      Button("common.cancel", role: .cancel) {}
      Button("sleep.delete.confirm", role: .destructive) {
        Task { outcome = await book.delete(night) }
      }
    } message: { _ in
      Text("sleep.delete.message")
    }
  }

  // MARK: - Thẻ chủ

  private func hero(_ s: SleepInsights.Stats, nights: [SleepInsights.Night], target: Double) -> some View {
    let m = SleepInsights.metrics(s)
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Label("sleep.last7", systemImage: "moon.fill")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: SleepInsights.hoursText(s.avgTotal))
            .font(DS.TextStyle.hero.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(verbatim: SleepInsights.caption(s, targetHours: target)(lang))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .accessibilityElement(children: .combine)
        Divider()
        HStack {
          column("sleep.avgQuality", m.quality, tint: nil)
          column("sleep.avgDeep", m.deep, tint: s.avgDeep == nil ? nil : DS.Color.metricPurple.swiftUI)
          column("sleep.debt", m.debt, tint: nil)
        }
        legend
        chart(nights, target: target)
      }
    }
  }

  private func column(_ label: LocalizedStringKey, _ value: String, tint: Color?) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: value)
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(tint ?? DS.Color.foreground.swiftUI)
      Text(label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private static let light = DS.Color.secondary.swiftUI
  private static let rem = DS.Color.metricBlue.swiftUI
  private static let deep = DS.Color.metricPurple.swiftUI

  /// Thứ tự chú giải đi theo thứ tự trong cột: nông · REM · sâu.
  private var legend: some View {
    HStack(spacing: DS.Spacing.md) {
      dot(Self.light, "sleep.stage.light")
      dot(Self.rem, "sleep.stage.rem")
      dot(Self.deep, "sleep.stage.deep")
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func dot(_ c: Color, _ label: LocalizedStringKey) -> some View {
    HStack(spacing: 4) {
      Circle().fill(c).frame(width: 8, height: 8).accessibilityHidden(true)
      Text(label)
    }
  }

  private struct Segment: Identifiable {
    let id: String
    let night: String
    let stage: Int
    let hours: Double
  }

  private func chart(_ nights: [SleepInsights.Night], target: Double) -> some View {
    let top = SleepInsights.maxH(nights, targetHours: target)
    let label = { (n: SleepInsights.Night) -> String in n.id }
    var segments: [Segment] = []
    for n in nights where n.stagesKnown {
      // Sâu ở đáy, REM giữa, nông trên (quy ước hypnogram).
      segments.append(Segment(id: n.id + "d", night: label(n), stage: 0, hours: n.deepH))
      segments.append(Segment(id: n.id + "r", night: label(n), stage: 1, hours: n.remH))
      segments.append(Segment(id: n.id + "l", night: label(n), stage: 2, hours: n.lightH))
    }
    let unstaged = nights.filter { !$0.stagesKnown }
    let weekday = Dictionary(uniqueKeysWithValues: nights.map { n in
      (n.id, n.waketime.map { Date(timeIntervalSince1970: TimeInterval($0.millis) / 1000) })
    })
    return Chart {
      ForEach(segments) { seg in
        BarMark(x: .value("night", seg.night), y: .value("h", seg.hours))
          .foregroundStyle(seg.stage == 0 ? Self.deep : seg.stage == 1 ? Self.rem : Self.light)
      }
      // Đêm không ai đo tầng: rỗng ruột, một nét viền — khác HẠNG, không khác màu.
      ForEach(unstaged) { n in
        RectangleMark(x: .value("night", n.id), yStart: .value("h", 0), yEnd: .value("h", n.totalH), width: .ratio(0.6))
          .foregroundStyle(.clear)
          .annotation(position: .overlay) {
            RoundedRectangle(cornerRadius: 3)
              .strokeBorder(DS.Color.mutedForeground.swiftUI, lineWidth: 1.5)
          }
      }
      RuleMark(y: .value("target", target))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .chartYScale(domain: 0...max(top, 1))
    .chartYAxis(.hidden)
    .chartXAxis {
      AxisMarks(values: nights.map(\.id)) { v in
        AxisValueLabel {
          if let id = v.as(String.self), let d = weekday[id] ?? nil {
            Text(d, format: .dateTime.weekday(.abbreviated).locale(.app)).font(DS.TextStyle.caption)
          }
        }
      }
    }
    .frame(height: 140)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("sleep.last7"))
    .accessibilityValue(Text(verbatim: nights.map { SleepInsights.duration($0.minutes) }.joined(separator: ", ")))
  }

  // MARK: - Nhận xét

  private func insights(_ tips: [AssistantSuggestions.Text3]) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Label("sleep.insights", systemImage: "lightbulb")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        ForEach(Array(tips.enumerated()), id: \.offset) { _, t in
          Text(verbatim: t(lang))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: - Sổ các đêm

  private func log(_ nights: [SleepInsights.Night]) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("sleep.logged")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      if outcome == .failed || outcome == .nothingWritten || outcome == .rebuildFailed {
        Text(outcome == .rebuildFailed ? LocalizedStringKey("sleep.delete.rebuildFailed") : LocalizedStringKey("sleep.delete.failed"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
      VStack(spacing: 0) {
        ForEach(Array(nights.reversed().enumerated()), id: \.element.id) { i, n in
          if i > 0 { Divider() }
          row(n)
        }
      }
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    }
  }

  private func row(_ n: SleepInsights.Night) -> some View {
    let date = { (t: EpochMillis?) in t.map { Date(timeIntervalSince1970: TimeInterval($0.millis) / 1000) } }
    return HStack(spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 2) {
        if let bed = date(n.bedtime), let wake = date(n.waketime) {
          Text(verbatim: "\(bed.formatted(date: .omitted, time: .shortened)) → \(wake.formatted(date: .omitted, time: .shortened))")
            .font(DS.TextStyle.body.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(wake, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(.app))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 0) {
        Text(verbatim: SleepInsights.duration(n.minutes))
          .font(DS.TextStyle.headline.monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text("sleep.asleep")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      Button {
        confirm = n
      } label: {
        Image(systemName: "trash")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(book.deleting)
      .accessibilityLabel(Text("sleep.delete.a11y"))
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.xs)
  }
}
