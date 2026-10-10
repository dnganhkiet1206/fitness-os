public import ASCNDCore
import Foundation
import Supabase

/// Đọc feed Cộng đồng (#527, lát 1) — cùng truy vấn với `use-community.ts` @
/// fac9ac2. Mọi lệnh đi qua RLS: chặn hai chiều, riêng tư, ẩn, tắt tiếng do
/// server lọc (`20260927120000_community_foundation.sql`,
/// `20261007220000_community_report_trust.sql`); thích / lưu chỉ đọc hàng của
/// mình.
public struct SupabaseCommunity: CommunityFeedRemote {
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

  public func artURL(path: String) -> URL? {
    try? client.storage.from("community-art").getPublicURL(path: path)
  }
}
