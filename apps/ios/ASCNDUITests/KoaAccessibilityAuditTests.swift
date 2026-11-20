import XCTest

/// Kiểm accessibility tự động của các màn Koa (#795 đợt 2): `performAccessibilityAudit()` của
/// Xcode — độ tương phản, vùng chạm, nhãn cho VoiceOver, Dynamic Type, chữ bị cắt, trait.
///
/// Mỗi vấn đề ghi một dòng `A11Y|màn|loại|mô tả|phần tử` vào log (job `a11y` tóm tắt thành bảng)
/// và vào tệp đính kèm của test.
///
/// KOA-T47 (20/11): test ĐỎ khi một màn có nhiều vấn đề hơn mốc của nó (`KoaA11yBaseline`), theo
/// từng loại. Loại không có trong mốc của màn = 0 vấn đề được phép. Các màn còn nợ (tương phản,
/// Dynamic Type…) ghi đúng số đang có; sửa xong thì hạ mốc xuống trong cùng PR. Chọn "mới so với
/// mốc" thay vì "đỏ mọi vấn đề" vì mốc hiện chưa sạch: đỏ ngay thì chặn mọi việc khác.
///
/// Chạy ở `.github/workflows/ios-a11y.yml`, chế độ UI test (máy chủ giả trong app, đã đăng nhập
/// sẵn, dữ liệu mẫu), tiếng Anh như các flow Maestro. API XCUITest là `@MainActor` (Swift 6): mỗi
/// test tự mở app, không dùng `setUp`.
final class KoaAccessibilityAuditTests: XCTestCase {
  @MainActor func testToday() throws {
    let app = try launch()
    try audit(app, "today")
  }

  @MainActor func testPauseSheet() throws {
    let app = try launch()
    try scrollTo(app, "today.pause.open").tap()
    XCTAssertTrue(element(app, "pause.start").waitForExistence(timeout: 20), "sheet Tạm nghỉ không mở")
    try audit(app, "pause-sheet")
  }

  @MainActor func testProgressRhythm() throws {
    let app = try launch()
    try openProgressTraining(app)
    _ = try scrollTo(app, "progress.journey")
    try audit(app, "progress-rhythm")
  }

  @MainActor func testJourney() throws {
    let app = try launch()
    try openProgressTraining(app)
    try scrollTo(app, "progress.journey").tap()
    XCTAssertTrue(app.staticTexts["Your journey with Koa"].waitForExistence(timeout: 20), "Hành trình không mở")
    try audit(app, "journey")
  }

  /// KOA-T42: cảnh Koa toàn màn hình (bản xem trước cảnh xong buổi, dừng ở mốc có chữ + số).
  @MainActor func testReaction() throws {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments += ["-uiTestFakeBackend", "YES", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launchEnvironment["ASCND_DEBUG_KOA_REACTION"] = "done"
    app.launchEnvironment["ASCND_DEBUG_KOA_REACTION_T"] = "5000"
    app.launch()
    guard element(app, "koa.reaction.skip").waitForExistence(timeout: 60) else { throw NotOpened(screen: "reaction") }
    try audit(app, "reaction")
  }

  /// KOA-T47: phòng Koa (cờ `-koaBench live` tự mở phòng, Koa đứng bục).
  @MainActor func testRoom() throws {
    let app = try openRoom()
    try audit(app, "room")
  }

  /// KOA-T47: thẻ nhiệm vụ của phòng (kéo lên từ nút "Quests").
  @MainActor func testRoomPanel() throws {
    let app = try openRoom()
    try openRoomPanel(app)
    try audit(app, "room-panel")
  }

  /// KOA-T47: Phòng thay đồ (cửa hàng), mở từ thẻ của phòng.
  @MainActor func testShop() throws {
    let app = try openRoom()
    try openRoomPanel(app)
    try scrollTo(app, "room.link.shop").tap()
    // Tiêu đề lớn của Phòng thay đồ là chữ tĩnh, thanh điều hướng không mang tên màn.
    guard app.staticTexts["Dressing Room"].waitForExistence(timeout: 20) else { throw NotOpened(screen: "shop") }
    try audit(app, "shop")
  }

  /// KOA-T47: màn nghỉ giữa set của buổi tập (sau set đầu tiên).
  @MainActor func testRest() throws {
    let app = try launch()
    // Máy dev có thể còn bật "Lab" ở tab Tập luyện (bản Debug, nhớ qua các lần mở): nó thay màn buổi tập.
    // Tắt bằng nút "App" ở góc rồi về Hôm nay. Simulator của CI luôn mới nên không gặp.
    app.tabBars.buttons["Workouts"].tap()
    if app.buttons["App"].waitForExistence(timeout: 3) { app.buttons["App"].tap() }
    app.tabBars.buttons["Today"].tap()
    element(app, "today.plan.primary").tap()
    let done = element(app, "workout.doneSet")
    guard done.waitForExistence(timeout: 30) else { throw NotOpened(screen: "workout") }
    done.tap()
    guard element(app, "workout.rest.skip").waitForExistence(timeout: 20) else { throw NotOpened(screen: "rest") }
    try audit(app, "rest")
  }

  /// KOA-T47: Koa Coach, mở từ thẻ "Hỏi Koa" ở Hôm nay.
  @MainActor func testCoach() throws {
    let app = try launch()
    try scrollTo(app, "today.askKoa").tap()
    guard app.navigationBars["Koa Coach"].waitForExistence(timeout: 20) else { throw NotOpened(screen: "coach") }
    try audit(app, "coach")
  }

  // MARK: - Mở app, điều hướng (cùng định danh với các flow Maestro)

  @MainActor private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments += ["-uiTestFakeBackend", "YES", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    guard element(app, "today.plan.primary").waitForExistence(timeout: 90) else { throw NotOpened(screen: "today") }
    return app
  }

  /// Mở thẳng phòng Koa như flow Maestro 09 (`koaBench live`).
  @MainActor private func openRoom() throws -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments += [
      "-uiTestFakeBackend", "YES", "-koaBench", "live", "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
    ]
    app.launch()
    guard element(app, "koa.stage.stage").waitForExistence(timeout: 90) else { throw NotOpened(screen: "room") }
    return app
  }

  @MainActor private func openRoomPanel(_ app: XCUIApplication) throws {
    let open = element(app, "koa.room.panel")
    guard open.waitForExistence(timeout: 30) else { throw NotOpened(screen: "room-panel") }
    open.tap()
    guard element(app, "room.link.shop").waitForExistence(timeout: 20) else { throw NotOpened(screen: "room-panel") }
  }

  private struct NotOpened: Error, CustomStringConvertible {
    let screen: String
    var description: String { "không mở được màn \(screen)" }
  }

  @MainActor private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any)[id].firstMatch
  }

  @MainActor private func openProgressTraining(_ app: XCUIApplication) throws {
    app.tabBars.buttons["Progress"].tap()
    let segment = element(app, "progress.segment.training")
    XCTAssertTrue(segment.waitForExistence(timeout: 20), "Tiến bộ không mở")
    segment.tap()
  }

  /// Vuốt lên tới khi phần tử chạm được (tối đa 10 lần).
  @MainActor private func scrollTo(_ app: XCUIApplication, _ id: String) throws -> XCUIElement {
    let e = element(app, id)
    var tries = 0
    while !(e.exists && e.isHittable), tries < 10 {
      app.swipeUp()
      tries += 1
    }
    XCTAssertTrue(e.exists && e.isHittable, "không cuộn tới được \(id)")
    return e
  }

  // MARK: - Kiểm

  /// Chờ màn đứng yên (sheet trượt lên xong, cuộn dừng): kiểm lúc còn chuyển động thì chữ nằm
  /// một phần ngoài màn hình và bị báo "Text clipped" oan (lượt đầu 03/11: mọi dòng của sheet Tạm
  /// nghỉ). Chờ cố định: đọc khung từng phần tử để dò "đứng yên" trên màn lớn chậm hơn nhiều.
  @MainActor private func settle(_ app: XCUIApplication) {
    RunLoop.current.run(until: Date().addingTimeInterval(1.5))
  }

  @MainActor private func audit(_ app: XCUIApplication, _ screen: String) throws {
    settle(app)
    var lines: [String] = []
    var details: [String] = []
    // Handler trả `true` (không để XCTest đỏ theo từng vấn đề): gom đủ rồi so với mốc ở cuối.
    do {
      try app.performAccessibilityAudit(for: .all) { issue in
        lines.append(Self.line(screen, issue))
        if let d = Self.detail(screen, issue) { details.append(d) }
        return true
      }
    } catch {
      // Màn lớn (Hôm nay, 03/11: "Audit failed to complete in time"): kiểm từng loại một, loại nào
      // vẫn không xong thì ghi một dòng (không tính vào mốc: không có số để so).
      lines.removeAll()
      details.removeAll()
      for (type, name) in Self.types {
        do {
          try app.performAccessibilityAudit(for: type) { issue in
            lines.append(Self.line(screen, issue))
            if let d = Self.detail(screen, issue) { details.append(d) }
            return true
          }
        } catch {
          lines.append("A11Y|\(screen)|\(name)|không kiểm xong: \(Self.clean(error.localizedDescription))|")
        }
      }
    }
    if lines.isEmpty { lines.append("A11Y|\(screen)|-|không có vấn đề|") }
    // Mô tả chi tiết của bộ kiểm (ví dụ tỉ lệ tương phản đo được) ở dòng `A11YD|` riêng: bảng tóm tắt
    // chỉ đếm dòng `A11Y|` nên không đổi. Cần để biết vì sao bộ kiểm báo "Contrast failed" trong
    // khi ảnh snapshot đo được 5,1–7,0:1 (03/11).
    let over = KoaA11yBaseline.over(screen: screen, lines: lines)
    lines += details
    for line in lines { print(line) }
    let attachment = XCTAttachment(string: lines.joined(separator: "\n"))
    attachment.name = "a11y-\(screen)"
    attachment.lifetime = .keepAlways
    add(attachment)
    for o in over {
      XCTFail("A11y \(screen): \(o.kind) có \(o.count) vấn đề, mốc cho phép \(o.allowed) — sửa, hoặc nếu chủ ý thì nâng mốc trong KoaA11yBaseline.swift và ghi lý do")
    }
  }

  /// Một dòng `A11Y|màn|loại|mô tả|phần tử` cho bảng của job.
  @MainActor private static func line(_ screen: String, _ issue: XCUIAccessibilityAuditIssue) -> String {
    ["A11Y", screen, name(issue.auditType), clean(issue.compactDescription), clean(who(issue))].joined(separator: "|")
  }

  /// Một dòng `A11YD|màn|loại|phần tử|mô tả chi tiết`, chỉ khi bản chi tiết nói thêm điều gì.
  @MainActor private static func detail(_ screen: String, _ issue: XCUIAccessibilityAuditIssue) -> String? {
    let full = clean(issue.detailedDescription)
    guard !full.isEmpty, full != clean(issue.compactDescription) else { return nil }
    let wantsShape = issue.auditType == .hitRegion || issue.auditType == .textClipped
    return ["A11YD", screen, name(issue.auditType), clean(who(issue)), full + (wantsShape ? shape(issue) : "")]
      .joined(separator: "|")
  }

  /// Loại, khung (điểm) và "chạm được không" của phần tử bị báo, ví dụ ` [staticText 32,410 140×13]`.
  /// 04/11: "Hit area is too small" còn báo cả chữ tĩnh và nút đã cao 44 — cần biết bộ kiểm thấy
  /// phần tử ra sao chứ không đoán.
  @MainActor private static func shape(_ issue: XCUIAccessibilityAuditIssue) -> String {
    guard let el = issue.element, el.exists else { return "" }
    let f = el.frame
    let kind = kinds[el.elementType] ?? "type\(el.elementType.rawValue)"
    let hit = el.isHittable ? "" : " không chạm được"
    return " [\(kind) \(Int(f.minX)),\(Int(f.minY)) \(Int(f.width))×\(Int(f.height))\(hit)]"
  }

  private static let kinds: [XCUIElement.ElementType: String] = [
    .button: "button", .staticText: "staticText", .other: "other", .image: "image", .link: "link",
    .cell: "cell", .scrollView: "scrollView",
  ]

  /// Định danh / nhãn của phần tử bị báo.
  @MainActor private static func who(_ issue: XCUIAccessibilityAuditIssue) -> String {
    // Màn đổi liên tục (đồng hồ nghỉ đếm giây): phần tử bị báo có thể đã biến mất — đọc nhãn của nó lúc ấy
    // làm XCTest đỏ "No matches found" (CI #983). Hỏi `exists` trước.
    guard let el = issue.element, el.exists else { return "" }
    return [el.identifier, el.label].filter { !$0.isEmpty }.joined(separator: " / ")
  }

  private static let types: [(XCUIAccessibilityAuditType, String)] = [
    (.contrast, "contrast"), (.elementDetection, "elementDetection"), (.hitRegion, "hitRegion"),
    (.sufficientElementDescription, "description"), (.dynamicType, "dynamicType"),
    (.textClipped, "textClipped"), (.trait, "trait"),
  ]

  private static func name(_ t: XCUIAccessibilityAuditType) -> String {
    let hit = types.filter { t.contains($0.0) }.map(\.1)
    return hit.isEmpty ? "other(\(t.rawValue))" : hit.joined(separator: "+")
  }

  /// Một ô của bảng: bỏ xuống dòng và dấu `|`.
  private static func clean(_ s: String) -> String {
    s.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "|", with: "/")
  }
}
