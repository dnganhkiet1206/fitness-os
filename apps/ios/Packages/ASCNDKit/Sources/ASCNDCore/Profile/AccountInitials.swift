/// Chữ cái đầu trên avatar tài khoản (`lib/initials.ts` @ fac9ac2): chữ cái
/// (`\p{L}`) đầu tiên của từ đầu + của từ cuối trong tên, viết hoa; một từ thì
/// một chữ. Không có tên dùng được thì MỘT chữ từ phần trước `@` của email
/// ("kiet.dang@x.com" → "K", không bịa ra "KD"). Không có gì → `nil` (hình
/// người). Golden: `initials-golden.json` (`tools/initials/gen.cjs`).
public enum AccountInitials {
  public static func of(name: String?, email: String?) -> String? {
    if let name, let s = fromName(name) { return s }
    let local = (email ?? "").split(separator: "@", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    return letter(in: local)?.uppercased()
  }

  static func fromName(_ name: String) -> String? {
    let words = name.split(whereSeparator: { $0.isWhitespace }).compactMap { letter(in: String($0)) }
    guard let first = words.first, let last = words.last else { return nil }
    return (words.count == 1 ? first : first + last).uppercased()
  }

  /// Chữ cái đầu của một từ — duyệt theo điểm mã như `for (const ch of word)`.
  static func letter(in word: String) -> String? {
    word.unicodeScalars.first(where: isLetter).map { String($0) }
  }

  private static func isLetter(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: true
    default: false
    }
  }
}
