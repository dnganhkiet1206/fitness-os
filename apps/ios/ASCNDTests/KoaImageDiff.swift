import CoreGraphics
import Foundation
import SnapshotTesting
import UIKit

/// So ảnh snapshot trên CPU, chịu nhiễu nhỏ của bộ dựng hình (#795).
///
/// Một điểm ảnh tính là "khác" khi một kênh (R, G, B, A) lệch quá `tolerance` trên 255; test đỏ khi
/// số điểm ảnh khác vượt `maxDifferentFraction` của cả ảnh. Nhiễu thật đo được trên runner là lệch
/// 1/255 ở vài chục điểm ảnh — không tính. Đổi chữ, đổi màu, lệch bố cục làm hàng trăm điểm ảnh lệch
/// hàng chục mức — đỏ.
enum KoaImageDiff {
  static let tolerance = 16
  static let maxDifferentFraction = 0.0001

  static func diffing(scale: CGFloat) -> Diffing<UIImage> {
    let toData: (UIImage) -> Data = { $0.pngData() ?? Data() }
    return .diff(toData: toData, fromData: { UIImage(data: $0, scale: scale) ?? UIImage() }) { old, new in
      guard let message = message(old, new) else { return nil }
      return (message, [.data(toData(old), name: "reference.png"), .data(toData(new), name: "failure.png")])
    }
  }

  /// `nil` khi hai ảnh coi là giống; còn lại là câu báo lỗi.
  static func message(_ old: UIImage, _ new: UIImage) -> String? {
    guard let a = pixels(old), let b = pixels(new) else { return "Không đọc được ảnh chuẩn hoặc ảnh mới." }
    guard a.width == b.width, a.height == b.height else {
      return "Kích thước khác: ảnh chuẩn \(a.width)×\(a.height), ảnh mới \(b.width)×\(b.height)."
    }
    let different = differentPixels(a.bytes, b.bytes)
    let allowed = Int(Double(a.width * a.height) * maxDifferentFraction)
    guard different > allowed else { return nil }
    return "\(different) điểm ảnh lệch quá \(tolerance)/255 (cho phép \(allowed) trên \(a.width * a.height))."
  }

  /// Số điểm ảnh có ít nhất một kênh lệch quá `tolerance` (hai mảng RGBA cùng cỡ).
  static func differentPixels(_ a: [UInt8], _ b: [UInt8]) -> Int {
    var different = 0
    var i = 0
    // `while` thay `for`: test chạy không tối ưu, vòng `for` trên mảng lớn chậm hơn nhiều.
    while i + 3 < a.count {
      if abs(Int(a[i]) - Int(b[i])) > tolerance || abs(Int(a[i + 1]) - Int(b[i + 1])) > tolerance
        || abs(Int(a[i + 2]) - Int(b[i + 2])) > tolerance || abs(Int(a[i + 3]) - Int(b[i + 3])) > tolerance
      {
        different += 1
      }
      i += 4
    }
    return different
  }

  /// Ảnh → RGBA 8 bit, cùng không gian màu cho cả hai ảnh.
  private static func pixels(_ image: UIImage) -> (width: Int, height: Int, bytes: [UInt8])? {
    guard let cg = image.cgImage, cg.width > 0, cg.height > 0 else { return nil }
    let width = cg.width, height = cg.height
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    let drawn = bytes.withUnsafeMutableBytes { raw -> Bool in
      guard
        let ctx = CGContext(
          data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return false }
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    return drawn ? (width, height, bytes) : nil
  }
}
