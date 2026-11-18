import XCTest

@testable import ASCNDCore

/// Thứ tự thẻ "Hôm nay của bạn" theo thói quen (Kiệt 17/11).
final class DayTileOrderTests: XCTestCase {
  private let base: [DayCheckIn.Item] = [.sleep, .meal, .water, .workout]
  private let allTodo: [DayCheckIn.Item: DayCheckIn.State] = [.sleep: .todo, .meal: .todo, .water: .todo, .workout: .todo]
  private func order(_ now: Double, states: [DayCheckIn.Item: DayCheckIn.State]? = nil,
                     habits: [DayCheckIn.Item: Double] = [:]) -> [DayCheckIn.Item] {
    DayTileOrder.order(base, states: states ?? allTodo, habitHour: { habits[$0] }, now: now)
  }

  func testMorningDefaultsSleepFirst() {
    XCTAssertEqual(order(7.5).first, .sleep)
  }

  func testLunchtimeDefaultsMealFirst() {
    XCTAssertEqual(order(13).first, .meal)
  }

  func testEveningDefaultsWorkoutThenDinner() {
    // 19:50: bữa tối (19:00) vừa tới giờ 0,8 h; tập (18:00) 1,8 h → bữa trước, tập sau.
    XCTAssertEqual(Array(order(19.83).prefix(2)), [.meal, .workout])
    // Giấc ngủ (7:00 mai) xuống cuối trong các việc chưa ghi.
    XCTAssertEqual(order(19.83).last, .sleep)
  }

  func testLearnedHabitBeatsDefault() {
    // Người hay tập lúc 6:30. 7:00: ngủ (mặc định 7:00) vừa tới 0 h, tập vừa tới 0,5 h.
    let o = order(7.0, habits: [.workout: 6.5])
    XCTAssertEqual(Array(o.prefix(2)), [.sleep, .workout])
    // 8:00: ngủ 1 h, tập 1,5 h, bữa sáng 0 h.
    XCTAssertEqual(order(8.0, habits: [.workout: 6.5]).prefix(3), [.meal, .sleep, .workout])
  }

  func testDoneAndRestGoLast() {
    let s: [DayCheckIn.Item: DayCheckIn.State] = [.sleep: .done, .meal: .todo, .water: .todo, .workout: .rest]
    let o = order(7.5, states: s)
    XCTAssertEqual(Array(o.suffix(2)), [.sleep, .workout], "đã xong / nghỉ: cuối, giữ thứ tự gốc")
    XCTAssertEqual(Set(o.prefix(2)), [.meal, .water])
  }

  func testWaterSitsBetweenDueAndFar() {
    // 15:00: bữa trưa đã qua 2,5 h (vừa tới giờ), nước = 5, tập còn 3 h = 6, ngủ còn 16 h.
    XCTAssertEqual(order(15), [.meal, .water, .workout, .sleep])
  }

  func testMidnightWrap() {
    // 23:30, thói quen ghi ngủ 0:15 → 0,75 h nữa; bữa sáng 8,5 h → ngủ trước bữa.
    let o = order(23.5, habits: [.sleep: 0.25])
    XCTAssertLessThan(o.firstIndex(of: .sleep)!, o.firstIndex(of: .meal)!)
  }

  func testStableForTies() {
    let s: [DayCheckIn.Item: DayCheckIn.State] = [.sleep: .done, .meal: .done, .water: .done, .workout: .done]
    XCTAssertEqual(order(10, states: s), base)
  }
}
