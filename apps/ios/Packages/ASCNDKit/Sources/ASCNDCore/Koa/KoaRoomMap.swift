public import Foundation

/// Bản đồ không gian của phòng studio (29/10, Koa có ý định): dựng từ CHÍNH hình của
/// phòng (`StudioScene`, đo bằng khung bao từng phần tử) — không thêm đồ, không đổi phòng.
///
/// Hai mặt phẳng:
/// - **sàn** (cao 0): dải sàn sau bục và hai bên, giữa tường (chân tường y ≈ 360) và đồ đạc;
/// - **sân khấu** = mặt bục (cao `stageHeight`): chỗ tạo dáng / biểu cảm, có chỗ đứng gốc
///   (`stageMark`) và chỗ đứng gần người xem (`user`). Không phải sàn để đi xuyên qua:
///   đường đi trên sàn vòng sau bục, lên / xuống bục bằng bước nhảy ở hai bậc.
///
/// Toạ độ: phòng 390, x sang phải; `d` là ĐỘ SÂU trên sàn (y của điểm chạm sàn nếu mọi thứ
/// ở cao 0). Trên màn, chân ở `y = d − cao`. Hình to / nhỏ theo `d` (xa nhỏ, gần to).
public enum KoaRoomMap {
  public enum Plane: Sendable, Hashable { case floor, stage }

  /// Một điểm đứng: mặt phẳng + toạ độ sàn.
  public struct Spot: Sendable, Hashable {
    public var plane: Plane
    public var x: Double
    public var d: Double
    public init(_ plane: Plane, _ x: Double, _ d: Double) {
      self.plane = plane
      self.x = x
      self.d = d
    }
  }

  /// Bục cao bao nhiêu (mặt trên y 381–442, mặt trước xuống tới 466).
  public static let stageHeight = 24.0
  /// Mặt bục trên sàn (chân bục): elip tâm (195, 435,5), bán trục 137 × 30,5.
  public static let stageCenter = (x: 195.0, d: 435.5)
  public static let stageRadius = (x: 137.0, d: 30.5)
  /// Phần bục Koa đứng được (chừa mép, để chân không thò ra ngoài viền).
  public static let stageInner = (x: 108.0, d: 20.0)
  /// Chỗ đứng gốc (`StudioScene.stageMark`, y 412 trên màn).
  public static let stageMark = Spot(.stage, 195, 436)
  /// Chỗ đứng gần người xem: giữa, mép trước bục, không sát mép màn (dải mờ dưới cảnh).
  public static let user = Spot(.stage, 195, 450)

  /// Tới giờ ngủ Koa đi tới đây rồi bắt đầu cảnh đi ngủ (`KoaBedtime`) sang phải.
  public static let door = Spot(.floor, 170, 368)

  /// Hai bậc lên / xuống bục ở phía sau, hai bên: điểm trên sàn ↔ điểm trên bục. Đặt đủ xa
  /// chân kệ và lá cây: Koa đổi lớp với đồ vật giữa cú nhảy, lúc ấy người không chồng lên đồ.
  public struct Step: Sendable, Hashable {
    public let floor: Spot
    public let stage: Spot
  }

  public static let steps = [
    Step(floor: Spot(.floor, 176, 377), stage: Spot(.stage, 176, 418)),
    Step(floor: Spot(.floor, 214, 377), stage: Spot(.stage, 214, 418)),
  ]

  /// Sàn đi được (độ sâu, toạ độ sàn): dải sau bục giữa kệ và chậu cây, chân luôn CAO HƠN
  /// mép sau của mặt bục trên màn (mép ở y ≈ 381 giữa, thấp dần ra hai bên) — bục không bao
  /// giờ cắt ngang người Koa (29/10, Kiệt: "bậc sân khấu chèn qua người"; trước là d 368–401).
  /// Sàn hai bên bục hẹp và ra sát mép màn (khung mờ hai bên) — không đi.
  public static let floorArea: [(x: Double, d: Double)] = [
    (146, 367), (292, 367), (294, 380), (146, 380),
  ]
  /// Giữa vùng sàn (đường vòng, kéo điểm về trong).
  static let floorMid = (x: 219.0, d: 374.0)

  /// Vùng chặn trên sàn (chân đồ đạc), để đường đi không đâm vào: kệ, chậu cây, bóng, bục.
  public struct Block: Sendable, Hashable {
    public let name: String
    public let minX: Double
    public let maxX: Double
    public let minD: Double
    public let maxD: Double
  }

  public static let blocks = [
    Block(name: "shelf", minX: 4, maxX: 140, minD: 360, maxD: 396),
    Block(name: "plant", minX: 298, maxX: 330, minD: 380, maxD: 400),
    Block(name: "ball", minX: 322, maxX: 382, minD: 382, maxD: 402),
  ]

  /// Đồ vật che được Koa khi Koa đứng SAU chúng: chỉ số phần tử của `StudioScene.template`
  /// (theo `decorData.spots`) và độ sâu chân đồ. Koa ở sàn có `d` nhỏ hơn → vẽ đồ đè lên.
  public struct Occluder: Sendable, Hashable {
    public let name: String
    /// Phần tử của đồ vật, làm mặt nạ cho lớp che (KHÔNG gồm bóng tiếp xúc trên sàn: bóng nằm
    /// dưới chân đồ, không che Koa).
    public let elements: [Int]
    public let minX: Double
    public let maxX: Double
    /// Độ sâu chân đồ vật trên sàn.
    public let baseD: Double
  }

  public static let occluders = [
    Occluder(name: "shelf", elements: Array(80...89) + [91], minX: 4, maxX: 140, baseD: 396),
    Occluder(name: "plant", elements: [92], minX: 262, maxX: 368, baseD: 400),
    Occluder(name: "ball", elements: [94], minX: 322, maxX: 382, baseD: 402),
    // Bục KHÔNG che: sàn đi được nằm hẳn sau mép bục trên màn (xem `floorArea`).
  ]

  /// Một đồ vật có sẵn trong tranh mà Koa ghé được.
  public struct Anchor: Sendable, Hashable {
    public enum Action: String, Sendable, Hashable, CaseIterable {
      /// Ngắm đồ trên kệ: nhìn lên / xuống từng món, nghiêng đầu.
      case inspect
      /// Lại gần chậu cây, nghiêng người ngửi lá — lá rung nhẹ.
      case sniff
      /// Ngước nhìn ra cửa sổ.
      case gaze
      /// Đọc bảng số trên tường.
      case read
    }

    public let name: String
    /// Chỗ đứng.
    public let stand: Spot
    /// Điểm nhìn (toạ độ MÀN của phòng, không phải sàn — đồ trên tường).
    public let look: (x: Double, y: Double)
    /// Đứng cách đồ vật bao xa (đã tính trong `stand`; để debug hiện).
    public let distance: Double
    public let action: Action
    /// Biểu cảm của hệ có sẵn khi tới nơi.
    public let expression: KoaFlags.Expression

    public static func == (a: Anchor, b: Anchor) -> Bool { a.name == b.name }
    public func hash(into h: inout Hasher) { h.combine(name) }
  }

  public static let anchors = [
    Anchor(
      name: "shelf", stand: Spot(.floor, 168, 375), look: (84, 322), distance: 34, action: .inspect,
      expression: .surprised),
    Anchor(
      name: "plant", stand: Spot(.floor, 270, 376), look: (318, 340), distance: 26, action: .sniff,
      expression: .happy),
    Anchor(
      name: "window", stand: Spot(.floor, 258, 370), look: (326, 214), distance: 60, action: .gaze,
      expression: .happytired),
    Anchor(
      name: "board", stand: Spot(.stage, 262, 424), look: (321, 276), distance: 50, action: .read,
      expression: .confident),
  ]

  public static func anchor(_ name: String) -> Anchor? { anchors.first { $0.name == name } }

  // MARK: - Chiều sâu

  /// Hình to bao nhiêu ở độ sâu `d` (1 ở chỗ đứng gốc).
  public static func scale(_ d: Double) -> Double { 1 + (d - stageMark.d) * 0.0045 }

  /// Chân trên màn (toạ độ phòng).
  public static func screenY(_ s: Spot) -> Double { s.d - (s.plane == .stage ? stageHeight : 0) }

  /// Đồ vật đứng trước Koa (Koa sau chân đồ). Chỉ theo độ sâu, không theo mặt phẳng: mặt phẳng
  /// đổi ở đầu cú nhảy, còn `d` đi qua chân đồ giữa không trung. Không xét bề ngang: Koa chưa
  /// chạm đồ thì lớp che không thấy gì, còn đoán bề ngang sai là đồ bật lên đè người Koa.
  public static func occluding(_ s: Spot) -> [Occluder] { occluders.filter { s.d < $0.baseD } }

  // MARK: - Hợp lệ

  static func inside(_ x: Double, _ d: Double, _ poly: [(x: Double, d: Double)]) -> Bool {
    var hit = false
    var j = poly.count - 1
    for i in 0..<poly.count {
      let a = poly[i], b = poly[j]
      if (a.d > d) != (b.d > d), x < (b.x - a.x) * (d - a.d) / (b.d - a.d) + a.x { hit.toggle() }
      j = i
    }
    return hit
  }

  public static func onStage(_ x: Double, _ d: Double) -> Bool {
    let ex = (x - stageCenter.x) / stageInner.x, ed = (d - stageCenter.d) / stageInner.d
    return ex * ex + ed * ed <= 1
  }

  public static func valid(_ s: Spot) -> Bool {
    switch s.plane {
    case .stage: return onStage(s.x, s.d)
    case .floor: return inside(s.x, s.d, floorArea) && !blocks.contains { s.x > $0.minX && s.x < $0.maxX && s.d > $0.minD && s.d < $0.maxD }
    }
  }

  /// Điểm hợp lệ gần nhất trên cùng mặt phẳng.
  public static func clamp(_ s: Spot) -> Spot {
    if valid(s) { return s }
    switch s.plane {
    case .stage:
      let ex = (s.x - stageCenter.x) / stageInner.x, ed = (s.d - stageCenter.d) / stageInner.d
      let r = (ex * ex + ed * ed).squareRoot()
      return Spot(.stage, stageCenter.x + (s.x - stageCenter.x) / r * 0.98, stageCenter.d + (s.d - stageCenter.d) / r * 0.98)
    case .floor:
      // điểm gần nhất trên các cạnh của vùng sàn
      var best = Spot(.floor, floorArea[0].x, floorArea[0].d), bestD = Double.infinity
      for i in 0..<floorArea.count {
        let a = floorArea[i], b = floorArea[(i + 1) % floorArea.count]
        let vx = b.x - a.x, vd = b.d - a.d
        let t = max(0, min(1, ((s.x - a.x) * vx + (s.d - a.d) * vd) / (vx * vx + vd * vd)))
        // lùi vào trong một chút
        let p = (x: a.x + vx * t, d: a.d + vd * t)
        let c = (x: p.x * 0.97 + floorMid.x * 0.03, d: p.d * 0.97 + floorMid.d * 0.03)
        let dist = hypot(c.x - s.x, c.d - s.d)
        if dist < bestD, valid(Spot(.floor, c.x, c.d)) {
          bestD = dist
          best = Spot(.floor, c.x, c.d)
        }
      }
      return best
    }
  }

  /// Chạm trên màn (toạ độ phòng) → chỗ đứng: trên mặt bục thì đứng trên bục, không thì
  /// trên sàn gần nhất.
  public static func spot(screenX x: Double, y: Double) -> Spot {
    if onStage(x, y + stageHeight) { return Spot(.stage, x, y + stageHeight) }
    // chạm vào hình bục (mặt trên hay mặt trước) → chỗ gần nhất TRÊN bục, không phải sàn sau
    if inPodium(x, y) { return clamp(Spot(.stage, x, min(y + stageHeight, stageCenter.d + stageInner.d))) }
    return clamp(Spot(.floor, x, y))
  }

  /// Điểm trên màn nằm trong hình bục: mặt trên (elip) hoặc mặt trước (xuống tới y 466).
  public static func inPodium(_ x: Double, _ y: Double) -> Bool {
    let top = stageCenter.d - stageHeight
    let ex = (x - stageCenter.x) / stageRadius.x
    guard abs(ex) <= 1 else { return false }
    let half = stageRadius.d * (1 - ex * ex).squareRoot()
    return y >= top - half && y <= top + half + stageHeight
  }

  // MARK: - Đường đi

  /// Một chặng: đi trên một mặt phẳng tới điểm, hoặc nhảy lên / xuống bục.
  public enum Leg: Sendable, Hashable {
    case walk([Spot])
    case hop(from: Spot, to: Spot)
  }

  /// Đường đi hợp lệ từ `a` tới `b`. Cùng mặt phẳng: đi thẳng (sàn: vòng qua các điểm
  /// mép nếu đường thẳng ra khỏi sàn). Khác mặt phẳng: tới bậc gần hơn, nhảy, đi tiếp.
  public static func route(from a: Spot, to b0: Spot) -> [Leg] {
    let b = clamp(b0)
    if a.plane == b.plane { return [.walk(path(a, b))] }
    let step = steps.min { cost(a, b, $0) < cost(a, b, $1) }!
    let (near, far) = a.plane == .floor ? (step.floor, step.stage) : (step.stage, step.floor)
    var legs: [Leg] = []
    if hypot(near.x - a.x, near.d - a.d) > 1 { legs.append(.walk(path(a, near))) }
    legs.append(.hop(from: near, to: far))
    if hypot(b.x - far.x, b.d - far.d) > 1 { legs.append(.walk(path(far, b))) }
    return legs
  }

  static func cost(_ a: Spot, _ b: Spot, _ s: Step) -> Double {
    let (near, far) = a.plane == .floor ? (s.floor, s.stage) : (s.stage, s.floor)
    return hypot(near.x - a.x, near.d - a.d) + hypot(b.x - far.x, b.d - far.d)
  }

  /// Đường trên một mặt phẳng: thẳng nếu mọi điểm giữa đều hợp lệ, không thì qua điểm
  /// giữa vùng sàn.
  static func path(_ a: Spot, _ b: Spot) -> [Spot] {
    func clear(_ p: Spot, _ q: Spot) -> Bool {
      for i in 1..<12 {
        let t = Double(i) / 12
        if !valid(Spot(p.plane, p.x + (q.x - p.x) * t, p.d + (q.d - p.d) * t)) { return false }
      }
      return true
    }
    if clear(a, b) { return [b] }
    let mid = a.plane == .floor ? Spot(.floor, floorMid.x, floorMid.d) : Spot(.stage, stageCenter.x, stageCenter.d)
    return [mid, b]
  }
}
