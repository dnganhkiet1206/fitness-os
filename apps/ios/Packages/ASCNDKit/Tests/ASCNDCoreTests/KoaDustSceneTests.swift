import Testing

@testable import ASCNDCore

/// Đoạn diễn dọn bụi (cảnh B, storyboard Kiệt duyệt 06/11).
@Suite("KoaRepairScene.Dust")
struct KoaDustSceneTests {
  let D = KoaRepairScene.Dust.self
  var shots: [KoaRepairScene.Shot] { D.shots() }
  func at(_ t: Double, _ all: [KoaRepairScene.Shot]) -> KoaRepairScene.Shot { all[min(all.count - 1, Int(((t - D.start) * 30).rounded()))] }

  @Test("vào và ra cảnh ở giữa bục, máy toàn cảnh; tiếng theo thứ tự trong đoạn")
  func entersAndLeaves() {
    let all = shots
    #expect(abs(all[0].x - 195) < 1 && abs(all[0].feet - 412) < 1)
    #expect(abs(all[0].camera.zoom - 1) < 0.01)
    let cues = D.cues
    #expect(!cues.isEmpty && cues.first!.t >= 0 && cues.last!.t <= D.duration)
    #expect(zip(cues, cues.dropFirst()).allSatisfy { $0.t <= $1.t })
    #expect(all.last!.repaired)
    #expect((all.last!.dust.iris ?? 0) > 0.95)
  }

  @Test("khăn lau đúng vùng bụi: kệ khi lau kệ, bảng khi lau bảng")
  func clothWipesItsRegion() {
    let all = shots
    func inside(_ p: KoaRepairScene.Pt, _ r: (x: Double, y: Double, w: Double, h: Double)) -> Bool {
      let a = KoaRepairScene.room(r.x - 80, r.y - 80), b = KoaRepairScene.room(r.x + r.w + 80, r.y + r.h + 80)
      return a.x <= p.x && p.x <= b.x && a.y <= p.y && p.y <= b.y
    }
    let shelf = all.filter { $0.dust.wipe == .shelf }, board = all.filter { $0.dust.wipe == .board }
    #expect(shelf.count > 40 && board.count > 30)
    #expect(shelf.allSatisfy { $0.dust.paw.map { inside($0, D.shelfRegionPx) } == true })
    #expect(board.allSatisfy { $0.dust.paw.map { inside($0, D.boardRegionPx) } == true })
  }

  @Test("mạng nhện rơi từ góc bảng xuống đúng đỉnh đầu Koa rồi bị hất văng")
  func cobwebLandsOnHead() {
    let all = shots
    let s = at(16.9, all)
    guard let web = s.dust.webFall, let top = KoaRender.anchors(KoaRepairScene.options(s, t: 16.9))["head_top_fur"] else {
      Issue.record("không có mạng nhện"); return
    }
    let head = KoaRepairScene.local(s, top.x, top.y)
    #expect(abs(web.x - head.x) < 1 && abs(web.y - head.y - 30 / KoaRepairScene.pxPerUnit) < 1)
    #expect(!at(16.5, all).dust.webOn)
    #expect(at(15.5, all).dust.webOn)
    #expect(at(17.7, all).dust.webFall == nil)
  }

  @Test("xô, bọt dính Koa, lốc xoáy, sao và phòng sạch đúng nhịp")
  func foamSpinAndClean() {
    let all = shots
    #expect(at(21.0, all).dust.bucket == 0 && at(22.0, all).dust.bucket > 0.9)
    #expect(at(22.2, all).dust.pour)
    #expect(at(25.0, all).dust.foamOnKoa == 1 && at(24.0, all).dust.foamOnKoa == 0)
    #expect(at(26.45, all).dust.tornado && !at(26.05, all).dust.tornado)
    #expect(at(27.3, all).dust.stars != nil)
    #expect(at(24.4, all).dust.clean == 0 && at(25.5, all).dust.clean == 1)
    #expect(at(20.0, all).dust.high != nil && at(18.5, all).dust.high == nil && at(20.9, all).dust.high == nil)
  }
}
