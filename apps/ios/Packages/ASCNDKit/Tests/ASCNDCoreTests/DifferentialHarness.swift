import ASCNDCore
import Foundation
import Testing

/// Harness cho differential runner D-21 (#373): đọc fixtures từ
/// `DIFF_INPUT`, chạy LOGIC NATIVE THẬT, ghi kết quả ra `DIFF_OUTPUT`.
///
/// Fixtures: [{id, history: [{exerciseName, weight, reps, warmup?}],
///              session: [{exerciseName, weight, reps, warmup?}]}]
/// Output:   [{id, records: [{exercise, kind, value, previous}]}]
struct DifferentialHarness {
  @Test func run() throws {
    let fm = FileManager.default
    guard let inPath = ProcessInfo.processInfo.environment["DIFF_INPUT"],
          let outPath = ProcessInfo.processInfo.environment["DIFF_OUTPUT"] else {
      // Chỉ chạy qua differential runner (run-differential.mjs).
      // Bỏ qua khi chạy swift test thường — không phải lỗi.
      return
    }
    struct Fixture: Decodable {
      struct S: Decodable {
        let exerciseName: String
        let weight: Double
        let reps: Int
        let warmup: Bool?
      }
      let id: String
      let history: [S]
      let session: [S]
    }
    struct Out: Encodable {
      struct R: Encodable { let exercise: String; let kind: String; let value: Double; let previous: Double }
      let id: String
      let records: [R]
    }
    let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: URL(fileURLWithPath: inPath)))
    let outs = fixtures.map { f -> Out in
      let rs: [RecordSet] = f.history.map { RecordSet(exerciseName: $0.exerciseName, weightKg: $0.weight, reps: $0.reps, warmup: $0.warmup ?? false) }
      let ss: [RecordSet] = f.session.map { RecordSet(exerciseName: $0.exerciseName, weightKg: $0.weight, reps: $0.reps, warmup: $0.warmup ?? false) }
      let bests = PersonalRecords.bests(from: rs)
      let recs = PersonalRecords.findRecords(ss, bests: bests)
      return Out(id: f.id, records: recs.map { Out.R(exercise: $0.exercise, kind: "\($0.kind)", value: $0.value, previous: $0.previous) })
    }
    let data = try JSONEncoder().encode(outs)
    fm.createFile(atPath: outPath, contents: data)
  }
}
