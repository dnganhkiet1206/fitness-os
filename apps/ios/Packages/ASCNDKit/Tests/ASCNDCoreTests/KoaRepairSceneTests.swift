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
