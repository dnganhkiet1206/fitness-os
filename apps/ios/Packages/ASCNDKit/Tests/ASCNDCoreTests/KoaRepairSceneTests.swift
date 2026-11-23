import Testing

@testable import ASCNDCore

@Suite("KoaRepairScene.Board")
struct KoaRepairSceneTests {
  @Test("vào và ra cảnh: Koa đứng giữa bục, máy quay toàn cảnh, bảng sáng sau khi sửa")
  func entersAndLeavesOnStage() {
    let shots = KoaRepairScene.Board.shots()
    #expect(shots.count > 100)
    let first = shots[0], last = shots[shots.count - 1]
    for s in [first, last] {
      #expect(abs(s.x - 195) < 1)
      #expect(abs(s.feet - 412) < 1)
      #expect(abs(s.camera.zoom - 1) < 0.01)
    }
    #expect(last.board.dark < 0.05)
    #expect(last.board.powered)
    #expect(last.repaired)
  }

  @Test("giữa cảnh bảng tắt, Koa bấm nút nguồn tắt rồi bật, đếm khởi động")
  func boardGoesDarkAndReboots() {
    let shots = KoaRepairScene.Board.shots()
    #expect(shots.contains { $0.board.dark > 0.9 })
    #expect(shots.contains { !$0.board.powered })
    #expect(shots.contains { $0.board.count != nil })
  }

  @Test("tiếng theo thứ tự thời gian, nằm trong cảnh")
  func cuesOrdered() {
    let cues = KoaRepairScene.Board.cues
    #expect(!cues.isEmpty)
    #expect(cues.map(\.t) == cues.map(\.t).sorted())
    #expect(cues.allSatisfy { $0.t >= 0 && $0.t <= KoaRepairScene.Board.duration + 0.5 })
  }

  @Test("quy đổi ảnh → phòng: khung bảng trên ảnh rơi đúng khung bảng của phòng")
  func boardMapsOntoRoomBoard() {
    let p = KoaRepairScene.Board.screenPx
    let a = KoaRepairScene.room(p.x, p.y), b = KoaRepairScene.room(p.x + p.w, p.y + p.h)
    // bảng đã dời `boardShift` (#799-B): cảnh sửa bảng dời theo, vẫn rơi đúng khung bảng của phòng
    #expect(abs((a.x + b.x) / 2 - (321 + StudioScene.boardShift)) < 1.5)
    // bảng nhích lên `boardLift` (Kiệt 23/11): cảnh sửa bảng nhích theo
    #expect(abs((a.y + b.y) / 2 - (277 + StudioScene.boardLift)) < 1.5)
  }

  /// Bảng nhích lên gần bậu cửa sổ (Kiệt 23/11) nhưng không chạm bậu (y 160…172).
  @Test func boardSitsCloserToTheWindowSill() {
    let p = KoaRepairScene.Board.screenPx
    let top = KoaRepairScene.room(p.x, p.y).y
    #expect(StudioScene.boardLift < 0)
    #expect(top > 172 + 16, "\(top)")
    #expect(top < 248, "\(top)")
  }

  /// Bảng cao hơn tầm tay: Koa bật nhảy khi gõ, tiếng "cộc" nằm trong khung bảng, rồi đáp xuống sàn.
  @Test func koaJumpsToKnockTheLiftedBoard() {
    let B = KoaRepairScene.Board.self, fps = 30.0
    let p = B.screenPx
    let a = KoaRepairScene.room(p.x, p.y), b = KoaRepairScene.room(p.x + p.w, p.y + p.h)
    for h in B.hits {
      let s = B.shot(at: h - B.start + 0.01)
      #expect(s.lift > 0, "nhảy khi gõ \(h)")
      let knock = s.pops.first { $0.text.hasPrefix("koa.repair.pop.knock") }
      #expect(knock != nil, "có tiếng gõ \(h)")
      if let k = knock { #expect(k.y > a.y && k.y < b.y, "tiếng gõ trong khung bảng (\(k.y) ∉ \(a.y)…\(b.y))") }
    }
    // giữa hai lượt gõ, lúc cáu và lúc rút phích: đứng trên sàn
    for t in [B.hits[1] + 0.3, 9.9, 11.8] {
      #expect(B.shot(at: t - B.start).lift < 0.01, "đứng sàn lúc \(t)")
    }
    // từ lúc nhảy xuống sàn tới lúc cáu: chân không giật (≤ 12 đơn vị mỗi khung 1/30 giây, bằng cú nhảy xuống đã duyệt)
    let shots = B.shots(fps: fps)
    func step(_ r: Range<Double>) -> Double {
      let ys = shots.enumerated().filter { r.contains(Double($0.offset) / fps + B.start) }.map(\.element.feet)   // `feet` đã gồm độ nhảy
      return zip(ys, ys.dropFirst()).map { abs($0 - $1) }.max() ?? 0
    }
    #expect(step(6.8..<9.8) <= 12, "\(step(6.8..<9.8))")
  }

  /// Gỡ dây điện (Kiệt 23/11): Koa nhảy lên bấm nút nguồn hai lần — lần 1 tắt, lần 2 bật lại.
  /// Đỉnh nhảy, tay (cách tâm +132 px, y 1593 − độ nhảy) chạm đúng nút; giữa hai lần Koa đứng sàn.
  @Test func koaJumpsToPressThePowerButtonTwice() {
    let B = KoaRepairScene.Board.self
    for (at, poweredAfter) in [(B.T("pop"), false), (B.T("click"), true)] {
      let s = B.shot(at: at - B.start)
      #expect(s.lift > 0, "nhảy lúc bấm \(at)")
      let paw = (x: B.pressX + 132, y: 1593 - s.lift * KoaRepairScene.pxPerUnit)
      #expect(abs(paw.x - B.buttonPx.x) < 1)
      #expect(abs(paw.y - B.buttonPx.y) < B.buttonRPx + 12, "tay chạm nút (\(paw.y) vs \(B.buttonPx.y))")
      #expect(B.shot(at: at - B.start + 0.05).board.press > 0.5, "nút lún")
      #expect(B.shot(at: at - B.start + 0.3).board.powered == poweredAfter)
      #expect(s.pops.contains { $0.text == "koa.repair.pop.click" } || B.shot(at: at - B.start + 0.02).pops.contains { $0.text == "koa.repair.pop.click" })
    }
    #expect(B.shot(at: B.T("wait") + 0.2 - B.start).lift < 0.01, "đứng chờ trên sàn")
    // nút nằm ngay dưới mép bảng, không đè vào màn bảng
    let p = B.screenPx
    #expect(B.buttonPx.y - B.buttonRPx > p.y + p.h - B.buttonRPx && B.buttonPx.x > p.x && B.buttonPx.x < p.x + p.w / 2)
  }
}

extension KoaRepairSceneTests {
  @Test("khung cuối không còn bóng thoại hay cử chỉ, mặt trở về mặt của phòng")
  func lastFrameMatchesTheRoom() {
    let last = KoaRepairScene.Board.shots().last!
    #expect((last.bubble?.alpha ?? 0) < 0.01)
    #expect(last.gesture == nil || last.gestureAmount < 0.01)
    #expect(last.expression == .happy)
  }
}

@Suite("KoaRepairScene.Stage")
struct KoaRepairStageTests {
  let shots = KoaRepairScene.Stage.shots()

  @Test("vào và ra cảnh ở giữa bục, máy toàn cảnh; khung cuối như phòng")
  func entersAndLeavesOnStage() {
    for s in [shots[0], shots[shots.count - 1]] {
      #expect(abs(s.x - 195) < 1)
      #expect(abs(s.feet - 412) < 1)
      #expect(abs(s.camera.zoom - 1) < 0.01)
    }
    let last = shots[shots.count - 1]
    #expect((last.bubble?.alpha ?? 0) < 0.01)
    #expect(last.expression == .happy)
    #expect(last.repaired)
    #expect(last.stage.crackAlpha == 0)
  }

  @Test("lúc bôi keo, miệng tuýp nằm ngay trên điểm keo đang chạy tới")
  func nozzleRidesTheCrack() {
    let fps = 30.0
    var checked = 0
    for (i, s) in shots.enumerated() {
      guard let stream = s.stage.stream else { continue }
      let t = Double(i) / fps + KoaRepairScene.Stage.start
      let n = KoaRepairScene.Stage.nozzle(s, t: t)!
      #expect(abs(n.x - stream.to.x) < 0.01)
      #expect(stream.from.y < stream.to.y)        // keo chảy xuống
      checked += 1
    }
    #expect(checked > 30)
  }

  @Test("vết nứt mờ dần qua ba cú nén, mất khi đáp; đèn chạy một vòng rưỡi")
  func crackFadesThenLightsRun() {
    let alphas = shots.map(\.stage.crackAlpha)
    #expect(alphas.first == 1)
    #expect(Set(alphas.filter { $0 > 0 }).count >= 3)
    #expect(alphas.last == 0)
    #expect(shots.contains { ($0.stage.lights ?? 0) > 0.95 })
    #expect(shots.contains { $0.stage.flyingTube != nil })
  }

  @Test("tiếng theo thứ tự, nằm trong cảnh")
  func cuesOrdered() {
    let cues = KoaRepairScene.Stage.cues
    #expect(cues.map(\.t) == cues.map(\.t).sorted())
    #expect(cues.allSatisfy { $0.t >= 0 && $0.t <= KoaRepairScene.Stage.duration })
  }
}

@Suite("KoaRepairScene.Floor")
struct KoaRepairFloorTests {
  let F = KoaRepairScene.Floor.self
  var shots: [KoaRepairScene.Shot] { F.shots() }

  @Test("vào và ra cảnh ở giữa bục, máy toàn cảnh; khung cuối như phòng")
  func entersAndLeavesOnStage() {
    let all = shots
    for s in [all[0], all[all.count - 1]] {
      #expect(abs(s.x - 195) < 1)
      #expect(abs(s.feet - 412) < 1)
      #expect(abs(s.camera.zoom - 1) < 0.01)
    }
    let last = all[all.count - 1]
    #expect((last.bubble?.alpha ?? 0) < 0.01)
    #expect(last.expression == .happy)
    #expect(last.floor.angle < 0.3)
    #expect(last.floor.nailSink == 1)
  }

  /// Ngưỡng 1,6 (từ 1,5, 08/11 khi gộp với quay 2.5D `KoaTurn`): Koa quay `turn = 0,25` lúc đóng đinh, tay dời theo
  /// chiều sâu ~0,08 đơn vị hình — đầu búa lệch tối đa 1,52, dưới một điểm ảnh.
  @Test("ba cú búa: đầu búa chạm đúng đầu đinh (lệch < 1,6 đơn vị)")
  func hammerHitsTheNail() {
    let all = shots
    let nail = all.last!.floor.nailX!, top = KoaRepairScene.roomY(F.pivotPx.y - 6)
    for h in [10.9, 11.3, 11.8] {
      let i = Int(((h - F.start) * 30).rounded())
      let head = F.hammerHead(all[i], t: Double(i) / 30 + F.start)!
      #expect(abs(head.x - nail) < 1.6)
      #expect(abs(head.y - top) < 1.6)
    }
  }

  @Test("ván bật lúc đầu cảnh, nằm khi Koa giẫm, bật lại khi bước ra, phẳng sau khi đóng")
  func plankSprings() {
    #expect(F.plankAngle(F.start) > 10)
    #expect(F.plankAngle(8.2) < 0.5)            // Koa đứng trên ván
    #expect(F.plankAngle(8.8) > 10)             // bước ra: bật lại
    #expect(F.plankAngle(13) < 0.5)
  }

  @Test("tiếng theo thứ tự, nằm trong cảnh")
  func cuesOrdered() {
    let cues = F.cues
    #expect(cues.map(\.t) == cues.map(\.t).sorted())
    #expect(cues.allSatisfy { $0.t >= 0 && $0.t <= F.duration })
  }
}

@Suite("KoaRepairScene.Neon")
struct KoaRepairNeonTests {
  let N = KoaRepairScene.Neon.self

  @Test("vào và ra cảnh ở giữa bục, máy toàn cảnh; khung cuối như phòng, đèn sáng")
  func entersAndLeavesOnStage() {
    let all = N.shots()
    for s in [all[0], all[all.count - 1]] {
      #expect(abs(s.x - 195) < 1)
      #expect(abs(s.feet - 412) < 1)
      #expect(abs(s.camera.zoom - 1) < 0.01)
      #expect(!s.flip && !s.hidden)
    }
    let last = all[all.count - 1]
    #expect((last.bubble?.alpha ?? 0) < 0.01)
    #expect(last.expression == .happy)
    #expect(last.neon.broken == 0)
    #expect(all[0].neon.broken == 1)
  }

  @Test("ba cú búa chạm mép dưới bảng neon; tia lửa đúng chỗ đầu búa")
  func hammerHitsTheSign() {
    let all = N.shots()
    let bottom = KoaRepairScene.roomY(N.signPx.y + N.signPx.h)
    let left = KoaRepairScene.roomX(N.signPx.x), right = KoaRepairScene.roomX(N.signPx.x + N.signPx.w)
    for h in N.hits {
      let i = Int(((h - N.start) * 30).rounded())
      let head = KoaRepairScene.hammerHead(all[i], t: Double(i) / 30 + N.start)!
      #expect(abs(head.y - bottom) < 8)
      #expect(left < head.x && head.x < right)
      #expect(all[i].neon.hit == head)
    }
  }

  @Test("thang: vác trên đầu → dựng → đứng; Koa leo lên nóc, xuống lại sàn")
  func ladderStory() {
    let all = N.shots()
    #expect(all.contains { $0.neon.ladder?.carried == true })
    #expect(all.contains { $0.neon.ladder?.spread == 1 })
    #expect(all.contains { $0.neon.koaOnLadder && $0.flip })
    #expect(all.contains { $0.hidden })     // chạy vụt khỏi phòng đi lấy thang
  }

  @Test("tiếng theo thứ tự, nằm trong cảnh")
  func cuesOrdered() {
    let cues = N.cues
    #expect(cues.map(\.t) == cues.map(\.t).sorted())
    #expect(cues.allSatisfy { $0.t >= 0 && $0.t <= N.duration })
  }
}
