import Foundation
#if canImport(RealityKit)
  import CoreGraphics
  import Metal
  import RealityKit

  /// Tô cơ trên GPU (17/11): `CustomMaterial` với shader `MuscleSurface.metal`, đọc thẳng bộ ảnh dùng
  /// chung (`muscle_*`). Đổi bài hay bật / tắt cơ phụ chỉ đổi bảng màu 64×2, không pha lại
  /// bốn ảnh 2K trên CPU như `MuscleShader.skins` (đường lùi khi GPU không dựng được vật liệu).
  @MainActor enum MuscleMaterial {
    /// Texture dùng chung cho mọi bài, nạp thẳng từ tệp ảnh một lần (không giải nén ra mảng byte).
    struct Textures {
      /// `muscle_ids`: R = phần cơ + 1, G = độ phủ, B = viền.
      let ids: TextureResource
      /// `muscle_ids2`: phần cơ thứ hai nằm dưới.
      let ids2: TextureResource
      let shade: TextureResource
      let normal: TextureResource
      let fiberNormal: TextureResource
    }

    /// Tên phần cơ + nhóm tổng hợp (`muscle_parts.json`), đủ để dựng bảng màu.
    struct Parts: Decodable, Sendable {
      let parts: [String]
      let aggregates: [String: [String]]
    }

    /// Theo hậu tố bộ ảnh ("" = nhân vật 003; "_005" = nhân vật 005, 24/11).
    private static var cached: [String: Textures] = [:]
    private static var cachedParts: [String: Parts] = [:]
    private static var shaders: (body: CustomMaterial.SurfaceShader, apparel: CustomMaterial.SurfaceShader)?

    static func parts(suffix: String = "") -> Parts? {
      if let p = cachedParts[suffix] { return p }
      guard let url = Bundle.main.url(forResource: "muscle_parts" + suffix, withExtension: "json"),
        let data = try? Data(contentsOf: url), let p = try? JSONDecoder().decode(Parts.self, from: data)
      else { return nil }
      cachedParts[suffix] = p
      return p
    }

    /// Nạp năm texture song song (lần đầu); các lần sau trả bản đã nạp (review #936).
    static func textures(suffix: String = "") async -> Textures? {
      if let t = cached[suffix] { return t }
      func load(_ name: String, mipmaps: Bool = true) async -> TextureResource? {
        // JPEG hay PNG đều được (máy xuất không có ImageMagick thì ra PNG, review #931).
        guard let url = Bundle.main.url(forResource: name + suffix, withExtension: "jpg")
          ?? Bundle.main.url(forResource: name + suffix, withExtension: "png")
        else { return nil }
        // raw: số đọc ra đúng như đã lưu (nhãn phần cơ phải chính xác từng điểm ảnh).
        return try? await TextureResource(
          contentsOf: url, options: .init(semantic: .raw, mipmapsMode: mipmaps ? .allocateAndGenerateAll : .none))
      }
      async let ids = load("muscle_ids", mipmaps: false)
      async let ids2 = load("muscle_ids2", mipmaps: false)
      async let shade = load("muscle_shade")
      async let normal = load("muscle_normal")
      async let fiber = load("muscle_fiber_normal")
      guard let ids = await ids, let ids2 = await ids2, let shade = await shade, let normal = await normal,
        let fiber = await fiber
      else { return nil }
      let t = Textures(ids: ids, ids2: ids2, shade: shade, normal: normal, fiberNormal: fiber)
      cached[suffix] = t
      return t
    }

    /// Bảng màu 64×2 của một bài: hàng 0 màu vai trò tuyến tính, hàng 1 hạng vai trò (ổn định 1, phụ 2,
    /// chính 3) / 3. nil = không dựng được.
    static func palette(roles: [String: [String]], parts: Parts, primaryOnly: Bool) -> TextureResource? {
      let table = MuscleShader.palette(
        roles: roles, parts: parts.parts, aggregates: parts.aggregates, primaryOnly: primaryOnly)
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
      m.baseColor.texture = .init(textures.shade)
      m.roughness.texture = .init(textures.ids2)
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
