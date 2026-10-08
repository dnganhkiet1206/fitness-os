public import Foundation
public import Observation

/// Màn sinh trắc học (#527) — `app/biometrics.tsx` + `hooks/use-biometrics.ts`
/// @ fac9ac2: 14 ngày lần đo của CHÍNH tài khoản, mỗi chỉ số một thẻ (giá trị
/// mới nhất, chấm trạng thái, đường xu hướng), danh sách lần đo mới → cũ và
/// lối xoá một lần đo gõ sai.
///
/// Logic ở đây, chữ ở view: nhãn / đơn vị dịch nằm trong xcstrings, Core chỉ
/// nói chỉ số nào, giá trị nào, trạng thái nào.
public enum Biometrics {
  /// `useBiometricHistory(14)`.
  public static let historyDays = 14

  /// Một hàng `biometric_samples`.
  public struct Sample: Sendable, Hashable, Identifiable {
    public let id: String
    public let at: EpochMillis
    public let source: String
    public let hr: Double?
    public let hrvRmssd: Double?
    public let hrvSdnn: Double?
    public let spo2: Double?
    public let vo2max: Double?
    public let resp: Double?
    public let soreness: Double?
    public let illness: Bool

    public init(
      id: String, at: EpochMillis, source: String = "manual", hr: Double? = nil, hrvRmssd: Double? = nil,
      hrvSdnn: Double? = nil, spo2: Double? = nil, vo2max: Double? = nil, resp: Double? = nil,
      soreness: Double? = nil, illness: Bool = false
    ) {
      self.id = id
      self.at = at
      self.source = source
      self.hr = hr
      self.hrvRmssd = hrvRmssd
      self.hrvSdnn = hrvSdnn
      self.spo2 = spo2
      self.vo2max = vo2max
      self.resp = resp
      self.soreness = soreness
      self.illness = illness
    }

    /// Hàng không có `id` hoặc `date_time` đọc được thì bỏ — không vẽ được, không xoá được.
    public init?(row: JSONValue) {
      guard let id = row["id"]?.stringValue ?? row["id"]?.doubleValue.map({ String(Int($0)) }),
        let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
      else { return nil }
      func n(_ k: String) -> Double? {
        switch row[k] {
        case .number(let v)?: v
        case .string(let s)?: Double(s)
        default: nil
        }
      }
      self.init(
        id: id, at: at, source: row["source"]?.stringValue ?? "", hr: n("hr_bpm"), hrvRmssd: n("hrv_rmssd_ms"),
        hrvSdnn: n("hrv_sdnn_ms"), spo2: n("spo2_pct"), vo2max: n("vo2max_mlkgmin"), resp: n("resp_rate_rpm"),
        soreness: n("soreness_1_10"), illness: row["illness_flag"] == .bool(true))
    }
  }

  public static let columns =
    "id, date_time, source, hr_bpm, hrv_rmssd_ms, hrv_sdnn_ms, spo2_pct, vo2max_mlkgmin, resp_rate_rpm, soreness_1_10, illness_flag"

  /// `since.setDate(since.getDate() - days)`: lùi `days` ngày LỊCH ở múi máy,
  /// giữ giờ hiện tại (đúng cả ngày đổi giờ).
  public static func since(now: EpochMillis, days: Int = historyDays, in tz: TimeZone) -> EpochMillis {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    guard let d = cal.date(byAdding: .day, value: -days, to: now.date) else {
      return now - Int64(days) * 86_400_000
    }
    return EpochMillis(d)
  }

  /// Lọc `user_id` của phiên, cũ → mới (biểu đồ vẽ trái sang phải).
  public static func query(userId: String, since: EpochMillis) -> RowQuery {
    RowQuery(
      table: "biometric_samples", columns: columns,
      filters: [.eq("user_id", .string(userId)), .gte("date_time", .string(WorkoutSessionRecord.iso8601(since)))],
      order: RowQuery.Order(column: "date_time", ascending: true))
  }

  // MARK: - Chỉ số

  public enum Metric: String, Sendable, Hashable, CaseIterable {
    case hr, hrvSdnn, hrv, spo2, vo2max, resp, soreness

    /// Khoảng "tốt" — chấm xanh khi giá trị mới nhất nằm trong.
    public var range: ClosedRange<Double> {
      switch self {
      case .hr: 50...100
      case .hrvSdnn, .hrv: 20...100
      case .spo2: 95...100
      case .vo2max: 30...60
      case .resp: 12...20
      case .soreness: 1...10
      }
    }

    public func value(_ s: Sample) -> Double? {
      switch self {
      case .hr: s.hr
      case .hrvSdnn: s.hrvSdnn
      case .hrv: s.hrvRmssd
      case .spo2: s.spo2
      case .vo2max: s.vo2max
      case .resp: s.resp
      case .soreness: s.soreness
      }
    }
  }

  /// Hai loại HRV, và CHỈ loại bạn thật có: SDNN (Apple Watch) và RMSSD (dây
  /// đeo, ô nhập tay) không đổi qua lại được, nên mỗi loại một thẻ — nhưng thẻ
  /// rỗng mãi với tên chỉ số chưa ai nghe là tệ hơn. Chưa có lần đo nào: RMSSD
  /// đứng (ô nhập tay ghi vào đó).
  public static func metrics(_ samples: [Sample]) -> [Metric] {
    let hasSdnn = samples.contains { $0.hrvSdnn != nil }
    let hasRmssd = samples.contains { $0.hrvRmssd != nil }
    let (sdnn, rmssd) = !hasSdnn && !hasRmssd ? (false, true) : (hasSdnn, hasRmssd)
    return Metric.allCases.filter { m in
      switch m {
      case .hrvSdnn: sdnn
      case .hrv: rmssd
      default: true
      }
    }
  }

  /// Nhãn thẻ RMSSD: "HRV · RMSSD" khi có cả SDNN, còn lại chỉ "HRV".
  public static func rmssdQualified(_ samples: [Sample]) -> Bool {
    metrics(samples).contains(.hrvSdnn)
  }

  public struct Point: Sendable, Hashable {
    public let at: EpochMillis
    public let value: Double
  }

  public static func series(_ m: Metric, _ samples: [Sample]) -> [Point] {
    samples.compactMap { s in m.value(s).map { Point(at: s.at, value: $0) } }
  }

  public enum Status: String, Sendable, Hashable { case good, warn, bad }

  /// `statusOf`: trong khoảng → tốt; lệch không quá 15% bề rộng → cảnh báo; còn lại → xấu.
  public static func status(_ v: Double, _ r: ClosedRange<Double>) -> Status {
    if v >= r.lowerBound && v <= r.upperBound { return .good }
    let margin = (r.upperBound - r.lowerBound) * 0.15
    if v >= r.lowerBound - margin && v <= r.upperBound + margin { return .warn }
    return .bad
  }

  /// `Math.round(latest * 10) / 10` rồi `String(n)` của JS.
  public static func display(_ v: Double) -> String {
    Units.text(JS.round(v * 10) / 10)
  }

  // MARK: - Danh sách lần đo

  /// Một phần đã đo của một lần đo, theo thứ tự `summarise`.
  public enum Part: Sendable, Hashable {
    case rhr(String), sdnn(String), rmssd(String), spo2(String), resp(String), vo2max(String)
  }

  /// `summarise`: chỉ những gì đã thật sự đo, số in như JS in.
  public static func parts(_ s: Sample) -> [Part] {
    var out: [Part] = []
    if let v = s.hr { out.append(.rhr(Units.text(v))) }
    if let v = s.hrvSdnn { out.append(.sdnn(Units.text(v))) }
    if let v = s.hrvRmssd { out.append(.rmssd(Units.text(v))) }
    if let v = s.spo2 { out.append(.spo2(Units.text(v))) }
    if let v = s.resp { out.append(.resp(Units.text(v))) }
    if let v = s.vo2max { out.append(.vo2max(Units.text(v))) }
    return out
  }

  /// `localStampStr`: `YYYY-MM-DD HH:MM` ở múi MÁY, 24 giờ — không cắt chuỗi UTC.
  public static func stamp(_ t: EpochMillis, in tz: TimeZone) -> String {
    let day = LocalDate(t, in: tz)
    let offset = Int64(tz.secondsFromGMT(for: t.date)) * 1000
    let local = t.millis + offset
    let dayMs: Int64 = 86_400_000
    let inDay = ((local % dayMs) + dayMs) % dayMs
    let minutes = Int(inDay / 60_000)
    return String(format: "%@ %02d:%02d", day.description, minutes / 60, minutes % 60)
  }

  /// Xoá lần đo ở ngày `day` → dựng lại ngày ấy VÀ hôm nay (cửa sổ nền 28 ngày
  /// của hôm nay chứa ngày ấy), như `useDeleteBiometricSample`.
  public static func rebuildDays(sampleAt: EpochMillis, now: EpochMillis, in tz: TimeZone) -> [LocalDate] {
    let day = LocalDate(sampleAt, in: tz)
    let today = LocalDate(now, in: tz)
    return day == today ? [day] : [day, today]
  }
}

/// Lệnh xoá một lần đo — `RowStore` (#552) chưa có động từ xoá, nên đây là một
/// cổng riêng, hẹp: chỉ một bảng, lọc `id` VÀ `user_id`, trả số hàng đã chạm.
public protocol BiometricsRemover: Sendable {
  func deleteSample(id: String, userId: String) async throws(RowStoreError) -> Int
}

/// Sổ sinh trắc học của một tài khoản.
@MainActor
@Observable
public final class BiometricsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    /// Đọc được, chưa có lần đo nào.
    case empty
    /// Cũ → mới.
    case ready([Biometrics.Sample])
  }

  public enum DeleteOutcome: Sendable, Hashable {
    case deleted
    /// Không hàng nào bị xoá (`nCxNothingWrittenBiometric`) — có lẽ đã xoá ở máy khác.
    case nothingWritten
    /// Xoá không được; hàng còn nguyên.
    case failed
    /// Đã xoá, nhưng dựng lại điểm hỏng — KHÔNG được trông như đã xong.
    case rebuildFailed
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Một lệnh xoá đang chạy — nút xoá khoá lại (`remove.isPending`).
  public private(set) var deleting = false

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let remover: any BiometricsRemover
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var closed = false

  public init(
    userId: String, store: any RowStore, remover: any BiometricsRemover, clock: any WallClock = SystemWallClock(),
    timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.store = store
    self.remover = remover
    self.clock = clock
    self.timeZone = timeZone
  }

  public func close() { closed = true }

  /// Mới → cũ: lần đo người ta muốn rút lại gần như luôn là lần vừa nhập.
  public var newestFirst: [Biometrics.Sample] {
    if case .ready(let s) = phase { return s.reversed() }
    return []
  }

  /// Đọc (lại). Lỗi khi đã có số thì giữ số cũ; lỗi khi chưa có thì báo lỗi —
  /// không bao giờ nói "chưa ghi gì" thay cho "không đọc được".
  public func load() async {
    let q = Biometrics.query(userId: userId, since: Biometrics.since(now: clock.nowMillis(), in: timeZone))
    let store = self.store
    do {
      let rows = try await store.select(q)
      guard !closed else { return }
      let samples = rows.compactMap(Biometrics.Sample.init(row:))
      phase = samples.isEmpty ? .empty : .ready(samples)
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      _ = error
      phase = .failed(.unavailable)
    }
  }

  /// Xoá rồi dựng lại ngày của lần đo và hôm nay; xong thì đọc lại.
  public func delete(_ sample: Biometrics.Sample) async -> DeleteOutcome {
    guard !deleting, !closed else { return .failed }
    deleting = true
    defer { deleting = false }
    let touched: Int
    do {
      touched = try await remover.deleteSample(id: sample.id, userId: userId)
    } catch {
      return .failed
    }
    guard touched > 0 else {
      await load()
      return .nothingWritten
    }
    let now = clock.nowMillis()
    // Tuần tự và dừng ở lỗi đầu, như RN (`await recomputeDailyLog` ném thì
    // không dựng hôm nay). Khác RN: vẫn đọc lại — hàng đã xoá thật, danh sách
    // không được giữ nó.
    var rebuilt = true
    for day in Biometrics.rebuildDays(sampleAt: sample.at, now: now, in: timeZone) {
      do {
        try await DailyLog.recompute(userId: userId, date: day, store: store, now: now, in: timeZone)
      } catch {
        rebuilt = false
        break
      }
    }
    await load()
    return rebuilt ? .deleted : .rebuildFailed
  }
}
