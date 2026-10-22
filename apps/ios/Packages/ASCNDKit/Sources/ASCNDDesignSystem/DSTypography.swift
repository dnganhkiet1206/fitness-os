// Thang chữ của ASCND — C sở hữu (#229, #246).
// Sinh từ `spec/design/tokens.json`.
//
// Dùng text style hệ thống để Dynamic Type tự hoạt động.
// KHÔNG cỡ chữ cố định — ngoại lệ duy nhất là số trong hình vẽ
// (xem RING_TEXT_MAX_SCALE trong app RN).
#if canImport(SwiftUI)
public import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

public extension DS {
  /// Thang chữ — tên `TextStyle` vì `Type` đụng từ khoá `Foo.Type` (Swift 6).
  enum TextStyle {
    /// hero: 44pt — con số trả lời cả màn, trên largeTitle một bậc. Kiểu Apple Health
    /// (Kiệt 22/10): SF Pro Rounded đậm.
    public static let hero = Font.system(size: 44, weight: .bold, design: .rounded)
    // Mapping theo đúng `iosTextStyle` trong tokens.json — KHÔNG dùng tên
    // trùng SwiftUI (Font.largeTitle = 34pt, lớn hơn token "largeTitle" một bậc).
    public static let largeTitle = Font.title.weight(.bold) // iosTextStyle: title1 (28pt)
    public static let title = Font.title2.weight(.bold) // iosTextStyle: title2 (22pt)
    public static let title2 = Font.title3.weight(.bold) // iosTextStyle: title3 (20pt, gần nhất với 18pt)
    public static let headline = Font.headline.weight(.semibold)
    public static let body = Font.subheadline.weight(.regular)
    public static let footnote = Font.footnote.weight(.medium)
    public static let caption = Font.caption2.weight(.medium)

    /// Số liệu đổi liên tục (đồng hồ nghỉ, bộ đếm) — chữ số đều độ rộng nên cột số
    /// không nhảy. Kiểu Apple Health (Kiệt 22/10): SF Pro Rounded thay Menlo.
    public static func mono(_ style: Font.TextStyle = .body) -> Font {
      Font.system(style, design: .rounded).monospacedDigit()
    }

    /// Chữ thường theo text style nhưng nét Rounded (nhãn số nhỏ cạnh số liệu).
    public static func rounded(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
      Font.system(style, design: .rounded).weight(weight).monospacedDigit()
    }

    /// Số liệu kiểu Apple Health: SF Pro Rounded, chữ số đều độ rộng, cỡ `size` co giãn
    /// theo Dynamic Type của `relativeTo` — thay `.custom("Menlo", size:relativeTo:)`.
    /// Rounded hẹp hơn Menlo nên cỡ ×1,08 để số không nhỏ đi.
    public static func number(_ size: CGFloat, _ relativeTo: Font.TextStyle = .body) -> Font {
      Font.system(size: scaled(size * 1.08, relativeTo), design: .rounded).monospacedDigit()
    }

    private static func scaled(_ size: CGFloat, _ style: Font.TextStyle) -> CGFloat {
      #if canImport(UIKit)
        let ui: UIFont.TextStyle = switch style {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
        return UIFontMetrics(forTextStyle: ui).scaledValue(for: size)
      #else
        return size
      #endif
    }
  }
}
#endif
