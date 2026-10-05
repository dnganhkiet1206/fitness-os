public import ASCNDCore
import Foundation
import Supabase

/// Cờ `profiles.onboarding_completed` — cổng của `_layout.tsx:292`.
public struct SupabaseOnboardingStatus: OnboardingStatusSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct Row: Decodable, Sendable {
    let onboarding_completed: Bool?
  }

  public func onboardingCompleted(userId: String) async throws -> Bool? {
    let rows: [Row] = try await client.from("profiles")
      .select("onboarding_completed")
      .eq("user_id", value: userId)
      .limit(1)
      .execute().value
    guard let row = rows.first else { return nil }
    // Cột nullable: `null` là CHƯA xong (`!profile.onboarding_completed`).
    return row.onboarding_completed ?? false
  }
}

/// Câu ghi cuối của onboarding (`onboarding-flow.tsx:410`): `upsert profiles
/// … onConflict: 'user_id'`.
public struct SupabaseOnboardingWriter: OnboardingWriter {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func completeOnboarding(userId: String, row: JSONValue) async throws {
    guard row["user_id"]?.stringValue?.lowercased() == userId.lowercased() else {
      throw OnboardingFailure.server(code: "wrong-user")
    }
    do {
      try await client.from("profiles").upsert(row, onConflict: "user_id").execute()
    } catch {
      if NetworkFailure.isOffline(error) { throw OnboardingFailure.offline }
      throw OnboardingFailure.server(code: (error as? PostgrestError)?.code)
    }
  }
}

/// Hồ sơ (#425): `useProfile` — `select('*') … eq('user_id')`.
public struct SupabaseProfileSource: ProfileSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func profile(userId: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("profiles")
      .select("*")
      .eq("user_id", value: userId)
      .limit(1)
      .execute().value
    return rows.first
  }
}

/// Lưu hồ sơ (`edit-profile.tsx:275`): `update … eq('user_id')` qua
/// `confirmWrite` — không chạm hàng nào là lỗi `nothingWritten`.
public struct SupabaseProfileWriter: ProfileWriter {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct Touched: Decodable, Sendable {
    let user_id: String?
  }

  public func update(userId: String, row: JSONValue) async throws {
    let touched: [Touched]
    do {
      touched = try await client.from("profiles")
        .update(row)
        .eq("user_id", value: userId)
        .select("user_id")
        .execute().value
    } catch {
      if NetworkFailure.isOffline(error) { throw ProfileSaveFailure.offline }
      throw ProfileSaveFailure.server(code: (error as? PostgrestError)?.code)
    }
    if touched.isEmpty { throw ProfileSaveFailure.nothingWritten }
  }
}
