// Token màu của ASCND — C sở hữu (#229, #246).
//
// Sinh từ `spec/design/tokens.json`. Không sửa tay giá trị ở đây —
// đổi trong tokens.json rồi sinh lại.
//
// Mỗi token có hai biến thể light/dark, chọn theo trait của hệ thống.
#if canImport(SwiftUI)
import SwiftUI

public extension DS {
  /// Bảng màu thương hiệu. Dùng `DS.Color.background` thay vì hardcode hex.
  enum Color {
    public static let background = DSColor(light: (247, 244, 239), dark: (7, 7, 8)) // #f7f4ef / #070708
    public static let card = DSColor(light: (255, 255, 255), dark: (14, 14, 17)) // #ffffff / #0e0e11
    public static let secondary = DSColor(light: (239, 234, 225), dark: (24, 24, 27)) // #efeae1 / #18181b
    public static let muted = DSColor(light: (242, 238, 231), dark: (22, 22, 24)) // #f2eee7 / #161618
    public static let accent = DSColor(light: (233, 227, 216), dark: (29, 29, 32)) // #e9e3d8 / #1d1d20
    public static let border = DSColor(light: (220, 213, 200), dark: (43, 43, 49)) // #dcd5c8 / #2b2b31
    public static let input = DSColor(light: (244, 240, 232), dark: (48, 48, 54)) // #f4f0e8 / #303036
    public static let ringTrack = DSColor(light: (196, 188, 172), dark: (58, 58, 66)) // #c4bcac / #3a3a42
    public static let foreground = DSColor(light: (26, 25, 23), dark: (237, 237, 237)) // #1a1917 / #ededed
    public static let mutedForeground = DSColor(light: (107, 101, 89), dark: (130, 130, 130)) // #6b6559 / #828282
    public static let mutedOnInset = DSColor(light: (107, 101, 89), dark: (139, 139, 139)) // #6b6559 / #8b8b8b
    public static let glassMuted = DSColor(light: (92, 86, 75), dark: (200, 204, 212)) // #5c564b / #c8ccd4
    public static let secondaryForeground = DSColor(light: (87, 82, 74), dark: (153, 153, 153)) // #57524a / #999999
    public static let brand = DSColor(light: (82, 88, 101), dark: (168, 175, 189)) // #525865 / #a8afbd
    public static let primary = DSColor(light: (26, 25, 23), dark: (168, 175, 189)) // #1a1917 / #a8afbd
    public static let primaryForeground = DSColor(light: (255, 255, 255), dark: (7, 7, 8)) // #ffffff / #070708
    public static let goldLight = DSColor(light: (125, 103, 51), dark: (199, 202, 209)) // #7d6733 / #c7cad1
    public static let champagne = DSColor(light: (108, 111, 121), dark: (159, 163, 173)) // #6c6f79 / #9fa3ad
    public static let destructive = DSColor(light: (222, 11, 68), dark: (255, 59, 92)) // #de0b44 / #ff3b5c
    public static let destructiveForeground = DSColor(light: (255, 255, 255), dark: (255, 255, 255)) // #ffffff / #ffffff
    public static let readinessGreen = DSColor(light: (7, 128, 85), dark: (0, 199, 133)) // #078055 / #00c785
    public static let readinessYellow = DSColor(light: (132, 110, 6), dark: (205, 172, 0)) // #846e06 / #cdac00
    public static let readinessYellowGraphic = DSColor(light: (167, 139, 0), dark: (205, 172, 0)) // #a78b00 / #cdac00
    public static let readinessRed = DSColor(light: (222, 11, 68), dark: (255, 141, 146)) // #de0b44 / #ff8d92
    public static let metricBlue = DSColor(light: (6, 115, 190), dark: (59, 166, 255)) // #0673be / #3ba6ff
    public static let waterFill = DSColor(light: (140, 203, 240), dark: (140, 203, 240)) // #8ccbf0 / #8ccbf0
    public static let metricBlueWash = DSColor(light: (59, 166, 255), dark: (59, 166, 255)) // #3ba6ff / #3ba6ff
    public static let metricBlueInk = DSColor(light: (7, 58, 104), dark: (59, 166, 255)) // #073a68 / #3ba6ff
    public static let recessBg = DSColor(light: (247, 249, 250), dark: (7, 7, 8)) // #f7f9fa / #070708
    public static let recessBorder = DSColor(light: (220, 224, 227), dark: (43, 43, 47)) // #dce0e3 / #2b2b2f
    public static let metricPurple = DSColor(light: (140, 53, 208), dark: (180, 92, 255)) // #8c35d0 / #b45cff
    public static let metricCyan = DSColor(light: (7, 123, 139), dark: (34, 227, 255)) // #077b8b / #22e3ff
    public static let metricOrange = DSColor(light: (172, 91, 6), dark: (255, 145, 48)) // #ac5b06 / #ff9130
    public static let metricOrangeGraphic = DSColor(light: (216, 115, 0), dark: (255, 145, 48)) // #d87300 / #ff9130
    public static let metricRose = DSColor(light: (184, 48, 68), dark: (230, 72, 92)) // #b83044 / #e6485c
    public static let metricBeige = DSColor(light: (178, 128, 9), dark: (255, 230, 189)) // #b28009 / #ffe6bd
    public static let metricViolet = DSColor(light: (124, 82, 227), dark: (139, 92, 255)) // #7c52e3 / #8b5cff
    public static let metricSteel = DSColor(light: (93, 114, 143), dark: (127, 156, 196)) // #5d728f / #7f9cc4
  }
}

/// Một màu có hai biến thể light/dark, đọc từ trait của hệ thống.
public struct DSColor {
  let light: (Int, Int, Int)
  let dark: (Int, Int, Int)

  public var swiftUI: SwiftUI.Color {
    SwiftUI.Color(UIColor { traits in
      let rgb = traits.userInterfaceStyle == .dark ? self.dark : self.light
      return UIColor(red: CGFloat(rgb.0) / 255, green: CGFloat(rgb.1) / 255,
                     blue: CGFloat(rgb.2) / 255, alpha: 1)
    })
  }
}
#endif
