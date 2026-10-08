public import Foundation

/// Chi tiết một buổi đã tập (#428) — chỉ đọc, dựng từ hàng `workout_sessions`
/// đã có trong `HistoryBook`.
///
/// RN không có màn chi tiết: hàng ở `sessions.tsx` chỉ có nút xoá. Chỗ duy
/// nhất RN dựng "một buổi, từng bài" là thẻ xem trước khi đăng
/// (`payloadFromSession`, `use-community.ts:1178`) — nên mọi con số ở đây theo
/// đúng các luật ĐÃ CÓ, không phép tính mới:
/// - bài theo thứ tự xuất hiện, khoá `exerciseId` hoặc `name:<tên>`; tên trống
///   là `?` (`payloadFromSession`);
/// - set nặng nhất của bài: tạ lớn nhất, bằng tạ thì nhiều rep hơn; khởi động
///   không tính (`payloadFromSession`);
/// - volume của bài: Σ kg × reps bỏ khởi động (`volume_load`, WS-5); volume
///   của buổi là cột ĐÃ LƯU, không cộng lại;
/// - set đã làm / khởi động / giữ, số bài: như `HistoryEntry` / `WorkoutSummary`;
/// - phút tập ước lượng: `trainingMinutes` (`activity.ts:104`) — 3 giây một
///   rep + nghỉ (mặc định 90 giây) mỗi set có rep; 0 set có rep → `nil`;
/// - RPE buổi và cờ kỷ lục: cột đã lưu (`session_rpe`, `pr_detected`).
///
/// Dữ liệu thiếu không thành số bịa: `volume_load` trống → `nil` (không hiện
/// "0 kg"), RPE ngoài 1…10 → `nil`, set không đọc được tạ / rep → `nil` ở ô ấy.
public struct SessionDetail: Sendable, Hashable {
  public struct SetLine: Sendable, Hashable {
    /// Thứ tự trong buổi (1…), theo vị trí trong `sets`.
    public let position: Int
    public let weightKg: Double?
    public let reps: Int?
    public let rpe: Int?
    public let warmup: Bool
    public let durationSec: Int?
  }

  public struct Exercise: Sendable, Hashable {
    /// `exerciseId`, hoặc `name:<tên>` cho hàng thêm tay không có id.
    public let key: String
    public let exerciseId: String?
    public let name: String
    /// Mọi set của bài, theo thứ tự trong buổi (khởi động đánh dấu, không bỏ).
    public let sets: [SetLine]
    /// Set đã làm (không khởi động) — số `sets` của thẻ chia sẻ.
    public let workingSets: Int
    /// Set nặng nhất (tạ, rồi rep); `nil` khi bài chỉ có khởi động.
    public let topWeightKg: Double?
    public let topReps: Int?
    /// Σ kg × reps của set đã làm, làm tròn như `volume_load`.
    public let volumeKg: Int
    /// Kỷ lục của bài trong buổi — xem `SessionDetail.records`.
    public let record: PersonalRecord?
  }

  public let id: String
  public let at: EpochMillis
  /// Tên đã lưu, cắt khoảng trắng; `nil` khi trống — màn tự gọi "Buổi tập".
  public let title: String?
  public let sessionRpe: Int?
  /// `volume_load` đã lưu; `nil` khi cột trống.
  public let volumeKg: Int?
  public let prDetected: Bool
  public let exercises: [Exercise]
  public let completedSets: Int
  public let warmupSets: Int
  public let holdSets: Int
  /// Phút tập ƯỚC LƯỢNG từ set (không phải số đo) — `nil` khi không có set có rep.
  public let estimatedMinutes: Int?
  /// Kỷ lục của buổi, so với các buổi TRƯỚC nó trong cửa sổ lịch sử đang có
  /// (`HistoryBook.windowDays`), mức tăng lớn nhất trước (`findRecords`).
  ///
  /// Chỉ khi buổi đã được ghi là có kỷ lục (`pr_detected`): lúc chốt RN so với
  /// 400 buổi gần nhất, cửa sổ ở đây ngắn hơn, nên phép so lại KHÔNG được tự
  /// nhận kỷ lục cho buổi mà lúc ấy không có. Còn với buổi có cờ, danh sách
  /// này là "kỷ lục trong cửa sổ" — có thể dài hơn điều đã ăn mừng lúc chốt
  /// nếu lịch sử cũ hơn cửa sổ từng nặng hơn; màn hình phải nói cửa sổ.
  public let records: [PersonalRecord]
  /// Số buổi trước nó đã được đem ra so (0 = không có gì để so).
  public let comparedSessions: Int
}

extension SessionDetail {
  /// `DEFAULT_REST` (`prescription.ts:29`).
  static let defaultRestSeconds = 90

  /// Dựng chi tiết của `entry`; `earlier` là các buổi khác trong lịch sử (chỉ
  /// buổi TRƯỚC `entry` được dùng để so kỷ lục).
  public init(_ entry: HistoryEntry, history: [HistoryEntry]) {
    let raw = Self.rawSets(entry.sets)
    // Nhóm theo bài, thứ tự xuất hiện.
    var order: [String] = []
    var groups: [String: (id: String?, name: String, sets: [SetLine])] = [:]
    for (i, r) in raw.enumerated() {
      let name = r.name.isEmpty ? "?" : r.name
      let key = r.exerciseId.map { $0 } ?? "name:\(name)"
      let line = SetLine(
        position: i + 1, weightKg: r.weight, reps: r.reps, rpe: r.rpe, warmup: r.warmup, durationSec: r.durationSec)
      if groups[key] == nil {
        order.append(key)
        groups[key] = (r.exerciseId, name, [])
      }
      groups[key]!.sets.append(line)
    }

    let prior = history.filter { $0.id != entry.id && ($0.at < entry.at) }
    let records: [PersonalRecord]
    if entry.prDetected {
      let bests = PersonalRecords.bests(from: prior.flatMap { PersonalRecords.sets(fromJSON: $0.sets) })
      records = PersonalRecords.findRecords(PersonalRecords.sets(fromJSON: entry.sets), bests: bests)
    } else {
      records = []
    }
    let recordByKey = Dictionary(records.map { (PersonalRecords.exerciseKey($0.exercise), $0) }, uniquingKeysWith: { a, _ in a })

    exercises = order.map { key in
      let g = groups[key]!
      let working = g.sets.filter { !$0.warmup }
      // `payloadFromSession`: tạ lớn hơn, hoặc bằng tạ mà nhiều rep hơn.
      var top: (w: Double, r: Int)?
      for s in working {
        let w = s.weightKg ?? 0, r = s.reps ?? 0
        if let t = top {
          if w > t.w || (w == t.w && r > t.r) { top = (w, r) }
        } else {
          top = (w, r)
        }
      }
      let volume = working.reduce(0.0) { $0 + ($1.weightKg ?? 0) * Double($1.reps ?? 0) }
      return Exercise(
        key: key, exerciseId: g.id, name: g.name, sets: g.sets, workingSets: working.count, topWeightKg: top?.w,
        topReps: top?.r, volumeKg: FitnessCalc.jsRound(volume),
        record: recordByKey[PersonalRecords.exerciseKey(g.name)])
    }

    let counted = raw.filter { !$0.warmup && (($0.reps ?? 0) > 0 || ($0.durationSec ?? 0) > 0) }
    id = entry.id
    at = entry.at
    // `s.template_name?.trim() || null` — `trim()` của JS.
    let trimmed = RepEntry.trimJS(entry.templateName)
    title = trimmed.isEmpty ? nil : trimmed
    sessionRpe = (1...10).contains(entry.sessionRpe) ? entry.sessionRpe : nil
    volumeKg = entry.volumeLoad
    prDetected = entry.prDetected
    completedSets = counted.count
    warmupSets = raw.filter(\.warmup).count
    holdSets = counted.filter { ($0.reps ?? 0) == 0 && ($0.durationSec ?? 0) > 0 }.count
    estimatedMinutes = Self.trainingMinutes(raw)
    self.records = records
    comparedSessions = prior.count
  }

  struct RawSet {
    let exerciseId: String?
    let name: String
    let weight: Double?
    let reps: Int?
    let rpe: Int?
    let warmup: Bool
    let durationSec: Int?
    /// `Number(s.reps)` / `Number(s.restSeconds)` CHƯA làm tròn — phút tập
    /// của RN (`trainingMinutes`) tính trên số thô, không trên số đã làm tròn
    /// để hiện.
    let repsValue: Double?
    let restValue: Double?
  }

  /// Đọc phòng thủ mọi set là object (`payloadFromSession` không bỏ set nào
  /// trừ khởi động khi tóm tắt; ở đây khởi động vẫn hiện, có đánh dấu).
  static func rawSets(_ value: JSONValue?) -> [RawSet] {
    guard case .array(let rows)? = value else { return [] }
    return rows.compactMap { r in
      guard case .object = r else { return nil }
      let id = r["exerciseId"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
      let reps = PersonalRecords.jsNumber(r["reps"]).map { FitnessCalc.jsRound($0) }
      return RawSet(
        exerciseId: id,
        name: RepEntry.trimJS(r["exerciseName"]?.stringValue ?? ""),
        weight: r["weight"].flatMap { $0 == .null ? nil : PersonalRecords.jsNumber($0) },
        reps: r["reps"] == nil || r["reps"] == .null ? nil : reps,
        rpe: PersonalRecords.jsNumber(r["rpe"]).flatMap { (1...10).contains($0) ? Int($0) : nil },
        warmup: r["warmup"]?.boolValue == true,
        durationSec: PersonalRecords.jsNumber(r["durationSec"]).flatMap { $0 > 0 ? Int($0) : nil },
        repsValue: PersonalRecords.jsNumber(r["reps"]),
        restValue: r["restSeconds"] == nil || r["restSeconds"] == .null
          ? nil : PersonalRecords.jsNumber(r["restSeconds"]))
    }
  }

  /// `trainingMinutes`: chỉ set có `Number(reps) > 0`; mỗi set
  /// `reps × 3 + nghỉ` giây trên số THÔ (8.5 rep là 25.5 giây, 0.4 rep vẫn là
  /// set có rep); `max(1, round(giây / 60))`; không có set nào → `nil` (RN: 0).
  /// Nghỉ không đọc được là 90 giây — RN ra `NaN` phút ở đây.
  static func trainingMinutes(_ sets: [RawSet]) -> Int? {
    let real = sets.filter { ($0.repsValue ?? 0) > 0 }
    guard !real.isEmpty else { return nil }
    let seconds = real.reduce(0.0) { $0 + ($1.repsValue ?? 0) * 3 + ($1.restValue ?? Double(defaultRestSeconds)) }
    return max(1, FitnessCalc.jsRound(seconds / 60))
  }
}

/// Màn chi tiết đang ở đâu.
public enum SessionDetailState: Sendable, Hashable {
  /// Lịch sử chưa có gì để hiện (cache trống, server chưa trả lời).
  case loading
  case ready(SessionDetail)
  /// Không có buổi này trong lịch sử của người đang đăng nhập: đã xoá (ở máy
  /// này hay nơi khác), ra khỏi cửa sổ, hoặc không phải của họ.
  case notFound
}

extension HistoryBook {
  /// Chi tiết của buổi `id` — đọc từ lịch sử đang có, không gọi mạng. Buổi
  /// vừa xoá trả `.notFound` ngay (`delete` bỏ nó khỏi `entries` trước).
  public func detail(_ id: String) -> SessionDetailState {
    guard let entry = entries.first(where: { $0.id == id.lowercased() }) else {
      return loaded ? .notFound : .loading
    }
    return .ready(SessionDetail(entry, history: entries))
  }
}
