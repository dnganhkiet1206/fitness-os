@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Testing

/// Yêu cầu + lỗi của luồng `ai-coach` (`use-coach-chat.tsx` @ fac9ac2).
struct CoachMappingTests {
  @Test func requestLikeExpoFetch() throws {
    let url = URL(string: "https://x.supabase.co/functions/v1/ai-coach")!
    let body = JSONValue.object([
      "messages": Coach.wire([Coach.Message(id: "1", role: .user, content: "Chào")]), "lang": .string("vi"),
      "date": .string("2026-10-09"), "tzOffset": .number(-420),
    ])
    let req = try SupabaseCoachStream.request(url: url, anonKey: "anon", token: "tok", body: body)
    #expect(req.httpMethod == "POST")
    #expect(req.url == url)
    #expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
    #expect(req.value(forHTTPHeaderField: "apikey") == "anon")
    #expect(req.value(forHTTPHeaderField: "Content-Type") == "application/json")
    let data = try #require(req.httpBody)
    let sent = try JSONDecoder().decode(JSONValue.self, from: data)
    #expect(sent == body)
  }

  /// Byte đầu được chờ trọn đường failover của server (KOA-T09: 3 nhà cung cấp ×
  /// 3 lần × 20 giây ≈ 180 giây); sau byte đầu, im quá 60 giây mới là treo.
  @Test func requestCarriesFirstByteBudget() throws {
    let url = URL(string: "https://x.supabase.co/functions/v1/ai-coach")!
    let req = try SupabaseCoachStream.request(url: url, anonKey: "anon", token: "tok", body: .object([:]))
    #expect(req.timeoutInterval == SupabaseCoachStream.firstByteTimeout)
    #expect(SupabaseCoachStream.firstByteTimeout == 180)
    #expect(SupabaseCoachStream.idleAfterFirstByte == 60)
    #expect(SupabaseCoachStream.idleAfterFirstByte < SupabaseCoachStream.firstByteTimeout)
    #expect(SupabaseCoachStream.firstByteTimeout > StallRecovery.requestTimeout)
  }

  /// KOA-T07: thân lỗi thật của server quyết định loại lỗi.
  @Test func errorBodyTellsQuotaAndOverloadApart() {
    // `guard.ts` quotaExceeded (429) và `ai-coach` ai_unavailable (500).
    let quota = #"{"error":"Đã dùng hết lượt AI hôm nay. Vui lòng thử lại vào ngày mai."}"#
    #expect(SupabaseCoachStream.failure(status: 429, body: quota) == .quotaExceeded)
    #expect(SupabaseCoachStream.failure(status: 429, body: #"{"error":"Rate limit exceeded. Vui lòng thử lại sau."}"#) == .rateLimited)
    #expect(SupabaseCoachStream.failure(status: 500, body: #"{"error":"ai_unavailable"}"#) == .overloaded)
    #expect(SupabaseCoachStream.failure(status: 500, body: "") == .providerError, "thân không đọc được: như trước")
    #expect(SupabaseCoachStream.failure(status: 200, body: "x") == nil)
  }

  @Test func readBodyIsBounded() async {
    let big = AsyncStream<UInt8> { c in
      for _ in 0..<10_000 { c.yield(UInt8(ascii: "a")) }
      c.finish()
    }
    let body = await SupabaseCoachStream.readBody(big, limit: 4096)
    #expect(body.utf8.count == 4096)
  }

  /// KOA-T06: chỉ `[DONE]` mới là xong; đứt luồng (kể cả không có chữ nào) là `false`.
  @Test func relayRequiresDone() async throws {
    func lines(_ l: [String]) -> AsyncStream<String> {
      AsyncStream { c in
        for x in l { c.yield(x) }
        c.finish()
      }
    }
    let delta = #"data: {"choices":[{"delta":{"content":"Chào"}}]}"#
    var got: [String] = []
    var touches = 0
    #expect(try await SupabaseCoachStream.relay(lines([delta, "data: [DONE]"]), yield: { got.append($0) }, touch: { touches += 1 }))
    #expect(got == ["Chào"])
    #expect(touches == 2)
    #expect(try await SupabaseCoachStream.relay(lines([delta]), yield: { _ in }, touch: {}) == false)
    #expect(try await SupabaseCoachStream.relay(lines([]), yield: { _ in }, touch: {}) == false)
  }

  /// KOA-T09: đồng hồ idle chỉ tính sau byte đầu.
  @Test func watchCountsOnlyAfterTheFirstByte() {
    let w = StreamWatch()
    let t0 = Date(timeIntervalSince1970: 1000)
    #expect(!w.stalled(now: t0.addingTimeInterval(500), limit: 60), "chưa có byte đầu: việc của timeoutInterval")
    w.touch(at: t0)
    #expect(!w.stalled(now: t0.addingTimeInterval(59), limit: 60))
    #expect(w.stalled(now: t0.addingTimeInterval(61), limit: 60))
    #expect(!w.timedOut)
    w.markTimedOut()
    #expect(w.timedOut)
  }

  @Test func statusAndErrors() {
    #expect(SupabaseCoachStream.failure(status: 200) == nil)
    #expect(SupabaseCoachStream.failure(status: 404) == .notDeployed)
    #expect(SupabaseCoachStream.failure(status: 401) == .unauthorised)
    #expect(SupabaseCoachStream.failure(status: 429) == .rateLimited)
    #expect(SupabaseCoachStream.failure(status: 502) == .providerError)
    #expect(SupabaseCoachStream.failure(EdgeFunction.Failure.rateLimited) == .rateLimited)
    #expect(SupabaseCoachStream.failure(URLError(.notConnectedToInternet)) == .offline)
    // KOA-T09: hết giờ không còn là "mất mạng".
    #expect(SupabaseCoachStream.failure(URLError(.timedOut)) == .timedOut)
  }
}
