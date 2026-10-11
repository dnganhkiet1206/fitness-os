/// Cảm xúc của linh vật → dáng của Koa (#527, K4) — `koaStateFor`
/// (`lib/koa-emotion.ts`) và `wornFrom` (`mascot-figure.tsx`) @ fac9ac2.
public enum KoaEmotion {
  /// `MascotEmotion`.
  public enum Emotion: String, Sendable, Hashable, CaseIterable {
    case idle, happy, sad, tired, sleep, celebrate, curl, wave, worry, proud, rested, oops, run, hat, coat
  }

  /// `DEV_EMOTIONS`: các cảm xúc thanh DEV của phòng linh vật cho ép, đúng thứ tự.
  public static let devEmotions: [Emotion] = [.idle, .happy, .sad, .tired, .sleep, .celebrate, .curl, .wave, .run]

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
    // mệt → ngồi xuống thở
    .tired: State(.tired, .relaxing),
    .sleep: State(.tired, .relaxing),
    .celebrate: State(.delighted, .idle),
    // ghi buổi tập → cùng cuốn tạ
    .curl: State(.strain, .lifting),
    // chào → quay 3/4 (KHÔNG phải `stretching`, tư thế ấy nghiêng người)
    .wave: State(.happy, .turn34),
    .run: State(.happytired, .running),
    .worry: State(.plead, .idle),
    .proud: State(.confident, .idle),
    .oops: State(.surprised, .idle),
    .rested: State(.happytired, .idle, [.head: "beanie"]),
    .hat: State(.happy, .idle, [.head: "santa"]),
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
