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
  /// Ghi bữa quen của loại bữa ấy (widget "Bữa quen"). `true` = đã vào sổ.
  public static var logUsualMeal: (@MainActor (String) async -> Bool)?
  /// Bỏ bữa widget vừa ghi (mã bữa). `true` = đã bỏ.
  public static var undoMeal: (@MainActor (String) async -> Bool)?
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

/// "Ghi như mọi khi" trên widget "Bữa quen" (Kiệt 01/11). Loại bữa là bữa widget
/// đang hiện, không tính lại theo giờ lúc chạm (chạm 14:59 vẫn là bữa trưa).
public struct LogUsualMealIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "Log your usual meal"
  public static let isDiscoverable = false
  public static let openAppWhenRun = false

  @Parameter(title: "Meal") public var mealType: String

  public init() {}
  public init(mealType: String) { self.mealType = mealType }

  @MainActor
  public func perform() async throws -> some IntentResult {
    _ = await KoaIntentRouter.logUsualMeal?(mealType)
    return .result()
  }
}

/// "Hoàn tác" ngay sau khi widget ghi bữa.
public struct UndoMealIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "Undo the logged meal"
  public static let isDiscoverable = false
  public static let openAppWhenRun = false

  @Parameter(title: "Entry") public var entryId: String

  public init() {}
  public init(entryId: String) { self.entryId = entryId }

  @MainActor
  public func perform() async throws -> some IntentResult {
    _ = await KoaIntentRouter.undoMeal?(entryId)
    return .result()
  }
}
#endif
