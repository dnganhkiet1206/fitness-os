/// Một lượt ở phòng Koa, cho đo lường (01/11): ở bao lâu, chạm Koa mấy lần, gọi Koa đi mấy lần.
/// Gửi theo khoảng, không gửi số đúng, để sự kiện chỉ nói "đã làm gì" như mọi sự kiện khác.
public struct KoaRoomVisit: Sendable, Hashable {
  private var openedAt: Double?
  private var pokes = 0
  private var walks = 0

  public init() {}

  /// `true` khi đây là đầu lượt; mở lại lúc đang mở thì không tính.
  public mutating func open(at time: Double) -> Bool {
    guard openedAt == nil else { return false }
    openedAt = time
    pokes = 0
    walks = 0
    return true
  }

  public mutating func poked() { pokes += 1 }
  public mutating func walked() { walks += 1 }

  /// Thuộc tính của sự kiện rời phòng; `nil` khi không có lượt nào đang mở.
  public mutating func close(at time: Double) -> [String: String]? {
    guard let openedAt else { return nil }
    self.openedAt = nil
    return ["duration": Self.duration(time - openedAt), "pokes": Self.count(pokes), "walks": Self.count(walks)]
  }

  static func duration(_ seconds: Double) -> String {
    switch seconds {
    case ..<10: "under_10s"
    case ..<30: "10_30s"
    case ..<120: "30_120s"
    default: "over_120s"
    }
  }

  static func count(_ n: Int) -> String {
    switch n {
    case 0: "0"
    case 1...3: "1_3"
    default: "4_plus"
    }
  }
}
