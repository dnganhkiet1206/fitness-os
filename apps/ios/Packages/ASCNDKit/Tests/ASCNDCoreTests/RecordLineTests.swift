@testable import ASCNDCore
import Testing

/// Câu báo kỷ lục (#527, `lib/record-line.ts` @ fac9ac2): bốn nhánh, số theo
/// đơn vị của người dùng, số 0 thật không bao giờ được in.
struct RecordLineTests {
  @Test func weightRecordQuotesThePreviousBest() {
    let r = PersonalRecord(exercise: "Squat", kind: .weight, value: 100, previous: 95, atWeight: nil)
    let p = RecordLine.parts(r, unit: .kg)
    #expect(p.form == .weight)
    #expect(p.value == "100")
    #expect(p.previous == "95")
    // `String(Math.round(displayWeight(v) * 10) / 10)` theo lb.
    let lb = RecordLine.parts(r, unit: .lbs)
    #expect(lb.value == WeightUnit.lbs.text(100))
    #expect(lb.previous == WeightUnit.lbs.text(95))
    #expect(lb.value.contains("."))
  }

  /// Mức trước ≤ 0: "lần đầu có tạ", không phải "trước là 0 kg".
  @Test func firstLoadNeverSaysZero() {
    let r = PersonalRecord(exercise: "Pull-up", kind: .weight, value: 5, previous: 0, atWeight: nil)
    let p = RecordLine.parts(r, unit: .kg)
    #expect(p.form == .firstLoad)
    #expect(p.previous == "")
  }

  @Test func repsRecordCarriesTheLoad() {
    let r = PersonalRecord(exercise: "Bench", kind: .reps, value: 9, previous: 8, atWeight: 82.5)
    let p = RecordLine.parts(r, unit: .kg)
    #expect(p.form == .reps)
    #expect(p.count == 9)
    #expect(p.value == "9")
    #expect(p.previous == "8")
    #expect(p.atWeight == "82.5")
  }

  /// Reps không tạ: không nói "ở 0 kg".
  @Test func bodyweightRepsSayNoLoad() {
    for w in [nil, 0.0, -1.0] as [Double?] {
      let r = PersonalRecord(exercise: "Push-up", kind: .reps, value: 1, previous: 0, atWeight: w)
      let p = RecordLine.parts(r, unit: .kg)
      #expect(p.form == .repsBodyweight)
      #expect(p.atWeight == "")
      #expect(p.count == 1)
    }
  }
}
