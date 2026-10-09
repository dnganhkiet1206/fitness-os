import Foundation

/// `components/ascnd/markdown-lite.tsx` @ fac9ac2 — phần markdown mà coach
/// thật sự viết: tiêu đề `#`/`##`/`###`, gạch đầu dòng `-`/`*`, danh sách
/// `1.`/`1)`, chữ đậm `**…**`. Mỗi dòng một khối, dòng trống là một khoảng.
public enum MarkdownLite {
  /// Một đoạn chữ trong dòng: đậm hay thường.
  public struct Run: Sendable, Hashable {
    public let text: String
    public let bold: Bool

    public init(_ text: String, bold: Bool = false) {
      self.text = text
      self.bold = bold
    }
  }

  public enum Block: Sendable, Hashable {
    case gap
    /// `level` 1 = `#`, 2 = `##` hoặc `###` (RN vẽ hai cỡ).
    case heading(level: Int, [Run])
    case bullet([Run])
    case numbered(String, [Run])
    case paragraph([Run])
  }

  public static func blocks(_ text: String) -> [Block] {
    text.split(separator: "\n", omittingEmptySubsequences: false).map { raw in
      let line = String(raw).replacing(/\s+$/, with: "")
      if line.allSatisfy(\.isWhitespace) { return .gap }
      if let m = line.wholeMatch(of: /(#{1,3})\s+(.*)/) {
        return .heading(level: m.1.count == 1 ? 1 : 2, inline(String(m.2)))
      }
      if let m = line.wholeMatch(of: /\s*[-*]\s+(.*)/) { return .bullet(inline(String(m.1))) }
      if let m = line.wholeMatch(of: /\s*(\d+)[.)]\s+(.*)/) { return .numbered(String(m.1), inline(String(m.2))) }
      return .paragraph(inline(line))
    }
  }

  /// `text.split(/(\*\*[^*]+\*\*)/g)`: phần khớp là chữ đậm (bỏ dấu), phần còn
  /// lại giữ nguyên — cả `**` lẻ không cặp.
  public static func inline(_ text: String) -> [Run] {
    var runs: [Run] = []
    var rest = text[...]
    while let m = rest.firstMatch(of: /\*\*([^*]+)\*\*/) {
      if m.range.lowerBound > rest.startIndex { runs.append(Run(String(rest[..<m.range.lowerBound]))) }
      runs.append(Run(String(m.1), bold: true))
      rest = rest[m.range.upperBound...]
    }
    if !rest.isEmpty || runs.isEmpty { runs.append(Run(String(rest))) }
    return runs
  }
}
