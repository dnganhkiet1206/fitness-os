import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Đích của tab Trợ lý.
enum AssistantRoute: Hashable {
  case chat, weekly, steps, biometrics, sleep, goals, measure, photos, memory, trends, tools
}

/// Tab Trợ lý (#527 Phase 6) — `(tabs)/assistant.tsx` @ fac9ac2.
///
/// Thiết kế v2 (15/10): xem `AssistantSummaryViews.swift`. Tóm tắt dùng các dòng
/// của `AssistantBrief`; chip hỏi nhanh ở màn chat trống; bốn ô chỉ số + bảng 7
/// ngày (`MetricPanelView`) ở màn "Xu hướng 7 ngày"; lưới đủ công cụ ở "Tất cả
/// công cụ".
///
/// "Insight hôm nay" (`ai-smart-nudges`, `InsightCard`).
///
/// Chưa có (PARTIAL): thẻ nguồn Health, aura / glass; lưới
/// công cụ chỉ có những màn đã port (tổng kết tuần, vận động, sinh trắc học,
/// giấc ngủ, coach nhớ gì) — RN còn Quét thực phẩm.
///
/// Cuộc trò chuyện thuộc PHIÊN như RN (`useCoachChat` ở trên router): dựng một
/// lần trong cây của tài khoản này (cây dựng lại theo `.id(userId)`), sống qua
/// lượt đổi tab và lượt đẩy / lùi màn chat, đóng khi phiên đổi.
struct AssistantTab: View {
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @Environment(\.scenePhase) private var scenePhase
  @State private var path: [AssistantRoute] = []
  @State private var chat: CoachChat?
  @State private var signal: AssistantSignalBook?
  @State private var memory: CoachMemoryBook?
  @State private var weekly: WeeklyReviewBook?
  @State private var biometrics: BiometricsBook?
  @State private var metrics: MetricHistoryBook?
  @State private var nudges: SmartNudgesBook?
  @State private var steps: StepsBook?
  @State private var sleep: SleepInsightsBook?
  @State private var goals: SmartGoalsBook?
  @State private var measure: MeasurementsBook?
  @State private var photos: ProgressPhotosBook?
  @State private var hour = Calendar.current.component(.hour, from: Date())
  @State private var built = false
  /// Ghi nhanh từ thẻ (15/10): ngủ / bữa.
  @State private var logging: AssistantLog?
  enum AssistantLog: String, Identifiable {
    case sleep, meal
    var id: String { rawValue }
  }

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        // v2 (15/10, chủ dự án duyệt mock theo Apple Health mới): tóm tắt trước —
        // thẻ Sẵn sàng có nhãn chữ, Điểm nổi bật mỗi mảng một câu, Dành cho bạn,
        // ô hỏi coach; bảng 7 ngày và đủ công cụ nằm sau một lần chạm.
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          header
          if let signal {
            SummaryCard(
              signal: signal, metrics: metrics, lang: lang, hour: hour, openTrends: { path.append(.trends) },
              logSleep: { logging = .sleep })
          }
          // Máy chủ chưa bật tính năng → không hiện thẻ lỗi vĩnh viễn (15/10, audit).
          if let nudges, !nudges.isNotDeployed {
            InsightCard(book: nudges) { Task { await loadInsight(force: true) } }
          }
          if let chat {
            AskCoachBar(lastAsked: chat.messages.last { $0.role == .user }?.content) { path.append(.chat) }
          } else if built {
            ContentUnavailableView {
              Label("coach.title", systemImage: "sparkles")
            } description: {
              Text("coach.unavailable")
            }
          }
          highlights
          forYou
          Button {
            path.append(.tools)
          } label: {
            HStack {
              Text("assistant.alltools").font(.system(size: 15, weight: .medium))
              Spacer(minLength: 0)
              Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
            }
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(minHeight: 44)
            .padding(.horizontal, 4)
            .contentShape(Rectangle())
          }
          .buttonStyle(TodayPressStyle())
          // Nguồn của các con số, đặt DƯỚI những thứ dùng chúng (RN: cuối
          // trang). Không có Apple Health trên máy thì không hiện gì.
          HealthSyncLine(isAvailable: services.health.isAvailable, sync: syncHealth)
        }
        .padding(DS.Spacing.md)
      }
      .background { AssistantAura(status: signal?.signal.status) }
      .sheet(item: $logging, onDismiss: {
        Task {
          await signal?.load()
          await metrics?.load(kcalTarget: kcalTarget)
        }
      }) { item in
        switch item {
        case .sleep: LogSleepView(makeLogger: { services.makeSleepLogger(userId: flow.today.userId) })
        case .meal: LogMealView(userId: flow.today.userId)
        }
      }
      .refreshable {
        await signal?.load()
        await metrics?.load(kcalTarget: kcalTarget)
        await loadInsight()
      }
      .navigationTitle(Text("tab.assistant"))
      .ascndPage()
      // Tiêu đề lớn đã nằm trong nội dung — thanh điều hướng ẩn như các tab khác
      // (15/10, audit: tiêu đề nhỏ trôi đè lên thẻ khi cuộn).
      .toolbar(.hidden, for: .navigationBar)
      .statusBarScrim()
      .navigationDestination(for: AssistantRoute.self) { route in
        switch route {
        case .chat:
          if let chat { CoachChatView(chat: chat, lang: lang, suggestions: signal?.suggestions ?? []) }
        case .weekly:
          if let weekly { WeeklyReviewView(book: weekly, lang: lang) }
        case .steps:
          if let steps { StepsView(book: steps) }
        case .biometrics:
          if let biometrics { BiometricsView(book: biometrics) }
        case .sleep:
          if let sleep { SleepInsightsView(book: sleep, lang: lang) }
        case .goals:
          if let goals { SmartGoalsView(book: goals) }
        case .measure:
          if let measure { MeasurementsView(book: measure) }
        case .photos:
          if let photos { ProgressPhotosView(book: photos) }
        case .memory:
          if let memory { CoachMemoryView(book: memory) }
        case .trends:
          if let metrics {
            ScrollView {
              VStack(alignment: .leading, spacing: DS.Spacing.md) {
                Text("assistant.trends").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                // Vì sao điểm như vậy (15/10, audit — Apple Health: chạm điểm xem yếu tố).
                ReadinessFactors(
                  makeBook: { services.makeReadinessBook(userId: flow.today.userId, date: readinessDate) }, lang: lang)
                MetricPanelView(book: metrics, signal: signal, lang: lang) { question in
                  guard let chat else { return }
                  path.append(.chat)
                  CoachChatView.ask(chat, question, lang: lang)
                }
              }
              .padding(DS.Spacing.md)
            }
            .ascndPage()
          }
        case .tools:
          ScrollView {
            VStack(alignment: .leading, spacing: DS.Spacing.md) {
              Text("assistant.alltools").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
              tools
            }
            .padding(DS.Spacing.md)
          }
          .ascndPage()
        }
      }
    }
    .task {
      guard !built else { return }
      let userId = flow.today.userId
      let today = Self.today()
      chat = services.makeCoachChat(userId: userId)
      signal = services.makeAssistantSignal(userId: userId, today: today)
      memory = services.makeCoachMemory(userId: userId)
      weekly = services.makeWeeklyReview(userId: userId, today: today)
      biometrics = services.makeBiometricsBook(userId: userId)
      metrics = services.makeMetricHistory(userId: userId, today: today)
      nudges = services.makeSmartNudges(userId: userId)
      steps = services.makeStepsBook(userId: userId, today: today)
      sleep = services.makeSleepInsights(userId: userId)
      goals = services.makeSmartGoals(userId: userId, today: today)
      measure = services.makeMeasurements(userId: userId)
      photos = services.makeProgressPhotos(userId: userId)
      built = true
      await signal?.load()
      // Sau tín hiệu: phân tích calo cần mục tiêu calo của hồ sơ.
      await metrics?.load(kcalTarget: kcalTarget)
      // Sau tín hiệu: khoá của insight cần dấu "đã ngủ / ăn / tập" hôm nay.
      await loadInsight()
    }
    // RN học khi app vào nền (`AppState` → `background`): đó mới là lúc cuộc
    // trò chuyện thật sự "xong".
    .onChange(of: scenePhase) { _, phase in
      if phase == .background { chat?.appBackgrounded() }
      // Ra tiền cảnh: số hôm nay có thể đã đổi (ghi bữa / đồng bộ Health), hoặc
      // đã qua nửa đêm — lời chào, tóm tắt và chip đọc lại.
      guard phase == .active else { return }
      hour = Calendar.current.component(.hour, from: Date())
      let today = Self.today()
      Task {
        await signal?.move(to: today)
        await weekly?.move(to: today)
        await metrics?.move(to: today, kcalTarget: kcalTarget)
        await loadInsight()
        await steps?.move(to: today)
        await goals?.move(to: today)
      }
    }
    .onChange(of: isCurrentSession) { _, current in
      guard !current else { return }
      chat?.close()
      signal?.close()
      memory?.close()
      weekly?.close()
      biometrics?.close()
      metrics?.close()
      nudges?.close()
      steps?.close()
      sleep?.close()
      goals?.close()
      measure?.close()
      photos?.close()
    }
  }

  private var lang: AppPreferences.Lang { services.preferences.lang }

  /// `calorieTargetFor(profile)` của tín hiệu hôm nay (mặc định 2200).
  private var kcalTarget: Double { signal?.signal.kcalTarget ?? 2200 }

  /// Insight của hôm nay theo dấu dữ liệu hiện tại (đổi dấu → lượt gọi mới).
  private func loadInsight(force: Bool = false) async {
    guard let nudges, let stamp = signal?.nudgeStamp else { return }
    await nudges.load(
      date: Self.today(), lang: lang.rawValue, stamp: stamp, tzOffset: Coach.tzOffset(.current, at: Date()),
      force: force)
  }

  /// Đồng bộ Apple Health (`HealthSyncCoordinator.syncNow`, không đụng dịch vụ);
  /// xong thì tín hiệu, ô chỉ số và insight hôm nay đọc lại.
  private func syncHealth() async throws(HealthSync.Failure) {
    try await services.health.syncNow(userId: flow.today.userId, lang: AppServices.appLang)
    await signal?.load()
    await metrics?.load(kcalTarget: kcalTarget)
    await loadInsight()
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }

  private var isCurrentSession: Bool {
    services.session.session?.userId == flow.today.userId
  }

  // MARK: - Đầu trang

  private var header: some View {
    HStack(alignment: .bottom) {
      VStack(alignment: .leading, spacing: 0) {
        Text(verbatim: Date().formatted(Date.FormatStyle().weekday(.wide).day().month(.wide).locale(.app)))
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text("assistant.summary")
          .font(.largeTitle.bold())
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
      }
      Spacer(minLength: 0)
    }
  }

  // MARK: - Điểm nổi bật

  @ViewBuilder private var highlights: some View {
    if let signal {
      let s = signal.signal
      let hasTrend: Bool = if case .ready(let a) = metrics?.phase, a.bars.contains(where: { !$0.missing }) { true } else { false }
      let order = AssistantSummary.order(
        sleepMin: s.sleepMin, heartRate: signal.heartRate, kcal: s.kcal, hasTrend: hasTrend)
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle("assistant.highlights")
        ForEach(order, id: \.self) { area in highlight(area, signal: signal) }
      }
    }
  }

  @ViewBuilder private func highlight(_ area: AssistantSummary.Area, signal: AssistantSignalBook) -> some View {
    let s = signal.signal
    switch area {
    case .trend:
      if let metrics { TrendHighlight(book: metrics, lang: lang) { path.append(.trends) } }
    case .sleep:
      let sleepMin = Int(s.sleepMin)
      AreaHighlight(
        symbol: "moon.fill", title: String(localized: "metric.sleep"), tint: DS.Color.metricPurple.swiftUI,
        headline: sleepMin > 0
          ? String(localized: "assistant.sleep.value \(sleepMin / 60) \(sleepMin % 60)")
          : String(localized: "assistant.sleep.none"),
        detail: sleepMin > 0
          ? (sleepMin >= 420 ? String(localized: "metric.note.good") : String(localized: "metric.note.short"))
          : String(localized: "assistant.sleep.none.hint"))
      // "Ghi giấc ngủ" nằm ở thẻ Sẵn sàng phía trên — không lặp ở đây.
    case .heart:
      if let hr = signal.heartRate {
        AreaHighlight(
          symbol: "heart.fill", title: String(localized: "metric.hr"), tint: DS.Color.readinessRed.swiftUI,
          headline: String(localized: "assistant.hr \(hr)"),
          detail: hr < 60
            ? String(localized: "metric.note.low")
            : hr <= 80 ? String(localized: "metric.note.normal") : String(localized: "metric.note.high"))
      } else if services.health.isAvailable {
        AreaHighlight(
          symbol: "heart.fill", title: String(localized: "metric.hr"), tint: DS.Color.readinessRed.swiftUI,
          headline: String(localized: "assistant.hr.none"),
          action: (String(localized: "assistant.health.sync"), "arrow.triangle.2.circlepath", {
            Task { try? await syncHealth() }
          }))
      }
    case .nutrition:
      AreaHighlight(
        symbol: "flame.fill", title: String(localized: "metric.kcal"), tint: DS.Color.metricOrange.swiftUI,
        headline: String(
          localized:
            "assistant.kcal \(Int(s.kcal).formatted(.number.locale(.app))) \(Int(s.kcalTarget).formatted(.number.locale(.app)))"),
        detail: s.proteinTarget > 0
          ? String(
            localized:
              "assistant.protein \(Int(s.proteinG).formatted(.number.locale(.app))) \(Int(s.proteinTarget).formatted(.number.locale(.app)))")
          : nil,
        progress: s.kcalTarget > 0 ? s.kcal / s.kcalTarget : nil,
        action: s.kcal > 0 ? nil : (String(localized: "assistant.action.meal"), "plus", { logging = .meal }))
    }
  }

  /// Nhãn sẵn sàng đang hiện ở thẻ Tóm tắt (hôm nay, hoặc điểm gần nhất).
  private var shownReadiness: AssistantSummary.Readiness? {
    let s = signal?.signal
    if let r = s?.readiness { return AssistantSummary.readiness(status: s?.status, score: r) }
    guard case .ready(let a) = metrics?.phase, metrics?.kind == .readiness,
      let latest = AssistantSummary.latest(a.bars)
    else { return nil }
    return AssistantSummary.readiness(status: nil, score: latest.value)
  }

  /// Ngày của bảng yếu tố: hôm nay nếu có điểm, không thì ngày gần nhất có điểm.
  private var readinessDate: LocalDate {
    if signal?.signal.readiness == nil, case .ready(let a) = metrics?.phase, metrics?.kind == .readiness,
      let latest = AssistantSummary.latest(a.bars)
    {
      return latest.date
    }
    return Self.today()
  }

  // MARK: - Dành cho bạn

  /// Công cụ của tab ↔ loại trong lõi.
  private static func coreTool(_ r: AssistantRoute) -> AssistantSummary.Tool? {
    switch r {
    case .weekly: .weekly
    case .steps: .steps
    case .biometrics: .biometrics
    case .sleep: .sleep
    case .goals: .goals
    case .measure: .measure
    case .photos: .photos
    case .memory: .memory
    case .chat, .trends, .tools: nil
    }
  }

  private static func reasonText(_ r: AssistantSummary.Reason) -> String {
    switch r {
    case .weekEnd: String(localized: "assistant.why.weekEnd")
    case .noSleep: String(localized: "assistant.why.noSleep")
    case .shortSleep: String(localized: "assistant.why.shortSleep")
    case .fewSteps: String(localized: "assistant.why.fewSteps")
    case .lowReadiness: String(localized: "assistant.why.lowReadiness")
    case .monthStart: String(localized: "assistant.why.monthStart")
    }
  }

  /// "Dành cho bạn" theo ngữ cảnh (15/10): công cụ có lý do (chưa ngủ, sẵn sàng thấp,
  /// ít bước buổi chiều, cuối tuần, đầu tháng) lên trước, kèm câu lý do.
  private var forYouPicks: [(tool: Tool, reason: AssistantSummary.Reason?)] {
    let tools = availableTools
    let s = signal?.signal
    let now = Date()
    let cal = Calendar.current
    let ctx = AssistantSummary.Context(
      weekday: cal.component(.weekday, from: now), dayOfMonth: cal.component(.day, from: now), hour: hour,
      sleepMin: s?.sleepMin ?? 0, steps: s?.steps ?? 0,
      readiness: shownReadiness)
    let picks = AssistantSummary.forYou(tools.compactMap { Self.coreTool($0.route) }, context: ctx)
    return picks.compactMap { p in
      tools.first { Self.coreTool($0.route) == p.tool }.map { ($0, p.reason) }
    }
  }

  @ViewBuilder private var forYou: some View {
    let list = forYouPicks
    if !list.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle("assistant.foryou")
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.sm) {
            ForEach(list, id: \.tool.id) { item in
              let t = item.tool
              NavigationLink(value: t.route) {
                VStack(alignment: .leading, spacing: 6) {
                  AssistantCaption(symbol: t.symbol, text: t.label, tint: t.tint)
                    .lineLimit(1)
                  Text(verbatim: item.reason.map(Self.reasonText) ?? t.hint)
                    .font(.system(size: 13, weight: item.reason == nil ? .regular : .medium))
                    .foregroundStyle(DS.Color.foreground.swiftUI)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                }
                .frame(width: 150, alignment: .leading)
                .modifier(AssistantSurface())
                .contentShape(Rectangle())
              }
              .buttonStyle(TodayPressStyle())
              .accessibilityElement(children: .combine)
            }
          }
        }
        .scrollClipDisabled()
      }
    }
  }

  private func sectionTitle(_ key: LocalizedStringKey) -> some View {
    Text(key)
      .font(.system(size: 20, weight: .bold)).tracking(-0.3)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .padding(.top, DS.Spacing.sm)
      .accessibilityAddTraits(.isHeader)
  }

  // MARK: - Công cụ

  private struct Tool: Identifiable {
    let route: AssistantRoute
    let symbol: String
    let tint: Color
    let label: String
    let hint: String
    var id: AssistantRoute { route }
  }

  private var availableTools: [Tool] {
    var out: [Tool] = []
    if weekly != nil {
      out.append(
        Tool(
          route: .weekly, symbol: "calendar", tint: DS.Color.metricBlue.swiftUI,
          label: String(localized: "assistant.tool.week"), hint: String(localized: "assistant.tool.week.hint")))
    }
    if steps != nil {
      out.append(
        Tool(
          route: .steps, symbol: "figure.walk", tint: DS.Color.metricBlue.swiftUI,
          label: String(localized: "assistant.tool.steps"), hint: String(localized: "assistant.tool.steps.hint")))
    }
    if biometrics != nil {
      out.append(
        Tool(
          route: .biometrics, symbol: "heart.fill", tint: DS.Color.readinessRed.swiftUI,
          label: String(localized: "assistant.tool.bio"), hint: String(localized: "assistant.tool.bio.hint")))
    }
    if sleep != nil {
      out.append(
        Tool(
          route: .sleep, symbol: "moon.fill", tint: DS.Color.metricPurple.swiftUI,
          label: String(localized: "assistant.tool.sleep"), hint: String(localized: "assistant.tool.sleep.hint")))
    }
    if goals != nil {
      out.append(
        Tool(
          route: .goals, symbol: "scope", tint: DS.Color.readinessGreen.swiftUI,
          label: String(localized: "assistant.tool.goals"), hint: String(localized: "assistant.tool.goals.hint")))
    }
    if measure != nil {
      out.append(
        Tool(
          route: .measure, symbol: "ruler", tint: DS.Color.metricCyan.swiftUI,
          label: String(localized: "assistant.tool.measure"), hint: String(localized: "assistant.tool.measure.hint")))
    }
    if photos != nil {
      out.append(
        Tool(
          route: .photos, symbol: "camera.fill", tint: DS.Color.metricOrange.swiftUI,
          label: String(localized: "assistant.tool.photos"), hint: String(localized: "assistant.tool.photos.hint")))
    }
    if memory != nil {
      out.append(
        Tool(
          route: .memory, symbol: "sparkles", tint: DS.Color.metricPurple.swiftUI,
          label: String(localized: "assistant.tool.memory"), hint: String(localized: "assistant.tool.memory.hint")))
    }
    return out
  }

  @ViewBuilder private var tools: some View {
    let list = availableTools
    if !list.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        LazyVGrid(
          columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm
        ) {
          ForEach(list) { t in
            NavigationLink(value: t.route) {
              VStack(alignment: .leading, spacing: DS.Spacing.xs) {
                Image(systemName: t.symbol)
                  .font(.system(size: 18, weight: .semibold))
                  .foregroundStyle(t.tint)
                  .frame(width: 26, height: 26, alignment: .leading)
                  .accessibilityHidden(true)
                Text(verbatim: t.label)
                  .font(DS.TextStyle.headline)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .lineLimit(1)
                  .minimumScaleFactor(0.8)
                Text(verbatim: t.hint)
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .lineLimit(2, reservesSpace: true)
              }
              .padding(DS.Spacing.md)
              // Mọi ô cùng cao (15/10, audit: tên dài xuống dòng làm lưới lệch).
              .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
              .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
          }
        }
      }
    }
  }
}

/// "Insight hôm nay": đang đọc / lỗi (chạm thử lại) / không có gì nổi bật /
/// tối đa vài câu với chấm theo mức ưu tiên; "Cập nhật HH:mm" là lúc kết quả
/// về (ẩn khi chưa có lần nào).
private struct InsightCard: View {
  let book: SmartNudgesBook
  let retry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Label("insight.title", systemImage: "sparkles")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        if case .ready(let entry) = book.phase {
          Text("insight.updated \(Self.time(entry.at))")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      content
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .idle, .loading:
      HStack(spacing: DS.Spacing.sm) {
        ProgressView()
        Text("insight.loading")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    case .failed(let failure):
      Button(action: retry) {
        Label {
          VStack(alignment: .leading, spacing: 2) {
            Text("insight.failed")
            Text(verbatim: WeeklyReviewView.failureText(failure))
              .font(DS.TextStyle.caption)
          }
        } icon: {
          Image(systemName: "exclamationmark.triangle")
        }
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    case .ready(let entry) where entry.nudges.isEmpty:
      Text("insight.empty")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    case .ready(let entry):
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        ForEach(Array(entry.nudges.enumerated()), id: \.offset) { _, n in
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Circle()
              .fill(Self.tint(n.priority))
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)
            Text(verbatim: n.message)
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    }
  }

  private static func tint(_ p: SmartNudges.Priority) -> Color {
    switch p {
    case .high: DS.Color.readinessRed.swiftUI
    case .medium: DS.Color.readinessYellow.swiftUI
    case .low: DS.Color.readinessGreen.swiftUI
    }
  }

  private static func time(_ at: EpochMillis) -> String {
    Date(timeIntervalSince1970: TimeInterval(at.millis) / 1000)
      .formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(.app))
  }
}

extension SmartNudgesBook {
  /// Máy chủ chưa triển khai `ai-smart-nudges`.
  var isNotDeployed: Bool {
    if case .failed(.notDeployed) = phase { true } else { false }
  }
}
