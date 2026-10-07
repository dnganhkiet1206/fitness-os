#if canImport(ObjectiveC)
  @testable import ASCNDCore
  import Foundation
  import Observation
  import Testing

  /// Đổi ngôn ngữ trong app (#527 · 1.7) trên Foundation THẬT của Apple: một
  /// bundle có `en/vi/es.lproj` (`Fixtures/l10n`), được `AppLanguage.install`
  /// đổi lớp như app đổi `Bundle.main`. Chạy ở job macOS của CI (Linux không
  /// có runtime Objective-C).
  ///
  /// Nối tiếp nhau (`.serialized`): `AppLanguage.shared` là một giá trị chung.
  @Suite(.serialized)
  struct LanguageOverrideTests {
    static func bundle() throws -> Bundle {
      let url = try #require(Bundle.module.url(forResource: "l10n", withExtension: nil, subdirectory: "Fixtures"))
      let b = try #require(Bundle(path: url.path))
      AppLanguage.install(on: b)
      return b
    }

    /// `String(localized:)` — cách mọi màn native tra chữ — đổi theo lựa chọn
    /// ngay, không khởi động lại.
    @Test func stringLocalizedFollowsTheInAppChoice() throws {
      let b = try Self.bundle()
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      #expect(String(localized: "hello", bundle: b) == "Xin chào")
      AppLanguage.shared.set("en")
      #expect(String(localized: "hello", bundle: b) == "Hello")
      AppLanguage.shared.set("es")
      #expect(String(localized: "hello", bundle: b) == "Hola")
    }

    /// Chuỗi có số (`String(localized: "sets \(n)")` → khoá `sets %lld`).
    @Test func interpolatedKeysFollowTheChoice() throws {
      let b = try Self.bundle()
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      #expect(String(localized: "sets \(3)", bundle: b) == "3 hiệp")
      AppLanguage.shared.set("en")
      #expect(String(localized: "sets \(3)", bundle: b) == "3 sets")
    }

    /// `NSLocalizedString` (đường cũ của Foundation) cũng đi qua.
    @Test func nsLocalizedStringFollowsTheChoice() throws {
      let b = try Self.bundle()
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      #expect(NSLocalizedString("hello", bundle: b, comment: "") == "Xin chào")
    }

    /// Không ghi đè / ngôn ngữ không có bản dịch: về đường của hệ thống, không
    /// trả ra khoá trần.
    @Test func noOverrideOrMissingLanguageFallsBackToTheSystem() throws {
      let b = try Self.bundle()
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set(nil)
      let system = String(localized: "hello", bundle: b)
      #expect(["Hello", "Xin chào", "Hola"].contains(system))
      AppLanguage.shared.set("fr")
      #expect(String(localized: "hello", bundle: b) == system)
    }

    /// Một `body` SwiftUI tính chữ được Observation ghi nhận phụ thuộc vào
    /// ngôn ngữ — đổi ngôn ngữ là view tự vẽ lại (không dựng lại cả cây).
    @Test func lookupsAreObserved() throws {
      let b = try Self.bundle()
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      final class Flag: @unchecked Sendable { var value = false }
      let changed = Flag()
      withObservationTracking {
        _ = String(localized: "hello", bundle: b)
      } onChange: {
        changed.value = true
      }
      AppLanguage.shared.set("en")
      #expect(changed.value)
    }

    @Test func installTwiceIsHarmless() throws {
      let b = try Self.bundle()
      AppLanguage.install(on: b)
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      #expect(String(localized: "hello", bundle: b) == "Xin chào")
    }
  }
#endif
