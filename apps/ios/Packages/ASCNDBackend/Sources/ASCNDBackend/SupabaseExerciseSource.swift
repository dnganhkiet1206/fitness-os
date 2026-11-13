public import ASCNDCore
import Foundation
import Supabase

/// `ExerciseSource` thật: đúng truy vấn của `useExercises` (`use-library.ts:200`)
/// — bài mẫu (`user_id` null) + bài của mình, xếp `muscle_group` rồi `name`.
public struct SupabaseExerciseSource: ExerciseSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  /// Round 3 (AUD-05): đọc THEO TRANG tới hết. Thư viện (~873 bài mẫu + bài của
  /// người dùng) đã sát `max_rows` của PostgREST (mặc định 1000); một lượt đọc
  /// trần bị cắt LẶNG LẼ ở đó và app lưu danh sách thiếu vào cache. Thứ tự có
  /// thêm `id` để trang sau không lặp / sót dòng trùng tên. Quá `maxPages` trang
  /// thì ném — thà báo lỗi còn hơn lưu một thư viện thiếu.
  public func exercises(userId: String) async throws -> [LibraryExercise] {
    let rows: [Row] = try await Self.allPages { from, to in
      try await client.from("exercises")
        .select("id, user_id, name, muscle_group, equipment, exercise_kind, name_vi, name_en, name_es, search_text")
        .or("user_id.is.null,user_id.eq.\(userId)")
        .order("muscle_group")
        .order("name")
        .order("id")
        .range(from: from, to: to)
        .execute().value
    }
    return Self.map(rows)
  }

  /// Đọc từng trang `[from, to]` (gồm hai đầu) tới khi một trang ngắn hơn
  /// `pageSize`; quá `maxPages` trang thì ném `LibraryTooLarge`.
  static func allPages<T: Sendable>(
    pageSize: Int = pageSize, maxPages: Int = maxPages,
    _ page: (_ from: Int, _ to: Int) async throws -> [T]
  ) async throws -> [T] {
    var out: [T] = []
    for i in 0..<maxPages {
      let from = i * pageSize
      let chunk = try await page(from, from + pageSize - 1)
      out += chunk
      if chunk.count < pageSize { return out }
    }
    throw LibraryTooLarge(pages: maxPages, pageSize: pageSize)
  }

  static let pageSize = 500
  static let maxPages = 20

  /// Thư viện vượt `maxPages × pageSize` dòng — không lưu nửa thư viện.
  public struct LibraryTooLarge: Error, Sendable, Hashable {
    public let pages: Int
    public let pageSize: Int
  }

  struct Row: Decodable, Sendable {
    let id: String
    let user_id: String?
    let name: String?
    let muscle_group: String?
    let equipment: String?
    let exercise_kind: String?
    var name_vi: String? = nil
    var name_en: String? = nil
    var name_es: String? = nil
    var search_text: String? = nil
  }

  /// Hàng → domain. Id chữ thường (uuid so khớp không phân biệt hoa thường);
  /// hàng không tên thì bỏ — không có gì để chọn hay tìm.
  static func map(_ rows: [Row]) -> [LibraryExercise] {
    rows.compactMap { r in
      guard let name = r.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
      var names: [String: String] = [:]
      for (k, v) in [("vi", r.name_vi), ("en", r.name_en), ("es", r.name_es)] {
        if let v, !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { names[k] = v }
      }
      return LibraryExercise(
        id: r.id.lowercased(), userId: r.user_id?.lowercased(), name: name, muscleGroup: r.muscle_group,
        equipment: r.equipment, kind: r.exercise_kind, localNames: names.isEmpty ? nil : names, searchText: r.search_text)
    }
  }
}
