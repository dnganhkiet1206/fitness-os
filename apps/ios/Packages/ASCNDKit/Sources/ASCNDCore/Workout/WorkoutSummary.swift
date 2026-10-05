/// Những gì màn Tổng kết (C) cần sau khi chốt buổi — tính từ ĐÚNG bản ghi đã
/// vào outbox, không tính lại từ màn hình, để con số người dùng thấy và con số
/// lên server là một.
///
/// Luật đếm theo `WorkoutMath` (WS-5, LT-6): khởi động không vào volume, không
/// vào số set đã làm; set giữ (`45s`) được đếm dù góp 0 volume.
public struct WorkoutSummary: Sendable, Hashable {
  public let sessionId: String
  public let dateTime: EpochMillis
  public let templateName: String
  /// Set đã làm, khởi động bị loại.
  public let completedSets: Int
  public let warmupSets: Int
  /// Set giữ theo thời gian (reps 0, có `durationSec`).
  public let holdSets: Int
  /// Số bài khác nhau có ít nhất một set đã làm.
  public let exerciseCount: Int
  /// Σ kg × reps, khởi động bị loại — đúng `volume_load` của hàng gửi đi.
  public let volumeKg: Int
  public let sessionRpe: Int
  /// Luôn `false` ở bản này: kỷ lục là phép so với lịch sử, chốt buổi không đợi
  /// mạng nên không có lịch sử để so (WS-10, đường offline của baseline).
  public let prDetected: Bool

  public init(_ record: WorkoutSessionRecord) {
    let counted = record.sets.filter { !$0.warmup && ($0.reps > 0 || ($0.durationSec ?? 0) > 0) }
    sessionId = record.id
    dateTime = record.dateTime
    templateName = record.templateName
    completedSets = counted.count
    warmupSets = record.sets.filter(\.warmup).count
    holdSets = counted.filter { $0.reps == 0 && ($0.durationSec ?? 0) > 0 }.count
    // Theo tên khi không có id: hàng thêm tay của baseline mang id rỗng.
    exerciseCount = Set(counted.map { $0.exerciseId.isEmpty ? "name:" + $0.exerciseName : $0.exerciseId }).count
    volumeKg = record.volumeLoad
    sessionRpe = record.sessionRpe
    prDetected = record.prDetected
  }

  /// Init từng trường cho Preview/fixture (#279) — giá trị phải đúng những
  /// gì `init(_ record:)` sẽ tính, để Preview không lệch với thật.
  public init(
    sessionId: String,
    dateTime: EpochMillis,
    templateName: String,
    completedSets: Int,
    warmupSets: Int,
    holdSets: Int,
    exerciseCount: Int,
    volumeKg: Int,
    sessionRpe: Int,
    prDetected: Bool
  ) {
    self.sessionId = sessionId
    self.dateTime = dateTime
    self.templateName = templateName
    self.completedSets = completedSets
    self.warmupSets = warmupSets
    self.holdSets = holdSets
    self.exerciseCount = exerciseCount
    self.volumeKg = volumeKg
    self.sessionRpe = sessionRpe
    self.prDetected = prDetected
  }
}
