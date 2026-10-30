#if DEBUG
  import ASCNDCore
  import SwiftUI

  /// Lớp debug của phòng Koa (chỉ bản Debug, chip "map" ở thanh DEV): sân khấu, sàn đi
  /// được, vùng chặn, bậc lên bục, chỗ ghé từng đồ vật + hướng nhìn, chỗ gần người xem, đích
  /// và đường đi hiện tại, cùng hành vi / lý do / kiểu đi / biểu cảm / ánh nhìn / độ sâu.
  struct KoaMapOverlay: View {
    let frame: KoaDirector.Frame?

    var body: some View {
      Canvas { ctx, size in
        let k = size.width / StudioScene.width
        func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * k, y: y * k) }
        func screen(_ s: KoaRoomMap.Spot) -> CGPoint { pt(s.x, KoaRoomMap.screenY(s)) }
        // sân khấu: mặt bục (vẽ ở cao bục) + vùng đứng được
        let c = KoaRoomMap.stageCenter, r = KoaRoomMap.stageRadius, i = KoaRoomMap.stageInner
        let h = KoaRoomMap.stageHeight
        ctx.stroke(
          Path(ellipseIn: CGRect(x: (c.x - r.x) * k, y: (c.d - h - r.d) * k, width: 2 * r.x * k, height: 2 * r.d * k)),
          with: .color(.yellow), lineWidth: 1)
        ctx.fill(
          Path(ellipseIn: CGRect(x: (c.x - i.x) * k, y: (c.d - h - i.d) * k, width: 2 * i.x * k, height: 2 * i.d * k)),
          with: .color(.yellow.opacity(0.18)))
        // sàn đi được
        var floor = Path()
        for (j, p) in KoaRoomMap.floorArea.enumerated() {
          if j == 0 { floor.move(to: pt(p.x, p.d)) } else { floor.addLine(to: pt(p.x, p.d)) }
        }
        floor.closeSubpath()
        ctx.fill(floor, with: .color(.green.opacity(0.22)))
        ctx.stroke(floor, with: .color(.green), lineWidth: 1)
        // vùng chặn
        for b in KoaRoomMap.blocks {
          let rect = CGRect(x: b.minX * k, y: b.minD * k, width: (b.maxX - b.minX) * k, height: (b.maxD - b.minD) * k)
          ctx.fill(Path(rect), with: .color(.red.opacity(0.25)))
          ctx.stroke(Path(rect), with: .color(.red), lineWidth: 1)
        }
        // bậc lên / xuống bục
        for s in KoaRoomMap.steps {
          var p = Path()
          p.move(to: screen(s.floor))
          p.addLine(to: screen(s.stage))
          ctx.stroke(p, with: .color(.orange), style: StrokeStyle(lineWidth: 2, dash: [3, 2]))
        }
        // chỗ ghé + hướng nhìn
        for a in KoaRoomMap.anchors {
          let s = screen(a.stand)
          ctx.fill(Path(ellipseIn: CGRect(x: s.x - 4, y: s.y - 4, width: 8, height: 8)), with: .color(.cyan))
          var p = Path()
          p.move(to: s)
          p.addLine(to: pt(a.look.x, a.look.y))
          ctx.stroke(p, with: .color(.cyan.opacity(0.6)), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
          ctx.draw(Text(verbatim: "\(a.name) · \(a.action.rawValue)").font(.system(size: 8)).foregroundStyle(.cyan), at: CGPoint(x: s.x, y: s.y + 9))
        }
        let u = screen(KoaRoomMap.user)
        ctx.fill(Path(ellipseIn: CGRect(x: u.x - 5, y: u.y - 5, width: 10, height: 10)), with: .color(.pink))
        ctx.draw(Text(verbatim: "user").font(.system(size: 8)).foregroundStyle(.pink), at: CGPoint(x: u.x, y: u.y + 10))
        guard let f = frame else { return }
        // đường đi + đích
        if !f.path.isEmpty {
          var p = Path()
          p.move(to: pt(f.x, f.screenY))
          for s in f.path { p.addLine(to: screen(s)) }
          ctx.stroke(p, with: .color(.white), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
        }
        if let t = f.target {
          let s = screen(t)
          ctx.stroke(Path(ellipseIn: CGRect(x: s.x - 7, y: s.y - 7, width: 14, height: 14)), with: .color(.white), lineWidth: 2)
        }
        // Koa: điểm chân
        ctx.fill(Path(ellipseIn: CGRect(x: f.x * k - 3, y: f.screenY * k - 3, width: 6, height: 6)), with: .color(.white))
        let g = f.gaze
        let lines = [
          "\(f.behavior) · \(f.style)",
          f.why,
          "face \(f.expression?.rawValue ?? "mood") · gesture \(f.gesture?.rawValue ?? "-") \(String(format: "%.2f", f.gestureAmount))",
          String(format: "eyes %.2f,%.2f head %.2f,%.2f blink %.1f", g.eyes.x, g.eyes.y, g.head.x, g.head.y, g.blink),
          String(format: "%@ d %.0f scale %.2f sway %.1f", "\(f.plane)", f.depth, f.scale, f.plantSway),
        ]
        var y = 8.0
        for l in lines {
          ctx.draw(
            Text(verbatim: l).font(.system(size: 9, weight: .medium).monospaced()).foregroundStyle(.white),
            at: CGPoint(x: 8, y: y), anchor: .topLeading)
          y += 12
        }
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
    }
  }
#endif
