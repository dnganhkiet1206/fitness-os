import Foundation
import Testing

@testable import ASCND

/// `Telemetry.configured()` là cổng duy nhất quyết định SDK đo lường có khởi
/// động không (17/11, #527 mục 4): giá trị Info.plist trống, chưa thay biến,
/// hoặc chỉ còn "https://" (xcconfig ghép `https://$(…)` khi biến trống) đều
/// phải tắt. Giá trị thật thì giữ nguyên, chỉ cắt khoảng trắng thừa.
@MainActor
@Suite struct TelemetryConfiguredTests {
  @Test func rejectsMissingAndPlaceholderValues() {
    #expect(Telemetry.configured(nil) == nil)
    #expect(Telemetry.configured("") == nil)
    #expect(Telemetry.configured("   ") == nil)
    #expect(Telemetry.configured("https://") == nil)
    #expect(Telemetry.configured("https://$(ASCND_SENTRY_DSN)") == nil)
    #expect(Telemetry.configured("$(ASCND_POSTHOG_KEY)") == nil)
    #expect(Telemetry.configured(42) == nil)
  }

  @Test func acceptsRealValuesTrimmed() {
    #expect(Telemetry.configured("abc@o1.ingest.sentry.io/2") == "abc@o1.ingest.sentry.io/2")
    #expect(Telemetry.configured("  phc_key  ") == "phc_key")
    #expect(Telemetry.configured("https://us.posthog.com") == "https://us.posthog.com")
  }
}
