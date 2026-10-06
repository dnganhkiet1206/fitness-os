public import Foundation

/// Backend ở đâu. Giá trị đến từ `Config/Backend.xcconfig` qua Info.plist —
/// không ghi URL hay key ở chỗ nào khác trong app iOS.
///
/// Cùng các kiểm tra của `native/src/lib/backend.ts`: URL phải là một project
/// Supabase, và nếu key là JWT kiểu cũ thì nó phải thuộc CÙNG project. Key của
/// project khác bị từ chối ở mọi request, và lỗi ấy trông như "mạng có vấn đề"
/// — nên bắt nó lúc khởi động, có tên, thay vì để nó trôi.
public struct BackendConfig: Sendable, Hashable {
  public static let urlInfoKey = "ASCNDSupabaseURL"
  public static let keyInfoKey = "ASCNDSupabaseKey"

  public let url: URL
  public let anonKey: String

  public enum ConfigError: Error, Equatable, CustomStringConvertible {
    case missing(String)
    case invalidURL(String)
    case projectMismatch(urlProject: String, keyProject: String)

    public var description: String {
      switch self {
      case .missing(let k): return "Thiếu \(k) trong Info.plist — xem apps/ios/Config/Backend.xcconfig"
      case .invalidURL(let u): return "URL backend không hợp lệ: \(u)"
      case .projectMismatch(let u, let k):
        return "URL thuộc project \"\(u)\" nhưng key thuộc project \"\(k)\" — đặt cả hai từ cùng một project"
      }
    }
  }

  public init(urlString: String, anonKey: String) throws {
    var trimmed = urlString.trimmingCharacters(in: .whitespaces)
    while trimmed.hasSuffix("/") { trimmed.removeLast() }
    guard let url = URL(string: trimmed), url.scheme == "https", let host = url.host, Self.isHostname(host) else {
      throw ConfigError.invalidURL(urlString)
    }
    let key = anonKey.trimmingCharacters(in: .whitespaces)
    guard !key.isEmpty else { throw ConfigError.missing(Self.keyInfoKey) }
    if let fromURL = Self.project(ofHost: host), let fromKey = Self.project(ofKey: key), fromURL != fromKey {
      throw ConfigError.projectMismatch(urlProject: fromURL, keyProject: fromKey)
    }
    self.url = url
    self.anonKey = key
  }

  /// Đọc từ Info.plist (đã được xcconfig điền).
  public static func from(info: [String: Any]) throws -> BackendConfig {
    guard let url = info[urlInfoKey] as? String, !url.isEmpty else { throw ConfigError.missing(urlInfoKey) }
    guard let key = info[keyInfoKey] as? String, !key.isEmpty else { throw ConfigError.missing(keyInfoKey) }
    return try BackendConfig(urlString: url, anonKey: key)
  }

  public static func fromMainBundle() throws -> BackendConfig {
    try from(info: Bundle.main.infoDictionary ?? [:])
  }

  /// Chỉ chữ thường/số, `-` và `.` — một `$(BIẾN)` xcconfig chưa được điền
  /// không lọt qua thành một host.
  static func isHostname(_ host: String) -> Bool {
    !host.isEmpty && host.unicodeScalars.allSatisfy {
      ("a"..."z").contains($0) || ("A"..."Z").contains($0) || ("0"..."9").contains($0) || $0 == "-" || $0 == "."
    }
  }

  /// `<ref>.supabase.co` → `ref`. Domain riêng thì không đọc được — trả nil.
  static func project(ofHost host: String) -> String? {
    let suffix = ".supabase.co"
    guard host.hasSuffix(suffix) else { return nil }
    let ref = host.dropLast(suffix.count)
    return ref.isEmpty || ref.contains(".") ? nil : String(ref)
  }

  /// Key JWT kiểu cũ (`ey…`) mang `ref` trong phần thân. Key `sb_publishable_…`
  /// không mang gì để đọc — trả nil, không kiểm.
  static func project(ofKey key: String) -> String? {
    guard key.hasPrefix("ey") else { return nil }
    let parts = key.split(separator: ".")
    guard parts.count >= 2 else { return nil }
    var body = parts[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while body.count % 4 != 0 { body += "=" }
    guard let data = Data(base64Encoded: body),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let ref = json["ref"] as? String
    else { return nil }
    return ref
  }
}
