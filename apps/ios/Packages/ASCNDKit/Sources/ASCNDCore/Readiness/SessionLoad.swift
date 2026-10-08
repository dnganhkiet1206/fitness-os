/// Tải nội sinh của một buổi theo phương pháp session-RPE — `lib/session-load.ts`
/// @ fac9ac2, nguyên văn.
///
/// `RPE × tổng rep`. Buổi không đo được (RPE ngoài 1…10, không có rep — bài
/// nhập từ đồng hồ có `sets` rỗng) là `nil`, và bị bỏ khỏi CẢ HAI vế của ACWR
/// chứ không tính là buổi tốn 0.
public enum SessionLoad {
  public static let rpeMin: Double = 1
  public static let rpeMax: Double = 10

  /// `totalReps`: cộng mọi `reps` là số hữu hạn > 0 (`"8"` tính, `"45s"` không).
  public static func totalReps(_ sets: JSONValue?) -> Double {
    guard case .array(let list)? = sets else { return 0 }
    var n = 0.0
    for s in list {
      let r = JS.number(s["reps"])
      if r.isFinite, r > 0 { n += r }
    }
    return n
  }

  /// `sessionLoad`.
  public static func load(rpe: JSONValue?, sets: JSONValue?) -> Double? {
    let r = JS.number(rpe)
    guard r.isFinite, r >= rpeMin, r <= rpeMax else { return nil }
    let reps = totalReps(sets)
    guard reps > 0 else { return nil }
    return r * reps
  }

  public static func load(_ session: JSONValue) -> Double? {
    load(rpe: session["session_rpe"], sets: session["sets"])
  }

  /// `loadWindow`: tổng tải của các buổi đo được.
  public static func window(_ sessions: [JSONValue]) -> Double {
    sessions.reduce(0) { $0 + (load($1) ?? 0) }
  }
}
