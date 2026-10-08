public import Foundation
public import Observation

/// Thẻ sẵn sàng (#527 Phase 4/9) — phần trình bày của `readiness-gauge.tsx`,
/// `lib/readiness-i18n.ts`, `lib/training-card.ts` (`acwrZone`,
/// `loadComparison`, `latestAcwr`) @ fac9ac2. Golden: `readiness-card-golden.json`
/// (`tools/insights-golden/gen-readiness.mjs`, sinh bằng CHÍNH mã RN).
///
/// Không tính lại điểm: điểm, trạng thái, token giải thích, khoá lời khuyên và
/// ACWR là những gì `ReadinessEngine` (#552) đã ghi vào `daily_logs`. Ở đây chỉ
/// ĐỌC và dịch chúng ra chữ (render-by-key), như RN.
public enum ReadinessCard {
  // MARK: - Chữ (render-by-key)

  /// Câu chữ chép máy từ `readiness-i18n.ts` (`readiness-copy.json`,
  /// `tools/readiness-copy/gen.mjs --check`).
  public struct Copy: Sendable, Hashable, Decodable {
    public struct Factor: Sendable, Hashable, Decodable {
      public let label: [String: String]
      public let low: [String: String]
      public let mid: [String: String]
      public let high: [String: String]
    }

    /// `READINESS_RECO`: khoá lời khuyên → vi / en / es.
    public let reco: [String: [String: String]]
    /// `FACTOR_LABEL` + `FACTOR_IMPACT` theo chiều (`hrv`, `rhr`, `sleep`, `load`).
    public let factors: [String: Factor]

    public init(reco: [String: [String: String]], factors: [String: Factor]) {
      self.reco = reco
      self.factors = factors
    }
  }

  /// Một chiều trong `readiness_explain` (`hrv:62|sleep:80|…`).
  public struct Factor: Sendable, Hashable {
    public let key: String
    public let score: Double
  }

  /// `parseFactors`: tách theo `|` rồi `:`; giữ chiều có nhãn và số đọc được
  /// (`Number(x)` của JS — chuỗi rỗng là 0). Giữ cả chiều trùng, theo thứ tự.
  public static func factors(_ stored: String, copy: Copy) -> [Factor] {
    stored.split(separator: "|", omittingEmptySubsequences: false).compactMap { part in
      let bits = part.split(separator: ":", omittingEmptySubsequences: false)
      guard bits.count >= 2, copy.factors[String(bits[0])] != nil,
        let score = ProfileForm.jsNumber(String(bits[1])), !score.isNaN
      else { return nil }
      return Factor(key: String(bits[0]), score: score)
    }
  }

  /// `readinessRecoText`: trống → ""; khoá lạ (văn xuôi cũ) → giữ nguyên.
  public static func recoText(_ stored: String?, lang: AppPreferences.Lang, copy: Copy) -> String {
    guard let stored, !stored.isEmpty else { return "" }
    return copy.reco[stored]?[lang.rawValue] ?? stored
  }

  /// `readinessExplainText`: hai chiều THẤP nhất, "Nhãn: mức (n)", nối " · ".
  /// Không chiều nào đọc được → văn xuôi cũ, giữ nguyên.
  public static func explainText(_ stored: String?, lang: AppPreferences.Lang, copy: Copy) -> String {
    guard let stored, !stored.isEmpty else { return "" }
    let parts = factors(stored, copy: copy)
    if parts.isEmpty { return stored }
    // `sort((a, b) => a.score - b.score)` — sort của JS ổn định.
    let top2 = parts.enumerated().sorted { a, b in
      a.element.score != b.element.score ? a.element.score < b.element.score : a.offset < b.offset
    }.prefix(2).map(\.element)
    return top2.map { p in
      let f = copy.factors[p.key]!
      let impact = p.score < 40 ? f.low : p.score > 70 ? f.high : f.mid
      return "\(f.label[lang.rawValue] ?? p.key): \(impact[lang.rawValue] ?? "") (\(jsRoundText(p.score)))"
    }.joined(separator: " · ")
  }

  /// `readinessSubscores`: chiều → điểm làm tròn; chiều trùng thì chiều SAU thắng.
  public static func subscores(_ stored: String?, copy: Copy) -> [String: Int] {
    guard let stored, !stored.isEmpty else { return [:] }
    var out: [String: Int] = [:]
    for p in factors(stored, copy: copy) { out[p.key] = jsRound(p.score) }
    return out
  }

  /// `hasRecoverySignal`: có ít nhất một trong HRV / RHR / giấc ngủ.
  public static func hasRecoverySignal(_ stored: String?, copy: Copy) -> Bool {
    let subs = subscores(stored, copy: copy)
    return ["hrv", "rhr", "sleep"].contains { subs[$0] != nil }
  }

  /// `Math.round` (nửa lên, kể cả số âm: −0.5 → −0).
  static func jsRound(_ v: Double) -> Int { Int((v + 0.5).rounded(.down)) }
  static func jsRoundText(_ v: Double) -> String { String(jsRound(v)) }

  // MARK: - Ô con, độ tin cậy

  /// Màu ô con (`readiness-gauge.tsx:313`).
  public enum Tone: String, Sendable, Hashable { case green, yellow, red, muted }

  public static func tone(subscore v: Int) -> Tone { v >= 70 ? .green : v >= 40 ? .yellow : .red }

  /// Vì sao một ô còn trống — nói việc sẽ lấp nó (`NEED`).
  public enum Need: String, Sendable, Hashable {
    /// HRV / RHR: cần 5 lần đo (nền của chính người dùng).
    case readings
    /// Giấc ngủ: chưa ghi đêm qua.
    case night
    /// Tải tập / ACWR: chưa ghi buổi tập.
    case session
  }

  public struct Tile: Sendable, Hashable {
    public enum Kind: String, Sendable, Hashable { case hrv, rhr, sleep, load, acwr }
    public let kind: Kind
    /// `nil` = ô trống (`—`).
    public let subscore: Int?
    public let acwr: Double?
    public let need: Need?
    public let tone: Tone
    public let zone: AcwrZone?
  }

  /// Năm ô theo thứ tự CỐ ĐỊNH (HRV, RHR, SLEEP, LOAD, ACWR); ô thiếu vẫn ở
  /// đúng chỗ, nói việc sẽ lấp nó. ACWR: `!= null` (0 là một tuần nghỉ thật).
  public static func tiles(subscores subs: [String: Int], acwr: Double?) -> [Tile] {
    func sub(_ kind: Tile.Kind, _ need: Need) -> Tile {
      if let v = subs[kind.rawValue] {
        return Tile(kind: kind, subscore: v, acwr: nil, need: nil, tone: tone(subscore: v), zone: nil)
      }
      return Tile(kind: kind, subscore: nil, acwr: nil, need: need, tone: .muted, zone: nil)
    }
    let acwrTile: Tile =
      if let acwr {
        Tile(kind: .acwr, subscore: nil, acwr: acwr, need: nil, tone: zone(acwr).tone, zone: zone(acwr))
      } else {
        Tile(kind: .acwr, subscore: nil, acwr: nil, need: .session, tone: .muted, zone: nil)
      }
    return [sub(.hrv, .readings), sub(.rhr, .readings), sub(.sleep, .night), sub(.load, .session), acwrTile]
  }

  /// Dòng độ tin cậy: số chiều ĐO ĐƯỢC (`Object.keys(subs).length`) và mức của
  /// engine; `nil` khi chưa đo được gì. Màn ẩn dòng này khi `.high`.
  public static func confidence(subscores subs: [String: Int]) -> (measured: Int, level: ReadinessResult.Confidence)? {
    subs.isEmpty ? nil : (subs.count, ReadinessEngine.confidence(subs.count))
  }

  // MARK: - ACWR (`training-card.ts`)

  public enum AcwrZone: String, Sendable, Hashable, CaseIterable {
    case detraining, low, optimal, elevated, spike

    /// `ACWR_TINT` (`acwr-tint.ts`).
    public var tone: Tone {
      switch self {
      case .detraining, .spike: .red
      case .low, .elevated: .yellow
      case .optimal: .green
      }
    }

    /// `ACWR_BANDS[].label`.
    public var band: String {
      switch self {
      case .detraining: "< 0.65"
      case .low: "0.65 – 0.8"
      case .optimal: "0.8 – 1.3"
      case .elevated: "1.3 – 1.6"
      case .spike: "> 1.6"
      }
    }
  }

  /// `acwrZone`: 0.8–1.3 tối ưu; [0.65, 0.8) hơi thưa; (1.3, 1.6] tăng nhanh;
  /// < 0.65 mất nền; còn lại (> 1.6, NaN) quá tải.
  public static func zone(_ acwr: Double) -> AcwrZone {
    if acwr >= 0.8 && acwr <= 1.3 { return .optimal }
    if acwr >= 0.65 && acwr < 0.8 { return .low }
    if acwr > 1.3 && acwr <= 1.6 { return .elevated }
    if acwr < 0.65 { return .detraining }
    return .spike
  }

  /// `loadComparison`: tuần này nặng / nhẹ hơn thói quen bao nhiêu phần trăm.
  public static func loadComparison(_ acwr: Double) -> (heavier: Bool, percent: Int) {
    (acwr >= 1, jsRound(abs(acwr - 1) * 100))
  }

  /// `latestAcwr`: ACWR của hàng MỚI NHẤT có số đọc được.
  public static func latestAcwr(_ rows: [JSONValue]) -> Double? {
    var best: (date: String, acwr: Double)?
    for r in rows {
      guard let raw = r["acwr"], raw != .null, let v = number(raw), v.isFinite else { continue }
      let d = r["date"]?.stringValue ?? ""
      if best == nil || d > best!.date { best = (d, v) }
    }
    return best?.acwr
  }

  /// `Number(x)` cho một ô JSON (số, hoặc chuỗi số của cột `numeric`).
  static func number(_ v: JSONValue) -> Double? {
    switch v {
    case .number(let n): n
    case .string(let s): ProfileForm.jsNumber(s)
    case .bool(let b): b ? 1 : 0
    default: nil
    }
  }

  // MARK: - Một ngày

  /// Một hàng `daily_logs` hôm nay, phần thẻ đọc.
  public struct Day: Sendable, Hashable {
    /// `Math.round(readiness_score)`; `nil` = chưa đủ dữ liệu.
    public let score: Int?
    /// `readiness_status`, mặc định vàng (`?? 'yellow'`).
    public let status: ReadinessResult.Status
    public let explain: String?
    public let recommendation: String?
    public let acwr: Double?

    public init(row: JSONValue?) {
      let s = row?["readiness_score"].flatMap { $0 == .null ? nil : ReadinessCard.number($0) }
      score = s.flatMap { $0.isFinite ? ReadinessCard.jsRound($0) : nil }
      status = row?["readiness_status"]?.stringValue.flatMap(ReadinessResult.Status.init(rawValue:)) ?? .yellow
      explain = row?["readiness_explain"]?.stringValue
      recommendation = row?["readiness_recommendation"]?.stringValue
      acwr = row?["acwr"].flatMap { $0 == .null ? nil : ReadinessCard.number($0) }.flatMap { $0.isFinite ? $0 : nil }
    }
  }

  /// Cột thẻ đọc của `daily_logs` (RN đọc `select('*')`; ở đây chỉ phần cần).
  public static let columns = "readiness_score, readiness_status, readiness_explain, readiness_recommendation, acwr"

  public static func query(userId: String, date: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: columns,
      filters: [.eq("user_id", .string(userId)), .eq("date", .string(date.description))], mode: .maybeSingle)
  }
}

/// Thẻ sẵn sàng của MỘT tài khoản cho một ngày. Đóng khi phiên đổi — kết quả
/// về sau không được áp.
@MainActor @Observable
public final class ReadinessBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    /// Đọc được, chưa có điểm (`dashReadinessMsg`).
    case empty
    case ready(ReadinessCard.Day)
  }

  public let userId: String
  public private(set) var date: LocalDate
  public private(set) var phase: Phase = .loading

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private var closed = false

  public init(userId: String, date: LocalDate, store: any RowStore) {
    self.userId = userId
    self.date = date
    self.store = store
  }

  public func close() { closed = true }

  /// Đọc (lại) hàng của `date`. Lỗi khi đã có số thì giữ số cũ.
  public func load() async {
    let q = ReadinessCard.query(userId: userId, date: date)
    let store = self.store
    do {
      let rows = try await store.select(q)
      guard !closed else { return }
      let day = ReadinessCard.Day(row: rows.first)
      phase = day.score == nil ? .empty : .ready(day)
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      // `RowStoreError` (#552) không mang cờ mất mạng — báo chung, có nút thử lại.
      _ = error
      phase = .failed(.unavailable)
    }
  }

  /// Qua nửa đêm: đổi ngày rồi đọc lại.
  public func move(to date: LocalDate) async {
    guard date != self.date else { return }
    self.date = date
    phase = .loading
    await load()
  }
}
