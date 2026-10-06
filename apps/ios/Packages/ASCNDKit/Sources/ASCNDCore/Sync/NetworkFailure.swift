public import Foundation

/// Lỗi này có phải "không tới được server" không — MỘT danh sách cho cả app:
/// vòng sync (`SupabaseRemoteWriter.classify`: không tính vào ngân sách thử
/// lại) và các màn đọc (`TodayController.failure`: "đang offline").
public enum NetworkFailure {
  public static let offlineCodes: Set<URLError.Code> = [
    .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost,
    .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed, .callIsActive, .cancelled,
    .secureConnectionFailed, .cannotLoadFromNetwork, .backgroundSessionWasDisconnected,
  ]

  public static func isOffline(_ error: any Error) -> Bool {
    if error is CancellationError { return true }
    if let e = error as? URLError { return offlineCodes.contains(e.code) }
    let ns = error as NSError
    // Linux / lỗi đã qua cầu NSError: so mã số, không dựng `URLError.Code`.
    return ns.domain == NSURLErrorDomain && offlineCodes.contains { $0.rawValue == ns.code }
  }
}
