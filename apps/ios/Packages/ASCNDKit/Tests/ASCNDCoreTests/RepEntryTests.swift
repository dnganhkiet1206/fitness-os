import ASCNDCore
import Testing

/// Theo `rep-entry.ts` thật — gồm hai ca bản chép trong `run.mjs` làm sai (#237).
struct RepEntryTests {
  @Test(arguments: [
    ("10", 10, nil), ("45s", 0, 45), ("45 s", 0, 45), ("45.5s", 0, 46), ("45S", 0, 45),
    ("  12  ", 12, nil), ("007", 7, nil), ("1000", 1000, nil),
  ] as [(String, Int, Int?)])
  func accepts(raw: String, reps: Int, hold: Int?) {
    let e = RepEntry.parse(raw)
    #expect(e.reps == reps, "\(raw)")
    #expect(e.durationSec == hold, "\(raw)")
    #expect(e.isEntered)
  }

  @Test(arguments: ["", "0", "1001", "8.5", "-5", "+8", "1e3", "abc", "0s", "3601s", "s", "4 5s", "99999999999999999999"])
  func rejects(raw: String) {
    #expect(RepEntry.parse(raw) == .empty, "\(raw)")
  }
}
