// Spacing và radius của ASCND — C sở hữu (#229, #246).
// Sinh từ `spec/design/tokens.json`. Không bịa số mới khi token đã có.
#if canImport(SwiftUI)
import SwiftUI

public extension DS {
  public enum Spacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 16
    public static let card: CGFloat = 20
    public static let stack: CGFloat = 20
    public static let lg: CGFloat = 24
    public static let xl: CGFloat = 32
  }

  public enum Radius {
    public static let sm: CGFloat = 12
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 20
    public static let xl: CGFloat = 24
    public static let full: CGFloat = 999
  }
}
#endif
