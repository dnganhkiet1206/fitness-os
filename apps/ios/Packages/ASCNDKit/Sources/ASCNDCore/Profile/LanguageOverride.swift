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

extension Locale {
  /// Locale để ĐỊNH DẠNG chữ hiển thị (số có nhóm nghìn, tên tháng / thứ,
  /// danh sách "a, b và c", dấu thập phân của tạ) theo ngôn ngữ chọn TRONG APP
  /// (`AppLanguage`), không theo máy. `.formatted()` không tham số của
  /// Foundation đọc `Locale.current` (máy): máy tiếng Anh mà app đặt tiếng Việt
  /// sẽ ra "October 2026" giữa chữ tiếng Việt. Không ghi đè (widget, test) thì
  /// như Foundation. Đọc qua `AppLanguage.code` nên được Observation ghi nhận.
  ///
  /// Không ghi đè (app theo ngôn ngữ iPhone, #667): lấy ngôn ngữ mà iOS chọn cho
  /// app (`preferredLocalizations`), không lấy `Locale.current` — máy "vi-US" có
  /// vùng US nên số ra "2,539" giữa chữ tiếng Việt (23/10). Widget / test không có
  /// bản dịch riêng thì vẫn như Foundation.
  public static var app: Locale {
    if let l = AppLanguage.shared.locale { return l }
    let device = Locale.autoupdatingCurrent
    // Chỉ khi chữ app là tiếng Việt / Tây Ban Nha mà vùng máy viết số kiểu khác
    // (vi-US → "2,539"): định dạng theo đúng ngôn ngữ ấy. Còn lại như Foundation.
    guard let shown = Bundle.main.preferredLocalizations.first, ["vi", "es"].contains(shown),
      device.language.languageCode?.identifier == shown,
      device.decimalSeparator != Locale(identifier: shown).decimalSeparator
    else { return device }
    return Locale(identifier: shown)
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
