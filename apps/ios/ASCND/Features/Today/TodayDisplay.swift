// Read-model của màn Hôm nay — C sở hữu UI, A sở hữu data (#275).
//
// CONTRACT giữa presentation layer và application layer (A6 #270, A7 #271):
//  - UI chỉ đọc `TodayDisplay`, không chứa workout-domain logic,
//    không đọc database, không tính ngày.
//  - 5 trạng thái đúng baseline `dayStateOf` (week-strip.tsx:137):
//    todo (có buổi, chưa tập) · done · missed · rest (ngày nghỉ đã chọn) ·
//    unplanned (chưa lên lịch, KHÁC ngày nghỉ, #215).
//  - Fixture định nghĩa cùng hình dạng ngay trong Preview; khi A6 merge
//    thì đổi fixture sang kiểu thật, không sửa View.
import Foundation

/// Một bài trong buổi — chỉ dữ liệu hiển thị, đã tính sẵn ở application layer.
public struct TodayExercise: Equatable, Sendable {
  public let name: String
  public let sets: Int
  public let reps: Int
  public let weightKg: Double

  public init(name: String, sets: Int, reps: Int, weightKg: Double) {
    self.name = name
    self.sets = sets
    self.reps = reps
    self.weightKg = weightKg
  }
}

/// 5 trạng thái ngày — đúng `DayState` của baseline RN.
public enum TodayStatus: String, Equatable, Sendable {
  case todo
  case done
  case missed
  case rest
  case unplanned
}

/// Dữ liệu hiển thị của màn Hôm nay — application layer (A7) cung cấp bản thật.
public struct TodayDisplay: Equatable, Sendable {
  public let date: Date
  public let status: TodayStatus
  public let templateName: String?
  public let exercises: [TodayExercise]
  public let isDeload: Bool

  public init(
    date: Date,
    status: TodayStatus,
    templateName: String? = nil,
    exercises: [TodayExercise] = [],
    isDeload: Bool = false
  ) {
    self.date = date
    self.status = status
    self.templateName = templateName
    self.exercises = exercises
    self.isDeload = isDeload
  }
}
