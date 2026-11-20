import Foundation

/// Kế hoạch vẽ của cả hình Koa, đệm theo `KoaRender.Options` (KOA-T10, audit Koa 17/11).
///
/// Trước: mỗi lần SwiftUI dựng lại khung vẽ, `KoaPaint.plan(KoaRender.figure(o))` chạy lại từ đầu
/// (hai lần khi giơ tay đè má) — kể cả khi `o` y hệt lần trước: Koa đứng yên, Giảm chuyển động,
/// thẻ tĩnh, hay view dựng lại nhiều lần trong một khung. Khoá là `Options` ĐẦY ĐỦ (không làm
/// tròn): cùng khoá thì cùng hình — không thể hiện sai dáng / nét mặt. Có giới hạn, bỏ mục cũ nhất
/// trước (như `StudioPlans`); khung động `t` đổi mỗi khung chỉ tốn một lần chèn.
public enum KoaFigurePlans {
  static let capacity = 64
  private static let lock = NSLock()
  nonisolated(unsafe) private static var table: [KoaRender.Options: [KoaPaint.Op]] = [:]
  nonisolated(unsafe) private static var order: [KoaRender.Options] = []
  nonisolated(unsafe) public private(set) static var hits = 0
  nonisolated(unsafe) public private(set) static var misses = 0

  public static func plan(_ o: KoaRender.Options) -> [KoaPaint.Op] {
    lock.lock()
    if let p = table[o] {
      hits += 1
      lock.unlock()
      return p
    }
    misses += 1
    lock.unlock()
    let p = KoaPaint.plan(KoaRender.figure(o))
    lock.lock()
    defer { lock.unlock() }
    if table[o] == nil {
      if order.count >= capacity { table[order.removeFirst()] = nil }
      order.append(o)
      table[o] = p
    }
    return p
  }

  static var count: Int {
    lock.lock()
    defer { lock.unlock() }
    return table.count
  }

  static func reset() {
    lock.lock()
    defer { lock.unlock() }
    table = [:]
    order = []
    hits = 0
    misses = 0
  }
}
