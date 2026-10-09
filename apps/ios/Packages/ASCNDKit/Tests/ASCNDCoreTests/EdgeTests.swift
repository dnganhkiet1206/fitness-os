@testable import ASCNDCore
import Foundation
import Testing

/// `classify` của `lib/edge-failure.ts` @ fac9ac2, từng nhánh.
struct EdgeClassifyTests {
  @Test func statusFirstThenMessage() {
    #expect(EdgeFunction.classify(status: 404, message: "network") == .notDeployed)
    #expect(EdgeFunction.classify(status: 401, message: "") == .unauthorised)
    #expect(EdgeFunction.classify(status: 403, message: "") == .unauthorised)
    #expect(EdgeFunction.classify(status: 429, message: "") == .rateLimited)
    #expect(EdgeFunction.classify(status: 500, message: "") == .providerError)
    #expect(EdgeFunction.classify(status: 503, message: "") == .providerError)
    #expect(EdgeFunction.classify(status: 400, message: "") == .unknown)
    #expect(EdgeFunction.classify(status: nil, message: "Failed to send a request to the Edge Function") == .offline)
    #expect(EdgeFunction.classify(status: nil, message: "TypeError: Failed to fetch") == .offline)
    #expect(EdgeFunction.classify(status: nil, message: "Network request failed") == .offline)
    #expect(EdgeFunction.classify(status: nil, message: "fetch failed") == .offline)
    #expect(EdgeFunction.classify(status: nil, message: "boom") == .unknown)
  }

  @Test func functionNamesAreTheDeploymentList() {
    #expect(EdgeFunction.Name.weeklyReview.rawValue == "ai-weekly-review")
    #expect(EdgeFunction.Name.allCases.count == 10)
  }
}

/// `AIAnalysis` đọc khoan dung.
struct WeeklyAnalysisTests {
  @Test func readsTheModelsShape() throws {
    let json: JSONValue = .object([
      "summary": .string("Tuần tốt"), "score": .number(78),
      "insights": .array([
        .object([
          "category": .string("sleep"), "icon": .string("😴"), "title": .string("Ngủ"), "detail": .string("ít"),
          "trend": .string("down"),
        ]),
        .string("rác"),
        .object(["category": .string("mystery"), "title": .string("?"), "trend": .string("sideways")]),
      ]),
      "recommendations": .array([
        .object(["priority": .string("high"), "action": .string("Ngủ sớm"), "reason": .string("vì")]),
        .object(["priority": .string("urgent"), "action": .string("x")]),
      ]),
    ])
    let a = try #require(WeeklyAnalysis(json))
    #expect(a.summary == "Tuần tốt")
    #expect(a.score == 78)
    #expect(a.insights.count == 2)
    #expect(a.insights[0].trend == .down)
    #expect(a.insights[1].trend == nil)
    #expect(a.insights[1].detail == "")
    #expect(a.recommendations.map(\.priority) == [.high, nil])
  }

  @Test func notAnObjectIsNothing() {
    #expect(WeeklyAnalysis(nil) == nil)
    #expect(WeeklyAnalysis(.null) == nil)
    #expect(WeeklyAnalysis(.string("x")) == nil)
    #expect(WeeklyAnalysis(.object([:]))?.score == nil)
  }
}

/// Phân tích AI trong sổ tổng kết: chỉ khi bấm, nhớ theo (tuần, ngôn ngữ, số
/// ngày có dữ liệu), lỗi có tên.
@MainActor
struct WeeklyAnalysisBookTests {
  final class Edgy: EdgeCaller, @unchecked Sendable {
    let lock = NSLock()
    private var log: [(EdgeFunction.Name, [String: JSONValue])] = []
    var result: Result<JSONValue?, EdgeFunction.Failure> = .success(.object(["summary": .string("ok"), "score": .number(70)]))
    var calls: [(EdgeFunction.Name, [String: JSONValue])] { lock.withLock { log } }
    func call(_ fn: EdgeFunction.Name, body: [String: JSONValue]) async throws(EdgeFunction.Failure) -> JSONValue? {
      lock.withLock { log.append((fn, body)) }
      return try lock.withLock { result }.get()
    }
  }

  final class Store: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var days = 1
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      guard q.columns == WeeklyReview.dailyColumns else { return [] }
      let n = lock.withLock { days }
      return (0..<n).map { .object(["date": .string("2026-10-0\(5 + $0)"), "kcal": .number(2000)]) }
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
    func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
  }

  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static let copy = ReadinessCard.Copy(reco: [:], factors: [:])

  @Test func analysesOnceAndRemembersPerWeekLanguageAndDays() async {
    let edge = Edgy()
    let store = Store()
    let book = WeeklyReviewBook(
      userId: "u", today: LocalDate("2026-10-08")!, store: store, edge: edge, copy: Self.copy, in: Self.tz)
    #expect(book.canAnalyze)
    #expect(book.analysis(lang: "vi") == .idle)  // chưa đọc tuần
    await book.load()
    #expect(book.analysis(lang: "vi") == .idle)  // mở màn không gọi
    #expect(edge.calls.isEmpty)
    await book.analyze(lang: "vi")
    guard case .ready(let a) = book.analysis(lang: "vi") else { Issue.record("not ready"); return }
    #expect(a.score == 70)
    #expect(edge.calls.count == 1)
    #expect(edge.calls[0].0 == .weeklyReview)
    #expect(edge.calls[0].1 == ["week_start": .string("2026-10-05"), "lang": .string("vi")])
    await book.analyze(lang: "vi")  // đã có: không gọi lại
    #expect(edge.calls.count == 1)
    #expect(book.analysis(lang: "en") == .idle)  // ngôn ngữ khác: khoá khác
    // Tuần có thêm một ngày dữ liệu → phân tích cũ không còn là của nó.
    store.days = 2
    await book.load()
    #expect(book.analysis(lang: "vi") == .idle)
  }

  @Test func failureIsNamedAndRetryable() async {
    let edge = Edgy()
    edge.result = .failure(.rateLimited)
    let book = WeeklyReviewBook(
      userId: "u", today: LocalDate("2026-10-08")!, store: Store(), edge: edge, copy: Self.copy, in: Self.tz)
    await book.load()
    await book.analyze(lang: "vi")
    #expect(book.analysis(lang: "vi") == .failed(.rateLimited))
    edge.result = .success(.null)  // RN: `res.data ?? null` → nút lại hiện
    await book.analyze(lang: "vi")
    #expect(book.analysis(lang: "vi") == .idle)
    #expect(edge.calls.count == 2)
  }

  @Test func noEdgeNoAnalysis() async {
    let book = WeeklyReviewBook(
      userId: "u", today: LocalDate("2026-10-08")!, store: Store(), copy: Self.copy, in: Self.tz)
    #expect(!book.canAnalyze)
    await book.load()
    await book.analyze(lang: "vi")
    #expect(book.analysis(lang: "vi") == .idle)
  }
}
