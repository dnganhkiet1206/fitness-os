import Foundation
public import Observation

/// Kỷ lục cá nhân — port `native/src/lib/personal-record.ts` @ fac9ac2 (#295).
///
/// Luật (giữ nguyên baseline): so theo TÊN bài (`exerciseKey`), không theo id;
/// set khởi động không bao giờ là kỷ lục; tạ phải vượt kỷ lục cũ quá 0,05 kg
/// (`WEIGHT_EPSILON_KG`, chống "kỷ lục ma" khi đổi kg ↔ lb); không có lịch sử
/// bài ấy thì không có gì để vượt; mỗi bài nhiều nhất một kỷ lục, tạ nặng hơn
/// thắng thêm reps, xếp theo mức tăng.

/// Một set đưa vào phép so kỷ lục (`RecordSet`).
public struct RecordSet: Sendable, Hashable {
  public let exerciseName: String
  public let weightKg: Double
  public let reps: Int
  public let warmup: Bool
  public let durationSec: Int?

  public init(exerciseName: String, weightKg: Double, reps: Int, warmup: Bool = false, durationSec: Int? = nil) {
    self.exerciseName = exerciseName
    self.weightKg = weightKg
    self.reps = reps
    self.warmup = warmup
    self.durationSec = durationSec
  }
}

public struct PersonalRecord: Sendable, Hashable, Codable {
  public let exercise: String
  public let kind: PersonalRecords.Kind
  public let value: Double
  public let previous: Double
  /// Chỉ với kỷ lục reps: ở mức tạ nào.
  public let atWeight: Double?

  public init(exercise: String, kind: PersonalRecords.Kind, value: Double, previous: Double, atWeight: Double?) {
    self.exercise = exercise
    self.kind = kind
    self.value = value
    self.previous = previous
    self.atWeight = atWeight
  }
}


extension PersonalRecords {
  public typealias Bests = [String: Best]

  /// `PR_HISTORY`: "tốt nhất từ trước tới nay" = 400 buổi gần nhất.
  public static let historyLimit = 400

  /// `exerciseKey` (`exercise-key.ts`): trim, chữ thường, gộp khoảng trắng.
  public static func exerciseKey(_ name: String) -> String {
    name.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  /// `counts`: không khởi động, reps ≥ 1, tạ hữu hạn ≥ 0.
  static func counts(_ s: RecordSet) -> Bool {
    !s.warmup && s.reps >= 1 && s.weightKg.isFinite && s.weightKg >= 0
  }

  /// `bestsFrom`: gộp mọi set vào bảng tốt-nhất-theo-bài; `into` để gộp thêm
  /// vào bảng đã có (buổi vừa chốt vào lịch sử).
  public static func bests(from sets: [RecordSet], into initial: Bests = [:]) -> Bests {
    var out = initial
    for s in sets where counts(s) {
      let key = exerciseKey(s.exerciseName)
      guard !key.isEmpty else { continue }
      let w = WorkoutMath.round2(s.weightKg)
      var best = out[key] ?? Best(topWeight: 0, repsAt: [:])
      if w > best.topWeight { best.topWeight = w }
      let wk = weightKey(w)
      if s.reps > (best.repsAt[wk] ?? 0) { best.repsAt[wk] = s.reps }
      out[key] = best
    }
    return out
  }

  /// `findRecords`: kỷ lục của một buổi, mỗi bài nhiều nhất một, mức tăng lớn
  /// nhất trước (sắp xếp ỔN ĐỊNH như `Array.prototype.sort` của JS).
  public static func findRecords(_ sets: [RecordSet], bests: Bests) -> [PersonalRecord] {
    var order: [String] = []
    var found: [String: PersonalRecord] = [:]
    for s in sets where counts(s) {
      let key = exerciseKey(s.exerciseName)
      guard !key.isEmpty, let best = bests[key] else { continue }
      let w = WorkoutMath.round2(s.weightKg)
      let name = s.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
      let record: PersonalRecord?
      if w > 0 && w > best.topWeight + weightEpsilonKg {
        record = PersonalRecord(exercise: name, kind: .weight, value: w, previous: best.topWeight, atWeight: nil)
      } else if let prev = best.repsAt[weightKey(w)], s.reps > prev {
        record = PersonalRecord(exercise: name, kind: .reps, value: Double(s.reps), previous: Double(prev), atWeight: w)
      } else {
        record = nil
      }
      guard let record else { continue }
      if let held = found[key] {
        if better(record, than: held) { found[key] = record }
      } else {
        order.append(key)
        found[key] = record
      }
    }
    let list = order.compactMap { found[$0] }
    return list.enumerated()
      .sorted { a, b in
        let ga = gain(a.element), gb = gain(b.element)
        return ga != gb ? ga > gb : a.offset < b.offset
      }
      .map(\.element)
  }

  static func better(_ next: PersonalRecord, than held: PersonalRecord) -> Bool {
    if next.kind != held.kind { return next.kind == .weight }
    return next.value > held.value
  }

  static func gain(_ r: PersonalRecord) -> Double {
    r.previous <= 0 ? 0.1 : (r.value - r.previous) / r.previous
  }

  /// `setsFromJson`: cột `workout_sessions.sets` là JSONB tự do — ép kiểu cái
  /// ép được, bỏ cái không; không bao giờ ném (một set hỏng hai năm trước
  /// không được biến việc lưu buổi tập thành lỗi).
  public static func sets(fromJSON value: JSONValue?) -> [RecordSet] {
    guard case .array(let rows)? = value else { return [] }
    return rows.compactMap { r in
      guard case .object = r else { return nil }
      let name = r["exerciseName"]?.stringValue ?? ""
      guard let weight = jsNumber(r["weight"]), !name.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
      let reps = jsNumber(r["reps"])
      let duration = jsNumber(r["durationSec"]).flatMap { $0 > 0 ? $0 : nil }
      guard reps != nil || duration != nil else { return nil }
      return RecordSet(
        exerciseName: name, weightKg: weight, reps: reps.map { Int($0) } ?? 0,
        warmup: r["warmup"]?.boolValue == true, durationSec: duration.map { Int($0) })
    }
  }

  /// `Number(x)` rồi `isFinite`: số, hoặc chuỗi số. `null` → 0 như `Number(null)`.
  static func jsNumber(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n)?: return n.isFinite ? n : nil
    case .string(let s)?:
      let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
      if t.isEmpty { return 0 }
      return Double(t).flatMap { $0.isFinite ? $0 : nil }
    case .null?: return 0
    case .bool(let b)?: return b ? 1 : 0
    default: return nil
    }
  }
}

extension WorkoutSessionRecord {
  /// Các set của buổi dưới dạng so kỷ lục — GIỮ cờ khởi động.
  public var recordSets: [RecordSet] {
    sets.map {
      RecordSet(exerciseName: $0.exerciseName, weightKg: $0.weightKg, reps: $0.reps, warmup: $0.warmup, durationSec: $0.durationSec)
    }
  }
}

/// Lịch sử để so kỷ lục: cột `sets` của các buổi gần nhất
/// (`ASCNDBackend.SupabaseRecordHistory`).
public protocol RecordHistory: Sendable {
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue]
}

/// Cache bảng tốt-nhất trên máy (theo người dùng) — chốt buổi offline vẫn so
/// được kỷ lục.
public protocol RecordBookCache: Sendable {
  func load(userId: String) async throws -> PersonalRecords.Bests?
  func save(userId: String, _ bests: PersonalRecords.Bests) async throws
}

/// Bảng tốt-nhất của một người dùng, local-first (#295).
///
/// RN behavior: hỏi server 400 buổi NGAY LÚC chốt (`use-fitness-data.ts:367`);
///   offline thì không hỏi được → `pr_detected: false` (`day-plan.tsx`).
/// Native behavior: bảng nạp từ cache rồi làm mới từ server khi mở màn; chốt
///   buổi (kể cả offline) so với bảng đang có; buổi vừa chốt được gộp ngay
///   vào bảng để buổi thứ hai không nổ lại cùng kỷ lục.
/// Reason: chốt buổi không đợi mạng (ADR-0003) mà kỷ lục vẫn đúng offline.
/// Rủi ro chấp nhận: bảng cũ hơn server (buổi ghi ở máy khác sau lần làm mới
///   cuối) có thể cho một kỷ lục mà server đã biết — như RN khi lịch sử lỗi.
@MainActor @Observable
public final class RecordBook {
  public let userId: String
  /// `nil` = chưa biết lịch sử (chưa có cache, server chưa trả lời): không so.
  public private(set) var bests: PersonalRecords.Bests?
  @ObservationIgnored private let history: any RecordHistory
  @ObservationIgnored private let cache: any RecordBookCache

  public init(userId: String, history: any RecordHistory, cache: any RecordBookCache) {
    self.userId = userId
    self.history = history
    self.cache = cache
  }

  /// Cache trước, rồi server. Server hỏng thì giữ bảng đang có.
  public func load() async {
    if bests == nil, let cached = try? await cache.load(userId: userId) {
      bests = cached
    }
    await refresh()
  }

  public func refresh() async {
    guard let rows = try? await history.recentSessionSets(userId: userId, limit: PersonalRecords.historyLimit)
    else { return }
    let fresh = PersonalRecords.bests(from: rows.flatMap { PersonalRecords.sets(fromJSON: $0) })
    bests = fresh
    try? await cache.save(userId: userId, fresh)
  }

  /// Buổi vừa chốt thành lịch sử (`sets` trong hàng outbox).
  public func absorb(setsJSON: JSONValue?) async {
    let merged = PersonalRecords.bests(from: PersonalRecords.sets(fromJSON: setsJSON), into: bests ?? [:])
    bests = merged
    try? await cache.save(userId: userId, merged)
  }
}
