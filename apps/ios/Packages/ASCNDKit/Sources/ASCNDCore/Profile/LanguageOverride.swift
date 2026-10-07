public import Foundation
public import Observation

/// Ngôn ngữ app ĐANG dùng cho mọi lần tra chuỗi (#527 Phase 1 · 1.7).
///
/// RN đổi ngôn ngữ ngay trong app (`setLang` của `use-app-settings.tsx`): mọi
/// chữ đổi theo, không khởi động lại. iOS thì chọn bản dịch theo ngôn ngữ MÁY
/// lúc mở app — `String(localized:)` không nghe một lựa chọn trong app. Ở đây
/// `Bundle.main` được đổi lớp (`install`) để mọi lần tra chuỗi của nó đi qua
/// thư mục `.lproj` của ngôn ngữ đã chọn — `String(localized:)`,
/// `NSLocalizedString`, mọi chỗ gọi hiện có giữ nguyên.
///
/// Đọc `code` được ghi nhận bởi Observation: một view tính chữ trong `body`
/// tự vẽ lại khi ngôn ngữ đổi, không cần dựng lại cả cây (không mất màn đang
/// mở, như RN). `Text("key")` của SwiftUI đọc thêm `\.locale` ở gốc app.
public final class AppLanguage: Observable, @unchecked Sendable {
  public static let shared = AppLanguage()

  private let lock = NSLock()
  private var _code: String?
  private var bundles: [String: Bundle] = [:]
  private let registrar = ObservationRegistrar()

  public init() {}

  /// Mã ngôn ngữ (`vi` / `en` / `es`); `nil` = không ghi đè (theo máy).
  public var code: String? {
    registrar.access(self, keyPath: \.code)
    return lock.withLock { _code }
  }

  public func set(_ code: String?) {
    guard lock.withLock({ _code }) != code else { return }
    registrar.withMutation(of: self, keyPath: \.code) {
      lock.withLock { _code = code }
    }
  }

  /// Bundle `.lproj` của ngôn ngữ đang chọn bên trong `base`; `nil` khi không
  /// ghi đè hoặc `base` không có bản dịch ấy (về đường của hệ thống).
  public func localizedBundle(in base: Bundle) -> Bundle? {
    guard let code else { return nil }
    let key = base.bundlePath + "#" + code
    if let hit = lock.withLock({ bundles[key] }) { return hit }
    guard let path = base.path(forResource: code, ofType: "lproj"), let bundle = Bundle(path: path) else { return nil }
    lock.withLock { bundles[key] = bundle }
    return bundle
  }
}

#if canImport(ObjectiveC)
  import ObjectiveC

  /// Lớp thay cho bundle được ghi đè: tra chuỗi trong `.lproj` của
  /// `AppLanguage.shared`, không có thì như cũ.
  final class LanguageOverrideBundle: Bundle {
    override func localizedString(forKey key: String, value: String?, table tableName: String?) -> String {
      if let lproj = AppLanguage.shared.localizedBundle(in: self) {
        return lproj.localizedString(forKey: key, value: value, table: tableName)
      }
      return super.localizedString(forKey: key, value: value, table: tableName)
    }
  }

  extension AppLanguage {
    /// Cho `bundle` (app: `Bundle.main`) tra chuỗi theo ngôn ngữ đang chọn.
    /// Gọi lại là vô hại.
    public static func install(on bundle: Bundle) {
      if object_getClass(bundle) != LanguageOverrideBundle.self {
        object_setClass(bundle, LanguageOverrideBundle.self)
      }
    }
  }
#endif
