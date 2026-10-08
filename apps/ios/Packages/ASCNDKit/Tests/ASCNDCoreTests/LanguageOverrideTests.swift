#if canImport(Darwin)
  import ASCNDCore
  import Foundation
  import Observation
  import Testing

  /// Đổi ngôn ngữ trong app (#527 · 1.7) trên Foundation THẬT của Apple (job
  /// macOS của CI): bundle `Fixtures/l10n` có `en/vi/es.lproj`.
  ///
  /// Test này ở MODULE KHÁC với `ASCNDCore`, như app và DesignSystem: nó chứng
  /// minh `String(localized:)` ở chỗ gọi bình thường đi vào overload che của
  /// ASCNDCore chứ không vào Foundation (Foundation không đổi theo lựa chọn
  /// trong app — xem `LanguageOverride.swift`).
  ///
  /// Nối tiếp nhau (`.serialized`): `AppLanguage.shared` là một giá trị chung.
  @Suite(.serialized)
  struct LanguageOverrideTests {
    static func bundle() throws -> Bundle {
      let url = try #require(Bundle.module.url(forResource: "l10n", withExtension: nil, subdirectory: "Fixtures"))
      return try #require(Bundle(path: url.path))
    }

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
      AppLanguage.shared.set("es")
      #expect(String(localized: "sets \(3)", bundle: b) == "3 series")
      AppLanguage.shared.set("en")
      #expect(String(localized: "sets \(3)", bundle: b) == "3 sets")
    }

    /// Số tạ có phần lẻ đổi dấu thập phân theo ngôn ngữ trong app, không
    /// theo máy (bàn giao của B ở #527): gọi KHÔNG truyền `locale:`, như mọi
    /// màn production.
    @Test func weightLoadFollowsTheInAppChoice() {
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      #expect(WeightUnit.kg.localizedLoad(62.5) == "62,5 kg")
      AppLanguage.shared.set("en")
      #expect(WeightUnit.kg.localizedLoad(62.5) == "62.5 kg")
      AppLanguage.shared.set("es")
      #expect(WeightUnit.kg.localizedLoad(62.5) == "62,5 kg")
    }

    /// Số và ngày hiển thị (`.formatted(… .locale(.app))`: lịch sử, tuần,
    /// Tổng kết, Cài đặt) theo ngôn ngữ trong app, không theo máy — cùng chữ
    /// quanh nó. Không ghi đè thì `Locale.app` là locale của máy.
    @Test func formattingLocaleFollowsTheInAppChoice() {
      defer { AppLanguage.shared.set(nil) }
      let date = Date(timeIntervalSince1970: 1_791_331_200)  // 2026-10-07 UTC
      // Tính lại mỗi lần: `.locale(.app)` đọc ngôn ngữ lúc dựng style.
      func month() -> String {
        date.formatted(Date.FormatStyle.dateTime.month(.wide).year().locale(.app)
          .timeZone(TimeZone(identifier: "UTC")!))
      }
      AppLanguage.shared.set("vi")
      #expect(Locale.app.identifier == "vi")
      #expect(12_345.formatted(.number.locale(.app)) == "12.345")
      #expect(month().lowercased().contains("10"))
      #expect(!month().contains("October"))
      AppLanguage.shared.set("en")
      #expect(12_345.formatted(.number.locale(.app)) == "12,345")
      #expect(month() == "October 2026")
      AppLanguage.shared.set("es")
      #expect(month().lowercased().contains("octubre"))
      AppLanguage.shared.set(nil)
      #expect(Locale.app.identifier == Locale.autoupdatingCurrent.identifier)
    }

    /// Không ghi đè (widget, trước khi app đặt): đường của hệ thống, không
    /// trả ra khoá trần.
    @Test func noOverrideUsesTheSystemPath() throws {
      let b = try Self.bundle()
      AppLanguage.shared.set(nil)
      #expect(["Hello", "Xin chào", "Hola"].contains(String(localized: "hello", bundle: b)))
    }

    /// Đường Foundation gốc (gọi đủ tham số, không qua overload) KHÔNG đổi
    /// theo lựa chọn trong app — lý do overload phải tồn tại. Đỏ ở đây nghĩa
    /// là Foundation đã đổi hành vi, và overload có thể bỏ.
    @Test func foundationAloneIgnoresTheInAppChoice() throws {
      let b = try Self.bundle()
      defer { AppLanguage.shared.set(nil) }
      AppLanguage.shared.set("vi")
      let foundation = String(localized: "hello", table: nil, bundle: b, locale: Locale(identifier: "vi"), comment: nil)
      #expect(foundation != "Xin chào")
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
  }
#endif
