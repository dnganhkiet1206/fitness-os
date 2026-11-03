import XCTest

/// Kiểm accessibility tự động của các màn Koa (#795 đợt 2): `performAccessibilityAudit()` của
/// Xcode — độ tương phản, vùng chạm, nhãn cho VoiceOver, Dynamic Type, chữ bị cắt, trait.
///
/// Đợt 2a (lượt này): THU THẬP. Mỗi vấn đề ghi một dòng `A11Y|màn|loại|mô tả|phần tử` vào log
/// (job `a11y` tóm tắt thành bảng) và vào tệp đính kèm của test; test chưa đỏ vì vấn đề, chỉ đỏ
/// khi không mở được màn. Đợt 2b: sửa lỗi thật, rồi cho loại đã sạch làm test đỏ.
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

  // MARK: - Mở app, điều hướng (cùng định danh với các flow Maestro)

  @MainActor private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments += ["-uiTestFakeBackend", "YES", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    guard element(app, "today.plan.primary").waitForExistence(timeout: 90) else { throw NotOpened(screen: "today") }
    return app
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

  @MainActor private func audit(_ app: XCUIApplication, _ screen: String) throws {
    var lines: [String] = []
    // Đợt 2a: mỗi vấn đề ghi một dòng, handler trả `true` nên test không đỏ vì vấn đề.
    do {
      try app.performAccessibilityAudit(for: .all) { issue in
        lines.append(Self.line(screen, issue))
        return true
      }
    } catch {
      // Màn lớn (Hôm nay, 03/11: "Audit failed to complete in time"): kiểm từng loại một, loại nào
      // vẫn không xong thì ghi một dòng — đợt 2a cần đủ dữ liệu, không cần test đỏ.
      lines.removeAll()
      for (type, name) in Self.types {
        do {
          try app.performAccessibilityAudit(for: type) { issue in
            lines.append(Self.line(screen, issue))
            return true
          }
        } catch {
          lines.append("A11Y|\(screen)|\(name)|không kiểm xong: \(Self.clean(error.localizedDescription))|")
        }
      }
    }
    if lines.isEmpty { lines.append("A11Y|\(screen)|-|không có vấn đề|") }
    for line in lines { print(line) }
    let attachment = XCTAttachment(string: lines.joined(separator: "\n"))
    attachment.name = "a11y-\(screen)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  /// Một dòng `A11Y|màn|loại|mô tả|phần tử` cho bảng của job.
  @MainActor private static func line(_ screen: String, _ issue: XCUIAccessibilityAuditIssue) -> String {
    let el = issue.element
    let who = [el?.identifier, el?.label].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " / ")
    return ["A11Y", screen, name(issue.auditType), clean(issue.compactDescription), clean(who)].joined(separator: "|")
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
