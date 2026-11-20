import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Trang gốc tab Tập luyện (#527) — `app/(tabs)/workouts/index.tsx` +
/// `components/ascnd/today-training.tsx` @ fac9ac2; thiết kế lại 14/10 (chủ
/// dự án duyệt mock, `docs/design/workouts/REDESIGN.md`).
///
/// Như RN:
/// - ~~hai phân đoạn Buổi tập | Cơ thể~~ — GĐ3 (Kiệt duyệt 21/10, mock
///   `gd3-four-areas.html`): Tập luyện chỉ còn việc tập; Cơ thể sang tab Tiến bộ
///   (`BodySection`);
/// - dải tuần (Thứ Hai → Chủ nhật: đã tập / có buổi / nghỉ), chạm → kế hoạch tuần;
/// - thẻ hôm nay bốn trạng thái: có buổi → "Bắt đầu buổi tập" (nút đặc);
///   đã tập → nút nhạt; ngày nghỉ → gợi ý vận động nhẹ + chọn buổi; chưa có
///   kế hoạch → "Chọn buổi tập";
/// - ~~"Mẫu buổi tập (n)" trên trang, "Thư viện & lịch sử" ở hàng dưới~~ —
///   Kiệt 15/11 đổi chỗ: "Thư viện bài tập" (lưới nhóm cơ + "Xem tất cả") nằm
///   ngay trên trang; hàng dưới là "Mẫu buổi tập & lịch sử"
///   (`TemplatesHistoryView`), rồi "Tiến bộ từng bài".
///
/// Khác RN:
/// - trạng thái thứ năm "Đang tập" (đã tick, chưa chốt): màn tập là lớp toàn
///   màn hình, thu xuống vẫn giữ tiến độ — thẻ nói còn bao nhiêu set và mời
///   "Tiếp tục";
/// - gợi ý ngày nghỉ là chữ (RN: ô bấm không làm gì ngoài rung).
struct WorkoutsHomeView: View {
  let flow: WorkoutFlow
  var onOpenSession: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var showsManualLog = false
  @State private var showsPicker = false

  static let accent = MascotRoomView.signalColor(.workout)


  private var userId: String { flow.today.userId }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        header
        weekStrip
        hero
        librarySection
        tools
      }
      .padding(DS.Spacing.md)
      .padding(.bottom, DS.Spacing.lg)
    }
    .refreshable { await flow.refresh() }
    // Sao yêu thích bài tập (đồng bộ) + độ phổ biến từ số liệu thật (16/11).
    .task {
      await services.syncExerciseFavorites(userId: userId)
      await services.refreshExercisePopularity()
    }
    // Đầu trang trong nội dung như Hôm nay / Dinh dưỡng.
    .navigationTitle(Text("tab.workouts"))
    .toolbar(.hidden, for: .navigationBar)
    .statusBarScrim()
    .background { TodayAmbient(accent: .workout) }
    .sheet(isPresented: $showsManualLog) { ManualLogView(flow: flow) }
    .sheet(isPresented: $showsPicker) { WorkoutPickerSheet(flow: flow) }
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
    // dải ngày chung của app (Kiệt 13/11): T2→CN có số ngày, hôm nay tô màu tab, chấm = trạng thái
    let strip = WeekDayStrip(
      days: days.map { WeekDay(date: $0.date, mark: Self.mark($0.status)) }, today: flow.today.today,
      selected: flow.today.today, accent: Self.accent
    )
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
    HStack(spacing: 12) {
      legend(.done, "wp.status.done")
      legend(.planned, "wp.legend.planned")
      legend(.missed, "wp.status.missed")
      legend(.rest, "wp.status.rest")
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
    .frame(maxWidth: .infinity)
    .padding(.bottom, DS.Spacing.xs)
    .accessibilityHidden(true)
  }

  /// Trạng thái ngày của kế hoạch → chấm của dải ngày chung.
  static func mark(_ s: DayStatus) -> WeekDay.Mark {
    switch s {
    case .done: .done
    case .todo: .planned
    case .missed: .missed
    case .rest: .rest
    case .unplanned: .none
    }
  }

  private func legend(_ m: WeekDay.Mark, _ key: String.LocalizationValue) -> some View {
    HStack(spacing: 4) {
      switch m {
      case .done: Circle().fill(Self.accent).frame(width: 6, height: 6)
      case .planned: Circle().strokeBorder(Self.accent, lineWidth: 1.2).frame(width: 6, height: 6)
      case .missed:
        Circle().strokeBorder(Self.accent.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [1.5, 1.5]))
          .frame(width: 6, height: 6)
      default: Capsule().fill(DS.Color.mutedForeground.swiftUI.opacity(0.5)).frame(width: 7, height: 2)
      }
      Text(String(localized: key))
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
        primaryButton(String(localized: "today.start"), systemImage: "play.fill", fill: Self.ink, inkText: true) {
          onOpenSession()
        }
      }
    case .inProgress(let done, let total):
      planCard(eyebrow: String(localized: "wh.inProgress"), title: templateName, highlighted: true) {
        VStack(alignment: .leading, spacing: 6) {
          ProgressView(value: Double(done), total: Double(max(total, 1)))
            .tint(Self.accent)
          HStack {
            Text(String(localized: "wh.progress \(done) \(total)"))
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Spacer(minLength: 0)
            if let s = flow.session, s.plan.date == flow.today.today, let start = s.startedAt {
              WorkoutClock(startedAt: start)
            }
          }
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
          primaryButton(String(localized: "today.choosePlan"), systemImage: "calendar", fill: Self.ink, inkText: true) {
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
            .font(DS.TextStyle.number(13, .footnote))
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
                .font(DS.TextStyle.number(14, .body))
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

  /// Nút "mực": nền theo màu chữ của chế độ (đen ở sáng, sáng ở tối) — chữ
  /// phải là màu nền, không phải trắng cố định (14/10, rà chế độ tối).
  static let ink = DS.Color.foreground.swiftUI

  private func buttonLabel(_ title: String, systemImage: String, fill: Color?, inkText: Bool = false) -> some View {
    Label(title, systemImage: systemImage)
      .font(DS.TextStyle.headline)
      .foregroundStyle(fill == nil ? DS.Color.foreground.swiftUI : inkText ? DS.Color.background.swiftUI : Color.white)
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

  private func primaryButton(_ title: String, systemImage: String, fill: Color, inkText: Bool = false, action: @escaping () -> Void) -> some View {
    Button(action: action) { buttonLabel(title, systemImage: systemImage, fill: fill, inkText: inkText) }
      .buttonStyle(TodayPressStyle())
      .sensoryFeedback(.impact(weight: .medium), trigger: flow.session?.phase)
  }

  private func secondaryButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
    Button(action: action) { buttonLabel(title, systemImage: systemImage, fill: nil) }
      .buttonStyle(TodayPressStyle())
  }

  // MARK: - Thư viện

  /// Thư viện bài tập ngay trên trang (Kiệt 15/11: "đưa thư viện ra bên ngoài
  /// trang tập luyện chính thay cho mẫu buổi tập"): lưới nhóm cơ + lối vào
  /// toàn bộ thư viện. Mẫu buổi tập chuyển vào "Mẫu buổi tập & lịch sử".
  @ViewBuilder private var librarySection: some View {
    if let library = flow.library {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack {
          Text("workoutshome.library")
            .font(DS.TextStyle.title)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .accessibilityAddTraits(.isHeader)
          Spacer()
          NavigationLink {
            ExercisesView(library: library, insights: flow.insights)
          } label: {
            Text("workoutshome.seeall")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(Self.accent)
              .frame(minHeight: 44)
          }
        }
        .padding(.horizontal, 4)
        .padding(.top, DS.Spacing.sm)
        MuscleGrid(library: library, insights: flow.insights)
      }
    } else if flow.today.failure != nil {
      DSErrorView(message: String(localized: "history.loadFailed")) {
        Task { await flow.refresh() }
      }
    }
  }

  // MARK: - Công cụ

  @ViewBuilder private var tools: some View {
    VStack(spacing: 0) {
      if flow.history != nil || flow.today.library != nil {
        NavigationLink {
          TemplatesHistoryView(flow: flow)
        } label: {
          Self.toolRow("dumbbell.fill", String(localized: "wh.templatesHistory"), sub: templatesLine)
        }
        .buttonStyle(.plain)
      }
      if let insights = flow.insights {
        Divider().padding(.leading, 58).opacity(0.6)
        NavigationLink {
          ExerciseInsightView(insights: insights, today: flow.today)
        } label: {
          Self.toolRow("chart.line.uptrend.xyaxis", String(localized: "workoutshome.insight"), sub: nil)
        }
        .buttonStyle(.plain)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard()
  }

  /// "7 mẫu · 13 buổi gần đây" dưới hàng "Mẫu buổi tập & lịch sử".
  private var templatesLine: String? {
    let t = flow.today.library?.templates.count ?? 0
    let n = flow.history?.entries.count ?? 0
    let parts = [t > 0 ? String(localized: "wh.templatesCount \(t)") : nil,
                 n > 0 ? String(localized: "wh.sessions \(n)") : nil].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  static func toolRow(_ symbol: String, _ title: String, sub: String?, tint: Color = Self.accent) -> some View {
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

  // MARK: - Chữ

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.short).locale(.app))
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

/// Vào thư viện theo NHÓM CƠ (`muscle-grid.tsx` @ fac9ac2, 14/10): đủ mười ô
/// theo thứ tự tập một cơ thể (không đổi chỗ khi có thêm bài), số bài dưới
/// mỗi ô; thu gọn hai hàng, "Xem tất cả nhóm" mở phần còn lại. Chạm → thư
/// viện chỉ nhóm ấy (`ExercisesView(only:)`).
///
/// Khác RN: chưa có hình giải phẫu `MuscleArt` — ô dùng biểu tượng SF hợp
/// nhóm, màu Tập luyện.
struct MuscleGrid: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let library: ExerciseLibrary
  var insights: InsightBook?
  @Environment(\.locale) private var locale
  @State private var expanded = false

  private var lang: MuscleGroup.Language { MuscleGroup.Language(locale: locale) }

  var body: some View {
    let counts = MuscleGroup.counts(library.exercises)
    let tiles = expanded ? MuscleGroup.tileOrder : Array(MuscleGroup.tileOrder.prefix(MuscleGroup.tilesCollapsed))
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "lib.byMuscle"))
        .font(DS.TextStyle.headline)
        .padding(.horizontal, 4)
        .accessibilityAddTraits(.isHeader)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.Spacing.sm), count: 3), spacing: DS.Spacing.sm) {
        ForEach(tiles, id: \.self) { g in
          NavigationLink {
            ExercisesView(library: library, only: g, insights: insights)
          } label: {
            tile(g, count: counts[g] ?? 0)
          }
          .buttonStyle(TodayPressStyle())
        }
      }
      Button {
        withAnimation(DSMotion.animation(.snappy, reduceMotion: reduceMotion)) { expanded.toggle() }
      } label: {
        Label(
          String(localized: expanded ? "lib.fewerGroups" : "lib.allGroups"),
          systemImage: expanded ? "chevron.up" : "chevron.down")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(WorkoutsHomeView.accent)
          .frame(maxWidth: .infinity, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .task { if !library.loaded { await library.load() } }
  }

  private func tile(_ g: MuscleGroup, count: Int) -> some View {
    VStack(spacing: 6) {
      Image(systemName: Self.symbol(g))
        .font(.system(size: 24, weight: .semibold))
        .foregroundStyle(WorkoutsHomeView.accent)
        .frame(width: 48, height: 48)
        .background(WorkoutsHomeView.accent.opacity(0.10), in: Circle())
      Text(verbatim: g.label(lang))
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      Text(String(localized: "lib.count \(count)"))
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, minHeight: 116)
    .todayCard()
    .accessibilityElement(children: .combine)
  }

  static func symbol(_ g: MuscleGroup) -> String {
    switch g {
    case .chest: "figure.strengthtraining.traditional"
    case .back: "figure.rower"
    case .legs: "figure.step.training"
    case .shoulders: "figure.arms.open"
    case .biceps: "dumbbell.fill"
    case .triceps: "figure.strengthtraining.functional"
    case .abs: "figure.core.training"
    case .glutes: "figure.cross.training"
    case .calves: "figure.walk"
    case .cardio: "heart.fill"
    }
  }
}
