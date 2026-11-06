import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn nghỉ giữa hai set có Koa, toàn màn hình (07/11, Kiệt: "thay cho phần đồng hồ đếm giờ nghỉ cũ nên phải tích
/// hợp luôn các tính năng nghỉ giữa hiệp"). Thay thẻ nghỉ cũ (`FocusRestCard`) ở màn từng set.
///
/// Đủ tính năng của thẻ cũ: đồng hồ + vòng (5 giây cuối đổi màu), −15s / tạm dừng / +15s, set tiếp theo, bỏ qua nghỉ,
/// sửa set vừa xong, dòng kỷ lục. Thêm: thu nhỏ để xem cả buổi (dải nghỉ gọn ở đầu danh sách, chạm để mở lại).
///
/// Koa kể chuyện theo ĐỒNG HỒ THẬT (`KoaRestStory`): xong set → thở cùng bạn (chữ dẫn nhịp hít / thở 4 giây) →
/// chuẩn bị ở giây cuối → đếm ngược → "Lên set!".
struct KoaRestScreen: View {
  let timer: RestTimer
  /// Set vừa xong: "Squat · 80 kg × 5".
  let justDone: String?
  /// "Squat · Set 2/2 · 80 kg × 5" — `nil` khi đã hết set.
  let next: String?
  var record: String?
  var onAdjust: (Int) -> Void
  var onSkip: () -> Void
  var onSetPaused: (Bool) -> Void
  /// Mỗi giây: hết giờ quá 1 giây thì controller đóng quãng nghỉ (trước đây không ai gọi nhịp này, thẻ cũ đứng ở 0).
  var onSettle: () -> Void = {}
  var onMinimize: () -> Void
  /// Sửa set vừa xong (bỏ tích, huỷ nghỉ); `nil` = không sửa được.
  var onEditJustDone: (() -> Void)?
  /// Dừng ở một mốc (ms từ lúc mở) — chỉ để chụp so sánh.
  var frozen: Double?
  /// Lúc quãng nghỉ này mở lần đầu: thu nhỏ rồi mở lại thì Koa diễn TIẾP, không diễn lại "XONG SET!".
  var startedAt: Date?
  var onStarted: (Date) -> Void = { _ in }

  @State private var start = Date.now
  @State private var pausedAt: Date?
  @State private var heard = Heard()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  final class Heard { var played = Set<Int>(); var second = -1; var went = false; var tick = -1 }

  private static let bg = Color(red: 0.055, green: 0.059, blue: 0.071)
  private static let orange = Color(red: 0.91, green: 0.52, blue: 0.16)
  private static let rose = DS.Color.metricRose.swiftUI
  private static let gold = Color(red: 0.91, green: 0.70, blue: 0.23)

  var body: some View {
    // reduce-motion: Koa đứng yên, không nhún / thở theo nhịp; chữ dẫn nhịp và đồng hồ vẫn chạy
    TimelineView(.animation) { ctx in
      let elapsed = frozen ?? max(0, ctx.date.timeIntervalSince(startedAt ?? start) * 1000)
      let now = frozen.map { EpochMillis(start.addingTimeInterval($0 / 1000)) } ?? EpochMillis(ctx.date)
      let leftMs = leftMillis(at: now)
      let left = timer.remaining(at: now)
      let pausedFor = timer.isPaused ? ((frozen != nil ? 1000 : ctx.date.timeIntervalSince(pausedAt ?? ctx.date) * 1000)) : nil
      let m = KoaRestStory.at(elapsed: elapsed, left: leftMs, total: Double(timer.total), pausedFor: pausedFor)
      GeometryReader { geo in
        ZStack {
          Self.bg.ignoresSafeArea()
          RadialGradient(colors: [Self.orange.opacity(0.26), .clear], center: UnitPoint(x: 0.5, y: 0.40), startRadius: 0,
                         endRadius: geo.size.width * 0.85)
            .ignoresSafeArea()
          Ellipse().fill(RadialGradient(colors: [Self.orange.opacity(0.2), .clear], center: .center, startRadius: 0,
                                        endRadius: geo.size.width * 0.38))
            .frame(width: geo.size.width * 0.8, height: geo.size.width * 0.16)
            .position(x: geo.size.width / 2, y: geo.size.height * 0.56)
          sweat(m, elapsed: elapsed, size: geo.size)
          VStack(spacing: 0) {
            header(m, elapsed: elapsed)
            Spacer(minLength: 0)
            koa(m.frame, size: geo.size)
            captionView(m, left: left)
              .padding(.top, 18)
            Spacer(minLength: 0)
            clock(left: left, now: now)
            controls(paused: timer.isPaused)
              .padding(.top, DS.Spacing.md)
            nextCard
              .padding(.top, DS.Spacing.md)
            skipButton(m)
              .padding(.top, DS.Spacing.md)
          }
          .padding(.horizontal, DS.Spacing.lg)
          .padding(.bottom, DS.Spacing.md)
        }
        .onChange(of: Int(elapsed / 16)) { _, _ in fire(m, elapsed: elapsed, left: left) }
      }
    }
    .onAppear {
      if timer.isPaused { pausedAt = .now }
      if startedAt == nil { onStarted(start) } else { heard.played = Set(KoaPerformance.sounds(.set).indices) }
    }
    .onChange(of: timer.isPaused) { _, p in pausedAt = p ? .now : nil }
    .preferredColorScheme(.dark)
  }

  private func leftMillis(at now: EpochMillis) -> Double {
    if let p = timer.pausedLeft { return Double(p) * 1000 }
    return Double(timer.endsAt.millis - now.millis)
  }

  // MARK: đầu màn

  private func header(_ m: KoaRestStory.Moment, elapsed: Double) -> some View {
    // "XONG SET!" lớn lúc hạ tạ, rồi thu về dòng nhỏ trên đầu (không biến mất: người dùng vẫn biết vừa xong gì)
    let big = elapsed >= 1700 && elapsed < 4200
    let shown = min(1, max(0, (elapsed - 1700) / 160))
    return VStack(spacing: 6) {
      HStack {
        Button(action: onMinimize) {
          Image(systemName: "chevron.down")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white.opacity(0.8))
            .frame(width: 44, height: 44)
            .background(.white.opacity(0.08), in: Circle())
        }
        .accessibilityLabel(Text("koa.rest.minimize"))
        .accessibilityIdentifier("workout.rest.minimize")
        Spacer()
        if let justDone {
          HStack(spacing: 6) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Self.rose)
            Text(verbatim: justDone).lineLimit(1).monospacedDigit()
          }
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white.opacity(0.85))
          .opacity(big ? 0 : 1)
          if let onEditJustDone {
            Button(String(localized: "ws.edit"), action: onEditJustDone)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(Self.rose)
              .frame(minHeight: 44)
              .opacity(big ? 0 : 1)
          }
        }
      }
      ZStack {
        if big {
          VStack(spacing: 4) {
            Text("koa.rest.setDone")
              .font(.system(size: 40, weight: .heavy, design: .rounded))
              .foregroundStyle(.white)
              .shadow(color: .black.opacity(0.45), radius: 10, y: 4)
              .scaleEffect(reduceMotion ? 1 : 1 + 0.3 * max(0, 1 - (elapsed - 1700) / 220))
            if let justDone {
              Text(verbatim: justDone).font(.system(size: 17, weight: .medium)).foregroundStyle(.white.opacity(0.8))
            }
          }
          .opacity(shown * min(1, (4200 - elapsed) / 300))
        }
        if let record, !big {
          Text(verbatim: record)
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(.black.opacity(0.85))
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(Capsule().fill(Self.gold))
        }
      }
      .frame(height: 76)
    }
  }

  // MARK: Koa

  private func koa(_ f: KoaPerformance.Frame, size: CGSize) -> some View {
    let fig = min(size.width * 0.62, 260.0)
    let unit = fig / 240
    let still = reduceMotion
    return ZStack {
      Ellipse().fill(Color(red: 0.68, green: 0.71, blue: 0.75).opacity(0.3))
        .frame(width: 128 * unit, height: 18 * unit)
        .offset(y: (294 - 150) * unit)
      KoaFigureView(
        expression: f.expression, pose: .idle, gesture: nil, worn: [.hand: "dumbbell"], size: fig, animated: true,
        stage: false, walk: still ? KoaWalk.Pose() : f.walk, bleeds: true,
        headLook: KoaMath.Gaze(x: f.look.x, y: f.look.y, k: 1), eyes: KoaMath.Gaze(x: f.eyes.x, y: f.eyes.y, k: 1),
        turn: still ? 0 : f.turn, groundShadow: false, gestureAmount: 0
      )
      .scaleEffect(x: still ? 1 : f.sx, y: still ? 1 : f.sy, anchor: .bottom)
    }
    .frame(height: fig * 1.12)
    .accessibilityHidden(true)
  }

  private func captionView(_ m: KoaRestStory.Moment, left: Int) -> some View {
    let text: String? = switch m.caption {
    case .inhale: String(localized: "koa.rest.inhale")
    case .exhale: String(localized: "koa.rest.exhale")
    case .getReady: String(localized: "koa.rest.getReady")
    case .go: String(localized: "koa.rest.go")
    case .paused: String(localized: "workout.rest.title.paused")
    case nil: nil
    }
    return HStack(spacing: 10) {
      if m.beat == .breathe {
        // vòng thở: phồng khi hít vào, xẹp khi thở ra
        Circle().stroke(.white.opacity(0.5), lineWidth: 2)
          .frame(width: 14 + 10 * m.breath, height: 14 + 10 * m.breath)
          .frame(width: 26, height: 26)
      }
      Text(verbatim: text ?? " ")
        .font(.system(size: m.beat == .go ? 26 : 19, weight: m.beat == .go ? .heavy : .medium, design: .rounded))
        .foregroundStyle(.white.opacity(m.beat == .breathe ? 0.75 : 0.95))
    }
    .frame(height: 34)
    .animation(.easeInOut(duration: 0.4), value: m.caption)
    .accessibilityHidden(m.caption == nil)
  }

  private func sweat(_ m: KoaRestStory.Moment, elapsed: Double, size: CGSize) -> some View {
    Canvas { c, sz in
      guard !reduceMotion, m.frame.expression == .pant else { return }
      let cx = sz.width / 2, cy = sz.height * 0.3
      for i in 0..<3 {
        let q = (elapsed / 1100 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
        let r = CGRect(x: cx - 70 + Double(i) * 62, y: cy + q * 70, width: 10, height: 15)
        c.fill(Path(ellipseIn: r), with: .color(Color(red: 0.62, green: 0.85, blue: 0.95).opacity(0.8 * (1 - q))))
      }
    }
    .allowsHitTesting(false)
  }

  // MARK: đồng hồ + nút

  private func clock(left: Int, now: EpochMillis) -> some View {
    let paused = timer.isPaused
    let warning = RestTimer.warns(left: left, paused: paused)
    return VStack(spacing: 8) {
      Text(verbatim: RestTimer.label(seconds: left))
        .font(.system(size: 64, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .contentTransition(.numericText(countsDown: true))
        .foregroundStyle(warning ? Self.gold : .white)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(.white.opacity(0.1))
          Capsule().fill(warning ? Self.gold : Self.rose)
            .frame(width: g.size.width * timer.ringFraction(at: now))
        }
      }
      .frame(height: 6)
      .padding(.horizontal, DS.Spacing.xl)
    }
    .accessibilityElement()
    .accessibilityLabel(Text(String(format: String(localized: "workout.rest.left"), left)))
    .accessibilityIdentifier("workout.rest.clock")
  }

  private func controls(paused: Bool) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      chip(Text(verbatim: "−15s"), String(format: String(localized: "workout.rest.adjust"), "-15")) { onAdjust(-15) }
      chip(Image(systemName: paused ? "play.fill" : "pause.fill"),
           String(localized: paused ? "workout.rest.resume" : "workout.rest.pause")) { onSetPaused(!paused) }
      chip(Text(verbatim: "+15s"), String(format: String(localized: "workout.rest.adjust"), "+15")) { onAdjust(15) }
    }
  }

  private func chip<Label: View>(_ label: Label, _ a11y: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      label
        .font(.system(size: 16, weight: .semibold).monospacedDigit())
        .foregroundStyle(.white)
        .frame(minWidth: 76, minHeight: 46)
        .background(.white.opacity(0.09), in: Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: a11y))
  }

  @ViewBuilder private var nextCard: some View {
    if let next {
      VStack(spacing: 2) {
        Text(String(localized: "ws.rest.next"))
          .font(.system(size: 12, weight: .semibold))
          .textCase(.uppercase)
          .tracking(0.8)
          .foregroundStyle(.white.opacity(0.5))
        Text(verbatim: next)
          .font(.system(size: 17, weight: .semibold).monospacedDigit())
          .foregroundStyle(.white)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 12)
      .background(RoundedRectangle(cornerRadius: 16).fill(.white.opacity(0.06)))
      .accessibilityElement(children: .combine)
    }
  }

  private func skipButton(_ m: KoaRestStory.Moment) -> some View {
    let ready = m.beat == .ready || m.beat == .countdown || m.beat == .go
    return Button(action: onSkip) {
      Text(String(localized: next == nil ? "ws.rest.skip" : "koa.rest.startNext"))
        .font(.system(size: 18, weight: .bold))
        .foregroundStyle(ready ? .white : .white.opacity(0.9))
        .frame(maxWidth: .infinity, minHeight: 54)
        .background(Capsule().fill(ready ? Self.rose : .white.opacity(0.1)))
        .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityIdentifier("workout.rest.skip")
  }

  // MARK: tiếng + rung

  private func fire(_ m: KoaRestStory.Moment, elapsed: Double, left: Int) {
    guard frozen == nil else { return }
    for (i, s) in KoaPerformance.sounds(.set).enumerated() where s.t <= elapsed && !heard.played.contains(i) {
      heard.played.insert(i)
      if elapsed - s.t < 250 { KoaSound.reaction(s.name, gain: s.gain) }
    }
    let sec = Int(elapsed / 1000)
    if sec != heard.tick { heard.tick = sec; onSettle() }
    if m.beat == .countdown, left != heard.second, left > 0 {
      heard.second = left
      KoaSound.reaction("koa-rx-tick", gain: 0.55)
    }
    if m.beat == .go, !heard.went {
      heard.went = true
      KoaSound.reaction("koa-rx-pump", gain: 0.8)
    }
  }
}
