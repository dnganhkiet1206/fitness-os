import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Runner Swift cho `spec/vectors/personal-record.json` (PR-*, D-7 #282).
///
/// Cùng tệp vector chạy ở RN (`spec/vectors/run-personal-record.mjs`, gọi
/// `personal-record.ts` thật) và ở đây, trên `PersonalRecords.bests` /
/// `findRecords` thật. `spec/differential/expected-differences.json` không
/// ghi khác biệt nào cho miền này, nên native phải ra ĐÚNG kết quả RN, cùng thứ
/// tự (mức tăng lớn nhất trước).
struct PersonalRecordVectorTests {
  struct VSet: Decodable, Sendable {
    let exerciseName: String
    let weight: Double
    let reps: Int
    let warmup: Bool?

    var record: RecordSet {
      RecordSet(exerciseName: exerciseName, weightKg: weight, reps: reps, warmup: warmup ?? false)
    }
  }

  struct Input: Decodable, Sendable {
    let history: [VSet]
    let session: [VSet]
  }

  struct Expected: Decodable, Sendable, Equatable, CustomStringConvertible {
    let exercise: String
    let kind: String
    let value: Double
    let previous: Double

    var description: String { "\(exercise) \(kind) \(previous)→\(value)" }
  }

  @Test func everyVectorMatchesNative() throws {
    let vectors = try GoldenVectors.load(
      RepoPaths.specVectors.appendingPathComponent("personal-record.json"),
      as: GoldenVector<Input, [Expected]>.self)
    #expect(!vectors.isEmpty)
    for v in vectors {
      let bests = PersonalRecords.bests(from: v.input.history.map(\.record))
      let actual = PersonalRecords.findRecords(v.input.session.map(\.record), bests: bests).map {
        Expected(exercise: $0.exercise, kind: $0.kind.rawValue, value: $0.value, previous: $0.previous)
      }
      #expect(actual == v.expected, "\(v.rule)")
    }
  }
}
