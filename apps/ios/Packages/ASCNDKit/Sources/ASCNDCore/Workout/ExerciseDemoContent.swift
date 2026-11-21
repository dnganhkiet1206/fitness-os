public import Foundation

/// Các khối nội dung độc lập của một bài 3D (Kiệt 20/11: "tách các file trong chế độ hướng dẫn 3d
/// thành các file độc lập"). Mỗi khối là một tệp `<bài>_<khối>.json` trong
/// `Resources/ExerciseDemos`, sinh bởi `artifacts/exercise-visual-system/pipeline/export_app_demos.py`
/// và có hợp đồng ở `artifacts/exercise-visual-system/schemas/demo3d_<khối>.schema.json`:
///
/// - `tips`: mẹo kỹ thuật, kèm chữ en / es / vi (trước 20/11 chữ nằm trong Localizable.xcstrings);
/// - `tempo`: nhịp từng rep;
/// - `mistakes`: clip lỗi sai thường gặp, kèm chữ.
///
/// Sửa / thêm một khối chỉ thay tệp ấy: không đụng chuyển động, nhân vật, phòng hay code app.
/// Tệp có `schema` mới hơn bản app hiểu thì app bỏ qua khối đó (không crash, tính năng ẩn).
public enum ExerciseDemoContent {
  /// Phiên bản hợp đồng app này đọc được.
  public static let schema = 1
  public static let languages = ["en", "es", "vi"]

  /// Chữ theo ngôn ngữ của app (`en` / `es` / `vi`); thiếu thì tiếng Anh, rồi bất kỳ.
  public static func pick<T>(_ byLang: [String: T], lang: String) -> T? {
    byLang[lang] ?? byLang["en"] ?? byLang.keys.sorted().first.flatMap { byLang[$0] }
  }

  /// Đọc một khối; `nil` khi hỏng hay `schema` mới hơn bản app.
  public static func decode<T: Decodable & ExerciseDemoVersioned>(_ type: T.Type, from data: Data) -> T? {
    guard let file = try? JSONDecoder().decode(type, from: data), file.schema <= schema else { return nil }
    return file
  }

  // MARK: - Mẹo

  public struct TipText: Decodable, Sendable, Hashable {
    public let title: String
    public let body: String
    /// Các bước làm đúng.
    public let how: [String]
    public let why: String
    public let avoid: String
  }

  public struct Tip: Decodable, Sendable {
    public let id: String
    /// Điểm trên da ở khung đầu (mét, Y-up).
    public let anchor: [Float]
    /// Khớp điểm neo đi theo + độ lệch tới da (`pipeline/tip_anchors.py`); không có = điểm cố định.
    public let joint: String?
    public let offset: [Float]?
    public let text: [String: TipText]
  }

  public struct TipsFile: Decodable, Sendable, ExerciseDemoVersioned {
    public let schema: Int
    public let exercise: String
    public let tips: [Tip]
  }

  // MARK: - Nhịp

  public struct TempoFile: Decodable, Sendable, ExerciseDemoVersioned {
    public struct Phase: Decodable, Sendable {
      public let rep: Int
      public let kind: String
      public let start_ms: Double
      public let end_ms: Double
      public let breath: String?
    }

    public let schema: Int
    public let exercise: String
    public let duration_ms: Double
    public let reps: Int
    public let phases: [Phase]

    public var tempo: ExerciseTempo {
      ExerciseTempo(
        durationMs: duration_ms, reps: reps,
        phases: phases.map { .init(rep: $0.rep, kind: $0.kind, startMs: $0.start_ms, endMs: $0.end_ms, breath: $0.breath) })
    }
  }

  // MARK: - Lỗi sai

  public struct MistakeText: Decodable, Sendable, Hashable {
    public let title: String
    public let body: String
    public let fix: String
  }

  public struct Mistake: Decodable, Sendable {
    public let id: String
    /// Tệp chuyển động sai (không đuôi), cùng khung xương với nhân vật dùng chung.
    public let motion: String
    /// Khớp làm sai (tên ngắn trong khung xương), để vẽ vòng đỏ.
    public let joints: [String]
    public let text: [String: MistakeText]
  }

  public struct MistakesFile: Decodable, Sendable, ExerciseDemoVersioned {
    public let schema: Int
    public let exercise: String
    public let mistakes: [Mistake]
  }
}

/// Khối nội dung có số hợp đồng (`schema`).
public protocol ExerciseDemoVersioned {
  var schema: Int { get }
}
