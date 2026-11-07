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

extension KoaPerformanceFixTests {
  @Test func noGestureDrawsArmsOverTheFace() {
    // `cheer` / `taDa` vẽ lớp tay đè lên đầu (`armsFront`): trong cảnh phản ứng tay phải nằm sau đầu đúng lớp
    #expect(KoaGesture.cheer.armsFront, "lý do: cheer vẽ tay trên mặt")
    for scene in KoaReaction.Scene.allCases {
      #expect(KoaPerformance.frames(scene).allSatisfy { $0.cheer == 0 }, "\(scene)")
    }
    // 06/11 Kiệt: "giơ tay thấp quá nên không vui" → ăn mừng giơ tay chữ V (≥ 100°), tay đã lật
    let peak = KoaPerformance.frames(.done).map(\.walk.armLeft).max() ?? 0
    #expect(peak >= 100, "lý do: tay ăn mừng thấp, không vui")
    #expect(KoaPerformance.frames(.record).map { -$0.walk.armRight }.max() ?? 0 >= 100)
    #expect(KoaPerformance.frame(.done, at: 5600).walk.flipRaisedArms)
  }
}

extension KoaPerformanceFixTests {
  @Test func raisedRigArmsFlipLikeTheCheerGesture() {
    // tay giơ cao lật hình (định thức âm) để bàn tay đúng chiều; tay đánh khi đi thì không
    #expect(KoaRender.armFlips(90) && KoaRender.armFlips(KoaRender.armFlipDeg))
    #expect(!KoaRender.armFlips(20) && !KoaRender.armFlips(-30))
    // mọi tư thế giơ đang giữ của cảnh phản ứng đều lật (bàn tay đúng chiều), không lật đi lật lại khi đấm tay
    for t in stride(from: 3220.0, through: 4500, by: 20) {
      #expect(KoaRender.armFlips(-KoaPerformance.frame(.record, at: t).walk.armRight), "kỷ lục \(t)")
    }
    for t in stride(from: 5000.0, through: 7500, by: 20) {
      #expect(KoaRender.armFlips(KoaPerformance.frame(.done, at: t).walk.armLeft), "xong buổi \(t)")
    }
    var w = KoaWalk.Pose()
    w.flipRaisedArms = true
    w.armLeft = 90
    func det(_ m: KoaMath.Mat) -> Double { m[0] * m[3] - m[1] * m[2] }
    guard let node = try? JSONDecoder().decode(KoaScene.Node.self, from: Data(#"{"t":"g","bind":"armRankL"}"#.utf8)) else {
      Issue.record("không dựng được nút"); return
    }
    #expect(KoaRender.walkMat(node, w).map(det).map { $0 < 0 } == true)
    w.armLeft = 20
    #expect(KoaRender.walkMat(node, w).map(det).map { $0 > 0 } == true)
    #expect(KoaScene.$rn.withValue(true) { !KoaRender.armFlips(90) }, "RN không lật")
    // chạy kéo thẻ (tay đánh ±40°) và đi trong phòng không bật lật: giữ như đã duyệt
    var run = KoaWalk.Pose()
    run.armLeft = 40
    #expect(KoaRender.walkMat(node, run).map(det).map { $0 > 0 } == true)
  }
}

extension KoaPerformanceFixTests {
  @Test func jumpsShowNoNeckGapOrLegSeams() {
    for scene in KoaReaction.Scene.allCases {
      let fs = KoaPerformance.frames(scene)
      #expect(fs.allSatisfy { abs($0.walk.headLag) <= KoaPerformance.maxHeadLag }, "\(scene): đầu nghiêng nhiều lộ khe cổ")
      #expect(fs.allSatisfy { $0.walk.bob >= KoaPerformance.minCanvasBob }, "\(scene): hạ thân sâu lộ vạch giữa hai chân")
    }
    // lấy đà vẫn đọc ra: cả hình nén xuống
    #expect(KoaPerformance.frame(.record, at: 1750).sy < 0.95)
    // đầu nghiêng thì có mảng vai / gáy lấp khe
    var w = KoaWalk.Pose()
    w.headLag = 3
    #expect(KoaRender.neckShows(w) && !KoaRender.neckShows(KoaWalk.Pose()))
    var up = KoaWalk.Pose()
    up.flipRaisedArms = true
    up.armLeft = 50
    #expect(KoaRender.neckShows(up), "tay giơ: lấp khe vai")
    up.flipRaisedArms = false
    #expect(!KoaRender.neckShows(up), "chạy kéo thẻ: không đổi")
    #expect(KoaScene.$rn.withValue(true) { !KoaRender.neckShows(w) })
  }
}

@Suite struct KoaReactionContentTests {
  /// 07/11: Kiệt duyệt storyboard xong buổi → chạy trong app bằng số thật, mốc / hiệu ứng giữ đúng bản duyệt.
  @Test func doneUsesRealNumbersOnApprovedTimeline() {
    let content = KoaReaction.Content(
      title: "XONG BUỔI!", subtitle: "Push A",
      stats: [.init(value: 3200, unit: "kg", label: "tổng khối lượng"), .init(value: 12, unit: "", label: "set"),
              .init(value: 4, unit: "", label: "bài")],
      gains: .init(title: "+10 Gains", subtitle: "còn 40 tới Lifter"))
    let mock = KoaPerformance.cues(.done), real = KoaPerformance.cues(.done, content: content)
    #expect(mock.map(\.from) == real.map(\.from))
    #expect(mock.map(\.to) == real.map(\.to))
    #expect(mock.map(\.effects) == real.map(\.effects))
    #expect(real[0].subtitle == "Push A")
    #expect(real.first { !$0.stats.isEmpty }?.stats.map(\.value) == [3200, 12, 4])
    #expect(real.last?.title == "+10 Gains")
    // không có Gains: vẫn pháo giấy, không chữ
    let none = KoaPerformance.cues(.done, content: .init(title: "X", subtitle: nil, stats: [], gains: nil))
    #expect(none.last?.title == nil && none.last?.effects.contains(.confetti) == true)
    #expect(KoaPerformance.cues(.done, content: nil).map(\.title) == mock.map(\.title))
  }
}

/// Màn nghỉ kiểu cảnh xong buổi + hoạt động xen giữa (07/11, Kiệt: "thêm nhiều hoạt động hơn để đỡ nhàm chán").
@Suite struct KoaRestActivityTests {
  typealias P = KoaPerformance

  @Test func ninetySecondRestHasManyActivitiesAndNoOverlapWithGo() {
    var seen = Set<KoaReaction.Scene>()
    var t = 0.0
    while t < 90_000 {
      let b = P.restBeat(elapsed: t, left: 90_000 - t, total: 90, paused: false)
      if let s = b.scene, P.restActivities.contains(s) {
        seen.insert(s)
        #expect(90_000 - t > P.restGoMs, "\(s) chồng lên đếm ngược ở \(t)")
      }
      t += 100
    }
    #expect(seen.count >= 5, "\(seen)")
  }

  @Test func activitiesStartAndEndStanding() {
    for s in P.restActivities {
      for f in [P.frame(s, at: 0), P.frame(s, at: P.duration(s))] {
        #expect(abs(f.walk.bob) < 1.6 && abs(f.walk.armLeft - 4) < 6 && abs(f.walk.armRight + 4) < 6, "\(s)")
      }
    }
  }

  @Test func seedChangesTheOrder() {
    let a = P.restBeat(elapsed: 8000, left: 82_000, total: 90, paused: false, seed: 0).scene
    let b = P.restBeat(elapsed: 8000, left: 82_000, total: 90, paused: false, seed: 3).scene
    #expect(a != nil && b != nil && a != b)
  }

  @Test func pausedRestOnlyBreathes() {
    #expect(P.restBeat(elapsed: 9000, left: 60_000, total: 90, paused: true).scene == nil)
  }
}
