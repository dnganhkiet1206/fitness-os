import Foundation

/// Lọc dữ liệu đo lường trước khi rời máy (AUD-74): `beforeSend` của Sentry
/// và `Telemetry.capture` đều đi qua đây.
///
/// Danh sách CHO PHÉP dựng từ các chỗ gọi `Telemetry.capture` / `report*` ở
/// tip (17/11/2026): khoá nào không có trong danh sách thì BỎ, giá trị nào
/// không đúng dạng thì thành `"redacted"`. Chỉ trông vào kỷ luật gọi đúng là
/// chưa đủ — một chỗ gọi mới lỡ gửi email hay số đo sức khoẻ thì bộ lọc này
/// chặn trước khi dữ liệu tới Sentry / PostHog.
///
/// Ba mặt app tự kiểm soát thì lọc theo KHOÁ: thuộc tính PostHog, tag Sentry,
/// extra Sentry. Hai mặt SDK tự sinh thì chỉ lọc GIÁ TRỊ (app không tự thêm
/// breadcrumb nào, tin nhắn Sentry ở tip đều là chuỗi cố định): chữ tự do thì
/// che email + bỏ phần query/fragment của URL; người dùng chỉ giữ mã tài
/// khoản (UUID). Ngoại lệ / stack trace / ngữ cảnh thiết bị giữ nguyên — đó
/// là phần cần để sửa crash, và SDK quản lý, không mang dữ liệu app.
///
/// Thêm một khoá đo lường mới thì thêm vào danh sách ở đây TRƯỚC, kèm test —
/// không gửi "tạm" rồi bổ sung sau.
public enum TelemetryScrubber {
  /// Giá trị thay cho một giá trị bị chặn (giữ hình dạng sự kiện để vẫn đếm được).
  static let redacted = "redacted"

  // MARK: - Thuộc tính PostHog (Telemetry.capture)

  /// Mọi khoá thuộc tính mà các chỗ gọi `capture` / `once` / `appOpened` gửi ở
  /// tip: số đếm, cờ, mã enum, khoảng — không email, tên, số đo sức khoẻ.
  static let propertyKeys: Set<String> = [
    "quest", "source", "key", "logged", "target", "items", "days", "rank", "item",
    "sessions", "place", "days_since_first_open", "delta", "planned", "pr",
    "rank_up", "tier_up", "kind", "major", "paused", "days_used", "days_left",
    "duration", "pokes", "walks",
  ]

  /// Khoá chỉ mang số nguyên (`String(Int)`): "82.5" ở đây là số đo lọt vào,
  /// không phải số đếm. ("sessions" mang cả số đếm lẫn khoảng "4_8" nên không
  /// nằm đây — chỉ lọc dạng token.)
  static let integerKeys: Set<String> = [
    "days", "days_used", "days_left", "days_since_first_open", "items", "delta", "planned", "pr",
  ]

  /// Khoá chỉ mang "true" / "false". ("logged" là "1" / "0" nên không nằm đây.)
  static let booleanKeys: Set<String> = ["major", "paused", "rank_up", "tier_up"]

  public static func scrubbedProperties(_ props: [String: String]) -> [String: String] {
    var out: [String: String] = [:]
    out.reserveCapacity(props.count)
    for (key, value) in props where propertyKeys.contains(key) {
      out[key] = scrubbedValue(value, key: key)
    }
    return out
  }

  // MARK: - Tag / extra Sentry (Telemetry.report / reportRebuild)

  /// Tag mà `report` gửi: loại bản ghi, lý do, mã server, bước ghi đĩa.
  static let tagKeys: Set<String> = ["sync.kind", "sync.reason", "sync.code", "sync.stage"]

  /// Extra mà `reportRebuild` gửi: số ngày dựng lại hỏng.
  static let extraKeys: Set<String> = ["failed_days"]

  public static func scrubbedTags(_ tags: [String: String]?) -> [String: String]? {
    guard let tags else { return nil }
    var out: [String: String] = [:]
    for (key, value) in tags where tagKeys.contains(key) {
      out[key] = isToken(value) ? value : redacted
    }
    return out
  }

  public static func scrubbedExtra(_ extra: [String: Any]?) -> [String: Any]? {
    guard let extra else { return nil }
    var out: [String: Any] = [:]
    for (key, value) in extra where extraKeys.contains(key) {
      if let n = value as? Int { out[key] = n }
    }
    return out
  }

  // MARK: - Chữ tự do (tin nhắn sự kiện, breadcrumb)

  /// Che email và bỏ query/fragment của URL trong một chuỗi tự do. Chuỗi cố
  /// định ở tip ("sync.dead", ...) không đổi.
  public static func scrubbedText(_ text: String) -> String {
    stripURLQueries(redactEmails(text))
  }

  /// URL của breadcrumb: chỉ giữ scheme + host + path. Không phân tích được
  /// thì lọc như chữ tự do thay vì bỏ hẳn (breadcrumb vẫn đọc được).
  public static func scrubbedURL(_ url: String) -> String {
    guard var parts = URLComponents(string: url) else { return scrubbedText(url) }
    guard parts.query != nil || parts.fragment != nil else { return url }
    parts.query = nil
    parts.fragment = nil
    return parts.string ?? scrubbedText(url)
  }

  /// Dữ liệu breadcrumb do SDK sinh (app không tự thêm breadcrumb nào): giữ
  /// mọi khoá, chỉ lọc giá trị chuỗi; số / cờ giữ nguyên.
  public static func scrubbedBreadcrumbData(_ data: [String: Any]) -> [String: Any] {
    var out: [String: Any] = [:]
    for (key, value) in data {
      if let s = value as? String {
        out[key] = key == "url" ? scrubbedURL(s) : scrubbedText(s)
      } else {
        out[key] = value
      }
    }
    return out
  }

  // MARK: - Người dùng

  /// Mã tài khoản là UUID (`Telemetry.setUser`): email hay chuỗi lạ thì không
  /// phải mã tài khoản, sự kiện phải bỏ người dùng.
  public static func isAccountId(_ id: String) -> Bool {
    UUID(uuidString: id) != nil
  }

  // MARK: - Dạng giá trị

  static func scrubbedValue(_ value: String, key: String) -> String {
    if integerKeys.contains(key) { return isIntegerText(value) ? value : redacted }
    if booleanKeys.contains(key) { return value == "true" || value == "false" ? value : redacted }
    return isToken(value) ? value : redacted
  }

  /// Token đo lường: chữ/số ASCII và `_ - . : +`, tối đa 64 ký tự, ít nhất một
  /// chữ/số. Khoảng trắng, `@`, `/`, `?`, `&` đều không lọt — tức email, URL,
  /// câu tự do đều thành `"redacted"`. Chuỗi rỗng không mang gì nên giữ.
  static func isToken(_ value: String) -> Bool {
    if value.isEmpty { return true }
    guard value.count <= 64 else { return false }
    var hasAlnum = false
    for c in value {
      if isAlnumASCII(c) { hasAlnum = true }
      else if c == "_" || c == "-" || c == "." || c == ":" || c == "+" { continue }
      else { return false }
    }
    return hasAlnum
  }

  /// `String(Int)`: dấu trừ tuỳ ý + 1…9 chữ số.
  static func isIntegerText(_ value: String) -> Bool {
    let body = value.hasPrefix("-") ? value.dropFirst() : value[...]
    guard !body.isEmpty, body.count <= 9 else { return false }
    return body.allSatisfy { c in
      guard let a = c.asciiValue else { return false }
      return (48...57).contains(a)
    }
  }

  private static func isAlnumASCII(_ c: Character) -> Bool {
    guard let a = c.asciiValue else { return false }
    return (48...57).contains(a) || (65...90).contains(a) || (97...122).contains(a)
  }

  // MARK: - Quét chữ tự do (quét tay, không regex)

  /// Che `local@domain` thành "[email]". Quét tay thay vì regex: không có mẫu
  /// nào biên dịch hỏng được, và trên Linux cũng chạy như trên máy Apple.
  /// Chỉ che khi domain có dấu "." ("a@b" không phải email, giữ nguyên).
  static func redactEmails(_ text: String) -> String {
    var out = ""
    var rest = Substring(text)
    while let at = rest.firstIndex(of: "@") {
      var start = at
      while start > rest.startIndex {
        let prev = rest.index(before: start)
        guard isEmailChar(rest[prev]) else { break }
        start = prev
      }
      var end = rest.index(after: at)
      while end < rest.endIndex, isEmailChar(rest[end]) { end = rest.index(after: end) }
      let local = rest[start..<at]
      let domain = rest[rest.index(after: at)..<end]
      if !local.isEmpty, !domain.isEmpty, domain.firstIndex(of: ".") != nil {
        out += rest[..<start]
        out += "[email]"
        rest = rest[end...]
      } else {
        // "@" đứng một mình, không phải email: giữ tới hết "@", quét tiếp.
        out += rest[...at]
        rest = rest[rest.index(after: at)...]
      }
    }
    out += rest
    return out
  }

  private static func isEmailChar(_ c: Character) -> Bool {
    isAlnumASCII(c) || c == "." || c == "_" || c == "%" || c == "+" || c == "-"
  }

  /// Bỏ `?...` và `#...` khỏi mọi URL có scheme trong chữ. Chỉ cắt phần sau
  /// `?`/`#` tới khoảng trắng — scheme + host + path giữ nguyên để vẫn đọc được.
  static func stripURLQueries(_ text: String) -> String {
    var out = ""
    var rest = Substring(text)
    while let hit = rest.range(of: "://") {
      var start = hit.lowerBound
      while start > rest.startIndex {
        let prev = rest.index(before: start)
        guard isSchemeChar(rest[prev]) else { break }
        start = prev
      }
      if start == hit.lowerBound {
        // "://" không có scheme: giữ nguyên tới hết "://", quét tiếp.
        out += rest[..<hit.upperBound]
        rest = rest[hit.upperBound...]
        continue
      }
      // URL chạy tới khoảng trắng; cắt ở "?" / "#" đầu tiên trong nó.
      var end = hit.upperBound
      var cut: String.Index? = nil
      while end < rest.endIndex {
        let c = rest[end]
        if c == " " || c == "\t" || c == "\n" || c == "\r" { break }
        if (c == "?" || c == "#") && cut == nil { cut = end }
        end = rest.index(after: end)
      }
      out += rest[..<start]
      out += rest[start..<(cut ?? end)]
      rest = rest[end...]
    }
    out += rest
    return out
  }

  private static func isSchemeChar(_ c: Character) -> Bool {
    isAlnumASCII(c) || c == "+" || c == "." || c == "-"
  }
}
