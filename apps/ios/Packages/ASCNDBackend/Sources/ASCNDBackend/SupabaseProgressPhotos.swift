public import ASCNDCore
import Foundation
import Supabase

/// Ảnh tiến trình (#527) — `use-progress-photos.ts` @ fac9ac2: bảng
/// `progress_photos` (RLS "CRUD own") + bucket RIÊNG TƯ `progress-photos`
/// (chính sách theo thư mục đầu = uid). Mọi lệnh lọc `user_id` của phiên; ghi
/// chỉ khi có mạng — không qua hàng đợi offline.
public struct SupabaseProgressPhotos: ProgressPhotoRemote {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  private var storage: StorageFileApi { client.storage.from(ProgressPhotos.bucket) }

  public func rows(userId: String, from: Int) async throws -> [JSONValue] {
    do {
      return try await client.from("progress_photos")
        .select("*")
        .eq("user_id", value: userId)
        .order("date", ascending: false)
        .order("id", ascending: false)
        .range(from: from, to: from + ProgressPhotos.page - 1)
        .execute().value
    } catch {
      throw Self.failure(error)
    }
  }

  public func sign(paths: [String], expiresIn: Int) async throws -> [String: URL] {
    do {
      let results = try await storage.createSignedURLs(paths: paths, expiresIn: expiresIn)
      var out: [String: URL] = [:]
      for r in results {
        if case .success(let path, let url) = r { out[path] = url }
      }
      return out
    } catch {
      throw Self.failure(error)
    }
  }

  public func upload(path: String, jpeg: Data) async throws {
    do {
      try await storage.upload(path, data: jpeg, options: FileOptions(contentType: "image/jpeg"))
    } catch {
      throw Self.failure(error)
    }
  }

  struct Row: Encodable, Sendable {
    let user_id: String
    let date: String
    let photo_url: String
    let pose: String
    let notes: String
  }

  public func insert(userId: String, date: LocalDate, path: String, pose: String) async throws {
    do {
      _ = try await client.from("progress_photos")
        .insert(Row(user_id: userId, date: date.description, photo_url: path, pose: pose, notes: ""))
        .execute()
    } catch {
      throw Self.failure(error)
    }
  }

  public func deleteRow(id: String, userId: String) async throws -> Int {
    do {
      let gone: [JSONValue] = try await client.from("progress_photos")
        .delete()
        .eq("id", value: id)
        .eq("user_id", value: userId)
        .select("id")
        .execute().value
      return gone.count
    } catch {
      throw Self.failure(error)
    }
  }

  public func removeObject(path: String) async throws {
    do {
      _ = try await storage.remove(paths: [path])
    } catch {
      throw Self.failure(error)
    }
  }

  static func failure(_ error: any Error) -> ProgressPhotosFailure {
    NetworkFailure.isOffline(error) ? .offline : .server
  }
}
