import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Trang gốc tab Tập luyện (#527) — `app/(tabs)/workouts/index.tsx` +
/// `components/ascnd/today-training.tsx` @ fac9ac2; thiết kế lại 14/10 (chủ
/// dự án duyệt mock, `docs/design/workouts/REDESIGN.md`).
///
/// Như RN:
/// - hai phân đoạn Buổi tập | Cơ thể;
/// - dải tuần (Thứ Hai → Chủ nhật: đã tập / có buổi / nghỉ), chạm → kế hoạch tuần;
/// - thẻ hôm nay bốn trạng thái: có buổi → "Bắt đầu buổi tập" (nút đặc);
///   đã tập → nút nhạt; ngày nghỉ → gợi ý vận động nhẹ + chọn buổi; chưa có
///   kế hoạch → "Chọn buổi tập";
/// - "Mẫu buổi tập (n)" — 3 mẫu mới nhất, "Xem tất cả", "Tạo mới" ở cuối danh
///   sách; đọc lỗi khác trống;
/// - "Thư viện & lịch sử" (số buổi gần đây) và "Tiến bộ từng bài".
///
/// Khác RN:
/// - trạng thái thứ năm "Đang tập" (đã tick, chưa chốt): màn tập là lớp toàn
///   màn hình, thu xuống vẫn giữ tiến độ — thẻ nói còn bao nhiêu set và mời
///   "Tiếp tục";
/// - Cơ thể: thẻ Cân nặng (`WeightTrendCard`, phần cân nặng của `BodyPanel`)
///   + các màn đã port (số đo, ảnh tiến trình, mục tiêu);
/// - gợi ý ngày nghỉ là chữ (RN: ô bấm không làm gì ngoài rung).
struct WorkoutsHomeView: View {
  let flow: WorkoutFlow
  var onOpenSession: () -> Void = {}

  enum Segment: Hashable { case training, body }

  @Environment(AppServices.self) private var services
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var segment: Segment = .training
  @State private var showsBuilder = false
  @State private var showsManualLog = false
  @State private var showsWeight = false
  @State private var showsPicker = false
  @State private var measure: MeasurementsBook?
  @State private var photos: ProgressPhotosBook?
  @State private var goals: SmartGoalsBook?
  @State private var weight: WeightTrendBook?

  static let accent = MascotRoomView.signalColor(.workout)
  /// Màu của phân đoạn Cơ thể = màu cân nặng ở Hôm nay (`TodayYourDay.color`).
  static let body = DS.Color.metricBlue.swiftUI

  private var templates: [WorkoutTemplate] {
    (flow.today.library?.templates ?? []).sorted(by: WorkoutTemplate.newestFirst)
  }

  private var userId: String { flow.today.userId }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        header
        Picker(String(localized: "tab.workouts"), selection: $segment) {
          Text(String(localized: "wh.seg.training")).tag(Segment.training)
          Text(String(localized: "wh.seg.body")).tag(Segment.body)
        }
        .pickerStyle(.segmented)
        .sensoryFeedback(.selection, trigger: segment)
        if segment == .training {
          weekStrip
          hero
          templatesSection
          tools
        } else {
          bodySegment
        }
      }
      .padding(DS.Spacing.md)
      .padding(.bottom, DS.Spacing.lg)
      .animation(.smooth(duration: 0.3), value: segment)
    }
    .refreshable { await flow.refresh() }
    // Đầu trang trong nội dung như Hôm nay / Dinh dưỡng.
    .navigationTitle(Text("tab.workouts"))
    .toolbar(.hidden, for: .navigationBar)
    .statusBarScrim()
    .background { TodayAmbient(accent: .workout) }
    .sheet(isPresented: $showsBuilder) { TemplateFormView(flow: flow) }
    .sheet(isPresented: $showsManualLog) { ManualLogView(flow: flow) }
    .sheet(isPresented: $showsPicker) { WorkoutPickerSheet(flow: flow) }
    .sheet(isPresented: $showsWeight) {
      LogWeightView(makeLogger: { services.makeWeightLogger(userId: userId) }) { showsWeight = false }
    }
    .onChange(of: showsWeight) { _, open in
      if !open { Task { await weight?.load() } }
    }
    .onChange(of: segment) { _, s in if s == .body { makeBodyBooks() } }
  }

  // MARK: - Đầu trang

  private var header: some View {
    HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "tab.workouts"))
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      if let history = flow.history {
        NavigationLink {
          WorkoutHistoryView(book: history)
        } label: {
          Image(systemName: "clock.arrow.circlepath")
            .font(.body.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(width: 40, height: 40)
            .background(Circle().fill(.thinMaterial))
            .overlay(Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text("history.title"))
      }
    }
  }

  // MARK: - Dải tuần

  @ViewBuilder private var weekStrip: some View {
    let days = WorkoutHome.week(today: flow.today.today, library: flow.today.library, trained: flow.today.trained)
    let strip = HStack(spacing: 0) {
      ForEach(days) { d in
        VStack(spacing: 4) {
          Text(verbatim: Self.weekday(d.date))
            .font(DS.TextStyle.caption.weight(d.isToday ? .bold : .regular))
            .foregroundStyle(d.isToday ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
          dayMark(d)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: Self.longDay(d.date)))
        .accessibilityValue(Text(Self.statusText(d.status)))
      }
    }
    .padding(.top, DS.Spacing.sm)
    if flow.plan != nil {
      NavigationLink {
        WeekPlanView(flow: flow, onOpenToday: onOpenSession)
      } label: {
        strip.contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityHint(Text("workoutshome.plan"))
    } else {
      strip
    }
    weekLegend
  }

  /// Chú giải bộ dấu của dải tuần (chủ dự án, 14/10: vòng nét đứt chưa có chú thích).
  private var weekLegend: some View {
    HStack(spacing: 10) {
      HStack(spacing: 4) {
        Image(systemName: "checkmark").font(.system(size: 7, weight: .bold)).foregroundStyle(.white)
          .frame(width: 11, height: 11).background(Circle().fill(Self.accent))
        Text(String(localized: "wp.status.done"))
      }
      HStack(spacing: 4) {
        Circle().strokeBorder(Self.accent, lineWidth: 1.5).frame(width: 11, height: 11)
        Text(String(localized: "wp.legend.planned"))
      }
      HStack(spacing: 4) {
        Circle().strokeBorder(Self.accent.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])).frame(width: 11, height: 11)
        Text(String(localized: "wp.status.missed"))
      }
      HStack(spacing: 4) {
        Image(systemName: "leaf").font(.system(size: 9)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(String(localized: "wp.status.rest"))
      }
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
    .frame(maxWidth: .infinity)
    .padding(.bottom, DS.Spacing.xs)
    .accessibilityHidden(true)
  }

  @ViewBuilder private func dayMark(_ d: WorkoutHome.WeekDay) -> some View {
    let size: CGFloat = 26
    switch d.status {
    case .done:
      Image(systemName: "checkmark")
        .font(.caption.weight(.bold))
        .foregroundStyle(.white)
        .frame(width: size, height: size)
        .background(Circle().fill(Self.accent))
    case .todo:
      Circle()
        .strokeBorder(Self.accent, lineWidth: d.isToday ? 2.5 : 1.5)
        .frame(width: size, height: size)
    case .missed:
      Circle()
        .strokeBorder(Self.accent.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
        .frame(width: size, height: size)
    case .rest:
      Image(systemName: "leaf")
        .font(.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(width: size, height: size)
    case .unplanned:
      Circle()
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.15), lineWidth: 1)
        .frame(width: size, height: size)
    }
  }

  // MARK: - Thẻ hôm nay

  private var planRows: [PlannedSet] {
    flow.session?.rows ?? flow.today.plan?.sessionPlan?.rows ?? []
  }

  private var heroState: WorkoutHome.Hero {
    let progress = flow.session.map { WorkoutHome.setProgress($0.rows, done: $0.progress.done) } ?? (0, 0)
    return WorkoutHome.hero(cta: flow.today.cta, phase: flow.session?.phase, progress: progress)
  }

  @ViewBuilder private var hero: some View {
    switch heroState {
    case .loading:
      RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous)
        .fill(DS.Color.foreground.swiftUI.opacity(0.05))
        .frame(height: 180)
        .accessibilityLabel(Text("workout.loading"))
    case .start:
      planCard(eyebrow: eyebrow, title: templateName) {
        primaryButton(String(localized: "today.start"), systemImage: "play.fill", fill: DS.Color.foreground.swiftUI) {
          onOpenSession()
        }
      }
    case .inProgress(let done, let total):
      planCard(eyebrow: String(localized: "wh.inProgress"), title: templateName, highlighted: true) {
        VStack(alignment: .leading, spacing: 6) {
          ProgressView(value: Double(done), total: Double(max(total, 1)))
            .tint(Self.accent)
          Text(String(localized: "wh.progress \(done) \(total)"))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        primaryButton(String(localized: "wh.continue"), systemImage: "arrow.right", fill: Self.accent) { onOpenSession() }
      }
    case .done:
      statusCard(
        symbol: "checkmark.seal.fill", symbolColor: Self.accent, title: String(localized: "today.status.done"),
        message: templateName.map { String(format: String(localized: "today.done.message"), $0) }
      ) {
        if flow.session?.isLogged == true {
          secondaryButton(String(localized: "wh.viewSession"), systemImage: "list.bullet") { onOpenSession() }
        }
        secondaryButton(String(localized: "today.cta.extra"), systemImage: "plus") { showsManualLog = true }
      }
    case .rest:
      restCard
    case .pick:
      statusCard(
        symbol: "calendar.badge.plus", symbolColor: Self.accent, title: String(localized: "today.status.unplanned"),
        message: String(localized: "today.unplanned.message")
      ) {
        if flow.plan != nil {
          primaryButton(String(localized: "today.choosePlan"), systemImage: "calendar", fill: DS.Color.foreground.swiftUI) {
            showsPicker = true
          }
        }
        secondaryButton(String(localized: "today.cta.logFree"), systemImage: "square.and.pencil") { showsManualLog = true }
      }
    }
  }

  private var templateName: String? {
    flow.session?.plan.templateName ?? flow.today.plan?.template?.name
  }

  private var eyebrow: String {
    String(localized: "wh.eyebrow \(Self.longWeekday(flow.today.today))")
  }

  /// Thẻ có buổi: dòng nhỏ, tên buổi, "bài · set · phút", danh sách bài, nút.
  private func planCard<Actions: View>(
    eyebrow: String, title: String?, highlighted: Bool = false, @ViewBuilder actions: () -> Actions
  ) -> some View {
    let lines = WorkoutHome.lines(planRows)
    let sets = lines.reduce(0) { $0 + $1.sets }
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(verbatim: eyebrow)
            .font(DS.TextStyle.caption.weight(.semibold))
            .textCase(.uppercase)
            .tracking(0.6)
            .foregroundStyle(Self.accent)
          Spacer()
          // Đổi buổi của hôm nay (nút "…" của RN) — chưa tick set nào mới đổi.
          if !highlighted, flow.plan != nil {
            Button { showsPicker = true } label: {
              Image(systemName: "arrow.left.arrow.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .frame(width: 32, height: 32)
                .background(Circle().fill(DS.Color.foreground.swiftUI.opacity(0.05)))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("wpk.change"))
          }
        }
        .frame(minHeight: 32)
        if let title {
          Text(verbatim: title)
            .font(DS.TextStyle.title.weight(.bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .accessibilityAddTraits(.isHeader)
        }
        if !lines.isEmpty {
          Text(String(localized: "wh.meta \(lines.count) \(sets) \(WorkoutHome.minutes(lines))"))
            .font(.custom("Menlo", size: 13, relativeTo: .footnote))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      if !lines.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(lines.prefix(4).enumerated()), id: \.element.id) { i, l in
            if i > 0 { Divider().opacity(0.5) }
            HStack {
              Text(verbatim: l.name).font(DS.TextStyle.body).lineLimit(1)
              Spacer(minLength: DS.Spacing.sm)
              Text(verbatim: "\(l.sets) × \(l.reps)")
                .font(.custom("Menlo", size: 14, relativeTo: .body))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .frame(minHeight: 36)
            .accessibilityElement(children: .combine)
          }
          if lines.count > 4 {
            Text(String(localized: "wh.more \(lines.count - 4)"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.top, 4)
          }
        }
      }
      actions()
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
    .overlay {
      if highlighted {
        RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Self.accent, lineWidth: 1.5)
      }
    }
  }

  private func statusCard<Actions: View>(
    symbol: String, symbolColor: Color, title: String, message: String?, @ViewBuilder actions: () -> Actions
  ) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: symbol)
          .font(.title2)
          .foregroundStyle(symbolColor)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: eyebrow)
            .font(DS.TextStyle.caption.weight(.semibold))
            .textCase(.uppercase)
            .tracking(0.6)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: title)
            .font(DS.TextStyle.title.weight(.bold))
            .accessibilityAddTraits(.isHeader)
        }
      }
      if let message {
        Text(verbatim: message)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      actions()
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
  }

  /// Ngày nghỉ: thẻ chung `RestDayCard` + vẫn có đường tập.
  private var restCard: some View {
    RestDayCard(eyebrow: eyebrow) {
      HStack(spacing: DS.Spacing.sm) {
        if flow.plan != nil {
          secondaryButton(String(localized: "wh.rest.pick"), systemImage: "calendar") { showsPicker = true }
        }
        secondaryButton(String(localized: "today.cta.logFree"), systemImage: "square.and.pencil") { showsManualLog = true }
      }
    }
  }

  private func buttonLabel(_ title: String, systemImage: String, fill: Color?) -> some View {
    Label(title, systemImage: systemImage)
      .font(DS.TextStyle.headline)
      .foregroundStyle(fill == nil ? DS.Color.foreground.swiftUI : Color.white)
      .frame(maxWidth: .infinity, minHeight: 50)
      .background {
        if let fill {
          Capsule().fill(fill)
        } else {
          Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1)
        }
      }
      .contentShape(Capsule())
  }

  private func primaryButton(_ title: String, systemImage: String, fill: Color, action: @escaping () -> Void) -> some View {
    Button(action: action) { buttonLabel(title, systemImage: systemImage, fill: fill) }
      .buttonStyle(TodayPressStyle())
      .sensoryFeedback(.impact(weight: .medium), trigger: flow.session?.phase)
  }

  private func secondaryButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
    Button(action: action) { buttonLabel(title, systemImage: systemImage, fill: nil) }
      .buttonStyle(TodayPressStyle())
  }

  // MARK: - Mẫu buổi tập

  @ViewBuilder private var templatesSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Text("workoutshome.templates \(templates.count.formatted(.number.locale(.app)))")
          .font(DS.TextStyle.title)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        if !templates.isEmpty {
          NavigationLink {
            TemplateListView(flow: flow)
          } label: {
            Text("workoutshome.seeall")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(Self.accent)
              .frame(minHeight: 44)
          }
        }
      }
      .padding(.horizontal, 4)
      .padding(.top, DS.Spacing.sm)
      if flow.today.library == nil, flow.today.failure != nil {
        DSErrorView(message: String(localized: "history.loadFailed")) {
          Task { await flow.refresh() }
        }
      } else {
        VStack(spacing: 0) {
          if templates.isEmpty {
            Text("workoutshome.notemplates")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 52)
          }
          ForEach(Array(templates.prefix(3).enumerated()), id: \.element.id) { i, t in
            if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
            templateRow(t)
          }
          if flow.plan != nil {
            if !templates.isEmpty { Divider().padding(.leading, 58).opacity(0.6) }
            Button {
              showsBuilder = true
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "plus")
                  .font(.body.weight(.semibold))
                  .foregroundStyle(Self.accent)
                  .frame(width: 32, height: 32)
                  .background(Self.accent.opacity(0.12), in: Circle())
                  .accessibilityHidden(true)
                Text("wh.createWorkout")
                  .font(DS.TextStyle.body.weight(.semibold))
                  .foregroundStyle(Self.accent)
                Spacer()
              }
              .padding(.horizontal, DS.Spacing.md)
              .frame(minHeight: 56)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .todayCard(radius: DS.Radius.xl)
      }
    }
  }

  private func templateRow(_ t: WorkoutTemplate) -> some View {
    let sets = t.exercises.reduce(0) { $0 + $1.sets }
    return HStack(spacing: 12) {
      Image(systemName: "dumbbell.fill")
        .font(.footnote)
        .foregroundStyle(Self.accent)
        .frame(width: 32, height: 32)
        .background(Self.accent.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: t.name)
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Text(String(localized: "wb.list.meta \(t.exercises.count) \(sets)"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 60)
    .accessibilityElement(children: .combine)
  }

  // MARK: - Công cụ

  @ViewBuilder private var tools: some View {
    VStack(spacing: 0) {
      if flow.history != nil || flow.library != nil {
        NavigationLink {
          LibraryHistoryView(flow: flow)
        } label: {
          toolRow("books.vertical", String(localized: "wh.libraryHistory"), sub: sessionsLine)
        }
        .buttonStyle(.plain)
      }
      if let insights = flow.insights {
        Divider().padding(.leading, 58).opacity(0.6)
        NavigationLink {
          ExerciseInsightView(insights: insights, today: flow.today)
        } label: {
          toolRow("chart.line.uptrend.xyaxis", String(localized: "workoutshome.insight"), sub: nil)
        }
        .buttonStyle(.plain)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard(radius: DS.Radius.xl)
  }

  private var sessionsLine: String? {
    guard let n = flow.history?.entries.count, n > 0 else { return nil }
    return String(localized: "wh.sessions \(n)")
  }

  private func toolRow(_ symbol: String, _ title: String, sub: String?, tint: Color = Self.accent) -> some View {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(tint)
        .frame(width: 32, height: 32)
        .background(tint.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI)
        if let sub {
          Text(verbatim: sub).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 60)
    .contentShape(Rectangle())
  }

  // MARK: - Cơ thể

  @ViewBuilder private var bodySegment: some View {
    if let weight {
      WeightTrendCard(book: weight) { showsWeight = true }
    }

    VStack(spacing: 0) {
      if let measure {
        NavigationLink { MeasurementsView(book: measure) } label: {
          toolRow("ruler", String(localized: "assistant.tool.measure"), sub: nil, tint: Self.body)
        }
        .buttonStyle(.plain)
      }
      if let photos {
        Divider().padding(.leading, 58).opacity(0.6)
        NavigationLink { ProgressPhotosView(book: photos) } label: {
          toolRow("photo.on.rectangle", String(localized: "assistant.tool.photos"), sub: nil, tint: Self.body)
        }
        .buttonStyle(.plain)
      }
      if let goals {
        Divider().padding(.leading, 58).opacity(0.6)
        NavigationLink { SmartGoalsView(book: goals) } label: {
          toolRow("target", String(localized: "assistant.tool.goals"), sub: nil, tint: Self.body)
        }
        .buttonStyle(.plain)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard(radius: DS.Radius.xl)
  }

  private func makeBodyBooks() {
    if weight == nil {
      weight = services.makeWeightTrend(userId: userId)
      Task { await weight?.load() }
    }
    if measure == nil { measure = services.makeMeasurements(userId: userId) }
    if photos == nil { photos = services.makeProgressPhotos(userId: userId) }
    if goals == nil { goals = services.makeSmartGoals(userId: userId, today: flow.today.today) }
  }

  // MARK: - Chữ

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
  }

  static func longWeekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.wide).locale(.app))
  }

  static func longDay(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.wide).day().month(.wide).locale(.app))
  }

  static func statusText(_ s: DayStatus) -> String {
    switch s {
    case .todo: String(localized: "today.status.todo")
    case .done: String(localized: "today.status.done")
    case .missed: String(localized: "today.status.missed")
    case .rest: String(localized: "today.status.rest")
    case .unplanned: String(localized: "today.status.unplanned")
    }
  }
}

/// "Thư viện & lịch sử" (`(tabs)/workouts/library.tsx`): thứ bạn TRA CỨU —
/// thư viện bài tập trước, lịch sử buổi tập sau.
struct LibraryHistoryView: View {
  let flow: WorkoutFlow

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        VStack(spacing: 0) {
          if let library = flow.library {
            NavigationLink { ExercisesView(library: library) } label: {
              row("books.vertical", String(localized: "workoutshome.library"), sub: nil)
            }
            .buttonStyle(.plain)
          }
          if let history = flow.history {
            if flow.library != nil { Divider().padding(.leading, 58).opacity(0.6) }
            NavigationLink { WorkoutHistoryView(book: history) } label: {
              row(
                "clock.arrow.circlepath", String(localized: "history.title"),
                sub: history.entries.isEmpty ? nil : String(localized: "wh.sessions \(history.entries.count)"))
            }
            .buttonStyle(.plain)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .todayCard(radius: DS.Radius.xl)
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "wh.libraryHistory"))
    .navigationBarTitleDisplayMode(.inline)
    .ascndPage()
  }

  private func row(_ symbol: String, _ title: String, sub: String?) -> some View {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(WorkoutsHomeView.accent)
        .frame(width: 32, height: 32)
        .background(WorkoutsHomeView.accent.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI)
        if let sub {
          Text(verbatim: sub).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 60)
    .contentShape(Rectangle())
  }
}
