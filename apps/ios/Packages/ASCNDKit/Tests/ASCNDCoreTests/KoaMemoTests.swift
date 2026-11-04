@testable import ASCNDCore
import Foundation
import Testing

/// Bộ nhớ đệm của bộ dựng hình Koa (30/10): cùng khoá chỉ dựng một lần; đầy thì xoá hết rồi dựng lại.
@Suite struct KoaMemoTests {
  @Test func sameKeyBuildsOnce() {
    let memo = KoaMemo<String, Int>(capacity: 4)
    var made = 0
    let first = memo.value("a") {
      made += 1
      return 1
    }
    let second = memo.value("a") {
      made += 1
      return 2
    }
    #expect(first == 1)
    #expect(second == 1)
    #expect(made == 1)
    #expect(memo.count == 1)
  }

  @Test func fullTableStartsOver() {
    let memo = KoaMemo<Int, Int>(capacity: 3)
    for i in 0..<3 { _ = memo.value(i) { i * 10 } }
    #expect(memo.count == 3)
    _ = memo.value(3) { 30 }
    #expect(memo.count == 1)
    var made = 0
    let again = memo.value(0) {
      made += 1
      return 0
    }
    #expect(made == 1)
    #expect(again == 0)
  }
}
