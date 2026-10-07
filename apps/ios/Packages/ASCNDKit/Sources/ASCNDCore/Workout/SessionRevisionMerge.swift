/// Ghi lại một buổi đã chốt mà KHÔNG đè thay đổi của máy khác (#523 P1).
///
/// Bản ghi lại (#296) mang ảnh chụp TOÀN BỘ hàng, chụp lúc xếp hàng. Gửi thẳng
/// ảnh chụp ấy là "đọc → sửa → ghi" với phần đọc nằm trong máy: máy B nối một
/// set vào cùng buổi sau lúc máy A chụp, thì lần gửi của A xoá mất set của B.
/// Baseline không vấp vì đọc hàng NGAY trước khi ghi (`use-fitness-data.ts`
/// `useAppendToSession`: `[...old, ...added]`; gỡ set: lọc trên hàng vừa đọc).
///
/// Ở đây cũng vậy: lúc GỬI, đọc hàng trên server rồi áp đúng PHẦN máy này đã
/// đổi — so `base` (các set đã ghi trước lần sửa) với `local` (các set sau lần
/// sửa) — lên hàng đọc được. Set nào máy này không đụng tới thì giữ như server.
///
/// So từng set theo nội dung (bỏ `setIndex`, vì đánh số lại sau mỗi lần sửa),
/// đếm theo bội. Với mỗi nội dung, `b` lần trong base, `l` trong local, `s`
/// trên server:
/// - `l > b` (máy này thêm): còn `max(s, l)`;
/// - `l < b` (máy này gỡ):  còn `min(s, l)`;
/// - `l == b`: còn `s` — đúng như server.
/// `max`/`min` thay vì `s ± (l − b)` để PHÁT LẠI không nhân đôi: mất phản hồi
/// rồi gửi lại cùng bản ghi thì `max(l, l) = l`, `min(l, l) = l`. Cái giá: hai
/// máy cùng thêm hai set GIỐNG HỆT (cùng bài, mức, reps, RPE) thì giữ một —
/// hiếm, và không mất set nào khác của ai.
public enum SessionRevisionMerge {
  public enum Outcome: Sendable, Hashable {
    /// Hàng không còn trên server (máy khác đã xoá): không dựng lại nó.
    /// Ngoại lệ: hoàn tác lần gỡ set cuối của chính máy này (`base` rỗng).
    case skip
    /// Không còn set nào: xoá hàng.
    case delete
    /// Hàng còn đó: `update` đúng các cột này (`sets`, `volume_load`,
    /// `session_rpe`, `pr_detected`) theo `id` + `user_id`, như baseline.
    case update(JSONValue)
    /// Dựng lại cả hàng (upsert ghi đè theo `id`).
    case upsert(JSONValue)
  }

  /// - Parameters:
  ///   - server: hàng `workout_sessions` đọc lúc gửi (ít nhất `sets`,
  ///     `session_rpe`, `pr_detected`); `nil` = không có.
  ///   - base: mảng set đã ghi trước lần sửa này.
  ///   - local: hàng mới của máy này (bản ghi lại), hoặc `nil` khi máy này gỡ
  ///     hết set (bản ghi xoá).
  public static func merge(server: JSONValue?, base: JSONValue, local: JSONValue?) -> Outcome {
    guard let server, case .object = server else {
      // Không có hàng mà máy này cũng chưa ghi set nào trước lần sửa: hàng
      // do CHÍNH máy này xoá (gỡ set cuối) và đây là hoàn tác — dựng lại.
      // Còn lại: máy khác đã xoá buổi; như baseline (ghi vào hàng đã mất là
      // lỗi, `confirmWrite`), không dựng lại buổi người dùng đã xoá.
      if sets(base).isEmpty, let local, !sets(local["sets"]).isEmpty { return .upsert(local) }
      return .skip
    }
    let serverSets = sets(server["sets"])
    let baseSets = sets(base)
    let localSets = sets(local?["sets"])

    let b = counts(baseSets), l = counts(localSets)
    let s = counts(serverSets)
    var keep: [String: Int] = [:]
    for (k, n) in s {
      let lk = l[k] ?? 0, bk = b[k] ?? 0
      keep[k] = lk > bk ? max(n, lk) : lk < bk ? min(n, lk) : n
    }

    // Thứ tự: set server còn giữ theo thứ tự server, rồi set máy này thêm
    // theo thứ tự máy này (như baseline nối `[...old, ...added]`).
    var out: [JSONValue] = []
    for set in serverSets {
      let k = key(set)
      if let n = keep[k], n > 0 {
        out.append(set)
        keep[k] = n - 1
      }
    }
    // Nội dung máy này thêm cần `max(s, l)` bản; server đã góp `s`.
    var added: [String: Int] = [:]
    for (k, lk) in l where lk > (b[k] ?? 0) {
      added[k] = max(0, lk - (s[k] ?? 0))
    }
    for set in localSets {
      let k = key(set)
      if let n = added[k], n > 0 {
        out.append(set)
        added[k] = n - 1
      }
    }

    guard !out.isEmpty else { return .delete }
    let renumbered = out.enumerated().map { i, set -> JSONValue in
      guard case .object(var o) = set else { return set }
      o["setIndex"] = .number(Double(i + 1))
      return .object(o)
    }
    var row: [String: JSONValue] = [
      "sets": .array(renumbered),
      "volume_load": .number(Double(volumeLoad(renumbered))),
      // Như baseline nối thêm: kỷ lục đã có không mất.
      "pr_detected": .bool(
        (server["pr_detected"]?.boolValue ?? false) || (local?["pr_detected"]?.boolValue ?? false)),
    ]
    // RPE buổi không giảm (baseline nối thêm: `max(row.session_rpe, …)`).
    let rpe = max(server["session_rpe"]?.doubleValue ?? 0, local?["session_rpe"]?.doubleValue ?? 0)
    if rpe > 0 { row["session_rpe"] = .number(rpe) }
    return .update(.object(row))
  }

  /// Σ kg × reps, bỏ set khởi động, làm tròn như `Math.round` — cùng luật với
  /// `WorkoutSessionRecord.volumeLoad` (WS-5).
  static func volumeLoad(_ sets: [JSONValue]) -> Int {
    let total = sets.reduce(0.0) { sum, set in
      if set["warmup"]?.boolValue == true { return sum }
      return sum + (set["weight"]?.doubleValue ?? 0) * (set["reps"]?.doubleValue ?? 0)
    }
    return Int((total + 0.5).rounded(.down))
  }

  private static func sets(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  private static func counts(_ sets: [JSONValue]) -> [String: Int] {
    var c: [String: Int] = [:]
    for set in sets { c[key(set), default: 0] += 1 }
    return c
  }

  /// Nội dung một set, bỏ `setIndex`, khoá theo thứ tự trường cố định.
  public static func key(_ set: JSONValue) -> String {
    guard case .object(let o) = set else { return "\(set)" }
    return o.filter { $0.key != "setIndex" }.sorted { $0.key < $1.key }
      .map { "\($0.key)=\(canonical($0.value))" }.joined(separator: "|")
  }

  private static func canonical(_ v: JSONValue) -> String {
    switch v {
    case .null: "null"
    case .bool(let b): b ? "true" : "false"
    case .number(let n): "\(n)"
    case .string(let s): "\"\(s)\""
    case .array(let a): "[" + a.map(canonical).joined(separator: ",") + "]"
    case .object(let o):
      "{" + o.sorted { $0.key < $1.key }.map { "\($0.key):\(canonical($0.value))" }.joined(separator: ",") + "}"
    }
  }
}
