import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chọn buổi tập cho hôm nay (#527, tab Tập luyện 14/10) —
/// `components/ascnd/workout-picker-sheet.tsx` @ fac9ac2.
///
/// Như RN: tiêu đề + ngày; hàng "Ngày nghỉ"; "Buổi tập của bạn" (số bài · số
/// set · phút), dấu chọn ở buổi đang gán; "+ Tạo buổi tập mới" mở builder.
///
/// Khác RN (tốt hơn): RN chỉ rung (ghi còn là TODO, issue 221); ở đây chọn
/// là GHI THẬT vào kế hoạch tuần qua `PlanEditor.assign` — và nói rõ là áp
/// dụng cho mọi tuần cùng thứ ấy (kế hoạch tuần là lịch lặp lại). Thêm mục
/// "Gợi ý" (3 buổi dùng gần nhất, `WeekPlanning.suggestions`) như Kế hoạch tuần.
struct WorkoutPickerSheet: View {
  let flow: WorkoutFlow
  /// Ngày trong tuần (0 = Thứ Hai) — mặc định hôm nay; Kế hoạch tuần truyền ngày đang chọn.
  var day: Int? = nil
  @Environment(\.dismiss) private var dismiss
  @State private var saving = false
  @State private var failed = false
  @State private var showsBuilder = false

  private var weekday: Int { day ?? WorkoutPlanning.routineIndex(flow.today.today) }
  private var date: LocalDate { WeekPlanning.weekDates(today: flow.today.today, offset: 0)[weekday] }
  private var routineDay: RoutineDay? { flow.today.library?.routine.first { $0.dayOfWeek == weekday } }
  private var templates: [WorkoutTemplate] {
    (flow.today.library?.templates ?? []).sorted(by: WorkoutTemplate.newestFirst)
  }
  private var suggestions: [WorkoutTemplate] {
    WeekPlanning.suggestions(templates, sessions: (flow.history?.entries ?? []).map { ($0.templateName, $0.at) })
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text(String(localized: "wpk.repeats \(WorkoutsHomeView.longWeekday(date))"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, 4)
          card {
            row(
              symbol: "moon.zzz", tint: DS.Color.mutedForeground.swiftUI, title: String(localized: "today.status.rest"),
              sub: String(localized: "today.rest.message"), selected: routineDay?.isRest == true
            ) { pick(nil) }
          }
          if suggestions.count > 1 {
            section(String(localized: "wp.suggested"))
            card {
              ForEach(Array(suggestions.enumerated()), id: \.element.id) { i, t in
                if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
                templateRow(t)
              }
            }
          }
          section(String(localized: "wpk.yours"))
          card {
            ForEach(Array(templates.enumerated()), id: \.element.id) { i, t in
              if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
              templateRow(t)
            }
            if !templates.isEmpty { Divider().padding(.leading, 58).opacity(0.6) }
            row(
              symbol: "plus", tint: WorkoutsHomeView.accent, title: String(localized: "wpk.createNew"), sub: nil,
              selected: false, titleTint: WorkoutsHomeView.accent
            ) { showsBuilder = true }
          }
        }
        .padding(DS.Spacing.md)
      }
      .disabled(saving)
      .overlay { if saving { ProgressView() } }
      .ascndPage()
      .navigationTitle(String(localized: "today.choosePlan"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
      .alert(String(localized: "async.error.generic"), isPresented: $failed) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
      .sheet(isPresented: $showsBuilder, onDismiss: { dismiss() }) {
        TemplateFormView(flow: flow, scheduleOn: weekday)
      }
    }
  }

  private func templateRow(_ t: WorkoutTemplate) -> some View {
    let sets = t.exercises.reduce(0) { $0 + $1.sets }
    let minutes = TemplateDraft.estimatedMinutes(t.exercises.map { ($0.sets, $0.reps, $0.restSeconds) })
    return row(
      symbol: "dumbbell.fill", tint: WorkoutsHomeView.accent, title: t.name,
      sub: String(localized: "wh.meta \(t.exercises.count) \(sets) \(minutes)"),
      selected: routineDay?.isRest != true && routineDay?.templateId == t.id
    ) { pick(t.id) }
  }

  private func row(
    symbol: String, tint: Color, title: String, sub: String?, selected: Bool, titleTint: Color? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: symbol)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(tint)
          .frame(width: 32, height: 32)
          .background(tint.opacity(0.12), in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: title)
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(titleTint ?? DS.Color.foreground.swiftUI)
            .lineLimit(1)
          if let sub {
            Text(verbatim: sub)
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        Spacer(minLength: 0)
        if selected {
          Image(systemName: "checkmark.circle.fill")
            .font(.title3)
            .foregroundStyle(WorkoutsHomeView.accent)
            .accessibilityHidden(true)
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 60)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(spacing: 0) { content() }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard()
  }

  private func section(_ title: String) -> some View {
    Text(verbatim: title)
      .font(DS.TextStyle.headline)
      .accessibilityAddTraits(.isHeader)
      .padding(.horizontal, 4)
      .padding(.top, DS.Spacing.xs)
  }

  /// `nil` = ngày nghỉ.
  private func pick(_ templateId: String?) {
    guard let editor = flow.plan, !saving else { return }
    saving = true
    Task {
      do throws(PlanEditor.Refusal) {
        try await editor.assign(day: weekday, templateId: templateId)
        saving = false
        dismiss()
      } catch {
        saving = false
        failed = true
      }
    }
  }
}
