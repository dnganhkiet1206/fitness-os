/// Cảm xúc của linh vật → dáng của Koa (#527, K4) — `koaStateFor`
/// (`lib/koa-emotion.ts`) và `wornFrom` (`mascot-figure.tsx`) @ fac9ac2.
public enum KoaEmotion {
  /// `MascotEmotion`.
  public enum Emotion: String, Sendable, Hashable, CaseIterable {
    case idle, happy, sad, tired, sleep, celebrate, curl, worry, proud, rested, oops, hat, coat
    /// Đợt 2 (sống theo lịch, 20/10): đợi ở phòng tập — cầm tạ khởi động, mặt gồng sức.
    case warmup
  }

  /// `DEV_EMOTIONS`: các cảm xúc thanh DEV của phòng linh vật cho ép, đúng thứ tự.
  /// Đã bỏ `wave` và `run` của RN (19/10, Kiệt): `turn34` không vẫy tay và
  /// `running` đứng yên trên sân khấu nên không đọc ra được; tên thô cũ rơi về `idle`.
  public static let devEmotions: [Emotion] = [.idle, .happy, .sad, .tired, .sleep, .celebrate, .curl]

  public struct State: Sendable, Hashable {
    public let expression: KoaFlags.Expression
    public let pose: KoaFlags.Pose
    /// Đồ mặc kèm cảm xúc (mũ len khi đã ngủ đủ, mũ Noel), chồng lên đồ đang mặc.
    public let outfit: KoaFlags.Worn

    init(_ expression: KoaFlags.Expression, _ pose: KoaFlags.Pose, _ outfit: KoaFlags.Worn = [:]) {
      self.expression = expression
      self.pose = pose
      self.outfit = outfit
    }
  }

  static let states: [Emotion: State] = [
    .idle: State(.happy, .idle),
    // ngày tốt → cười tít mắt
    .happy: State(.grin, .idle),
    .sad: State(.sad, .idle),
    // mệt → ngồi xuống thở; ngủ (sau 22h) → cũng ngồi. Cả hai ngồi thiền, mắt khép
    // (20/10, Kiệt chọn mock B; RN: mắt mệt mí nặng).
    .tired: State(.meditate, .relaxing),
    .sleep: State(.meditate, .relaxing),
    .celebrate: State(.delighted, .idle),
    // ghi buổi tập → cùng cuốn tạ
    .curl: State(.strain, .lifting),
    // nhắc nhẹ, không van nài cũng không làm người dùng thấy có lỗi (31/10)
    .worry: State(.surprised, .idle),
    // mí nửa khép của `.confident` đọc ra "chán", không phải tự hào
    .proud: State(.grin, .idle),
    // ăn quá: no căng, không phải giật mình trách móc
    .oops: State(.happytired, .idle),
    .rested: State(.happytired, .idle, [.head: "beanie"]),
    .hat: State(.happy, .idle, [.head: "santa"]),
    // Cầm tạ thì mặt GỒNG SỨC như bản thiết kế (`KoaSheetView.poseFace[.lifting]`);
    // mặt vui vẻ thường trên tư thế tạ đọc ra "không có biểu cảm" (20/10, chủ dự án).
    .warmup: State(.strain, .lifting),
    .coat: State(.happy, .idle),
  ]

  /// `koaStateFor`: cảm xúc lạ → như `idle`.
  public static func state(_ emotion: Emotion) -> State { states[emotion] ?? states[.idle]! }

  /// Cùng hàm, nhận tên cảm xúc thô (từ server / engine).
  public static func state(_ raw: String) -> State { state(Emotion(rawValue: raw) ?? .idle) }

  /// `wornFrom`: các khoá đang mặc (theo thứ tự hàng) → món của từng ô; món
  /// sau cùng ô thắng món trước, như vòng lặp của RN.
  public static func worn(_ equipped: some Sequence<String>) -> KoaFlags.Worn {
    var w: KoaFlags.Worn = [:]
    for key in equipped {
      guard let item = MascotShop.item(key), item.kind == .outfit, let s = item.slot, let id = item.koaId,
        !s.isEmpty, !id.isEmpty, let slot = KoaFlags.Slot(rawValue: s)
      else { continue }
      w[slot] = id
    }
    return w
  }
}
