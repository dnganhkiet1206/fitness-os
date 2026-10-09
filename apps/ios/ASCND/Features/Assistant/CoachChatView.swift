import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Cuộc trò chuyện: lời chào + bốn chip gợi ý khi trống, bong bóng hai phía (trả lời vẽ
/// markdown như `MarkdownLite`), ô soạn có nút gửi, lịch sử ở thanh trên.
///
/// Khác RN: lỗi của lượt gửi hiện ngay dưới cuộc trò chuyện bằng chữ của bảng
/// lỗi AI chung (RN: hộp thoại); "Cuộc trò chuyện mới" có chữ tiếng Tây Ban
/// Nha (RN: chỉ vi / en).
struct CoachChatView: View {
  let chat: CoachChat
  let lang: AppPreferences.Lang
  /// Cùng bốn chip với thẻ coach của Trợ lý (`useAssistantSignal`): chạm là
  /// hỏi luôn câu của chip.
  let suggestions: [AssistantSuggestions.Suggestion]

  @State private var draft = ""
  @State private var showsHistory = false
  @FocusState private var composing: Bool

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        if chat.messages.isEmpty {
          hello
        } else {
          transcript
        }
      }
      .scrollDismissesKeyboard(.interactively)
      .defaultScrollAnchor(chat.messages.isEmpty ? .center : .bottom)
      // Câu trả lời đến từng mẩu, cuộc trò chuyện đi theo nó xuống dưới.
      .onChange(of: chat.messages.last?.content) { _, _ in
        proxy.scrollTo(Self.bottom, anchor: .bottom)
      }
      .onChange(of: chat.failure) { _, failure in
        if failure != nil { proxy.scrollTo(Self.bottom, anchor: .bottom) }
      }
    }
    .safeAreaInset(edge: .bottom) { composer }
    .navigationTitle(Text("coach.title"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          showsHistory = true
        } label: {
          Image(systemName: "clock.arrow.circlepath")
            .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text("coach.history.a11y"))
      }
    }
    .sheet(isPresented: $showsHistory) {
      CoachHistorySheet(chat: chat)
    }
    .sensoryFeedback(.selection, trigger: showsHistory)
  }

  private static let bottom = "coach.bottom"

  // MARK: - Trống

  private var hello: some View {
    VStack(spacing: DS.Spacing.sm) {
      Image(systemName: "sparkles")
        .font(.largeTitle)
        .foregroundStyle(DS.Color.brand.swiftUI)
        .accessibilityHidden(true)
      Text("coach.hello")
        .font(DS.TextStyle.largeTitle)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text("coach.intro")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      if !suggestions.isEmpty {
        FlowChips(suggestions: suggestions, lang: lang, disabled: chat.isLoading) { send($0) }
          .padding(.top, DS.Spacing.md)
      }
    }
    .padding(DS.Spacing.lg)
    .frame(maxWidth: .infinity)
    .containerRelativeFrame(.vertical, alignment: .center)
  }

  // MARK: - Cuộc trò chuyện

  private var transcript: some View {
    LazyVStack(alignment: .leading, spacing: DS.Spacing.sm) {
      // "Cuộc trò chuyện mới" ở cạnh cuộc trò chuyện nó xoá, có chữ.
      HStack {
        Spacer()
        Button {
          chat.newChat()
          draft = ""
        } label: {
          Label("coach.newChat", systemImage: "plus")
            .font(DS.TextStyle.footnote)
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 44)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(chat.isLoading)
        .opacity(chat.isLoading ? 0.5 : 1)
        Spacer()
      }
      ForEach(chat.messages) { message in
        CoachBubble(message: message)
      }
      if chat.isLoading, chat.messages.last?.role != .assistant {
        HStack(alignment: .top, spacing: DS.Spacing.sm) {
          CoachAvatar()
          ProgressView()
            .padding(DS.Spacing.sm)
            .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("coach.thinking.a11y"))
      }
      if let failure = chat.failure {
        Label(WeeklyReviewView.failureText(failure), systemImage: "exclamationmark.triangle")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(DS.Spacing.sm)
      }
      Color.clear.frame(height: 1).id(Self.bottom)
    }
    .padding(DS.Spacing.md)
  }

  // MARK: - Ô soạn

  private var canSend: Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !chat.isLoading
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: DS.Spacing.sm) {
      TextField(String(localized: "coach.placeholder"), text: $draft, axis: .vertical)
        .lineLimit(1...5)
        .focused($composing)
        .font(DS.TextStyle.body)
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: 22))
      Button(action: submit) {
        Image(systemName: "arrow.up")
          .font(.body.weight(.semibold))
          .foregroundStyle(DS.Color.primaryForeground.swiftUI)
          .frame(width: 34, height: 34)
          .background(DS.Color.primary.swiftUI, in: Circle())
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(!canSend)
      .opacity(canSend ? 1 : 0.4)
      .accessibilityLabel(Text("coach.send.a11y"))
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
    .background(.bar)
  }

  private func submit() {
    let text = draft
    guard canSend else { return }
    draft = ""
    send(text)
  }

  private func send(_ text: String) { Self.ask(chat, text, lang: lang) }

  /// Một câu hỏi tới coach với ngày + múi giờ của máy lúc bấm — dùng chung
  /// cho ô soạn, chip trong chat và chip trên thẻ coach của tab Trợ lý.
  static func ask(_ chat: CoachChat, _ text: String, lang: AppPreferences.Lang) {
    let code = lang.rawValue
    let now = Date()
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    Task { await chat.send(text, lang: code, today: today, tzOffset: Coach.tzOffset(.current, at: now)) }
  }
}

/// Chip gợi ý: glyph theo `SuggestionGlyph`, chữ theo ngôn ngữ của app.
struct FlowChips: View {
  let suggestions: [AssistantSuggestions.Suggestion]
  let lang: AppPreferences.Lang
  let disabled: Bool
  let onPick: (String) -> Void

  var body: some View {
    VStack(spacing: DS.Spacing.sm) {
      ForEach(suggestions) { s in
        Button {
          onPick(s.question(lang))
        } label: {
          Label(s.label(lang), systemImage: Self.symbol(s.glyph))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 44)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
        // Đọc cả câu sẽ gửi, như `accessibilityLabel={s.question[lang]}` của RN.
        .accessibilityLabel(Text(verbatim: s.question(lang)))
      }
    }
  }

  static func symbol(_ g: AssistantSuggestions.Glyph) -> String {
    switch g {
    case .gauge: "gauge.with.dots.needle.50percent"
    case .pulse: "waveform.path.ecg"
    case .moon: "moon.fill"
    case .flame: "flame.fill"
    case .leaf: "leaf.fill"
    case .bolt: "bolt.fill"
    case .heart: "heart.fill"
    }
  }
}

/// Một tin: coach bên trái trên thẻ, người dùng bên phải trên nền thương hiệu.
private struct CoachBubble: View {
  let message: Coach.Message

  var body: some View {
    switch message.role {
    case .assistant:
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        CoachAvatar()
        CoachMarkdown(text: message.content)
          .padding(DS.Spacing.sm)
          .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
        Spacer(minLength: DS.Spacing.lg)
      }
    case .user:
      HStack {
        Spacer(minLength: DS.Spacing.xl)
        Text(verbatim: message.content)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.primaryForeground.swiftUI)
          .padding(DS.Spacing.sm)
          .background(DS.Color.primary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
          .textSelection(.enabled)
      }
    }
  }
}

private struct CoachAvatar: View {
  var body: some View {
    Image(systemName: "sparkles")
      .font(.caption)
      .foregroundStyle(DS.Color.brand.swiftUI)
      .frame(width: 28, height: 28)
      .background(DS.Color.secondary.swiftUI, in: Circle())
      .accessibilityHidden(true)
  }
}

/// `MarkdownLite` của RN: tiêu đề hai cỡ, gạch đầu dòng, danh sách số, chữ đậm.
private struct CoachMarkdown: View {
  let text: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(Array(MarkdownLite.blocks(text).enumerated()), id: \.offset) { _, block in
        switch block {
        case .gap:
          Color.clear.frame(height: 6)
        case .heading(let level, let runs):
          Self.line(runs).font(level == 1 ? DS.TextStyle.headline : DS.TextStyle.footnote.weight(.semibold))
        case .bullet(let runs):
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Text(verbatim: "•").foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Self.line(runs)
          }
        case .numbered(let n, let runs):
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Text(verbatim: "\(n).").monospacedDigit().foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Self.line(runs)
          }
        case .paragraph(let runs):
          Self.line(runs)
        }
      }
    }
    .font(DS.TextStyle.body)
    .foregroundStyle(DS.Color.foreground.swiftUI)
    .textSelection(.enabled)
  }

  private static func line(_ runs: [MarkdownLite.Run]) -> Text {
    var out = AttributedString()
    for run in runs {
      var piece = AttributedString(run.text)
      if run.bold { piece.inlinePresentationIntent = .stronglyEmphasized }
      out += piece
    }
    return Text(out)
  }
}

/// Lịch sử (`ai_conversations`, 20 cuộc gần nhất): chạm để mở, nút xoá cạnh
/// từng hàng (hai nút riêng như RN — VoiceOver với tới được cả hai).
private struct CoachHistorySheet: View {
  let chat: CoachChat
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(Text("coach.history"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("common.cancel") { dismiss() }
          }
        }
    }
    .presentationDetents([.medium, .large])
    .task { await chat.loadHistory() }
    .sensoryFeedback(.error, trigger: chat.deleteFailed) { _, failed in failed }
  }

  @ViewBuilder private var content: some View {
    switch chat.history {
    case .idle, .loading:
      DSLoadingView(message: String(localized: "coach.history"))
    case .failed:
      DSErrorView(message: String(localized: "coach.history.failed")) {
        Task { await chat.loadHistory() }
      }
    case .ready(let list) where list.isEmpty:
      ContentUnavailableView {
        Label("coach.history.empty", systemImage: "bubble.left.and.bubble.right")
      }
    case .ready(let list):
      List {
        if chat.deleteFailed {
          Text("coach.deleteFailed")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
        ForEach(list) { convo in
          row(convo)
        }
      }
      .listStyle(.plain)
    }
  }

  private func row(_ convo: Coach.Conversation) -> some View {
    let title = convo.title.isEmpty ? "—" : convo.title
    let selected = chat.conversationId == convo.id
    return HStack(spacing: DS.Spacing.sm) {
      Button {
        dismiss()
        Task { await chat.open(convo.id) }
      } label: {
        HStack {
          Text(verbatim: title)
            .font(DS.TextStyle.body.weight(selected ? .semibold : .regular))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
          Spacer()
          if let date = Self.date(convo.updatedAt) {
            Text(date, format: .dateTime.month(.abbreviated).day().locale(.app))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(chat.isLoading)
      .accessibilityLabel(Text(verbatim: title))
      .accessibilityAddTraits(selected ? .isSelected : [])
      Button {
        Task { await chat.delete(convo.id) }
      } label: {
        Image(systemName: "trash")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(chat.isLoading && selected)
      .accessibilityLabel(Text("coach.delete.a11y \(title)"))
    }
  }

  /// `updated_at` của Postgres (`2026-10-09T03:20:11.123456+00:00`).
  private static func date(_ raw: String?) -> Date? {
    guard let raw else { return nil }
    let frac = ISO8601DateFormatter()
    frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = frac.date(from: raw) { return d }
    return ISO8601DateFormatter().date(from: raw)
  }
}
