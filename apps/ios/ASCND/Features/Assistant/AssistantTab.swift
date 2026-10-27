import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Đích của tab Tiến bộ (trước là Trợ lý).
enum AssistantRoute: Hashable {
  case chat, weekly, steps, training, biometrics, sleep, goals, measure, photos, memory, trends, tools
  /// GĐ3: huy chương, Cộng đồng (bỏ khỏi thanh tab).
  case awards, community
  /// Tiến bộ theo trạng thái (mock bản 10): chi tiết một nhóm; Cân nặng & số đo.
  case group(ProgressStatus.Group)
  case body
}

/// Tab Tiến bộ — GĐ3 (Kiệt duyệt 21/10, mock `gd3-four-areas.html`): tab Trợ lý
/// (#527 Phase 6, `(tabs)/assistant.tsx` @ fac9ac2) gộp thêm Koa / Gains, Tuần của
/// Koa, Cơ thể (từ Tập luyện), huy chương; Cộng đồng còn một dòng ở cuối. Phần
/// "Tóm tắt" cũ thành mục Hồi phục. Coach vẫn mở từ nút Koa ở Ghi nhanh.
///
/// Thiết kế v2 (15/10): xem `AssistantSummaryViews.swift`. Tóm tắt dùng các dòng
/// của `AssistantBrief`; chip hỏi nhanh ở màn chat trống; bốn ô chỉ số + bảng 7
/// ngày (`MetricPanelView`) ở màn "Xu hướng 7 ngày"; lưới đủ công cụ ở "Tất cả
/// công cụ".
///
/// "Insight hôm nay" (`ai-smart-nudges`) ở Hôm nay (`TodayCoachSection`, GĐ3).
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
  /// Chi tiết nhóm zoom ra từ đúng mảng chữ A vừa chạm (Kiệt duyệt mock 22/10); mở từ
  /// thẻ kết quả thì chuyển cảnh thường.
  @Namespace private var heroZoom
  @State private var zoomGroup: ProgressStatus.Group?
  /// "Hỏi Koa Coach" từ Ghi nhanh: mở thẳng màn chat (về `false` khi đã nhận).
  var openCoach: Binding<Bool> = .constant(false)
  /// Chat vừa đóng (rời màn chat) — RootTabView đưa về tab đã mở chat.
  var onCoachClosed: () -> Void = {}
  @State private var path: [AssistantRoute] = []
  @State private var chat: CoachChat?
  @State private var signal: AssistantSignalBook?
  @State private var memory: CoachMemoryBook?
  @State private var weekly: WeeklyReviewBook?
  @State private var biometrics: BiometricsBook?
  @State private var metrics: MetricHistoryBook?
  @State private var steps: StepsBook?
  @State private var sleep: SleepInsightsBook?
  /// Thẻ tập luyện đầy đủ (RN `TrainingCard`) — chuyển từ "Xem thêm" của Hôm nay
  /// (15/10, "Chia rõ": Hôm nay để làm, Trợ lý để hiểu).
  @State private var training: TrainingCardBook?
  @State private var goals: SmartGoalsBook?
  @State private var measure: MeasurementsBook?
  @State private var photos: ProgressPhotosBook?
  /// GĐ3: huy chương.
  @State private var awards: AwardsBook?
  /// Tiến bộ theo trạng thái: 7 ngày daily_logs, 4 tuần cân, mục tiêu hồ sơ.
  @State private var progress: ProgressStatusBook?
  @State private var built = false
  /// Ghi nhanh từ thẻ (15/10): ngủ / bữa.
  @State private var logging: AssistantLog?
  enum AssistantLog: String, Identifiable {
    case sleep, meal, weight
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
          // Mock bản 10 (Kiệt duyệt 22/10): chữ A của logo, 6 nhóm, mỗi nhóm một chữ
          // trạng thái; thẻ cân nặng đầy đủ chuyển vào "Thêm → Cân nặng & số đo".
          if let results = progressResults {
            // Nhỏ lại một chút (Kiệt 22/10): 300 → 260.
            ProgressHero(results: results, onTap: { g in
              zoomGroup = g
              path.append(.group(g))
            }, zoom: heroZoom)
              .frame(maxWidth: 260)
              .frame(maxWidth: .infinity)
              .padding(.top, DS.Spacing.sm)
            ProgressLegend()
            focusBlock(results)
            let shown = ProgressStatus.ordered(results).filter { $0.level != .insufficient }
            if !shown.isEmpty {
              sectionHeader("ps.results", trailing: attentionLine(results))
              ForEach(shown) { r in
                ProgressResultCard(result: r) {
                  zoomGroup = nil
                  path.append(.group(r.group))
                }
              }
            }
            let missing = results.filter { $0.level == .insufficient }
            if !missing.isEmpty {
              sectionTitle("ps.missing")
              ProgressMissingCard(results: missing) { g in
                switch g {
                case .nutrition: logging = .meal
                case .body: logging = .weight
                default: logging = .sleep
                }
              }
            }
          } else if case .failed = progress?.phase {
            Text("ps.failed").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          } else {
            ProgressView().frame(maxWidth: .infinity, minHeight: 200)
          }
          sectionTitle("progress.more")
          VStack(spacing: 0) {
            NavigationLink(value: AssistantRoute.body) {
              WorkoutsHomeView.toolRow(
                "scalemass", String(localized: "ps.more.body"), sub: nil, tint: DS.Color.metricSteel.swiftUI)
            }
            .buttonStyle(.plain)
            Divider().padding(.leading, 58).opacity(0.6)
            if awards != nil {
              NavigationLink(value: AssistantRoute.awards) {
                WorkoutsHomeView.toolRow(
                  "trophy", String(localized: "aw.title"), sub: awardsLine, tint: DS.Color.readinessYellow.swiftUI)
              }
              .buttonStyle(.plain)
              Divider().padding(.leading, 58).opacity(0.6)
            }
            if weekly != nil, ai {
              NavigationLink(value: AssistantRoute.weekly) {
                WorkoutsHomeView.toolRow(
                  "calendar", String(localized: "assistant.tool.week"), sub: weekLine, tint: DS.Color.metricBlue.swiftUI)
              }
              .buttonStyle(.plain)
              Divider().padding(.leading, 58).opacity(0.6)
            }
            NavigationLink(value: AssistantRoute.tools) {
              WorkoutsHomeView.toolRow(
                "square.grid.2x2", String(localized: "assistant.alltools"), sub: nil, tint: DS.Color.metricBlue.swiftUI)
            }
            .buttonStyle(.plain)
            Divider().padding(.leading, 58).opacity(0.6)
            NavigationLink(value: AssistantRoute.community) {
              WorkoutsHomeView.toolRow(
                "person.2", String(localized: "tab.community"), sub: nil, tint: DS.Color.metricRose.swiftUI)
            }
            .buttonStyle(.plain)
          }
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
          .todayCard()
          about
          // Apple Health chỉ ở Cài đặt (15/10, chủ dự án: "chỉ để apple health trong
          // cài đặt các tab khác gỡ").
        }
        .padding(DS.Spacing.md)
      }
      // Nền như các tab khác (15/10, chủ dự án: "lớp aura phía sau làm xấu quá") —
      // thay bốn quầng màu trôi.
      .background { TodayAmbient(accent: nil) }
      .sheet(item: $logging, onDismiss: {
        Task {
          await signal?.load()
          await metrics?.load(kcalTarget: kcalTarget)
          await progress?.load()
        }
      }) { item in
        switch item {
        case .sleep: LogSleepView(makeLogger: { services.makeSleepLogger(userId: flow.today.userId) })
        case .meal: LogMealView(userId: flow.today.userId)
        case .weight:
          LogWeightView(makeLogger: { services.makeWeightLogger(userId: flow.today.userId) }) { logging = nil }
        }
      }
      .refreshable { await refreshAll() }
      .navigationTitle(Text("tab.progress"))
      .ascndPage()
      // Tiêu đề lớn đã nằm trong nội dung — thanh điều hướng ẩn như các tab khác
      // (15/10, audit: tiêu đề nhỏ trôi đè lên thẻ khi cuộn).
      .toolbar(.hidden, for: .navigationBar)
      .statusBarScrim()
      // Có zoom từ chữ A: chặn vuốt-về ở trang gốc như Hôm nay (lỗi iOS 26, #636).
      .background { RootSwipeGuard() }
      .navigationDestination(for: AssistantRoute.self) { route in
        switch route {
        case .chat:
          if let chat {
            // Ô hỏi ở đáy — dải Ghi nhanh ẩn khi chat mở (15/10, chủ dự án).
            CoachChatView(
              chat: chat, lang: lang, suggestions: signal?.suggestions ?? [], signal: signal?.signal,
              logged: signal?.logged, onLogged: { await signal?.load() })
              .hidesQuickLog()
          }
        case .weekly:
          if let weekly { WeeklyReviewView(book: weekly, lang: lang) }
        case .steps:
          if let steps { StepsView(book: steps) }
        case .training:
          if let training { TrainingCardView(book: training, acwr: signal?.signal.acwr) }
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
                MetricPanelView(book: metrics, signal: signal, lang: lang, onAsk: ai ? { question in
                  guard let chat else { return }
                  path.append(.chat)
                  CoachChatView.ask(chat, question, lang: lang, signal: signal?.signal, logged: signal?.logged)
                } : nil)
              }
              .padding(DS.Spacing.md)
            }
            .ascndPage()
          }
        case .awards:
          if let awards { AwardsView(book: awards, lang: lang) }
        case .group(let g):
          if let r = progressResults?.first(where: { $0.group == g }) {
            let detail = ProgressGroupView(
              result: r, snapshot: progressSnapshot, week: koaWeek,
              openTrends: metrics == nil ? nil : { path.append(.trends) }, refresh: refreshAll)
            if zoomGroup == g {
              detail.todayZoom("ps.\(g.rawValue)", in: heroZoom)
            } else {
              detail
            }
          }
        case .body:
          ScrollView {
            BodySection(userId: flow.today.userId, today: flow.today.today).padding(DS.Spacing.md)
          }
          .navigationTitle(Text("ps.more.body"))
          .ascndPage()
        case .community:
          CommunityScreen(pushed: true)
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
      steps = services.makeStepsBook(userId: userId, today: today)
      sleep = services.makeSleepInsights(userId: userId)
      training = services.makeTrainingCard(userId: userId)
      goals = services.makeSmartGoals(userId: userId, today: today)
      measure = services.makeMeasurements(userId: userId)
      photos = services.makeProgressPhotos(userId: userId)
      awards = services.makeAwardsBook(userId: userId)
      progress = services.makeProgressStatus(userId: userId, today: today)
      built = true
      Task { await awards?.load() }
      Task { await progress?.load() }
      await signal?.load()
      // Sau tín hiệu: phân tích calo cần mục tiêu calo của hồ sơ.
      await metrics?.load(kcalTarget: kcalTarget)
    }
    // RN học khi app vào nền (`AppState` → `background`): đó mới là lúc cuộc
    // trò chuyện thật sự "xong".
    // `initial`: lần đầu tab dựng (chưa từng mở) cũng nhận lời mời.
    .onChange(of: path) { old, new in
      if old.contains(.chat), !new.contains(.chat) { onCoachClosed() }
    }
    .onChange(of: openCoach.wrappedValue, initial: true) { _, go in
      guard go else { return }
      openCoach.wrappedValue = false
      if path != [.chat] { path = [.chat] }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background { chat?.appBackgrounded() }
      // Ra tiền cảnh: số hôm nay có thể đã đổi (ghi bữa / đồng bộ Health), hoặc
      // đã qua nửa đêm — lời chào, tóm tắt và chip đọc lại.
      if phase == .active { moveToToday() }
    }
    .onNewDay { moveToToday() }
    .onReceive(NotificationCenter.default.publisher(for: .healthSynced)) { _ in
      Task { await reloadAfterHealthSync() }
    }
    .onChange(of: isCurrentSession) { _, current in
      guard !current else { return }
      chat?.close()
      signal?.close()
      memory?.close()
      weekly?.close()
      biometrics?.close()
      metrics?.close()
      steps?.close()
      sleep?.close()
      training?.close()
      goals?.close()
      measure?.close()
      photos?.close()
      awards?.close()
      progress?.close()
    }
  }

  private var lang: AppPreferences.Lang { services.preferences.lang }

  /// `calorieTargetFor(profile)` của tín hiệu hôm nay (mặc định 2200).
  private var kcalTarget: Double { signal?.signal.kcalTarget ?? 2200 }

  /// Sau một lượt đồng bộ Apple Health (giờ chỉ ở Cài đặt, hoặc tự chạy khi ra
  /// tiền cảnh): tín hiệu, ô chỉ số và insight hôm nay đọc lại.
  /// Kéo để làm mới — tab và trang chi tiết nhóm cùng một lượt.
  private func refreshAll() async {
    await progress?.load()
    await signal?.load()
    await metrics?.load(kcalTarget: kcalTarget)
  }

  private func reloadAfterHealthSync() async {
    await signal?.load()
    await metrics?.load(kcalTarget: kcalTarget)
  }

  private func moveToToday() {
    let today = Self.today()
    Task {
      await signal?.move(to: today)
      await weekly?.move(to: today)
      await progress?.move(to: today)
      await metrics?.move(to: today, kcalTarget: kcalTarget)
      await steps?.move(to: today)
      await goals?.move(to: today)
    }
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }

  private var isCurrentSession: Bool {
    services.session.session?.userId == flow.today.userId
  }

  // MARK: - Đầu trang

  private var header: some View {
    // Bỏ dòng "Tuần 19 – 25 tháng 10" ở trên tiêu đề (Kiệt 22/10).
    VStack(alignment: .leading, spacing: 0) {
      Text("tab.progress")
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
    }
  }

  // MARK: - Tiến bộ theo trạng thái (mock bản 10)

  private var koaWeek: KoaWeek.State? {
    KoaWeek.state(today: flow.today.today, library: flow.today.library, trained: flow.today.trained)
  }

  private var progressSnapshot: ProgressStatusBook.Snapshot? {
    if case .ready(let s) = progress?.phase { return s }
    return nil
  }

  private var progressResults: [ProgressStatus.Result]? {
    let goal = Double(StepsGoalStore(store: UserDefaultsStore(), userId: flow.today.userId).goal)
    return progress?.results(training: ProgressStatus.training(koaWeek, today: flow.today.today), stepsGoal: goal)
  }

  private func attentionLine(_ results: [ProgressStatus.Result]) -> String? {
    let n = results.filter { $0.level == .attention }.count
    return n > 0 ? String(localized: "ps.attentionCount \(n)") : nil
  }

  /// "Tuần này": nhóm cần chú ý quan trọng nhất (luật, không AI).
  @ViewBuilder private func focusBlock(_ results: [ProgressStatus.Result]) -> some View {
    let focus = ProgressStatus.focus(results)
    let text: String = if let first = focus.first {
      focus.count > 1
        ? String(localized: "ps.focus.two \(ProgressStyle.name(first)) \(ProgressStyle.name(focus[1]).lowercased())")
        : String(localized: "ps.focus.one \(ProgressStyle.name(first))")
    } else if results.allSatisfy({ $0.level == .insufficient }) {
      String(localized: "ps.focus.empty")
    } else {
      String(localized: "ps.focus.good")
    }
    VStack(alignment: .leading, spacing: 4) {
      Text("ps.week").font(.system(size: 22, weight: .bold)).tracking(-0.3)
        .accessibilityAddTraits(.isHeader)
      Text(verbatim: text)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.top, DS.Spacing.xs)
  }

  private var awardsLine: String? {
    guard case .ready = awards?.phase, let awards else { return nil }
    return "\(awards.earnedCount)/\(Awards.catalogue.count)"
  }

  /// "Về các kết quả này" + lời nhắc y tế (như Health).
  private var about: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("ps.about.title").font(DS.TextStyle.headline)
      Text("ps.about.body").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text("ps.about.medical").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .fixedSize(horizontal: false, vertical: true)
    .padding(.top, DS.Spacing.sm)
  }

  private func sectionHeader(_ key: LocalizedStringKey, trailing: String?) -> some View {
    HStack(alignment: .firstTextBaseline) {
      sectionTitle(key)
      Spacer(minLength: 0)
      if let trailing {
        Text(verbatim: trailing).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  // MARK: - Tuần này (GĐ3)

  /// "2/6 buổi · +24 Gains" của tuần này — cùng `KoaWeek.summary` với màn Tổng kết tuần.
  private var weekLine: String? {
    guard let library = flow.today.library, let history = services.koaGainsHistory else { return nil }
    let today = flow.today.today
    let s = KoaWeek.summary(
      weekStart: WeeklyChallenges.weekStart(today), today: today, library: library, history: history.days)
    return String(localized: "dp.week.count \(s.done) \(s.target)") + " · " + String(localized: "wr.plan.gains \(s.gains)")
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

  /// Công cụ của Trợ lý. Số đo / Ảnh tiến trình / Hiệu chỉnh mục tiêu đã có ở
  /// Tập luyện → Cơ thể — bỏ khỏi đây (15/10, audit toàn app: phần cơ thể bị chia
  /// đôi); màn và route vẫn giữ.
  private var availableTools: [Tool] {
    var out: [Tool] = []
    // Tổng kết tuần và trí nhớ coach cần edge function AI — ẩn khi chưa deploy.
    if weekly != nil, ai {
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
    if training != nil {
      out.append(
        Tool(
          route: .training, symbol: "dumbbell.fill", tint: DS.Color.metricRose.swiftUI,
          label: String(localized: "assistant.tool.training"), hint: String(localized: "assistant.tool.training.hint")))
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
    if memory != nil, ai {
      out.append(
        Tool(
          route: .memory, symbol: "brain.head.profile", tint: DS.Color.metricPurple.swiftUI,
          label: String(localized: "assistant.tool.memory"), hint: String(localized: "assistant.tool.memory.hint")))
    }
    return out
  }

  /// Edge function AI đã deploy (`AppServices.probeAI`) — chưa thì ẩn mọi lối vào AI.
  private var ai: Bool { services.aiDeployed == true }

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

