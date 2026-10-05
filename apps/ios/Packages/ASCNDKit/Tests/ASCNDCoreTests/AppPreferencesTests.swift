import ASCNDCore
import Foundation
import Testing

/// Cài đặt app (#426) — `use-app-settings.tsx`, `use-volume-unit.ts`,
/// `use-mascot.tsx`, `query-client.ts:216` @ fac9ac2.

private final class Memory: KeyValueStore, @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String: String] = [:]
  init(_ v: [String: String] = [:]) { values = v }
  func string(forKey key: String) -> String? { lock.withLock { values[key] } }
  func set(_ value: String, forKey key: String) { lock.withLock { values[key] = value } }
  func remove(_ key: String) { _ = lock.withLock { values.removeValue(forKey: key) } }
  var keys: Set<String> { lock.withLock { Set(values.keys) } }
}

@MainActor
struct AppPreferencesTests {
  /// Máy mới: theo máy cho ngôn ngữ / theme, đơn vị nước theo vùng, linh vật bật.
  @Test func defaults() {
    let vi = AppPreferences(store: Memory(), deviceLocale: "vi-VN")
    #expect(vi.langChoice == .system && vi.lang == .vi && vi.volumeUnit == .ml)
    #expect(vi.mascotEnabled && vi.mascotCompanion && vi.mascotSelected == "koa")
    #expect(AppPreferences(store: Memory(), deviceLocale: "es_MX").lang == .es)
    #expect(AppPreferences(store: Memory(), deviceLocale: "fr-FR").lang == .en)
    #expect(AppPreferences(store: Memory(), deviceLocale: "en_US").volumeUnit == .oz)
    #expect(AppPreferences(store: Memory(), deviceLocale: "my-MM").volumeUnit == .oz)
    #expect(AppPreferences(store: Memory(), deviceLocale: "en").volumeUnit == .ml)
  }

  /// Theo máy mà máy không nói: TỐI (mặc định của app), không phải sáng.
  @Test func themeResolution() {
    let p = AppPreferences(store: Memory(), deviceLocale: "vi")
    #expect(p.themeName(systemIsLight: nil) == .dark)
    #expect(p.themeName(systemIsLight: true) == .light)
    p.setTheme(.dark)
    #expect(p.themeName(systemIsLight: true) == .dark)
    p.setTheme(.light)
    #expect(p.themeName(systemIsLight: false) == .light)
  }

  /// Lưu đúng tên khoá + giá trị của RN; mở lại đọc ra đúng.
  @Test func persistsWithRNKeys() {
    let store = Memory()
    let p = AppPreferences(store: store, deviceLocale: "vi")
    p.setLang(.es)
    p.setTheme(.light)
    p.setVolumeUnit(.oz)
    p.setMascotEnabled(false)
    p.selectMascot("pip")
    #expect(store.string(forKey: "ascnd_lang") == "es" && store.string(forKey: "ascnd_theme") == "light")
    #expect(store.string(forKey: "ascnd-volume-unit") == "oz" && store.string(forKey: "ascnd_mascot_enabled") == "0")
    let again = AppPreferences(store: store, deviceLocale: "vi")
    #expect(again.lang == .es && again.theme == .light && again.volumeUnit == .oz)
    #expect(!again.mascotEnabled && again.mascotCompanion && again.mascotSelected == "pip")
  }

  /// Giá trị lạ đã lưu (bản build khác, gõ tay) = như chưa lưu.
  @Test func junkFallsBackToDefaults() {
    let store = Memory([
      "ascnd_lang": "fr", "ascnd_theme": "sepia", "ascnd-volume-unit": "cup",
      "ascnd_mascot_enabled": "yes", "ascnd_mascot_selected": "",
    ])
    let p = AppPreferences(store: store, deviceLocale: "vi-VN")
    #expect(p.langChoice == .system && p.theme == .system && p.volumeUnit == .ml)
    #expect(!p.mascotEnabled, "khác \"1\" là tắt, như RN (`e === '1'`)")
    #expect(p.mascotSelected == "koa")
  }

  /// Đăng xuất: khoá theo tài khoản xoá VÀ trạng thái về mặc định; khoá theo
  /// máy (ngôn ngữ, theme, đơn vị nước, khoá app) giữ nguyên.
  @Test func signOutClearsOnlyAccountScoped() {
    let store = Memory(["ascnd_app_lock": "1"])
    let p = AppPreferences(store: store, deviceLocale: "vi")
    p.setLang(.en)
    p.setTheme(.light)
    p.setVolumeUnit(.oz)
    p.setMascotEnabled(false)
    p.setMascotCompanion(false)
    p.selectMascot("pip")
    p.clearUserScoped()
    #expect(p.mascotEnabled && p.mascotCompanion && p.mascotSelected == "koa")
    #expect(p.lang == .en && p.theme == .light && p.volumeUnit == .oz)
    #expect(store.keys == ["ascnd_lang", "ascnd_theme", "ascnd-volume-unit", "ascnd_app_lock"])
    #expect(Set(AppPreferences.deviceKeys).isDisjoint(with: AppPreferences.userKeys))
  }

  @Test func userDefaultsRoundTrip() throws {
    let suite = "ascnd-tests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = UserDefaultsStore(defaults)
    AppPreferences(store: store, deviceLocale: "vi").setLang(.es)
    #expect(AppPreferences(store: store, deviceLocale: "vi").lang == .es)
  }
}
