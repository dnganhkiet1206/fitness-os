@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Testing

/// KOA-T53 / KOA-T60: `cleanKoaRoom` và đường dự phòng của `ledger` qua một máy chủ giả ở tầng `URLProtocol`
/// (trước đây không có test nào chạm hai đường này).
@Suite(.serialized) struct MascotTransportTests {
  /// Trả lời theo đường dẫn; ghi lại các request đã gửi.
  final class Stub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var routes: [(match: (URLRequest) -> Bool, status: Int, body: String)] = []
    nonisolated(unsafe) static var seen: [URLRequest] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
      var r = request
      if r.httpBody == nil, let stream = r.httpBodyStream {
        stream.open(); defer { stream.close() }
        var data = Data(); var buf = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; data.append(buf, count: n) }
        r.httpBody = data
      }
      Self.seen.append(r)
      let route = Self.routes.first { $0.match(r) }
      let status = route?.status ?? 404, body = route?.body ?? "{}"
      let resp = HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
      client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Data(body.utf8))
      client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
  }

  static func backend() throws -> Backend {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.protocolClasses = [Stub.self]
    return Backend(
      config: try BackendConfig(urlString: "https://abcdefgh.supabase.co", anonKey: "sb_publishable_test"),
      session: URLSession(configuration: cfg))
  }

  static func path(_ p: String) -> (URLRequest) -> Bool { { $0.url?.path.hasSuffix(p) == true } }

  @Test func cleanRoomSendsTheDayAndReturnsTheBalance() async throws {
    Stub.seen = []
    Stub.routes = [(Self.path("/rpc/clean_koa_room"), 200, "120")]
    let balance = try await SupabaseMascotEconomy(backend: try Self.backend()).cleanKoaRoom(day: "2026-11-20")
    #expect(balance == 120)
    let req = try #require(Stub.seen.first { $0.url?.path.hasSuffix("/rpc/clean_koa_room") == true })
    let body = try #require(req.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
    #expect(body["p_day"] as? String == "2026-11-20")
  }

  @Test func cleanRoomRefusalIsNamed() async throws {
    Stub.routes = [(Self.path("/rpc/clean_koa_room"), 400, #"{"code":"P0001","message":"insufficient coins","details":null,"hint":null}"#)]
    await #expect(throws: MascotFailure.insufficientCoins) {
      _ = try await SupabaseMascotEconomy(backend: try Self.backend()).cleanKoaRoom(day: "2026-11-20")
    }
  }

  /// Server chưa có `mascot_wallet()` (PGRST202): đọc cả sổ; sổ bị cắt thiếu dòng `welcome` thì hỏi riêng
  /// khoá ấy (KOA-T51).
  @Test func ledgerFallbackAsksForWelcomeSeparately() async throws {
    Stub.seen = []
    Stub.routes = [
      (Self.path("/rpc/mascot_wallet"), 404, #"{"code":"PGRST202","message":"Could not find the function","details":null,"hint":null}"#),
      ({ $0.url?.path.hasSuffix("/mascot_transactions") == true && ($0.url?.query ?? "").contains("ref_key=eq.welcome") },
       200, #"[{"amount":300,"ref_key":"welcome"}]"#),
      (Self.path("/mascot_transactions"), 200, #"[{"amount":25,"ref_key":"d:2026-11-20:meal"}]"#),
    ]
    let rows = try await SupabaseMascotSource(backend: try Self.backend()).ledger(userId: "u1")
    #expect(Set(rows.compactMap(\.refKey)) == ["d:2026-11-20:meal", "welcome"])
    #expect(Stub.seen.contains { ($0.url?.query ?? "").contains("ref_key=eq.welcome") })
  }
}
