public import ASCNDCore
import Foundation
import GRDB

/// `OnboardingStore` trên SQLite (#424): nháp của luồng và cờ "đã xong" lần
/// cuối biết được, theo người dùng, trong `read_cache` — đăng xuất xoá cùng,
/// đăng nhập dọn của người khác (#397).
public final class GRDBOnboardingStore: OnboardingStore {
  static let draftKind = ReadCacheNamespace.onboardingDraft
  static let completedKind = ReadCacheNamespace.onboardingCompleted
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  private func read(_ userId: String, _ kind: String) async throws -> String? {
    try await table.string(userId: userId, kind: kind)
  }

  private func write(_ userId: String, _ kind: String, _ json: String) async throws {
    try await table.put(json, userId: userId, kind: kind)
  }

  /// Nháp hỏng (bản build khác ghi) = bắt đầu lại từ màn đầu, không kẹt.
  public func loadDraft(userId: String) async throws -> OnboardingDraft? {
    guard let json = try await read(userId, Self.draftKind) else { return nil }
    return try? JSONDecoder().decode(OnboardingDraft.self, from: Data(json.utf8))
  }

  public func saveDraft(userId: String, _ draft: OnboardingDraft) async throws {
    try await write(userId, Self.draftKind, try OutboxStore.json(draft))
  }

  public func clearDraft(userId: String) async throws {
    try await table.delete(userId: userId, kind: Self.draftKind)
  }

  public func loadCompleted(userId: String) async throws -> Bool? {
    try await read(userId, Self.completedKind).map { $0 == "true" }
  }

  public func saveCompleted(userId: String, _ done: Bool) async throws {
    try await write(userId, Self.completedKind, done ? "true" : "false")
  }
}
