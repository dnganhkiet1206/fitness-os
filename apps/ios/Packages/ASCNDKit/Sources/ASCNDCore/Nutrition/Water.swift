public import Foundation

/// Nước uống (#527 Phase 3) — phép tính thuần, port 1:1 từ RN:
/// `lib/units.ts` (ml ↔ oz), `lib/water-presets.ts`, `lib/water-scale.ts`, và
/// các biểu thức hiển thị của `app/water.tsx` / `components/ascnd/water-chart.tsx`.
///
/// Số được tính ĐÚNG như JS: `Math.round` làm tròn nửa LÊN, `toFixed` chọn số
/// lớn hơn khi hai bên cách đều (`(1.125).toFixed(2)` là "1.13", printf cho
/// "1.12"), và số nguyên in không có ".0". Golden `water-golden.json` sinh từ
/// chính mã RN khoá các phép này (`apps/ios/tools/water-golden`).
public enum Water {
  public typealias Unit = AppPreferences.VolumeUnit

  /// `kind` của outbox: một lần uống → một hàng `water_logs` (`OfflineWrite`
  /// `kind: 'water'`, `applyOfflineWrite` trong `offline-write.ts`).
  public static let addKind = "water"

  /// `Number(profile?.water_target_ml) || 2500` (`water.tsx`).
  public static let defaultTargetMl: Double = 2500

  /// `ML_PER_FLOZ` (`units.ts`) — ounce chất lỏng của Mỹ.
  static let mlPerFloz = 29.5735296

  /// `WATER_QUICK` (`water-presets.ts`): mỗi hệ một bộ số TRÒN của riêng nó,
  /// không quy đổi lẫn nhau.
  public static func quickAmounts(_ unit: Unit) -> [Int] {
    unit == .oz ? [8, 12, 16] : [250, 500, 750]
  }

  /// `MAX_ONE_GO` (`water.tsx`): rào lỗi gõ cho ô nhập tay, theo đơn vị hiển thị.
  public static func maxOneGo(_ unit: Unit) -> Double { unit == .oz ? 68 : 2000 }

  /// `volumeLabel`.
  public static func unitLabel(_ unit: Unit) -> String { unit == .oz ? "oz" : "ml" }

  // MARK: - Số học của JS

  /// `Math.round`: nửa làm tròn LÊN (về +∞). `x - floor(x)` chính xác với mọi
  /// double cỡ này, nên phép so 0.5 đúng như JS.
  static func jsRound(_ x: Double) -> Double {
    let f = x.rounded(.down)
    return x - f >= 0.5 ? f + 1 : f
  }

  /// `Number.prototype.toString` cho số hữu hạn cỡ app này: số nguyên không có
  /// phần lẻ, còn lại là dạng ngắn nhất đọc ngược ra đúng số ấy (như Swift).
  static func jsNumber(_ x: Double) -> String {
    if x == x.rounded(.towardZero), abs(x) < 1e15 { return String(Int64(x)) }
    return "\(x)"
  }

  /// `Number.prototype.toFixed(digits)` cho x ≥ 0: số nguyên n gần x·10^d nhất,
  /// hai bên cách đều thì lấy số LỚN hơn — so trên giá trị đúng của double
  /// (`fma` cho dấu chính xác của x·p − c), không qua printf (printf lấy số chẵn).
  static func jsToFixed(_ x: Double, _ digits: Int) -> String {
    guard x.isFinite, x >= 0 else { return jsNumber(x) }
    var p = 1.0
    for _ in 0..<digits { p *= 10 }
    var n = (x * p).rounded(.down)
    while n > 0, fma(x, p, -n) < 0 { n -= 1 }
    while fma(x, p, -(n + 1)) >= 0 { n += 1 }
    if fma(x, p, -(n + 0.5)) >= 0 { n += 1 }
    let s = String(Int64(n))
    guard digits > 0 else { return s }
    let padded = String(repeating: "0", count: max(0, digits + 1 - s.count)) + s
    return "\(padded.dropLast(digits)).\(padded.suffix(digits))"
  }

  // MARK: - Đơn vị (`units.ts`)

  /// `displayVolume`: ml giữ số nguyên, oz làm tròn một chữ số lẻ.
  public static func displayVolume(_ ml: Double, _ unit: Unit) -> Double {
    unit == .oz ? jsRound(ml / mlPerFloz * 10) / 10 : jsRound(ml)
  }

  /// `volumeToMl`: số người dùng gõ / bấm, theo đơn vị hiển thị → ml nguyên.
  public static func toMl(_ value: Double, _ unit: Unit) -> Int {
    Int(unit == .oz ? jsRound(value * mlPerFloz) : jsRound(value))
  }

  // MARK: - Trục biểu đồ (`water-scale.ts`)

  /// `scaleTop`: trần tròn ≥ cả ngày cao nhất lẫn mục tiêu — bước nửa lít với
  /// ml, 16 oz với oz.
  public static func scaleTop(needMl: Double, _ unit: Unit) -> (ml: Int, display: Double) {
    let step: Double = unit == .oz ? 16 : 500
    let display = max(step, (displayVolume(needMl, unit) / step).rounded(.up) * step)
    return (toMl(display, unit), display)
  }

  /// `axisLabel`: "0", "2L", "1.5L", "48".
  public static func axisLabel(_ v: Double, _ unit: Unit) -> String {
    if v <= 0 { return "0" }
    if unit == .oz { return jsNumber(jsRound(v)) }
    let l = v / 1000
    return "\(l == l.rounded(.towardZero) ? jsNumber(l) : jsToFixed(l, 1))L"
  }

  // MARK: - Màn Nước (`water.tsx`)

  /// `Number(profile?.water_target_ml) || 2500`: thiếu, 0 hay không phải số → 2500.
  public static func target(_ profileTargetMl: Double?) -> Double {
    guard let t = profileTargetMl, t.isFinite, t != 0 else { return defaultTargetMl }
    return t
  }

  /// `Math.min(100, (todayMl / target) * 100)`.
  public static func percent(totalMl: Int, targetMl: Double) -> Double {
    min(100, Double(totalMl) / targetMl * 100)
  }

  /// Số to: "1.80L" hay "61 oz".
  public static func bigValue(totalMl: Int, _ unit: Unit) -> String {
    unit == .oz
      ? "\(jsNumber(displayVolume(Double(totalMl), .oz))) oz" : "\(jsToFixed(Double(totalMl) / 1000, 2))L"
  }

  /// Mục tiêu: "2.5L" hay "85 oz".
  public static func targetLabel(_ targetMl: Double, _ unit: Unit) -> String {
    unit == .oz ? "\(jsNumber(displayVolume(targetMl, .oz))) oz" : "\(jsToFixed(targetMl / 1000, 1))L"
  }

  /// Phần trăm: `{Math.round(pct)}%`.
  public static func percentLabel(_ pct: Double) -> String { "\(jsNumber(jsRound(pct)))%" }

  /// Rào của ô nhập tay trong câu cảnh báo: "2000 ml" / "68 oz" (`${max} ${unitLabel}`).
  public static func limitLabel(_ unit: Unit) -> String { "\(jsNumber(maxOneGo(unit))) \(unitLabel(unit))" }

  /// Một lần uống trong danh sách: `displayVolume(Number(l.amount_ml), vUnit)`.
  public static func entryAmount(_ ml: Int, _ unit: Unit) -> String { jsNumber(displayVolume(Double(ml), unit)) }

  // MARK: - Biểu đồ 7 ngày (`water-chart.tsx`)

  /// `volumeText`: "1.75L" hay "59 oz" (oz làm tròn tới số nguyên).
  public static func chartVolume(_ ml: Double, _ unit: Unit) -> String {
    unit == .oz ? "\(jsNumber(jsRound(displayVolume(ml, .oz)))) oz" : "\(jsToFixed(ml / 1000, 2))L"
  }

  /// Trung bình 7 ngày, kể cả ngày không uống: "1.07L" / "36.2 oz".
  public static func averageLabel(_ days: [WaterDay], _ unit: Unit) -> String {
    let avg = days.isEmpty ? 0 : Double(days.reduce(0) { $0 + $1.totalMl }) / Double(days.count)
    return unit == .oz ? "\(jsNumber(displayVolume(avg, .oz))) oz" : "\(jsToFixed(avg / 1000, 2))L"
  }

  /// Ngày đầu của khung 7 ngày (`useWaterWeek`: hôm nay − 6).
  public static func weekStart(_ today: LocalDate) -> LocalDate { today.adding(days: -6) }

  /// `useWaterWeek`: gộp theo ngày, đúng 7 ngày cũ → mới, ngày không có hàng là 0.
  public static func week(_ rows: [WaterRow], today: LocalDate) -> [WaterDay] {
    var byDate: [LocalDate: Int] = [:]
    for r in rows { byDate[r.date, default: 0] += r.amountMl }
    return (0...6).reversed().map { back in
      let d = today.adding(days: -back)
      return WaterDay(date: d, totalMl: byDate[d] ?? 0)
    }
  }

  // MARK: - Ô nhập tay (`ManualWaterSheet`)

  /// `t.replace(/[^0-9.,]/g, '')` — bàn phím ngoài, dán, IME có thể đưa chữ vào;
  /// `maxLength={6}`.
  public static func sanitize(_ text: String) -> String {
    String(text.filter { "0123456789.,".contains($0) }.prefix(6))
  }

  /// `Number(value.replace(',', '.'))` trên chữ ĐÃ lọc: chỉ dấu phẩy ĐẦU đổi
  /// thành chấm; rỗng là 0; hai dấu thập phân / chỉ một dấu chấm là NaN (`nil`).
  public static func parse(_ text: String) -> Double? {
    var s = text
    if let comma = s.firstIndex(of: ",") { s.replaceSubrange(comma...comma, with: ".") }
    if s.isEmpty { return 0 }
    guard !s.contains(","), s.filter({ $0 == "." }).count <= 1 else { return nil }
    let parts = s.split(separator: ".", omittingEmptySubsequences: false)
    let whole = parts[0], frac = parts.count > 1 ? parts[1] : ""
    guard !(whole.isEmpty && frac.isEmpty) else { return nil }
    return Double("\(whole.isEmpty ? "0" : whole).\(frac.isEmpty ? "0" : frac)")
  }

  /// Kết quả của ô nhập tay: lưu được không, và có quá rào không (câu cảnh báo).
  public struct ManualCheck: Sendable, Hashable {
    public let amount: Double?
    public let valid: Bool
    public let tooMuch: Bool
  }

  /// `valid = finite && > 0 && <= max`, `tooMuch = finite && > max` — quá rào thì
  /// nói ra và không lưu, không lặng lẽ cắt về rào.
  public static func check(_ text: String, _ unit: Unit) -> ManualCheck {
    let amount = parse(text)
    let max = maxOneGo(unit)
    guard let a = amount, a.isFinite else { return ManualCheck(amount: nil, valid: false, tooMuch: false) }
    return ManualCheck(amount: a, valid: a > 0 && a <= max, tooMuch: a > max)
  }

  // MARK: - Hàng outbox

  /// Một lần uống, như `useAddWater`: `rowId` chọn lúc chạm (khoá chính — phát
  /// lại sau khi mất phản hồi không thành hàng thứ hai), ngày đọc lúc chạm.
  public static func entry(
    id: String, userId: String, amountMl: Int, date: LocalDate, at: EpochMillis, createdAt: EpochMillis
  ) -> OutboxEntry {
    let id = id.lowercased()
    return OutboxEntry(
      id: id, userId: userId, kind: addKind,
      payload: .object([
        "id": .string(id), "user_id": .string(userId), "amount_ml": .number(Double(amountMl)),
        "date": .string(date.description), "logged_at": .string(WorkoutSessionRecord.iso8601(at)),
      ]),
      createdAt: createdAt)
  }

  /// Lần uống chưa tới server, đọc lại từ hàng outbox.
  public static func pendingLog(_ e: OutboxEntry) -> (log: WaterLog, row: WaterRow)? {
    guard e.kind == addKind, let id = e.payload["id"]?.stringValue?.lowercased(),
      let ml = e.payload["amount_ml"]?.intValue,
      let date = e.payload["date"]?.stringValue.flatMap({ LocalDate($0) }),
      let at = e.payload["logged_at"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return nil }
    return (WaterLog(id: id, amountMl: ml, loggedAt: at, createdAt: nil, pending: true),
            WaterRow(id: id, date: date, amountMl: ml))
  }

  /// `newestFirst`: `logged_at` ↓, `created_at` ↓, `id` ↓ — MỘT thứ tự cho cả
  /// danh sách lẫn lệnh tìm lần cần bỏ (#134). Hàng chưa tới server chưa có
  /// `created_at` (server mới đặt): coi như mới nhất ở mốc của nó.
  public static func newestFirst(_ logs: [WaterLog]) -> [WaterLog] {
    logs.sorted { a, b in
      if a.loggedAt != b.loggedAt { return a.loggedAt > b.loggedAt }
      let ca = a.createdAt?.millis ?? .max, cb = b.createdAt?.millis ?? .max
      if ca != cb { return ca > cb }
      return a.id > b.id
    }
  }
}

/// Một lần uống trong ngày (`select id, amount_ml, logged_at, created_at`).
public struct WaterLog: Sendable, Hashable, Codable, Identifiable {
  public let id: String
  public let amountMl: Int
  public let loggedAt: EpochMillis
  public let createdAt: EpochMillis?
  /// Còn trong outbox — server chưa thấy.
  public let pending: Bool

  public init(id: String, amountMl: Int, loggedAt: EpochMillis, createdAt: EpochMillis?, pending: Bool = false) {
    self.id = id.lowercased()
    self.amountMl = amountMl
    self.loggedAt = loggedAt
    self.createdAt = createdAt
    self.pending = pending
  }

  /// Một hàng của server; thiếu cột / sai kiểu thì bỏ (không đoán số).
  public init?(row: JSONValue) {
    guard let id = row["id"]?.stringValue, let ml = Self.int(row["amount_ml"]),
      let at = row["logged_at"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return nil }
    self.init(
      id: id, amountMl: ml, loggedAt: at, createdAt: row["created_at"]?.stringValue.flatMap { EpochMillis(iso8601: $0) })
  }

  /// `Number(r.amount_ml)`: cột `INTEGER`, PostgREST trả số; chuỗi số cũng nhận.
  static func int(_ v: JSONValue?) -> Int? {
    if let i = v?.intValue { return i }
    return v?.stringValue.flatMap { Int($0) }
  }
}

/// Một hàng cho khung 7 ngày (`select id, date, amount_ml`). `id` để không cộng
/// hai lần một lần uống vừa tới server mà outbox chưa kịp xoá.
public struct WaterRow: Sendable, Hashable, Codable {
  public let id: String
  public let date: LocalDate
  public let amountMl: Int

  public init(id: String, date: LocalDate, amountMl: Int) {
    self.id = id.lowercased()
    self.date = date
    self.amountMl = amountMl
  }

  public init?(row: JSONValue) {
    guard let id = row["id"]?.stringValue, let ml = WaterLog.int(row["amount_ml"]),
      let date = row["date"]?.stringValue.flatMap({ LocalDate($0) })
    else { return nil }
    self.init(id: id, date: date, amountMl: ml)
  }
}

/// Tổng một ngày của biểu đồ.
public struct WaterDay: Sendable, Hashable, Codable {
  public let date: LocalDate
  public let totalMl: Int

  public init(date: LocalDate, totalMl: Int) {
    self.date = date
    self.totalMl = totalMl
  }
}
