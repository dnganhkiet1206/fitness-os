public import ASCNDCore
import Foundation
import Supabase

/// Một lượt đọc `workout_sessions` chung cho ba nguồn (R2-OPS-08): màn lịch
/// sử, "lần trước" và màn Today đều đọc các buổi trong cửa sổ lùi — ba truy
/// vấn chồng nhau, chỉ khác cột và mốc `since`. Lượt đọc chung lấy hợp các cột;
/// lượt đọc nào phủ được cửa sổ gọi thì dùng lại, rồi mỗi nguồn lọc trong bộ
/// nhớ theo đúng cửa sổ của mình.
///
/// - Một `Backend` có đúng MỘT bộ đọc chung: ba nguồn dựng từ cùng backend tự
///   chia sẻ, không cần truyền thêm gì.
/// - Lượt đang bay được chia: hai lượt gọi cùng người, lượt bay phủ được cửa
///   sổ của lượt sau (`since` bay ≤ `since` gọi) thì chỉ một chuyến mạng.
/// - Kết quả còn tươi trong 60 giây (`staleAfterMillis`, như `WorkoutFlow`):
///   các lượt làm mới nối nhau trong một chu kỳ (ra tiền cảnh, đổi tab) không
///   đọc lại. Lệnh trên máy vẫn hiện ngay — các sổ áp lệnh chờ LÊN trên hàng
///   đọc về; chỉ thay đổi từ máy khác mới chậm tối đa 60 giây.
/// - Lỗi không lưu: lượt sau đọc lại. Người khác nhau không bao giờ chia nhau.
actor SharedWorkoutSessions {
  /// Hợp các cột ba nguồn cần: lịch sử (`id, date_time, template_name,
  /// session_rpe, volume_load, pr_detected, sets`), "lần trước" (`id,
  /// date_time, sets`), Today (`date_time`, buổi trong ngày thêm `template_id`).
  static let columns = "id, date_time, template_name, template_id, session_rpe, volume_load, pr_detected, sets"
  static let staleAfterMillis: Int64 = 60_000

  private struct Completed {
    let since: EpochMillis
    let rows: [JSONValue]
    let at: EpochMillis
  }

  private struct InFlight {
    let id: UUID
    let since: EpochMillis
    let task: Task<[JSONValue], any Error>
  }

  private let fetch: @Sendable (String, EpochMillis) async throws -> [JSONValue]
  private let ttlMillis: Int64
  private let now: @Sendable () -> EpochMillis
  private var completed: [String: Completed] = [:]
  private var inFlight: [String: InFlight] = [:]

  init(
    fetch: @escaping @Sendable (String, EpochMillis) async throws -> [JSONValue],
    ttlMillis: Int64 = SharedWorkoutSessions.staleAfterMillis,
    now: @escaping @Sendable () -> EpochMillis = { EpochMillis(Int64(Date().timeIntervalSince1970 * 1000)) }
  ) {
    self.fetch = fetch
    self.ttlMillis = ttlMillis
    self.now = now
  }

  /// Hàng trong [`since`, ∞), mới trước — như `gte('date_time')` của truy vấn
  /// cũ. Hàng không đọc được `date_time` thì bỏ (ba nguồn cũ cũng bỏ).
  func rows(userId: String, since: EpochMillis) async throws -> [JSONValue] {
    try await covering(userId: userId, since: since).filter { row in
      row["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) }.map { $0.millis >= since.millis } ?? false
    }
  }

  /// Hàng trong [`from`, `to`), mới trước — như `gte` + `lt` của truy vấn buổi
  /// trong ngày cũ.
  func rows(userId: String, from: EpochMillis, to: EpochMillis) async throws -> [JSONValue] {
    try await covering(userId: userId, since: from).filter { row in
      guard let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }) else { return false }
      return at.millis >= from.millis && at.millis < to.millis
    }
  }

  /// Hàng của một lượt đọc phủ được [`since`, ∞): lượt cũ còn tươi, lượt đang
  /// bay, hoặc lượt mới. Chưa lọc — bên gọi lọc theo cửa sổ của mình.
  private func covering(userId: String, since: EpochMillis) async throws -> [JSONValue] {
    let key = userId.lowercased()
    if let done = completed[key], done.since.millis <= since.millis, now().millis - done.at.millis < ttlMillis {
      return done.rows
    }
    if let flying = inFlight[key], flying.since.millis <= since.millis {
      return try await flying.task.value
    }
    let fetch = self.fetch
    let id = UUID()
    let task = Task<[JSONValue], any Error>.detached {
      try await fetch(userId, since)
    }
    inFlight[key] = InFlight(id: id, since: since, task: task)
    do {
      let rows = try await task.value
      if inFlight[key]?.id == id { inFlight[key] = nil }
      // Lượt rộng nhất thắng: lượt hẹp hơn về sau không thu hẹp bộ nhớ.
      if let done = completed[key], done.since.millis <= since.millis, now().millis - done.at.millis < ttlMillis {
        return rows
      }
      completed[key] = Completed(since: since, rows: rows, at: now())
      return rows
    } catch {
      if inFlight[key]?.id == id { inFlight[key] = nil }
      throw error
    }
  }
}

extension SharedWorkoutSessions {
  /// Lượt đọc thật trên Supabase: hợp các cột, của người, từ `since`, mới trước.
  static func supabase(client: SupabaseClient) -> SharedWorkoutSessions {
    SharedWorkoutSessions(fetch: { userId, since in
      let rows: [JSONValue] = try await client.from("workout_sessions")
        .select(SharedWorkoutSessions.columns)
        .eq("user_id", value: userId)
        .gte("date_time", value: WorkoutSessionRecord.iso8601(since))
        .order("date_time", ascending: false)
        .execute().value
      return rows
    })
  }
}
