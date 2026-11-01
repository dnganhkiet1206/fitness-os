import ASCNDCore
import SwiftUI
import UIKit

extension Color {
  /// Màu của một hạng Gains, theo sáng / tối. Màu gốc (`colorHex`) là neon cho nền
  /// tối; trên nền sáng bạc hà / vàng chỉ ~1,3:1 (soát giao diện sáng 01/11) — nền
  /// sáng dùng tông đậm cùng họ màu, đủ đọc (≥ 4,5:1 trên nền thẻ sáng).
  static func rank(_ rank: MascotRules.Rank) -> Color {
    let dark = UIColor(Color(hex: rank.colorHex))
    let light = UIColor(Color(hex: lightRankHex[rank.key] ?? rank.colorHex))
    return Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
  }

  private static let lightRankHex: [String: String] = [
    "rookie": "#5c6373",
    "active": "#067a52",
    "prime": "#1660b0",
    "peak": "#7a45ae",
    "apex": "#a4520f",
    "legend": "#8a6500",
  ]
}
