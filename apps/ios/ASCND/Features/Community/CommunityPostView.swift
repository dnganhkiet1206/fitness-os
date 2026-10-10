import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một bài + bình luận (#527, lát 3) — `app/community-post.tsx` @ fac9ac2 trên
/// `CommunityPostBook`.
///
/// Như RN: thẻ đầy đủ (mọi bài tập / nguyên liệu); bình luận cũ → mới, luồng
/// một tầng (trả lời lùi vào dưới gốc); "Xem bình luận cũ hơn" ở đầu luồng, bấm
/// mới tải, hỏng thì nói ra và giữ những gì đã có; `@handle` chỉ tô khi server đã
/// xác nhận; "Trả lời" điền sẵn `@handle `; thanh viết ở đáy: tác giả tắt bình
/// luận → nói ra, đang bị hạn chế → nói đến bao giờ, chưa có hồ sơ → mời tạo;
/// gửi cần mạng, lỗi trần mỗi giờ (54000) / tạm khoá (CR001) có câu riêng.
///
/// Lát 4: nhấn giữ (hay hành động trợ năng "Thêm") một bình luận ra menu —
/// người viết / chủ bài "Xoá bình luận", người khác "Báo cáo"; bình luận của
/// mình đang bị ẩn có ghi chú vì sao + "Yêu cầu xem lại".
///
/// Chưa có (lát 5): mở trang người dùng từ avatar / `@handle`.
struct CommunityPostScreen: View {
  let postId: String
  var onCommented: () -> Void = {}
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityPostBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityPostView(book: book, onCommented: onCommented)
      } else if built {
        ContentUnavailableView {
          Label("community.post.title", systemImage: "bubble.left.and.bubble.right")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .navigationTitle(Text("community.post.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task {
      guard !built else { return }
      book = services.makeCommunityPost(userId: flow.today.userId, postId: postId)
      built = true
    }
  }
}

struct CommunityPostView: View {
  let book: CommunityPostBook
  var onCommented: () -> Void = {}
  @Environment(\.weightUnit) private var unit
  @State private var draft = ""
  @State private var replyTo: CommunityComment?
  @State private var message: Message?
  @State private var menuFor: CommunityComment?
  @FocusState private var composing: Bool

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom) { if book.post != nil { composer } }
    .task { if book.phase == .loading { await book.load() } }
    .refreshable { await book.load() }
    .alert(
      Text(verbatim: message?.title ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } }),
      presenting: message
    ) { _ in
      Button(String(localized: "common.ok"), role: .cancel) {}
    } message: { m in
      if let body = m.body { Text(verbatim: body) }
    }
    .confirmationDialog(
      Text(verbatim: menuFor?.author?.displayName ?? ""),
      isPresented: Binding(get: { menuFor != nil }, set: { if !$0 { menuFor = nil } }),
      titleVisibility: menuFor?.author == nil ? .hidden : .visible,
      presenting: menuFor
    ) { c in
      if book.canDelete(c) {
        Button(String(localized: "community.post.delete"), role: .destructive) { Task { await delete(c) } }
      } else {
        Button(String(localized: "community.post.report")) { Task { await report(c) } }
      }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
    .sensoryFeedback(.selection, trigger: menuFor?.id) { _, new in new != nil }
  }

  /// Một hộp thoại cho mọi kết quả cần nói ra (app chưa có toast).
  struct Message: Identifiable {
    let id = UUID()
    let title: String
    var body: String?
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView().frame(minHeight: 240)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.load() } }
        .frame(minHeight: 240)
    case .gone:
      DSEmptyState(systemImage: "bubble.left.and.bubble.right", title: String(localized: "community.post.gone"))
    case .ready:
      if let post = book.post {
        PostCardView(
          post: post, artURL: post.art.flatMap(book.artURL), unit: unit, full: true, commentCount: book.commentCount)
        comments
      }
    }
  }

  @ViewBuilder private var comments: some View {
    switch book.commentsPhase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    case .failed:
      VStack(spacing: DS.Spacing.sm) {
        Text("community.post.commentsfailed")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        DSButton(String(localized: "async.retry"), style: .secondary) { Task { await book.reloadComments() } }
      }
      .frame(maxWidth: .infinity)
    case .ready where book.comments.isEmpty:
      Text("community.post.empty")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
    case .ready:
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        older
        ForEach(book.threadGroups) { thread in
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            row(thread.root, reply: false)
            ForEach(thread.replies) { r in
              row(r, reply: true)
                .padding(.leading, 32 + DS.Spacing.sm)
            }
          }
        }
      }
    }
  }

  /// Bấm mới tải (không tự tải khi cuộn): trang cũ chèn lên TRÊN chỗ đang đọc.
  @ViewBuilder private var older: some View {
    if book.loadingOlder {
      ProgressView().frame(minHeight: 44)
    } else if book.canLoadOlder {
      Button {
        Task { await book.loadOlder() }
      } label: {
        Text(book.olderFailed ? "community.post.olderfailed" : "community.post.older")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.metricBlue.swiftUI)
          .frame(minHeight: 44)
      }
      .buttonStyle(.plain)
    }
  }

  private func row(_ c: CommunityComment, reply: Bool) -> some View {
    CommentRow(
      comment: c, reply: reply, onReply: replyAction, onMenu: { menuFor = $0 }, busy: book.working.contains(c.id)
    ) {
      if c.hidden && c.mine {
        HiddenNoticeView(step: book.hiddenStep(c), why: book.hiddenWhy(c), busy: book.working.contains(c.id)) {
          Task { await appeal(c) }
        }
      }
    }
  }

  /// Trả lời cần một cái tên — chỉ khi đã có hồ sơ (`me.data` của RN).
  private var replyAction: ((CommunityComment) -> Void)? {
    guard book.myProfile != nil else { return nil }
    return { c in
      replyTo = c
      // Như X: người được trả lời đọc thấy tên mình; không chèn nếu đã tự gõ.
      if CommentThread.sendable(draft) == nil { draft = CommentThread.replyPrefix(c.author?.handle) }
      composing = true
    }
  }

  // MARK: - Thanh viết

  @ViewBuilder private var composer: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      if let replyTo, book.myProfile != nil {
        HStack(spacing: DS.Spacing.sm) {
          Text("community.post.replyingto \(replyTo.author?.displayName ?? "—")")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
          Spacer(minLength: 0)
          Button {
            // Bỏ trả lời thì bỏ luôn tên điền sẵn — nếu chưa gõ thêm gì.
            if draft == CommentThread.replyPrefix(replyTo.author?.handle) { draft = "" }
            self.replyTo = nil
          } label: {
            Image(systemName: "xmark").font(.footnote).frame(minWidth: 44, minHeight: 44)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("community.post.replycancel"))
        }
      }
      bar
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
    .background(DS.Color.background.swiftUI)
    .overlay(alignment: .top) { Divider() }
  }

  @ViewBuilder private var bar: some View {
    if let post = book.post, post.commentsOff, !post.mine {
      closedText(Text("community.post.closed"))
    } else if let r = book.restriction {
      closedText(Text("community.restricted.notice \(CommunityFeedView.untilText(r.until))"))
    } else if let me = book.myProfile {
      HStack(alignment: .bottom, spacing: DS.Spacing.sm) {
        MascotAvatar(mascotId: me.mascotId, size: 32)
        TextField(
          String(localized: "community.post.placeholder"),
          text: Binding(get: { draft }, set: { draft = CommentThread.clamp($0) }), axis: .vertical
        )
        .lineLimit(1...5)
        .focused($composing)
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, 10)
        .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
        Button {
          Task { await send() }
        } label: {
          Image(systemName: "paperplane.fill")
            .foregroundStyle(canSend ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
        .accessibilityLabel(Text("community.post.send"))
      }
    } else if book.hasProfile == false {
      NavigationLink {
        CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
      } label: {
        Text("community.setup.title")
          .font(DS.TextStyle.headline)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .buttonStyle(.plain)
    }
  }

  private func closedText(_ t: Text) -> some View {
    t.font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity, minHeight: 44)
  }

  private var canSend: Bool { CommentThread.sendable(draft) != nil && !book.sending && book.canComment }

  private func send() async {
    switch await book.send(draft, replyTo: replyTo?.id) {
    case .sent:
      draft = ""
      replyTo = nil
      onCommented()
    case .failed(let f):
      message = Message(title: String(localized: "community.post.sendfailed"), body: Self.failureText(f))
    case .ignored:
      break
    }
  }

  // MARK: - Menu bình luận (lát 4)

  private func delete(_ c: CommunityComment) async {
    switch await book.delete(c) {
    case .done: onCommented()
    case .failed(let f): message = Message(title: Self.failureText(f))
    case .ignored: break
    }
  }

  private func report(_ c: CommunityComment) async {
    switch await book.report(c) {
    case .done: message = Message(title: String(localized: "community.post.reported"))
    case .failed(let f): message = Message(title: Self.failureText(f))
    case .ignored: break
    }
  }

  private func appeal(_ c: CommunityComment) async {
    // Thành công: ghi chú tự đổi thành "Đã gửi yêu cầu xem lại".
    if case .failed(let f) = await book.appeal(c) { message = Message(title: Self.failureText(f)) }
  }

  static func failureText(_ f: CommunityModerationFailure) -> String {
    switch f {
    case .offline: String(localized: "community.action.onlineonly")
    case .reportLimit: String(localized: "community.report.limit")
    case .nothingWritten: String(localized: "community.post.deletegone")
    case .server: String(localized: "community.action.server")
    }
  }

  static func failureText(_ f: CommunityCommentFailure) -> String {
    switch f {
    case .limit: String(localized: "community.post.limit")
    case .restricted: String(localized: "community.post.restricted")
    case .offline: String(localized: "community.post.offline")
    case .server: String(localized: "community.profile.tryagain")
    }
  }
}

/// Một bình luận: avatar, tên · thời gian, thân với `@handle` đã xác nhận được
/// tô, nút "Trả lời".
struct CommentRow<Notice: View>: View {
  let comment: CommunityComment
  let reply: Bool
  let onReply: ((CommunityComment) -> Void)?
  var onMenu: (CommunityComment) -> Void = { _ in }
  /// Đang xoá / báo cáo / kháng nghị: mờ đi, không nhận chạm.
  var busy = false
  @ViewBuilder var notice: () -> Notice

  var body: some View {
    HStack(alignment: .top, spacing: DS.Spacing.sm) {
      MascotAvatar(mascotId: comment.author?.mascotId, size: reply ? 24 : 32)
      VStack(alignment: .leading, spacing: 4) {
        VStack(alignment: .leading, spacing: 2) {
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Text(verbatim: comment.author?.displayName ?? "—")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1)
            Text(verbatim: PostHeaderView.agoText(comment.createdAt))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Text(Self.body(comment))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        // Nhấn giữ ra menu — và cũng là một hành động TRỢ NĂNG (RN #135).
        .onLongPressGesture { onMenu(comment) }
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text("community.post.more"))
        .accessibilityAction(named: Text("community.post.more")) { onMenu(comment) }
        // Anh em với vùng nhấn giữ, không nằm trong nó (RN #120).
        notice()
        if let onReply {
          Button {
            onReply(comment)
          } label: {
            Text("community.post.reply")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(minHeight: 44, alignment: .leading)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("community.post.replyto \(comment.author?.displayName ?? "—")"))
        }
      }
    }
    .opacity(busy ? 0.5 : 1)
    .allowsHitTesting(!busy)
  }

  /// `mentionParts`: đoạn nhắc server đã xác nhận được tô; còn lại là chữ.
  static func body(_ c: CommunityComment) -> AttributedString {
    var out = AttributedString()
    for part in CommentThread.mentionParts(c.body, known: c.mentions) {
      var s = AttributedString(part.text)
      if part.userId != nil {
        s.foregroundColor = DS.Color.metricBlue.swiftUI
        s.font = DS.TextStyle.body.weight(.semibold)
      }
      out += s
    }
    return out
  }
}

/// Ghi chú "đang ẩn" trên bình luận của CHÍNH MÌNH — bản gọn của
/// `hidden-notice.tsx` (không ô lời nhắn): vì sao (số người + lý do phổ biến,
/// không nói ai), rồi một trong: quyết định cuối, đã gửi yêu cầu, hay nút
/// "Yêu cầu xem lại" (một lần).
struct HiddenNoticeView: View {
  let step: HiddenNotice.Step
  let why: HiddenNotice.Why?
  let busy: Bool
  let onAsk: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Label {
        Text("community.hidden.notice")
      } icon: {
        Image(systemName: "eye.slash")
      }
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.readinessRed.swiftUI)
      if let why {
        Text(verbatim: Self.whyText(why))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      switch step {
      case .unknown:
        EmptyView()
      case .removed:
        detail(Text("community.hidden.removed"))
      case .upheld:
        detail(Text("community.hidden.upheld"))
      case .sent:
        Label {
          Text("community.hidden.reviewsent")
        } icon: {
          Image(systemName: "checkmark")
        }
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      case .canAsk:
        Button(action: onAsk) {
          HStack(spacing: DS.Spacing.xs) {
            if busy { ProgressView().controlSize(.small) }
            Text("community.hidden.reviewask")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
          }
          .padding(.horizontal, DS.Spacing.md)
          .frame(minHeight: 44)
          .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        }
        .buttonStyle(.plain)
        .disabled(busy)
      }
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.readinessRed.swiftUI.opacity(0.08), in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  private func detail(_ t: Text) -> some View {
    t.font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  /// `nCmHiddenWhy` / `nCmHiddenWhyN`; lý do viết thường như `toLocaleLowerCase`.
  static func whyText(_ w: HiddenNotice.Why) -> String {
    let n = w.reporters
    guard let r = w.reason else {
      return n == 1
        ? String(localized: "community.hidden.whyn.one \(n)") : String(localized: "community.hidden.whyn.other \(n)")
    }
    let reason = reasonText(r).localizedLowercase
    return n == 1
      ? String(localized: "community.hidden.why.one \(n) \(reason)")
      : String(localized: "community.hidden.why.other \(n) \(reason)")
  }

  static func reasonText(_ r: CommunityReportReason) -> String {
    switch r {
    case .spam: String(localized: "community.reason.spam")
    case .harassment: String(localized: "community.reason.harassment")
    case .inappropriate: String(localized: "community.reason.inappropriate")
    case .misleading: String(localized: "community.reason.misleading")
    case .other: String(localized: "community.reason.other")
    }
  }
}
