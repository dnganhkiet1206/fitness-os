public import Foundation
public import Observation

/// Thích / lưu / menu "⋯" của một bài (#527, lát 6) — `PostActions` +
/// `usePostMenu` (`components/ascnd/post-parts.tsx`) và `useToggleLike` /
/// `useToggleSave` / `useHidePost` / `useReport` / `useDeletePost` /
/// `useSetCommentsOff` / `useMute` / `useBlock` (`hooks/use-community.ts`) @
/// fac9ac2.
///
/// Như RN:
/// - thích / lưu đổi NGAY dưới ngón tay (cờ + bộ đếm, không xuống dưới 0);
///   hỏng thì trả cờ về và nói ra; bật khi đã bật (23505) / tắt khi không còn
///   dòng là trạng thái người ta muốn — không phải lỗi;
/// - bài của mình: tắt / bật bình luận (RPC `community_set_comments_off`), xoá
///   (phải chạm ≥ 1 hàng);
/// - bài người khác: ẩn riêng (23505 = đã ẩn), tắt tiếng 30 ngày, báo cáo
///   (lý do do người dùng chọn; 23505 = đã báo cáo), chặn.
/// Mọi lệnh chỉ khi có mạng, không qua outbox.
public enum CommunityToggle: Sendable, Hashable {
  case like, save
}

public protocol CommunityPostActionsRemote: Sendable {
  func toggle(_ t: CommunityToggle, postId: String, me: String, on: Bool) async throws
  func hidePost(postId: String) async throws
  func reportPost(me: String, postId: String, reason: CommunityReportReason) async throws
  func deletePost(me: String, postId: String) async throws
  func setCommentsOff(postId: String, off: Bool) async throws
  func mute(me: String, userId: String) async throws
  func block(me: String, userId: String) async throws
}

/// Màn đang giữ bài (feed, một bài, hồ sơ một người): đọc / sửa bài theo id và
/// đọc lại danh sách sau một lệnh làm bài biến mất (`invalidateQueries`).
@MainActor
public protocol CommunityPostHost: AnyObject {
  func post(id: String) -> CommunityFeed.Post?
  func replace(_ post: CommunityFeed.Post)
  func reloadAfterAction() async
}

@MainActor @Observable
public final class CommunityPostActions {
  public enum Outcome: Sendable, Hashable {
    case done
    case failed(CommunityModerationFailure)
    case ignored
  }

  public let userId: String
  /// Bài đang có lệnh menu chưa xong.
  public private(set) var busy: Set<String> = []

  @ObservationIgnored private let remote: any CommunityPostActionsRemote

  public init(userId: String, remote: any CommunityPostActionsRemote) {
    self.userId = userId
    self.remote = remote
  }

  /// `onMutate`: bật / tắt cờ, đếm ±1 (không dưới 0); đã đúng thì giữ nguyên.
  public static func optimistic(_ p: CommunityFeed.Post, _ t: CommunityToggle, on: Bool) -> CommunityFeed.Post {
    var p = p
    switch t {
    case .like:
      guard p.liked != on else { return p }
      p.liked = on
      p.likeCount = max(0, p.likeCount + (on ? 1 : -1))
    case .save:
      guard p.saved != on else { return p }
      p.saved = on
      p.saveCount = max(0, p.saveCount + (on ? 1 : -1))
    }
    return p
  }

  /// `onError`: trả CỜ về (chỉ khi cờ vẫn là thứ vừa đặt); con số thì đọc lại
  /// từ server — bộ đếm là của trigger phía server.
  public static func reverted(_ p: CommunityFeed.Post, _ t: CommunityToggle, on: Bool) -> CommunityFeed.Post {
    var p = p
    switch t {
    case .like: if p.liked == on { p.liked = !on }
    case .save: if p.saved == on { p.saved = !on }
    }
    return p
  }

  /// Thích / lưu: đổi ngay trên `host`, gửi, hỏng thì trả về.
  public func toggle(_ t: CommunityToggle, postId: String, host: any CommunityPostHost) async -> Outcome {
    guard let p = host.post(id: postId) else { return .ignored }
    let on = t == .like ? !p.liked : !p.saved
    host.replace(Self.optimistic(p, t, on: on))
    let me = userId, remote = self.remote
    let failure = await Self.attempt { try await remote.toggle(t, postId: postId, me: me, on: on) }
    guard let failure else { return .done }
    if let now = host.post(id: postId) { host.replace(Self.reverted(now, t, on: on)) }
    // `invalidateQueries`: số đếm đọc lại từ server.
    await host.reloadAfterAction()
    return .failed(failure)
  }

  /// Bài của mình: tắt / bật bình luận.
  public func setCommentsOff(_ off: Bool, postId: String, host: any CommunityPostHost) async -> Outcome {
    guard let p = host.post(id: postId), p.mine else { return .ignored }
    let remote = self.remote
    let out = await run(postId) { try await remote.setCommentsOff(postId: postId, off: off) }
    if out == .done, var now = host.post(id: postId) {
      now.commentsOff = off
      host.replace(now)
    }
    return out
  }

  /// Bài của mình: xoá; xong thì đọc lại.
  public func delete(postId: String, host: any CommunityPostHost) async -> Outcome {
    guard let p = host.post(id: postId), p.mine else { return .ignored }
    let remote = self.remote, me = userId
    let out = await run(postId) { try await remote.deletePost(me: me, postId: postId) }
    if out == .done { await host.reloadAfterAction() }
    return out
  }

  /// Bài người khác: ẩn khỏi bảng tin của mình.
  public func hide(postId: String, host: any CommunityPostHost) async -> Outcome {
    guard let p = host.post(id: postId), !p.mine else { return .ignored }
    let remote = self.remote
    let out = await run(postId) { try await remote.hidePost(postId: postId) }
    if out == .done { await host.reloadAfterAction() }
    return out
  }

  /// Báo cáo với lý do người dùng chọn; server ẩn bài riêng với người báo cáo.
  public func report(postId: String, reason: CommunityReportReason, host: any CommunityPostHost) async -> Outcome {
    guard let p = host.post(id: postId), !p.mine else { return .ignored }
    let remote = self.remote, me = userId
    let out = await run(postId) { try await remote.reportPost(me: me, postId: postId, reason: reason) }
    if out == .done { await host.reloadAfterAction() }
    return out
  }

  /// Tắt tiếng / chặn tác giả. Theo NGƯỜI, không theo bài: sau báo cáo bài đã
  /// rời danh sách mà lời mời tắt tiếng / chặn vẫn phải dùng được.
  public func mute(author: CommunityFeed.Author, host: any CommunityPostHost) async -> Outcome {
    guard author.userId != userId else { return .ignored }
    let remote = self.remote, me = userId
    let out = await run("user:" + author.userId) { try await remote.mute(me: me, userId: author.userId) }
    if out == .done { await host.reloadAfterAction() }
    return out
  }

  public func block(author: CommunityFeed.Author, host: any CommunityPostHost) async -> Outcome {
    guard author.userId != userId else { return .ignored }
    let remote = self.remote, me = userId
    let out = await run("user:" + author.userId) { try await remote.block(me: me, userId: author.userId) }
    if out == .done { await host.reloadAfterAction() }
    return out
  }

  private func run(_ postId: String, _ body: @Sendable () async throws -> Void) async -> Outcome {
    guard !busy.contains(postId) else { return .ignored }
    busy.insert(postId)
    defer { busy.remove(postId) }
    return await Self.attempt(body).map(Outcome.failed) ?? .done
  }

  static func attempt(_ body: @Sendable () async throws -> Void) async -> CommunityModerationFailure? {
    do {
      try await body()
      return nil
    } catch let f as CommunityModerationFailure {
      return f
    } catch {
      return .server(code: nil)
    }
  }
}
