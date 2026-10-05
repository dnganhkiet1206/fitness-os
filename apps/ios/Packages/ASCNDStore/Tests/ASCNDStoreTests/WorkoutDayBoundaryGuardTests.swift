import Foundation
import Testing

/// Ranh giới DUY NHẤT của `workout_day` (#456): mọi đọc / ghi bảng này trong
/// code sản phẩm đi qua `GRDBWorkoutStore` — nơi có chủ của từng hàng (#452),
/// hàng rào ghi (#454) và thứ tự vòng đời (#455). Một câu SQL thẳng vào bảng
/// ở chỗ khác lách qua cả ba.
///
/// Không phải linter SQL chung: chỉ tìm tên bảng `workout_day` trong code
/// sản phẩm (`apps/ios/ASCND`, `apps/ios/ASCNDWidgets`,
/// `apps/ios/Packages/*/Sources`). Test và công cụ lab được miễn — fixture cần
/// chèn thẳng hàng cũ để dựng cảnh nâng cấp.
///
/// Được phép:
/// - `GRDBWorkoutStore.swift`: chính ranh giới;
/// - `Database.swift`: schema / migration — ghim SỐ câu, để thêm một câu mới
///   (migration mới, hay một lối tắt lọt vào đây) phải sửa ghim có chủ ý.

private let repoRoot: URL = {
  // <root>/apps/ios/Packages/ASCNDStore/Tests/ASCNDStoreTests/<tệp này>
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<7 { url.deleteLastPathComponent() }
  return url
}()

private let storeDir = "apps/ios/Packages/ASCNDStore/Sources/ASCNDStore/"
private let boundary = storeDir + "GRDBWorkoutStore.swift"
/// Câu chạm `workout_day` được phép trong `Database.swift`: v2 tạo bảng; v4
/// chép sang bảng có chủ, xoá bảng cũ, đổi tên bảng mới.
private let schemaPins = [storeDir + "Database.swift": 4]

/// Dòng có truy cập `workout_day`: tên bảng sau từ khoá SQL, hoặc chuỗi
/// `"workout_day"` (API của GRDB: `Table("…")`, `create(table:)`, `drop(table:)`).
/// `workout_day_owned` không khớp; dòng chú thích bị bỏ qua.
enum WorkoutDayAccess {
  private static let patterns = [
    #"\b(from|into|update|join|table)\s+["`']?workout_day\b"#,
    #""workout_day""#,
  ].map { try! NSRegularExpression(pattern: $0, options: [.caseInsensitive]) }

  static func matches(_ line: String) -> Bool {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("//") || trimmed.hasPrefix("*") || trimmed.hasPrefix("/*") { return false }
    let range = NSRange(line.startIndex..., in: line)
    return patterns.contains { $0.firstMatch(in: line, range: range) != nil }
  }

  /// `đường dẫn từ gốc repo → các dòng khớp` của mọi tệp Swift sản phẩm.
  static func scan(root: URL = repoRoot) -> [String: [String]] {
    let fm = FileManager.default
    var roots = ["apps/ios/ASCND", "apps/ios/ASCNDWidgets"]
    let packages = root.appendingPathComponent("apps/ios/Packages")
    for p in (try? fm.contentsOfDirectory(atPath: packages.path)) ?? [] {
      roots.append("apps/ios/Packages/\(p)/Sources")
    }
    var hits: [String: [String]] = [:]
    for r in roots {
      let dir = root.appendingPathComponent(r)
      guard let walker = fm.enumerator(atPath: dir.path) else { continue }
      for case let rel as String in walker where rel.hasSuffix(".swift") && !rel.contains(".build/") {
        let path = "\(r)/\(rel)"
        guard let text = try? String(contentsOf: root.appendingPathComponent(path), encoding: .utf8) else { continue }
        let lines = text.components(separatedBy: "\n").filter(matches)
        if !lines.isEmpty { hits[path] = lines.map { $0.trimmingCharacters(in: .whitespaces) } }
      }
    }
    return hits
  }
}

struct WorkoutDayBoundaryGuardTests {
  /// Không câu nào ngoài ranh giới; schema đúng số câu đã ghim.
  @Test func workoutDayHasOneProductionBoundary() {
    let hits = WorkoutDayAccess.scan()
    // Tự kiểm: quét trượt thư mục thì "không thấy gì" là xanh giả.
    #expect((hits[boundary]?.count ?? 0) >= 5, "không thấy ranh giới — quét sai chỗ? \(repoRoot.path)")
    for (path, lines) in hits.sorted(by: { $0.key < $1.key }) where path != boundary {
      if let pinned = schemaPins[path] {
        #expect(lines.count == pinned, "\(path): \(lines.count) câu chạm workout_day, ghim \(pinned) — sửa ghim nếu là migration mới:\n\(lines.joined(separator: "\n"))")
      } else {
        Issue.record("\(path) truy cập thẳng workout_day — đi qua GRDBWorkoutStore:\n\(lines.joined(separator: "\n"))")
      }
    }
  }

  /// Bộ khớp bắt đủ các dạng truy cập, và không bắt chữ trong chú thích.
  @Test func matcherCatchesEveryAccessForm() {
    for line in [
      #"try db.execute(sql: "DELETE FROM workout_day WHERE userId = ?")"#,
      #"  SELECT state FROM  workout_day"#,
      #"INSERT INTO workout_day (userId, key, state) VALUES (?, ?, ?)"#,
      #"insert or replace into workout_day values (?)"#,
      #"UPDATE workout_day SET state = ?"#,
      #"SELECT * FROM outbox JOIN workout_day ON 1"#,
      #"let rows = Table("workout_day")"#,
      #"try db.drop(table: "workout_day")"#,
      #"SELECT key FROM `workout_day`"#,
    ] {
      #expect(WorkoutDayAccess.matches(line), "phải bắt: \(line)")
    }
    for line in [
      "/// Dọn `workout_day` của phiên",
      "// SELECT * FROM workout_day",
      #"try db.create(table: "workout_day_owned")"#,
      #"SELECT key FROM workout_days"#,
      "let workout_day_key = 1",
    ] {
      #expect(!WorkoutDayAccess.matches(line), "không được bắt: \(line)")
    }
  }

  /// Mutation âm, chạy ngay trong test: tiêm một lối tắt vào một tệp sản phẩm
  /// (bản chép ở thư mục tạm) — guard phải đỏ ở đúng tệp ấy.
  @Test func guardCatchesAnInjectedBypass() throws {
    let fm = FileManager.default
    let tmp = fm.temporaryDirectory.appendingPathComponent("wd-guard-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: tmp) }
    let src = tmp.appendingPathComponent(storeDir)
    try fm.createDirectory(at: src, withIntermediateDirectories: true)
    for name in ["GRDBWorkoutStore.swift", "Database.swift", "AccountLifecycle.swift"] {
      try fm.copyItem(at: repoRoot.appendingPathComponent(storeDir + name), to: src.appendingPathComponent(name))
    }
    #expect(WorkoutDayAccess.scan(root: tmp)[storeDir + "AccountLifecycle.swift"] == nil)
    let injected = src.appendingPathComponent("AccountLifecycle.swift")
    let bypass = "\nfunc wipe(_ db: Database) throws { try db.execute(sql: \"DELETE FROM workout_day\") }\n"
    try (String(contentsOf: injected, encoding: .utf8) + bypass).write(to: injected, atomically: true, encoding: .utf8)
    #expect(WorkoutDayAccess.scan(root: tmp)[storeDir + "AccountLifecycle.swift"]?.count == 1)
  }
}
