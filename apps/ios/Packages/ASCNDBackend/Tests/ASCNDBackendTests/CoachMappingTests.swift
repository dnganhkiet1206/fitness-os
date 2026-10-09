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

  @Test func statusAndErrors() {
    #expect(SupabaseCoachStream.failure(status: 200) == nil)
    #expect(SupabaseCoachStream.failure(status: 404) == .notDeployed)
    #expect(SupabaseCoachStream.failure(status: 401) == .unauthorised)
    #expect(SupabaseCoachStream.failure(status: 429) == .rateLimited)
    #expect(SupabaseCoachStream.failure(status: 502) == .providerError)
    #expect(SupabaseCoachStream.failure(EdgeFunction.Failure.rateLimited) == .rateLimited)
    #expect(SupabaseCoachStream.failure(URLError(.notConnectedToInternet)) == .offline)
  }
}
