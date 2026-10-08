import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Kế hoạch tuần (#527 Phase 2) — `components/ascnd/week-plan.tsx` @ fac9ac2.
/// Đọc kế hoạch của `TodayController.library` (server ⊕ lệnh chưa gửi), ghi
/// qua `PlanEditor.assign` / `setDeload`; trạng thái từng ngày là
/// `WorkoutPlanning.plan` (`dayStateOf`).
///
/// RN behavior (giữ nguyên):
/// - mở trên hôm nay; lùi / tiến 4 tuần; dải tuần 5 trạng thái;
/// - ngày đang chọn: trạng thái, huy hiệu deload, buổi đã gán / nghỉ / chưa lên lịch;
/// - ngày chưa lên lịch (không phải ngày nghỉ đã chốt) gợi ý 3 buổi dùng gần
///   nhất — một chạm là gán;
/// - bộ chọn của một ngày: "Tạo buổi tập mới" (builder gán luôn vào ngày ấy),
///   "Nghỉ ngơi", các buổi đã lưu (trùng tên thì kèm ngày tạo), công tắc deload.
///
/// Chưa có (ghi ở #527): bảng buổi tập của ngày nhúng ngay dưới (`DayPlan` —
/// ở native là màn tập của hôm nay), mở nhạc (`MusicLaunch`).
struct WeekPlanView: View {
  let flow: WorkoutFlow
  @State private var offset = 0
  @State private var selected: Int?
  @State private var picking: DayTarget?
  @State private var building: DayTarget?
  @State private var failed = false

  private var today: LocalDate { flow.today.today }
  private var dates: [LocalDate] { WeekPlanning.weekDates(today: today, offset: offset) }
  private var snapshot: TemplateSnapshot? { flow.today.library }
  private var day: Int { selected ?? WorkoutPlanning.routineIndex(today) }

  /// Ngày đã tập: hôm nay của Today + lịch sử 90 ngày (lùi 4 tuần vẫn đúng).
  private var trained: Set<LocalDate> {
    var out = flow.today.trained
    for e in flow.history?.entries ?? [] { out.insert(LocalDate(e.at, in: .current)) }
    return out
  }

  var body: some View {
    List {
      Section {
        weekHeader
        WeekStripView(cells: cells, selected: day, onPick: { selected = $0 })
          .listRowInsets(EdgeInsets(top: DS.Spacing.xs, leading: DS.Spacing.sm, bottom: DS.Spacing.xs, trailing: DS.Spacing.sm))
      }
      dayPanel
      suggestionsSection
    }
    .navigationTitle(Text("wp.title"))
    .refreshable { await flow.refresh() }
    .sheet(item: $picking) { target in
      DayPicker(flow: flow, day: target.day, failed: $failed) { building = target }
    }
    .sheet(item: $building) { target in
      TemplateFormView(flow: flow, scheduleOn: target.day)
    }
    .alert(String(localized: "workout.finishError.generic"), isPresented: $failed) {
      Button(String(localized: "workout.ok")) {}
    }
  }

  // MARK: - Tuần

  private var weekHeader: some View {
    HStack {
      Button {
        offset = WeekPlanning.clamp(offset: offset - 1)
      } label: {
        Image(systemName: "chevron.left").frame(minWidth: 44, minHeight: 44)
      }
      .buttonStyle(.borderless)
      .disabled(offset <= -WeekPlanning.weeksBack)
      .accessibilityLabel(Text("wp.prevWeek"))
      Spacer()
      Text(verbatim: rangeLabel)
        .font(DS.TextStyle.headline)
      Spacer()
      Button {
        offset = WeekPlanning.clamp(offset: offset + 1)
      } label: {
        Image(systemName: "chevron.right").frame(minWidth: 44, minHeight: 44)
      }
      .buttonStyle(.borderless)
      .disabled(offset >= WeekPlanning.weeksForward)
      .accessibilityLabel(Text("wp.nextWeek"))
    }
    .sensoryFeedback(.selection, trigger: offset)
  }

  /// "Tuần này", hay ngày đầu – cuối tuần theo locale (`rangeLabel`).
  private var rangeLabel: String {
    guard offset != 0, let first = dates.first, let last = dates.last else {
      return String(localized: "wp.thisWeek")
    }
    let style = Date.FormatStyle.dateTime.day().month(.abbreviated)
    return "\(Self.date(first).formatted(style)) – \(Self.date(last).formatted(style))"
  }

  private var cells: [DayCellDisplay] {
    dates.map { d in
      let date = Self.date(d)
      return DayCellDisplay(
        shortName: date.formatted(.dateTime.weekday(.abbreviated)),
        longName: date.formatted(.dateTime.weekday(.wide).day().month(.wide)),
        dayNumber: d.day,
        state: Self.state(plan(d).status),
        isToday: d == today)
    }
  }

  // MARK: - Ngày đang chọn

  @ViewBuilder private var dayPanel: some View {
    let d = dates[day]
    let p = plan(d)
    Section {
      HStack {
        Text(verbatim: Self.date(d).formatted(.dateTime.weekday(.wide).day().month(.wide)))
          .font(DS.TextStyle.headline)
        Spacer()
        if p.isDeload {
          Text("wp.deload")
            .font(DS.TextStyle.caption.weight(.bold))
            .padding(.horizontal, DS.Spacing.xs)
            .background(DS.Color.metricOrangeGraphic.swiftUI.opacity(0.15), in: Capsule())
        }
        Text(Self.statusLabel(p.status))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      if let t = p.template {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: t.name).font(DS.TextStyle.body.weight(.semibold))
          Text(verbatim: meta(t)).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .accessibilityElement(children: .combine)
      }
      Button(String(localized: "wp.chooseWorkout")) { picking = DayTarget(day: day) }
        .disabled(flow.plan == nil)
        .frame(minHeight: 44)
    }
  }

  /// Ngày chưa lên lịch: 3 buổi dùng gần nhất, một chạm là gán (#215).
  @ViewBuilder private var suggestionsSection: some View {
    let p = plan(dates[day])
    let picks = WeekPlanning.suggestions(
      snapshot?.templates ?? [], sessions: (flow.history?.entries ?? []).map { ($0.templateName, $0.at) })
    if p.status == .unplanned, !picks.isEmpty, let editor = flow.plan {
      Section {
        ForEach(picks, id: \.id) { t in
          Button {
            Task { await assign(editor, t.id) }
          } label: {
            HStack {
              Image(systemName: "dumbbell").foregroundStyle(DS.Color.mutedForeground.swiftUI).accessibilityHidden(true)
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: t.name).foregroundStyle(DS.Color.foreground.swiftUI)
                Text(verbatim: meta(t)).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              Spacer()
              Image(systemName: "plus").accessibilityHidden(true)
            }
            .frame(minHeight: 44)
          }
          .accessibilityLabel(Text(String(localized: "wp.chooseNamed \(t.name)")))
        }
      } header: {
        Text("wp.suggested")
      }
    }
  }

  // MARK: - Phụ

  private func plan(_ d: LocalDate) -> TodayPlan {
    guard let snapshot else {
      return WorkoutPlanning.plan(for: d, today: today, routine: [], templates: [], trained: trained)
    }
    return snapshot.plan(for: d, today: today, trained: trained)
  }

  private func meta(_ t: WorkoutTemplate) -> String {
    Self.meta(t, duplicates: WeekPlanning.duplicateNames(snapshot?.templates ?? []))
  }

  private func assign(_ editor: PlanEditor, _ templateId: String?) async {
    do throws(PlanEditor.Refusal) {
      try await editor.assign(day: day, templateId: templateId)
    } catch {
      failed = true
    }
  }

  /// "3 bài", và khi tên trùng thì "· tạo 5 thg 10" (`templateMeta`, `:297`).
  static func meta(_ t: WorkoutTemplate, duplicates: Set<String>) -> String {
    let n = t.exercises.count
    let count = n == 1 ? String(localized: "wp.count.one") : String(localized: "wp.count.other \(n)")
    guard duplicates.contains(t.name), let made = t.createdAt else { return count }
    let date = Date(timeIntervalSince1970: Double(made.millis) / 1000)
      .formatted(.dateTime.day().month(.abbreviated))
    return String(localized: "wp.count.added \(count) \(date)")
  }

  static func date(_ d: LocalDate) -> Date {
    Calendar.current.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) ?? Date()
  }

  static func state(_ s: DayStatus) -> WeekDayState {
    switch s {
    case .todo: .todo
    case .done: .done
    case .missed: .missed
    case .rest: .rest
    case .unplanned: .unplanned
    }
  }

  /// Nhãn trạng thái của ngày đang chọn (`stateLabel`, `:381`) — chữ của màn
  /// Plan, khác chữ ngắn của dải tuần.
  static func statusLabel(_ s: DayStatus) -> String {
    switch s {
    case .rest: String(localized: "wp.status.rest")
    case .done: String(localized: "wp.status.done")
    case .todo: String(localized: "wp.status.todo")
    case .missed: String(localized: "wp.status.missed")
    case .unplanned: String(localized: "wp.status.unplanned")
    }
  }
}

struct DayTarget: Identifiable, Hashable {
  let day: Int
  var id: Int { day }
}

/// Bộ chọn của một ngày: tạo buổi mới, nghỉ, buổi đã lưu, deload — cùng một
/// câu hỏi "ngày này là gì" nên hỏi ở cùng một chỗ.
private struct DayPicker: View {
  let flow: WorkoutFlow
  let day: Int
  @Binding var failed: Bool
  var onBuild: () -> Void
  @Environment(\.dismiss) private var dismiss

  private var snapshot: TemplateSnapshot? { flow.today.library }
  private var row: RoutineDay? { snapshot?.day(day) }

  var body: some View {
    NavigationStack {
      List {
        Section {
          Button {
            dismiss()
            onBuild()
          } label: {
            Label(String(localized: "wp.newWorkout"), systemImage: "plus")
              .frame(minHeight: 44)
          }
          choice(String(localized: "wp.status.rest"), systemImage: "moon", on: row?.templateId == nil) {
            Task { await assign(nil) }
          }
        }
        Section {
          let templates = (snapshot?.templates ?? []).sorted(by: PlanEdit.newestFirst)
          if templates.isEmpty {
            Text(snapshot == nil && flow.today.failure != nil ? String(localized: "history.loadFailed") : String(localized: "wp.noTemplates"))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          let dups = WeekPlanning.duplicateNames(templates)
          ForEach(templates, id: \.id) { t in
            choice(t.name, detail: WeekPlanView.meta(t, duplicates: dups), on: row?.templateId == t.id) {
              Task { await assign(t.id) }
            }
          }
        }
        Section {
          Toggle(String(localized: "wp.deload"), isOn: Binding(
            get: { row?.isDeload ?? false },
            set: { on in Task { await setDeload(on) } }))
            .frame(minHeight: 44)
        }
      }
      .navigationTitle(Text("wp.chooseWorkout"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  private func choice(
    _ title: String, detail: String? = nil, systemImage: String? = nil, on: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack {
        if let systemImage {
          Image(systemName: systemImage).foregroundStyle(DS.Color.mutedForeground.swiftUI).accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: title).foregroundStyle(DS.Color.foreground.swiftUI)
          if let detail {
            Text(verbatim: detail).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        Spacer()
        if on {
          Image(systemName: "checkmark.circle.fill").foregroundStyle(DS.Color.primary.swiftUI).accessibilityHidden(true)
        }
      }
      .frame(minHeight: 44)
    }
    .disabled(flow.plan == nil)
    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
  }

  private func assign(_ templateId: String?) async {
    guard let editor = flow.plan else { return }
    do throws(PlanEditor.Refusal) {
      try await editor.assign(day: day, templateId: templateId)
      dismiss()
    } catch {
      failed = true
    }
  }

  private func setDeload(_ on: Bool) async {
    guard let editor = flow.plan else { return }
    do throws(PlanEditor.Refusal) {
      try await editor.setDeload(day: day, on)
    } catch {
      failed = true
    }
  }
}
