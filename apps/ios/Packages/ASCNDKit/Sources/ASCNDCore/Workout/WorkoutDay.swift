/// Một set trong kế hoạch của ngày — một hàng trên màn tập (WS-1).
///
/// Theo `SetRow` của baseline (`day-plan.tsx:454`): kế hoạch nói tạ, reps,
/// nghỉ, RPE; người dùng có thể ghi đè từng thứ trong ngày (`DayProgress`).
public struct PlannedSet: Sendable, Hashable, Codable, Identifiable {
  /// Khoá ổn định của hàng — mọi ghi đè trong ngày neo vào nó.
  public let key: String
  public let exerciseId: String?
  public let exerciseName: String
  /// Set thứ mấy của bài này, và bài có bao nhiêu set (WS-12: đánh số lại từ
  /// 1 cho mỗi bài).
  public let ordinal: Int
  public let of: Int
  public let weightKg: Double
  public let reps: Int
  public let plannedRest: Int
  public let plannedRpe: Int
  public let warmup: Bool

  public var id: String { key }

  public init(
    key: String, exerciseId: String? = nil, exerciseName: String, ordinal: Int, of: Int,
    weightKg: Double, reps: Int, plannedRest: Int, plannedRpe: Int = 7, warmup: Bool = false
  ) {
    self.key = key
    self.exerciseId = exerciseId
    self.exerciseName = exerciseName
    self.ordinal = ordinal
    self.of = of
    self.weightKg = weightKg
    self.reps = reps
    self.plannedRest = plannedRest
    self.plannedRpe = plannedRpe
    self.warmup = warmup
  }
}

/// Tiến độ của một ngày tập — điểm quay lại khi app bị đóng giữa buổi.
///
/// Cùng các trường baseline lưu ở `routine-day:<ngày>:<template>`
/// (`day-plan.tsx:970`): tick, RPE, nghỉ, và hai ô nhập dưới dạng CHỮ đúng như
/// người dùng gõ. Quãng nghỉ đang chạy KHÔNG nằm ở đây (baseline cũng không
/// lưu nó) — `RestTimer` là chuyện của #227/#228 và sống ở chỗ khác.
public struct DayProgress: Sendable, Hashable, Codable {
  public var done: [String: Bool] = [:]
  public var rpe: [String: Int] = [:]
  public var rest: [String: Int] = [:]
  public var weightText: [String: String] = [:]
  public var repsText: [String: String] = [:]

  public init() {}

  /// Một blob cũ thiếu trường nào thì trường ấy là "như kế hoạch" — giống
  /// baseline (`saved.weightText ?? {}`), không cần migration.
  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    done = try c.decodeIfPresent([String: Bool].self, forKey: .done) ?? [:]
    rpe = try c.decodeIfPresent([String: Int].self, forKey: .rpe) ?? [:]
    rest = try c.decodeIfPresent([String: Int].self, forKey: .rest) ?? [:]
    weightText = try c.decodeIfPresent([String: String].self, forKey: .weightText) ?? [:]
    repsText = try c.decodeIfPresent([String: String].self, forKey: .repsText) ?? [:]
  }
}

/// Một set như đã làm — thứ được ghi vào buổi tập.
public struct PerformedSet: Sendable, Hashable {
  public let weightKg: Double
  public let reps: Int
  public let durationSec: Int?

  public init(weightKg: Double, reps: Int, durationSec: Int?) {
    self.weightKg = weightKg
    self.reps = reps
    self.durationSec = durationSec
  }
}

/// Màn tập của một ngày: các phép tính thuần, không UI.
public enum WorkoutDay {
  /// Một set như đã làm: ô người dùng gõ nếu có, không thì theo kế hoạch.
  /// `toKg` đổi số trong ô tạ theo đơn vị người dùng đang xem (kg/lb) — đơn
  /// vị là cài đặt của màn, không phải của core.
  ///
  /// Theo `performed()` (`day-plan.tsx:1038`): ô tạ không phải số dương → 0
  /// (bodyweight, WS-3); ô reps không đọc được → reps của kế hoạch.
  public static func performed(_ row: PlannedSet, _ progress: DayProgress, toKg: (Double) -> Double = { $0 }) -> PerformedSet {
    let weight: Double
    if let text = progress.weightText[row.key] {
      // Ô đã có chữ thì chữ thắng kế hoạch — kể cả ô bị xoá trống: `Number("")`
      // của baseline là 0, tức bodyweight, không phải "quay về kế hoạch".
      let v = Double(text.trimmingCharacters(in: .whitespaces))
      weight = v.map { $0.isFinite && $0 > 0 ? toKg($0) : 0 } ?? 0
    } else {
      weight = row.weightKg
    }
    let entry = RepEntry.parse(progress.repsText[row.key] ?? String(row.reps))
    return PerformedSet(weightKg: weight, reps: entry.isEntered ? entry.reps : row.reps, durationSec: entry.durationSec)
  }

  /// Hàng đủ để tick: có tên bài và có reps hoặc thời gian giữ (`rowReady`).
  public static func isReady(_ row: PlannedSet, _ progress: DayProgress) -> Bool {
    guard !row.exerciseName.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
    let p = performed(row, progress)
    return p.reps > 0 || (p.durationSec ?? 0) > 0
  }

  /// Thời gian nghỉ của hàng: ghi đè trong ngày, không thì theo kế hoạch.
  public static func restSeconds(_ row: PlannedSet, _ progress: DayProgress) -> Int {
    progress.rest[row.key] ?? row.plannedRest
  }

  /// Bài kế tiếp mà quãng nghỉ chuẩn bị cho (RT-12): hàng NGAY SAU trong danh
  /// sách, không phải `ordinal + 1` — set cuối của một bài thì set kế thuộc
  /// bài khác. Hết danh sách thì không bịa ra gì.
  public static func next(after row: PlannedSet, in rows: [PlannedSet]) -> PlannedSet? {
    guard let i = rows.firstIndex(where: { $0.key == row.key }), i + 1 < rows.count else { return nil }
    return rows[i + 1]
  }

  /// Tick / bỏ tick một hàng (`doToggle`, `day-plan.tsx:1118`).
  ///
  /// Trả về việc phải làm với quãng nghỉ:
  /// - tick BẬT một hàng có nghỉ > 0 → bắt đầu nghỉ (RT-1);
  /// - mọi trường hợp khác (bỏ tick, hoặc hàng nghỉ 0) → huỷ quãng nghỉ đang
  ///   chạy, nếu có (RT-2, RT-3: `startRest(null)` của baseline).
  @discardableResult
  public static func toggle(_ row: PlannedSet, _ progress: inout DayProgress) -> RestEvent {
    let ticked = !(progress.done[row.key] ?? false)
    progress.done[row.key] = ticked
    let secs = restSeconds(row, progress)
    return ticked && secs > 0 ? .start(seconds: secs) : .cancel
  }

  /// Chỉnh thời gian nghỉ của một hàng (RT-16): kẹp [0, 600].
  public static func setRest(_ seconds: Int, for row: PlannedSet, _ progress: inout DayProgress) {
    progress.rest[row.key] = RestTimer.clampPlanned(seconds)
  }
}

/// Lưu tiến độ theo ngày: khoá và luật dọn của baseline (`local-date.ts`).
public enum DayProgressStore {
  public static let prefix = "routine-day:"
  /// Giữ hôm nay và 13 ngày trước đó.
  public static let keepDays = 14

  public static func key(date: LocalDate, templateId: String) -> String {
    "\(prefix)\(date):\(templateId)"
  }

  /// Khoá nào đã quá hạn. Ngày THỨ 14 trở về trước là ngoài cửa sổ (`<=`,
  /// không phải `<` — bản `<` từng giữ 15 ngày). Khoá có ngày không đọc được
  /// thì bỏ: đó là dạng của một bản app cũ, không còn gì để mở lại.
  public static func stale(_ keys: [String], today: LocalDate) -> [String] {
    let oldest = today.adding(days: -keepDays)
    return keys.filter { k in
      guard k.hasPrefix(prefix) else { return false }
      let rest = k.dropFirst(prefix.count)
      let datePart = rest.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
      guard let date = LocalDate(datePart) else { return true }
      return date <= oldest
    }
  }
}
