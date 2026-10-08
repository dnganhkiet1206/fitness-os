// Fixture dùng chung — C sở hữu (#320).
//
// Thư viện fixture deterministic cho Preview và test:
// Today, Workout, Summary, Auth — với edge cases:
// empty, offline, partial, completed, error, Dynamic Type lớn.
//
// KHÔNG network/backend. Mọi fixture đều cố định, không random.
//
// Chỉ có trong bản DEBUG: chữ mẫu cố ý không dịch, không được lọt vào bản
// phát hành.
#if DEBUG
import ASCNDCore
import Foundation

/// Fixture cho màn Today.
public enum TodayFixtures {
  public static func display(
    status: TodayStatus,
    templateName: String? = "Ngực – Vai – Tay"
  ) -> TodayDisplay {
    TodayDisplay(
      date: Date(timeIntervalSince1970: 1_728_000_000),
      status: status,
      templateName: status == .todo || status == .done ? templateName : nil,
      exercises: status == .todo ? [
        TodayExercise(name: "Bench Press", sets: 4, reps: 8, weightKg: 60),
        TodayExercise(name: "Overhead Press", sets: 3, reps: 10, weightKg: 30),
      ] : [],
      isDeload: false
    )
  }

  /// Tất cả 5 trạng thái.
  public static var allStatuses: [TodayDisplay] {
    [.todo, .done, .missed, .rest, .unplanned].map { display(status: $0) }
  }

  /// Edge: template rỗng.
  public static var emptyTemplate: TodayDisplay {
    display(status: .todo, templateName: "Buổi trống")
  }
}

/// Fixture cho màn Summary.
public enum SummaryFixtures {
  public static var normal: WorkoutSummary {
    WorkoutSummary(
      sessionId: "fixture-normal",
      dateTime: EpochMillis(1_728_000_000_000),
      templateName: "Ngực – Vai – Tay",
      completedSets: 12,
      warmupSets: 2,
      holdSets: 0,
      exerciseCount: 5,
      volumeKg: 2400,
      sessionRpe: 8,
      prDetected: false
    )
  }

  public static var withPR: WorkoutSummary {
    WorkoutSummary(
      sessionId: "fixture-pr",
      dateTime: EpochMillis(1_728_000_000_000),
      templateName: "Ngực – Vai – Tay",
      completedSets: 12,
      warmupSets: 2,
      holdSets: 0,
      exerciseCount: 5,
      volumeKg: 2600,
      sessionRpe: 9,
      prDetected: true
    )
  }

  public static var empty: WorkoutSummary {
    WorkoutSummary(
      sessionId: "fixture-empty",
      dateTime: EpochMillis(1_728_000_000_000),
      templateName: "Buổi trống",
      completedSets: 0,
      warmupSets: 0,
      holdSets: 0,
      exerciseCount: 0,
      volumeKg: 0,
      sessionRpe: 0,
      prDetected: false
    )
  }

  public static var partial: WorkoutSummary {
    WorkoutSummary(
      sessionId: "fixture-partial",
      dateTime: EpochMillis(1_728_000_000_000),
      templateName: "Ngực – Vai – Tay",
      completedSets: 5,
      warmupSets: 1,
      holdSets: 0,
      exerciseCount: 2,
      volumeKg: 800,
      sessionRpe: 6,
      prDetected: false
    )
  }
}

/// Fixture cho màn Auth (trạng thái, không phải credentials).
public enum AuthFixtures {
  public static var invalidEmail: String { "not-an-email" }
  public static var shortPassword: String { "123" }
  public static var validEmail: String { "test@example.com" }
  public static var validPassword: String { "password123" }
}
#endif
