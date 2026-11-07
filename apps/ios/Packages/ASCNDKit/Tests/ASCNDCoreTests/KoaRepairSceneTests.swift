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
