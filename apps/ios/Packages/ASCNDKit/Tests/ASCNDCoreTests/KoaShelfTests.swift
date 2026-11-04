import Foundation
import Testing

@testable import ASCNDCore

/// Kệ cúp và khung mốc của phòng Koa (#792): chọn đồ, tính lại kỷ lục, chỗ đặt, lớp vẽ.
@Suite struct KoaShelfTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }
  private let week = KoaGains.Week(planned: [0, 2, 4], rest: [1, 3, 5, 6])

  private func days(_ dates: [String], pr: Set<String> = []) -> [KoaGains.Day] {
    dates.map { KoaGains.Day(date: d($0), personalRecord: pr.contains($0)) }
  }

  private func rs(_ name: String, _ kg: Double, _ reps: Int) -> RecordSet {
    RecordSet(exerciseName: name, weightKg: kg, reps: reps)
  }

  private func session(_ day: String, hour: Int = 9, _ sets: [RecordSet]) -> KoaShelf.Session {
    let at = EpochMillis(iso8601: "\(day)T\(String(format: "%02d", hour)):00:00Z")!
    return KoaShelf.Session(at: at, date: d(day), sets: sets)
  }

  // MARK: - Chọn đồ

  @Test func cupsAreTheNewestRecordDaysAtMostThree() {
    let prDays: Set = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14"]
    let m = KoaJourney.moments(days(prDays.sorted(), pr: prDays), week: week, today: d("2026-10-15"))
    let bench = PersonalRecord(exercise: "Bench Press", kind: .weight, value: 80, previous: 75, atWeight: nil)
    let cups = KoaShelf.cups(m, records: [d("2026-10-14"): bench])
    #expect(cups.map(\.date) == [d("2026-10-14"), d("2026-10-12"), d("2026-10-09")])
    #expect(cups.map(\.id) == ["record:2026-10-14", "record:2026-10-12", "record:2026-10-09"])
    #expect(cups.first?.record == bench, "ngày có số thì kèm số")
    #expect(cups.dropFirst().allSatisfy { $0.record == nil }, "không tính lại được thì vẫn là cúp, Koa nói chung")
  }

  @Test func newUserRoomIsUnchanged() {
    let m = KoaJourney.moments([], week: week, today: d("2026-10-15"))
    let display = KoaShelf.display(cups: KoaShelf.cups(m, records: [:]), frames: KoaShelf.frames(m))
    #expect(display.isEmpty)
    var o = StudioScene.Options()
    o.shelf = display
    #expect(StudioScene.tree(o) == StudioScene.tree(StudioScene.Options()), "chưa có mốc: phòng y như cũ")
  }

  @Test func framesTakeFirstSessionFirstFullWeekAndHighestRank() {
    let m = [
      KoaJourney.Moment(id: "rank:2", kind: .rankUp, date: d("2026-10-20"), value: 2),
      KoaJourney.Moment(id: "rank:1", kind: .rankUp, date: d("2026-10-09"), value: 1),
      KoaJourney.Moment(id: "week:first", kind: .firstFullWeek, date: d("2026-10-09"), value: 1),
      KoaJourney.Moment(id: "first", kind: .firstSession, date: d("2026-10-05"), value: 1),
    ]
    let f = KoaShelf.frames(m)
    #expect(f.map(\.kind) == [.first, .week, .rank])
    #expect(f.last?.rank == 2 && f.last?.date == d("2026-10-20"), "lần lên hạng cao nhất")
    #expect(KoaShelf.frames(Array(m.suffix(1))).map(\.kind) == [.first], "mốc chưa có thì chưa treo")
  }

  /// Đồ chỉ thêm: nghỉ lâu (hay tạm nghỉ) không làm mất cúp hay khung nào.
  @Test func nothingIsLostWhileAway() {
    let list = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"]
    let all = days(list, pr: ["2026-10-07", "2026-10-12"])
    let now = KoaJourney.moments(all, week: week, today: d("2026-10-12"))
    let later = KoaJourney.moments(all, week: week, today: d("2027-02-01"))
    #expect(KoaShelf.cups(now, records: [:]) == KoaShelf.cups(later, records: [:]))
    #expect(KoaShelf.frames(now) == KoaShelf.frames(later))
    #expect(!KoaShelf.frames(later).isEmpty)
  }

  // MARK: - Tính lại kỷ lục

  @Test func replayFindsEachDaysRecordAgainstEarlierSessionsOnly() {
    let r = KoaShelf.records([
      session("2026-10-09", [rs("Bench Press", 65, 6)]),
      session("2026-10-05", [rs("Bench Press", 60, 5), rs("Squat", 80, 5)]),
      session("2026-10-07", [rs("Bench Press", 65, 5), rs("Deadlift", 100, 5)]),
    ])
    #expect(r[d("2026-10-05")] == nil, "buổi đầu không có gì để vượt")
    #expect(r[d("2026-10-07")] == PersonalRecord(exercise: "Bench Press", kind: .weight, value: 65, previous: 60, atWeight: nil))
    #expect(r[d("2026-10-09")] == PersonalRecord(exercise: "Bench Press", kind: .reps, value: 6, previous: 5, atWeight: 65))
  }

  @Test func firstSessionWithARecordNamesTheDay() {
    let r = KoaShelf.records([
      session("2026-10-05", hour: 8, [rs("Bench Press", 60, 5), rs("Squat", 80, 5)]),
      session("2026-10-07", hour: 8, [rs("Bench Press", 62.5, 5)]),
      session("2026-10-07", hour: 18, [rs("Squat", 120, 5)]),
    ])
    #expect(r[d("2026-10-07")]?.exercise == "Bench Press", "buổi sau trong ngày không đổi kỷ lục của ngày")
  }

  @Test func syncReadsDatesAndSetsInLocalTime() throws {
    let q = KoaShelfSync.query(userId: "u1")
    #expect(q.table == "workout_sessions" && q.columns == "date_time, sets")
    #expect(q.limit == PersonalRecords.historyLimit && q.filters == [.eq("user_id", .string("u1"))])
    let rows = try JSONDecoder().decode(
      [JSONValue].self,
      from: Data(
        #"""
        [{"date_time": "2026-10-05T23:30:00Z", "sets": [{"exerciseName": "Bench Press", "weight": 60, "reps": 5}]},
         {"date_time": null, "sets": []}]
        """#.utf8))
    let s = KoaShelfSync.sessions(rows, in: TimeZone(identifier: "Asia/Ho_Chi_Minh")!)
    #expect(s.count == 1)
    #expect(s.first?.date == d("2026-10-06"), "giờ Việt Nam đã sang ngày 6")
    #expect(s.first?.sets == [rs("Bench Press", 60, 5)])
  }

  // MARK: - Chỗ đặt

  /// Cúp đứng trên mặt kệ, trong mép tấm ván, không chạm đồ sẵn có của kệ và không chạm nhau.
  /// Đồ sẵn có (đã nhân `m`, không tính bóng tiếp xúc), tầng y 250 (ván 28…116) và y 350 (ván 12…132):
  /// - kệ gốc vẽ lại (04/11, #799, `tools/studio/redraw799.cjs`): chậu cây 91 ở 28,3…52,9 và bình
  ///   nước ở 76,1…91,9; ấm tạ ở 27,3…52,7 và con lăn ở 78…117,6 (bình, ấm tạ, con lăn trong nhóm 80);
  /// - kệ chrome (giữ tranh 29/10): chậu cây và bình nước RN ở 26,6…55,4 và 76,1…91,9; ấm tạ ở
  ///   27,9…52,1 và con lăn ở 78…117,6.
  @Test func cupsSitInTheShelfsEmptySpots() {
    let things: [String?: [Double: [ClosedRange<Double>]]] = [
      nil: [250: [28.2...52.9, 76...92], 350: [27.3...52.7, 78...117.6]],
      "chrome": [250: [26.6...55.4, 76.1...91.9], 350: [27.9...52.1, 78...117.6]],
    ]
    let boards: [Double: ClosedRange<Double>] = [250: 28...116, 350: 12...132]
    for variant in [nil, "chrome"] as [String?] {
      let rects = (0..<KoaShelf.maxCups).compactMap { KoaShelf.cupRect($0, shelf: variant) }
      #expect(rects.count == KoaShelf.maxCups)
      for r in rects {
        let span = r.x...(r.x + r.width)
        let base = r.y + r.height
        #expect(boards[base].map { $0.contains(span.lowerBound) && $0.contains(span.upperBound) } == true, "\(r)")
        #expect(things[variant]?[base]?.allSatisfy { !$0.overlaps(span) } == true, "\(r)")
      }
      for (i, a) in rects.enumerated() {
        for b in rects.dropFirst(i + 1) where a.y == b.y {
          #expect(a.x + a.width <= b.x || b.x + b.width <= a.x)
        }
      }
    }
    // giá olympic: trên xà ngang trên cùng (y 232), giữa hai cột (20…124)
    for i in 0..<KoaShelf.maxCups {
      let r = KoaShelf.cupRect(i, shelf: "olympic")!
      #expect(r.y + r.height == 232 && r.x >= 20 && r.x + r.width <= 124)
    }
    let outside = KoaShelf.cupRect(KoaShelf.maxCups, shelf: nil)
    #expect(outside.map { _ in false } ?? true, "quá số chỗ thì không có cúp")
  }

  /// Khung treo ở dải tường trống giữa bảng hiệu (khung dọc, đáy y 52) và đồ cao nhất của kệ (nắp bình
  /// nước: y 216,9 ở kệ gốc vẽ lại, y 217 ở kệ chrome), trong tường sau (tường bên bắt đầu ở x 8), không
  /// chồng nhau.
  @Test func framesHangOnTheEmptyWall() {
    let rects = KoaShelf.FrameKind.allCases.map(KoaShelf.frameRect)
    for r in rects {
      #expect(r.y >= StudioTall.sign.y + StudioTall.sign.h && r.y + r.height < 216 && r.x >= 8, "\(r)")
    }
    for (i, a) in rects.enumerated() {
      for b in rects.dropFirst(i + 1) { #expect(a.x + a.width <= b.x || b.x + b.width <= a.x) }
    }
  }

  // MARK: - Lớp vẽ

  private func uses(_ els: [KoaRender.Element], _ fill: String) -> Bool {
    els.contains { $0.props["fill"] == .string(fill) || uses($0.kids, fill) }
  }

  private func layer(_ id: String, _ o: StudioScene.Options) -> [KoaRender.Element] {
    StudioScene.tree(o, layer: StudioScene.layers.first { $0.id == id }!)
  }

  @Test func cupsGoWithTheShelfAndFramesWithTheWall() {
    var o = StudioScene.Options()
    o.shelf = KoaShelf.Display(cups: 2, frames: [.first, .rank])
    #expect(uses(layer("props", o), "url(#shelfGold)"), "cúp ở lớp đồ trên sàn, cùng kệ")
    #expect(!uses(layer("wallTop", o), "url(#shelfGold)"))
    #expect(uses(layer("wallTop", o), "url(#shelfFrame)"), "khung ở lớp tường")
    #expect(!uses(layer("props", o), "url(#shelfFrame)"))
    // Koa đứng sau kệ: kệ vẽ lại đè lên Koa, cúp đi cùng kệ
    let shelf = KoaRoomMap.occluders.first { $0.name == "shelf" }!
    #expect(uses(StudioScene.objects(o, Set(shelf.elements)), "url(#shelfGold)"))
    let plant = KoaRoomMap.occluders.first { $0.name == "plant" }!
    #expect(!uses(StudioScene.objects(o, Set(plant.elements)), "url(#shelfGold)"))
  }

  @Test func boughtShelvesKeepTheCups() {
    for variant in ["chrome", "olympic"] {
      var o = StudioScene.Options()
      o.decor = ["shelf": variant]
      o.shelf = KoaShelf.Display(cups: 3)
      #expect(uses(StudioScene.tree(o), "url(#shelfGold)"), "\(variant)")
    }
  }

  @Test func shelfTalkHasOneLineAndMovesTheMouth() {
    #expect(KoaTalk.variants(.shelf) == 1)
    #expect(KoaTalk.face(.shelf).flaps)
  }
}
