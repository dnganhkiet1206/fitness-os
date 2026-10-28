public import Foundation

/// Kết nối HTTP/2 chết thì app báo "Offline" dù mạng vẫn có (audit 28/10).
///
/// Log simulator: mọi request tới Supabase dồn vào MỘT kết nối đã chết
/// (`reused=1`, không byte nào đi), đợi đủ 60 giây rồi `-1001` — cả loạt 4–9
/// request cùng hỏng, app coi là mất mạng. Mac gọi Supabase cùng lúc mất 80 ms.
/// `URLSession.shared` không bao giờ tự bỏ kết nối ấy.
///
/// Sửa ở đây, cho client Supabase:
/// - session riêng, hết giờ yêu cầu 25 giây (thay vì 60): treo thì báo sớm;
/// - một yêu cầu kết thúc bằng hết giờ / mất kết nối giữa chừng → `flush()`:
///   kết nối cũ bị bỏ, lượt gọi kế tiếp đi kết nối mới. Tối đa một lần / 5 giây
///   — một loạt request cùng hỏng chỉ cần bỏ kết nối một lần.
public final class StallRecovery: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  /// Hết giờ một yêu cầu REST. PostgREST trả trong vài trăm ms; 25 giây là treo.
  public static let requestTimeout: TimeInterval = 25

  private let lock = NSLock()
  private var lastReset = Date.distantPast
  weak var session: URLSession?

  public static func makeSession() -> URLSession {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = requestTimeout
    config.waitsForConnectivity = false
    let recovery = StallRecovery()
    let session = URLSession(configuration: config, delegate: recovery, delegateQueue: nil)
    recovery.session = session
    return session
  }

  /// Lỗi cho thấy kết nối hỏng (không phải lỗi của yêu cầu): bỏ kết nối là đúng.
  public static func shouldReset(_ error: (any Error)?) -> Bool {
    guard let error else { return false }
    let code = (error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code)
    guard (error as NSError).domain == NSURLErrorDomain || error is URLError else { return false }
    return [.timedOut, .networkConnectionLost, .secureConnectionFailed, .cannotConnectToHost].contains(code)
  }

  public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
    guard Self.shouldReset(error) else { return }
    let now = Date()
    let due: Bool = lock.withLock {
      guard now.timeIntervalSince(lastReset) > 5 else { return false }
      lastReset = now
      return true
    }
    if due { session.flush {} }
  }
}
