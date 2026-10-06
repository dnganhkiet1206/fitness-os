public import Foundation

/// Một ca trong `spec/vectors/*.json`: `{ "rule", "input", "expected" }`.
///
/// Golden vectors là hợp đồng hành vi giữa app RN (Android) và app iOS: cùng
/// một tệp, chạy ở cả hai bên. Khoá thêm trường nào thì cả hai runner phải đọc
/// được, nên định dạng giữ đúng ba trường; trường lạ (ví dụ `note`) bị bỏ qua.
public struct GoldenVector<Input: Decodable & Sendable, Expected: Decodable & Sendable>: Decodable, Sendable {
  public let rule: String
  public let input: Input
  public let expected: Expected
}

public enum GoldenVectors {
  /// Đọc một tệp vectors. Lỗi giải mã nói rõ tệp nào và ca thứ mấy — một ca
  /// hỏng trong tệp 200 ca mà chỉ báo "data corrupted" thì không ai sửa nổi.
  public static func load<Input, Expected>(
    _ url: URL,
    as _: GoldenVector<Input, Expected>.Type = GoldenVector<Input, Expected>.self
  ) throws -> [GoldenVector<Input, Expected>] {
    let data = try Data(contentsOf: url)
    do {
      return try JSONDecoder().decode([GoldenVector<Input, Expected>].self, from: data)
    } catch let DecodingError.typeMismatch(_, ctx), let DecodingError.keyNotFound(_, ctx),
      let DecodingError.valueNotFound(_, ctx), let DecodingError.dataCorrupted(ctx)
    {
      let path = ctx.codingPath.map { $0.intValue.map { "[\($0)]" } ?? ".\($0.stringValue)" }.joined()
      throw VectorFileError(file: url.lastPathComponent, path: path, reason: ctx.debugDescription)
    }
  }

  /// Mọi tệp `.json` trong `spec/vectors`, sắp theo tên. Thư mục chưa có
  /// (trước khi D tạo ở #230) thì trả mảng rỗng.
  public static func allFiles(in directory: URL = RepoPaths.specVectors) -> [URL] {
    let fm = FileManager.default
    guard let names = try? fm.contentsOfDirectory(atPath: directory.path) else { return [] }
    return names.filter { $0.hasSuffix(".json") }.sorted().map { directory.appendingPathComponent($0) }
  }
}

public struct VectorFileError: Error, CustomStringConvertible {
  public let file: String
  public let path: String
  public let reason: String
  public var description: String { "\(file)\(path): \(reason)" }
}

public enum RepoPaths {
  /// Gốc repo, tính từ vị trí tệp nguồn này:
  /// <root>/apps/ios/Packages/ASCNDKit/Sources/ASCNDTestSupport/GoldenVectors.swift
  public static let root: URL = {
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<7 { url.deleteLastPathComponent() }
    return url
  }()

  public static let specVectors = root.appendingPathComponent("spec/vectors", isDirectory: true)
}
