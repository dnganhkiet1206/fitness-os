public import ASCNDCore
import Foundation
import Supabase

/// Đọc feed Cộng đồng (#527, lát 1) — cùng truy vấn với `use-community.ts` @
/// fac9ac2. Mọi lệnh đi qua RLS: chặn hai chiều, riêng tư, ẩn, tắt tiếng do
/// server lọc (`20260927120000_community_foundation.sql`,
/// `20261007220000_community_report_trust.sql`); thích / lưu chỉ đọc hàng của
/// mình.
public struct SupabaseCommunity: CommunityFeedRemote, CommunityProfileRemote, CommunityPostRemote, CommunityUserRemote,
  CommunityPostActionsRemote, CommunitySavedRemote, CommunitySearchRemote, CommunityInboxRemote,
  CommunityPrivacyRemote, CommunityShareRemote, CommunityShareProgressRemote, CommunityShareRecipeRemote
{
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct FolloweeDTO: Decodable, Sendable {
    let followee_id: String
  }

  struct PostIdDTO: Decodable, Sendable {
    let post_id: String
  }

  public func followees(me: String) async throws -> [String] {
    let rows: [FolloweeDTO] = try await client.from("community_follows")
      .select("followee_id")
      .eq("follower_id", value: me)
      .execute().value
    return rows.map(\.followee_id)
  }

  public func settings(me: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("community_settings")
      .select("discover_kinds")
      .eq("user_id", value: me)
      .limit(1)
      .execute().value
    return rows.first
  }

  public func posts(_ q: CommunityPostQuery) async throws -> [JSONValue] {
    let useful = q.usefulSince != nil
    var f = client.from("community_posts")
      .select(useful ? "\(CommunityFeed.postColumns), try_count" : CommunityFeed.postColumns)
    if let authors = q.authors { f = f.in("author_id", values: authors) }
    if let kinds = q.kinds { f = f.in("kind", values: kinds) }
    if let c = q.cursorFilter { f = f.or(c) }
    if let since = q.usefulSince {
      f = f.gte("created_at", value: since).gte("useful_score", value: CommunityFeed.usefulMinScore)
    }
    if let me = q.excludeAuthor { f = f.neq("author_id", value: me) }
    let ordered =
      useful
      ? f.order("useful_score", ascending: false).order("created_at", ascending: false)
      : f.order("created_at", ascending: q.ascending).order("id", ascending: q.ascending)
    return try await ordered.limit(q.limit).execute().value
  }

  public func profiles(ids: [String]) async throws -> [JSONValue] {
    guard !ids.isEmpty else { return [] }
    return try await client.from("community_profiles")
      .select(CommunityFeed.profileColumns)
      .in("user_id", values: ids)
      .execute().value
  }

  public func likedPostIds(me: String, postIds: [String]) async throws -> [String] {
    guard !postIds.isEmpty else { return [] }
    let rows: [PostIdDTO] = try await client.from("community_likes")
      .select("post_id")
      .eq("user_id", value: me)
      .in("post_id", values: postIds)
      .execute().value
    return rows.map(\.post_id)
  }

  public func savedPostIds(me: String, postIds: [String]) async throws -> [String] {
    guard !postIds.isEmpty else { return [] }
    let rows: [PostIdDTO] = try await client.from("community_saves")
      .select("post_id")
      .eq("user_id", value: me)
      .in("post_id", values: postIds)
      .execute().value
    return rows.map(\.post_id)
  }

  /// Kể cả ảnh đã tắt: bài đăng trước khi ảnh bị tắt vẫn phải vẽ được.
  public func art(ids: [String]) async throws -> [JSONValue] {
    guard !ids.isEmpty else { return [] }
    return try await client.from("community_art")
      .select(CommunityFeed.artColumns)
      .in("id", values: ids)
      .execute().value
  }

  public func restriction(me: String, nowISO: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("community_restrictions")
      .select("until, reason")
      .eq("user_id", value: me)
      .gt("until", value: nowISO)
      .limit(1)
      .execute().value
    return rows.first
  }

  public func myProfile(me: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("community_profiles")
      .select(CommunityFeed.profileColumns)
      .eq("user_id", value: me)
      .limit(1)
      .execute().value
    return rows.first
  }

  /// `useUnlockStats`: `count: 'exact', head: true` trên buổi tập và món ăn.
  public func unlockStats(me: String) async throws -> CommunityMascots.Stats {
    async let w = client.from("workout_sessions").select("id", head: true, count: .exact).eq("user_id", value: me)
      .execute()
    async let m = client.from("meal_entries").select("id", head: true, count: .exact).eq("user_id", value: me)
      .execute()
    let (ws, ms) = try await (w, m)
    return CommunityMascots.Stats(workouts: ws.count ?? 0, meals: ms.count ?? 0)
  }

  /// `useSaveCommunityProfile`: upsert theo `user_id`; 23505 = tên đã có người.
  public func saveProfile(_ row: JSONValue) async throws {
    do {
      _ = try await client.from("community_profiles")
        .upsert(row, onConflict: "user_id")
        .select("user_id")
        .single()
        .execute()
    } catch {
      if NetworkFailure.isOffline(error) { throw CommunityProfileFailure.offline }
      let code = (error as? PostgrestError)?.code
      if code == "23505" { throw CommunityProfileFailure.handleTaken }
      throw CommunityProfileFailure.server(code: code)
    }
  }

  // MARK: - Một bài + bình luận (#527, lát 3)

  struct MutedDTO: Decodable, Sendable {
    let muted_id: String
  }

  struct InsertedDTO: Decodable, Sendable {
    let id: String
  }

  /// `useCommunityPost`: `.eq('id').maybeSingle()`.
  public func post(id: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("community_posts")
      .select(CommunityFeed.postColumns)
      .eq("id", value: id)
      .limit(1)
      .execute().value
    return rows.first
  }

  /// `useComments`: 50 câu mới nhất cũ hơn con trỏ, `(created_at, id)` giảm dần.
  public func comments(postId: String, olderThan: String?, limit: Int) async throws -> [JSONValue] {
    var q = client.from("community_comments")
      .select(CommentThread.commentColumns)
      .eq("post_id", value: postId)
    if let olderThan { q = q.or(olderThan) }
    return try await q.order("created_at", ascending: false).order("id", ascending: false).limit(limit)
      .execute().value
  }

  /// Gốc của trả lời mồ côi — RLS vẫn áp (gốc ẩn / bị chặn thì không về).
  public func comments(ids: [String]) async throws -> [JSONValue] {
    guard !ids.isEmpty else { return [] }
    return try await client.from("community_comments")
      .select(CommentThread.commentColumns)
      .in("id", values: ids)
      .execute().value
  }

  public func commentMentions(commentIds: [String]) async throws -> [JSONValue] {
    guard !commentIds.isEmpty else { return [] }
    return try await client.from("community_comment_mentions")
      .select("comment_id, user_id")
      .in("comment_id", values: commentIds)
      .execute().value
  }

  /// `useMutedUsers`: dòng của chính mình còn hạn.
  public func mutedIds(me: String, nowISO: String) async throws -> [String] {
    let rows: [MutedDTO] = try await client.from("community_mutes")
      .select("muted_id")
      .eq("user_id", value: me)
      .gt("until", value: nowISO)
      .execute().value
    return rows.map(\.muted_id)
  }

  /// `useAddComment`: chèn thẳng (RLS + trigger chuẩn hoá `parent_id` về gốc);
  /// 54000 = trần mỗi giờ, CR001 = đang bị tạm khoá (`postingError`).
  public func addComment(postId: String, me: String, body: String, parentId: String?) async throws {
    let row: JSONValue = .object([
      "post_id": .string(postId), "author_id": .string(me), "body": .string(body),
      "parent_id": parentId.map(JSONValue.string) ?? .null,
    ])
    do {
      let _: [InsertedDTO] = try await client.from("community_comments")
        .insert(row)
        .select("id")
        .execute().value
    } catch {
      if NetworkFailure.isOffline(error) { throw CommunityCommentFailure.offline }
      let code = (error as? PostgrestError)?.code
      if code == "54000" { throw CommunityCommentFailure.limit }
      if code == "CR001" { throw CommunityCommentFailure.restricted }
      throw CommunityCommentFailure.server(code: code)
    }
  }

  // MARK: - Menu bình luận + kháng nghị (#527, lát 4)

  /// Ba đối số luôn có mặt: `Encodable` tổng hợp BỎ khoá `nil`, và PostgREST
  /// tìm hàm theo tên đối số — thiếu `p_post_id` là không thấy hàm.
  struct AppealParams: Encodable, Sendable {
    let p_post_id: String?
    let p_comment_id: String?
    let p_message: String

    enum CodingKeys: String, CodingKey { case p_post_id, p_comment_id, p_message }

    func encode(to encoder: any Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(p_post_id, forKey: .p_post_id)
      try c.encode(p_comment_id, forKey: .p_comment_id)
      try c.encode(p_message, forKey: .p_message)
    }
  }

  /// `useDeleteComment`: `confirmWrite` — RLS lọc người không được xoá thành
  /// 0 hàng, nên 0 hàng là lỗi chứ không phải "đã xoá".
  public func deleteComment(id: String) async throws {
    let gone: [InsertedDTO]
    do {
      gone = try await client.from("community_comments")
        .delete().eq("id", value: id)
        .select("id").execute().value
    } catch {
      throw Self.moderationFailure(error)
    }
    if gone.isEmpty { throw CommunityModerationFailure.nothingWritten }
  }

  /// `useReport`: 23505 = đã báo cáo bình luận này rồi — kết quả người ta muốn.
  public func reportComment(id: String, me: String, reason: CommunityReportReason) async throws {
    let row: JSONValue = .object([
      "reporter_id": .string(me), "post_id": .null, "comment_id": .string(id),
      "reported_user_id": .null, "reason": .string(reason.rawValue),
    ])
    do {
      try await client.from("community_reports").insert(row).execute()
    } catch {
      if (error as? PostgrestError)?.code == "23505" { return }
      throw Self.moderationFailure(error)
    }
  }

  public func hiddenReasons() async throws -> [JSONValue] {
    try await client.rpc("community_my_hidden_reasons").execute().value
  }

  /// `useRequestReview`: 23505 = đã gửi cho đợt ẩn này (máy khác) — không phải lỗi.
  public func appeal(commentId: String, message: String) async throws {
    do {
      try await client.rpc(
        "community_appeal",
        params: AppealParams(p_post_id: nil, p_comment_id: commentId, p_message: CommentThread.sendable(message) ?? "")
      ).execute()
    } catch {
      if (error as? PostgrestError)?.code == "23505" { return }
      throw Self.moderationFailure(error)
    }
  }

  static func moderationFailure(_ error: any Error) -> CommunityModerationFailure {
    if NetworkFailure.isOffline(error) { return .offline }
    let code = (error as? PostgrestError)?.code
    if code == "54000" { return .reportLimit }
    return .server(code: code)
  }

  // MARK: - Hồ sơ một người (#527, lát 5)

  struct UserParams: Encodable, Sendable {
    let p_user: String
  }

  struct FolloweeDTO2: Decodable, Sendable {
    let followee_id: String
  }

  struct KindDTO: Decodable, Sendable {
    let kind: String
  }

  struct MutedIdDTO: Decodable, Sendable {
    let muted_id: String
  }

  /// `useCommunityUser`: hồ sơ (`maybeSingle`).
  public func userProfile(id: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("community_profiles")
      .select(CommunityFeed.profileColumns)
      .eq("user_id", value: id)
      .limit(1)
      .execute().value
    return rows.first
  }

  /// Hai `count: 'exact', head: true` của `useCommunityUser`.
  public func followCounts(userId: String) async throws -> (followers: Int, following: Int) {
    async let a = client.from("community_follows").select("follower_id", head: true, count: .exact)
      .eq("followee_id", value: userId).execute()
    async let b = client.from("community_follows").select("followee_id", head: true, count: .exact)
      .eq("follower_id", value: userId).execute()
    let (x, y) = try await (a, b)
    return (x.count ?? 0, y.count ?? 0)
  }

  public func iFollow(me: String, userId: String) async throws -> Bool {
    let rows: [FolloweeDTO2] = try await client.from("community_follows")
      .select("followee_id")
      .eq("follower_id", value: me)
      .eq("followee_id", value: userId)
      .execute().value
    return !rows.isEmpty
  }

  /// `useCommunityUserKinds`: `select('kind').limit(500)`.
  public func userKinds(userId: String) async throws -> [String] {
    let rows: [KindDTO] = try await client.from("community_posts")
      .select("kind")
      .eq("author_id", value: userId)
      .limit(500)
      .execute().value
    return rows.map(\.kind)
  }

  public func userStats(userId: String) async throws -> [JSONValue] {
    let v: JSONValue = try await client.rpc("community_user_stats", params: UserParams(p_user: userId)).execute().value
    if case .array(let a) = v { return a }
    return []
  }

  public func userBadges(userId: String) async throws -> [JSONValue] {
    let v: JSONValue = try await client.rpc("community_user_badges", params: UserParams(p_user: userId)).execute().value
    if case .array(let a) = v { return a }
    return []
  }

  /// `useMutedUsers` (phần hàng): còn hạn, hạn gần nhất trước.
  public func mutes(me: String, nowISO: String) async throws -> [JSONValue] {
    try await client.from("community_mutes")
      .select("muted_id, until")
      .eq("user_id", value: me)
      .gt("until", value: nowISO)
      .order("until", ascending: true)
      .execute().value
  }

  /// `useProgressJourney`: 100 bài Tiến trình mới nhất.
  public func journeyPosts(userId: String) async throws -> [JSONValue] {
    try await client.from("community_posts")
      .select("id, created_at, payload")
      .eq("author_id", value: userId)
      .eq("kind", value: "progress")
      .order("created_at", ascending: false)
      .order("id", ascending: false)
      .limit(100)
      .execute().value
  }

  /// `useFollow`: chèn (23505 = đã theo dõi) / xoá phải chạm ≥ 1 hàng.
  public func follow(me: String, userId: String, on: Bool) async throws {
    do {
      if on {
        do {
          try await client.from("community_follows")
            .insert(JSONValue.object(["follower_id": .string(me), "followee_id": .string(userId)])).execute()
        } catch {
          if (error as? PostgrestError)?.code == "23505" { return }
          throw error
        }
      } else {
        let gone: [FolloweeDTO2] = try await client.from("community_follows")
          .delete().eq("follower_id", value: me).eq("followee_id", value: userId)
          .select("followee_id").execute().value
        if gone.isEmpty { throw CommunityModerationFailure.nothingWritten }
      }
    } catch let f as CommunityModerationFailure {
      throw f
    } catch {
      throw Self.moderationFailure(error)
    }
  }

  /// `useMute`: 23505 = đã có dòng (có thể HẾT HẠN) → xoá dòng của mình rồi
  /// chèn lại để có hạn mới 30 ngày (không có policy UPDATE).
  public func mute(me: String, userId: String) async throws {
    let row = JSONValue.object(["muted_id": .string(userId)])
    do {
      do {
        try await client.from("community_mutes").insert(row).execute()
        return
      } catch {
        guard (error as? PostgrestError)?.code == "23505" else { throw error }
      }
      let gone: [MutedIdDTO] = try await client.from("community_mutes")
        .delete().eq("user_id", value: me).eq("muted_id", value: userId)
        .select("muted_id").execute().value
      if gone.isEmpty { throw CommunityModerationFailure.nothingWritten }
      do {
        try await client.from("community_mutes").insert(row).execute()
      } catch {
        if (error as? PostgrestError)?.code == "23505" { return }
        throw error
      }
    } catch let f as CommunityModerationFailure {
      throw f
    } catch {
      throw Self.moderationFailure(error)
    }
  }

  /// `useUnmute`: xoá phải chạm ≥ 1 hàng (`nPgUnmuteGone`).
  public func unmute(me: String, userId: String) async throws {
    let gone: [MutedIdDTO]
    do {
      gone = try await client.from("community_mutes")
        .delete().eq("user_id", value: me).eq("muted_id", value: userId)
        .select("muted_id").execute().value
    } catch {
      throw Self.moderationFailure(error)
    }
    if gone.isEmpty { throw CommunityModerationFailure.nothingWritten }
  }

  /// `useBlock`: 23505 = đã chặn — kết quả người ta muốn.
  public func block(me: String, userId: String) async throws {
    do {
      try await client.from("community_blocks")
        .insert(JSONValue.object(["blocker_id": .string(me), "blocked_id": .string(userId)])).execute()
    } catch {
      if (error as? PostgrestError)?.code == "23505" { return }
      throw Self.moderationFailure(error)
    }
  }

  /// `useReport` cho một người (`reported_user_id`).
  public func reportUser(me: String, userId: String, reason: CommunityReportReason) async throws {
    let row: JSONValue = .object([
      "reporter_id": .string(me), "post_id": .null, "comment_id": .null,
      "reported_user_id": .string(userId), "reason": .string(reason.rawValue),
    ])
    do {
      try await client.from("community_reports").insert(row).execute()
    } catch {
      if (error as? PostgrestError)?.code == "23505" { return }
      throw Self.moderationFailure(error)
    }
  }

  // MARK: - Thích / lưu / menu bài (#527, lát 6)

  struct IdOnly: Decodable, Sendable {
    let id: String
  }

  struct CommentsOffParams: Encodable, Sendable {
    let p_post_id: String
    let p_off: Bool
  }

  /// `useToggle`: chèn (23505 = đã bật) / xoá (không còn dòng = đã tắt ở máy
  /// khác — trạng thái người ta muốn, không phải lỗi).
  public func toggle(_ t: CommunityToggle, postId: String, me: String, on: Bool) async throws {
    let table = t == .like ? "community_likes" : "community_saves"
    do {
      if on {
        do {
          try await client.from(table)
            .insert(JSONValue.object(["post_id": .string(postId), "user_id": .string(me)])).execute()
        } catch {
          if (error as? PostgrestError)?.code == "23505" { return }
          throw error
        }
      } else {
        let _: [PostIdDTO] = try await client.from(table)
          .delete().eq("post_id", value: postId).eq("user_id", value: me)
          .select("post_id").execute().value
      }
    } catch {
      throw Self.moderationFailure(error)
    }
  }

  /// `useHidePost`: ẩn riêng (23505 = đã ẩn).
  public func hidePost(postId: String) async throws {
    do {
      try await client.from("community_post_hides").insert(JSONValue.object(["post_id": .string(postId)])).execute()
    } catch {
      if (error as? PostgrestError)?.code == "23505" { return }
      throw Self.moderationFailure(error)
    }
  }

  /// `useReport` cho một bài (`post_id`); 23505 = đã báo cáo, 54000 = trần.
  public func reportPost(me: String, postId: String, reason: CommunityReportReason) async throws {
    let row: JSONValue = .object([
      "reporter_id": .string(me), "post_id": .string(postId), "comment_id": .null,
      "reported_user_id": .null, "reason": .string(reason.rawValue),
    ])
    do {
      try await client.from("community_reports").insert(row).execute()
    } catch {
      if (error as? PostgrestError)?.code == "23505" { return }
      throw Self.moderationFailure(error)
    }
  }

  /// `useDeletePost`: phải chạm ≥ 1 hàng.
  public func deletePost(me: String, postId: String) async throws {
    let gone: [IdOnly]
    do {
      gone = try await client.from("community_posts")
        .delete().eq("id", value: postId).eq("author_id", value: me)
        .select("id").execute().value
    } catch {
      throw Self.moderationFailure(error)
    }
    if gone.isEmpty { throw CommunityModerationFailure.nothingWritten }
  }

  /// `useSetCommentsOff`: RPC tự kiểm "bài của mình".
  public func setCommentsOff(postId: String, off: Bool) async throws {
    do {
      try await client.rpc("community_set_comments_off", params: CommentsOffParams(p_post_id: postId, p_off: off))
        .execute()
    } catch {
      throw Self.moderationFailure(error)
    }
  }

  // MARK: - Đã lưu (#527, lát 7)

  /// `useSavedPosts`: dòng lưu của mình, mới → cũ theo `(created_at, post_id)`.
  public func saves(me: String, olderThan: String?, limit: Int) async throws -> [JSONValue] {
    var f = client.from("community_saves").select("post_id, created_at").eq("user_id", value: me)
    if let olderThan { f = f.or(olderThan) }
    return try await f.order("created_at", ascending: false).order("post_id", ascending: false)
      .limit(limit).execute().value
  }

  public func posts(ids: [String]) async throws -> [JSONValue] {
    guard !ids.isEmpty else { return [] }
    return try await client.from("community_posts").select(CommunityFeed.postColumns).in("id", values: ids)
      .execute().value
  }

  // MARK: - Tìm (#527, lát 8)

  struct QueryParams: Encodable, Sendable {
    let p_q: String
  }

  private func rpcRows(_ v: JSONValue) -> [JSONValue] {
    if case .array(let a) = v { return a }
    return []
  }

  /// `useSearchPeople`: tối đa 20, server lọc cặp đã chặn nhau.
  public func searchProfiles(term: String) async throws -> [JSONValue] {
    rpcRows(try await client.rpc("community_search_profiles", params: QueryParams(p_q: term)).execute().value)
  }

  /// `useFollowSuggestions`: chính thức trước, rồi người có bài công khai gần đây.
  public func followSuggestions() async throws -> [JSONValue] {
    rpcRows(try await client.rpc("community_follow_suggestions").execute().value)
  }

  /// `useFindRecipes`: theo tên món, không phân biệt dấu.
  public func findRecipes(term: String) async throws -> [JSONValue] {
    rpcRows(try await client.rpc("community_find_recipes", params: QueryParams(p_q: term)).execute().value)
  }

  /// `useSearchPosts`: chú thích + tên trong payload, không phân biệt dấu.
  public func findPosts(term: String) async throws -> [JSONValue] {
    rpcRows(try await client.rpc("community_find_posts", params: QueryParams(p_q: term)).execute().value)
  }

  // MARK: - Hộp thư (#527, lát 9)

  public func notifications(me: String, limit: Int) async throws -> [JSONValue] {
    try await client.from("community_notifications")
      .select("id, actor_id, kind, post_id, challenge_id, milestone, created_at, read_at")
      .eq("user_id", value: me)
      .order("created_at", ascending: false)
      .limit(limit)
      .execute().value
  }

  public func challenges(ids: [String]) async throws -> [JSONValue] {
    guard !ids.isEmpty else { return [] }
    return try await client.from("community_challenges")
      .select("id, title, title_en, description, description_en")
      .in("id", values: ids)
      .execute().value
  }

  public func markNotificationsRead() async throws {
    try await client.rpc("community_mark_notifications_read").execute()
  }

  // MARK: - Quyền riêng tư (#527, lát 10)

  struct BlockedIdDTO: Decodable, Sendable {
    let blocked_id: String
  }

  public func privacySettings(me: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("community_settings")
      .select(CommunityPrivacy.columns)
      .eq("user_id", value: me)
      .limit(1)
      .execute().value
    return rows.first
  }

  public func updateSettings(me: String, patch: [String: JSONValue]) async throws {
    var row = patch
    row["user_id"] = .string(me)
    row["updated_at"] = .string(ISO8601DateFormatter().string(from: Date()))
    do {
      try await client.from("community_settings").upsert(JSONValue.object(row), onConflict: "user_id").execute()
    } catch {
      throw Self.moderationFailure(error)
    }
  }

  public func blocks(me: String) async throws -> [JSONValue] {
    try await client.from("community_blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", value: me)
      .order("created_at", ascending: false)
      .execute().value
  }

  /// `useUnblock`: hỏi lại chính `blocked_id` (bảng không có cột `id`).
  public func unblock(me: String, userId: String) async throws {
    let gone: [BlockedIdDTO]
    do {
      gone = try await client.from("community_blocks")
        .delete().eq("blocker_id", value: me).eq("blocked_id", value: userId)
        .select("blocked_id").execute().value
    } catch {
      throw Self.moderationFailure(error)
    }
    if gone.isEmpty { throw CommunityModerationFailure.nothingWritten }
  }

  /// `useDeleteAllMyPosts`: số bài đã xoá (0 là câu trả lời đúng).
  public func deleteAllPosts(me: String) async throws -> Int {
    do {
      let gone: [IdOnly] = try await client.from("community_posts")
        .delete().eq("author_id", value: me)
        .select("id").execute().value
      return gone.count
    } catch {
      throw Self.moderationFailure(error)
    }
  }

  // MARK: - Chia sẻ (#527, lát 11)

  struct SourceIdDTO: Decodable, Sendable {
    let source_id: String?
  }

  /// `share_workout`: `p_minutes` vắng mặt khi không có (`?? undefined`).
  struct ShareWorkoutParams: Encodable, Sendable {
    let p_session_id: String
    let p_caption: String
    let p_visibility: String
    let p_minutes: Int?
  }

  /// `share_workout_with_art`: `p_minutes` gửi `null` thật khi không có.
  struct ShareWorkoutArtParams: Encodable, Sendable {
    let p_session_id: String
    let p_caption: String
    let p_visibility: String
    let p_minutes: Int?
    let p_art_id: String

    func encode(to encoder: any Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(p_session_id, forKey: .p_session_id)
      try c.encode(p_caption, forKey: .p_caption)
      try c.encode(p_visibility, forKey: .p_visibility)
      try c.encode(p_minutes, forKey: .p_minutes)
      try c.encode(p_art_id, forKey: .p_art_id)
    }
  }

  public func artLibrary() async throws -> [JSONValue] {
    try await client.from("community_art")
      .select(CommunityFeed.artColumns)
      .eq("active", value: true)
      .order("sort")
      .order("id")
      .execute().value
  }

  public func sharedSessionIds(me: String) async throws -> [String] {
    let rows: [SourceIdDTO] = try await client.from("community_posts")
      .select("source_id")
      .eq("author_id", value: me)
      .not("source_id", operator: .is, value: "null")
      .execute().value
    return rows.compactMap(\.source_id)
  }

  public func shareWorkout(
    sessionId: String, caption: String, visibility: CommunityShare.Visibility, minutes: Int?, artId: String?
  ) async throws {
    do {
      if let artId {
        try await client.rpc(
          "share_workout_with_art",
          params: ShareWorkoutArtParams(
            p_session_id: sessionId, p_caption: caption, p_visibility: visibility.rawValue, p_minutes: minutes,
            p_art_id: artId)
        ).execute()
      } else {
        try await client.rpc(
          "share_workout",
          params: ShareWorkoutParams(
            p_session_id: sessionId, p_caption: caption, p_visibility: visibility.rawValue, p_minutes: minutes)
        ).execute()
      }
    } catch {
      throw Self.shareFailure(error)
    }
  }

  /// `build_progress_payload` / `share_progress`: bài sức mạnh vắng mặt khi
  /// không chọn (`?? undefined`).
  struct ProgressParams: Encodable, Sendable {
    let p_weeks: Int
    let p_weight: Bool
    let p_waist: Bool
    let p_lift_exercise_id: String?
    var p_caption: String?
    var p_visibility: String?
  }

  /// `share_progress_with_art`: bài sức mạnh gửi `null` thật khi không chọn.
  struct ProgressArtParams: Encodable, Sendable {
    let p_weeks: Int
    let p_weight: Bool
    let p_waist: Bool
    let p_lift_exercise_id: String?
    let p_caption: String
    let p_visibility: String
    let p_art_id: String

    func encode(to encoder: any Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(p_weeks, forKey: .p_weeks)
      try c.encode(p_weight, forKey: .p_weight)
      try c.encode(p_waist, forKey: .p_waist)
      try c.encode(p_lift_exercise_id, forKey: .p_lift_exercise_id)
      try c.encode(p_caption, forKey: .p_caption)
      try c.encode(p_visibility, forKey: .p_visibility)
      try c.encode(p_art_id, forKey: .p_art_id)
    }
  }

  public func progressPreview(_ o: CommunityShareProgress.Options) async throws -> JSONValue {
    try await client.rpc(
      "build_progress_payload",
      params: ProgressParams(p_weeks: o.weeks, p_weight: o.weight, p_waist: o.waist, p_lift_exercise_id: o.liftId)
    ).execute().value
  }

  public func shareProgress(
    _ o: CommunityShareProgress.Options, caption: String, visibility: CommunityShare.Visibility, artId: String?
  ) async throws {
    do {
      if let artId {
        try await client.rpc(
          "share_progress_with_art",
          params: ProgressArtParams(
            p_weeks: o.weeks, p_weight: o.weight, p_waist: o.waist, p_lift_exercise_id: o.liftId, p_caption: caption,
            p_visibility: visibility.rawValue, p_art_id: artId)
        ).execute()
      } else {
        try await client.rpc(
          "share_progress",
          params: ProgressParams(
            p_weeks: o.weeks, p_weight: o.weight, p_waist: o.waist, p_lift_exercise_id: o.liftId, p_caption: caption,
            p_visibility: visibility.rawValue)
        ).execute()
      }
    } catch {
      throw Self.shareFailure(error)
    }
  }

  struct RecipeParams: Encodable, Sendable {
    let p_entry_id: String
    let p_title: String
    let p_caption: String
    let p_visibility: String
    var p_art_id: String?
  }

  /// `useShareableMeals`: bữa của mình trong cửa sổ, mới trước.
  public func mealEntries(me: String, sinceISO: String) async throws -> [JSONValue] {
    try await client.from("meal_entries")
      .select("id, user_id, date_time, meal_type")
      .eq("user_id", value: me)
      .gte("date_time", value: sinceISO)
      .order("date_time", ascending: false)
      .execute().value
  }

  public func mealItems(entryIds: [String]) async throws -> [JSONValue] {
    guard !entryIds.isEmpty else { return [] }
    return try await client.from("meal_entry_items")
      .select("id, meal_entry_id, food_item_id, food_name, servings, kcal, protein_g, carbs_g, fat_g, created_at")
      .in("meal_entry_id", values: entryIds)
      .execute().value
  }

  public func foodServings(ids: [String]) async throws -> [JSONValue] {
    guard !ids.isEmpty else { return [] }
    return try await client.from("food_items").select("id, serving_g").in("id", values: ids).execute().value
  }

  /// `useShareRecipe`: chỉ ID bữa và phần chữ đi lên.
  public func shareRecipe(
    entryId: String, title: String, caption: String, visibility: CommunityShare.Visibility, artId: String?
  ) async throws {
    let params = RecipeParams(
      p_entry_id: entryId, p_title: title, p_caption: caption, p_visibility: visibility.rawValue, p_art_id: artId)
    do {
      try await client.rpc(artId == nil ? "share_recipe" : "share_recipe_with_art", params: params).execute()
    } catch {
      if let e = error as? PostgrestError, e.code == "22023", e.message.contains("empty meal") {
        throw CommunityShareFailure.emptyMeal
      }
      throw Self.shareFailure(error)
    }
  }

  /// `postingError` + 23505 / P0001 của `useShareWorkout`.
  static func shareFailure(_ error: any Error) -> CommunityShareFailure {
    if NetworkFailure.isOffline(error) { return .offline }
    switch (error as? PostgrestError)?.code {
    case "23505": return .alreadyShared
    case "P0001": return .profileRequired
    case "54000": return .postLimit
    case "CR001": return .restricted
    case let code: return .server(code: code)
    }
  }

  public func artURL(path: String) -> URL? {
    try? client.storage.from("community-art").getPublicURL(path: path)
  }
}
