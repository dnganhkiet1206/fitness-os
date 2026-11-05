import Foundation

/// Koa V2, lát dọc (Kiệt duyệt 05/11): Koa đứng yên mà vẫn sống, đổi nét mặt không đổi bụp.
/// Chỉ dùng mảnh đã vẽ, không thêm art. Bản RN (`KoaScene.rn`) không đổi.
extension KoaMath {
  /// Nhịp nghỉ của bản vẽ (`koaBob`, `koaArm*`, `koaEar*`, `koaBreathe`) cùng chu kỳ 3,6 s và
  /// CÙNG PHA: Koa lắc như máy đếm nhịp. Trễ từng phần (ms) cho có đà: ngực thở trước, đầu nhún
  /// theo, tay rồi tai theo sau, hai bên lệch nhau.
  static let settleLag: [String: Double] = [
    "koaBob": 90, "koaArmL": 160, "koaArmR": 230, "koaEarL": 280, "koaEarR": 350,
  ]

  /// Dồn trọng tâm khi đứng (độ, quanh giữa hai bàn chân): hai sóng chậm không chia hết nhau
  /// (7,3 s và 11,9 s) nên không lặp thành nhịp; tối đa ~0,9°. Bằng 0 ở `t = 0` (khung đứng
  /// yên, ảnh chuẩn không đổi).
  /// Lớp của mắt (mở / cười tít / sao / mở to / mí lờ đờ): đổi dứt khoát lúc mí khép.
  static func isEyeCond(_ cond: String) -> Bool { cond.hasPrefix("eyes") || cond.hasPrefix("lids") }

  static func weightShift(_ t: Double) -> Double {
    0.55 * sin(2 * .pi * t / 7300) + 0.35 * sin(2 * .pi * t / 11900)
  }
}

/// Đổi nét mặt dần (Koa V2): nét cũ mờ đi, nét mới hiện lên trong `duration`, dịu hai đầu.
public struct KoaFaceTween: Sendable {
  /// Thời gian chuyển (ms).
  public static let duration = 180.0
  public private(set) var current: KoaRender.Options.Face?
  public private(set) var previous: KoaRender.Options.Face?
  var start = 0.0

  public init() {}

  /// Nét mặt lúc `ms`. Đổi giữa chừng thì bắt đầu lại từ nét đang hiện nhiều hơn.
  public mutating func update(_ face: KoaRender.Options.Face, at ms: Double) {
    guard let cur = current else {
      current = face
      return
    }
    guard face != cur else { return }
    previous = mix(at: ms) < 0.5 && previous != nil ? previous : cur
    current = face
    start = ms
  }

  /// Độ hiện của nét mới 0 → 1 (đã dịu).
  public func mix(at ms: Double) -> Double {
    guard previous != nil else { return 1 }
    let x = max(0, min(1, (ms - start) / Self.duration))
    return x * x * (3 - 2 * x)
  }

  /// Cú chớp che chỗ đổi mắt: mí khép trong 0,07 s đầu, mắt đổi lúc khép kín, rồi mở.
  public func blink(at ms: Double) -> Double? {
    guard previous != nil, ms - start < Self.duration else { return nil }
    return KoaGaze.lid((ms - start) / 1000)
  }

  public func blinkRight(at ms: Double) -> Double? {
    guard previous != nil, ms - start < Self.duration else { return nil }
    return KoaGaze.lid((ms - start) / 1000 - KoaGaze.rightLag)
  }

  /// Mắt đã sang nét mới: từ lúc mí khép kín.
  public func eyesNew(at ms: Double) -> Bool { previous == nil || ms - start >= Self.eyesSwap }
  static let eyesSwap = 70.0

  /// Nét đang rời, `nil` khi đã chuyển xong.
  public func from(at ms: Double) -> KoaRender.Options.Face? { mix(at: ms) < 1 ? previous : nil }
}

/// Ánh nhìn sống ngoài phòng (Koa V2): Hôm nay và các thẻ có Koa động dùng cùng `KoaGaze` của
/// phòng — nhìn người xem, thỉnh thoảng liếc đi rồi về, chớp mắt lúc không đều thay cho chu kỳ cố
/// định 5,2 s của bản vẽ.
public struct KoaIdleLife: Sendable {
  var gaze: KoaGaze.State
  var last: Double?

  public init(seed: UInt64) {
    gaze = KoaGaze.State(seed: seed)
    // đo 05/11: 2–7 s cho ra 1 lần chớp trong 10,4 s ở Hôm nay — kém sống hơn chu kỳ cố định cũ
    gaze.blinkGap = 1.6...4.6
    gaze.nextBlink = 1.2
  }

  /// Một khung lúc `ms`. Đồng hồ dừng lâu (cuộn khỏi màn, ra nền) thì không bù cả quãng.
  public mutating func step(at ms: Double) -> KoaGaze.Output {
    let dt = last.map { max(0, min(0.1, (ms - $0) / 1000)) } ?? 0
    last = ms
    return gaze.step(dt, koa: (0, 0), turn: 0)
  }

  /// Đồng hồ dừng: lượt chạy sau bắt đầu lại không nhảy.
  public mutating func pause() { last = nil }
}
