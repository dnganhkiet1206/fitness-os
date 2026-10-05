import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// Ranh giới tài khoản của `read_cache` (#431): mọi không gian tên theo người
/// dùng, qua đăng xuất, đổi tài khoản, lượt làm mới muộn và kill / mở lại.

/// Một không gian tên: ghi một giá trị cho `user` qua đúng API của cache, và
/// đọc lại xem có gì không.
private struct Probe {
  let name: String
  let write: (String) async throws -> Void
  let read: (String) async throws -> Bool
}

private func probes(_ db: ASCNDDatabase) -> [Probe] {
  let templates = GRDBTemplateCache(db), records = GRDBRecordBookCache(db), perf = GRDBPerformanceCache(db)
  let history = GRDBHistoryCache(db), insights = GRDBInsightCache(db), library = GRDBExerciseCache(db)
  let guides = GRDBExerciseGuideCache(db), onboarding = GRDBOnboardingStore(db), profiles = GRDBProfileCache(db)
  let entry = HistoryEntry(
    id: "s1", at: EpochMillis(1), templateName: "Push", sessionRpe: 8, volumeKg: 480, prDetected: false,
    completedSets: 1, exerciseCount: 1)
  return [
    Probe(name: ReadCacheNamespace.templates,
          write: { try await templates.save(userId: $0, TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1))) },
          read: { try await templates.load(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.recordBests,
          write: { try await records.save(userId: $0, PersonalRecords.bests(from: [RecordSet(exerciseName: "Bench", weightKg: 100, reps: 5)])) },
          read: { try await records.load(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.lastPerformance,
          write: { try await perf.save(userId: $0, [:]) },
          read: { try await perf.load(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.workoutHistory,
          write: { try await history.save(userId: $0, [entry]) },
          read: { try await history.load(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.exerciseInsights,
          write: { try await insights.save(userId: $0, InsightSnapshot(rows: [], weighIns: [])) },
          read: { try await insights.load(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.exerciseLibrary,
          write: { try await library.save(userId: $0, [LibraryExercise(id: "e", userId: $0, name: "Mine", muscleGroup: nil, equipment: nil, kind: nil)]) },
          read: { try await library.load(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.exerciseGuide,
          write: { try await guides.save(userId: $0, key: "bench|vi", ExerciseGuide.unknown(name: "Bench")) },
          read: { try await guides.load(userId: $0, key: "bench|vi") != nil }),
    Probe(name: ReadCacheNamespace.onboardingDraft,
          write: { try await onboarding.saveDraft(userId: $0, OnboardingDraft()) },
          read: { try await onboarding.loadDraft(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.onboardingCompleted,
          write: { try await onboarding.saveCompleted(userId: $0, true) },
          read: { try await onboarding.loadCompleted(userId: $0) != nil }),
    Probe(name: ReadCacheNamespace.profile,
          write: { try await profiles.save(userId: $0, Profile(row: .object(["user_id": .string($0), "name": .string("A")]))!) },
          read: { try await profiles.load(userId: $0) != nil }),
  ]
}

/// Số hàng của `userId` trên đĩa — đọc thẳng, qua mặt chốt.
private func rows(_ db: ASCNDDatabase, _ userId: String) throws -> Int {
  try db.queue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM read_cache WHERE userId = ?", arguments: [userId]) ?? 0 }
}

/// Dọn của phiên như `AppServices`: đóng chốt TRƯỚC, rồi xoá.
private func signOut(_ db: ASCNDDatabase) async throws {
  db.accounts.signOut()
  try await GRDBTemplateCache(db).clearAll()
}

/// Mở phiên như `AppServices.forgetOtherAccounts`: mở chốt, rồi dọn người khác.
private func signIn(_ db: ASCNDDatabase, _ userId: String) async throws {
  db.accounts.signIn(userId)
  try await GRDBTemplateCache(db).clearAll(except: userId)
}

struct AccountIsolationTests {
  /// Test này phủ MỌI không gian tên đã khai báo — thêm cache mới mà không
  /// khai báo thì `put` trượt assert; khai báo mà không thêm probe thì đỏ ở đây.
  @Test func probesCoverEveryRegisteredNamespace() async throws {
    let db = try ASCNDDatabase()
    for p in probes(db) { try await p.write("a") }
    let kinds = try await db.queue.read { try String.fetchAll($0, sql: "SELECT DISTINCT kind FROM read_cache") }
    let covered = Set(kinds.map { k in ReadCacheNamespace.prefixes.first { k.hasPrefix($0) } ?? k })
    #expect(covered == ReadCacheNamespace.fixed.union(ReadCacheNamespace.prefixes))
    #expect(kinds.allSatisfy(ReadCacheNamespace.isRegistered))
  }

  /// Đăng xuất: không còn gì của A, và lượt làm mới muộn của A (về SAU lượt
  /// xoá) không ghi lại được — máy không ai đăng nhập thì không có dữ liệu ai.
  @Test func lateRefreshAfterSignOutWritesNothing() async throws {
    let db = try ASCNDDatabase()
    try await signIn(db, "a")
    for p in probes(db) { try await p.write("a") }
    for p in probes(db) { #expect(try await p.read("a"), "\(p.name)") }
    try await signOut(db)
    for p in probes(db) { try await p.write("a") }  // lượt làm mới muộn
    #expect(try rows(db, "a") == 0)
    for p in probes(db) { #expect(try await !p.read("a"), "\(p.name)") }
  }

  /// Đổi thẳng tài khoản (A → B, không qua màn đăng nhập): B không đọc được gì
  /// của A, ghi muộn của A bị bỏ, và B đọc / ghi bình thường.
  @Test func accountSwitchIsolatesBothWays() async throws {
    let db = try ASCNDDatabase()
    try await signIn(db, "a")
    for p in probes(db) { try await p.write("a") }
    try await signOut(db)
    try await signIn(db, "b")
    for p in probes(db) {
      try await p.write("a")  // lượt làm mới muộn của A
      #expect(try await !p.read("a"), "\(p.name): B không đọc được A")
      try await p.write("b")
      #expect(try await p.read("b"), "\(p.name): B dùng được cache của mình")
    }
    #expect(try rows(db, "a") == 0)
  }

  /// Hàng của A còn sót trên đĩa từ một bản build cũ (trước chốt): B đăng
  /// nhập thì dọn; trong lúc chưa dọn, chốt đã không cho đọc.
  @Test func leftoverRowsAreNeverReadByTheNextAccount() async throws {
    let db = try ASCNDDatabase()
    for p in probes(db) { try await p.write("a") }  // chưa có chốt
    db.accounts.signIn("b")
    for p in probes(db) { #expect(try await !p.read("a"), "\(p.name)") }
    try await GRDBTemplateCache(db).clearAll(except: "b")
    #expect(try rows(db, "a") == 0)
  }

  /// Kill / mở lại (cùng tệp): dữ liệu của A không sống lại sau đăng xuất,
  /// kể cả khi lượt ghi muộn tới trước lúc app chết.
  @Test func killAndReopenKeepsTheBoundary() async throws {
    let path = FileManager.default.temporaryDirectory.appendingPathComponent("iso-\(UUID().uuidString).sqlite").path
    defer { try? FileManager.default.removeItem(atPath: path) }
    do {
      let db = try ASCNDDatabase(path: path)
      try await signIn(db, "a")
      for p in probes(db) { try await p.write("a") }
      try await signOut(db)
      for p in probes(db) { try await p.write("a") }
    }
    let reopened = try ASCNDDatabase(path: path)
    #expect(try rows(reopened, "a") == 0)
    reopened.accounts.signOut()  // như AppServices lúc mở
    for p in probes(reopened) { #expect(try await !p.read("a"), "\(p.name)") }
    try await signIn(reopened, "a")
    for p in probes(reopened) { try await p.write("a") }
    for p in probes(reopened) { #expect(try await p.read("a"), "\(p.name): người cũ đăng nhập lại vẫn dùng được") }
  }

  /// Chốt: tên tài khoản không phân biệt hoa thường; tên rỗng không bao giờ.
  @Test func scopeMatchesCaseInsensitivelyAndNeverEmpty() {
    let s = AccountScope()
    #expect(s.allows("x") && !s.allows(""))
    s.signIn("ABC")
    #expect(s.allows("abc") && s.allows("ABC") && !s.allows("abd"))
    s.signOut()
    #expect(!s.allows("abc"))
  }
}
