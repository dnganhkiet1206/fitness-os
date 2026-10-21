public import Foundation

/// Phục hồi cho Daily Plan (#527 GĐ1, điều kiện 02): từ CHÍNH đầu vào của điểm
/// sẵn sàng (`DailyLog.readinessInput`), giữ số thật để lý do nói bằng số —
/// "đêm qua ngủ 5 giờ 10, HRV thấp hơn mức thường 18%". Chỉ số nào không đo được
/// hay chưa đủ nền thì không có tín hiệu ấy (không đoán).
extension DailyPlan.Recovery {
  /// Ngủ dưới tỉ lệ này của mục tiêu là ngủ thiếu.
  public static let shortSleepRatio = 0.8
  /// HRV thấp hơn trung bình nền từ mức này (%) là lệch.
  public static let lowHRVPercent = 15
  /// Nhịp tim nghỉ cao hơn trung bình nền từ mức này (nhịp/phút) là lệch.
  public static let highRestingHRBpm = 5
  /// Số mẫu nền tối thiểu cho HRV / nhịp tim nghỉ.
  public static let minBaseline = 7

  public static func from(input: ReadinessInput, result: ReadinessResult, date: LocalDate) -> DailyPlan.Recovery {
    let level: Level =
      switch result.status {
      case .red: .low
      case .yellow: .normal
      case .green: .high
      }
    return .init(date: date, level: level, confident: result.confidence != .low, signals: signals(input))
  }

  public static func signals(_ i: ReadinessInput) -> [DailyPlan.Signal] {
    var out: [DailyPlan.Signal] = []
    if i.sleepMinLastNight > 0, i.sleepTargetMin > 0, i.sleepMinLastNight < i.sleepTargetMin * shortSleepRatio {
      out.append(.shortSleep(minutes: Int(i.sleepMinLastNight.rounded()), target: Int(i.sleepTargetMin.rounded())))
    }
    if let hrv = i.hrvToday, i.hrvHistory28d.count >= minBaseline {
      let mean = i.hrvHistory28d.reduce(0, +) / Double(i.hrvHistory28d.count)
      if mean > 0 {
        let below = Int(((mean - hrv) / mean * 100).rounded())
        if below >= lowHRVPercent { out.append(.lowHRV(percentBelow: below)) }
      }
    }
    if let rhr = i.rhrToday, i.rhrHistory28d.count >= minBaseline {
      let mean = i.rhrHistory28d.reduce(0, +) / Double(i.rhrHistory28d.count)
      let above = Int((rhr - mean).rounded())
      if above >= highRestingHRBpm { out.append(.highRestingHR(bpmAbove: above)) }
    }
    return out
  }
}

extension DailyLog {
  /// Phục hồi của `date` cho Daily Plan: đọc các nguồn như lần dựng `daily_logs`
  /// rồi chấm lại tại chỗ. `nil` khi đọc hỏng hay chưa đủ dữ liệu để chấm.
  public static func recovery(
    userId: String, date: LocalDate, store: any RowStore, now: EpochMillis, in tz: TimeZone
  ) async -> DailyPlan.Recovery? {
    let reads = queries(userId: userId, date: date, in: tz)
    guard let s = try? await readSources(reads, store),
      let input = readinessInput(sources: s, now: now, in: tz),
      let result = ReadinessEngine.compute(input)
    else { return nil }
    return .from(input: input, result: result, date: date)
  }
}
