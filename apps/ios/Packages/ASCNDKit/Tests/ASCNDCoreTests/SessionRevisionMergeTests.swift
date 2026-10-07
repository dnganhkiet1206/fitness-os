import ASCNDCore
import Testing

/// #523 P1: bản ghi lại một buổi không được đè thay đổi của máy khác.
struct SessionRevisionMergeTests {
  private func set(_ name: String, _ kg: Double, _ reps: Int, rpe: Int? = 8, warmup: Bool = false, index: Int = 0) -> JSONValue {
    var o: [String: JSONValue] = [
      "exerciseId": .string("ex-\(name)"), "exerciseName": .string(name), "setIndex": .number(Double(index)),
      "weight": .number(kg), "reps": .number(Double(reps)), "rpe": rpe.map { JSONValue.number(Double($0)) } ?? .null,
    ]
    if warmup { o["warmup"] = .bool(true) }
    return .object(o)
  }

  private func row(_ sets: [JSONValue], rpe: Double = 8, pr: Bool = false) -> JSONValue {
    .object([
      "id": .string("s1"), "user_id": .string("u1"), "sets": .array(sets),
      "session_rpe": .number(rpe), "pr_detected": .bool(pr), "volume_load": .number(0),
    ])
  }

  private func names(_ o: SessionRevisionMerge.Outcome) -> [String] {
    guard case .update(let f) = o, case .array(let a)? = f["sets"] else { return [] }
    return a.compactMap { $0["exerciseName"]?.stringValue }
  }

  private func apply(_ o: SessionRevisionMerge.Outcome, to server: JSONValue?) -> JSONValue? {
    switch o {
    case .skip: return server
    case .delete: return nil
    case .upsert(let r): return r
    case .update(let f):
      guard case .object(var r)? = server, case .object(let fs) = f else { return server }
      for (k, v) in fs { r[k] = v }
      return .object(r)
    }
  }

  private let a = "Bench", b = "Squat", c = "Row", d = "Curl"

  /// Máy A nối set D; trong lúc A offline, máy B đã nối set C. Bản chụp của A
  /// (A, B, D) đè cả hàng thì mất C — bản gộp giữ đủ.
  @Test func appendKeepsTheOtherDevicesAppend() {
    let base = JSONValue.array([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2)])
    let server = row([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2), set(c, 50, 10, index: 3)])
    let local = row([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2), set(d, 12.5, 12, index: 3)])
    let out = SessionRevisionMerge.merge(server: server, base: base, local: local)
    #expect(names(out) == [a, b, c, d], "set của máy B còn; set của A nối vào cuối")
    guard case .update(let f) = out, case .array(let sets)? = f["sets"] else { Issue.record("không phải update"); return }
    #expect(sets.map { $0["setIndex"] ?? .null } == [1, 2, 3, 4].map { JSONValue.number(Double($0)) }, "đánh số lại liền mạch")
    // 60×8 + 100×5 + 50×10 + 12,5×12 = 480 + 500 + 500 + 150.
    #expect(f["volume_load"] == .number(1630))
  }

  /// Máy A gỡ set B; máy B đã nối set C: chỉ B biến mất.
  @Test func removeKeepsTheOtherDevicesAppend() {
    let base = JSONValue.array([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2)])
    let server = row([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2), set(c, 50, 10, index: 3)])
    let local = row([set(a, 60, 8, index: 1)])
    #expect(names(SessionRevisionMerge.merge(server: server, base: base, local: local)) == [a, c])
  }

  /// Máy B đã gỡ set A; máy A (không đụng A) nối D: A không sống lại.
  @Test func otherDevicesRemovalIsNotUndone() {
    let base = JSONValue.array([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2)])
    let server = row([set(b, 100, 5, index: 1)])
    let local = row([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2), set(d, 12.5, 12, index: 3)])
    #expect(names(SessionRevisionMerge.merge(server: server, base: base, local: local)) == [b, d])
  }

  /// Phát lại (mất phản hồi rồi gửi lại cùng bản ghi) cho cùng kết quả —
  /// không nhân đôi set nối thêm, không gỡ thêm set nào.
  @Test func replayIsIdempotent() {
    let base = JSONValue.array([set(a, 60, 8, index: 1), set(a, 60, 8, index: 2), set(b, 100, 5, index: 3)])
    let server = row([set(a, 60, 8, index: 1), set(a, 60, 8, index: 2), set(b, 100, 5, index: 3), set(c, 50, 10, index: 4)])
    // Gỡ một trong hai set A giống hệt, nối D.
    let local = row([set(a, 60, 8, index: 1), set(b, 100, 5, index: 2), set(d, 12.5, 12, index: 3)])
    let once = apply(SessionRevisionMerge.merge(server: server, base: base, local: local), to: server)
    let twice = apply(SessionRevisionMerge.merge(server: once, base: base, local: local), to: once)
    #expect(once == twice)
    if case .array(let s)? = once?["sets"] {
      #expect(s.compactMap { $0["exerciseName"]?.stringValue } == [a, b, c, d])
    } else {
      Issue.record("mất hàng")
    }
  }

  /// Bản ghi xoá (gỡ set cuối của máy này): còn set máy khác → giữ hàng với
  /// đúng các set ấy; không còn gì → xoá.
  @Test func deleteKeepsOtherDevicesSetsOrDeletes() {
    let base = JSONValue.array([set(a, 60, 8, index: 1)])
    let shared = row([set(a, 60, 8, index: 1), set(c, 50, 10, index: 2)])
    #expect(names(SessionRevisionMerge.merge(server: shared, base: base, local: nil)) == [c])
    let alone = row([set(a, 60, 8, index: 1)])
    #expect(SessionRevisionMerge.merge(server: alone, base: base, local: nil) == .delete)
  }

  /// Hàng đã bị máy khác xoá: không dựng lại (như baseline `confirmWrite`).
  /// Ngoại lệ: hoàn tác lần gỡ set cuối của CHÍNH máy này (`base` rỗng).
  @Test func missingRowIsNotResurrectedExceptOwnUndo() {
    let base = JSONValue.array([set(a, 60, 8, index: 1)])
    let local = row([set(a, 60, 8, index: 1), set(d, 12.5, 12, index: 2)])
    #expect(SessionRevisionMerge.merge(server: nil, base: base, local: local) == .skip)
    #expect(SessionRevisionMerge.merge(server: nil, base: base, local: nil) == .skip)
    let undo = row([set(a, 60, 8, index: 1)])
    #expect(SessionRevisionMerge.merge(server: nil, base: .array([]), local: undo) == .upsert(undo))
  }

  /// RPE buổi không giảm, kỷ lục không mất, volume bỏ set khởi động.
  @Test func rowFieldsFollowBaselineAppend() {
    let base = JSONValue.array([set(a, 60, 8, index: 1)])
    let server = row([set(a, 60, 8, index: 1), set(c, 50, 10, index: 2)], rpe: 9, pr: true)
    let local = row([set(a, 60, 8, index: 1), set(b, 20, 10, warmup: true, index: 2)], rpe: 7, pr: false)
    guard case .update(let f) = SessionRevisionMerge.merge(server: server, base: base, local: local) else {
      Issue.record("không phải update")
      return
    }
    #expect(f["session_rpe"] == .number(9))
    #expect(f["pr_detected"] == .bool(true))
    #expect(f["volume_load"] == .number(980), "60×8 + 50×10, set khởi động không tính")
    #expect(f["id"] == nil, "chỉ cập nhật cột của buổi, không ghi cả hàng")
  }

  /// So set theo nội dung, không theo `setIndex` (đánh số lại sau mỗi lần sửa).
  @Test func keyIgnoresSetIndex() {
    #expect(SessionRevisionMerge.key(set(a, 60, 8, index: 1)) == SessionRevisionMerge.key(set(a, 60, 8, index: 5)))
    #expect(SessionRevisionMerge.key(set(a, 60, 8)) != SessionRevisionMerge.key(set(a, 62.5, 8)))
    #expect(SessionRevisionMerge.key(set(a, 60, 8)) != SessionRevisionMerge.key(set(a, 60, 8, warmup: true)))
  }
}
