import ASCNDCore
import CoreGraphics
import SwiftUI
import Testing

@testable import ASCND

/// Phòng nhiều lớp phải dựng lại đúng căn phòng một lớp khi máy quay đứng giữa: thiếu lớp, sai thứ
/// tự lớp đều lộ ra ở đây. So hai bản dựng ngay trên máy đang chạy nên không cần ảnh mẫu, không
/// lệch theo máy. Sương xa cố ý làm tường sáng thêm vài bậc, ngưỡng để chừa phần đó.
@MainActor
@Suite struct StudioLayersRenderTests {
  private static let size = CGSize(width: 390, height: StudioScene.sceneBottom)

  private func options(light: Bool) -> StudioScene.Options {
    var o = StudioScene.Options()
    o.light = light
    return o
  }

  private func pixels(_ view: some View) throws -> [UInt8] {
    let renderer = ImageRenderer(content: view.frame(width: Self.size.width, height: Self.size.height))
    renderer.scale = 1
    let image = try #require(renderer.cgImage)
    let w = image.width, h = image.height
    var out = [UInt8](repeating: 0, count: w * h * 4)
    let context = try #require(
      CGContext(
        data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return out
  }

  /// Phần điểm ảnh lệch quá `limit` bậc ở một kênh màu.
  private func differing(_ a: [UInt8], _ b: [UInt8], limit: Int) -> Double {
    var off = 0
    for i in stride(from: 0, to: a.count, by: 4) {
      if (0..<3).contains(where: { abs(Int(a[i + $0]) - Int(b[i + $0])) > limit }) { off += 1 }
    }
    return Double(off) / Double(a.count / 4)
  }

  private func layered(light: Bool, shot: KoaParallax.Shot = .init()) -> some View {
    StudioLayers(options: options(light: light), plantSway: 0, shot: shot, size: Self.size, light: light)
  }

  @Test(arguments: [false, true])
  func layersAtRestMatchTheFlatRoom(light: Bool) throws {
    let flat = try pixels(StudioBackdrop(options: options(light: light)))
    let rest = try pixels(layered(light: light))
    #expect(flat.count == rest.count)
    #expect(differing(flat, rest, limit: 32) < 0.01)
  }

  /// Máy quay lia thì phòng phải đổi: lớp nào cũng dính chết vào khung là parallax đã mất.
  @Test func panningMovesTheRoom() throws {
    let rest = try pixels(layered(light: false))
    let panned = try pixels(layered(light: false, shot: .init(pan: 1)))
    #expect(differing(rest, panned, limit: 8) > 0.02)
  }
}
