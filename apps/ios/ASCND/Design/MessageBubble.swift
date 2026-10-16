import SwiftUI

/// Bong bóng tin nhắn kiểu iMessage (16/10, chủ dự án: "thẻ tin nhắn phải được
/// làm như iMessage") — dùng chung cho nhắn tin và Koa Coach.
///
/// Của mình: xanh hệ thống, chữ trắng, đuôi phải. Của người kia: xám hệ thống,
/// chữ thường, đuôi trái. Đuôi chỉ ở tin cuối của một cụm liên tiếp, như iMessage.
enum MessageBubbleStyle {
  static let mine = Color(uiColor: .systemBlue)
  static let theirs = Color(uiColor: .secondarySystemFill)
  /// Phần đuôi lấn ra ngoài khung chữ.
  static let tailWidth: CGFloat = 6
}

/// Hình bong bóng: góc bo 18 và một đuôi cong ở góc dưới (trái cho người kia,
/// phải cho mình — lật gương). Không đuôi = viên bo đều.
struct MessageBubbleShape: Shape {
  var mine: Bool
  var tail: Bool

  func path(in rect: CGRect) -> Path {
    guard tail else {
      return RoundedRectangle(cornerRadius: 18, style: .continuous).path(in: rect)
    }
    // Vẽ dạng đuôi trái trong khung có lề `t` bên trái cho đuôi, rồi lật nếu là của mình.
    let w = rect.width, h = rect.height, t = MessageBubbleStyle.tailWidth, r: CGFloat = 18
    var p = Path()
    p.move(to: CGPoint(x: t + r, y: h))
    p.addLine(to: CGPoint(x: w - r, y: h))
    p.addCurve(to: CGPoint(x: w, y: h - r), control1: CGPoint(x: w - r * 0.45, y: h), control2: CGPoint(x: w, y: h - r * 0.45))
    p.addLine(to: CGPoint(x: w, y: r))
    p.addCurve(to: CGPoint(x: w - r, y: 0), control1: CGPoint(x: w, y: r * 0.45), control2: CGPoint(x: w - r * 0.45, y: 0))
    p.addLine(to: CGPoint(x: t + r, y: 0))
    p.addCurve(to: CGPoint(x: t, y: r), control1: CGPoint(x: t + r * 0.45, y: 0), control2: CGPoint(x: t, y: r * 0.45))
    p.addLine(to: CGPoint(x: t, y: h - 10))
    // Đuôi: cong xuống mép trái rồi vòng về đáy.
    p.addCurve(to: CGPoint(x: 0, y: h), control1: CGPoint(x: t, y: h - 2), control2: CGPoint(x: 0, y: h))
    p.addCurve(to: CGPoint(x: t + 8, y: h - 4), control1: CGPoint(x: 4, y: h + 0.5), control2: CGPoint(x: t + 4, y: h - 1))
    p.addCurve(to: CGPoint(x: t + r, y: h), control1: CGPoint(x: t + 11, y: h), control2: CGPoint(x: t + 14, y: h))
    p.closeSubpath()
    guard mine else { return p.offsetBy(dx: rect.minX, dy: rect.minY) }
    return p.applying(CGAffineTransform(scaleX: -1, y: 1).translatedBy(x: -w, y: 0))
      .offsetBy(dx: rect.minX, dy: rect.minY)
  }
}

extension View {
  /// Chữ trong bong bóng iMessage: lề, nền, đuôi (lề thêm phía đuôi).
  func messageBubble(mine: Bool, tail: Bool = true) -> some View {
    let t = tail ? MessageBubbleStyle.tailWidth : 0
    return self
      .font(.system(size: 17))
      .foregroundStyle(mine ? Color.white : Color.primary)
      .padding(.vertical, 8)
      .padding(.leading, 13 + (mine ? 0 : t))
      .padding(.trailing, 13 + (mine ? t : 0))
      .background(mine ? MessageBubbleStyle.mine : MessageBubbleStyle.theirs, in: MessageBubbleShape(mine: mine, tail: tail))
  }

  /// Tin vừa gửi bay lên từ ô soạn và nở ra như iMessage.
  func messageSendTransition(mine: Bool) -> some View {
    transition(
      .asymmetric(
        insertion: .move(edge: .bottom)
          .combined(with: .scale(scale: 0.6, anchor: mine ? .bottomTrailing : .bottomLeading))
          .combined(with: .opacity),
        removal: .opacity))
  }
}

/// "Đang gõ…" kiểu iMessage: ba chấm nhấp nhô lần lượt trong bong bóng xám.
struct TypingBubble: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(paused: reduceMotion)) { ctx in
      let t = ctx.date.timeIntervalSinceReferenceDate
      HStack(spacing: 5) {
        ForEach(0..<3, id: \.self) { i in
          let phase = reduceMotion ? 0.5 : Self.phase(at: t, dot: i)
          Circle()
            .fill(Color.secondary)
            .frame(width: 8, height: 8)
            .opacity(0.35 + 0.65 * phase)
            .offset(y: -2.5 * phase)
        }
      }
      .padding(.vertical, 13)
      .padding(.leading, 14 + MessageBubbleStyle.tailWidth)
      .padding(.trailing, 14)
      .background(MessageBubbleStyle.theirs, in: MessageBubbleShape(mine: false, tail: true))
    }
    .accessibilityElement(children: .ignore)
  }

  /// 0…1 cho chấm thứ `dot` tại thời điểm `t` — chu kỳ 1,2 s, các chấm lệch pha.
  /// Tách riêng: viết liền trong view, trình biên dịch của CI không kịp suy kiểu.
  static func phase(at t: TimeInterval, dot: Int) -> Double {
    let angle: Double = t * 2 * Double.pi / 1.2 - Double(dot) * 0.9
    return (sin(angle) + 1) / 2
  }
}
