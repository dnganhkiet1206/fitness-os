@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T60: các chỗ nối chưa có test trực tiếp — blob cảnh Koa (`KoaSceneData.swift`) và đường
/// `paused:` của `KoaWeek.state`.
@MainActor
struct KoaSeamsTests {
  // MARK: - Blob cảnh (sinh bởi `apps/ios/tools/insights-golden/gen-koa-scene.mjs`)

  private static func walk(_ nodes: [KoaScene.Node], _ visit: (KoaScene.Node) -> Void) {
    for n in nodes {
      visit(n)
      walk(n.kids ?? [], visit)
    }
  }

  /// Cảnh RN nguyên văn đọc được và còn đủ bộ phận chính (golden dùng nó qua `KoaScene.$rn`).
  @Test func rnSceneDecodesWithItsRigs() {
    let p = KoaScene.rnPayload
    #expect(!p.nodes.isEmpty && !p.keyframes.isEmpty)
    var ids = Set<String>()
    Self.walk(p.nodes) { if let id = $0.id { ids.insert(id) } }
    for rig in ["shadow", "POSERIG", "BODYRIG", "LEGS"] {
      #expect(ids.contains(rig), "thiếu \(rig)")
    }
  }

  /// Mọi hoạt ảnh trong cảnh đều trỏ tới khung có thật, thời lượng dương, kiểu dịu bộ vẽ biết (`KoaMath.ease`:
  /// lin / out / còn lại là io) — blob sinh lại hỏng thì đỏ ở đây chứ không thành Koa đứng im. Lần đầu chạy
  /// (20/11) bắt được giọt mồ hôi của tủ đồ ghi `"in"` (bộ vẽ lặng lẽ dùng io) — nguồn đã sửa thành io.
  @Test func everyAnimationPointsAtAKeyframeTrack() {
    for (name, p) in [("rn", KoaScene.rnPayload), ("wardrobe", KoaScene.wardrobePayload)] {
      var missing: [String] = []
      var bad: [String] = []
      Self.walk(p.nodes) { n in
        guard let a = n.anim else { return }
        if p.keyframes[a.k] == nil { missing.append(a.k) }
        if a.dur <= 0 || a.delay < 0 || !["lin", "out", "io"].contains(a.ease) { bad.append(a.k) }
      }
      #expect(missing.isEmpty, "\(name): khung không có: \(Set(missing).sorted())")
      #expect(bad.isEmpty, "\(name): thời lượng / dịu sai: \(Set(bad).sorted())")
    }
  }

  /// Tủ đồ vẽ lại chỉ thêm / thay lớp, không bớt bộ phận của cảnh RN; khung hình: giữ đủ của RN, thêm đúng
  /// `koaPantTongue` (lưỡi thè, `tools/koa-wardrobe/build.py`).
  @Test func wardrobeSceneKeepsTheRnRigsAndKeyframes() {
    var rn = Set<String>(), app = Set<String>()
    Self.walk(KoaScene.rnPayload.nodes) { if let id = $0.id { rn.insert(id) } }
    Self.walk(KoaScene.wardrobePayload.nodes) { if let id = $0.id { app.insert(id) } }
    for rig in ["shadow", "POSERIG", "BODYRIG", "LEGS"] { #expect(app.contains(rig) && rn.contains(rig)) }
    let added = Set(KoaScene.wardrobePayload.keyframes.keys).subtracting(KoaScene.rnPayload.keyframes.keys)
    #expect(Set(KoaScene.rnPayload.keyframes.keys).isSubset(of: KoaScene.wardrobePayload.keyframes.keys))
    #expect(added == ["koaPantTongue"])
  }

  /// Đầu tệp blob trỏ đúng chỗ của bộ sinh (trước ghi `tools/insights-golden/…`, nay ở `apps/ios/tools/`).
  @Test func generatorNamedInTheBlobExists() throws {
    let here = URL(fileURLWithPath: #filePath)
    let kit = here.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let blob = try String(contentsOf: kit.appending(path: "Sources/ASCNDCore/Koa/KoaSceneData.swift"), encoding: .utf8)
    let header = blob.split(separator: "\n").prefix(4).joined(separator: "\n")
    let ios = kit.deletingLastPathComponent().deletingLastPathComponent()
    #expect(header.contains("apps/ios/tools/insights-golden/gen-koa-scene.mjs"))
    #expect(FileManager.default.fileExists(atPath: ios.appending(path: "tools/insights-golden/gen-koa-scene.mjs").path))
  }

  // MARK: - Tuần của Koa có tạm nghỉ

  static let mon = KoaWeekTests.mon

  /// Nghỉ trên ngày đã tập: không bớt đích (buổi đã tập vẫn tính).
  @Test func pauseOnATrainedDayKeepsTheTarget() throws {
    let s = try #require(
      KoaWeek.state(today: Self.mon.adding(days: 4), library: KoaWeekTests.lib(), trained: [Self.mon],
                    paused: { $0 == Self.mon }))
    #expect(s.target == 3 && s.done == 1)
  }

  /// Nghỉ trên ngày nghỉ của lịch: không đổi gì.
  @Test func pauseOnAPlannedRestDayChangesNothing() throws {
    let rest = Self.mon.adding(days: 5)
    let s = try #require(
      KoaWeek.state(today: Self.mon.adding(days: 6), library: KoaWeekTests.lib(), trained: [], paused: { $0 == rest }))
    #expect(s.target == 3)
  }

  /// Nghỉ cả tuần (mọi buổi trong lịch chưa tập): không có tuần để đếm — không thẻ, không thưởng.
  @Test func pausingEveryPlannedSessionLeavesNoWeek() {
    let s = KoaWeek.state(today: Self.mon.adding(days: 6), library: KoaWeekTests.lib(), trained: [], paused: { _ in true })
    #expect(s == nil)
  }

  /// Nghỉ một buổi rồi tập đủ hai buổi còn lại: đủ tuần.
  @Test func pausedWeekCompletesWithTheRemainingSessions() throws {
    let fri = Self.mon.adding(days: 4)
    let s = try #require(
      KoaWeek.state(today: fri, library: KoaWeekTests.lib(), trained: [Self.mon, Self.mon.adding(days: 2)],
                    paused: { $0 == fri }))
    #expect(s.target == 2 && s.complete)
  }
}
