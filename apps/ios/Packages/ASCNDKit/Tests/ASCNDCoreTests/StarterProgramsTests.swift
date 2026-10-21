@testable import ASCNDCore
import Foundation
import Testing

/// Chương trình khởi đầu của onboarding (#527 đợt 3, `koa-wave3-activation.html`).
struct StarterProgramsTests {
  @Test func suggestedFollowsExperience() {
    #expect(StarterPrograms.Choice.suggested(trainingLevel: "beginner").sessions == 3)
    #expect(StarterPrograms.Choice.suggested(trainingLevel: nil).beginner)
    let mid = StarterPrograms.Choice.suggested(trainingLevel: "intermediate")
    #expect(mid.sessions == 4 && mid.days == [0, 1, 3, 4] && !mid.beginner)
  }

  @Test func scheduleCoversEveryTrainingDayAndRotates() {
    for place in StarterPrograms.Place.allCases {
      for n in StarterPrograms.sessionCounts {
        let c = StarterPrograms.Choice(sessions: n, days: StarterPrograms.defaultDays(n), place: place, beginner: true)
        let s = StarterPrograms.schedule(c)
        #expect(s.map(\.day) == StarterPrograms.defaultDays(n), "\(place) \(n)")
        #expect(Set(s.map(\.session)).count >= min(n, 2), "ít nhất hai buổi khác nhau")
      }
    }
    let three = StarterPrograms.schedule(.init(sessions: 3, days: [4, 0, 2], place: .gym, beginner: true))
    #expect(three.map(\.day) == [0, 2, 4] && three.map(\.session) == [.fullA, .fullB, .fullA])
    let five = StarterPrograms.schedule(.init(sessions: 5, days: [0, 1, 2, 3, 4], place: .gym, beginner: false))
    #expect(five.map(\.session) == [.push, .pull, .legs, .upperA, .lowerA])
  }

  @Test func beginnersLiftLighterVolume() {
    let b = StarterPrograms.exercises(.fullB, place: .gym, beginner: true)
    #expect(b.allSatisfy { $0.sets <= 3 && $0.reps >= 10 && $0.weightKg == 0 })
    let x = StarterPrograms.exercises(.fullB, place: .gym, beginner: false)
    #expect(x.first?.exerciseName == "Barbell Deadlift" && x.first?.reps == 5)
  }

  @Test func dumbbellSwapsNeverRepeatInASession() {
    for s in StarterPrograms.Session.allCases {
      let ex = StarterPrograms.exercises(s, place: .dumbbell, beginner: false)
      #expect(Set(ex.map(\.exerciseName)).count == ex.count, "\(s)")
      #expect(!ex.contains { $0.exerciseName.contains("Barbell") || $0.exerciseName.contains("Cable") }, "\(s)")
    }
  }

  /// Mọi bài phải là tên có thật trong thư viện bài tập dựng sẵn (có hướng dẫn, hình).
  @Test func everyExerciseExistsInTheLibrary() throws {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()  // ASCNDCoreTests
      .deletingLastPathComponent().deletingLastPathComponent()  // ASCNDKit
      .deletingLastPathComponent().deletingLastPathComponent()  // apps/ios
      .deletingLastPathComponent().deletingLastPathComponent()  // repo
    let sql = try String(
      contentsOf: root.appendingPathComponent("supabase/migrations/20261018120000_food_exercise_library.sql"), encoding: .utf8)
    var names = Set<String>()
    for place in StarterPrograms.Place.allCases {
      for s in StarterPrograms.Session.allCases {
        for e in StarterPrograms.exercises(s, place: place, beginner: false) { names.insert(e.exerciseName) }
      }
    }
    for n in names.sorted() {
      #expect(sql.contains("(NULL, '\(n.replacingOccurrences(of: "'", with: "''"))',"), "\(n) không có trong thư viện")
    }
  }
}
