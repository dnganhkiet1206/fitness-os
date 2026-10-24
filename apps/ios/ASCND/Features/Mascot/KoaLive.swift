import ASCNDCore
import SwiftUI

/// Koa lớn "sống" (#527, 23/10 — theo trang hỗ trợ Kiệt thích; không có ở RN).
/// Chỉ thêm cử động và ánh sáng quanh hình; bản vẽ không đổi.

/// Ngón tay trên Koa → ánh nhìn + phản ứng chạm, làm mượt từng khung. Không quan sát
/// được — như `KoaClock`, chỉ là ô nhớ giữa các khung của `TimelineView` (không có
/// đồng hồ riêng: hết khung là hết tính).
@MainActor
final class KoaTouch {
  struct Frame {
    var look: KoaMath.Gaze?
    var poke: KoaMath.Poke
  }

  /// Chỗ ngón tay, −1…1 quanh đầu Koa; `nil` khi đã nhấc tay.
  private var target: (x: Double, y: Double)?
  private var x = 0.0, y = 0.0, k = 0.0, lift = 0.0
  private var last: Double?
  private var pokedAt: Double?

  func aim(x: Double, y: Double) {
    target = (min(1, max(-1, x)), min(1, max(-1, y)))
  }

  func release() { target = nil }

  /// Bắt đầu một cú nhảy; đang nhảy thì bỏ qua (như trang web).
  func poke(at ms: Double) -> Bool {
    if let p = pokedAt, ms - p < KoaMath.hopDur { return false }
    pokedAt = ms
    return true
  }

  func frame(_ ms: Double) -> Frame {
    // dừng lâu rồi chạy lại: không nhảy cóc
    let dt = last.map { min(0.1, max(0, (ms - $0) / 1000)) } ?? 0
    last = ms
    let held = target != nil
    // bám ngón tay nhanh, trả về giữa chậm hơn
    let a = 1 - exp(-dt / (held ? 0.12 : 0.35))
    x += ((target?.x ?? 0) - x) * a
    y += ((target?.y ?? 0) - y) * a
    k += ((held ? 1 : 0) - k) * a
    lift += ((held ? 1 : 0) - lift) * (1 - exp(-dt / 0.1))
    if let p = pokedAt, ms - p >= KoaMath.hopDur { pokedAt = nil }
    let look = k > 0.002 ? KoaMath.Gaze(x: x, y: y, k: k) : nil
    let since = pokedAt.map { ms - $0 }
    // luôn có `Poke`: Koa lớn còn tai giật lúc rảnh và nét mi khi chớp
    let poke = KoaMath.Poke(ms: since, lift: lift > 0.002 ? lift : 0, lean: look.map { $0.x * $0.k } ?? 0)
    return Frame(look: look, poke: poke)
  }
}

/// Đổi nét mặt thì "nảy" nhẹ: nén ngang → giãn → về, neo ở chân.
struct KoaPop: ViewModifier {
  let on: Bool
  let expression: KoaFlags.Expression

  struct Scale {
    var x = 1.0
    var y = 1.0
  }

  func body(content: Content) -> some View {
    content.keyframeAnimator(initialValue: Scale(), trigger: expression) { view, s in
      view.scaleEffect(x: s.x, y: s.y, anchor: .bottom)
    } keyframes: { _ in
      KeyframeTrack(\.x) {
        CubicKeyframe(on ? 0.94 : 1, duration: 0.12)
        CubicKeyframe(on ? 1.03 : 1, duration: 0.16)
        CubicKeyframe(1, duration: 0.22)
      }
      KeyframeTrack(\.y) {
        CubicKeyframe(on ? 1.05 : 1, duration: 0.12)
        CubicKeyframe(on ? 0.97 : 1, duration: 0.16)
        CubicKeyframe(1, duration: 0.22)
      }
    }
  }
}

/// Sân khấu của Koa, chỉ bản tối: chùm đèn tan dần từ trên đầu, sàn sáng theo màu hạng,
/// viền ấm trên mép hình, quầng màu và bóng đổ — Koa đứng TRONG ánh đèn chứ không như
/// dán lên nền. Reduce Transparency: bỏ chùm đèn / sàn / quầng, giữ viền và bóng.
struct KoaStage: ViewModifier {
  let on: Bool
  let glow: Color
  let solid: Bool
  let size: CGFloat

  /// Màu đèn: màu hạng; hạng đầu (xám) dùng cam ấm của trang hỗ trợ.
  static func colour(_ build: Int) -> Color {
    guard build > 0 else { return Color(red: 1, green: 0.45, blue: 0.1) }
    return Color(hex: MascotRules.ranks[min(build, MascotRules.ranks.count - 1)].colorHex)
  }

  func body(content: Content) -> some View {
    if on {
      let k = size / 240
      let w = size, h = size * KoaMath.aspect
      content
        .compositingGroup()
        .shadow(color: Color(red: 1, green: 0.84, blue: 0.7).opacity(0.5), radius: 0, y: -1)
        .shadow(color: glow.opacity(solid ? 0 : 0.26), radius: 12 * k)
        .shadow(color: .black.opacity(0.5), radius: 14 * k, y: 22 * k)
        .background(alignment: .top) {
          if !solid {
            // chùm đèn: tâm trên đầu Koa (23% cao), mờ dần mọi phía
            EllipticalGradient(
              stops: [
                .init(color: glow.opacity(0.3), location: 0), .init(color: glow.opacity(0.08), location: 0.55),
                .init(color: glow.opacity(0), location: 0.72),
              ]
            )
            .frame(width: 0.82 * w, height: 1.38 * h)
            .offset(y: (0.23 - 0.69) * h)
            .allowsHitTesting(false)
          }
        }
        .background(alignment: .top) {
          if !solid {
            // sàn sáng dưới chân
            EllipticalGradient(
              stops: [
                .init(color: glow.opacity(0.45), location: 0), .init(color: glow.opacity(0.08), location: 0.48),
                .init(color: glow.opacity(0), location: 0.72),
              ]
            )
            .frame(width: 0.86 * w * 1.414, height: 0.16 * h * 1.414)
            .offset(y: 0.94 * h - 0.08 * h * 1.414)
            .allowsHitTesting(false)
          }
        }
    } else {
      content
    }
  }
}
