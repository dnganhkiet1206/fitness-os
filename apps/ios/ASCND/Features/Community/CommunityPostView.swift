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
/// Chưa có (lát 4–5): xoá / báo cáo bình luận (nhấn giữ), ghi chú bình luận
/// bị ẩn + kháng nghị, mở trang người dùng từ avatar / `@handle`.
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
  @State private var failure: CommunityCommentFailure?
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
      Text("community.post.sendfailed"),
      isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    } message: {
      Text(verbatim: failure.map(Self.failureText) ?? "")
    }
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
            CommentRow(comment: thread.root, reply: false, onReply: replyAction)
            ForEach(thread.replies) { r in
              CommentRow(comment: r, reply: true, onReply: replyAction)
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
      failure = f
    case .ignored:
      break
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
struct CommentRow: View {
  let comment: CommunityComment
  let reply: Bool
  let onReply: ((CommunityComment) -> Void)?

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
        .accessibilityElement(children: .combine)
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
