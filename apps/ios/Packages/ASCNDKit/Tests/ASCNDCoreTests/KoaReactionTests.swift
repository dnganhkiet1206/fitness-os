@testable import ASCNDCore
import Foundation
import Testing

/// Koa phản ứng toàn màn hình (05/11): storyboard dữ liệu của ba cảnh.
struct KoaReactionTests {
  @Test func scenesHaveTheAgreedLengths() {
    #expect(KoaReaction.duration(.set) <= 2600, "ghi set lặp lại mỗi set: ngắn nhất")
    #expect((3500...4500).contains(KoaReaction.duration(.record)))
    #expect((5500...6500).contains(KoaReaction.duration(.done)))
  }

  @Test func timelineWalksShotsInOrderAndHoldsTheLast() {
    let s = KoaReaction.shots(.set)
    #expect(KoaReaction.at(.set, 0).index == 0)
    #expect(KoaReaction.at(.set, s[0].ms + 1).index == 1)
    let end = KoaReaction.at(.set, KoaReaction.duration(.set) + 500)
    #expect(end.index == s.count - 1 && end.progress == 1)
  }

  @Test func usesOnlyPosesAndFacesTheAppDraws() {
    for scene in KoaReaction.Scene.allCases {
      for shot in KoaReaction.shots(scene) {
        // cảnh dùng dáng đã vẽ (đứng, cầm tạ, ngồi) hoặc dáng biểu cảm có sẵn
        #expect([.idle, .lifting, .relaxing].contains(shot.pose), "\(scene) \(shot.label)")
        #expect(KoaFlags.expressionLabel[shot.expression] != nil)
      }
    }
    #expect(KoaReaction.shots(.set).last?.motion == .intoRing, "ghi set kết thúc trong vòng đồng hồ nghỉ")
  }

  @Test func jumpAnticipatesFliesAndLands() {
    #expect(KoaReaction.body(.jump, 0.1).sy < 1, "nhún lấy đà")
    #expect(KoaReaction.body(.jump, 0.35).dy < -0.15, "bay lên")
    #expect(KoaReaction.body(.jump, 0.62).sy < 1, "tiếp đất nén")
    #expect(KoaReaction.body(.jump, 0.9) == (0, 1, 1))
  }

  @Test func poseChangesHideUnderASquashInsteadOfACrossfade() {
    #expect(KoaReaction.poseSwap(0).old && KoaReaction.poseSwap(60).sy < 0.95, "nén xuống, còn dáng cũ")
    let pop = KoaReaction.poseSwap(KoaReaction.poseSquashMs + 1)
    #expect(!pop.old && pop.sy < 1, "đổi dáng lúc nén sâu nhất rồi nảy lên")
    #expect(KoaReaction.poseSwap(KoaReaction.poseSquashMs + 90).sy > 1, "vượt đà")
    #expect(KoaReaction.poseSwap(2000) == (1, 1, false))
    #expect(abs(KoaReaction.backOut(1) - 1) < 1e-9 && KoaReaction.backOut(0.7) > 1, "hiện dần có vượt đà")
  }
}

/// Bản diễn liền (05/11 lần 4): không đổi dáng, lớp theo đà tự tính, tiếng theo nhịp.
struct KoaPerformanceTests {
  @Test func everySceneIsOneTakeWithNoPoseSwaps() {
    for scene in KoaReaction.Scene.allCases {
      let fs = KoaPerformance.frames(scene)
      #expect(fs.count == Int((KoaPerformance.duration(scene) / 1000 * KoaPerformance.hz).rounded()) + 1)
      // thân không nhảy cóc giữa hai khung liền nhau (không có cú đổi dáng)
      for (a, b) in zip(fs, fs.dropFirst()) {
        #expect(abs(a.walk.bob - b.walk.bob) < 8, "\(scene) — cú bật nhảy nhanh nhất khoảng 6 đơn vị một khung")
        #expect(abs(a.walk.armRight - b.walk.armRight) < 16, "\(scene) — buông tạ + run tay tối đa ~14°, đổi dáng sẽ là ~90°")
      }
    }
  }

  @Test func headAndEarsFollowThroughAfterTheBodyStops() {
    // cảnh kỷ lục: tiếp đất ở 2,42 s → đầu / tai còn đung đưa sau đó rồi lắng
    let after = KoaPerformance.frame(.record, at: 2520)
    #expect(abs(after.walk.earLag) > 0.3, "tai còn theo đà")
    let settled = KoaPerformance.frame(.record, at: 4400)
    #expect(abs(settled.walk.headLag) < 1.5, "rồi lắng")
  }

  @Test func eyesLeadTheHead() {
    // mắt nhìn trước đầu: lúc liếc sang trái ở cảnh xong buổi, mắt đã sang trước
    let f = KoaPerformance.frame(.done, at: 2050)
    #expect(f.eyes.x < f.look.x)
  }

  @Test func soundsAreFewQuietAndOnTheBeat() {
    for scene in KoaReaction.Scene.allCases {
      let ss = KoaPerformance.sounds(scene)
      #expect(ss.count <= 10, "tối giản")
      #expect(ss.allSatisfy { $0.gain <= 1 && $0.name.hasPrefix("koa-rx-") && $0.t <= KoaPerformance.duration(scene) })
    }
    #expect(KoaPerformance.sounds(.record).contains { $0.t == 860 && $0.name == "koa-rx-record" }, "tiếng kỷ lục đúng lúc chớp")
  }
}

/// Ba lỗi Kiệt thấy ở v4 (06/11): khung cắt đầu lúc nhảy, dáng mệt như què một chân, nền nhảy theo Koa.
struct KoaPerformanceFixTests {
  @Test func jumpsMoveTheWholeFigureNotTheDrawingInsideItsFrame() {
    for scene in KoaReaction.Scene.allCases {
      let fs = KoaPerformance.frames(scene)
      #expect(fs.allSatisfy { $0.walk.bob <= KoaPerformance.inCanvasBob && $0.air >= 0 }, "\(scene)")
    }
    #expect(KoaPerformance.frames(.record).map(\.air).max() ?? 0 > 25, "cú nhảy kỷ lục vẫn bay cao")
  }

  @Test func frontViewNeverTiltsSideways() {
    for scene in KoaReaction.Scene.allCases {
      #expect(KoaPerformance.frames(scene).allSatisfy {
        abs($0.walk.lean) <= KoaPerformance.maxTilt && abs($0.walk.sway) <= KoaPerformance.maxTilt
      }, "\(scene): nghiêng ngang quá thì Koa như què một chân")
    }
  }

  @Test func groundShadowCanBeLeftToTheScene() {
    func ellipses(_ e: KoaRender.Element) -> Int { (e.tag == "Ellipse" ? 1 : 0) + e.kids.reduce(0) { $0 + ellipses($1) } }
    var o = KoaRender.Options()
    o.live = false
    let with = ellipses(KoaRender.figure(o))
    o.groundShadow = false
    #expect(ellipses(KoaRender.figure(o)) < with, "bỏ elip bóng (cả các lượt đèn của nó); bóng nằm yên trên sàn do màn vẽ")
  }
}

extension KoaPerformanceFixTests {
  @Test func workoutStatsStayOnScreenUntilTheEnd() {
    let total = KoaPerformance.duration(.done)
    let stats = KoaPerformance.cues(.done).first { !$0.stats.isEmpty }
    #expect(stats?.to == total, "3 thẻ số liệu giữ tới hết cảnh")
    #expect((total - (stats?.from ?? total)) >= 3500, "đủ lâu để đọc")
  }
}

extension KoaPerformanceFixTests {
  @Test func raisedArmsNeverSlipBehindTheCheek() {
    for scene in KoaReaction.Scene.allCases {
      #expect(KoaPerformance.frames(scene).allSatisfy {
        $0.walk.armLeft <= KoaPerformance.maxArmRaise && $0.walk.armRight >= -KoaPerformance.maxArmRaise
      }, "\(scene): tay giơ quá thì lọt sau má, đồ cầm tay lòi ra như cắm vào mặt")
    }
  }
}
