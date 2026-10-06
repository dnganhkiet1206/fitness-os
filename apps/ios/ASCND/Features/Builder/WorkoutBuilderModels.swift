// Workout Builder presentation shell — C sở hữu (#407).
//
// KHÔNG backend writes, KHÔNG Supabase/SQLite/outbox.
// Mọi thao tác ghi là typed callbacks. Dùng protocol/mock fixtures
// cho tới khi A22 (data contract) xong.
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Protocol cho template — A22 sẽ cung cấp implementation thật.
public protocol WorkoutTemplateProtocol: Identifiable {
  var id: String { get }
  var name: String { get }
  var exercises: [TemplateExerciseProtocol] { get }
  var assignedWeekdays: Set<Int> { get } // 1=CN, 2=T2, ..., 7=T7
}

/// Protocol cho exercise trong template.
public protocol TemplateExerciseProtocol: Identifiable {
  var id: String { get }
  var name: String { get }
  var sets: Int { get }
  var reps: Int { get }
  var weightKg: Double? { get }
}

/// Mock template cho fixtures.
public struct MockTemplate: WorkoutTemplateProtocol {
  public let id: String
  public let name: String
  public let exercises: [TemplateExerciseProtocol]
  public let assignedWeekdays: Set<Int>

  public init(
    id: String = UUID().uuidString,
    name: String,
    exercises: [TemplateExerciseProtocol] = [],
    assignedWeekdays: Set<Int> = []
  ) {
    self.id = id
    self.name = name
    self.exercises = exercises
    self.assignedWeekdays = assignedWeekdays
  }
}

/// Mock exercise cho fixtures.
public struct MockTemplateExercise: TemplateExerciseProtocol {
  public let id: String
  public let name: String
  public let sets: Int
  public let reps: Int
  public let weightKg: Double?

  public init(
    id: String = UUID().uuidString,
    name: String,
    sets: Int,
    reps: Int,
    weightKg: Double? = nil
  ) {
    self.id = id
    self.name = name
    self.sets = sets
    self.reps = reps
    self.weightKg = weightKg
  }
}
