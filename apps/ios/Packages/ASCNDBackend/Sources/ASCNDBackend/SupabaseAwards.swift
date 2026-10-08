public import ASCNDCore
import Foundation
import Supabase

/// Đọc / ghi cho màn huy chương (#527) — cùng truy vấn với RN (`useAwards`,
/// `readAwardSources`, `useCheckAwards.grant` trong `hooks/use-extras.ts`); mọi
/// truy vấn lọc `user_id` của phiên (RLS cũng chỉ cho đọc / ghi hàng của mình).
public struct SupabaseAwardsSource: AwardsSource {
  private let client: SupabaseClient
  /// Chuỗi ngày + băng: cùng truy vấn với phòng linh vật, một chỗ viết.
  private let mascot: SupabaseMascotSource

  public init(backend: Backend) {
    self.client = backend.client
    self.mascot = SupabaseMascotSource(backend: backend)
  }

  struct EarnedDTO: Decodable, Sendable {
    let award_key: String?
    let title: String?
    let description: String?
    let earned_at: String?
  }

  public func earned(userId: String) async throws -> [EarnedAward] {
    let rows: [EarnedDTO] = try await client.from("awards")
      .select("id, award_key, title, description, icon, tier, earned_at")
      .eq("user_id", value: userId)
      .order("earned_at", ascending: false)
      .execute().value
    return rows.compactMap { r in
      guard let key = r.award_key else { return nil }
      return EarnedAward(
        key: key, earnedAt: r.earned_at.flatMap { EpochMillis(iso8601: $0) }, title: r.title,
        description: r.description)
    }
  }

  /// `count: 'exact', head: true` — server chỉ trả con số.
  private func count(_ table: String, userId: String, prOnly: Bool = false) async throws -> Int {
    var q = client.from(table).select("id", head: true, count: .exact).eq("user_id", value: userId)
    if prOnly { q = q.eq("pr_detected", value: true) }
    return try await q.execute().count ?? 0
  }

  struct StepsDTO: Decodable, Sendable {
    let steps: JSONValue?
  }

  struct WaterDTO: Decodable, Sendable {
    let date: String?
  }

  /// `readAllPages` của nước: 1 000 hàng / trang, tối đa 50 trang; trang hỏng
  /// hay vượt trần → ném (số ngày là "không đọc được", không phải một số thiếu).
  private func waterDates(userId: String) async throws -> [String] {
    let size = 1000
    var out: [String] = []
    for i in 0..<50 {
      let rows: [WaterDTO] = try await client.from("water_logs")
        .select("id, date")
        .eq("user_id", value: userId)
        .order("date", ascending: true)
        .order("id", ascending: true)
        .range(from: i * size, to: i * size + size - 1)
        .execute().value
      out.append(contentsOf: rows.compactMap(\.date))
      if rows.count < size { return out }
    }
    throw TooManyRows()
  }

  public func raw(userId: String, today: LocalDate) async -> Awards.Raw {
    let m = mascot
    // Mỗi nguồn hỏng thì nguồn ấy `nil` — các nguồn khác không đổ theo.
    async let logged = try? await m.loggedDates(userId: userId, limit: Streak.window)
    async let frozen = try? await m.freezes(userId: userId)
    async let workouts = try? await count("workout_sessions", userId: userId)
    async let prs = try? await count("workout_sessions", userId: userId, prOnly: true)
    async let steps: [StepsDTO]? = try? await client.from("daily_logs")
      .select("steps")
      .eq("user_id", value: userId)
      .eq("date", value: today.description)
      .limit(1)
      .execute().value
    async let meals = try? await count("meal_entries", userId: userId)
    async let water = try? await waterDates(userId: userId)
    async let sleeps = try? await count("sleep_logs", userId: userId)
    async let weighs = try? await count("weight_logs", userId: userId)
    return await Awards.Raw(
      loggedDates: logged,
      // Băng đọc lỗi → coi như không có (bảng đến bằng migration, như RN).
      frozen: (frozen ?? []).compactMap(\.usedOn),
      workoutCount: workouts, prCount: prs,
      steps: steps?.first.flatMap { SupabaseMascotSource.number($0.steps) },
      mealCount: meals, waterDates: water, sleepCount: sleeps, weighCount: weighs)
  }

  struct GrantRow: Encodable, Sendable {
    let user_id: String
    let award_type: String
    let award_key: String
    let title: String
    let description: String
    let icon: String
    let tier: String
    let metadata: [String: JSONValue]
  }

  public func grant(
    userId: String, award: Awards.Def, title: String, description: String, metadata: [String: JSONValue]
  ) async throws(AwardGrantError) {
    do {
      try await client.from("awards").insert(
        GrantRow(
          user_id: userId, award_type: award.type, award_key: award.key, title: title, description: description,
          icon: award.icon, tier: award.tier.rawValue, metadata: metadata)
      ).execute()
    } catch {
      throw AwardGrantError(code: (error as? PostgrestError)?.code)
    }
  }
}

/// `TooManyRowsError`: quá 50 trang × 1 000 hàng.
struct TooManyRows: Error {}
