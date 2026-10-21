import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// MARK: - Nhắn tin (15/10, chủ dự án duyệt mock: hộp thư + hội thoại)
//
// Premium tối giản: tiêu đề lớn, hàng hộp thư thoáng; vòng hồng quanh avatar khi
// người ấy đang tập; tin của mình đen đặc, của người kia trắng viền mảnh; buổi tập
// gửi vào hội thoại là "bảng điểm" thu nhỏ như thẻ bài. Server chưa có — chỉ chạy
// khi `AppServices.makeDirectMessages()` có nguồn (bản Debug, `ASCND_FAKE_DM=1`).

/// Avatar có vòng hồng khi đang tập.
struct DMAvatar: View {
  let author: CommunityFeed.Author
  var training = false
  var size: CGFloat = 46

  var body: some View {
    // Cùng khung `size` dù có vòng hay không — cột tên không lệch.
    MascotAvatar(mascotId: author.mascotId, size: training ? size - 7 : size)
      .frame(width: size, height: size)
      .overlay {
        if training {
          Circle().strokeBorder(DS.Color.metricRose.swiftUI, lineWidth: 2)
        }
      }
  }
}

enum DMText {
  static func ago(_ t: EpochMillis) -> String {
    PostHeaderView.agoText(ISO8601DateFormatter().string(from: t.date))
  }

  /// Dòng xem trước trong hộp thư.
  static func preview(_ t: DirectMessages.Thread) -> String {
    t.lastFromMe ? String(localized: "dm.you \(t.lastText)") : t.lastText
  }

  static func workoutLine(_ w: DirectMessages.SharedWorkout) -> String {
    var parts = ["\(w.exerciseCount) \(String(localized: "community.stat.exercises"))"]
    if let m = w.minutes { parts.append("\(m) \(String(localized: "community.stat.minutes"))") }
    return parts.joined(separator: " · ")
  }
}

// MARK: Hộp thư

struct MessagesInboxView: View {
  let book: DMInboxBook
  @State private var query = ""
  @State private var open: DirectMessages.Thread?
  @State private var showsRequests = false

  var body: some View {
    let split = DirectMessages.split(book.threads)
    let main = DirectMessages.filter(split.main, query: query)
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        Text("dm.title")
          .font(.largeTitle.bold())
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
          .padding(.bottom, DS.Spacing.sm)
        if book.isSample { DemoNote() }
        searchField.padding(.vertical, DS.Spacing.sm)
        switch book.phase {
        case .loading:
          DSLoadingView().frame(minHeight: 240)
        case .failed:
          DSErrorView(message: String(localized: "dm.failed")) { Task { await book.load() } }
        case .ready:
          if !split.requests.isEmpty, query.isEmpty {
            Button {
              showsRequests = true
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "tray")
                  .font(.system(size: 18, weight: .semibold))
                  .frame(width: 46, height: 46)
                  .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                  Text("dm.requests").font(.system(size: 16, weight: .semibold))
                  Text("dm.requests.sub \(split.requests.count)")
                    .font(.system(size: 13)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .padding(.vertical, 10)
              .contentShape(Rectangle())
            }
            .buttonStyle(TodayPressStyle())
          }
          if main.isEmpty {
            DSEmptyState(
              systemImage: "bubble.left.and.bubble.right", title: String(localized: "dm.empty.title"),
              message: String(localized: "dm.empty.body"))
          } else {
            ForEach(main) { t in row(t) }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .background { TodayAmbient(accent: nil) }
    .statusBarScrim()
    .navigationTitle(Text(verbatim: ""))
    .navigationBarTitleDisplayMode(.inline)
    .task { if book.phase == .loading { await book.load() } }
    .refreshable { await book.load() }
    .navigationDestination(item: $open) { t in ConversationScreen(inbox: book, thread: t) }
    .navigationDestination(isPresented: $showsRequests) { RequestsView(book: book) }
  }

  private var searchField: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").foregroundStyle(DS.Color.mutedForeground.swiftUI)
      TextField(String(localized: "dm.search"), text: $query)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
    }
    .padding(.horizontal, 14)
    .frame(height: 44)
    .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Capsule())
  }

  private func row(_ t: DirectMessages.Thread) -> some View {
    Button {
      open = t
    } label: {
      ThreadRow(thread: t)
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: "\(t.other.displayName), \(DMText.preview(t))"))
  }
}

/// Một hàng hộp thư.
struct ThreadRow: View {
  let thread: DirectMessages.Thread

  var body: some View {
    let t = thread
    HStack(spacing: 12) {
      DMAvatar(author: t.other, training: t.training != nil, size: 50)
      VStack(alignment: .leading, spacing: 3) {
        HStack {
          Text(verbatim: t.other.displayName)
            .font(.system(size: 16, weight: t.unread ? .bold : .semibold))
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(verbatim: DMText.ago(t.lastAt))
            .font(.system(size: 13))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        HStack(spacing: 6) {
          Text(verbatim: DMText.preview(t))
            .font(.system(size: 14, weight: t.unread ? .semibold : .regular))
            .foregroundStyle(t.unread ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
          Spacer(minLength: 0)
          if t.unread {
            Circle().fill(DS.Color.foreground.swiftUI).frame(width: 9, height: 9)
              .accessibilityLabel(Text("dm.unread"))
          }
        }
      }
    }
    .foregroundStyle(DS.Color.foreground.swiftUI)
    .padding(.vertical, 10)
    .contentShape(Rectangle())
    .overlay(alignment: .bottom) {
      Rectangle().fill(DS.Color.foreground.swiftUI.opacity(0.07)).frame(height: 0.5).padding(.leading, 62)
    }
  }
}

/// Tin chờ: người chưa được mình theo dõi nhắn trước.
private struct RequestsView: View {
  let book: DMInboxBook
  @State private var open: DirectMessages.Thread?

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        Text("dm.requests").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
        Text("dm.requests.explain")
          .font(.system(size: 14)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.vertical, DS.Spacing.sm)
        ForEach(DirectMessages.split(book.threads).requests) { t in
          Button { open = t } label: { ThreadRow(thread: t) }
            .buttonStyle(TodayPressStyle())
            .accessibilityLabel(Text(verbatim: "\(t.other.displayName), \(DMText.preview(t))"))
        }
      }
      .padding(DS.Spacing.md)
    }
    .background { TodayAmbient(accent: nil) }
    .statusBarScrim()
    .navigationDestination(item: $open) { t in ConversationScreen(inbox: book, thread: t) }
  }
}

/// Ghi chú "dữ liệu mẫu" — nguồn hiện tại là bản thử, không phải server.
private struct DemoNote: View {
  var body: some View {
    Label(String(localized: "dm.demo"), systemImage: "flask")
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.horizontal, 10)
      .frame(height: 26)
      .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Capsule())
  }
}

// MARK: Hội thoại

/// Giữ MỘT sổ hội thoại cho suốt màn (dựng lại mỗi lần hộp thư đổi thì màn tải mãi).
struct ConversationScreen: View {
  @State private var book: DMThreadBook

  init(inbox: DMInboxBook, thread: DirectMessages.Thread) {
    _book = State(initialValue: inbox.thread(thread))
  }

  // Ô nhắn ở đáy — không để dải Ghi nhanh chồng lên; không thanh tab, như
  // iMessage và Koa Coach (16/10).
  var body: some View {
    ConversationView(book: book)
      .hidesQuickLog()
      .toolbar(.hidden, for: .tabBar)
  }
}

struct ConversationView: View {
  let book: DMThreadBook
  @Environment(WorkoutFlow.self) private var flow
  @Environment(\.weightUnit) private var unit
  @State private var draft = ""
  @FocusState private var typing: Bool
  @State private var sent = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let rows = book.rows(timeZone: .current)
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 4) {
          if book.thread.isRequest {
            Text("dm.request.banner \(book.thread.other.displayName)")
              .font(.system(size: 13))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .multilineTextAlignment(.center)
              .padding(12)
              .frame(maxWidth: .infinity)
              .background(DS.Color.foreground.swiftUI.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
              .padding(.bottom, 8)
          }
          if book.phase == .loading { ProgressView().frame(minHeight: 120) }
          ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
            rowView(r, tail: Self.endsGroup(rows, i)).id(r.id)
          }
          Color.clear.frame(height: 1).id("bottom")
        }
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, DS.Spacing.sm)
        // Tin vừa gửi bay lên như iMessage (`messageSendTransition`).
        .animation(reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.82), value: book.messages.count)
      }
      .scrollDismissesKeyboard(.interactively)
      .defaultScrollAnchor(.bottom)
      .onChange(of: book.messages.count) { _, _ in
        withAnimation(.snappy) { proxy.scrollTo("bottom", anchor: .bottom) }
      }
    }
    .safeAreaInset(edge: .bottom) { composer }
    .background(DS.Color.background.swiftUI)
    .toolbar {
      ToolbarItem(placement: .principal) {
        HStack(spacing: 8) {
          DMAvatar(author: book.thread.other, training: book.thread.training != nil, size: 30)
          VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: book.thread.other.displayName).font(.system(size: 15, weight: .semibold))
            if let tr = book.thread.training {
              Text("dm.training \(tr)").font(.system(size: 11, weight: .medium))
                .foregroundStyle(DS.Color.metricRose.swiftUI)
            }
          }
        }
        .accessibilityElement(children: .combine)
      }
    }
    .navigationBarTitleDisplayMode(.inline)
    .task { if book.phase == .loading { await book.load() } }
    .sensoryFeedback(.impact(weight: .light), trigger: sent)
  }

  /// Tin cuối của một cụm cùng người gửi → có đuôi (như iMessage).
  static func endsGroup(_ rows: [DirectMessages.Row], _ i: Int) -> Bool {
    guard case .message(_, let mine, _) = rows[i] else { return false }
    guard i + 1 < rows.count, case .message(_, let nextMine, _) = rows[i + 1] else { return true }
    return nextMine != mine
  }

  @ViewBuilder private func rowView(_ r: DirectMessages.Row, tail: Bool) -> some View {
    switch r {
    case .day(let d):
      Text(verbatim: Self.dayText(d))
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.vertical, 10)
    case .message(let m, let mine, let seen):
      VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
        HStack {
          if mine { Spacer(minLength: 60) }
          bubble(m, mine: mine, tail: tail)
          if !mine { Spacer(minLength: 60) }
        }
        if seen {
          Text("dm.seen").font(.system(size: 11)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
      .padding(.bottom, tail ? 6 : 0)
      .messageSendTransition(mine: mine)
    }
  }

  @ViewBuilder private func bubble(_ m: DirectMessages.Message, mine: Bool, tail: Bool) -> some View {
    switch m.body {
    case .text(let t):
      // Bong bóng iMessage (16/10, chủ dự án): xanh / xám, đuôi ở tin cuối cụm.
      Text(verbatim: t)
        .messageBubble(mine: mine, tail: tail)
    case .workout(let w):
      workoutBubble(w)
    }
  }

  /// Buổi tập: bảng điểm than thu nhỏ.
  private func workoutBubble(_ w: DirectMessages.SharedWorkout) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(verbatim: w.title)
          .font(.system(size: 11, weight: .bold)).tracking(1.3).textCase(.uppercase)
          .foregroundStyle(.white.opacity(0.65))
          .lineLimit(1)
        Spacer(minLength: 8)
        if w.pr { RecordChip() }
      }
      if let v = CommunityCard.volumeText(w.volumeKg, unit: unit, locale: .app) {
        Text(verbatim: v)
          .font(.system(size: 30, weight: .heavy).monospacedDigit()).fontWidth(.condensed)
          .foregroundStyle(.white)
      }
      Text(verbatim: DMText.workoutLine(w))
        .font(.system(size: 12)).foregroundStyle(.white.opacity(0.65))
    }
    .padding(14)
    .frame(width: 230, alignment: .leading)
    .background(PostTint.board, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .accessibilityElement(children: .combine)
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: 8) {
      Menu {
        if let last = flow.history?.entries.max(by: { $0.at < $1.at }) {
          Button {
            Task {
              if await book.send(.workout(.init(
                title: last.templateName, volumeKg: Double(last.volumeKg), exerciseCount: last.exerciseCount,
                minutes: nil, pr: last.prDetected)))
              { sent += 1 }
            }
          } label: {
            Label(String(localized: "dm.attach.workout"), systemImage: "dumbbell.fill")
          }
        }
      } label: {
        Image(systemName: "plus")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 38, height: 38)
          .background(DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
          .frame(width: 44, height: 44)
      }
      .accessibilityLabel(Text("dm.attach"))
      TextField(String(localized: "dm.placeholder"), text: $draft, axis: .vertical)
        .lineLimit(1...5)
        .focused($typing)
        .padding(.horizontal, 6)
        .padding(.vertical, 12)
      Button {
        let text = draft
        Task {
          if await book.send(.text(text)) {
            draft = ""
            sent += 1
          }
        }
      } label: {
        let can = DirectMessages.sendable(draft) != nil && !book.sending
        Image(systemName: "arrow.up")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(can ? DS.Color.background.swiftUI : DS.Color.mutedForeground.swiftUI)
          .frame(width: 34, height: 34)
          .background(can ? DS.Color.foreground.swiftUI : DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
          .frame(width: 44, height: 44)
          .animation(.snappy, value: can)
      }
      .buttonStyle(.plain)
      .disabled(DirectMessages.sendable(draft) == nil || book.sending)
      .accessibilityLabel(Text("dm.send"))
    }
    .padding(.horizontal, 4)
    // Viên kính nổi chung cho mọi ô chat (`glassComposer`).
    .glassComposer(radius: 26)
    .padding(.horizontal, DS.Spacing.md)
    .padding(.bottom, DS.Spacing.sm)
    .padding(.top, 4)
    .overlay(alignment: .top) {
      if book.sendFailed {
        Text("dm.sendfailed").font(.system(size: 12)).foregroundStyle(DS.Color.readinessRed.swiftUI)
          .offset(y: -18)
      }
    }
  }

  static func dayText(_ d: LocalDate) -> String {
    var c = DateComponents()
    c.year = d.year
    c.month = d.month
    c.day = d.day
    guard let date = Calendar.current.date(from: c) else { return d.description }
    if Calendar.current.isDateInToday(date) { return String(localized: "dm.today") }
    if Calendar.current.isDateInYesterday(date) { return String(localized: "dm.yesterday") }
    return date.formatted(Date.FormatStyle().weekday(.wide).day().month(.abbreviated).locale(.app))
  }
}
