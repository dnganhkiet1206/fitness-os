public import Foundation

/// Phòng thử đồ của cửa hàng (#527, S2) — `ShopScene` / `ShopRoom` /
/// `shop-camera.ts` của RN @ fac9ac2.
///
/// Kiệt đồng ý cho native VẼ LẠI dựa trên bản RN: căn phòng (rèm, tủ, gương,
/// ghế, đèn, bục) lấy nguyên từ `ShopRoom` dựng ra SVG; native thêm ván sàn,
/// bóng mép rèm, bóng tiếp xúc, ánh tủ hắt xuống sàn, vũng sáng + quầng đèn,
/// viền sáng bục — xem `tools/studio/gen-shop.cjs` / `improve-shop.cjs`. Token
/// (skin, năng lượng) giải bằng luật của `StudioScene`.
///
/// Máy quay: mỗi tab là một khung hình trong cùng căn phòng (`SHOTS`);
/// `camera` phủ khung ấy lên khung nhìn (`cameraAt`: lấp đầy, canh giữa).
public enum ShopScene {
  public static let width = StudioScene.width
  public static let height = StudioScene.sceneBottom
  /// `STAGE_X` — bục dời sang trái để tủ đồ có chỗ.
  public static let stageX = 150.0
  /// `BAND_ASPECT` — cao / rộng của dải cảnh.
  public static let bandAspect = height / width

  public struct Shot: Sendable, Hashable {
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double

    public init(x: Double, y: Double, w: Double, h: Double) {
      self.x = x
      self.y = y
      self.w = w
      self.h = h
    }

    /// `shot()`: cao theo `BAND_ASPECT`.
    init(x: Double, y: Double, w: Double) { self.init(x: x, y: y, w: w, h: w * ShopScene.bandAspect) }
  }

  /// Bốn tab của cửa hàng, cũng là bốn khung hình.
  public enum ShotName: String, Sendable, Hashable, CaseIterable {
    case overview, stage, outfit, closet
  }

  /// `SHOTS`.
  public static func shot(_ name: ShotName) -> Shot {
    switch name {
    case .overview: Shot(x: 0, y: 0, w: width)
    case .stage: Shot(x: stageX - 145, y: 114, w: 290)
    case .outfit: Shot(x: stageX - 105, y: 218, w: 210)
    case .closet: Shot(x: 74, y: 92, w: 312)
    }
  }

  /// `FIGURE_BOX`: chỗ của nhân vật trên bục (`HERO_W` = 138, cao × 1,25).
  public static let figureBox: Shot = {
    let w = 138.0
    let h = w * KoaMath.aspect
    return Shot(x: stageX - w / 2, y: StudioScene.stageMark.y + 6 - h, w: w, h: h)
  }()

  /// `cameraAt`: ma trận phủ `shot` lên khung `vw × vh` — lấp đầy, canh giữa.
  public static func camera(_ shot: Shot, width vw: Double, height vh: Double) -> KoaMath.Mat {
    let s = max(vw / shot.w, vh / shot.h)
    let tx = (vw - shot.w * s) / 2 - shot.x * s
    let ty = (vh - shot.h * s) / 2 - shot.y * s
    return [s, 0, 0, s, tx, ty]
  }

  static let template: [JSONValue] = {
    do {
      return try JSONDecoder().decode([JSONValue].self, from: Data(json.utf8))
    } catch {
      preconditionFailure("shop-scene: \(error)")
    }
  }()

  /// Cả căn phòng, toạ độ 390 × 476. `skin` lạ → mặc định (như `STUDIO_SKINS[skin] ?? default`).
  public static func tree(skin: String, energy: Double) -> [KoaRender.Element] {
    var o = StudioScene.Options()
    o.skin = skin
    o.energy = energy
    return StudioScene.build(template, o)
  }
}
