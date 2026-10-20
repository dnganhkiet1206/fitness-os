// Nút bấm được trên widget Koa (#527, đợt 2C — Kiệt chọn "nước +1 ngay trên
// widget", 20/10). Như nút ±15 của quãng nghỉ: là `LiveActivityIntent`, nên
// `perform()` chạy trong PROCESS CỦA APP (hệ thống mở app ở nền nếu cần) — nơi có
// phiên đăng nhập, sổ nước và hàng đợi gửi. Widget không tự ghi gì.
#if canImport(ActivityKit) && os(iOS)
public import AppIntents
import Foundation

/// Nơi intent tìm đường ghi nước của app. App gán lúc khởi động.
@MainActor
public enum KoaIntentRouter {
  /// Ghi một ly (mức nhanh đầu tiên của đơn vị). `true` = đã vào sổ.
  public static var addWater: (@MainActor () async -> Bool)?
}

/// "+1 ly" trên widget Koa.
public struct AddWaterIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "Log a glass of water"
  public static let isDiscoverable = false
  public static let openAppWhenRun = false

  public init() {}

  @MainActor
  public func perform() async throws -> some IntentResult {
    _ = await KoaIntentRouter.addWater?()
    return .result()
  }
}
#endif
