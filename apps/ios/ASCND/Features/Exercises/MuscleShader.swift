import Foundation
#if canImport(RealityKit)
  import CoreGraphics
  import ImageIO
  import RealityKit
  import UIKit

  /// Tô cơ lúc chạy (MODULAR_3D_PLAN.md bước 1, Kiệt chọn 16/11; làm 17/11). Một bộ ảnh dùng chung
  /// cho mọi bài (`muscle_ids.png` / `muscle_shade.jpg` / `muscle_normal.jpg` + `muscle_parts.json`)
  /// thay cho ~3,6 MB texture da nướng sẵn của mỗi bài; màu cơ dựng từ `roles` của `<bài>_demo.json`.
  ///
  /// Đường lùi trên CPU (từ 17/11 app tô bằng shader GPU, `MuscleMaterial`), đúng phép pha của pipeline
  /// (`export_usdz.py`: `albedo_from_highlight` + `apply_shade` + `painted_emission`), trong không gian
  /// tuyến tính:
  ///   a        = độ phủ · hệ số · có vai trò
  ///   albedo   = (nền·(1−a) + màu·a) · shade               (shade chỉ trên phần cơ có vai trò)
  ///   emission = màu·a·shade·0,24 + (màu·a·0,55 + 0,45)·viền·0,95
  enum MuscleShader {
    /// Ba vai trò, đúng màu `muscle_primary` / `_secondary` / `_stabilizer` (`brand.config.json`).
    /// Vai trò sau đè vai trò trước (ổn định → phụ → chính), như pipeline.
    static let roleHex: [(role: String, hex: String)] = [
      ("stabilizing", "#6FA7C9"), ("secondary", "#F2A33A"), ("primary", "#E8552B"),
    ]
    /// Nền thân trong trình xem (`character_body_viewer`) và quần (`character_apparel`).
    static let bodyHex = "#C9CDD3"
    static let apparelHex = "#26282C"
    static let bodyGain: Float = 1.0
    static let apparelGain: Float = 0.8

    /// Ảnh dùng chung đã giải nén (8 bit / kênh, hàng trên = v 1 như PNG).
    struct Shared: @unchecked Sendable {
      let width: Int
      let height: Int
      /// RGBA: R = số thứ tự phần cơ + 1, G = độ phủ, B = viền.
      let ids: [UInt8]
      /// Một kênh: phần cơ thứ hai nằm chồng dưới (0 = không có), ví dụ cơ trám dưới cơ thang giữa.
      /// Khi pha, lấy nhãn đầu tiên có vai trò trong bài (review #931).
      let ids2: [UInt8]
      /// Một kênh: thớ cơ (255 = 1, không đổi).
      let shade: [UInt8]
      /// RGBA: normal khối cơ (không thớ) và normal có thớ của mọi phần cơ.
      let normal: [UInt8]
      let fiberNormal: [UInt8]
      let parts: [String]
      let aggregates: [String: [String]]
    }

    /// Hai bộ da của một bài: đủ vai trò / chỉ cơ chính, mỗi bộ có thân + quần.
    struct Skins: @unchecked Sendable {
      struct Pair: @unchecked Sendable {
        let albedo: CGImage
        let emission: CGImage
        /// Normal: có thớ trên phần cơ có vai trò, khối cơ ở chỗ khác (chỉ thân; quần nil).
        let normal: CGImage?
      }
      let fullBody: Pair
      let focusBody: Pair
      let fullApparel: Pair
      let focusApparel: Pair
    }

    private struct PartsFile: Decodable {
      let parts: [String]
      let aggregates: [String: [String]]
    }

    nonisolated(unsafe) private static var cached: Shared?
    private static let lock = NSLock()

    /// Nạp một lần (dùng chung cho mọi bài). nil = thiếu tệp.
    static func shared() -> Shared? {
      lock.lock()
      defer { lock.unlock() }
      if let cached { return cached }
      guard let partsURL = Bundle.main.url(forResource: "muscle_parts", withExtension: "json"),
        let data = try? Data(contentsOf: partsURL),
        let file = try? JSONDecoder().decode(PartsFile.self, from: data),
        let ids = pixels("muscle_ids", channels: 4),
        let ids2 = pixels("muscle_ids2", channels: 1),
        let shade = pixels("muscle_shade", channels: 1),
        let normal = pixels("muscle_normal", channels: 4),
        let fiber = pixels("muscle_fiber_normal", channels: 4),
        ids.width == shade.width, ids.height == shade.height,
        ids2.width == ids.width, ids2.height == ids.height,
        [normal.width, fiber.width].allSatisfy({ $0 == ids.width }),
        [normal.height, fiber.height].allSatisfy({ $0 == ids.height })
      else { return nil }
      let s = Shared(
        width: ids.width, height: ids.height, ids: ids.bytes, ids2: ids2.bytes, shade: shade.bytes, normal: normal.bytes,
        fiberNormal: fiber.bytes, parts: file.parts,
        aggregates: file.aggregates)
      cached = s
      return s
    }

    /// Giải nén ảnh thành điểm ảnh thô (không quản lý màu: số đọc ra đúng như đã lưu).
    /// JPEG hay PNG đều được: máy xuất không có ImageMagick thì ra PNG (review #931).
    private static func pixels(_ name: String, channels: Int) -> (width: Int, height: Int, bytes: [UInt8])? {
      guard let url = Bundle.main.url(forResource: name, withExtension: "jpg")
        ?? Bundle.main.url(forResource: name, withExtension: "png"),
        let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCache: false] as CFDictionary)
      else { return nil }
      let w = image.width, h = image.height
      var bytes = [UInt8](repeating: 0, count: w * h * channels)
      let space = channels == 1 ? CGColorSpaceCreateDeviceGray() : CGColorSpaceCreateDeviceRGB()
      let info = channels == 1 ? CGImageAlphaInfo.none.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue
      let ok = bytes.withUnsafeMutableBytes { buf -> Bool in
        guard let ctx = CGContext(
          data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * channels,
          space: space, bitmapInfo: info)
        else { return false }
        ctx.interpolationQuality = .none
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return true
      }
      return ok ? (w, h, bytes) : nil
    }

    /// Bảng màu 64 ô (ô `i` = phần cơ thứ `i − 1`): màu tuyến tính của vai trò, nil = không tô.
    static func palette(roles: [String: [String]], shared: Shared, primaryOnly: Bool) -> [SIMD3<Float>?] {
      palette(roles: roles, parts: shared.parts, aggregates: shared.aggregates, primaryOnly: primaryOnly)
    }

    static func palette(
      roles: [String: [String]], parts: [String], aggregates: [String: [String]], primaryOnly: Bool
    ) -> [SIMD3<Float>?] {
      var table = [SIMD3<Float>?](repeating: nil, count: 64)
      for (role, hex) in roleHex where !primaryOnly || role == "primary" {
        let color = linear(hex)
        for name in roles[role] ?? [] {
          for part in aggregates[name] ?? [name] {
            guard let index = parts.firstIndex(of: part), index + 1 < 64 else { continue }
            table[index + 1] = color
          }
        }
      }
      return table
    }

    /// Dựng bốn bộ da (đủ / chỉ cơ chính × thân / quần), song song trên các nhân. Chạy ngoài luồng chính.
    static func skins(roles: [String: [String]], shared: Shared) -> Skins? {
      let full = palette(roles: roles, shared: shared, primaryOnly: false)
      let focus = palette(roles: roles, shared: shared, primaryOnly: true)
      let jobs: [([SIMD3<Float>?], String, Float, Bool)] = [
        (full, bodyHex, bodyGain, true), (focus, bodyHex, bodyGain, true),
        (full, apparelHex, apparelGain, false), (focus, apparelHex, apparelGain, false),
      ]
      let out = Results(count: jobs.count)
      DispatchQueue.concurrentPerform(iterations: jobs.count) { k in
        let j = jobs[k]
        out.set(k, compose(shared, j.0, base: j.1, gain: j.2, normal: j.3))
      }
      guard let fb = out.get(0), let cb = out.get(1), let fa = out.get(2), let ca = out.get(3) else { return nil }
      return Skins(fullBody: fb, focusBody: cb, fullApparel: fa, focusApparel: ca)
    }

    private final class Results: @unchecked Sendable {
      private var items: [Skins.Pair?]
      private let lock = NSLock()
      init(count: Int) { items = Array(repeating: nil, count: count) }
      func set(_ i: Int, _ v: Skins.Pair?) { lock.withLock { items[i] = v } }
      func get(_ i: Int) -> Skins.Pair? { lock.withLock { items[i] } }
    }

    /// Một bộ albedo + emission (sRGB 8 bit, cùng UV và hướng ảnh với texture nướng sẵn), kèm normal
    /// (thân). Chỉ điểm ảnh thuộc phần cơ có vai trò mới tính; còn lại là nền / không phát sáng / normal
    /// khối cơ. Đọc thẳng vùng nhớ: bản Debug chậm gấp nhiều lần nếu đi qua chỉ số mảng.
    static func compose(_ s: Shared, _ table: [SIMD3<Float>?], base: String, gain: Float, normal withNormal: Bool)
      -> Skins.Pair?
    {
      let n = s.width * s.height
      let baseLin = linear(base)
      func pack(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> UInt32 {
        UInt32(r) | UInt32(g) << 8 | UInt32(b) << 16 | 0xFF00_0000
      }
      var albedo = [UInt32](repeating: pack(encode(baseLin.x), encode(baseLin.y), encode(baseLin.z)), count: n)
      var emission = [UInt32](repeating: pack(0, 0, 0), count: n)
      var normal = withNormal ? s.normal : []
      // Màu theo ô bảng (nil → không tô) thành ba mảng phẳng để vòng lặp không giải optional.
      var on = [Bool](repeating: false, count: 64)
      var cr = [Float](repeating: 0, count: 64), cg = cr, cb = cr
      // Thứ hạng vai trò (chính 3 > phụ 2 > ổn định 1): hai nhãn chồng nhau thì lấy vai trò cao hơn.
      var rank = [Int](repeating: 0, count: 64)
      let roleColors = roleHex.map { linear($0.hex) }
      for (i, c) in table.enumerated() {
        guard let c else { continue }
        on[i] = true; cr[i] = c.x; cg[i] = c.y; cb[i] = c.z
        rank[i] = (roleColors.firstIndex(of: c) ?? 0) + 1
      }
      let lut = toSRGB
      func enc(_ x: Float, _ l: UnsafeBufferPointer<UInt8>) -> UInt8 { l[Int(max(0, min(1, x)) * 4095 + 0.5)] }
      s.ids.withUnsafeBufferPointer { ids in
        s.ids2.withUnsafeBufferPointer { ids2 in
        s.shade.withUnsafeBufferPointer { shade in
          s.fiberNormal.withUnsafeBufferPointer { fiber in
            lut.withUnsafeBufferPointer { l in
              albedo.withUnsafeMutableBufferPointer { al in
                emission.withUnsafeMutableBufferPointer { em in
                  normal.withUnsafeMutableBufferPointer { nm in
                    for i in 0 ..< n {
                      let first = min(Int(ids[i &* 4]), 63), second = min(Int(ids2[i]), 63)
                      let part = rank[second] > rank[first] ? second : first
                      if part == 0 || !on[part] { continue }
                      if withNormal {
                        let o = i &* 4
                        nm[o] = fiber[o]; nm[o + 1] = fiber[o + 1]; nm[o + 2] = fiber[o + 2]; nm[o + 3] = fiber[o + 3]
                      }
                      let a = min(1, Float(ids[i &* 4 + 1]) * (gain / 255))
                      let rim = Float(ids[i &* 4 + 2]) * (1 / 255 as Float)
                      let sh = Float(shade[i]) * (1 / 255 as Float)
                      let r = cr[part], g = cg[part], b = cb[part]
                      al[i] = pack(
                        enc((baseLin.x * (1 - a) + r * a) * sh, l), enc((baseLin.y * (1 - a) + g * a) * sh, l),
                        enc((baseLin.z * (1 - a) + b * a) * sh, l))
                      let w: Float = a > 0 ? 0.45 : 0
                      em[i] = pack(
                        enc(r * a * sh * 0.24 + (r * a * 0.55 + w) * rim * 0.95, l),
                        enc(g * a * sh * 0.24 + (g * a * 0.55 + w) * rim * 0.95, l),
                        enc(b * a * sh * 0.24 + (b * a * 0.55 + w) * rim * 0.95, l))
                    }
                  }
                }
              }
            }
          }
        }
        }
      }
      func bytes(_ px: [UInt32]) -> [UInt8] { px.withUnsafeBytes { Array($0) } }
      guard let alImg = image(bytes(albedo), s.width, s.height), let emImg = image(bytes(emission), s.width, s.height)
      else { return nil }
      let nmImg = withNormal ? image(normal, s.width, s.height, srgb: false) : nil
      return Skins.Pair(albedo: alImg, emission: emImg, normal: nmImg)
    }

    private static func image(_ bytes: [UInt8], _ w: Int, _ h: Int, srgb: Bool = true) -> CGImage? {
      guard let provider = CGDataProvider(data: Data(bytes) as CFData),
        let space = srgb ? CGColorSpace(name: CGColorSpace.sRGB) : CGColorSpaceCreateDeviceRGB()
      else { return nil }
      return CGImage(
        width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: space,
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: provider,
        decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }

    // MARK: - Màu

    /// sRGB → tuyến tính (như `muscle_eval.srgb_to_linear`).
    static func linear(_ hex: String) -> SIMD3<Float> {
      let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
      let v = UInt32(s, radix: 16) ?? 0
      func f(_ x: Float) -> Float { x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
      return SIMD3(f(Float((v >> 16) & 0xFF) / 255), f(Float((v >> 8) & 0xFF) / 255), f(Float(v & 0xFF) / 255))
    }

    /// Bảng tra tuyến tính → sRGB 8 bit (4096 bậc), như `muscle_eval.linear_to_srgb` · 255 + 0,5.
    private static let toSRGB: [UInt8] = (0 ... 4095).map { i in
      let c = Float(i) / 4095
      let s = c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055
      return UInt8(min(255, s * 255 + 0.5))
    }

    @inline(__always) static func encode(_ x: Float) -> UInt8 {
      toSRGB[Int(max(0, min(1, x)) * 4095 + 0.5)]
    }
  }
#endif
