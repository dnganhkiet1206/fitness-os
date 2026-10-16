import ASCNDCore
import ASCNDDesignSystem
import SwiftUI
import UIKit

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
  /// Ô chat thu thành viên nhỏ khi người dùng vuốt xuống, như thanh phát của
  /// Apple Music (16/10, chủ dự án); vuốt lên hoặc chạm là bung ra.
  @State private var collapsed = false
  /// Chỉ tay người dùng mới thu / bung — cuộn tự động theo câu trả lời thì không.
  @State private var userScrolling = false
  /// Đang ở cuối cuộc trò chuyện — không thì hiện nút mũi tên kéo về cuối như ChatGPT.
  @State private var atBottom = true
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
      .onScrollPhaseChange { _, phase in
        userScrolling = phase == .interacting || phase == .decelerating
      }
      .onScrollGeometryChange(for: Bool.self) { g in
        // Chỉ hiện mũi tên khi đã cuộn lên xa (16/10, chủ dự án: "hiện sớm quá"):
        // hơn ~60% chiều cao màn, tối thiểu 320 pt.
        g.contentSize.height - (g.contentOffset.y + g.containerSize.height) < max(320, g.containerSize.height * 0.6)
      } action: { _, bottom in
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { atBottom = bottom }
      }
      // Nút mũi tên về cuối (16/10, chủ dự án: "như ChatGPT"), ngay trên ô chat.
      .overlay(alignment: .bottom) {
        if !atBottom, !chat.messages.isEmpty {
          Button {
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.45)) {
              proxy.scrollTo(Self.bottom, anchor: .bottom)
            }
          } label: {
            Image(systemName: "arrow.down")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(width: 38, height: 38)
              .glassComposer(radius: 19)
              .frame(width: 44, height: 44)
              .contentShape(Circle())
          }
          .buttonStyle(.plain)
          .padding(.bottom, 8)
          .transition(.scale(scale: 0.6).combined(with: .opacity))
          .accessibilityLabel(Text("coach.scrollbottom.a11y"))
        }
      }
      .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { old, new in
        guard userScrolling else { return }
        let delta = new - old
        if delta > 6, !collapsed {
          // Ô đang có con trỏ nhưng trống (vừa chạm mở rồi cuộn đi): thôi gõ và thu
          // lại. Đang gõ dở thì giữ nguyên — không giật mất chữ của người dùng.
          guard draft.isEmpty else { return }
          composing = false
          setCollapsed(true)
        } else if delta < -6, collapsed {
          setCollapsed(false)
        }
      }
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
    .ascndPage()
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      // "Cuộc trò chuyện mới" lên thanh trên như ChatGPT (16/10) — trước là một
      // viên giữa đầu cuộc trò chuyện, cuộn đi mất.
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          chat.newChat()
          draft = ""
        } label: {
          Image(systemName: "square.and.pencil")
            .frame(minWidth: 44, minHeight: 44)
        }
        .disabled(chat.isLoading || chat.messages.isEmpty)
        .accessibilityLabel(Text("coach.newChat"))
      }
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
      IntelligenceMark(size: 44)
      Text("coach.hello")
        .font(DS.TextStyle.largeTitle)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text("coach.intro")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      IntelligenceBadge(mark: false)
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

  /// Kiểu ChatGPT (16/10, chủ dự án): câu trả lời là chữ trải hết bề ngang, không
  /// bong bóng, không avatar lặp ở mỗi tin; câu của người dùng là viên xám bên phải.
  private var transcript: some View {
    LazyVStack(alignment: .leading, spacing: 28) {
      ForEach(chat.messages) { message in
        CoachMessageRow(
          message: message,
          streaming: chat.isLoading && message.id == chat.messages.last?.id && message.role == .assistant)
          .messageSendTransition(mine: message.role == .user)
      }
      if chat.isLoading, chat.messages.last?.role != .assistant {
        CoachThinking()
          .messageSendTransition(mine: false)
      }
      if let failure = chat.failure {
        Label(WeeklyReviewView.failureText(failure), systemImage: "exclamationmark.triangle")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Color.clear.frame(height: 1).id(Self.bottom)
    }
    // Tin vừa gửi bay lên như iMessage (`messageSendTransition`).
    .animation(reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.82), value: chat.messages.count)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: chat.isLoading)
    .padding(.horizontal, 20)
    .padding(.vertical, DS.Spacing.lg)
  }

  // MARK: - Ô soạn

  private var canSend: Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !chat.isLoading
  }

  /// Ô soạn nổi: một viên chứa ô chữ và nút gửi, như ô hỏi của ChatGPT; dưới là
  /// lời nhắc y tế nhỏ, mờ, căn giữa như các app AI hiện nay (16/10, chủ dự án) —
  /// thay vì một câu "gặp bác sĩ" cuối mỗi câu trả lời.
  private func setCollapsed(_ value: Bool) {
    withAnimation(reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.82)) { collapsed = value }
  }

  /// Viên thu gọn: ký hiệu + chữ gợi ý, chạm là bung ra và gõ được ngay.
  private var compactComposer: some View {
    Button {
      setCollapsed(false)
      composing = true
    } label: {
      HStack(spacing: 8) {
        IntelligenceMark(size: 16)
        Text(draft.isEmpty ? String(localized: "coach.placeholder") : draft)
          .font(.system(size: 15))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      .padding(.horizontal, 16)
      .frame(height: 40)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .glassComposer(radius: 20)
    .frame(maxWidth: 250)
    // iOS 26: thanh tab cũng thu gọn khi vuốt xuống (nút Hôm nay trái, Trợ lý
    // phải) — viên hạ xuống nằm giữa hai nút ấy trên cùng một hàng, như thanh
    // phát của Apple Music. Máy cũ không thu thanh tab: giữ chỗ cũ.
    .offset(y: Self.besideTabBar ? 57 : 0)
    .accessibilityLabel(Text("coach.placeholder"))
  }

  private static var besideTabBar: Bool {
    if #available(iOS 26, *) { true } else { false }
  }

  private var composer: some View {
    VStack(spacing: 6) {
      if collapsed {
        compactComposer
          .transition(.scale(scale: 0.85, anchor: .bottom).combined(with: .opacity))
      } else {
      HStack(alignment: .bottom, spacing: 6) {
        TextField(String(localized: "coach.placeholder"), text: $draft, axis: .vertical)
          .lineLimit(1...6)
          .focused($composing)
          .font(DS.TextStyle.body)
          .padding(.leading, 18)
          .padding(.vertical, 12)
          .frame(minHeight: 48)
        Button(action: submit) {
          Image(systemName: "arrow.up")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(width: 36, height: 36)
            .background(DS.Color.foreground.swiftUI.opacity(canSend ? 1 : 0.25), in: Circle())
            .frame(width: 44, height: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
        .padding(.trailing, 4)
        .accessibilityLabel(Text("coach.send.a11y"))
      }
      .glassComposer(radius: 26)
      .transition(.scale(scale: 0.95, anchor: .bottom).combined(with: .opacity))
      Text("coach.disclaimer")
        .font(.system(size: 11))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, DS.Spacing.lg)
        .transition(.opacity)
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.top, 14)
    .padding(.bottom, 6)
    // Nền mờ dần lên trên (16/10: lời nhắc không nền đè lên chữ khi cuộn): nội dung
    // trôi xuống dưới ô chat thì tan vào nền trang, như ChatGPT.
    .background(alignment: .bottom) {
      LinearGradient(
        stops: [
          .init(color: DS.Color.background.swiftUI.opacity(0), location: 0),
          .init(color: DS.Color.background.swiftUI.opacity(0.92), location: 0.35),
          .init(color: DS.Color.background.swiftUI, location: 1),
        ], startPoint: .top, endPoint: .bottom
      )
      .ignoresSafeArea(edges: .bottom)
      .allowsHitTesting(false)
    }
  }

  private func submit() {
    setCollapsed(false)
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
  /// `false`: hàng bám mép trái (thẻ AI Coach); `true`: căn giữa (chat trống).
  var centered = true
  let onPick: (String) -> Void

  var body: some View {
    // Viên xuống dòng tự do (15/10, audit: trước là cột dọc, mỗi viên một dòng,
    // mép phải lởm chởm).
    FlowRows(spacing: DS.Spacing.sm, centered: centered) {
      ForEach(suggestions) { s in
        Button {
          onPick(s.question(lang))
        } label: {
          Label(s.label(lang), systemImage: Self.symbol(s.glyph))
            .font(DS.TextStyle.footnote.weight(.medium))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(minHeight: 40)
            .background(DS.Color.card.swiftUI, in: Capsule())
            .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.10), lineWidth: 0.75) }
            .frame(minHeight: 44)
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

/// Một tin. Coach: khối tổng quan (nếu có) + chữ trải ngang + nút chép khi xong.
/// Người dùng: viên xám bên phải.
private struct CoachMessageRow: View {
  let message: Coach.Message
  /// Câu trả lời đang về từng mẩu — chưa hiện nút chép.
  let streaming: Bool
  @State private var copied = false
  /// Số ký tự đang hiện (`CoachReveal`): chữ nhả đều theo từng từ như ChatGPT
  /// thay vì nhảy theo cục mạng trả về. `nil` = hiện hết (tin cũ, lịch sử).
  @State private var shown: Int?
  /// Bản mới nhất của tin — `.task` giữ bản chụp của `message` lúc bắt đầu, nên
  /// vòng nhả chữ đọc từ đây.
  @State private var target = ""
  @State private var live = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var visible: String {
    guard let shown else { return message.content }
    return CoachReveal.prefix(message.content, shown)
  }

  var body: some View {
    switch message.role {
    case .assistant:
      assistant
        .onAppear {
          target = message.content
          live = streaming
          // Chỉ tin đang về mới nhả dần; tin đã xong hiện ngay.
          if streaming, !reduceMotion { shown = 0 }
        }
        .onChange(of: message.content) { _, new in target = new }
        .onChange(of: streaming) { _, now in live = now }
        .task(id: message.id) {
          guard shown != nil else { return }
          while !Task.isCancelled {
            let current = shown ?? 0
            if current < target.count {
              withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                shown = CoachReveal.step(shown: current, total: target)
              }
            } else if !live {
              shown = nil
              return
            }
            try? await Task.sleep(for: CoachReveal.tick)
          }
        }
    case .user:
      user
    }
  }

  /// Đang nhả chữ dở (chưa tới cuối tin hay tin còn về) — chưa hiện nút chép.
  private var revealing: Bool { streaming || shown != nil }

  @ViewBuilder private var assistant: some View {
    if revealing, CoachOverview.split(visible).text.isEmpty, CoachOverview.split(visible).overview == nil {
      // Chưa có chữ nào để hiện: ba chấm như iMessage thay vì khoảng trống.
      CoachThinking()
    } else {
      answer
    }
  }

  @ViewBuilder private var answer: some View {
      let parts = CoachOverview.split(visible)
      VStack(alignment: .leading, spacing: 14) {
        if let overview = parts.overview {
          CoachOverviewCard(overview: overview)
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
        if !parts.text.isEmpty {
          CoachMarkdown(text: parts.text, fadingTail: shown != nil)
        }
        if !revealing, !parts.text.isEmpty {
          Button {
            UIPasteboard.general.string = parts.text
            copied = true
          } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
              .font(.system(size: 14, weight: .medium))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(width: 32, height: 32)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("coach.copy.a11y"))
          .sensoryFeedback(.success, trigger: copied) { _, now in now }
          .task(id: copied) {
            guard copied else { return }
            try? await Task.sleep(for: .seconds(1.5))
            copied = false
          }
          .padding(.leading, -8)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var user: some View {
      HStack {
        Spacer(minLength: 56)
        // Bong bóng xanh có đuôi kiểu iMessage (16/10, chủ dự án).
        Text(verbatim: message.content)
          .messageBubble(mine: true)
          .textSelection(.enabled)
      }
  }
}

/// Đang nghĩ: ba chấm kiểu iMessage (16/10, chủ dự án) thay vòng quay.
private struct CoachThinking: View {
  var body: some View {
    TypingBubble()
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityLabel(Text("coach.thinking.a11y"))
  }
}

/// Khối tổng quan (16/10, chủ dự án: "dùng code để vẽ ra đơn giản như ChatGPT"):
/// hình học một màu, không mượn thẻ của app — mỗi chỉ số một thanh mảnh so với
/// mục tiêu, xu hướng nhiều ngày là hàng cột nhỏ; số thật do model chọn
/// (`CoachOverview`), app chỉ vẽ.
private struct CoachOverviewCard: View {
  let overview: CoachOverview

  private static let ink = DS.Color.foreground.swiftUI
  private static let track = DS.Color.foreground.swiftUI.opacity(0.08)

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let title = overview.title {
        Text(verbatim: title)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .textCase(.uppercase)
          .tracking(0.4)
      }
      ForEach(Array(overview.items.enumerated()), id: \.offset) { _, item in
        row(item)
      }
      if let trend = overview.trend {
        TrendBars(trend: trend)
      }
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .strokeBorder(Self.ink.opacity(0.07), lineWidth: 0.75)
    }
  }

  /// Nhãn trái, số phải (số đậm, mục tiêu nhạt), dưới là thanh mảnh.
  private func row(_ item: CoachOverview.Item) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: item.label)
          .font(.system(size: 15))
          .foregroundStyle(Self.ink)
        Spacer(minLength: 8)
        (Text(verbatim: item.valueText).font(.system(size: 15, weight: .semibold).monospacedDigit())
          + Text(verbatim: item.goalText.map { " / \($0)" } ?? "")
          .font(.system(size: 15).monospacedDigit())
          .foregroundColor(DS.Color.mutedForeground.swiftUI)
          + Text(verbatim: item.unit.isEmpty ? "" : " \(item.unit)")
          .font(.system(size: 13))
          .foregroundColor(DS.Color.mutedForeground.swiftUI))
          .foregroundStyle(Self.ink)
      }
      if let progress = item.progress {
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule().fill(Self.track)
            Capsule().fill(Self.ink)
              .frame(width: max(6, geo.size.width * progress))
          }
        }
        .frame(height: 6)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.spoken(item)))
  }

  static func spoken(_ item: CoachOverview.Item) -> String {
    var s = "\(item.label): \(item.valueText)"
    if let goal = item.goalText { s += " / \(goal)" }
    if !item.unit.isEmpty { s += " \(item.unit)" }
    return s
  }
}

/// Xu hướng: cột bo tròn một màu cao theo giá trị; cột cuối (gần nhất) đậm,
/// các cột trước nhạt; số của cột cuối ghi trên đầu.
private struct TrendBars: View {
  let trend: CoachOverview.Trend

  var body: some View {
    let top = max(trend.points.map(\.value).max() ?? 1, 1)
    VStack(alignment: .leading, spacing: 10) {
      if !trend.label.isEmpty {
        Text(verbatim: trend.label)
          .font(.system(size: 15))
          .foregroundStyle(DS.Color.foreground.swiftUI)
      }
      HStack(alignment: .bottom, spacing: 6) {
        ForEach(Array(trend.points.enumerated()), id: \.offset) { i, p in
          let last = i == trend.points.count - 1
          VStack(spacing: 6) {
            Text(verbatim: last ? CoachOverview.format(p.value) : " ")
              .font(.system(size: 11, weight: .semibold).monospacedDigit())
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1)
              .fixedSize()
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(DS.Color.foreground.swiftUI.opacity(last ? 1 : 0.22))
              .frame(height: max(4, 72 * p.value / top))
            Text(verbatim: p.label)
              .font(.system(size: 10))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: 112, alignment: .bottom)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.spoken(trend)))
  }

  static func spoken(_ t: CoachOverview.Trend) -> String {
    let unit = t.unit.isEmpty ? "" : " \(t.unit)"
    let pts = t.points.map { "\($0.label) \(CoachOverview.format($0.value))\(unit)" }.joined(separator: ", ")
    return t.label.isEmpty ? pts : "\(t.label): \(pts)"
  }
}

/// `MarkdownLite` của RN: tiêu đề hai cỡ, gạch đầu dòng, danh sách số, chữ đậm.
private struct CoachMarkdown: View {
  let text: String
  /// Đang nhả chữ: khối cuối có vệt mờ ở đuôi (`CoachReveal.fadeSteps`).
  var fadingTail = false

  var body: some View {
    // Nhịp đọc kiểu ChatGPT (16/10): đoạn thưa, tiêu đề đậm vừa, dòng giãn nhẹ.
    VStack(alignment: .leading, spacing: 8) {
      let blocks = MarkdownLite.blocks(text)
      ForEach(Array(blocks.enumerated()), id: \.offset) { i, block in
        let fade = fadingTail && i == blocks.count - 1
        Group {
        switch block {
        case .gap:
          Color.clear.frame(height: 4)
        case .heading(let level, let runs):
          Self.line(runs, fade: fade)
            .font(level == 1 ? .system(size: 20, weight: .bold) : .system(size: 17, weight: .semibold))
            .padding(.top, 6)
        case .bullet(let runs):
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Text(verbatim: "•").foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Self.line(runs, fade: fade)
          }
        case .numbered(let n, let runs):
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Text(verbatim: "\(n).").monospacedDigit().foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Self.line(runs, fade: fade)
          }
        case .paragraph(let runs) where Self.isRule(runs):
          // `---` giữa các mục (bố cục kiểu ChatGPT): một đường kẻ mảnh.
          Rectangle()
            .fill(DS.Color.foreground.swiftUI.opacity(0.1))
            .frame(height: 0.75)
            .padding(.vertical, 8)
        case .paragraph(let runs):
          if let note = Self.italicLine(runs) {
            // `*một dòng nghiêng*` (MarkdownLite không có nghiêng): chữ nhỏ, nhạt.
            Text(verbatim: note)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .padding(.top, 4)
          } else {
            Self.line(runs, fade: fade)
          }
        }
        }
        // Khối mới mờ dần vào khi chữ nhả tới (kiểu ChatGPT).
        .transition(.opacity)
      }
    }
    .font(DS.TextStyle.body)
    .lineSpacing(3)
    .foregroundStyle(DS.Color.foreground.swiftUI)
    .textSelection(.enabled)
  }

  private static func isRule(_ runs: [MarkdownLite.Run]) -> Bool {
    let raw = runs.map(\.text).joined().trimmingCharacters(in: .whitespaces)
    return raw.count >= 3 && raw.allSatisfy { $0 == "-" || $0 == "_" || $0 == "*" } && Set(raw).count == 1
  }

  /// Cả đoạn là `*chữ*` (một dấu sao mỗi đầu) → chữ không dấu sao.
  private static func italicLine(_ runs: [MarkdownLite.Run]) -> String? {
    let raw = runs.map(\.text).joined().trimmingCharacters(in: .whitespaces)
    guard raw.count > 2, raw.hasPrefix("*"), raw.hasSuffix("*"), !raw.hasPrefix("**") else { return nil }
    return String(raw.dropFirst().dropLast()).trimmingCharacters(in: .whitespaces)
  }

  private static func line(_ runs: [MarkdownLite.Run], fade: Bool = false) -> Text {
    var out = AttributedString()
    for run in runs {
      var piece = AttributedString(run.text)
      if run.bold { piece.inlinePresentationIntent = .stronglyEmphasized }
      out += piece
    }
    if fade {
      // Từ cuối nhạt nhất, lùi dần về đậm (đi từ cuối chuỗi ngược lên).
      var end = out.endIndex
      for step in CoachReveal.fadeSteps {
        guard end > out.startIndex else { break }
        let start = out.characters.index(end, offsetBy: -step.length, limitedBy: out.startIndex) ?? out.startIndex
        out[start..<end].foregroundColor = DS.Color.foreground.swiftUI.opacity(step.opacity)
        end = start
      }
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
        .ascndPage()
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
