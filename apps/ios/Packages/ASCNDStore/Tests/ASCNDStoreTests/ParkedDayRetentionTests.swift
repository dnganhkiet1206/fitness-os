import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// Hạn giữ của ngày tập đỗ lại (R3-DATA-01): ngày quá 14 ngày của chủ khác
/// với người của phiên khôi phục thì lượt dọn lúc mở app bỏ — ngày của tài
/// khoản không bao giờ quay lại không nằm trên máy vô hạn. Ngày trong cửa sổ
/// vẫn đỗ lại cho lần đăng nhập sau; ngày của chính chủ không bao giờ bị
/// chạm ở lượt này (ngoại lệ #469).

private let retentionToday = LocalDate("2026-10-05")!

private func retentionKey(daysAgo: Int) -> String {
  DayProgressStore.key(date: retentionToday.adding(days: -daysAgo), templateId: "tpl")
}

/// Gieo một hàng `workout_day` thẳng lên đĩa, qua mặt chốt.
private func seedParkedDay(_ db: ASCNDDatabase, owner: String, key: String) async throws {
  try await db.queue.write { db in
    try db.execute(
      sql: "INSERT INTO workout_day (userId, key, state) VALUES (?, ?, ?)",
      arguments: [owner, key, #"{"progress":{"done":{}}}"#])
  }
}

/// Mọi hàng còn lại, dạng `chủ|khoá`, xếp theo thứ tự — đọc thẳng trên đĩa,
/// qua mặt chốt.
private func remainingParkedDays(_ db: ASCNDDatabase) throws -> [String] {
  try db.queue.read { try String.fetchAll($0, sql: "SELECT userId || '|' || key FROM workout_day") }.sorted()
}

struct ParkedDayRetentionTests {
  /// Lượt dọn lúc mở app, chốt đóng: ngày quá hạn của người khác đi, ngày
  /// trong cửa sổ của họ ở lại, ngày của chính chủ (dù quá hạn) ở lại — kể
  /// cả khi tên chủ khác hoa thường. Hàng `#legacy` cũng chỉ mất hàng quá hạn.
  @Test func launchPruneOnlyTouchesOtherOwnersStaleDays() async throws {
    let db = try ASCNDDatabase()
    let life = AccountLifecycle(db)
    life.launched()
    try await seedParkedDay(db, owner: "a", key: retentionKey(daysAgo: 20))
    try await seedParkedDay(db, owner: "a", key: retentionKey(daysAgo: 0))
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 20))
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 0))
    try await seedParkedDay(db, owner: AccountScope.legacyOwner, key: retentionKey(daysAgo: 20))
    try await seedParkedDay(db, owner: AccountScope.legacyOwner, key: retentionKey(daysAgo: 0))
    // Khoá không đọc được ngày: theo ngữ nghĩa `stale` thì bỏ.
    try await seedParkedDay(db, owner: "b", key: "routine-day:khong-phai-ngay:tpl")

    await life.pruneParkedStaleDays(except: "A", today: retentionToday)
    #expect(db.accounts.current == .signedOut, "lượt dọn không mở chốt")
    #expect(
      try remainingParkedDays(db)
        == [
          AccountScope.legacyOwner + "|" + retentionKey(daysAgo: 0),
          "a|" + retentionKey(daysAgo: 20),
          "a|" + retentionKey(daysAgo: 0),
          "b|" + retentionKey(daysAgo: 0),
        ])
  }

  /// Không có phiên khôi phục: ngày quá hạn của MỌI người đi, ngày trong cửa
  /// sổ của ai cũng ở lại — tài khoản không quay lại không giữ ngày vô hạn.
  @Test func launchPruneWithNoSessionPrunesEveryOwnersStaleDays() async throws {
    let db = try ASCNDDatabase()
    let life = AccountLifecycle(db)
    life.launched()
    for owner in ["a", "b"] {
      try await seedParkedDay(db, owner: owner, key: retentionKey(daysAgo: 20))
      try await seedParkedDay(db, owner: owner, key: retentionKey(daysAgo: 0))
    }
    await life.pruneParkedStaleDays(except: nil, today: retentionToday)
    #expect(
      try remainingParkedDays(db)
        == ["a|" + retentionKey(daysAgo: 0), "b|" + retentionKey(daysAgo: 0)])
  }

  /// Ranh giới cửa sổ: ngày thứ 14 trở về trước là quá hạn (`<=`, như
  /// `DayProgressStore.stale`), ngày thứ 13 vẫn trong cửa sổ.
  @Test func staleBoundaryIsFourteenDays() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 14))
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 13))
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 15))
    let removed = try await store.pruneStaleDays(except: "a", today: retentionToday)
    #expect(removed == 2)
    #expect(try remainingParkedDays(db) == ["b|" + retentionKey(daysAgo: 13)])
  }

  /// Lượt dọn trả về số ngày bỏ, chạy lại thì không còn gì để bỏ, và chủ
  /// được giữ thì không mất ngày nào dù quá hạn.
  @Test func pruneStaleDaysReportsCountAndIsIdempotent() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    try await seedParkedDay(db, owner: "a", key: retentionKey(daysAgo: 30))
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 30))
    try await seedParkedDay(db, owner: "b", key: retentionKey(daysAgo: 1))
    #expect(try await store.pruneStaleDays(except: "a", today: retentionToday) == 1)
    #expect(try await store.pruneStaleDays(except: "a", today: retentionToday) == 0)
    #expect(
      try remainingParkedDays(db)
        == ["a|" + retentionKey(daysAgo: 30), "b|" + retentionKey(daysAgo: 1)])
  }
}
