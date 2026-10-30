public import Foundation

/// Bộ nhớ đệm nhỏ cho bộ dựng hình Koa (30/10, hiệu năng): mỗi khung Koa dựng lại cả cây
/// hình, và trước đây phân tích lại cùng những chuỗi (transform, hoạt ảnh, mã màu) và dựng
/// lại cùng `defs` ánh sáng mỗi khung — bản release tốn ~4 ms / khung trên Mac. Kết quả của
/// các hàm thuần ấy chỉ phụ thuộc đầu vào, nên lưu lại theo khoá.
///
/// Có giới hạn (`capacity`): đầy thì xoá hết (đơn giản, rẻ; chuỗi đổi mỗi khung như transform
/// bàn chân khi đi không làm phình bộ nhớ). An toàn đa luồng (khoá).
public final class KoaMemo<Key: Hashable & Sendable, Value: Sendable>: @unchecked Sendable {
  private var table: [Key: Value] = [:]
  private let lock = NSLock()
  private let capacity: Int

  public init(capacity: Int) { self.capacity = capacity }

  public func value(_ key: Key, _ make: () -> Value) -> Value {
    lock.lock()
    if let v = table[key] {
      lock.unlock()
      return v
    }
    lock.unlock()
    let v = make()
    lock.lock()
    if table.count >= capacity { table.removeAll(keepingCapacity: true) }
    table[key] = v
    lock.unlock()
    return v
  }

  public var count: Int {
    lock.lock()
    defer { lock.unlock() }
    return table.count
  }
}
