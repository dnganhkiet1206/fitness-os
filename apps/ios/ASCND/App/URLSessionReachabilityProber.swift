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
