// Token màu của ASCND — C sở hữu (#229, #246).
//
// Sinh từ `spec/design/tokens.json`. Không sửa tay giá trị ở đây —
// đổi trong tokens.json rồi sinh lại.
//
// Mỗi token có hai biến thể light/dark, chọn theo trait của hệ thống.
#if canImport(SwiftUI)
public import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

public extension DS {
  /// Bảng màu thương hiệu. Dùng `DS.Color.background` thay vì hardcode hex.
  enum Color {
    public static let background = DSColor(light: DSColorRGB(247, 244, 239), dark: DSColorRGB(7, 7, 8)) // #f7f4ef / #070708
    public static let card = DSColor(light: DSColorRGB(255, 255, 255), dark: DSColorRGB(14, 14, 17)) // #ffffff / #0e0e11
    public static let secondary = DSColor(light: DSColorRGB(239, 234, 225), dark: DSColorRGB(24, 24, 27)) // #efeae1 / #18181b
    public static let muted = DSColor(light: DSColorRGB(242, 238, 231), dark: DSColorRGB(22, 22, 24)) // #f2eee7 / #161618
    public static let accent = DSColor(light: DSColorRGB(233, 227, 216), dark: DSColorRGB(29, 29, 32)) // #e9e3d8 / #1d1d20
    public static let border = DSColor(light: DSColorRGB(220, 213, 200), dark: DSColorRGB(43, 43, 49)) // #dcd5c8 / #2b2b31
    public static let input = DSColor(light: DSColorRGB(244, 240, 232), dark: DSColorRGB(48, 48, 54)) // #f4f0e8 / #303036
    public static let ringTrack = DSColor(light: DSColorRGB(196, 188, 172), dark: DSColorRGB(58, 58, 66)) // #c4bcac / #3a3a42
    public static let foreground = DSColor(light: DSColorRGB(26, 25, 23), dark: DSColorRGB(237, 237, 237)) // #1a1917 / #ededed
    public static let mutedForeground = DSColor(light: DSColorRGB(107, 101, 89), dark: DSColorRGB(130, 130, 130)) // #6b6559 / #828282
    public static let mutedOnInset = DSColor(light: DSColorRGB(107, 101, 89), dark: DSColorRGB(139, 139, 139)) // #6b6559 / #8b8b8b
    public static let glassMuted = DSColor(light: DSColorRGB(92, 86, 75), dark: DSColorRGB(200, 204, 212)) // #5c564b / #c8ccd4
    public static let secondaryForeground = DSColor(light: DSColorRGB(87, 82, 74), dark: DSColorRGB(153, 153, 153)) // #57524a / #999999
    public static let brand = DSColor(light: DSColorRGB(82, 88, 101), dark: DSColorRGB(168, 175, 189)) // #525865 / #a8afbd
    public static let primary = DSColor(light: DSColorRGB(26, 25, 23), dark: DSColorRGB(168, 175, 189)) // #1a1917 / #a8afbd
    public static let primaryForeground = DSColor(light: DSColorRGB(255, 255, 255), dark: DSColorRGB(7, 7, 8)) // #ffffff / #070708
    public static let goldLight = DSColor(light: DSColorRGB(125, 103, 51), dark: DSColorRGB(199, 202, 209)) // #7d6733 / #c7cad1
    public static let champagne = DSColor(light: DSColorRGB(108, 111, 121), dark: DSColorRGB(159, 163, 173)) // #6c6f79 / #9fa3ad
    public static let destructive = DSColor(light: DSColorRGB(222, 11, 68), dark: DSColorRGB(255, 59, 92)) // #de0b44 / #ff3b5c
    public static let destructiveForeground = DSColor(light: DSColorRGB(255, 255, 255), dark: DSColorRGB(255, 255, 255)) // #ffffff / #ffffff
    public static let readinessGreen = DSColor(light: DSColorRGB(7, 128, 85), dark: DSColorRGB(0, 199, 133)) // #078055 / #00c785
    public static let readinessYellow = DSColor(light: DSColorRGB(132, 110, 6), dark: DSColorRGB(205, 172, 0)) // #846e06 / #cdac00
    public static let readinessYellowGraphic = DSColor(light: DSColorRGB(167, 139, 0), dark: DSColorRGB(205, 172, 0)) // #a78b00 / #cdac00
    public static let readinessRed = DSColor(light: DSColorRGB(222, 11, 68), dark: DSColorRGB(255, 141, 146)) // #de0b44 / #ff8d92
    public static let metricBlue = DSColor(light: DSColorRGB(6, 115, 190), dark: DSColorRGB(59, 166, 255)) // #0673be / #3ba6ff
    public static let waterFill = DSColor(light: DSColorRGB(140, 203, 240), dark: DSColorRGB(140, 203, 240)) // #8ccbf0 / #8ccbf0
    public static let metricBlueWash = DSColor(light: DSColorRGB(59, 166, 255), dark: DSColorRGB(59, 166, 255)) // #3ba6ff / #3ba6ff
    public static let metricBlueInk = DSColor(light: DSColorRGB(7, 58, 104), dark: DSColorRGB(59, 166, 255)) // #073a68 / #3ba6ff
    public static let recessBg = DSColor(light: DSColorRGB(247, 249, 250), dark: DSColorRGB(7, 7, 8)) // #f7f9fa / #070708
    public static let recessBorder = DSColor(light: DSColorRGB(220, 224, 227), dark: DSColorRGB(43, 43, 47)) // #dce0e3 / #2b2b2f
    public static let metricPurple = DSColor(light: DSColorRGB(140, 53, 208), dark: DSColorRGB(180, 92, 255)) // #8c35d0 / #b45cff
    public static let metricCyan = DSColor(light: DSColorRGB(7, 123, 139), dark: DSColorRGB(34, 227, 255)) // #077b8b / #22e3ff
    public static let metricOrange = DSColor(light: DSColorRGB(172, 91, 6), dark: DSColorRGB(255, 145, 48)) // #ac5b06 / #ff9130
    public static let metricOrangeGraphic = DSColor(light: DSColorRGB(216, 115, 0), dark: DSColorRGB(255, 145, 48)) // #d87300 / #ff9130
    public static let metricRose = DSColor(light: DSColorRGB(184, 48, 68), dark: DSColorRGB(230, 72, 92)) // #b83044 / #e6485c
    public static let metricBeige = DSColor(light: DSColorRGB(178, 128, 9), dark: DSColorRGB(255, 230, 189)) // #b28009 / #ffe6bd
    public static let metricViolet = DSColor(light: DSColorRGB(124, 82, 227), dark: DSColorRGB(139, 92, 255)) // #7c52e3 / #8b5cff
    public static let metricSteel = DSColor(light: DSColorRGB(93, 114, 143), dark: DSColorRGB(127, 156, 196)) // #5d728f / #7f9cc4
  }
}

/// Một bộ ba RGB. Dùng struct thay vì tuple để conform được `Hashable`
/// (tuple không conform `Hashable` trong Swift).
public struct DSColorRGB: Sendable, Hashable {
  public let r: Int
  public let g: Int
  public let b: Int

  public init(_ r: Int, _ g: Int, _ b: Int) {
    self.r = r
    self.g = g
    self.b = b
  }
}

/// Một màu có hai biến thể light/dark, đọc từ trait của hệ thống.
public struct DSColor: Sendable, Hashable {
  let light: DSColorRGB
  let dark: DSColorRGB

  public var swiftUI: SwiftUI.Color {
    #if canImport(UIKit)
    return SwiftUI.Color(UIColor { traits in
      let rgb = traits.userInterfaceStyle == .dark ? self.dark : self.light
      return UIColor(red: CGFloat(rgb.r) / 255, green: CGFloat(rgb.g) / 255,
                     blue: CGFloat(rgb.b) / 255, alpha: 1)
    })
    #else
    // macOS chỉ để chạy test, không ship — dùng bản light.
    return SwiftUI.Color(
      red: Double(light.r) / 255, green: Double(light.g) / 255, blue: Double(light.b) / 255
    )
    #endif
  }
}
#endif
