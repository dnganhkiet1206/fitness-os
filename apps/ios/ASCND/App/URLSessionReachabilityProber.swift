import ASCNDCore
import Foundation

/// Phép dò thật của `InternetReachability` (#530): như `fetch` của NetInfo —
/// `HEAD generate_204`, không dùng cache, theo chuyển hướng (cổng đăng nhập
/// Wi-Fi trả trang HTML → mã khác 204 → không có internet). Timeout 15 s do
/// `InternetReachability` tự đếm và huỷ; ở đây chỉ là chốt an toàn của phiên.
@MainActor
final class URLSessionReachabilityProber: ReachabilityProber {
  private let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.urlCache = nil
    // Không có mạng thì báo lỗi ngay, như fetch — không xếp hàng chờ.
    config.waitsForConnectivity = false
    config.timeoutIntervalForRequest = 20
    return URLSession(configuration: config)
  }()

  private final class Probe: ReachabilityProbe {
    let task: Task<Void, Never>
    init(task: Task<Void, Never>) { self.task = task }
    func cancel() { task.cancel() }
  }

  func start(_ config: ReachabilityConfig, _ done: @escaping @MainActor (Int?) -> Void) -> any ReachabilityProbe {
    let session = self.session
    let task = Task { @MainActor in
      guard let url = URL(string: config.url) else {
        done(nil)
        return
      }
      var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
      request.httpMethod = config.method
      do {
        let (_, response) = try await session.data(for: request)
        // Bị huỷ (đổi đường mạng, vào nền, timeout): người huỷ đã tự quyết.
        guard !Task.isCancelled else { return }
        done((response as? HTTPURLResponse)?.statusCode)
      } catch {
        guard !Task.isCancelled else { return }
        done(nil)
      }
    }
    return Probe(task: task)
  }
}

/// Phép dò tới backend của app (23/10, đi cùng `FallbackReachabilityProber`):
/// `GET <Supabase>/auth/v1/health`, không gửi khoá. Có internet khi máy chủ trả lời
/// THẬT — mã HTTP 200…499 (không có khoá thì Supabase trả 401, vẫn là trả lời) và
/// câu trả lời đến từ ĐÚNG tên miền đã gọi. Cổng đăng nhập Wi-Fi chuyển hướng sang
/// trang của nó → tên miền khác → không tính. Báo `204` khi đạt, `nil` khi không.
@MainActor
final class BackendReachabilityProber: ReachabilityProber {
  private let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.urlCache = nil
    config.waitsForConnectivity = false
    config.timeoutIntervalForRequest = 20
    return URLSession(configuration: config)
  }()

  private final class Probe: ReachabilityProbe {
    let task: Task<Void, Never>
    init(task: Task<Void, Never>) { self.task = task }
    func cancel() { task.cancel() }
  }

  /// Cấu hình dò cho một địa chỉ Supabase (`BackendConfig.url`).
  static func config(for base: URL) -> ReachabilityConfig {
    let d = ReachabilityConfig.netInfoDefault
    return ReachabilityConfig(
      url: base.appendingPathComponent("auth/v1/health").absoluteString, method: "GET",
      requestTimeoutMillis: d.requestTimeoutMillis, shortTimeoutMillis: d.shortTimeoutMillis,
      longTimeoutMillis: d.longTimeoutMillis)
  }

  func start(_ config: ReachabilityConfig, _ done: @escaping @MainActor (Int?) -> Void) -> any ReachabilityProbe {
    let session = self.session
    let task = Task { @MainActor in
      guard let url = URL(string: config.url) else {
        done(nil)
        return
      }
      var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
      request.httpMethod = config.method
      do {
        let (_, response) = try await session.data(for: request)
        guard !Task.isCancelled else { return }
        let http = response as? HTTPURLResponse
        let sameHost = http?.url?.host?.lowercased() == url.host?.lowercased()
        let answered = http.map { (200..<500).contains($0.statusCode) } ?? false
        done(sameHost && answered ? 204 : nil)
      } catch {
        guard !Task.isCancelled else { return }
        done(nil)
      }
    }
    return Probe(task: task)
  }
}
