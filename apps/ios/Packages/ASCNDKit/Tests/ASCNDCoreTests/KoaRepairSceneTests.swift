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
    #expect(last.board.plugged)
    #expect(last.repaired)
  }

  @Test("giữa cảnh bảng tắt, bị rút phích rồi đếm khởi động")
  func boardGoesDarkAndReboots() {
    let shots = KoaRepairScene.Board.shots()
    #expect(shots.contains { $0.board.dark > 0.9 })
    #expect(shots.contains { !$0.board.plugged })
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
    #expect(abs((a.x + b.x) / 2 - 321) < 1.5)
    #expect(abs((a.y + b.y) / 2 - 277) < 1.5)
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
