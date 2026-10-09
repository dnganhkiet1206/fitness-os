import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Đích của tab Trợ lý.
enum AssistantRoute: Hashable {
  case chat, weekly, biometrics, memory
}

/// Tab Trợ lý (#527 Phase 6) — `(tabs)/assistant.tsx` @ fac9ac2.
///
/// Như RN: tiêu đề "Trợ lý sức khoẻ" + dòng phụ; lời chào theo giờ và tên
/// với tối đa ba dòng tóm tắt hôm nay (`AssistantBrief`); thẻ AI Coach — chạm
/// mở chat, bốn chip hỏi luôn câu của chip (cùng bốn chip với chat trống),
/// đang có cuộc trò chuyện thì thẻ mời "Tiếp tục: <câu hỏi cuối>" và ẩn chip;
/// lưới công cụ có gợi ý dưới nhãn.
///
/// Chưa có (PARTIAL): bảng chỉ số 14 ngày (`metric-analysis.ts` +
/// `MetricPanel`), nhắc thông minh (`use-smart-nudges`), aura / glass; lưới
/// công cụ chỉ có những màn đã port (tổng kết tuần, sinh trắc học, coach nhớ
/// gì) — RN còn Vận động, Quét thực phẩm, Giấc ngủ.
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
  @State private var hour = Calendar.current.component(.hour, from: Date())
  @State private var built = false

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.lg) {
          header
          if let signal { BriefCard(brief: signal.brief(hour: hour), lang: lang) }
          if let chat {
            CoachCard(chat: chat, suggestions: signal?.suggestions ?? [], lang: lang) { question in
              path.append(.chat)
              if let question { CoachChatView.ask(chat, question, lang: lang) }
            }
          } else if built {
            ContentUnavailableView {
              Label("coach.title", systemImage: "sparkles")
            } description: {
              Text("coach.unavailable")
            }
          }
          tools
        }
        .padding(DS.Spacing.md)
      }
      .refreshable { await signal?.load() }
      .navigationTitle(Text("tab.assistant"))
      .navigationBarTitleDisplayMode(.inline)
      .navigationDestination(for: AssistantRoute.self) { route in
        switch route {
        case .chat:
          if let chat { CoachChatView(chat: chat, lang: lang, suggestions: signal?.suggestions ?? []) }
        case .weekly:
          if let weekly { WeeklyReviewView(book: weekly, lang: lang) }
        case .biometrics:
          if let biometrics { BiometricsView(book: biometrics) }
        case .memory:
          if let memory { CoachMemoryView(book: memory) }
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
      built = true
      await signal?.load()
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
      }
    }
    .onChange(of: isCurrentSession) { _, current in
      guard !current else { return }
      chat?.close()
      signal?.close()
      memory?.close()
      weekly?.close()
      biometrics?.close()
    }
  }

  private var lang: AppPreferences.Lang { services.preferences.lang }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }

  private var isCurrentSession: Bool {
    services.session.session?.userId == flow.today.userId
  }

  // MARK: - Đầu trang

  private var header: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: DS.Spacing.sm) {
        Text("tab.assistant")
          .font(DS.TextStyle.largeTitle)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        AIBadge()
      }
      Text("assistant.subtitle")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
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
    if biometrics != nil {
      out.append(
        Tool(
          route: .biometrics, symbol: "heart.fill", tint: DS.Color.readinessRed.swiftUI,
          label: String(localized: "assistant.tool.bio"), hint: String(localized: "assistant.tool.bio.hint")))
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
        Text("assistant.tools")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        LazyVGrid(
          columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm
        ) {
          ForEach(list) { t in
            NavigationLink(value: t.route) {
              VStack(alignment: .leading, spacing: DS.Spacing.xs) {
                Image(systemName: t.symbol)
                  .foregroundStyle(t.tint)
                  .accessibilityHidden(true)
                Text(verbatim: t.label)
                  .font(DS.TextStyle.headline)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(verbatim: t.hint)
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .lineLimit(2, reservesSpace: true)
              }
              .padding(DS.Spacing.md)
              .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
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

/// Nhãn "AI" cạnh tiêu đề (`aiBadge`).
private struct AIBadge: View {
  var body: some View {
    HStack(spacing: 2) {
      Image(systemName: "sparkles").font(.caption2)
      Text(verbatim: "AI").font(DS.TextStyle.caption.weight(.bold))
    }
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .foregroundStyle(DS.Color.brand.swiftUI)
    .background(DS.Color.secondary.swiftUI, in: Capsule())
    .accessibilityHidden(true)
  }
}

/// Lời chào + tối đa ba dòng tóm tắt hôm nay (`briefFor`).
private struct BriefCard: View {
  let brief: AssistantBrief.Brief
  let lang: AppPreferences.Lang

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(verbatim: brief.greeting(lang))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      ForEach(brief.lines) { line in
        Text(verbatim: line.text(lang))
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

/// Thẻ AI Coach: phần đầu (+ "Tiếp tục: …" khi đang chat) là MỘT nút mở chat;
/// chip là các nút anh em riêng (RN: tách ra để VoiceOver nghe được từng chip).
private struct CoachCard: View {
  let chat: CoachChat
  let suggestions: [AssistantSuggestions.Suggestion]
  let lang: AppPreferences.Lang
  /// `nil` = chỉ mở chat; có câu = mở chat và hỏi luôn.
  let open: (String?) -> Void

  /// Câu hỏi cuối của người dùng trong cuộc trò chuyện đang mở.
  private var lastAsked: String? {
    chat.messages.last { $0.role == .user }?.content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Button {
        open(nil)
      } label: {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          HStack(spacing: DS.Spacing.md) {
            Image(systemName: "sparkles")
              .font(.title3)
              .foregroundStyle(DS.Color.brand.swiftUI)
              .frame(width: 44, height: 44)
              .background(DS.Color.secondary.swiftUI, in: Circle())
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text("coach.title")
                .font(DS.TextStyle.headline)
                .foregroundStyle(DS.Color.foreground.swiftUI)
              Text("assistant.coach.hint")
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          if let lastAsked {
            Label {
              Text("assistant.coach.continue \(lastAsked)")
                .lineLimit(1)
            } icon: {
              Image(systemName: "clock")
            }
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("assistant.coach.open.a11y"))
      if lastAsked == nil && !suggestions.isEmpty {
        FlowChips(suggestions: suggestions, lang: lang, disabled: chat.isLoading) { open($0) }
      }
    }
    .padding(DS.Spacing.md)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
  }
}
