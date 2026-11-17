public import Foundation

/// Cửa sổ lịch sử Apple Health mà iOS cho app đọc (iOS 27).
///
/// Từ iOS 27, sau màn chọn loại dữ liệu, hệ thống hỏi thêm người dùng muốn cho
/// app đọc "một cửa sổ gần đây" hay "toàn bộ lịch sử" ("Past 30 Days and
/// Future Data" / "All Recorded Data and Future Data"). Chỉ trạng thái GIỚI
/// HẠN là nhận biết được: `HKHealthStore.earliestAuthorizedSampleDate(for:)`
/// trả về ngày đọc được sớm nhất cho từng loại bị giới hạn; loại không bị giới
/// hạn — và loại bị từ chối đọc — đều vắng mặt như nhau, nên không thể phân
/// biệt "đủ" với "bị từ chối". Trước iOS 27 khái niệm này không tồn tại.
///
/// Lịch sử trước ngày sớm nhất không phải là "không có dữ liệu" mà là "không
/// biết": truy vấn HealthKit trả về rỗng, không lỗi. Nền và xu hướng chỉ được
/// tính từ ngày này trở đi, và điểm sẵn sàng phải ghi rõ khi nền bị cắt dưới
/// số ngày tối thiểu.
public enum HealthHistoryWindow: Sendable, Hashable {
  /// Không biết cửa sổ: iOS < 27, build bằng SDK cũ, hoặc HealthKit không trả
  /// về giới hạn nào. Hành vi như trước — không khẳng định gì về lịch sử.
  case unknown
  /// Chỉ đọc được từ ngày địa phương này trở đi. Ngày là ngày sớm nhất trong
  /// các loại app đọc cho nền (HRV, nhịp tim nghỉ, giấc ngủ, bước, buổi tập)
  /// — loại bị giới hạn chặt nhất quyết định cửa sổ chung, để không nền nào
  /// tính trên ngày không đọc được.
  case limited(earliest: LocalDate)

  /// Cửa sổ từ mili giây đã lưu (`health:earliestReadableDate`): ≤ 0 = không biết.
  public static func fromStored(millis: Int64, in tz: TimeZone) -> HealthHistoryWindow {
    guard millis > 0 else { return .unknown }
    return .limited(earliest: LocalDate(EpochMillis(millis), in: tz))
  }

  /// Số ngày lịch sử đọc được, từ ngày sớm nhất tới `date`, tính cả hai đầu.
  /// `nil` khi không biết cửa sổ. Ngày sớm nhất sau `date` thì 0 — không bao
  /// giờ âm. Số học ngày thuần (`daysSinceEpoch`), không qua múi giờ.
  public func readableDays(through date: LocalDate) -> Int? {
    guard case .limited(let earliest) = self else { return nil }
    return max(0, date.daysSinceEpoch - earliest.daysSinceEpoch + 1)
  }

  /// Cửa sổ có cắt dưới số ngày nền tối thiểu của engine không.
  public func limitsBaseline(through date: LocalDate) -> Bool {
    readableDays(through: date).map { $0 < ReadinessEngine.baselineDays } ?? false
  }

  /// Mức ghi chú cho UI.
  public enum Note: Sendable, Hashable {
    /// Nền chưa đủ 7 ngày: điểm thiếu chiều HRV / nhịp tim nghỉ.
    case short
    /// Cửa sổ giới hạn nhưng nền đủ: chỉ xu hướng dài bị cắt.
    case limited
  }

  /// Ghi chú cho UI tại `date`: `nil` khi không biết hoặc không giới hạn.
  public func note(through date: LocalDate) -> Note? {
    guard case .limited = self else { return nil }
    return limitsBaseline(through: date) ? .short : .limited
  }
}
