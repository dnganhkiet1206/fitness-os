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
/// - bảng tập của ngày đang chọn (`DayPlan key={dStr}`, `:495`) cho BẤT KỲ
///   ngày nào có buổi: hôm nay là chính buổi của màn tập; ngày khác là bảng
///   riêng của ngày ấy (`WorkoutFlow.daySession(on:)`) — tick được ở ngày tương
///   lai nhưng ghi thì chờ tới ngày, ngày đã qua ghi đúng ngày ấy.
///
/// Khác RN có chủ đích: bảng mở thành sheet (cả màn tập: hướng dẫn, "Lần
/// trước", bỏ tích / nối set) thay vì nhúng dưới dải tuần — `WorkoutView` là
/// một màn có thanh điều hướng riêng, nhúng vào danh sách là hai lớp cuộn.
///
/// Chưa có (ghi ở #527): mở nhạc (`MusicLaunch`).
struct WeekPlanView: View {
  let flow: WorkoutFlow
  /// "Mở bảng tập" của HÔM NAY mở đúng màn tập của tab (đồng hồ nghỉ, Live
  /// Activity, màn tổng kết) thay vì một sheet thiếu những thứ ấy (14/10).
  /// `nil` (mở từ chỗ khác) = sheet như mọi ngày.
  var onOpenToday: (() -> Void)? = nil
  /// Ngày khác vừa chốt từ sheet → màn tổng kết.
  @State private var finishedPast: WorkoutsTab.FinishedWorkout?
  @State private var offset = 0
  @State private var selected: Int?
  @State private var picking: DayTarget?
  @State private var failed = false
  /// Bảng tập đang mở (theo ngày) và ngày đang mở dở — kết quả về muộn của
  /// ngày đã bỏ chọn không bao giờ hiện thành bảng của ngày khác.
  @State private var openDay: DayBoard?
  @State private var pickAfterClose: DayTarget?
  @State private var opening: LocalDate?

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

  private static let accent = WorkoutsHomeView.accent

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        weekCard
        dayPanel
        suggestionsSection
      }
      .padding(DS.Spacing.md)
      .padding(.bottom, DS.Spacing.lg)
    }
    .navigationTitle(Text("wp.title"))
    .navigationBarTitleDisplayMode(.large)
    .ascndPage()
    .refreshable { await flow.refresh() }
    .sheet(item: $picking) { target in
      WorkoutPickerSheet(flow: flow, day: target.day)
    }
    .sheet(item: $openDay, onDismiss: {
      // "Đổi buổi khác" của bảng ngày chưa tới: bảng chọn mở SAU khi sheet
      // này đã đóng hẳn — hai sheet không chồng lên nhau được.
      if let target = pickAfterClose {
        pickAfterClose = nil
        picking = target
      }
    }) { board in
      WorkoutView(
        controller: board.controller,
        onFinish: {
          let sets = WorkoutsTab.summarySets(board.controller)
          let summary = try await board.controller.finish()
          finishedPast = WorkoutsTab.FinishedWorkout(summary: summary, sets: sets)
        },
        onClose: { openDay = nil },
        onChangeWorkout: {
          pickAfterClose = DayTarget(day: board.weekday)
          openDay = nil
        }
      )
      .environment(flow)
      .sheet(item: $finishedPast) { f in
        NavigationStack {
          WorkoutSummaryView(summary: f.summary, sets: f.sets, onDone: {
            finishedPast = nil
            openDay = nil
          })
        }
      }
    }
    .alert(String(localized: "workout.finishError.generic"), isPresented: $failed) {
      Button(String(localized: "workout.ok")) {}
    }
  }

  // MARK: - Tuần (thiết kế lại 14/10, cùng ngôn ngữ trang gốc Tập luyện)

  private var weekCard: some View {
    VStack(spacing: DS.Spacing.sm) {
      weekHeader
      HStack(spacing: 4) {
        ForEach(Array(dates.enumerated()), id: \.offset) { i, d in
          dayCell(i, d)
        }
      }
      legend
    }
    .padding(DS.Spacing.md)
    .todayCard()
  }

  private func dayCell(_ i: Int, _ d: LocalDate) -> some View {
    let on = i == day
    let isToday = d == today
    let status = plan(d).status
    return Button {
      selected = i
    } label: {
      VStack(spacing: 6) {
        Text(verbatim: Self.date(d).formatted(.dateTime.weekday(.abbreviated).locale(.app)))
          .font(DS.TextStyle.caption.weight(isToday ? .bold : .regular))
          .foregroundStyle(on ? Color.white.opacity(0.85) : DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Text(verbatim: "\(d.day)")
          .font(.custom("Menlo", size: 17, relativeTo: .body).weight(.semibold))
          .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
        mark(status, selected: on)
      }
      .frame(maxWidth: .infinity, minHeight: 78)
      .background {
        RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
          .fill(on ? Self.accent : (isToday ? Self.accent.opacity(0.08) : Color.clear))
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: Self.date(d).formatted(.dateTime.weekday(.wide).day().month(.wide).locale(.app))))
    .accessibilityValue(Text(Self.statusLabel(status)))
    .accessibilityAddTraits(on ? .isSelected : [])
    .sensoryFeedback(.selection, trigger: selected)
  }

  /// Dấu của một ngày — cùng bộ dấu dải tuần ở trang gốc.
  @ViewBuilder private func mark(_ s: DayStatus, selected on: Bool) -> some View {
    PlanDayMark(
      status: s, tint: on ? Color.white : Self.accent,
      muted: on ? Color.white : (s == .rest ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI))
  }

  private var legend: some View {
    HStack(spacing: 10) {
      legendItem(.done, "wp.status.done")
      legendItem(.todo, "wp.legend.planned")
      legendItem(.missed, "wp.status.missed")
      legendItem(.rest, "wp.status.rest")
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .frame(maxWidth: .infinity)
    .accessibilityHidden(true)
  }

  private func legendItem(_ status: DayStatus, _ key: String.LocalizationValue) -> some View {
    HStack(spacing: 4) {
      PlanDayMark(status: status, tint: Self.accent, muted: DS.Color.mutedForeground.swiftUI, size: 9)
      Text(String(localized: key))
    }
  }

  private var weekHeader: some View {
    HStack {
      Button {
        offset = WeekPlanning.clamp(offset: offset - 1)
      } label: {
        Image(systemName: "chevron.left")
          .font(.body.weight(.semibold))
          .frame(minWidth: 44, minHeight: 44)
          // Vòng 36pt vẽ BÊN TRONG vùng chạm 44pt.
          .background(Circle().fill(DS.Color.foreground.swiftUI.opacity(0.05)).padding(4))
      }
      .buttonStyle(.plain)
      .foregroundStyle(offset <= -WeekPlanning.weeksBack ? DS.Color.mutedForeground.swiftUI.opacity(0.4) : DS.Color.foreground.swiftUI)
      .disabled(offset <= -WeekPlanning.weeksBack)
      .accessibilityLabel(Text("wp.prevWeek"))
      Spacer()
      VStack(spacing: 2) {
        Text(verbatim: rangeLabel)
          .font(DS.TextStyle.headline)
        if offset != 0 {
          Button(String(localized: "wp.thisWeek")) { offset = 0 }
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(Self.accent)
        }
      }
      Spacer()
      Button {
        offset = WeekPlanning.clamp(offset: offset + 1)
      } label: {
        Image(systemName: "chevron.right")
          .font(.body.weight(.semibold))
          .frame(minWidth: 44, minHeight: 44)
          // Vòng 36pt vẽ BÊN TRONG vùng chạm 44pt.
          .background(Circle().fill(DS.Color.foreground.swiftUI.opacity(0.05)).padding(4))
      }
      .buttonStyle(.plain)
      .foregroundStyle(offset >= WeekPlanning.weeksForward ? DS.Color.mutedForeground.swiftUI.opacity(0.4) : DS.Color.foreground.swiftUI)
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
    let style = Date.FormatStyle.dateTime.day().month(.abbreviated).locale(.app)
    return "\(Self.date(first).formatted(style)) – \(Self.date(last).formatted(style))"
  }

  // MARK: - Ngày đang chọn

  @ViewBuilder private var dayPanel: some View {
    let d = dates[day]
    let p = plan(d)
    if p.status == .rest {
      RestDayCard(
        eyebrow: d == today
          ? String(localized: "wh.eyebrow \(Self.date(d).formatted(.dateTime.weekday(.wide).locale(.app)))")
          : Self.date(d).formatted(.dateTime.weekday(.wide).day().month(.wide).locale(.app)),
        isToday: d == today
      ) {
        Button {
          picking = DayTarget(day: day)
        } label: {
          Label(String(localized: "wp.chooseWorkout"), systemImage: "arrow.left.arrow.right")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1))
        }
        .buttonStyle(TodayPressStyle())
        .disabled(flow.plan == nil)
      }
    } else {
      dayCard(d, p)
    }
  }

  private func dayCard(_ d: LocalDate, _ p: TodayPlan) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: Self.date(d).formatted(.dateTime.weekday(.wide).day().month(.wide).locale(.app)))
          .font(DS.TextStyle.headline)
        Spacer()
        Text(Self.statusLabel(p.status))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(p.status == .done || p.status == .todo ? Self.accent : DS.Color.mutedForeground.swiftUI)
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background((p.status == .done || p.status == .todo ? Self.accent : DS.Color.foreground.swiftUI).opacity(0.08), in: Capsule())
      }
      .accessibilityElement(children: .combine)
      if let t = p.template {
        HStack(spacing: 12) {
          PlanIconBadge(symbol: "dumbbell.fill", tint: Self.accent)
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: t.name).font(DS.TextStyle.title.weight(.bold))
            Text(verbatim: meta(t)).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .padding(.vertical, 4)
      } else {
        Label(
          p.status == .rest ? String(localized: "today.rest.message") : String(localized: "wp.status.unplanned"),
          systemImage: p.status == .rest ? "moon.zzz" : "calendar.badge.plus"
        )
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.vertical, 4)
      }
      HStack(spacing: DS.Spacing.sm) {
        if p.template != nil {
          Button {
            Task { await open(d) }
          } label: {
            HStack(spacing: 6) {
              if opening == d { ProgressView() } else { Image(systemName: "list.bullet.rectangle") }
              Text("wp.openBoard")
            }
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Capsule().fill(DS.Color.foreground.swiftUI))
          }
          .buttonStyle(TodayPressStyle())
          .disabled(opening != nil)
        }
        Button {
          picking = DayTarget(day: day)
        } label: {
          Label(String(localized: p.template == nil ? "wp.chooseWorkout" : "wp.change"), systemImage: "arrow.left.arrow.right")
            .font(DS.TextStyle.headline)
            .foregroundStyle(p.template == nil ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background {
              if p.template == nil {
                Capsule().fill(DS.Color.foreground.swiftUI)
              } else {
                Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1)
              }
            }
        }
        .buttonStyle(TodayPressStyle())
        .disabled(flow.plan == nil)
      }
      if p.template != nil, let editor = flow.plan {
        Divider().opacity(0.5).padding(.top, 4)
        Toggle(isOn: Binding(
          get: { snapshot?.day(day)?.isDeload ?? false },
          set: { on in Task { await setDeload(editor, on) } })
        ) {
          VStack(alignment: .leading, spacing: 2) {
            Text("wp.deload").font(DS.TextStyle.body)
            Text("wp.deload.hint").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        .tint(Self.accent)
        .frame(minHeight: 44)
      }
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
  }

  private func setDeload(_ editor: PlanEditor, _ on: Bool) async {
    do throws(PlanEditor.Refusal) {
      try await editor.setDeload(day: day, on)
    } catch {
      failed = true
    }
  }

  /// Dựng bảng của ngày `d`; chỉ hiện nếu ngày ấy VẪN đang chọn khi xong.
  private func open(_ d: LocalDate) async {
    if d == today, let onOpenToday, flow.session != nil {
      onOpenToday()
      return
    }
    opening = d
    defer { if opening == d { opening = nil } }
    guard let controller = await flow.daySession(on: d), dates[day] == d else { return }
    openDay = DayBoard(date: d, controller: controller)
  }

  /// Ngày chưa lên lịch: 3 buổi dùng gần nhất, một chạm là gán (#215).
  @ViewBuilder private var suggestionsSection: some View {
    let p = plan(dates[day])
    let picks = WeekPlanning.suggestions(
      snapshot?.templates ?? [], sessions: (flow.history?.entries ?? []).map { ($0.templateName, $0.at) })
    if p.status == .unplanned, !picks.isEmpty, let editor = flow.plan {
      Text("wp.suggested")
        .font(DS.TextStyle.title)
        .accessibilityAddTraits(.isHeader)
        .padding(.horizontal, 4)
        .padding(.top, DS.Spacing.sm)
      VStack(spacing: 0) {
        ForEach(Array(picks.enumerated()), id: \.element.id) { i, t in
          if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
          Button {
            Task { await assign(editor, t.id) }
          } label: {
            HStack(spacing: 12) {
              PlanIconBadge(symbol: "dumbbell.fill", tint: Self.accent, size: 32)
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: t.name).font(DS.TextStyle.body.weight(.semibold)).foregroundStyle(DS.Color.foreground.swiftUI)
                Text(verbatim: meta(t)).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              Spacer()
              Image(systemName: "plus.circle.fill").font(.title3).foregroundStyle(Self.accent).accessibilityHidden(true)
            }
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(String(localized: "wp.chooseNamed \(t.name)")))
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard()
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
      .formatted(.dateTime.day().month(.abbreviated).locale(.app))
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

/// Bảng tập của một ngày, mở thành sheet.
private struct DayBoard: Identifiable {
  let date: LocalDate
  let controller: WorkoutSessionController
  var id: String { date.description }
  /// 0 = Thứ Hai — chỗ "Đổi buổi khác" gán vào.
  var weekday: Int { WorkoutPlanning.routineIndex(date) }
}
