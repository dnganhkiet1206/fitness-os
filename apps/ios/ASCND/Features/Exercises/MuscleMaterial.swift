import Foundation
#if canImport(RealityKit)
  import CoreGraphics
  import Metal
  import RealityKit

  /// Tô cơ trên GPU (17/11): `CustomMaterial` với shader `MuscleSurface.metal`, đọc thẳng bộ ảnh dùng
  /// chung của `MuscleShader`. Đổi bài hay bật / tắt cơ phụ chỉ đổi bảng màu 64×2, không pha lại
  /// bốn ảnh 2K trên CPU như `MuscleShader.skins` (đường lùi khi GPU không dựng được vật liệu).
  @MainActor enum MuscleMaterial {
    /// Texture dùng chung cho mọi bài (nạp một lần).
    struct Textures {
      let ids: TextureResource
      /// R = shade, G = phần cơ thứ hai (`muscle_ids2`).
      let shadeIds2: TextureResource
      let normal: TextureResource
      let fiberNormal: TextureResource
    }

    private static var cached: Textures?
    private static var shaders: (body: CustomMaterial.SurfaceShader, apparel: CustomMaterial.SurfaceShader)?

    /// Ảnh gộp, dựng ngoài luồng chính (vòng lặp qua 4 triệu điểm ảnh).
    struct Images: @unchecked Sendable {
      let ids: CGImage
      let shadeIds2: CGImage
      let normal: CGImage
      let fiberNormal: CGImage
    }

    nonisolated static func images(_ s: MuscleShader.Shared) -> Images? {
      let n = s.width * s.height
      var shadeIds2 = [UInt8](repeating: 0, count: n * 4)
      s.shade.withUnsafeBufferPointer { shade in
        s.ids2.withUnsafeBufferPointer { ids2 in
          shadeIds2.withUnsafeMutableBufferPointer { out in
            for i in 0 ..< n {
              out[i &* 4] = shade[i]
              out[i &* 4 + 1] = ids2[i]
            }
          }
        }
      }
      guard let ids = rgb(s.ids, s.width, s.height), let si = rgb(shadeIds2, s.width, s.height),
        let normal = rgb(s.normal, s.width, s.height), let fiber = rgb(s.fiberNormal, s.width, s.height)
      else { return nil }
      return Images(ids: ids, shadeIds2: si, normal: normal, fiberNormal: fiber)
    }

    /// Texture đã nạp ở lần mở bài trước (nil = chưa): có rồi thì không dựng lại ảnh 2K (review #936).
    static var loaded: Textures? { cached }

    static func textures(_ images: Images) -> Textures? {
      if let cached { return cached }
      func load(_ image: CGImage, mipmaps: Bool = true) -> TextureResource? {
        try? TextureResource(
          image: image, options: .init(semantic: .raw, mipmapsMode: mipmaps ? .allocateAndGenerateAll : .none))
      }
      guard let ids = load(images.ids, mipmaps: false), let si = load(images.shadeIds2),
        let normal = load(images.normal), let fiber = load(images.fiberNormal)
      else { return nil }
      let t = Textures(ids: ids, shadeIds2: si, normal: normal, fiberNormal: fiber)
      cached = t
      return t
    }

    /// Bảng màu 64×2 của một bài: hàng 0 màu vai trò tuyến tính, hàng 1 hạng vai trò (ổn định 1, phụ 2,
    /// chính 3) / 3. nil = không dựng được.
    static func palette(roles: [String: [String]], shared: MuscleShader.Shared, primaryOnly: Bool) -> TextureResource? {
      let table = MuscleShader.palette(roles: roles, shared: shared, primaryOnly: primaryOnly)
      let roleColors = MuscleShader.roleHex.map { MuscleShader.linear($0.hex) }
      var bytes = [UInt8](repeating: 0, count: 64 * 2 * 4)
      for (i, color) in table.enumerated() {
        guard let color else { continue }
        let rank = (roleColors.firstIndex(of: color) ?? 0) + 1
        bytes[i * 4] = UInt8((color.x * 255).rounded())
        bytes[i * 4 + 1] = UInt8((color.y * 255).rounded())
        bytes[i * 4 + 2] = UInt8((color.z * 255).rounded())
        bytes[(64 + i) * 4] = UInt8(rank * 85)
      }
      guard let image = rgb(bytes, 64, 2) else { return nil }
      return try? TextureResource(image: image, options: .init(semantic: .raw, mipmapsMode: .none))
    }

    /// Vật liệu tô cơ thay vật liệu PBR của thân (`body` = có normal) hay quần. Giữ độ nhám, kim loại
    /// và mặt cắt của vật liệu gốc.
    static func material(
      replacing pbr: PhysicallyBasedMaterial, body: Bool, textures: Textures, palette: TextureResource
    ) -> CustomMaterial? {
      guard let shaders = loadShaders() else { return nil }
      guard var m = try? CustomMaterial(surfaceShader: body ? shaders.body : shaders.apparel, lightingModel: .lit)
      else { return nil }
      let base = MuscleShader.linear(body ? MuscleShader.bodyHex : MuscleShader.apparelHex)
      let gain = body ? MuscleShader.bodyGain : MuscleShader.apparelGain
      m.custom.value = SIMD4(base.x, base.y, base.z, gain)
      m.custom.texture = .init(textures.ids)
      m.emissiveColor.texture = .init(palette)
      m.baseColor.texture = .init(textures.shadeIds2)
      if body {
        m.normal.texture = .init(textures.normal)
        m.ambientOcclusion.texture = .init(textures.fiberNormal)
      }
      m.roughness.scale = pbr.roughness.scale
      m.metallic.scale = pbr.metallic.scale
      m.faceCulling = pbr.faceCulling
      return m
    }

    private static func loadShaders() -> (body: CustomMaterial.SurfaceShader, apparel: CustomMaterial.SurfaceShader)? {
      if let shaders { return shaders }
      guard let device = MTLCreateSystemDefaultDevice(), let library = device.makeDefaultLibrary() else { return nil }
      let s = (
        CustomMaterial.SurfaceShader(named: "ascndMuscleBody", in: library),
        CustomMaterial.SurfaceShader(named: "ascndMuscleApparel", in: library)
      )
      shaders = s
      return s
    }

    /// RGBX 8 bit, không quản lý màu (số đọc ra đúng như đã ghi).
    nonisolated private static func rgb(_ bytes: [UInt8], _ w: Int, _ h: Int) -> CGImage? {
      guard let provider = CGDataProvider(data: Data(bytes) as CFData) else { return nil }
      return CGImage(
        width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: provider,
        decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }
  }
#endif
