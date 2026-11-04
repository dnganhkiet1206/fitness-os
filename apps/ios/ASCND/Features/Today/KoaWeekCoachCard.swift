import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ đầu tuần (Kiệt duyệt mock 03/11): Koa nói điều thật của tuần trước, đề xuất kiểu tuần
/// này theo `KoaWeekCoach`, và nhắc lại câu "nếu… thì…" của người dùng. Nhận hay giữ như cũ;
/// không bấm gì thì không đổi gì.
struct KoaWeekCoachCard: View {
  let kind: KoaWeekCoach.Kind
  let lastWeek: KoaWeekCoach.LastWeek
  /// Bài tiến nhiều nhất tuần trước (`ExerciseCompare.headline`).
  let highlight: ExerciseCompare.Item?
  let targets: [OverloadPlan.Item]
  let cue: TrainingCue?
  let build: Int
  let accept: () -> Void
  let keep: () -> Void
  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale

  var body: some View {
    let text = ExerciseCompareText(unit: unit, locale: locale)
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("coach.eyebrow")
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: .proud, size: 48, animated: false, build: build)
          .accessibilityHidden(true)
        Text(verbatim: recap(text))
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      Divider()
      Text(verbatim: title)
        .font(DS.TextStyle.title2.weight(.bold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(verbatim: detail)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      if case .progress = kind {
        ForEach(targets.prefix(4)) { t in
          HStack {
            Text(verbatim: t.name).font(DS.TextStyle.body)
            Spacer()
            Text(verbatim: target(t, text))
              .font(DS.TextStyle.body.weight(.bold))
              .monospacedDigit()
          }
          .accessibilityElement(children: .combine)
        }
      }
      if let cue {
        Text(String(localized: "coach.cue \(cue.anchor.label)") + (cue.busy.map { " " + String(localized: "coach.cue.busy \($0.label)") } ?? ""))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if case .steady = kind {
        DSButton(String(localized: "coach.ok"), style: .secondary, action: keep)
          .accessibilityIdentifier("today.coach.keep")
      } else {
        DSButton(String(localized: "coach.accept"), style: .primary, action: accept)
          .accessibilityIdentifier("today.coach.accept")
        Button(action: keep) {
          // cả dải 44 điểm nhận chạm, không chỉ phần chữ (nút `.plain`, xem `TodayPlanHero.minTap`)
          Text("coach.keep")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(DS.Color.primary.swiftUI)
        .accessibilityIdentifier("today.coach.keep")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard()
  }

  private func recap(_ text: ExerciseCompareText) -> String {
    let sessions = String(localized: "coach.recap.sessions \(lastWeek.done) \(lastWeek.planned)")
    guard let h = highlight else { return sessions }
    return sessions + " " + String(localized: "coach.recap.best \(h.name) \(text.chip(h.delta))")
  }

  private var title: String {
    switch kind {
    case .light: String(localized: "coach.light.title")
    case .progress: String(localized: "coach.progress.title")
    case .steady: String(localized: "coach.steady.title")
    }
  }

  private var detail: String {
    switch kind {
    case .light(let f) where f < 1:
      String(localized: "coach.light.load \(Int(((1 - f) * 100).rounded()))")
    case .light: String(localized: "coach.light.detail")
    case .progress: String(localized: "coach.progress.detail")
    case .steady: String(localized: "coach.steady.detail")
    }
  }

  private func target(_ t: OverloadPlan.Item, _ text: ExerciseCompareText) -> String {
    switch t.advice {
    case .addWeight(_, let to, let reps): "\(text.load(to)) × \(reps)"
    case .addRep(let kg, _, let to): kg.map { "\(text.load($0)) × \(to)" } ?? text.reps(to)
    case .hold, .notEnough: ""
    }
  }
}
