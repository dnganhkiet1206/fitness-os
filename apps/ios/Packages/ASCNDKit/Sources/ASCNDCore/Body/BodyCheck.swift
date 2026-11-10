public import Foundation
public import Observation

/// Đo cơ thể bằng AI trong Ảnh tiến trình (Kiệt duyệt 04/11): hàm `body-check` ước tính tỉ lệ mỡ của
/// MỘT ảnh và ghi `body_checks` (một kết quả mỗi ảnh). Là ước tính từ ảnh: luôn có khoảng thấp–cao và
/// độ tin, app hiện "~18 %" chứ không phải "18 %".
public enum BodyCheck {
  public static let table = "body_checks"

  public enum Confidence: String, Sendable, Hashable { case low, medium, high }

  public struct Result: Sendable, Hashable {
    public let photoId: String
    public let date: LocalDate?
    public let pct: Double
    public let low: Double
    public let high: Double
    public let confidence: Confidence
    public let note: String

    public init(photoId: String, date: LocalDate?, pct: Double, low: Double, high: Double, confidence: Confidence, note: String) {
      self.photoId = photoId
      self.date = date
      self.pct = pct
      self.low = low
      self.high = high
      self.confidence = confidence
      self.note = note
    }
  }

  public static func result(_ row: JSONValue) -> Result? {
    guard let photo = row["photo_id"]?.stringValue, let pct = number(row["body_fat_pct"]),
      let low = number(row["body_fat_low"]), let high = number(row["body_fat_high"])
    else { return nil }
    return Result(
      photoId: photo.lowercased(), date: row["date"]?.stringValue.flatMap(LocalDate.init), pct: pct, low: low,
      high: high, confidence: Confidence(rawValue: row["confidence"]?.stringValue ?? "") ?? .low,
      note: row["note"]?.stringValue ?? "")
  }

  /// PostgREST trả `numeric` là chuỗi hay số tuỳ cấu hình — nhận cả hai.
  static func number(_ v: JSONValue?) -> Double? {
    if let d = v?.doubleValue { return d }
    if let s = v?.stringValue { return Double(s) }
    return nil
  }

  /// "~18 %" — làm tròn số nguyên, có dấu ước tính.
  public static func label(_ r: Result) -> String { "~\(Int(r.pct.rounded()))%" }

  /// Số điền sẵn vào ô "Mỡ cơ thể (%)" của Số đo khi người dùng chọn "Ghi vào Số đo" (09/11):
  /// số giữa làm tròn như nhãn "~18 %" — ước tính từ ảnh không có độ chính xác đến phần mười.
  public static func measurementText(_ r: Result) -> String { "\(Int(r.pct.rounded()))" }

  /// "16–21 %".
  public static func range(_ r: Result) -> String { "\(Int(r.low.rounded()))–\(Int(r.high.rounded()))%" }

  /// Xu hướng theo ngày (cũ → mới, mỗi ngày một số — số giữa của các ảnh ngày ấy). Cần ít nhất hai ngày.
  public struct Trend: Sendable, Hashable {
    public let points: [(date: LocalDate, pct: Double)]
    /// Mới nhất trừ cũ nhất, điểm %.
    public let change: Double

    public static func == (a: Trend, b: Trend) -> Bool {
      a.change == b.change && a.points.map(\.date) == b.points.map(\.date) && a.points.map(\.pct) == b.points.map(\.pct)
    }
    public func hash(into h: inout Hasher) { h.combine(change) }
  }

  public static func trend(_ results: [Result]) -> Trend? {
    var byDay: [LocalDate: [Double]] = [:]
    for r in results { if let d = r.date { byDay[d, default: []].append(r.pct) } }
    let points = byDay.keys.sorted().map { d in (date: d, pct: byDay[d]!.reduce(0, +) / Double(byDay[d]!.count)) }
    guard points.count >= 2, let first = points.first, let last = points.last else { return nil }
    return Trend(points: points, change: ((last.pct - first.pct) * 10).rounded() / 10)
  }

  public enum Outcome: Sendable, Hashable {
    case measured(Result)
    /// Ảnh không thấy rõ thân người (tối, xa, không phải người): mời chụp lại, không ghi gì.
    case notBody
    case failed(EdgeFunction.Failure)
  }
}

/// Kết quả đo của một người: đọc `body_checks`, đo một ảnh qua `body-check`.
@MainActor
@Observable
public final class BodyChecksBook {
  public let userId: String
  public private(set) var results: [String: BodyCheck.Result] = [:]
  /// Ảnh đang đo.
  public private(set) var measuring: Set<String> = []
  private let store: any RowStore
  private let edge: any EdgeCaller

  public init(userId: String, store: any RowStore, edge: any EdgeCaller) {
    self.userId = userId
    self.store = store
    self.edge = edge
  }

  public var trend: BodyCheck.Trend? { BodyCheck.trend(Array(results.values)) }

  public func result(for photoId: String) -> BodyCheck.Result? { results[photoId.lowercased()] }

  /// Đọc hỏng thì giữ kết quả cũ (nhãn trên ảnh chỉ là phần thêm, không chặn màn ảnh).
  public func load() async {
    let q = RowQuery(
      table: BodyCheck.table, columns: "photo_id, date, body_fat_pct, body_fat_low, body_fat_high, confidence, note",
      filters: [.eq("user_id", .string(userId))], order: .init(column: "date", ascending: true), limit: 500)
    guard let rows = try? await store.select(q) else { return }
    var out: [String: BodyCheck.Result] = [:]
    for r in rows.compactMap(BodyCheck.result) { out[r.photoId] = r }
    results = out
  }

  /// Đo một ảnh (JPEG ở máy). `hints`: giới tính / cao / cân từ hồ sơ để AI đặt khoảng hợp lý.
  public func measure(
    photoId: String, jpeg: Data, lang: String, sex: String?, heightCm: Double?, weightKg: Double?
  ) async -> BodyCheck.Outcome {
    let id = photoId.lowercased()
    guard !measuring.contains(id) else { return .failed(.unknown) }
    measuring.insert(id)
    defer { measuring.remove(id) }
    var body: [String: JSONValue] = [
      "photo_id": .string(id), "image_base64": .string(jpeg.base64EncodedString()), "lang": .string(lang),
    ]
    if let sex { body["sex"] = .string(sex) }
    if let heightCm { body["height_cm"] = .number(heightCm) }
    if let weightKg { body["weight_kg"] = .number(weightKg) }
    do throws(EdgeFunction.Failure) {
      let reply = try await edge.call(.bodyCheck, body: body)
      guard reply?["ok"]?.boolValue == true else { return .notBody }
      guard let row = reply?["check"], let r = BodyCheck.result(row) else { return .failed(.unknown) }
      results[r.photoId] = r
      return .measured(r)
    } catch {
      return .failed(error)
    }
  }
}
