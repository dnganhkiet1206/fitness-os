public import Foundation

/// Koa ló lên ở mọi tab (#527, Koa đợt 2A — chiến lược Kiệt duyệt 19/10): khi một
/// nhiệm vụ app THẤY vừa xong được nhận thưởng, Koa trồi lên ở mép màn của tab
/// đang mở với nét mặt hợp việc và "+N" xu.
///
/// "Ít mà đáng" (nguyên tắc 5): nghỉ ít nhất `cooldown` giữa hai lần, tối đa
/// `dailyCap` lần mỗi ngày — như `askPeek` / `mascot-budget.ts` của RN. Riêng lúc
/// xong hết việc của ngày luôn được hiện (khoảnh khắc ấy chỉ có một lần).
public enum KoaPeek {
  public static let cooldownMs = 90_000.0
  public static let dailyCap = 4

  /// Sổ hạn mức, lưu theo tài khoản trên máy.
  public struct Ledger: Sendable, Hashable, Codable {
    public var day: String
    public var shown: Int
    public var lastMs: Double

    public init(day: String, shown: Int, lastMs: Double) {
      self.day = day
      self.shown = shown
      self.lastMs = lastMs
    }
  }

  /// Được ló lên lúc này không. Ngày mới thì sổ cũ không tính.
  public static func allow(_ ledger: Ledger?, nowMs: Double, day: LocalDate, allDone: Bool) -> Bool {
    if allDone { return true }
    guard let ledger, ledger.day == day.description else { return true }
    return ledger.shown < dailyCap && nowMs - ledger.lastMs >= cooldownMs
  }

  /// Ghi một lần đã ló lên.
  public static func record(_ ledger: Ledger?, nowMs: Double, day: LocalDate) -> Ledger {
    let shown = ledger?.day == day.description ? ledger!.shown : 0
    return Ledger(day: day.description, shown: shown + 1, lastMs: nowMs)
  }

  /// Nét mặt của Koa cho việc vừa xong (chỉ hình đã vẽ).
  public static func emotion(_ quest: MascotRules.Quest?, allDone: Bool) -> KoaEmotion.Emotion {
    if allDone { return .celebrate }
    switch quest {
    case .meal, .water: return .happy
    case .workout, .steps: return .proud
    case .sleep: return .rested
    case nil: return .celebrate  // thưởng chuỗi
    }
  }
}
