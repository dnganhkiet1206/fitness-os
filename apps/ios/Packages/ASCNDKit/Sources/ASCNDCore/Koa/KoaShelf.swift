public import Foundation

/// Kệ cúp và khung mốc trong phòng Koa (#792). Theo mock A, Kiệt giao E quyết ngày 04/11 (#527):
/// - cúp vàng đặt vào chỗ trống sẵn có trên kệ cho các kỷ lục thật mới nhất, tối đa `maxCups`;
/// - khung mốc nhỏ trên tường cho buổi đầu, tuần đủ buổi đầu tiên và lần lên hạng gần nhất;
/// - chạm cúp hay khung thì Koa kể lại (app lo câu chữ).
///
/// Mọi thứ TÍNH LẠI từ hành trình (`KoaJourney`), không có bảng riêng. Vì vậy đồ chỉ thêm, không
/// bao giờ mất khi nghỉ hay tạm nghỉ, và không mua được bằng xu. Kỷ lục cũ rời kệ vẫn nằm ở màn
/// Hành trình. Chưa có mốc nào thì phòng y như cũ.
public enum KoaShelf {
  /// Kệ có hai chỗ trống ở tầng trên và một chỗ ở tầng dưới. Kỷ lục cũ hơn xem ở màn Hành trình.
  public static let maxCups = 3

  /// Một cúp: một ngày có kỷ lục của hành trình.
  public struct Cup: Sendable, Hashable, Identifiable {
    /// Khoá của mốc kỷ lục (`record:<ngày>`).
    public let id: String
    public let date: LocalDate
    /// Kỷ lục lớn nhất của ngày ấy, tính lại từ các set đã lưu. `nil` khi không tính lại được, ví
    /// dụ set đã sửa sau đó hay buổi nằm ngoài `PersonalRecords.historyLimit` buổi gần nhất.
    public let record: PersonalRecord?

    public init(id: String, date: LocalDate, record: PersonalRecord?) {
      self.id = id
      self.date = date
      self.record = record
    }
  }

  public enum FrameKind: String, Sendable, Hashable, CaseIterable, Codable {
    case first, week, rank
  }

  /// Một khung mốc trên tường.
  public struct Frame: Sendable, Hashable, Identifiable {
    public let kind: FrameKind
    public let date: LocalDate
    /// Hạng mới, chỉ có ở `rank`.
    public let rank: Int
    public var id: String { kind.rawValue }

    public init(kind: FrameKind, date: LocalDate, rank: Int = 0) {
      self.kind = kind
      self.date = date
      self.rank = rank
    }
  }

  /// Một buổi đã lưu, đủ để so kỷ lục.
  public struct Session: Sendable, Hashable {
    public let at: EpochMillis
    public let date: LocalDate
    public let sets: [RecordSet]

    public init(at: EpochMillis, date: LocalDate, sets: [RecordSet]) {
      self.at = at
      self.date = date
      self.sets = sets
    }
  }

  /// Phần vẽ: bao nhiêu cúp, những khung nào. Đây là khoá của bộ nhớ đệm phòng, nên chỉ giữ thứ đổi hình.
  public struct Display: Sendable, Hashable {
    public var cups: Int
    public var frames: Set<FrameKind>

    public init(cups: Int = 0, frames: Set<FrameKind> = []) {
      self.cups = cups
      self.frames = frames
    }

    public var isEmpty: Bool { cups <= 0 && frames.isEmpty }
  }

  // MARK: - Chọn đồ

  /// Cúp: các mốc kỷ lục, mới nhất trước, tối đa `maxCups`.
  public static func cups(_ moments: [KoaJourney.Moment], records: [LocalDate: PersonalRecord]) -> [Cup] {
    moments.filter { $0.kind == .record }
      .sorted { $0.date > $1.date }
      .prefix(maxCups)
      .map { Cup(id: $0.id, date: $0.date, record: records[$0.date]) }
  }

  /// Khung: buổi đầu, tuần đủ buổi đầu tiên, lần lên hạng cao nhất. Mốc nào chưa có thì chưa treo.
  /// Mỗi loại có chỗ cố định trên tường (`frameSlot`), nên khung mới không đẩy khung cũ.
  public static func frames(_ moments: [KoaJourney.Moment]) -> [Frame] {
    var out: [Frame] = []
    if let m = moments.first(where: { $0.kind == .firstSession }) { out.append(Frame(kind: .first, date: m.date)) }
    if let m = moments.first(where: { $0.kind == .firstFullWeek }) { out.append(Frame(kind: .week, date: m.date)) }
    if let m = moments.filter({ $0.kind == .rankUp }).max(by: { $0.value < $1.value }) {
      out.append(Frame(kind: .rank, date: m.date, rank: m.value))
    }
    return out
  }

  public static func display(cups: [Cup], frames: [Frame]) -> Display {
    Display(cups: min(cups.count, maxCups), frames: Set(frames.map(\.kind)))
  }

  /// Kỷ lục của mỗi ngày, tính lại bằng đúng luật lúc chốt buổi (`PersonalRecords.findRecords`):
  /// buổi cũ trước, mỗi buổi so với các buổi trước nó. Ngày có nhiều buổi lấy kỷ lục tăng nhiều
  /// nhất của buổi ĐẦU TIÊN có kỷ lục; như Gains, chỉ buổi tạ đầu trong ngày được tính là ngày kỷ lục.
  public static func records(_ sessions: [Session]) -> [LocalDate: PersonalRecord] {
    var bests: PersonalRecords.Bests = [:]
    var out: [LocalDate: PersonalRecord] = [:]
    for s in sessions.sorted(by: { $0.at < $1.at }) {
      if out[s.date] == nil, let top = PersonalRecords.findRecords(s.sets, bests: bests).first {
        out[s.date] = top
      }
      bests = PersonalRecords.bests(from: s.sets, into: bests)
    }
    return out
  }

  // MARK: - Chỗ đặt (toạ độ phòng `StudioScene`, 390 × 476)

  /// Một điểm của phòng.
  public struct Spot: Sendable, Hashable {
    public let x: Double
    public let y: Double
  }

  /// Cỡ một cúp: rộng 14, cao 18, đáy nằm trên mặt kệ.
  public static let cupSize = (width: 14.0, height: 18.0)
  /// Cỡ một khung mốc.
  public static let frameSize = (width: 26.0, height: 34.0)

  /// Giữa đáy của từng cúp trên kệ đang dùng, chỗ đầu cho cúp mới nhất. Chỉ là chỗ trống sẵn có,
  /// không dời đồ của kệ:
  /// - kệ gốc và kệ chrome (đồ ở cùng chỗ, cả sau khi kệ gốc vẽ lại 04/11, #799): tầng trên, bên phải
  ///   bình nước (92…116) và giữa chậu cây với bình nước (55…76); tầng dưới, giữa ấm tạ với con lăn (53…78);
  /// - giá olympic không có tầng: ba cúp đứng trên xà ngang trên cùng (y 232).
  public static func cupSpots(shelf variant: String?) -> [Spot] {
    switch variant {
    case "olympic": [Spot(x: 72, y: 232), Spot(x: 44, y: 232), Spot(x: 100, y: 232)]
    default: [Spot(x: 104, y: 250), Spot(x: 65.5, y: 250), Spot(x: 65, y: 350)]
    }
  }

  /// Góc trên trái của khung mỗi loại, trên tường trái, giữa bảng hiệu và kệ.
  public static func frameSlot(_ kind: FrameKind) -> Spot {
    switch kind {
    case .first: Spot(x: 26, y: 76)
    case .week: Spot(x: 58, y: 76)
    case .rank: Spot(x: 90, y: 76)
    }
  }

  /// Khung chữ nhật của cúp thứ `index` (để app đặt vùng chạm).
  public static func cupRect(_ index: Int, shelf variant: String?) -> (x: Double, y: Double, width: Double, height: Double)? {
    let spots = cupSpots(shelf: variant)
    guard spots.indices.contains(index) else { return nil }
    let s = spots[index]
    return (s.x - cupSize.width / 2, s.y - cupSize.height, cupSize.width, cupSize.height)
  }

  public static func frameRect(_ kind: FrameKind) -> (x: Double, y: Double, width: Double, height: Double) {
    let s = frameSlot(kind)
    return (s.x, s.y, frameSize.width, frameSize.height)
  }

  // MARK: - Vẽ (theo mock A)

  /// Cúp vẽ ngay trước phần tử này của template: món cuối của kệ (chậu cây tầng trên), nên cúp ở
  /// lớp `props` và trong mặt nạ che Koa của kệ (`KoaRoomMap.occluders`). Hai thứ không chồng nhau.
  static let cupsAt = 91
  /// Khung treo ngay trước phần tử này: món cuối của lớp tường `wallTop` (chấm của bảng số, tường phải).
  static let framesAt = 76

  struct Ink {
    let glowAlpha: Double
    let plinth: String
    let mat: String
    let icon: String
  }

  static func ink(light: Bool) -> Ink {
    light
      ? Ink(glowAlpha: 0.22, plinth: "#7A5634", mat: "#FBF4E6", icon: "#B9832A")
      : Ink(glowAlpha: 0.35, plinth: "#3A2A12", mat: "#1B1E44", icon: "#F2C14E")
  }

  static func defs(light: Bool) -> KoaRender.Element {
    KoaRender.Element(
      "Defs",
      kids: [
        KoaBedroom.linear("shelfGold", [(0, "#F7D888"), (1, "#C08A2E")]),
        KoaBedroom.glow("shelfGlow", "#FFD27A", ink(light: light).glowAlpha),
        KoaRender.Element(
          "LinearGradient",
          ["id": .string("shelfFrame"), "x1": .number(0), "y1": .number(0), "x2": .number(1), "y2": .number(1)],
          kids: [
            KoaRender.Element("Stop", ["offset": .number(0), "stopColor": .string("#D9B25E")]),
            KoaRender.Element("Stop", ["offset": .number(1), "stopColor": .string("#8F6A24")]),
          ]),
      ])
  }

  /// Cúp trên kệ đang dùng; trống khi chưa có kỷ lục.
  static func cupTree(_ o: StudioScene.Options) -> [KoaRender.Element] {
    let n = min(max(0, o.shelf.cups), maxCups)
    guard n > 0 else { return [] }
    return [defs(light: o.light)] + cupSpots(shelf: o.decor["shelf"]).prefix(n).map { cup($0, light: o.light) }
  }

  /// Một cúp, đáy ở `s`: quầng sáng, quai, thân, chân, đế gỗ có biển tên.
  static func cup(_ s: Spot, light: Bool) -> KoaRender.Element {
    let c = ink(light: light)
    var bowl = KoaBedroom.path("M2 1H12V5C12 8.5 9.8 10.5 7 10.5C4.2 10.5 2 8.5 2 5Z", "url(#shelfGold)")
    bowl.props["stroke"] = .string("#8A5F17")
    bowl.props["strokeWidth"] = .number(0.4)
    return KoaRender.Element(
      "G", matrix: [1, 0, 0, 1, s.x - cupSize.width / 2, s.y - cupSize.height],
      kids: [
        KoaBedroom.ellipse(7, 9, 10, 9, "url(#shelfGlow)"),
        KoaBedroom.line("M2 2.5H0.6C0.6 5.2 1.6 6.4 2.6 6.6M12 2.5H13.4C13.4 5.2 12.4 6.4 11.4 6.6", "#D9A640", width: 0.9),
        bowl,
        KoaBedroom.rect(6.2, 10.5, 1.6, 3, "#C08A2E"),
        KoaBedroom.rect(3.5, 13.4, 7, 2, "url(#shelfGold)", r: 0.6),
        KoaBedroom.rect(2.6, 15.4, 8.8, 2.6, c.plinth, r: 0.5),
        KoaBedroom.rect(4.2, 16.4, 5.6, 0.6, "#E8C066", r: 0.3),
      ])
  }

  /// Khung mốc đã có; trống khi chưa có mốc.
  static func frameTree(_ o: StudioScene.Options) -> [KoaRender.Element] {
    let kinds = FrameKind.allCases.filter { o.shelf.frames.contains($0) }
    guard !kinds.isEmpty else { return [] }
    return [defs(light: o.light)] + kinds.map { frame($0, light: o.light) }
  }

  /// Khung vàng, nền thẫm (sáng ở phòng ban ngày), biểu tượng của mốc: cờ, lịch có dấu tích, mũi tên lên.
  static func frame(_ kind: FrameKind, light: Bool) -> KoaRender.Element {
    let c = ink(light: light)
    let s = frameSlot(kind)
    let icon: [KoaRender.Element] =
      switch kind {
      case .first: [KoaBedroom.line("M9 25V9M9 9.5L18 12L9 15", c.icon, width: 1.3)]
      case .week:
        [
          KoaBedroom.line("M6.5 9H19.5V21H6.5Z", c.icon, width: 1.1),
          KoaBedroom.line("M6.5 12.5H19.5M9.5 7.5V10.5M16.5 7.5V10.5M9.8 16.3L12.2 18.6L16.4 14", c.icon, width: 1.1),
        ]
      case .rank:
        [
          KoaRender.Element(
            "Circle",
            [
              "cx": .number(13), "cy": .number(15), "r": .number(6.6), "fill": .string("none"), "stroke": .string(c.icon),
              "strokeWidth": .number(1.1),
            ]),
          KoaBedroom.line("M13 19V11.4M9.8 14.4L13 11.2L16.2 14.4", c.icon, width: 1.2),
        ]
      }
    return KoaRender.Element(
      "G", matrix: [1, 0, 0, 1, s.x, s.y],
      kids: [
        KoaBedroom.rect(0, 0, frameSize.width, frameSize.height, "url(#shelfFrame)", r: 2),
        KoaBedroom.rect(2.2, 2.2, frameSize.width - 4.4, frameSize.height - 4.4, c.mat, r: 1),
      ] + icon)
  }
}

/// Đọc lịch sử để tính lại kỷ lục của kệ cúp: ngày và set của các buổi gần nhất.
public enum KoaShelfSync {
  /// Cùng cửa sổ với lúc chốt buổi (`PersonalRecords.historyLimit` buổi gần nhất).
  public static func query(userId: String) -> RowQuery {
    RowQuery(
      table: "workout_sessions", columns: "date_time, sets", filters: [.eq("user_id", .string(userId))],
      order: .init(column: "date_time", ascending: false), limit: PersonalRecords.historyLimit)
  }

  /// Hàng `workout_sessions` → buổi theo giờ địa phương. Hàng không đọc được giờ thì bỏ.
  public static func sessions(_ rows: [JSONValue], in tz: TimeZone) -> [KoaShelf.Session] {
    rows.compactMap { row in
      guard let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }) else { return nil }
      return KoaShelf.Session(at: at, date: LocalDate(at, in: tz), sets: PersonalRecords.sets(fromJSON: row["sets"]))
    }
  }

  /// `nil` khi đọc hỏng: phòng giữ kệ đang có.
  public static func load(userId: String, store: any RowStore, in tz: TimeZone) async -> [LocalDate: PersonalRecord]? {
    guard let rows = try? await store.select(query(userId: userId)) else { return nil }
    return KoaShelf.records(sessions(rows, in: tz))
  }
}
