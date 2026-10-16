import ASCNDCore
import Charts
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
  /// Số liệu hôm nay của Trợ lý — cho câu trả lời tự động (`CoachQuickReply`).
  var signal: AssistantSuggestions.Signal?
  /// Hôm nay đã ghi gì (`CoachLogPrompt`) — nút "Ghi …" và hỏi lại khi lệch.
  var logged: CoachLogPrompt.LoggedToday?
  /// Đọc lại số liệu hôm nay sau khi người dùng ghi từ trong chat.
  var onLogged: () async -> Void = {}

  @State private var draft = ""
  /// Màn ghi đang mở từ một nút trong chat.
  @State private var logSheet: CoachLogTarget?
  /// Lệch đã chọn xong (khoá: id tin + loại) — ẩn nút chọn.
  @State private var resolved: Set<String> = []
  /// Người dùng chọn số mới khác số đã ghi → hỏi có cập nhật nhật ký không.
  @State private var confirmUpdate: CoachLogPrompt.Conflict?
  @State private var waterAdded: Set<String> = []
  @Environment(NutritionBooks.self) private var nutrition: NutritionBooks?
  @Environment(AppServices.self) private var services
  @Environment(WorkoutFlow.self) private var flow
  @State private var showsHistory = false
  @FocusState private var composing: Bool
  /// Ô chat thu thành viên nhỏ khi người dùng vuốt xuống, như thanh phát của
  /// Apple Music (16/10, chủ dự án); vuốt lên hoặc chạm là bung ra.
  @State private var collapsed = false
  /// Chỉ tay người dùng mới thu / bung — cuộn tự động theo câu trả lời thì không.
  @State private var userScrolling = false
  /// Mốc để cộng dồn quãng vuốt: vuốt chậm chỉ dịch vài điểm mỗi nhịp, so từng
  /// nhịp thì không bao giờ vượt ngưỡng (16/10: viên không bung khi vuốt lên chậm
  /// trong khi thanh tab đã bung → viên đè lên thanh tab).
  @State private var scrollAnchor: CGFloat = 0
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
      // Tin xếp từ trên xuống (16/10, chủ dự án: không chừa khoảng trống phía trên
      // khi cuộc trò chuyện còn ngắn); mở cuộc dài hay có tin mới thì vẫn ở cuối.
      .defaultScrollAnchor(chat.messages.isEmpty ? .center : .top, for: .alignment)
      .defaultScrollAnchor(.bottom, for: .initialOffset)
      .defaultScrollAnchor(.bottom, for: .sizeChanges)
      .onScrollPhaseChange { _, phase in
        userScrolling = phase == .tracking || phase == .interacting || phase == .decelerating
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
        // Cuộn tự động (theo câu trả lời, nút mũi tên): dời mốc, không thu / bung.
        guard userScrolling else { scrollAnchor = new; return }
        let delta = new - scrollAnchor
        // Đổi hướng thì đặt lại mốc — chỉ quãng vuốt liên tục một chiều mới tính.
        if (delta > 0 && new < old) || (delta < 0 && new > old) { scrollAnchor = old }
        guard abs(new - scrollAnchor) > 24 else { return }
        scrollAnchor = new
        if delta > 0, !collapsed {
          // Ô đang có con trỏ nhưng trống (vừa chạm mở rồi cuộn đi): thôi gõ và thu
          // lại. Đang gõ dở thì giữ nguyên — không giật mất chữ của người dùng.
          guard draft.isEmpty else { return }
          composing = false
          setCollapsed(true)
        } else if delta < 0, collapsed {
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
    // Màn chat không có thanh tab, như ChatGPT / iMessage (16/10): viên thu gọn hạ
    // vào hàng tab bằng vị trí đoán thì đè lên thanh tab mỗi khi hai bên lệch nhịp
    // thu / bung — app không đọc được thanh tab đang thu hay mở.
    .toolbar(.hidden, for: .tabBar)
    .sheet(item: $logSheet, onDismiss: { Task { await onLogged() } }) { t in logScreen(t) }
    .alert(
      Text("coach.check.update.title"),
      isPresented: Binding(get: { confirmUpdate != nil }, set: { if !$0 { confirmUpdate = nil } }),
      presenting: confirmUpdate
    ) { c in
      Button(String(localized: "coach.check.update.confirm")) {
        switch c.kind {
        case .sleep: logSheet = .sleep(c.stated)
        case .weight: logSheet = .weight(c.stated)
        case .water: logSheet = .water
        case .workout, .meal: break
        }
      }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: { c in
      Text("coach.check.update.message \(CoachLogPrompt.display(c.kind, c.logged, lang: lang.rawValue)) \(CoachLogPrompt.display(c.kind, c.stated, lang: lang.rawValue))")
    }
    // Câu trả lời lưu vào lịch sử đã được đối chiếu với số thật của hôm nay.
    .onChange(of: signal, initial: true) { _, now in
      chat.sanitize = now.map { s in { CoachOverview.sanitize($0, against: s) } }
    }
    .navigationTitle(Text("coach.title"))
    .ascndPage()
    .navigationBarTitleDisplayMode(.inline)
    // Nội dung cuộn lên tan vào nền dưới thanh trên (16/10, chủ dự án: chữ chat
    // chèn sau tiêu đề trông rối): mép cuộn của iOS 26, nền đặc ở máy cũ.
    .modifier(TopEdgeFade())
    .toolbar {
      // Tiêu đề giữa thanh, có ký hiệu ASCND Intelligence (như ChatGPT) — thay chữ
      // inline bám sát nút quay lại.
      ToolbarItem(placement: .principal) {
        HStack(spacing: 6) {
          IntelligenceMark(size: 16)
          Text("coach.title")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
      }
      // Một nút gộp "Cuộc trò chuyện mới" + "Lịch sử" (16/10, chủ dự án) — một nút
      // mỗi bên nên tiêu đề nằm đúng giữa.
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          Button {
            chat.newChat()
            draft = ""
          } label: {
            Label("coach.newChat", systemImage: "square.and.pencil")
          }
          .disabled(chat.isLoading || chat.messages.isEmpty)
          Button {
            showsHistory = true
          } label: {
            Label("coach.history", systemImage: "clock.arrow.circlepath")
          }
        } label: {
          Image(systemName: "ellipsis")
            .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text("coach.menu.a11y"))
      }
    }
    .sheet(isPresented: $showsHistory) {
      CoachHistorySheet(chat: chat)
    }
    .sensoryFeedback(.selection, trigger: showsHistory)
  }

  private static let bottom = "coach.bottom"

  // MARK: - Trống

  /// Màn trống kiểu app Siri (16/10, chủ dự án: "bỏ hết mấy cái chữ, làm logo AI
  /// to lên và mờ"): chỉ một ký hiệu ASCND Intelligence lớn, mờ, nhịp tim chạy nhẹ.
  /// Gợi ý nằm sát trên ô chat (`starterCards`). VoiceOver vẫn đọc lời chào.
  private var hello: some View {
    IntelligenceOrb(size: 132)
      .opacity(0.16)
      .frame(maxWidth: .infinity)
      .containerRelativeFrame(.vertical, alignment: .center)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text("coach.hello"))
      .accessibilityHint(Text("coach.intro"))
  }

  /// Thẻ câu hỏi mẫu ngay trên ô chat, cuộn ngang như ChatGPT (16/10, chủ dự án):
  /// dòng đậm là chủ đề, dòng mờ là câu sẽ gửi.
  private var starterCards: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 8) {
        ForEach(suggestions) { s in
          Button {
            send(s.question(lang))
          } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: s.label(lang))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
              Text(verbatim: s.question(lang))
                .font(.system(size: 14))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .lineLimit(1)
            .frame(width: 210, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75)
            }
          }
          .buttonStyle(.plain)
          .disabled(chat.isLoading)
          .accessibilityLabel(Text(verbatim: s.question(lang)))
        }
      }
      .padding(.horizontal, DS.Spacing.md)
    }
    .scrollIndicators(.hidden)
    .padding(.horizontal, -DS.Spacing.md)
  }

  // MARK: - Cuộc trò chuyện

  /// Kiểu ChatGPT (16/10, chủ dự án): câu trả lời là chữ trải hết bề ngang, không
  /// bong bóng, không avatar lặp ở mỗi tin; câu của người dùng là viên xám bên phải.
  private var transcript: some View {
    LazyVStack(alignment: .leading, spacing: 28) {
      ForEach(chat.messages) { message in
        let streaming = chat.isLoading && message.id == chat.messages.last?.id && message.role == .assistant
        CoachMessageRow(
          message: message,
          streaming: streaming,
          // Chỉ tin của phiên này (id "local-…") mới đối chiếu với số hôm nay; tin
          // tải từ lịch sử có thể của ngày khác (đã được làm sạch lúc lưu).
          checkAgainst: message.id.hasPrefix("local-") ? signal : nil)
          .messageSendTransition(mine: message.role == .user)
        if message.role == .assistant, !streaming, let asked = question(before: message) {
          logActions(for: asked)
        }
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
      // Lời nhắc y tế ở cuối cuộc trò chuyện (16/10, chủ dự án): nhỏ, mờ, căn giữa —
      // trôi theo nội dung thay vì dính dưới ô chat (ở đó nó đè lên chữ khi cuộn).
      // Chỉ khi cuộc trò chuyện có câu hỏi về sức khoẻ (16/10, chủ dự án) — chào
      // hỏi, tra calo, hỏi bài tập thì không cần lời nhắc y tế.
      if !chat.isLoading, chat.messages.last?.role == .assistant,
        chat.messages.contains(where: {
          $0.role == .user ? Coach.isHealthTopic($0.content) : Coach.answerTouchesHealth($0.content)
        })
      {
        disclaimer.padding(.top, 4)
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

  private var disclaimer: some View {
    // Nhỏ và mờ hơn chữ phụ thường (16/10, chủ dự án) — nhắc nhẹ, không giành mắt.
    Text("coach.disclaimer")
      .font(.system(size: 10))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.7))
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, DS.Spacing.lg)
  }

  /// Ô soạn: MỘT viên kính duy nhất co giãn giữa hai dạng (16/10, chủ dự án: bản
  /// hai view thay nhau "giật, như hai phần bị ép chung"). Khung, độ bo và vị trí
  /// cùng chuyển trong một nhịp lò xo; chỉ nội dung bên trong mờ chuyển.
  ///
  /// Đầy đủ: ô chữ + nút gửi. Thu gọn (vuốt xuống, như thanh phát của Apple Music): viên nhỏ ký hiệu
  /// + chữ gợi ý ngay tại đáy màn.
  private var composer: some View {
    VStack(spacing: 10) {
      if chat.messages.isEmpty, !collapsed, !suggestions.isEmpty {
        starterCards
          .transition(.opacity)
      }
      ZStack(alignment: .leading) {
        if collapsed {
          HStack(spacing: 8) {
            IntelligenceMark(size: 16)
            Text(draft.isEmpty ? String(localized: "coach.placeholder") : draft)
              .font(.system(size: 15))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
          }
          .padding(.horizontal, 16)
          .frame(maxWidth: .infinity, alignment: .center)
          .transition(.opacity)
        } else {
          fullField
            .transition(.opacity)
        }
      }
      .frame(minHeight: collapsed ? 40 : 48)
      .frame(maxWidth: collapsed ? 250 : .infinity)
      .glassComposer(radius: collapsed ? 20 : 26)
      // Chỉ bắt chạm khi đang thu: lúc đầy đủ, chạm thuộc về ô chữ và nút gửi.
      .overlay {
        if collapsed {
          Color.clear
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .onTapGesture {
              setCollapsed(false)
              composing = true
            }
        }
      }
      .accessibilityAddTraits(collapsed ? .isButton : [])
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.top, 14)
    .padding(.bottom, 6)
    // Nền mờ dần lên trên: nội dung trôi xuống dưới ô chat thì tan vào nền trang.
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
      .opacity(collapsed ? 0 : 1)
    }
  }

  private var fullField: some View {
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
  }

  private func submit() {
    setCollapsed(false)
    let text = draft
    guard canSend else { return }
    draft = ""
    send(text)
  }

  private func send(_ text: String) {
    // Trả lời một câu hỏi lại "số nào đúng" bằng chữ: đọc số người dùng chọn.
    if let (key, c) = openConflict() {
      switch CoachLogPrompt.choice(text, for: c) {
      case .stated:
        resolved.insert(key)
        confirmUpdate = c
      case .logged: resolved.insert(key)
      case .unclear: break
      }
    }
    Self.ask(chat, text, lang: lang, signal: signal, logged: logged)
  }

  // MARK: - Ghi từ chat (16/10)

  /// Tin người dùng ngay trước một câu trả lời (chỉ tin của phiên này).
  private func question(before answer: Coach.Message) -> Coach.Message? {
    guard let i = chat.messages.firstIndex(where: { $0.id == answer.id }), i > 0 else { return nil }
    let q = chat.messages[i - 1]
    return q.role == .user && q.id.hasPrefix("local-") ? q : nil
  }

  /// Lệch còn chờ chọn ở lượt gần nhất.
  private func openConflict() -> (String, CoachLogPrompt.Conflict)? {
    guard let q = chat.messages.last(where: { $0.role == .user }) else { return nil }
    for c in chat.conflicts[q.id] ?? [] where !resolved.contains(q.id + c.kind.rawValue) {
      return (q.id + c.kind.rawValue, c)
    }
    return nil
  }

  private var hour: Int { Calendar.current.component(.hour, from: Date()) }

  @ViewBuilder private func logActions(for asked: Coach.Message) -> some View {
    let conflicts = (chat.conflicts[asked.id] ?? []).filter { !resolved.contains(asked.id + $0.kind.rawValue) }
    let suggestions = logged.map { CoachLogPrompt.analyze(asked.content, logged: $0, hour: hour).suggestions } ?? []
    if !conflicts.isEmpty || !suggestions.isEmpty {
      FlowRows(spacing: DS.Spacing.sm, centered: false) {
        ForEach(conflicts, id: \.kind) { c in
          chip(Text("coach.check.stated \(CoachLogPrompt.display(c.kind, c.stated, lang: lang.rawValue))"), primary: true) {
            resolved.insert(asked.id + c.kind.rawValue)
            send(Self.replyText(c.stated, c.kind, lang: lang))
            confirmUpdate = c
          }
          chip(Text("coach.check.logged \(CoachLogPrompt.display(c.kind, c.logged, lang: lang.rawValue))"), primary: false) {
            resolved.insert(asked.id + c.kind.rawValue)
            send(Self.replyText(c.logged, c.kind, lang: lang))
          }
        }
        ForEach(Array(suggestions.enumerated()), id: \.offset) { _, d in
          suggestionChip(d, key: asked.id)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder private func suggestionChip(_ d: CoachLogPrompt.Detected, key: String) -> some View {
    let v = d.value.map { CoachLogPrompt.display(d.kind, $0, lang: lang.rawValue) } ?? ""
    switch d.kind {
    case .sleep: chip(Text("coach.log.sleep \(v)"), primary: true) { logSheet = .sleep(d.value ?? 0) }
    case .weight: chip(Text("coach.log.weight \(v)"), primary: true) { logSheet = .weight(d.value ?? 0) }
    case .workout: chip(Text("coach.log.workout"), primary: true) { logSheet = .workout }
    case .meal: chip(Text("coach.log.meal"), primary: true) { logSheet = .meal(d.meal ?? MealLog.defaultMeal) }
    case .water:
      if waterAdded.contains(key) {
        Label("coach.log.saved", systemImage: "checkmark.circle.fill")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.readinessGreen.swiftUI)
          .frame(minHeight: 40)
      } else {
        // Lượng nước đã rõ — một chạm là lưu.
        chip(Text("coach.log.water \(v)"), primary: true) {
          Task {
            guard let water = nutrition?.water, let ml = d.value else { return }
            if (try? await water.add(amountMl: Int(ml), online: services.sync.online)) != nil {
              waterAdded.insert(key)
              await onLogged()
            }
          }
        }
      }
    }
  }

  private func chip(_ label: Text, primary: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      label
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(primary ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
        .padding(.horizontal, 14)
        .frame(minHeight: 40)
        .background(primary ? DS.Color.foreground.swiftUI : DS.Color.card.swiftUI, in: Capsule())
        .overlay { if !primary { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75) } }
        .frame(minHeight: 44)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  /// Câu gửi đi khi chạm một nút chọn số: "8 giờ mới đúng".
  static func replyText(_ v: Double, _ kind: CoachLogPrompt.Kind, lang: AppPreferences.Lang) -> String {
    String(localized: "coach.check.reply \(CoachLogPrompt.display(kind, v, lang: lang.rawValue))")
  }

  /// Màn ghi mở từ chat, điền sẵn số người dùng đã nói / đã chọn.
  @ViewBuilder private func logScreen(_ t: CoachLogTarget) -> some View {
    let userId = services.session.session?.userId ?? ""
    switch t {
    case .sleep(let m):
      LogSleepView(makeLogger: { services.makeSleepLogger(userId: userId) }, onDone: { logSheet = nil },
                   presetMinutes: Int(m))
    case .weight(let kg):
      LogWeightView(makeLogger: { services.makeWeightLogger(userId: userId) }, onDone: { logSheet = nil },
                    presetKg: kg)
    case .workout:
      ManualLogView(flow: flow)
    case .meal(let meal):
      LogMealView(userId: userId, date: nil, mealType: meal) { logSheet = nil }
    case .water:
      if let water = nutrition?.water { NavigationStack { WaterView(book: water) } }
    }
  }

  /// Một câu hỏi tới coach với ngày + múi giờ của máy lúc bấm — dùng chung
  /// cho ô soạn, chip trong chat và chip trên thẻ coach của tab Trợ lý.
  ///
  /// Câu gần như không cần AI (chào, cảm ơn, gõ nhầm, tra một số của hôm nay) được
  /// trả lời ngay bằng câu mẫu điền số thật, không lặp mẫu vừa dùng
  /// (`CoachQuickReply`, 16/10, chủ dự án). Mọi câu cần suy luận vẫn đi AI.
  static func ask(
    _ chat: CoachChat, _ text: String, lang: AppPreferences.Lang, signal: AssistantSuggestions.Signal? = nil,
    logged: CoachLogPrompt.LoggedToday? = nil
  ) {
    let code = lang.rawValue
    let now = Date()
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    // Lời kể khác số đã ghi → AI hỏi lại số nào đúng (16/10); không trả lời tự động.
    let hour = Calendar.current.component(.hour, from: now)
    let checks = logged.map { CoachLogPrompt.analyze(text, logged: $0, hour: hour).conflicts } ?? []
    if !checks.isEmpty {
      Task {
        await chat.send(text, lang: code, today: today, tzOffset: Coach.tzOffset(.current, at: now), checks: checks)
      }
      return
    }
    var memory = QuickReplyMemory.load()
    if let reply = CoachQuickReply.answer(text, signal: signal, lang: code, memory: &memory) {
      QuickReplyMemory.save(memory)
      Telemetry.capture(.coachQuickReply)
      Task { await chat.answerLocally(text, reply: reply) }
      return
    }
    Task { await chat.send(text, lang: code, today: today, tzOffset: Coach.tzOffset(.current, at: now)) }
  }
}

/// Mép trên của màn chat: nội dung cuộn dưới thanh trên tan vào nền.
private struct TopEdgeFade: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      content.scrollEdgeEffectStyle(.hard, for: .top)
    } else {
      content
        .toolbarBackground(DS.Color.background.swiftUI, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }
  }
}

/// Màn ghi mở từ một nút trong Koa Coach.
enum CoachLogTarget: Identifiable, Hashable {
  case sleep(Double), weight(Double), workout, meal(String), water
  var id: String {
    switch self {
    case .sleep(let m): "sleep\(m)"
    case .weight(let k): "weight\(k)"
    case .workout: "workout"
    case .meal(let m): "meal\(m)"
    case .water: "water"
    }
  }
}

/// Các mẫu câu trả lời tự động vừa dùng — lưu trên máy để hỏi lại (kể cả sau khi
/// mở lại app) không ra đúng câu cũ.
@MainActor
enum QuickReplyMemory {
  private static let key = "coach.quickReplyMemory"

  static func load() -> CoachQuickReply.Memory {
    guard let data = UserDefaults.standard.data(forKey: key),
      let m = try? JSONDecoder().decode(CoachQuickReply.Memory.self, from: data)
    else { return .init() }
    return m
  }

  static func save(_ m: CoachQuickReply.Memory) {
    if let data = try? JSONEncoder().encode(m) { UserDefaults.standard.set(data, forKey: key) }
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
  /// Số hôm nay để đối chiếu khối tổng quan (`CoachOverview.checked`).
  var checkAgainst: AssistantSuggestions.Signal?
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

  /// Khối tổng quan sau khi đối chiếu số thật (bỏ dòng sai, sửa mục tiêu); tin
  /// không đối chiếu được (lịch sử) thì giữ nguyên.
  private func checkedOverview(_ o: CoachOverview?) -> CoachOverview? {
    guard let o else { return nil }
    guard let s = checkAgainst else { return o }
    return o.checked(against: s)
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
      let raw = CoachOverview.split(visible)
      let parts = (overview: checkedOverview(raw.overview), text: raw.text)
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
        // Bong bóng có đuôi kiểu iMessage, màu xám như ChatGPT (16/10, chủ dự án:
        // "ô chat không dùng màu xanh mà làm màu xám"). Nhắn tin giữa người vẫn xanh.
        Text(verbatim: message.content)
          .messageBubble(mine: true, fill: DS.Color.foreground.swiftUI.opacity(0.07))
          .textSelection(.enabled)
      }
  }
}

/// Koa đang nghĩ: nhịp tim chạy qua ký hiệu ASCND Intelligence (16/10, chủ dự án
/// chọn, màu Siri iOS 27). Ba chấm iMessage giữ cho tin nhắn giữa người với người.
private struct CoachThinking: View {
  var body: some View {
    HStack(spacing: 12) {
      IntelligenceOrb(size: 40)
      Text("coach.thinking")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
      .padding(.vertical, 4)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text("coach.thinking.a11y"))
  }
}

/// Khối tổng quan (16/10, chủ dự án: "dùng code để vẽ ra đơn giản như ChatGPT"):
/// hình học một màu, không mượn thẻ của app; số thật do model chọn
/// (`CoachOverview`, đã đối chiếu), app chỉ vẽ.
///
/// Một chỉ số → thẻ "hero" kiểu Apple Health: biểu tượng + nhãn, số lớn, thanh
/// mục tiêu và phần trăm (chủ dự án: thẻ một dòng "Giấc ngủ … 8 giờ" quá đơn
/// điệu). 2–4 chỉ số → lưới ô hai cột. Xu hướng nhiều ngày: hàng cột nhỏ.
private struct CoachOverviewCard: View {
  let overview: CoachOverview

  static let ink = DS.Color.foreground.swiftUI
  static let track = DS.Color.foreground.swiftUI.opacity(0.08)
  static let muted = DS.Color.mutedForeground.swiftUI

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if let title = overview.title {
        Text(verbatim: title)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(Self.muted)
          .textCase(.uppercase)
          .tracking(0.5)
      }
      if overview.items.count == 1, let item = overview.items.first {
        hero(item)
      } else if !overview.items.isEmpty {
        // Số ô lẻ: ô cuối trải hết bề ngang thay vì đứng một mình cạnh chỗ trống.
        let items = overview.items
        let paired = items.count.isMultiple(of: 2) ? items : Array(items.dropLast())
        VStack(spacing: 10) {
          if !paired.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
              ForEach(Array(paired.enumerated()), id: \.offset) { _, item in tile(item) }
            }
          }
          if !items.count.isMultiple(of: 2), let last = items.last { tile(last) }
        }
      }
      if let gauge = overview.gauge { ZoneGauge(gauge: gauge) }
      if let split = overview.split { SplitBar(split: split) }
      if let trend = overview.trend { TrendChart(trend: trend) }
      if !overview.steps.isEmpty { StepList(steps: overview.steps) }
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .strokeBorder(Self.ink.opacity(0.07), lineWidth: 0.75)
    }
  }

  // MARK: Một chỉ số

  private func hero(_ item: CoachOverview.Item) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      label(item, size: 14)
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(verbatim: Self.number(item.value))
          .font(.system(size: 44, weight: .bold, design: .rounded).monospacedDigit())
          .foregroundStyle(Self.ink)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        if !item.unit.isEmpty {
          Text(verbatim: item.unit)
            .font(.system(size: 18, weight: .semibold, design: .rounded))
            .foregroundStyle(Self.muted)
        }
        Spacer(minLength: 0)
        if let p = item.progress {
          Text(verbatim: "\(Int((p * 100).rounded()))%")
            .font(.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit())
            .foregroundStyle(Self.muted)
        }
      }
      if let p = item.progress, let goal = item.goal.map(Self.number) {
        VStack(alignment: .leading, spacing: 6) {
          bar(p, height: 8)
          Text("coach.overview.goal \(goal + (item.unit.isEmpty ? "" : " \(item.unit)"))")
            .font(.system(size: 12))
            .foregroundStyle(Self.muted)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.spoken(item)))
  }

  // MARK: Nhiều chỉ số

  private func tile(_ item: CoachOverview.Item) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      label(item, size: 12)
      HStack(alignment: .firstTextBaseline, spacing: 3) {
        Text(verbatim: Self.number(item.value))
          .font(.system(size: 24, weight: .bold, design: .rounded).monospacedDigit())
          .foregroundStyle(Self.ink)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        if !item.unit.isEmpty {
          Text(verbatim: item.unit)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(Self.muted)
        }
      }
      if let p = item.progress {
        bar(p, height: 5)
        if let goal = item.goal.map(Self.number) {
          Text(verbatim: "/ \(goal)")
            .font(.system(size: 11).monospacedDigit())
            .foregroundStyle(Self.muted)
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Self.ink.opacity(0.035), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.spoken(item)))
  }

  // MARK: Phần chung

  private func label(_ item: CoachOverview.Item, size: CGFloat) -> some View {
    HStack(spacing: 6) {
      Image(systemName: Self.symbol(item.tone))
        .font(.system(size: size - 1, weight: .semibold))
        .foregroundStyle(Self.ink)
        .frame(width: size + 12, height: size + 12)
        .background(Self.ink.opacity(0.07), in: Circle())
      Text(verbatim: item.label)
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(Self.muted)
        .lineLimit(1)
    }
  }

  private func bar(_ progress: Double, height: CGFloat) -> some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(Self.track)
        Capsule().fill(Self.ink).frame(width: max(height, geo.size.width * progress))
      }
    }
    .frame(height: height)
  }

  static func symbol(_ tone: CoachOverview.Tone) -> String {
    switch tone {
    case .readiness: "gauge.with.dots.needle.67percent"
    case .sleep: "moon.fill"
    case .meal: "flame.fill"
    case .protein: "fork.knife"
    case .water: "drop.fill"
    case .steps: "figure.walk"
    case .workout: "dumbbell.fill"
    case .other: "chart.bar.fill"
    }
  }

  static func spoken(_ item: CoachOverview.Item) -> String {
    var s = "\(item.label): \(number(item.value))"
    if !item.unit.isEmpty { s += " \(item.unit)" }
    if let goal = item.goal.map(number) { s += " / \(goal)" }
    return s
  }

  /// Số hiển thị theo ngôn ngữ app, có dấu phân cách hàng nghìn (2.508 / 2,508);
  /// dưới 100 giữ một chữ số thập phân khi cần (7,5 giờ).
  static func number(_ v: Double) -> String {
    let digits = v < 100 && v.rounded() != v ? 1 : 0
    return v.formatted(.number.grouping(.automatic).precision(.fractionLength(digits)).locale(.app))
  }
}

/// Xu hướng nhiều ngày — Swift Charts (16/10, chủ dự án: "Apple style"): cột bo
/// tròn một màu, cột gần nhất đậm, đường trung bình đứt nét có nhãn.
private struct TrendChart: View {
  let trend: CoachOverview.Trend

  private var average: Double { trend.points.map(\.value).reduce(0, +) / Double(max(trend.points.count, 1)) }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        if !trend.label.isEmpty {
          Text(verbatim: trend.label)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(CoachOverviewCard.muted)
        }
        Spacer(minLength: 8)
        Text("coach.overview.avg \(CoachOverviewCard.number(average) + (trend.unit.isEmpty ? "" : " \(trend.unit)"))")
          .font(.system(size: 12, weight: .medium).monospacedDigit())
          .foregroundStyle(CoachOverviewCard.muted)
      }
      Chart {
        ForEach(Array(trend.points.enumerated()), id: \.offset) { i, p in
          BarMark(x: .value("day", "\(i)|\(p.label)"), y: .value("value", p.value), width: .ratio(0.55))
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            .foregroundStyle(CoachOverviewCard.ink.opacity(i == trend.points.count - 1 ? 1 : 0.22))
            .annotation(position: .top, spacing: 4) {
              if i == trend.points.count - 1 {
                Text(verbatim: CoachOverviewCard.number(p.value))
                  .font(.system(size: 11, weight: .semibold).monospacedDigit())
                  .foregroundStyle(CoachOverviewCard.ink)
              }
            }
        }
        RuleMark(y: .value("avg", average))
          .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
          .foregroundStyle(CoachOverviewCard.muted.opacity(0.7))
      }
      .chartXAxis {
        AxisMarks { v in
          AxisValueLabel {
            if let key = v.as(String.self) {
              Text(verbatim: String(key.split(separator: "|").last ?? ""))
                .font(.system(size: 10))
                .foregroundStyle(CoachOverviewCard.muted)
            }
          }
        }
      }
      .chartYAxis(.hidden)
      .frame(height: 120)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.spoken(trend)))
  }

  static func spoken(_ t: CoachOverview.Trend) -> String {
    let unit = t.unit.isEmpty ? "" : " \(t.unit)"
    let pts = t.points.map { "\($0.label) \(CoachOverviewCard.number($0.value))\(unit)" }.joined(separator: ", ")
    return t.label.isEmpty ? pts : "\(t.label): \(pts)"
  }
}

/// Đồng hồ vùng (16/10, chủ dự án: "chưa hiểu cách đồng hồ hiện"): tên + vùng
/// đang đứng, một dòng giải thích chỉ số, số lớn, thanh phủ kín dải với vùng tô
/// theo NGHĨA (xanh an toàn, vàng cần chú ý, đỏ rủi ro, xám ngoài vùng), số mốc
/// dưới thanh, chú thích có tên cho cả đoạn trống.
private struct ZoneGauge: View {
  let gauge: CoachOverview.Gauge
  @Environment(\.locale) private var locale

  static func color(_ tone: CoachOverview.Gauge.Tone) -> Color {
    switch tone {
    case .good: DS.Color.readinessGreen.swiftUI
    case .caution: DS.Color.readinessYellow.swiftUI
    case .risk: DS.Color.readinessRed.swiftUI
    case .neutral: CoachOverviewCard.ink.opacity(0.35)
    }
  }

  /// Tên hiển thị của một đoạn: tên model đưa, hoặc tên app đặt cho đoạn trống.
  private func name(_ z: CoachOverview.Gauge.Zone, isFirst: Bool) -> String? {
    if !z.label.isEmpty { return z.label }
    switch z.tone {
    case .caution: return String(localized: "coach.gauge.caution")
    case .neutral where isFirst: return String(localized: "coach.gauge.low")
    default: return nil
    }
  }

  private var note: String {
    if !gauge.note.isEmpty { return gauge.note }
    return CoachQuickReply.fold(gauge.label).contains("acwr") ? String(localized: "coach.gauge.acwr.note") : ""
  }

  private func x(_ v: Double, _ w: CGFloat) -> CGFloat {
    CGFloat((v - gauge.min) / (gauge.max - gauge.min)) * w
  }

  var body: some View {
    let segments = gauge.segments
    let current = gauge.current
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(verbatim: gauge.label)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(CoachOverviewCard.ink)
        Spacer(minLength: 8)
        if let c = current, let n = name(c, isFirst: c.from == gauge.min) {
          Text(verbatim: n)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(c.tone == .neutral ? CoachOverviewCard.ink : Self.color(c.tone))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Self.color(c.tone).opacity(0.14), in: Capsule())
        }
      }
      if !note.isEmpty {
        Text(verbatim: note)
          .font(.system(size: 12))
          .foregroundStyle(CoachOverviewCard.muted)
          .padding(.top, -6)
      }
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(verbatim: Self.precise(gauge.value))
          .font(.system(size: 40, weight: .bold, design: .rounded).monospacedDigit())
          .foregroundStyle(CoachOverviewCard.ink)
        if !gauge.unit.isEmpty {
          Text(verbatim: gauge.unit)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(CoachOverviewCard.muted)
        }
      }
      // Thanh: mỗi đoạn một màu theo nghĩa; đoạn đang đứng đậm, còn lại nhạt.
      GeometryReader { geo in
        let w = geo.size.width
        ZStack(alignment: .leading) {
          HStack(spacing: 2) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, z in
              Rectangle()
                .fill(Self.color(z.tone).opacity(z == current ? 0.95 : 0.32))
                .frame(width: max(2, x(z.to, w) - x(z.from, w) - 2))
            }
          }
          .frame(height: 10)
          .clipShape(Capsule())
          Circle()
            .fill(DS.Color.card.swiftUI)
            .overlay { Circle().strokeBorder(CoachOverviewCard.ink, lineWidth: 3) }
            .frame(width: 20, height: 20)
            .offset(x: min(max(0, x(gauge.value, w) - 10), w - 20))
        }
        .frame(height: 20)
      }
      .frame(height: 20)
      // Số mốc dưới thanh: ranh giới các đoạn (bỏ mốc quá sát nhau).
      GeometryReader { geo in
        let w = geo.size.width
        ZStack(alignment: .topLeading) {
          ForEach(Array(Self.ticks(segments, w: w, x: x).enumerated()), id: \.offset) { _, v in
            Text(verbatim: Self.precise(v))
              .font(.system(size: 10).monospacedDigit())
              .foregroundStyle(CoachOverviewCard.muted)
              .fixedSize()
              .frame(width: 36)
              .offset(x: min(max(-6, x(v, w) - 18), w - 30))
          }
        }
      }
      .frame(height: 12)
      // Chú thích: chấm màu + tên + dải số, đủ mọi đoạn có tên.
      FlowRows(spacing: 12, centered: false) {
        ForEach(Array(segments.enumerated()), id: \.offset) { i, z in
          if let n = name(z, isFirst: i == 0) {
            HStack(spacing: 5) {
              Circle().fill(Self.color(z.tone)).frame(width: 8, height: 8)
              Text(verbatim: "\(n) \(Self.precise(z.from))–\(Self.precise(z.to))")
                .font(.system(size: 11, weight: z == current ? .semibold : .regular))
                .foregroundStyle(z == current ? CoachOverviewCard.ink : CoachOverviewCard.muted)
            }
          }
        }
      }
      .padding(.top, 2)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.spoken(gauge, zone: current.flatMap { name($0, isFirst: $0.from == gauge.min) })))
  }

  /// Mốc: điểm đầu, ranh giới các đoạn, điểm cuối — bỏ mốc cách mốc trước < 26 pt.
  static func ticks(_ segs: [CoachOverview.Gauge.Zone], w: CGFloat, x: (Double, CGFloat) -> CGFloat) -> [Double] {
    var values = segs.map(\.from)
    if let last = segs.last { values.append(last.to) }
    var out: [Double] = []
    for v in values where out.last.map({ x(v, w) - x($0, w) >= 26 }) ?? true { out.append(v) }
    return out
  }

  static func spoken(_ g: CoachOverview.Gauge, zone: String?) -> String {
    "\(g.label): \(precise(g.value)) \(g.unit) \(zone ?? "")"
  }

  /// Tỉ số như ACWR cần hai chữ số thập phân (3,43 — không phải 3,4).
  static func precise(_ v: Double) -> String {
    let digits = v.rounded() == v ? 0 : (v < 10 ? 2 : 1)
    return v.formatted(.number.grouping(.automatic).precision(.fractionLength(0...digits)).locale(.app))
  }
}

/// Chia phần: một thanh xếp chồng, mỗi phần một sắc mực, chú thích kèm số và %.
private struct SplitBar: View {
  let split: CoachOverview.Split

  private var total: Double { split.parts.map(\.value).reduce(0, +) }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      if !split.label.isEmpty {
        Text(verbatim: split.label)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(CoachOverviewCard.muted)
      }
      GeometryReader { geo in
        HStack(spacing: 3) {
          ForEach(Array(split.parts.enumerated()), id: \.offset) { i, p in
            RoundedRectangle(cornerRadius: 5, style: .continuous)
              .fill(Self.shade(i))
              .frame(width: width(p.value, in: geo.size.width))
          }
        }
      }
      .frame(height: 14)
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(split.parts.enumerated()), id: \.offset) { i, p in
          HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 3).fill(Self.shade(i)).frame(width: 10, height: 10)
            Text(verbatim: p.label)
              .font(.system(size: 14))
              .foregroundStyle(CoachOverviewCard.ink)
            Spacer(minLength: 8)
            Text(verbatim: CoachOverviewCard.number(p.value) + (split.unit.isEmpty ? "" : " \(split.unit)"))
              .font(.system(size: 14, weight: .semibold).monospacedDigit())
              .foregroundStyle(CoachOverviewCard.ink)
            Text(verbatim: "\(Int((p.value / total * 100).rounded()))%")
              .font(.system(size: 12).monospacedDigit())
              .foregroundStyle(CoachOverviewCard.muted)
              .frame(width: 36, alignment: .trailing)
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  /// Bề rộng một phần: tỉ lệ trên phần bề ngang còn lại sau các khe 3 pt.
  private func width(_ value: Double, in total: CGFloat) -> CGFloat {
    let gaps: CGFloat = CGFloat(split.parts.count - 1) * 3
    let share: CGFloat = CGFloat(value / self.total)
    return max(6, (total - gaps) * share)
  }

  /// Sắc mực đậm → nhạt theo thứ tự phần (một màu, như phần còn lại của thẻ).
  static func shade(_ i: Int) -> Color {
    CoachOverviewCard.ink.opacity([1, 0.55, 0.3, 0.18, 0.1][min(i, 4)])
  }
}

/// Các bước: số tròn nối bằng một đường dọc mảnh (timeline), tiêu đề đậm + mô tả.
private struct StepList: View {
  let steps: [CoachOverview.Step]

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
        HStack(alignment: .top, spacing: 12) {
          VStack(spacing: 0) {
            Text(verbatim: "\(i + 1)")
              .font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(DS.Color.background.swiftUI)
              .frame(width: 24, height: 24)
              .background(CoachOverviewCard.ink, in: Circle())
            if i < steps.count - 1 {
              Rectangle().fill(CoachOverviewCard.ink.opacity(0.15)).frame(width: 1.5).frame(maxHeight: .infinity)
            }
          }
          VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: step.title)
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(CoachOverviewCard.ink)
            if !step.detail.isEmpty {
              Text(verbatim: step.detail)
                .font(.system(size: 13))
                .foregroundStyle(CoachOverviewCard.muted)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(.bottom, i < steps.count - 1 ? 16 : 0)
        }
        .accessibilityElement(children: .combine)
      }
    }
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
        case .paragraph(let runs) where Self.isRule(runs) && (i == 0 || i == blocks.count - 1):
          // Đường kẻ ở đầu / cuối không ngăn cách gì (model hay để thừa một `---`).
          EmptyView()
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
