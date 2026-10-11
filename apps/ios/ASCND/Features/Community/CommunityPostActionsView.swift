import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thích / lưu / menu "⋯" trên thẻ bài (#527, lát 6) — `PostActions` +
/// `usePostMenu` (`components/ascnd/post-parts.tsx`) @ fac9ac2, trên
/// `CommunityPostActions`.
///
/// Màn giữ bài (feed / một bài / hồ sơ) gắn `communityPostActions(userId:host:)`;
/// thẻ đọc ngữ cảnh từ môi trường. Thẻ không có ngữ cảnh (xem trước) chỉ hiện
/// số đếm như trước.
struct CommunityPostActionsContext {
  let actions: CommunityPostActions
  let host: any CommunityPostHost
  let openMenu: @MainActor (CommunityFeed.Post) -> Void
}

extension EnvironmentValues {
  @Entry var communityPostActions: CommunityPostActionsContext? = nil
}

extension View {
  func communityPostActions(userId: String, host: any CommunityPostHost) -> some View {
    modifier(CommunityPostActionsModifier(userId: userId, host: host))
  }
}

private struct CommunityPostActionsModifier: ViewModifier {
  let userId: String
  let host: any CommunityPostHost
  @Environment(AppServices.self) private var services
  @State private var actions: CommunityPostActions?
  /// Bài của menu đang mở.
  @State private var menuFor: CommunityFeed.Post?
  @State private var reasonFor: CommunityFeed.Post?
  @State private var deleteFor: CommunityFeed.Post?
  @State private var blockFor: CommunityFeed.Author?
  /// Sau báo cáo: mời tắt tiếng / chặn người ấy.
  @State private var afterReport: CommunityFeed.Author?
  @State private var message: String?
  @State private var taps = 0

  func body(content: Content) -> some View {
    content
      .environment(
        \.communityPostActions,
        actions.map { a in
          CommunityPostActionsContext(actions: a, host: host) { post in
            taps += 1
            menuFor = post
          }
        }
      )
      .task { if actions == nil { actions = services.makeCommunityPostActions(userId: userId) } }
      .sensoryFeedback(.selection, trigger: taps)
      .confirmationDialog(
        Text(verbatim: menuTitle), isPresented: present($menuFor), titleVisibility: .visible, presenting: menuFor
      ) { post in
        menuButtons(post)
      }
      .confirmationDialog(
        Text("community.menu.reportwhy"), isPresented: present($reasonFor), titleVisibility: .visible,
        presenting: reasonFor
      ) { post in
        ForEach([CommunityReportReason.spam, .harassment, .inappropriate, .misleading], id: \.self) { r in
          Button(HiddenNoticeView.reasonText(r)) { Task { await report(post, reason: r) } }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
      .alert(
        Text("community.menu.deletepost"), isPresented: present($deleteFor), presenting: deleteFor
      ) { post in
        Button(String(localized: "common.cancel"), role: .cancel) {}
        Button(String(localized: "community.menu.delete"), role: .destructive) { Task { await delete(post) } }
      } message: { _ in
        Text("community.menu.deletepostbody")
      }
      .alert(
        Text(verbatim: String(localized: "community.user.blockconfirm \(blockFor?.handle ?? "")")),
        isPresented: present($blockFor), presenting: blockFor
      ) { a in
        Button(String(localized: "common.cancel"), role: .cancel) {}
        Button(String(localized: "community.user.block \(a.handle)"), role: .destructive) { Task { await block(a) } }
      } message: { _ in
        Text("community.user.blockbody")
      }
      .alert(
        Text("community.menu.reportednext"), isPresented: present($afterReport), presenting: afterReport
      ) { a in
        Button(String(localized: "community.user.mute \(a.handle)")) { Task { await mute(a) } }
        Button(String(localized: "community.user.block \(a.handle)"), role: .destructive) { blockFor = a }
        Button(String(localized: "community.menu.reportedok"), role: .cancel) {}
      } message: { a in
        Text("community.menu.reportednextbody \(a.handle)")
      }
      .alert(
        Text(verbatim: message ?? ""),
        isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
      ) {
        Button(String(localized: "common.ok"), role: .cancel) {}
      }
  }

  private func present<T>(_ b: Binding<T?>) -> Binding<Bool> {
    Binding(get: { b.wrappedValue != nil }, set: { if !$0 { b.wrappedValue = nil } })
  }

  private var menuTitle: String {
    guard let p = menuFor else { return "" }
    return p.mine ? String(localized: "community.menu.mine") : (p.author?.displayName ?? "")
  }

  /// Của mình: bật / tắt bình luận, Xoá. Của người khác: nhẹ trước, nặng sau —
  /// Ẩn, Tắt tiếng 30 ngày, Báo cáo, Chặn.
  @ViewBuilder private func menuButtons(_ post: CommunityFeed.Post) -> some View {
    if post.mine {
      Button(post.commentsOff ? String(localized: "community.menu.commentson") : String(localized: "community.menu.commentsoff")) {
        Task { await setCommentsOff(!post.commentsOff, post) }
      }
      Button(String(localized: "community.menu.deletepost"), role: .destructive) { deleteFor = post }
    } else {
      Button(String(localized: "community.menu.hide")) { Task { await hide(post) } }
      if let a = post.author {
        Button(String(localized: "community.user.mute \(a.handle)")) { Task { await mute(a) } }
      }
      Button(String(localized: "community.post.report")) { reasonFor = post }
      if let a = post.author {
        Button(String(localized: "community.user.block \(a.handle)"), role: .destructive) { blockFor = a }
      }
    }
    Button(String(localized: "common.cancel"), role: .cancel) {}
  }

  // MARK: - Lệnh

  private func say(_ out: CommunityPostActions.Outcome, done: String?) {
    switch out {
    case .done: message = done
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  private func setCommentsOff(_ off: Bool, _ post: CommunityFeed.Post) async {
    guard let actions else { return }
    let out = await actions.setCommentsOff(off, postId: post.id, host: host)
    say(out, done: off ? String(localized: "community.menu.commentsoffdone") : String(localized: "community.menu.commentsondone"))
  }

  private func delete(_ post: CommunityFeed.Post) async {
    guard let actions else { return }
    say(await actions.delete(postId: post.id, host: host), done: String(localized: "community.menu.deleted"))
  }

  private func hide(_ post: CommunityFeed.Post) async {
    guard let actions else { return }
    say(await actions.hide(postId: post.id, host: host), done: String(localized: "community.menu.hidden"))
  }

  private func report(_ post: CommunityFeed.Post, reason: CommunityReportReason) async {
    guard let actions else { return }
    let author = post.author
    let out = await actions.report(postId: post.id, reason: reason, host: host)
    if out == .done, let author {
      // Bước người ta thường cần tiếp theo: không thấy NGƯỜI ấy nữa.
      afterReport = author
    } else {
      say(out, done: String(localized: "community.post.reported"))
    }
  }

  private func mute(_ a: CommunityFeed.Author) async {
    guard let actions else { return }
    say(await actions.mute(author: a, host: host), done: String(localized: "community.user.muted \(a.handle)"))
  }

  private func block(_ a: CommunityFeed.Author) async {
    guard let actions else { return }
    say(await actions.block(author: a, host: host), done: String(localized: "community.menu.blocked"))
  }
}

/// Thích · bình luận · (khoảng trống) · lưu — mỗi nút một ô 44 điểm. Bình luận
/// không phải nút riêng: chạm vào đó rơi xuống thẻ, mở bài.
struct PostActionsRow: View {
  let post: CommunityFeed.Post
  let context: CommunityPostActionsContext
  var commentCount: Int?
  @State private var taps = 0
  @State private var message: String?

  var body: some View {
    HStack(spacing: 0) {
      toggle(
        .like, on: post.liked, icon: post.liked ? "heart.fill" : "heart", count: post.likeCount,
        label: String(localized: "community.like"),
        tint: post.liked ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI)
      HStack(spacing: 4) {
        Image(systemName: "bubble.right").foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(verbatim: "\(commentCount ?? post.commentCount)")
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, DS.Spacing.sm)
      .frame(minWidth: 44, minHeight: 44)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: "\(String(localized: "community.comment")) · \(commentCount ?? post.commentCount)"))
      Spacer(minLength: 0)
      toggle(
        .save, on: post.saved, icon: post.saved ? "bookmark.fill" : "bookmark", count: nil,
        label: String(localized: "community.save"),
        tint: post.saved ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
    }
    .padding(.horizontal, -DS.Spacing.sm)
    .sensoryFeedback(.selection, trigger: taps)
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  private func toggle(
    _ t: CommunityToggle, on: Bool, icon: String, count: Int?, label: String, tint: Color
  ) -> some View {
    Button {
      // `Haptics.selection()` của `onMutate`: mỗi lần chạm thích / lưu.
      taps += 1
      Task {
        if case .failed(let f) = await context.actions.toggle(t, postId: post.id, host: context.host) {
          message = CommunityPostView.failureText(f)
        }
      }
    } label: {
      HStack(spacing: 4) {
        Image(systemName: icon).foregroundStyle(tint)
        if let count {
          Text(verbatim: "\(count)").font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(tint)
        }
      }
      .padding(.horizontal, DS.Spacing.sm)
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: count.map { "\(label) · \($0)" } ?? label))
    .accessibilityAddTraits(on ? .isSelected : [])
  }
}
