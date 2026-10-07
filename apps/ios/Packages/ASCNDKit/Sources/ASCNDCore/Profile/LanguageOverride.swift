public import Foundation
public import Observation

/// Ngôn ngữ app ĐANG dùng cho mọi lần tra chữ (#527 Phase 1 · 1.7).
///
/// RN đổi ngôn ngữ ngay trong app (`setLang` của `use-app-settings.tsx`): mọi
/// chữ đổi theo, không khởi động lại. iOS chọn bản dịch theo ngôn ngữ MÁY lúc
/// mở app, và `String(localized:)` của Foundation không nghe lựa chọn nào
/// trong app — đã đo trên Foundation thật (job macOS, nhánh thử
/// `claude/b-l10n-probe`): đổi lớp `Bundle.main`, ghi đè
/// `preferredLocalizations`, hay truyền `locale:` đều vẫn ra tiếng Anh. Chỉ
/// `LocalizedStringResource` mang `locale` là chọn đúng bản dịch.
///
/// Nên `String(localized:)` của app được CHE (extension bên dưới): mọi chỗ gọi
/// hiện có — app, DesignSystem — giữ nguyên chữ, và đi qua
/// `LocalizedStringResource` với ngôn ngữ đang chọn.
///
/// Đọc `code` được Observation ghi nhận: một view tính chữ trong `body` tự vẽ
/// lại khi ngôn ngữ đổi, không dựng lại cả cây (màn đang mở giữ nguyên, như
/// RN). `Text("key")` của SwiftUI đọc `\.locale` ở gốc app.
public final class AppLanguage: Observable, @unchecked Sendable {
  public static let shared = AppLanguage()

  private let lock = NSLock()
  private var _code: String?
  private let registrar = ObservationRegistrar()

  public init() {}

  /// Mã ngôn ngữ (`vi` / `en` / `es`); `nil` = không ghi đè (theo máy —
  /// widget, test, trước khi app đặt).
  public var code: String? {
    registrar.access(self, keyPath: \.code)
    return lock.withLock { _code }
  }

  public var locale: Locale? { code.map(Locale.init(identifier:)) }

  public func set(_ code: String?) {
    guard lock.withLock({ _code }) != code else { return }
    registrar.withMutation(of: self, keyPath: \.code) {
      lock.withLock { _code = code }
    }
  }
}

#if canImport(Darwin)
  extension String {
    /// Che `String(localized:)` của Foundation cho mọi module nhập ASCNDCore:
    /// tra theo ngôn ngữ đang chọn trong app (`AppLanguage`). Swift chọn
    /// overload này vì nó không cần tham số mặc định nào — đã đo, kể cả chuỗi
    /// có số (`"sets \(n)"` → khoá `sets %lld`).
    public init(localized key: String.LocalizationValue) {
      self.init(localized: key, bundle: .main)
    }

    /// Như trên, với bundle chỉ định.
    public init(localized key: String.LocalizationValue, bundle: Bundle) {
      if let locale = AppLanguage.shared.locale {
        self.init(localized: LocalizedStringResource(key, locale: locale, bundle: .atURL(bundle.bundleURL)))
      } else {
        self.init(localized: key, table: nil, bundle: bundle, locale: .current, comment: nil)
      }
    }
  }
#endif
