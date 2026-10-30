@testable import ASCNDCore
import Foundation
import Testing

/// Hiệu năng của Koa (30/10): in số đo từng phần việc mỗi khung (`[koa-perf]` trong log), và
/// chặn những hồi quy KHÔNG phụ thuộc máy: bộ nhớ đệm phải trúng (không phân tích lại chuỗi
/// mới mỗi khung ngoài vài transform bàn chân), phòng chỉ dựng lại phần cần. Không đặt ngưỡng
/// thời gian tuyệt đối: bản test là Debug, chạy song song, trên máy CI khác nhau (đo thật bằng
/// `-koaBench` trên simulator — xem CONSTRAINTS_AND_DEFERRED.md).
struct KoaPerfTests {
  static func time(_ n: Int, _ body: () -> Void) -> Double {
    let start = DispatchTime.now().uptimeNanoseconds
    for _ in 0..<n { body() }
    return Double(DispatchTime.now().uptimeNanoseconds - start) / 1e6 / Double(n)
  }

  /// Một khung đạo diễn (đi bộ + ánh nhìn + lập lịch) — phải rẻ hơn hẳn một khung vẽ.
  @Test func directorStepIsCheap() {
    var d = KoaDirector.Director(seed: 1)
    d.request(.walkTo(KoaRoomMap.Spot(.stage, 120, 440)))
    let ms = Self.time(3000) { _ = d.step(1.0 / 60, ctx: .init()) }
    print("[koa-perf] director.step \(String(format: "%.4f", ms)) ms")
  }

  /// Dựng cây hình Koa + giải kiểu cho một khung đang đi (việc nặng nhất của CPU mỗi khung).
  @Test func figureFrameBudget() {
    var d = KoaDirector.Director(seed: 1)
    d.request(.walkTo(KoaRoomMap.Spot(.stage, 120, 440)))
    for _ in 0..<60 { _ = d.step(1.0 / 60, ctx: .init()) }
    let f = d.step(1.0 / 60, ctx: .init())
    var o = KoaRender.Options()
    o.walk = f.walk
    o.eyes = f.gaze.eyes
    o.look = f.gaze.head
    o.blink = f.gaze.blink
    o.t = 1234
    var t = 0.0
    let ms = Self.time(40) {
      t += 16
      o.t = 1234 + t
      _ = KoaPaint.plan(KoaRender.figure(o))
    }
    print("[koa-perf] figure+plan \(String(format: "%.3f", ms)) ms")
    // bộ nhớ đệm: thêm 30 khung đi bộ chỉ thêm vài chuỗi transform mới mỗi khung (bàn chân,
    // quay mặt), không phân tích lại cả cây
    let before = KoaMath.opsMemo.count, defsBefore = KoaRender.defsMemo.count
    for _ in 0..<30 {
      let g = d.step(1.0 / 60, ctx: .init())
      o.walk = g.walk
      _ = KoaPaint.plan(KoaRender.figure(o))
    }
    // (bộ nhớ đệm dùng chung với test khác chạy song song; đầy thì tự xoá — khi ấy bỏ qua)
    let grew = KoaMath.opsMemo.count - before
    if grew >= 0 { #expect(grew <= 30 * 6, "transform mới mỗi khung: \(Double(grew) / 30)") }
    let defsGrew = KoaRender.defsMemo.count - defsBefore
    if defsGrew >= 0 { #expect(defsGrew <= 2, "defs dựng lại theo khung: \(defsGrew)") }
  }

  /// Căn phòng: dựng một lần (app lưu sẵn theo tuỳ chọn) — đo để biết vì sao phải lưu.
  @Test func roomPlanIsWorthCaching() {
    var o = StudioScene.Options()
    o.depth = true
    let ms = Self.time(5) { _ = KoaPaint.plan(KoaRender.Element("Svg", kids: StudioScene.tree(o))) }
    print("[koa-perf] room plan \(String(format: "%.3f", ms)) ms")
  }

  /// Lá rung: chỉ phần từ chậu cây trở lên được dựng lại, không phải cả phòng.
  @Test func plantLayerIsSmallerThanRoom() {
    var o = StudioScene.Options()
    o.depth = true
    o.plantSway = 2
    let all = StudioScene.tree(o).count
    let top = StudioScene.objects(o, StudioScene.fromPlant).count
    var base = o
    base.omit = StudioScene.fromPlant
    let bottom = StudioScene.tree(base).count
    #expect(top < all && bottom < all)
  }
}
