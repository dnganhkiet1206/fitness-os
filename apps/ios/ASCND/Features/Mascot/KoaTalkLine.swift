import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Câu chữ của `KoaTalk`: ngắn, có số thật khi có. Thiếu số thì trả `nil`, Koa thà im còn hơn đoán.
enum KoaTalkLine {
  static func text(_ b: KoaTalk.Beat, signals: DailySignals?, profile: Profile?) -> String? {
    let v = b.variant
    switch b.topic {
    case .greet: return v == 0 ? String(localized: "koa.talk.greet.0") : String(localized: "koa.talk.greet.1")
    case .trained: return v == 0 ? String(localized: "koa.talk.trained.0") : String(localized: "koa.talk.trained.1")
    case .record: return v == 0 ? String(localized: "koa.talk.record.0") : String(localized: "koa.talk.record.1")
    case .comeback: return v == 0 ? String(localized: "koa.talk.comeback.0") : String(localized: "koa.talk.comeback.1")
    case .restDay: return v == 0 ? String(localized: "koa.talk.restDay.0") : String(localized: "koa.talk.restDay.1")
    case .allDone: return v == 0 ? String(localized: "koa.talk.allDone.0") : String(localized: "koa.talk.allDone.1")
    case .emptyLate: return v == 0 ? String(localized: "koa.talk.emptyLate.0") : String(localized: "koa.talk.emptyLate.1")
    case .fed: return v == 0 ? String(localized: "koa.talk.fed.0") : String(localized: "koa.talk.fed.1")
    case .calm: return v == 0 ? String(localized: "koa.talk.calm.0") : String(localized: "koa.talk.calm.1")
    case .nudge: return String(localized: "koa.talk.nudge")
    case .birthday: return String(localized: "koa.talk.birthday")
    case .rested, .shortSleep:
      guard let minutes = signals?.sleepMinutes, minutes > 0 else { return nil }
      let m = Int(minutes.rounded())
      let slept = String(localized: "today.d.sleep \(m / 60) \(m % 60)")
      return b.topic == .rested ? String(localized: "koa.talk.rested \(slept)") : String(localized: "koa.talk.shortSleep \(slept)")
    case .overate:
      guard let kcal = signals?.kcal, let profile else { return nil }
      return String(localized: "koa.talk.overate \(KoaMood.kcalPercent(kcal: kcal, target: NutritionToday.calorieTarget(profile)))")
    // câu của mốc / của kệ cúp do phòng dựng từ số thật (`MascotRoomView.talkLine`)
    case .milestone, .shelf: return nil
    case .pokeHead: return v == 0 ? String(localized: "koa.talk.pokeHead.0") : String(localized: "koa.talk.pokeHead.1")
    case .pokeEar: return v == 0 ? String(localized: "koa.talk.pokeEar.0") : String(localized: "koa.talk.pokeEar.1")
    case .pokeNose: return v == 0 ? String(localized: "koa.talk.pokeNose.0") : String(localized: "koa.talk.pokeNose.1")
    case .pokeBelly: return v == 0 ? String(localized: "koa.talk.pokeBelly.0") : String(localized: "koa.talk.pokeBelly.1")
    case .pokeFeet: return v == 0 ? String(localized: "koa.talk.pokeFeet.0") : String(localized: "koa.talk.pokeFeet.1")
    case .pokeFace: return v == 0 ? String(localized: "koa.talk.pokeFace.0") : String(localized: "koa.talk.pokeFace.1")
    case .poke:
      switch v {
      case 0: return String(localized: "koa.talk.poke.0")
      case 1: return String(localized: "koa.talk.poke.1")
      case 2: return String(localized: "koa.talk.poke.2")
      default: return String(localized: "koa.talk.poke.3")
      }
    }
  }
}

/// Bóng thoại trên đầu Koa: đi theo Koa, không tràn khỏi màn, đuôi luôn chỉ về phía Koa.
struct KoaBubble: View {
  let line: String
  let width: CGFloat
  /// Toạ độ phòng.
  let x: Double
  let headY: Double

  private var k: Double { Double(width) / StudioScene.width }
  private var centerX: Double { min(Double(width) - 96, max(96, x * k)) }

  var body: some View {
    VStack(spacing: 0) {
      Text(verbatim: line)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(Color.black.opacity(0.85))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(Color(red: 0.98, green: 0.96, blue: 0.92), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
      BubbleTail()
        .fill(Color(red: 0.98, green: 0.96, blue: 0.92))
        .frame(width: 16, height: 9)
        .offset(x: (x * k - centerX) * 0.5, y: -1)
    }
    .frame(maxWidth: 190)
    .shadow(color: .black.opacity(0.25), radius: 8, y: 3)
    .frame(width: 190, height: 110, alignment: .bottom)
    .position(x: centerX, y: headY * k - 52)
    .allowsHitTesting(false)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: line))
    .accessibilityAddTraits(.updatesFrequently)
  }
}

private struct BubbleTail: Shape {
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: r.minX, y: r.minY))
    p.addQuadCurve(to: CGPoint(x: r.midX, y: r.maxY), control: CGPoint(x: r.midX - 2, y: r.minY + 2))
    p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY), control: CGPoint(x: r.midX + 2, y: r.minY + 2))
    p.closeSubpath()
    return p
  }
}
