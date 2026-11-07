import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

#if DEBUG
  /// Beat board màn nghỉ bằng chính Koa vector của app (07/11, Kiệt: "sao nhìn koa cứ kì kì vậy" về nháp 3D).
  /// `SIMCTL_CHILD_ASCND_DEBUG_KOA_BEAT=1…5`: một khung toàn màn, nền studio tối giản.
  struct KoaRestBeatPanel: View {
    static var beat: Int? { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_BEAT"].flatMap(Int.init) }
    let beat: Int

    private struct Spec {
      var pose: KoaFlags.Pose = .idle
      var face: KoaFlags.Expression
      var hand: String?
      var armR = -6.0, armL = 4.0
      var look = (0.0, 0.0)
      var turn = 0.0
      var zoom = 1.0
      var chip = false
    }

    private var spec: Spec {
      switch beat {
      case 1: Spec(face: .puff, hand: "dumbbell", armR: -38, armL: 6, look: (0.1, 0.2), turn: -0.15)
      case 2: Spec(pose: .relaxing, face: .warm, hand: "bottle", look: (0, -0.2), turn: 0.15, zoom: 1.08)
      case 3: Spec(pose: .relaxing, face: .sleepy, look: (0.2, 0.35), turn: -0.2, zoom: 1.08)
      case 4: Spec(pose: .relaxing, face: .surprised, look: (0.25, -0.5), zoom: 1.08, chip: true)
      default: Spec(face: .grin, hand: "dumbbell", armR: -100, armL: 24, look: (0, -0.1), turn: 0.15, zoom: 1.12)
      }
    }

    var body: some View {
      let s = spec
      var walk = KoaWalk.Pose()
      walk.armRight = s.armR; walk.armLeft = s.armL; walk.flipRaisedArms = true
      return GeometryReader { geo in
        ZStack {
          Color(red: 0.07, green: 0.075, blue: 0.086).ignoresSafeArea()
          RadialGradient(colors: [Color(red: 0.18, green: 0.165, blue: 0.145), .clear], center: UnitPoint(x: 0.5, y: 0.5),
                         startRadius: 0, endRadius: geo.size.width * 0.75)
            .ignoresSafeArea()
          KoaFigureView(
            expression: s.face, pose: s.pose, worn: s.hand.map { [.hand: $0] } ?? [:], size: geo.size.width * 0.7,
            animated: true, walk: s.pose == .idle ? walk : nil, headLook: KoaMath.Gaze(x: s.look.0, y: s.look.1, k: 1),
            eyes: KoaMath.Gaze(x: s.look.0, y: s.look.1, k: 1), turn: s.turn)
            .scaleEffect(s.zoom, anchor: .bottom)
            .position(x: geo.size.width / 2, y: geo.size.height * 0.5)
          if s.chip {
            VStack(spacing: 6) {
              Text(verbatim: "+2,5 kg").font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(Color(red: 0.09, green: 0.09, blue: 0.1))
                .padding(.horizontal, 22).padding(.vertical, 10)
                .background(Capsule().fill(Color(red: 0.91, green: 0.52, blue: 0.16)))
              Text(verbatim: "so với lần trước").font(.system(size: 15, weight: .medium)).foregroundStyle(.white.opacity(0.6))
            }
            .position(x: geo.size.width * 0.5, y: geo.size.height * 0.2)
          }
        }
      }
      .statusBarHidden()
    }
  }

  /// Lưới soát mặt có tham số: `SIMCTL_CHILD_ASCND_DEBUG_KOA_RIG=1`.
  struct KoaFaceRigGrid: View {
    static var enabled: Bool { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_RIG"] != nil }
    private let faces: [(String, KoaFaceRig)] = [
      ("strain", .strain), ("spent", .spent), ("rested", .rested), ("unimpressed", .unimpressed), ("sigh", .sigh),
      ("warm", .warm), ("content", .content), ("consider", .consider), ("determined", .determined),
      ("waiting", .waiting), ("doze", .doze), ("½ spent→rested", .mix(.spent, .rested, 0.5)),
    ]
    var body: some View {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 3), spacing: 4) {
        ForEach(faces.indices, id: \.self) { i in
          VStack(spacing: 0) {
            KoaFigureView(expression: .happy, pose: i >= 9 ? .relaxing : .idle, size: 128, animated: true,
                          headLook: i >= 9 ? KoaMath.Gaze(x: i == 9 ? 0.8 : -0.8, y: 0.4, k: 1) : nil,
                          eyes: i >= 9 ? KoaMath.Gaze(x: i == 9 ? 0.9 : -0.9, y: 0.5, k: 1) : nil, rig: faces[i].1)
              .frame(width: 128, height: 150)
            Text(verbatim: faces[i].0).font(.caption2).foregroundStyle(.white)
          }
        }
      }
      .padding(.top, 50)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .background(Color(red: 0.1, green: 0.1, blue: 0.12))
    }
  }

  /// Màn nghỉ dựng sẵn để chụp storyboard: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REST=90`, `…_KOA_REST_T=<ms>` dừng ở mốc ấy.
  /// Đồng hồ thật của màn (nút ±15, tạm dừng chạy được trên một quãng nghỉ cục bộ).
  struct KoaRestPreview: View {
    static var total: Int? { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REST"].flatMap(Int.init) }
    static var frozen: Double? { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REST_T"].flatMap(Double.init) }
    let total: Int
    @State private var began = Date.now
    @State private var timer: RestTimer?

    var body: some View {
      ZStack {
        Color.black.ignoresSafeArea()
        if let timer {
          KoaRestScreen(
            timer: timer, justDone: "Squat · 80 kg × 5", next: "Squat · Set 2/2 · 80 kg × 5",
            onAdjust: { self.timer = self.timer?.adjusted(by: $0, at: EpochMillis(Date.now)) },
            onSkip: { restart() },
            onSetPaused: { p in self.timer = p ? self.timer?.paused(at: EpochMillis(Date.now)) : self.timer?.resumed(at: EpochMillis(Date.now)) },
            onSettle: { if self.timer?.phase(at: EpochMillis(Date.now)) == .over { restart() } },
            onMinimize: {}, onEditJustDone: nil, frozen: Self.frozen, startedAt: began)
          .id(began)
        }
      }
      .onAppear { if timer == nil { restart() } }
    }

    private func restart() {
      began = .now
      timer = RestTimer.start(seconds: total, at: EpochMillis(began))
    }
  }
#endif

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

  final class Heard {
    var played = Set<Int>(); var second = -1; var went = false; var tick = -1
    var beat: KoaRestStory.Beat?; var beatAt = 0.0; var sighed = false; var stood = false
  }

  /// Tiếng cảnh 1 (ms từ lúc mở): gồng, tạ chạm sàn "cộp" + chuông "xong set", ngồi phịch, thở ra.
  private static let sounds: [KoaPerformance.Sound] = [
    .init(t: 0, name: "koa-rx-lift", gain: 0.6), .init(t: 1100, name: "koa-rx-land", gain: 0.8),
    .init(t: 1150, name: "koa-rx-set", gain: 0.9), .init(t: 1550, name: "koa-rx-land", gain: 0.45),
    .init(t: 1700, name: "koa-rx-exhale", gain: 0.8),
  ]

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
          VStack(spacing: 0) {
            header(m, elapsed: elapsed)
            Spacer(minLength: 0)
            koa(m, size: geo.size)
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
      if startedAt == nil { onStarted(start) } else { heard.played = Set(Self.sounds.indices) }
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
    let big = elapsed >= 1800 && elapsed < 4000
    let shown = min(1, max(0, (elapsed - 1800) / 160))
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
            Text(verbatim: justDone).lineLimit(1).minimumScaleFactor(0.7).monospacedDigit()
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
              .scaleEffect(reduceMotion ? 1 : 1 + 0.3 * max(0, 1 - (elapsed - 1800) / 220))
            if let justDone {
              Text(verbatim: justDone).font(.system(size: 17, weight: .medium)).foregroundStyle(.white.opacity(0.8))
            }
          }
          .opacity(shown * min(1, (4000 - elapsed) / 300))
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

  /// Koa trên sân khấu + máy quay của đoạn (`KoaRestStory.Camera`): đẩy / lùi, hạ thấp, nghiêng. Khung mờ dần ở
  /// mép trên / dưới để cận mặt không cắt cứng.
  private func koa(_ m: KoaRestStory.Moment, size: CGSize) -> some View {
    let f = m.frame
    let fig = min(size.width * 0.62, 260.0)
    let unit = fig / 240
    let still = reduceMotion
    let cam = still ? KoaRestStory.Camera() : m.camera
    return ZStack {
      Ellipse().fill(Color(red: 0.68, green: 0.71, blue: 0.75).opacity(0.3))
        .frame(width: 128 * unit, height: 18 * unit)
        .offset(y: (294 - 150) * unit)
      if m.dumbbellOnFloor {
        // tạ đã đặt xuống, nằm cạnh chân (sẽ được nhặt lên khi chuẩn bị)
        Image(systemName: "dumbbell.fill")
          .font(.system(size: 34 * unit, weight: .bold))
          .foregroundStyle(Color(red: 0.27, green: 0.30, blue: 0.36))
          .rotationEffect(.degrees(-8))
          .offset(x: 92 * unit, y: (286 - 150) * unit)
      }
      KoaFigureView(
        expression: .happy, pose: m.pose, gesture: nil, worn: m.hand.map { [.hand: $0] } ?? [:], size: fig,
        animated: true,
        stage: false, walk: still ? KoaWalk.Pose() : f.walk, bleeds: true,
        headLook: KoaMath.Gaze(x: f.look.x, y: f.look.y, k: 1), eyes: KoaMath.Gaze(x: f.eyes.x, y: f.eyes.y, k: 1),
        turn: still ? 0 : f.turn, groundShadow: false, rig: m.face, gestureAmount: 0
      )
      .scaleEffect(x: still ? 1 : f.sx, y: still ? 1 : f.sy, anchor: .bottom)
    }
    .scaleEffect(cam.zoom, anchor: UnitPoint(x: 0.5, y: cam.anchor))
    .rotationEffect(.degrees(cam.tilt), anchor: .bottom)
    .offset(x: -cam.dx * size.width, y: cam.dy * fig)
    .frame(width: size.width, height: fig * 1.5, alignment: .bottom)
    // chừa khoảng trên đầu cho máy thấp / cận; chỉ mờ ở mép trên (chân luôn đứng trên sàn, không mờ)
    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.12)],
                         startPoint: .top, endPoint: .bottom))
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
      if m.beat == .recover {
        // vòng thở: phồng khi hít vào, xẹp khi thở ra
        Circle().stroke(.white.opacity(0.5), lineWidth: 2)
          .frame(width: 14 + 10 * m.breath, height: 14 + 10 * m.breath)
          .frame(width: 26, height: 26)
      }
      Text(verbatim: text ?? " ")
        .font(.system(size: m.beat == .go ? 26 : 19, weight: m.beat == .go ? .heavy : .medium, design: .rounded))
        .foregroundStyle(.white.opacity(m.beat == .recover ? 0.75 : 0.95))
    }
    .frame(height: 34)
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: m.caption)
    .accessibilityHidden(m.caption == nil)
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
    let ready = m.beat == .decide || m.beat == .countdown || m.beat == .go
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
    for (i, s) in Self.sounds.enumerated() where s.t <= elapsed && !heard.played.contains(i) {
      heard.played.insert(i)
      if elapsed - s.t < 250 { KoaSound.reaction(s.name, gain: s.gain) }
    }
    let sec = Int(elapsed / 1000)
    if sec != heard.tick { heard.tick = sec; onSettle() }
    if m.beat == .countdown, left != heard.second, left > 0 {
      heard.second = left
      KoaSound.reaction("koa-rx-tick", gain: 0.55)
    }
    // tiếng theo cảnh: thở dài khi liếc tạ, hít sâu khi quyết định, đứng dậy
    if heard.beat != m.beat { heard.beat = m.beat; heard.beatAt = elapsed
      if m.beat == .decide { KoaSound.reaction("koa-rx-inhale", gain: 0.6) }
    }
    if m.beat == .sideEye, !heard.sighed, elapsed - heard.beatAt > 3000 {
      heard.sighed = true; KoaSound.reaction("koa-rx-exhale", gain: 0.6)
    }
    if m.beat == .decide, m.pose == .idle, !heard.stood { heard.stood = true; KoaSound.reaction("koa-rx-whoosh", gain: 0.4) }
    if m.beat == .go, !heard.went {
      heard.went = true
      KoaSound.reaction("koa-rx-pump", gain: 0.8)
    }
  }
}
