import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// Đẩy tạm nghỉ hỏng (R2-SYNC-05): lỗi phải thấy được (hook đếm — bản thật nối
/// vào Telemetry), cờ chờ / ảnh đã gửi giữ nguyên để lần sau gửi bù, và lần
/// thử lại thành công thì cờ xoá / ảnh đã gửi cập nhật. Kho giả thay `rows`
/// qua `koaStoreOverride`; mỗi test dùng một tài khoản riêng để không chạm
/// khoá của test khác chạy song song.
@MainActor
@Suite struct KoaPausePushTests {
  @Test func failedPausePushKeepsPendingFlagReportsAndRetries() async {
    let user = "ascnd-test-koa-push-pause"
    let d = UserDefaults.standard
    let pendingKey = "koa.pause.pending.\(user)"
    let pauseKey = "koa.pause.\(user)"
    d.removeObject(forKey: pendingKey)
    d.removeObject(forKey: pauseKey)
    defer {
      d.removeObject(forKey: pendingKey)
      d.removeObject(forKey: pauseKey)
    }

    let s = AppServices()
    let store = FakeKoaStore()
    s.koaStoreOverride = store
    var reported: [String] = []
    s.onKoaPausePushFailure = { reported.append($0) }

    d.set(true, forKey: pendingKey)
    #expect(await s.syncKoaPause(userId: user) == false)
    #expect(d.bool(forKey: pendingKey) == true, "Đẩy hỏng thì cờ chờ vẫn còn")
    #expect(reported == ["pause"])
    #expect(await store.upserts == 1)

    await store.setFailing(false)
    #expect(await s.syncKoaPause(userId: user) == false)
    #expect(d.object(forKey: pendingKey) == nil, "Đẩy lại thành thì cờ xoá")
    #expect(await store.upserts == 2)
    #expect(reported == ["pause"], "Lần thử lại thành không báo thêm lỗi")
  }

  @Test func failedPauseLogPushKeepsSyncedSnapshotReportsAndRetries() async throws {
    let user = "ascnd-test-koa-push-log"
    let d = UserDefaults.standard
    let logKey = "koa.pauselog.\(user)"
    let syncedKey = "koa.pauselog.synced.\(user)"
    d.removeObject(forKey: logKey)
    d.removeObject(forKey: syncedKey)
    defer {
      d.removeObject(forKey: logKey)
      d.removeObject(forKey: syncedKey)
    }
    // Sổ trên máy có một đợt quanh hôm nay để `pruned` không cắt.
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let log = KoaPauseLog([KoaPause(start: today.adding(days: -2), last: today.adding(days: 1))])
    d.set(try JSONEncoder().encode(log), forKey: logKey)

    let s = AppServices()
    let store = FakeKoaStore()
    s.koaStoreOverride = store
    var reported: [String] = []
    s.onKoaPausePushFailure = { reported.append($0) }

    #expect(await s.syncKoaPauseLog(userId: user) == false)
    #expect(reported == ["pause_log"])
    #expect(await store.upserts == 1)
    #expect(d.data(forKey: syncedKey) == nil, "Đẩy hỏng thì ảnh đã gửi không đổi")

    await store.setFailing(false)
    #expect(await s.syncKoaPauseLog(userId: user) == false)
    #expect(await store.upserts == 2)
    #expect(reported == ["pause_log"], "Lần thử lại thành không báo thêm lỗi")
    let synced = d.data(forKey: syncedKey).flatMap { try? JSONDecoder().decode(KoaPauseLog.self, from: $0) }
    #expect(synced == log, "Đẩy lại thành thì ảnh đã gửi bằng sổ trên máy")
  }
}

/// Kho tạm nghỉ giả: `upsert` hỏng cho tới khi tắt, `select` trả rỗng.
private actor FakeKoaStore: RowStore {
  var failing = true
  private(set) var upserts = 0

  func setFailing(_ value: Bool) { failing = value }

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] { [] }
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }

  func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {
    upserts += 1
    if failing { throw RowStoreError(code: nil, message: "koa push boom") }
  }
}
