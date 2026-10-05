// Thang chữ của ASCND — C sở hữu (#229, #246).
// Sinh từ `spec/design/tokens.json`.
//
// Dùng text style hệ thống để Dynamic Type tự hoạt động.
// KHÔNG cỡ chữ cố định — ngoại lệ duy nhất là số trong hình vẽ
// (xem RING_TEXT_MAX_SCALE trong app RN).
#if canImport(SwiftUI)
@_exported import SwiftUI

public extension DS {
  enum Type {
    /// hero: 44pt light — con số trả lời cả màn, trên largeTitle một bậc.
    public static let hero = Font.system(size: 44, weight: .light, design: .default)
    public static let largeTitle = Font.largeTitle.weight(.bold)
    public static let title = Font.title.weight(.bold)
    public static let title2 = Font.title3.weight(.bold)
    public static let headline = Font.headline.weight(.semibold)
    public static let body = Font.subheadline.weight(.regular)
    public static let footnote = Font.footnote.weight(.medium)
    public static let caption = Font.caption2.weight(.medium)

    /// Monospace cho số liệu đổi liên tục (đồng hồ nghỉ, bộ đếm) — cột số không nhảy.
    public static func mono(_ style: Font.TextStyle = .body) -> Font {
      Font.system(style, design: .monospaced).monospacedDigit()
    }
  }
}
#endif
