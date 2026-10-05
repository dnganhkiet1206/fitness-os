public import Foundation
public import Observation

/// Kho khoá-giá trị trên máy (AsyncStorage của RN; `UserDefaults` ở native).
public protocol KeyValueStore: Sendable {
  func string(forKey key: String) -> String?
  func set(_ value: String, forKey key: String)
  func remove(_ key: String)
}

/// `UserDefaults` làm `KeyValueStore`. `UserDefaults` an toàn đa luồng
/// (tài liệu của Apple), nên bọc `@unchecked Sendable` là đúng nghĩa.
public final class UserDefaultsStore: KeyValueStore, @unchecked Sendable {
  private let defaults: UserDefaults

  public init(_ defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  public func string(forKey key: String) -> String? { defaults.string(forKey: key) }
  public func set(_ value: String, forKey key: String) { defaults.set(value, forKey: key) }
  public func remove(_ key: String) { defaults.removeObject(forKey: key) }
}

/// Cài đặt của app (#426) — `use-app-settings.tsx`, `use-volume-unit.ts`,
/// `use-mascot.tsx`, danh sách khoá của `query-client.ts:216` @ fac9ac2.
///
/// RN behavior (giữ nguyên, kể cả TÊN KHOÁ):
/// - THEO MÁY — đăng xuất giữ lại (cho mượn máy đăng nhập một lần không được
///   làm chủ máy nhận lại máy ở tiếng Anh / kg / theme khác):
///   `ascnd_lang` (`system | vi | en | es`, mặc định `system` → theo ngôn ngữ
///   máy: vi / es / còn lại en), `ascnd_theme` (`system | light | dark`; theo
///   máy mà máy không nói → TỐI, mặc định của app), `ascnd-volume-unit`
///   (`ml | oz`; mặc định oz ở US / LR / MM);
/// - THEO TÀI KHOẢN — đăng xuất xoá, và trạng thái trong bộ nhớ về mặc định:
///   linh vật bật (`ascnd_mascot_enabled`, "1"/"0", mặc định bật), linh vật
///   đồng hành (`ascnd_mascot_companion`, mặc định bật), linh vật đã chọn
///   (`ascnd_mascot_selected`, mặc định `koa`);
/// - giá trị lạ đã lưu = như chưa lưu (mặc định), không bao giờ ném.
/// Đơn vị cân / chiều cao KHÔNG ở đây: chúng là cột hồ sơ (`useUnits`, #425).
/// Khoá ứng dụng (`ascnd_app_lock`) KHÔNG port ở đây: ngữ nghĩa bảo mật của nó
/// trên iOS (Face ID, lúc khoá) chưa được chốt — xem PR.
@MainActor @Observable
public final class AppPreferences {
  public enum LangChoice: String, Sendable, Hashable, CaseIterable { case system, vi, en, es }
  public enum Lang: String, Sendable, Hashable { case vi, en, es }
  public enum Theme: String, Sendable, Hashable, CaseIterable { case system, light, dark }
  public enum VolumeUnit: String, Sendable, Hashable, CaseIterable { case ml, oz }

  public static let langKey = "ascnd_lang"
  public static let themeKey = "ascnd_theme"
  public static let volumeUnitKey = "ascnd-volume-unit"
  public static let mascotEnabledKey = "ascnd_mascot_enabled"
  public static let mascotCompanionKey = "ascnd_mascot_companion"
  public static let mascotSelectedKey = "ascnd_mascot_selected"
  public static let defaultMascot = "koa"

  /// Khoá theo máy: đăng xuất KHÔNG xoá (`DEVICE_KEYS`).
  public static let deviceKeys = [langKey, volumeUnitKey, "ascnd_app_lock", themeKey]
  /// Khoá theo tài khoản mà cài đặt này giữ: đăng xuất xoá (`USER_KEYS`).
  public static let userKeys = [mascotEnabledKey, mascotCompanionKey, mascotSelectedKey]

  public private(set) var langChoice: LangChoice
  public private(set) var theme: Theme
  public private(set) var volumeUnit: VolumeUnit
  public private(set) var mascotEnabled: Bool
  public private(set) var mascotCompanion: Bool
  public private(set) var mascotSelected: String

  @ObservationIgnored private let store: any KeyValueStore
  @ObservationIgnored private let deviceLocale: String

  /// - Parameter deviceLocale: định danh locale của máy (`vi-VN`, `en_US`…).
  public init(store: any KeyValueStore, deviceLocale: String = Locale.current.identifier) {
    self.store = store
    self.deviceLocale = deviceLocale
    langChoice = store.string(forKey: Self.langKey).flatMap(LangChoice.init(rawValue:)) ?? .system
    theme = store.string(forKey: Self.themeKey).flatMap(Theme.init(rawValue:)) ?? .system
    volumeUnit = store.string(forKey: Self.volumeUnitKey).flatMap(VolumeUnit.init(rawValue:))
      ?? Self.deviceVolumeUnit(deviceLocale)
    (mascotEnabled, mascotCompanion, mascotSelected) = Self.readMascot(store)
  }

  // MARK: - Đọc

  /// `deviceDefaultLang`.
  public static func deviceLang(_ locale: String) -> Lang {
    let lower = locale.lowercased()
    if lower.hasPrefix("vi") { return .vi }
    if lower.hasPrefix("es") { return .es }
    return .en
  }

  /// `deviceDefault` của đơn vị nước: vùng của locale (`en-US`, `en_US`).
  public static func deviceVolumeUnit(_ locale: String) -> VolumeUnit {
    let parts = locale.split(whereSeparator: { $0 == "-" || $0 == "_" })
    let region = parts.count > 1 ? parts[1].uppercased() : ""
    return ["US", "LR", "MM"].contains(region) ? .oz : .ml
  }

  public var lang: Lang {
    switch langChoice {
    case .system: Self.deviceLang(deviceLocale)
    case .vi: .vi
    case .en: .en
    case .es: .es
    }
  }

  public enum ThemeName: String, Sendable, Hashable { case light, dark }

  /// Bảng màu thật sự vẽ. Theo máy mà máy không nói (`nil`) là TỐI.
  public func themeName(systemIsLight: Bool?) -> ThemeName {
    switch theme {
    case .light: .light
    case .dark: .dark
    case .system: systemIsLight == true ? .light : .dark
    }
  }

  // MARK: - Ghi

  public func setLang(_ l: LangChoice) {
    langChoice = l
    store.set(l.rawValue, forKey: Self.langKey)
  }

  public func setTheme(_ t: Theme) {
    theme = t
    store.set(t.rawValue, forKey: Self.themeKey)
  }

  public func setVolumeUnit(_ u: VolumeUnit) {
    volumeUnit = u
    store.set(u.rawValue, forKey: Self.volumeUnitKey)
  }

  public func setMascotEnabled(_ on: Bool) {
    mascotEnabled = on
    store.set(on ? "1" : "0", forKey: Self.mascotEnabledKey)
  }

  public func setMascotCompanion(_ on: Bool) {
    mascotCompanion = on
    store.set(on ? "1" : "0", forKey: Self.mascotCompanionKey)
  }

  public func selectMascot(_ id: String) {
    mascotSelected = id.isEmpty ? Self.defaultMascot : id
    store.set(mascotSelected, forKey: Self.mascotSelectedKey)
  }

  /// Phiên kết thúc (`clearUserScopedStorage` + `onUserScopedReset`): xoá khoá
  /// theo tài khoản VÀ đưa trạng thái trong bộ nhớ về mặc định — không thì
  /// người sau thấy lựa chọn của người trước cho tới khi app khởi động lại.
  /// Khoá theo máy giữ nguyên.
  public func clearUserScoped() {
    for key in Self.userKeys { store.remove(key) }
    (mascotEnabled, mascotCompanion, mascotSelected) = Self.readMascot(store)
  }

  private static func readMascot(_ store: any KeyValueStore) -> (Bool, Bool, String) {
    let e = store.string(forKey: mascotEnabledKey)
    let c = store.string(forKey: mascotCompanionKey)
    let s = store.string(forKey: mascotSelectedKey)
    return (e.map { $0 == "1" } ?? true, c.map { $0 == "1" } ?? true, (s?.isEmpty ?? true) ? defaultMascot : s!)
  }
}
