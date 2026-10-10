/// Calo HOẠT ĐỘNG ước lượng của một buổi đã ghi — `lib/energy.ts` @ fac9ac2
/// (+ `trainingMinutes` của `activity.ts:104`, `estimatedMinutes` của
/// `prescription.ts:86`, `restingKcalPerMin` của `fitness-calc.ts:36`), port
/// nguyên văn (#527, bước Core). Golden THẬT: `SessionEnergyGoldenTests`.
///
/// RN behavior (giữ nguyên):
/// - KHÔNG phải dữ liệu lưu: `workout_sessions` không có cột calo; con số tính
///   lúc hiện từ `sets` + `session_rpe` của hàng và hồ sơ (`sessions.tsx:235`).
///   Không đọc `daily_logs.active_kcal` (số theo NGÀY, chỉ Health ghi).
/// - `kcal = Math.round((MET − 1) × BMR/1440 × phút)`; MET theo `RT_MET`
///   (Compendium 2024) chọn bằng RPE 5 / 8 và "có tạ hay không".
/// - thiếu thứ để tính là `nil`, không phải 0: hồ sơ thiếu / ngoài cận
///   (`plausible`), tuổi ngoài 0…130, không có set nào có rep, phút không
///   dương — kể cả `restSeconds` hỏng (`"abc"` → `NaN` phút ở RN → `null`).
///
/// Khác RN có chủ đích (`NATIVE_IMPROVEMENTS.md`):
/// - phần tử `null` trong `sets`: RN đọc `null.reps` là TypeError (màn đỏ);
///   ở đây là một set không có rep — bị bỏ như mọi set không có rep;
/// - kết quả không hữu hạn / ngoài tầm `Int` (rep `"Infinity"`): RN vẽ
///   `~∞ kcal`; ở đây `nil` — không bao giờ hiện một con số không có thật.
///
/// KHÔNG dùng `SessionDetail.trainingMinutes`: hàm ấy cố ý coi nghỉ hỏng là
/// 90 giây (màn chi tiết), còn ở đây phải là `NaN` như RN.
public enum SessionEnergy {
  /// `RT_MET` (`energy.ts:60`) — giữ mã hoạt động của Compendium.
  public enum RTMet {
    /// 02054 — kháng lực, nhiều bài, 8–15 lần ở các mức tạ khác nhau.
    public static let light = 3.5
    /// 02052 — kháng lực, squat/deadlift, chậm hoặc bung sức.
    public static let moderate = 5.0
    /// 02050 — tạ tự do/máy, powerlifting hoặc thể hình, gắng sức mạnh.
    public static let vigorous = 6.0
    /// 02056 — bài dùng trọng lượng cơ thể.
    public static let bodyweight = 3.0
    /// 02057 — bài trọng lượng cơ thể, cường độ cao.
    public static let bodyweightHard = 6.5
  }

  /// `EnergyProfile` (`energy.ts:79`).
  public struct Body: Sendable, Hashable {
    public let weightKg: Double
    public let heightCm: Double
    public let age: Int
    public let sex: FitnessCalc.Sex

    public init(weightKg: Double, heightCm: Double, age: Int, sex: FitnessCalc.Sex) {
      self.weightKg = weightKg
      self.heightCm = heightCm
      self.age = age
      self.sex = sex
    }
  }

  /// `Number(x)` của JS. Như `JS.number`, cộng thêm mảng (`Number([])` = 0,
  /// `Number([7])` = 7, `Number([1, 2])` = NaN) — `sets` là JSONB tự do.
  static func num(_ v: JSONValue?) -> Double {
    guard case .array(let a)? = v else { return JS.number(v) }
    switch a.count {
    case 0: return 0
    case 1:
      switch a[0] {
      case .null: return 0  // String([null]) = ""
      case .bool, .object: return .nan  // "true" / "[object Object]"
      default: return num(a[0])
      }
    default: return .nan
    }
  }

  /// Các phần tử của `sets` nếu nó là mảng (`Array.isArray`), ngược lại rỗng.
  static func setList(_ sets: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = sets { return a }
    return []
  }

  /// `metForSession` (`energy.ts:97`).
  public static func met(sets: [JSONValue], rpe: JSONValue?) -> Double {
    let working = sets.filter { num($0["reps"]) > 0 }
    let loaded = working.contains { num($0["weight"]) > 0 }
    let r = num(rpe)
    let hard = r.isFinite && r >= 8
    if !loaded { return hard ? RTMet.bodyweightHard : RTMet.bodyweight }
    if !r.isFinite || r < 5 { return RTMet.light }
    return hard ? RTMet.vigorous : RTMet.moderate
  }

  /// `trainingMinutes` (`activity.ts:104`) qua `estimatedMinutes`
  /// (`prescription.ts:86`), số học JS: 0 khi không có set có rep; `NaN` khi
  /// một `restSeconds` có mặt mà không phải số (`?? 90` chỉ thay `null`).
  public static func trainingMinutes(_ sets: [JSONValue]) -> Double {
    let real = sets.filter { num($0["reps"]) > 0 }
    if real.isEmpty { return 0 }
    var seconds = 0.0
    for s in real {
      let rest = JS.present(s["restSeconds"]) ? num(s["restSeconds"]) : Double(TemplateDraft.defaultRest)
      seconds += 1 * (num(s["reps"]) * 3 + rest)
    }
    return JS.max(1, JS.round(seconds / 60))
  }

  /// `restingKcalPerMin` (`fitness-calc.ts:36`): BMR (đã làm tròn) / 1440;
  /// cân / cao ngoài `plausible`, tuổi ngoài 0…130, BMR ≤ 0 → `nil`.
  public static func restingKcalPerMin(weightKg: Double, heightCm: Double, age: Int, sex: FitnessCalc.Sex) -> Double? {
    guard weightKg.isFinite, FitnessCalc.weightBounds.contains(weightKg) else { return nil }
    guard heightCm.isFinite, FitnessCalc.heightBounds.contains(heightCm) else { return nil }
    guard age >= 0, age <= 130 else { return nil }
    let bmr = FitnessCalc.bmr(weightKg: weightKg, heightCm: heightCm, age: age, sex: sex)
    return bmr > 0 ? Double(bmr) / 1440 : nil
  }

  /// `sessionActiveKcal` (`energy.ts:114`).
  public static func activeKcal(sets: [JSONValue], rpe: JSONValue?, minutes: Double, body: Body?) -> Int? {
    guard let body else { return nil }
    guard body.weightKg > 0, body.heightCm > 0, body.age > 0 else { return nil }
    guard minutes > 0 else { return nil }
    guard let rest = restingKcalPerMin(weightKg: body.weightKg, heightCm: body.heightCm, age: body.age, sex: body.sex)
    else { return nil }
    let kcal = JS.round((met(sets: sets, rpe: rpe) - 1) * rest * minutes)
    // RN: `Infinity` đi thẳng ra màn (`~∞ kcal`). Ở đây: không có số.
    return kcal.isFinite ? Int(exactly: kcal) : nil
  }

  /// `sessionKcalOf` (`energy.ts:181`): một hàng `workout_sessions` → kcal.
  public static func kcal(sets: JSONValue?, rpe: JSONValue?, body: Body?) -> Int? {
    guard let body else { return nil }
    let list = setList(sets)
    return activeKcal(sets: list, rpe: rpe, minutes: trainingMinutes(list), body: body)
  }

  /// Một hàng lịch sử. `sessionRpe` đã là số nguyên (null / hỏng → 0): cắt
  /// phần lẻ không vượt qua ngưỡng 5 / 8 nào, và 0 rơi đúng nhánh của
  /// `Number(null)` / `NaN` (nhẹ, không gắng) — cùng MET với RN.
  /// Hàng cache trước #428 không có `sets` → `nil` tới lần làm mới.
  public static func kcal(of entry: HistoryEntry, body: Body?) -> Int? {
    guard let sets = entry.sets else { return nil }
    return kcal(sets: sets, rpe: .number(Double(entry.sessionRpe)), body: body)
  }

  // MARK: - Hồ sơ

  /// `energyProfileFrom` (`energy.ts:154`) trên hàng `profiles` thô, với
  /// "hôm nay" tường minh (RN đọc `new Date()` trong `calcAge`).
  public static func body(row: JSONValue?, today: LocalDate) -> Body? {
    guard let row, row != .null else { return nil }
    let weightKg = num(row["weight_kg"])
    let heightCm = num(row["height_cm"])
    // `!row.dob` (thiếu / null / ""), và một `dob` không phải chuỗi thì
    // `${dob}T00:00:00` là Invalid Date → tuổi NaN: cả hai là không có hồ sơ.
    guard weightKg > 0, heightCm > 0, case .string(let dob)? = row["dob"], !dob.isEmpty else { return nil }
    guard let a = age(dob: dob, today: today), a >= 0, a <= 130 else { return nil }
    let sex: FitnessCalc.Sex = row["sex"] == .string("female") ? .female : row["sex"] == .string("male") ? .male : .other
    return Body(weightKg: weightKg, heightCm: heightCm, age: a, sex: sex)
  }

  /// Cùng luật trên mô hình `Profile` đã đọc (cột `dob` là `DATE`, luôn hợp lệ).
  public static func body(profile: Profile?, today: LocalDate) -> Body? {
    guard let profile else { return nil }
    var o: [String: JSONValue] = [:]
    if let w = profile.weightKg { o["weight_kg"] = .number(w) }
    if let h = profile.heightCm { o["height_cm"] = .number(h) }
    if let d = profile.dob { o["dob"] = .string(d.description) }
    if let s = profile.sex { o["sex"] = .string(s) }
    return body(row: .object(o), today: today)
  }

  /// `calcAge(parseLocalDate(dob))`: `new Date(dob + "T00:00:00")` của V8 —
  /// đúng `YYYY-MM-DD` (4-2-2 chữ số), tháng 1…12, ngày 1…31; ngày quá cuối
  /// tháng TRÀN sang tháng sau (`2001-02-29` → 1/3/2001). Khác → `nil` (NaN).
  static func age(dob: String, today: LocalDate) -> Int? {
    let parts = dob.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
      parts.allSatisfy({ $0.unicodeScalars.allSatisfy { $0.value >= 48 && $0.value <= 57 } }),
      var y = Int(parts[0]), var m = Int(parts[1]), var d = Int(parts[2]),
      (1...12).contains(m), (1...31).contains(d)
    else { return nil }
    let dim = LocalDate.daysIn(month: m, year: y)
    if d > dim {
      d -= dim
      m += 1
      if m > 12 {
        m = 1
        y += 1
      }
    }
    var a = today.year - y
    if today.month < m || (today.month == m && today.day < d) { a -= 1 }
    return a
  }
}
