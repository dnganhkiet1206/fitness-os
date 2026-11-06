import Foundation

/// Koa quay mặt kiểu 2.5D (Koa V2, 05/11, Kiệt duyệt mock `docs/koa-v2/gallery/v5-2.5d-turn/`).
///
/// Dùng nguyên nét vẽ, không vẽ góc mới. Mỗi mảng nhỏ chỉ được DỜI và CO ngang theo độ sâu của nó:
/// - mắt, mày, má, mũi, miệng, chỏm lông trượt trên một mặt trụ quanh đầu (mũi nhô ra nên trượt
///   nhiều hơn), mảng phía xa hẹp lại;
/// - bụng và bóng cằm trượt trên thân;
/// - tai, tay, chân quay như những điểm có độ sâu: tai lùi về phía ngược lại.
///
/// Dáng đầu và thân giữ nguyên, như cách các nhân vật phẳng (rig 2D) làm đầu quay. Chỉ ở bản native.
public enum KoaTurn {
  /// Góc lớn nhất (độ) khi `turn` = ±1. Soi trên simulator 05/11: ở 35° mắt phía xa chạm mép đầu.
  public static let maxDeg = 30.0
  /// Dáng đầu không quay, nên mặt trượt ít hơn 3D thật một chút.
  static let faceGain = 0.8
  /// Mức quay theo ánh nhìn (nhìn theo ngón tay, liếc): nhẹ, để đầu như ngoảnh theo.
  public static let gazeGain = 0.35

  /// Vùng của một lớp trong cây cảnh.
  /// `tuft`: chỏm lông và miếng che chân chỏm đi cùng nhau một khoảng (dời riêng từng mảng thì
  /// lọn lông trượt vào dưới miếng che, soi 05/11).
  enum Region: Sendable { case face, tuft, ears, arms, legs, torso }
  /// Chân chỏm lông, trên mặt trụ của đầu.
  static let tuftBase = Point(x: 120, y: 44)

  static func region(_ id: String?) -> Region? {
    switch id {
    case "FACE": .face
    case "head_top_fur": .tuft
    case "EARS": .ears
    case "ARMS": .arms
    case "LEGS": .legs
    case "TORSO": .torso
    default: nil
    }
  }

  // Khối đầu / thân trong toạ độ riêng của chúng (đầu: khung `HEAD` / `FACE`, chưa cộng 11).
  static let head = (cx: 120.0, cy: 101.0, rx: 80.0, ry: 67.0)
  static let torso = (cx: 120.0, cy: 210.0, rx: 56.0, ry: 70.0)
  /// Mũi (và vệt sáng, lỗ mũi) nằm nhô trước mặt.
  static let noseBox = (x0: 105.0, x1: 135.0, y0: 84.0, y1: 124.0)
  static let noseLift = 26.0

  /// Biến đổi cho một mảng có tâm (`x`, `y`) ở vùng `r`, độ quay `u` (−1…1).
  /// `nil` = không đổi; `hidden` = mảng đã quay ra sau, không vẽ.
  enum Move: Equatable { case keep, hidden, mat(KoaMath.Mat) }

  static func move(_ r: Region, x: Double, y: Double, u: Double) -> Move {
    guard u != 0 else { return .keep }
    let phi = u * maxDeg * Double.pi / 180
    switch r {
    case .tuft:
      guard case .mat(let m) = move(.face, x: tuftBase.x, y: tuftBase.y, u: u) else { return .keep }
      return .mat([1, 0, 0, 1, m[0] * tuftBase.x + m[4] - tuftBase.x, 0])
    case .face, .torso:
      let e = r == .face ? head : torso
      let nose = r == .face && x > noseBox.x0 && x < noseBox.x1 && y > noseBox.y0 && y < noseBox.y1
      let k = max(0.05, 1 - pow((y - e.cy) / e.ry, 2))
      let rad = e.rx * k.squareRoot() + (nose ? noseLift : 0)
      let th = asin(max(-0.98, min(0.98, (x - e.cx) / rad)))
      let t2 = th + phi * (r == .face ? faceGain : 1)
      if abs(t2) > 1.35 { return .hidden }
      let nx = e.cx + rad * sin(t2)
      let sx = max(0.25, min(1.3, cos(t2) / max(0.2, cos(th))))
      return .mat([sx, 0, 0, 1, nx - sx * x, 0])
    case .ears:
      let ec = x < 120 ? 54.0 : 186.0, dz = 30.0
      let nx = 120 + (ec - 120) * cos(phi) - dz * sin(phi)
      let sx = 0.85 + 0.15 * cos(phi)
      return .mat([sx, 0, 0, 1, nx - sx * ec, 0])
    case .arms, .legs:
      let c = r == .arms ? (x < 120 ? 78.0 : 162.0) : (x < 120 ? 94.0 : 146.0)
      let dz = r == .arms ? -2.0 : 5.0
      let nx = 120 + (c - 120) * cos(phi) - dz * sin(phi)
      return .mat([1, 0, 0, 1, nx - c, 0])
    }
  }

  // MARK: - Đầu ngoảnh, bóng phía khuất

  /// Đầu ngoảnh theo hướng quay: hàm / má đi theo nhiều, đỉnh đầu gần như đứng (nghiêng ngang quanh
  /// đỉnh đầu). Dáng đầu đứng im thì mặt trông như mặt nạ trượt (soi 05/11).
  static func headMat(_ u: Double) -> KoaMath.Mat {
    let top = 45.0, chin = 179.0
    let k = 5 * u / (chin - top)
    return [1, 0, k, 1, 1.5 * u - k * top, 0]
  }

  /// Độ dời của bản sao làm bóng (đơn vị hình): bóng = hình − bản sao dời về hướng quay, thành vệt
  /// trăng khuyết ở phía sau mặt (má / gáy lộ ra khi quay).
  static let crescentShift: [String: Double] = ["head_front": 18, "torso_front": 12]
  static let crescentColour = "#8E98A3"
  static let crescentOpacity = 0.28

  /// Vệt bóng phía khuất cho `head_front` / `torso_front`: một `ClipPath` (chính hình ấy) và một lớp
  /// tô `evenodd` (hình + bản sao dời). Rỗng khi không quay.
  static func crescent(id: String, d: String, u: Double) -> [KoaRender.Element] {
    guard u != 0, let s = crescentShift[id], let moved = translate(d, dx: s * u) else { return [] }
    let clip = "koaTurn_\(id)"
    return [
      KoaRender.Element("ClipPath", ["id": .string(clip)], kids: [KoaRender.Element("Path", ["d": .string(d)])]),
      KoaRender.Element(
        "G", ["clipPath": .string("url(#\(clip))"), "opacity": .number(crescentOpacity * min(1, abs(u)))],
        kids: [
          KoaRender.Element(
            "Path", ["d": .string(d + " " + moved), "fill": .string(crescentColour), "fillRule": .string("evenodd")])
        ]),
    ]
  }

  /// Dời một path tuyệt đối theo chiều ngang. `nil` khi có lệnh không đọc được.
  static func translate(_ d: String, dx: Double) -> String? {
    var out = "", cmd: Character = "M", idx = 0, token = ""
    func fmt(_ v: Double) -> String { String(format: "%.2f", v) }
    func emit() {
      guard let v = Double(token) else { token = ""; return }
      token = ""
      let isX: Bool
      switch cmd {
      case "M", "L", "C", "Q", "S", "T": isX = idx % 2 == 0
      case "H": isX = true
      case "A": isX = idx % 7 == 5
      default: isX = false
      }
      out += (isX ? fmt(v + dx) : fmt(v)) + " "
      idx += 1
    }
    for ch in d {
      if ch.isLetter, ch != "e" {
        emit()
        guard "MLHVCQSTAZ".contains(ch) else { return nil }
        cmd = ch; idx = 0; out += String(ch)
      } else if ch == "-" && !token.isEmpty && token.last != "e" {
        emit(); token = "-"
      } else if ch == "," || ch == " " || ch == "\n" {
        emit()
      } else {
        token.append(ch)
      }
    }
    emit()
    return out
  }

  // MARK: - Tâm của một mảng

  struct Point: Sendable, Hashable {
    let x: Double
    let y: Double
  }

  static let anchors = KoaMemo<String, Point?>(capacity: 2048)

  /// Tâm hộp bao của một nút hình (elip, tròn, chữ nhật, path). `nil` = không đọc được.
  static func anchor(_ t: String, _ a: [String: KoaScene.Value]?) -> Point? {
    guard let a else { return nil }
    func num(_ k: String) -> Double? { a[k]?.number }
    switch t {
    case "ellipse", "circle":
      guard let x = num("cx"), let y = num("cy") else { return nil }
      return Point(x: x, y: y)
    case "rect":
      // chữ nhật trong cảnh là miếng che đường nối (chân chỏm lông, cùng màu đầu): đứng yên với đầu,
      // dời đi thì lộ thành một mảng vuông (soi 05/11)
      return nil
    case "path":
      guard case .string(let d)? = a["d"] else { return nil }
      return anchors.value(d) { isBox(d) ? nil : bboxCentre(d) }
    default:
      return nil
    }
  }

  /// Path là một hình chữ nhật thẳng (chỉ M / L / Z, hai giá trị x, hai giá trị y): miếng che đường
  /// nối, ví dụ dưới chỏm lông `M99 38 L141 38 L141 66 L99 66 Z` — đứng yên như `rect`.
  static func isBox(_ d: String) -> Bool {
    guard d.allSatisfy({ !$0.isLetter || "MLZ".contains($0) }) else { return false }
    let n = d.split(whereSeparator: { $0.isLetter || $0 == " " || $0 == "," }).compactMap { Double($0) }
    guard n.count == 8 || n.count == 10 else { return false }
    let xs = Set(stride(from: 0, to: n.count, by: 2).map { n[$0] }), ys = Set(stride(from: 1, to: n.count, by: 2).map { n[$0] })
    return xs.count == 2 && ys.count == 2
  }

  /// Tâm hộp bao của điểm đầu / cuối / điểm điều khiển (đủ để biết mảng nằm đâu).
  /// Chỉ lệnh tuyệt đối — cảnh Koa chỉ dùng M L H V C Q A Z.
  static func bboxCentre(_ d: String) -> Point? {
    var nums: [Double] = []
    var cmd: Character = "M"
    var x0 = Double.infinity, x1 = -Double.infinity, y0 = Double.infinity, y1 = -Double.infinity
    var cx = 0.0, cy = 0.0
    func add(_ x: Double, _ y: Double) {
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
      cx = x; cy = y
    }
    func flush() {
      var i = 0
      switch cmd {
      case "M", "L", "C", "Q", "S", "T":
        while i + 1 < nums.count { add(nums[i], nums[i + 1]); i += 2 }
      case "H": for v in nums { add(v, cy) }
      case "V": for v in nums { add(cx, v) }
      case "A":
        while i + 6 < nums.count { add(nums[i + 5], nums[i + 6]); i += 7 }
      default: break
      }
      nums.removeAll(keepingCapacity: true)
    }
    var token = ""
    func push() {
      if let v = Double(token) { nums.append(v) }
      token = ""
    }
    for ch in d {
      if ch.isLetter, ch != "e" {
        push(); flush(); cmd = ch
      } else if ch == "-" && !token.isEmpty && token.last != "e" {
        push(); token = "-"
      } else if ch == "," || ch == " " || ch == "\n" {
        push()
      } else if ch == "." && token.contains(".") {
        push(); token = "."
      } else {
        token.append(ch)
      }
    }
    push(); flush()
    guard x0.isFinite, y0.isFinite else { return nil }
    return Point(x: (x0 + x1) / 2, y: (y0 + y1) / 2)
  }
}
