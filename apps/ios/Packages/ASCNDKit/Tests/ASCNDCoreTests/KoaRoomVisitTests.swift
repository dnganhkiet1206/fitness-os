import Testing

@testable import ASCNDCore

@Suite struct KoaRoomVisitTests {
  @Test func opensOnceAndClosesOnce() {
    var v = KoaRoomVisit()
    let early = v.close(at: 5)
    #expect(early == nil)
    let first = v.open(at: 10), again = v.open(at: 11)
    #expect(first && !again)
    let done = v.close(at: 20), twice = v.close(at: 21)
    #expect(done?["duration"] == "10_30s")
    #expect(twice == nil)
  }

  @Test func countsResetEachVisit() {
    var v = KoaRoomVisit()
    _ = v.open(at: 0)
    for _ in 0..<4 { v.poked() }
    v.walked()
    let busy = v.close(at: 200)
    #expect(busy == ["duration": "over_120s", "pokes": "4_plus", "walks": "1_3"])
    _ = v.open(at: 300)
    let quiet = v.close(at: 305)
    #expect(quiet == ["duration": "under_10s", "pokes": "0", "walks": "0"])
  }

  @Test(arguments: [(9.9, "under_10s"), (10, "10_30s"), (29.9, "10_30s"), (30, "30_120s"), (120, "over_120s")])
  func durationBuckets(seconds: Double, want: String) {
    #expect(KoaRoomVisit.duration(seconds) == want)
  }
}
