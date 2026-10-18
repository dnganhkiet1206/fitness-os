import Foundation

/// Thẻ "Tóm tắt" của tab Trợ lý (15/10, chủ dự án duyệt mock v2 — theo nguyên tắc
/// Apple Health mới: tóm tắt trước, điểm sẵn sàng có NHÃN CHỮ, so với mức thường
/// của chính mình). Chỉ đổi cách hiển thị — điểm vẫn tính 0–100 như cũ.
public enum AssistantSummary {
  /// Nhãn hành động của điểm sẵn sàng.
  public enum Readiness: String, Sendable, Hashable {
    /// Xanh — sẵn sàng tập.
    case go
    /// Vàng — giữ nhịp.
    case pace
    /// Đỏ — phục hồi.
    case recover
  }

  /// So với mức thường (trung bình 7 ngày) của chính người dùng.
  public enum Versus: String, Sendable, Hashable { case above, typical, below }

  /// Điểm sẵn sàng đang hiện — CÙNG một quyết định cho Hôm nay và Trợ lý (15/10,
  /// audit: Hôm nay "chưa có điểm" trong khi Trợ lý hiện 7/10 của hôm qua).
  public struct Shown: Sendable, Hashable {
    /// 0–100, như engine.
    public let score: Int
    public let level: Readiness
    /// Ngày của điểm khi KHÔNG phải hôm nay (điểm gần nhất); `nil` = hôm nay.
    public let asOf: LocalDate?

    public init(score: Int, level: Readiness, asOf: LocalDate?) {
      self.score = score
      self.level = level
      self.asOf = asOf
    }
  }

  /// Hôm nay có điểm → điểm hôm nay (nhãn theo trạng thái engine); không thì điểm
  /// gần nhất trong `recent` (cũ → mới, chỉ các ngày trước hôm nay), nhãn theo ngưỡng.
  public static func shown(today: Int?, status: String?, recent: [(date: LocalDate, value: Int)]) -> Shown? {
    if let today, let level = readiness(status: status, score: today) {
      return Shown(score: today, level: level, asOf: nil)
    }
    guard let last = recent.last, let level = readiness(status: nil, score: last.value) else { return nil }
    return Shown(score: last.value, level: level, asOf: last.date)
  }

  /// Điểm hôm nay CHƯA đủ để hiện như một lời khuyên (17/10, chủ dự án: con số
  /// trung tâm trông như bịa): engine có điểm, nhưng không có chiều phục hồi nào
  /// (HRV / RHR / giấc ngủ — `hasRecoverySignal`), tức điểm chỉ dựa vào tải tập.
  /// Khi ấy Hôm nay và Trợ lý nói "chưa đủ dữ liệu" và cách lấp, thay vì "80 ·
  /// Tập hết mình". Điểm vẫn được tính và lưu như RN; chỉ cách hiện đổi.
  public static func provisional(score: Int?, hasRecovery: Bool) -> Bool {
    score != nil && !hasRecovery
  }

  public static func readiness(status: String?, score: Int?) -> Readiness? {
    guard score != nil else { return nil }
    switch status {
    case "green": return .go
    case "yellow": return .pace
    case "red": return .recover
    default:
      guard let s = score else { return nil }
      // Cùng ngưỡng với thẻ sẵn sàng của Hôm nay (≥ 75 tập, ≥ 50 vừa phải).
      return s >= 75 ? .go : s >= 50 ? .pace : .recover
    }
  }

  /// Hôm nay so với trung bình các ngày CÓ dữ liệu trước hôm nay; cần ≥ 3 ngày.
  /// Lệch dưới `band` điểm coi như bình thường.
  public static func versus(today: Int?, bars: [MetricAnalysis.Bar], band: Double = 8) -> Versus? {
    guard let today else { return nil }
    let past = bars.filter { !$0.missing && !$0.today }.map(\.value)
    guard past.count >= 3 else { return nil }
    let avg = past.reduce(0, +) / Double(past.count)
    let d = Double(today) - avg
    return d > band ? .above : d < -band ? .below : .typical
  }

  /// Hướng 7 ngày từ các cột có dữ liệu (`MetricAnalysis.direction`, cần đủ điểm).
  public static func trend(_ bars: [MetricAnalysis.Bar]) -> MetricAnalysis.Direction? {
    MetricAnalysis.direction(bars.filter { !$0.missing }.map(\.value))
  }

  /// Điểm gần nhất TRƯỚC hôm nay (khi hôm nay chưa có) — thẻ không trống khi lịch
  /// sử vẫn có số (15/10, audit).
  public static func latest(_ bars: [MetricAnalysis.Bar]) -> (value: Int, date: LocalDate)? {
    guard let b = bars.last(where: { !$0.missing && !$0.today }) else { return nil }
    return (Int(b.value.rounded()), b.date)
  }

  /// Mảng của "Điểm nổi bật".
  public enum Area: String, Sendable, Hashable, CaseIterable { case trend, sleep, heart, nutrition }

  /// Thứ tự: mảng có điều đáng chú ý trước (ngủ ngắn, nhịp tim cao), rồi mảng có
  /// số, mảng chưa có dữ liệu cuối cùng; hoà thì theo thứ tự gốc.
  public static func order(
    sleepMin: Double, heartRate: Int?, kcal: Double, hasTrend: Bool
  ) -> [Area] {
    func rank(_ a: Area) -> Int {
      switch a {
      case .sleep: sleepMin == 0 ? 2 : sleepMin < 420 ? 0 : 1
      case .heart: heartRate == nil ? 2 : heartRate! > 80 ? 0 : 1
      case .nutrition: kcal == 0 ? 2 : 1
      case .trend: hasTrend ? 1 : 2
      }
    }
    let base: [Area] = [.trend, .sleep, .heart, .nutrition]
    return base.enumerated().sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }.map(\.element)
  }

  // MARK: - Dành cho bạn theo ngữ cảnh (15/10)

  public enum Tool: String, Sendable, Hashable, CaseIterable {
    case weekly, steps, biometrics, sleep, goals, measure, photos, memory
  }

  /// Vì sao thẻ được đưa lên — câu ngắn hiện thay dòng gợi ý chung.
  public enum Reason: String, Sendable, Hashable {
    /// Cuối / đầu tuần: xem lại tuần.
    case weekEnd
    /// Đêm qua chưa có giấc ngủ.
    case noSleep
    /// Đêm qua ngủ < 7 giờ.
    case shortSleep
    /// Chiều tối mà còn ít bước.
    case fewSteps
    /// Sẵn sàng thấp / vừa — xem cơ thể đang ra sao.
    case lowReadiness
    /// Đầu tháng: hiệu chỉnh mục tiêu, chụp ảnh / đo lại.
    case monthStart
  }

  public struct Context: Sendable, Hashable {
    public var weekday: Int
    public var dayOfMonth: Int
    public var hour: Int
    public var sleepMin: Double
    public var steps: Double
    public var readiness: Readiness?

    /// `weekday` theo `Calendar` (1 = Chủ nhật … 7 = Thứ bảy).
    public init(weekday: Int, dayOfMonth: Int, hour: Int, sleepMin: Double, steps: Double, readiness: Readiness?) {
      self.weekday = weekday
      self.dayOfMonth = dayOfMonth
      self.hour = hour
      self.sleepMin = sleepMin
      self.steps = steps
      self.readiness = readiness
    }
  }

  public struct Pick: Sendable, Hashable {
    public let tool: Tool
    public let reason: Reason?
  }

  /// Thẻ có lý do lên trước (theo thứ tự mức khẩn: ngủ → sẵn sàng → bước → tuần →
  /// tháng), rồi phần còn lại theo thứ tự gốc; "Coach nhớ gì" luôn cuối.
  public static func forYou(_ available: [Tool], context c: Context) -> [Pick] {
    var reasons: [Tool: Reason] = [:]
    if c.sleepMin == 0 { reasons[.sleep] = .noSleep } else if c.sleepMin < 420 { reasons[.sleep] = .shortSleep }
    if c.readiness == .recover || c.readiness == .pace { reasons[.biometrics] = .lowReadiness }
    if c.hour >= 15, c.steps < 5000 { reasons[.steps] = .fewSteps }
    if c.weekday == 1 || c.weekday == 2 { reasons[.weekly] = .weekEnd }
    if c.dayOfMonth <= 3 {
      reasons[.goals] = .monthStart
      reasons[.photos] = .monthStart
      reasons[.measure] = .monthStart
    }
    let urgency: [Reason] = [.noSleep, .shortSleep, .lowReadiness, .fewSteps, .weekEnd, .monthStart]
    func rank(_ t: Tool) -> Int {
      if t == .memory { return 99 }
      guard let r = reasons[t] else { return 50 }
      return urgency.firstIndex(of: r) ?? 50
    }
    return available.enumerated()
      .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }
      .map { Pick(tool: $0.element, reason: reasons[$0.element]) }
  }
}
