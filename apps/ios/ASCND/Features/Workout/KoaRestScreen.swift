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
      case 6: Spec(pose: .lifting, face: .puff)
      case 7: Spec(pose: .lifting, face: .grin, zoom: 1.12)
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
            subtitle: "Squat · set 1/2",
            cards: [.init(value: "80 kg", label: "mức tạ"), .init(value: "5", label: "reps"),
                    .init(value: "+2,5 kg", label: "so với lần trước", accent: true)],
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

/// Màn nghỉ giữa hai set có Koa (07/11, Kiệt: "tại sao không làm theo kiểu như khi buổi tập xong"). Cùng bộ máy và
/// ngôn ngữ hình với cảnh xong buổi đã duyệt (`KoaReactionView`):
/// - sân khấu tối, quầng cam, vũng sáng trên sàn;
/// - Koa vector của app diễn một mạch (`KoaPerformance`);
/// - tiêu đề ở trên, thẻ số ở dưới.
///
/// Thay thẻ nghỉ cũ, đủ tính năng của nó (đồng hồ, −15s / tạm dừng / +15s, set tiếp theo, vào set tiếp, sửa set vừa
/// xong, kỷ lục, thu nhỏ).
///
/// Nhịp:
/// 1. `restIntro` (5,2 s): "XONG SET!", thở dốc, rũ tay, đứng thẳng; thẻ số của set hiện ra và ở lại.
/// 2. Thở đều (vòng nhẹ), giữa quãng nghỉ một cú vươn vai (`restStretch`, nghỉ ≥ 40 s).
/// 3. `restGo` (3,5 s cuối): nhún đếm ngược, hết giờ giơ tay chữ V "LƯỢT MÌNH!".
struct KoaRestScreen: View {
  #if DEBUG
    static var debugSeed: Int? { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REST_SEED"].flatMap(Int.init) }
  #else
    static let debugSeed: Int? = nil
  #endif
  /// Một thẻ số dưới Koa.
  struct Card: Hashable { let value: String; let label: String; var accent = false }

  let timer: RestTimer
  /// Set vừa xong: "Squat · 80 kg × 5".
  let justDone: String?
  /// "Squat · Set 2/2 · 80 kg × 5" — `nil` khi đã hết set.
  let next: String?
  var record: String?
  /// Tên bài + số set cho dòng phụ của "XONG SET!" ("Squat · set 1/2").
  var subtitle: String?
  /// Thẻ số của set (mức tạ, reps, so với lần trước). Rỗng = không thẻ.
  var cards: [Card] = []
  var onAdjust: (Int) -> Void
  var onSkip: () -> Void
  var onSetPaused: (Bool) -> Void
  /// Mỗi giây: hết giờ quá 1 giây thì controller đóng quãng nghỉ.
  var onSettle: () -> Void = {}
  var onMinimize: () -> Void
  /// Sửa set vừa xong (bỏ tích, huỷ nghỉ); `nil` = không sửa được.
  var onEditJustDone: (() -> Void)?
  /// Dừng ở một mốc (ms từ lúc mở) — chỉ để chụp so sánh.
  var frozen: Double?
  /// Lúc quãng nghỉ này mở lần đầu: thu nhỏ rồi mở lại thì Koa diễn tiếp, không diễn lại mở đầu.
  var startedAt: Date?
  var onStarted: (Date) -> Void = { _ in }

  @State private var start = Date.now
  @State private var heard = Heard()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  final class Heard { var scene: KoaReaction.Scene?; var played = Set<Int>(); var tick = -1 }

  private static let bg = Color(red: 0.055, green: 0.059, blue: 0.071)
  private static let orange = Color(red: 0.91, green: 0.52, blue: 0.16)
  private static let gold = Color(red: 0.91, green: 0.70, blue: 0.23)
  private static let rose = Color(red: 0.90, green: 0.33, blue: 0.42)

  /// Cảnh đang diễn và mốc trong cảnh; `nil` = đang thở đều.
  struct Beat { let scene: KoaReaction.Scene?; let t: Double }

  /// Lịch của lõi: mở đầu → thở đều xen các hoạt động (vươn vai, giãn hông, xoay vai, chạy bước nhỏ, hít sâu, vẫy tay,
  /// gồng khoe cơ, liếc đồng hồ; mỗi lần nghỉ bắt đầu ở một hoạt động khác) → 3,5 s cuối "LƯỢT MÌNH!".
  static func beat(elapsed e: Double, left: Double, total: Double, paused: Bool, seed: Int = 0) -> Beat {
    let r = KoaPerformance.restBeat(elapsed: e, left: left, total: total, paused: paused, seed: seed)
    return Beat(scene: r.scene, t: r.t)
  }

  /// Khung của Koa: cảnh đang diễn, hoặc thở đều (nhún rất nhẹ, tay mở theo nhịp, mặt dịu).
  static func frame(_ b: Beat) -> KoaPerformance.Frame {
    if let s = b.scene { return KoaPerformance.frame(s, at: b.t) }
    var f = KoaPerformance.Frame()
    f.walk.flipRaisedArms = true
    let k = 0.5 - 0.5 * cos(b.t / 4200 * 2 * .pi)
    f.walk.bob = 1.4 * k
    f.walk.armLeft = 4 + 3 * k
    f.walk.armRight = -(4 + 3 * k)
    f.walk.earLeft = -3 * k; f.walk.earRight = -3 * k
    f.sx = 1 + 0.008 * k; f.sy = 1 + 0.01 * k
    f.expression = .content
    return f
  }

  var body: some View {
    // reduce-motion: Koa đứng yên ở khung đầu của mỗi cảnh, không nhún, không pháo giấy; chữ, thẻ và đồng hồ vẫn chạy
    TimelineView(.animation) { ctx in
      let elapsed = frozen ?? max(0, ctx.date.timeIntervalSince(startedAt ?? start) * 1000)
      let now = frozen.map { EpochMillis((startedAt ?? start).addingTimeInterval($0 / 1000)) } ?? EpochMillis(ctx.date)
      let leftMs = timer.pausedLeft.map { Double($0) * 1000 } ?? Double(timer.endsAt.millis - now.millis)
      let left = timer.remaining(at: now)
      let seed = Self.debugSeed ?? Int((startedAt ?? start).timeIntervalSince1970)
      let b = Self.beat(elapsed: elapsed, left: leftMs, total: Double(timer.total), paused: timer.isPaused, seed: seed)
      let f = Self.frame(b)
      let cues = b.scene.map { s in KoaPerformance.cues(s).filter { b.t >= $0.from && b.t < $0.to } } ?? []
      GeometryReader { geo in
        ZStack {
          Self.bg.ignoresSafeArea()
          RadialGradient(colors: [Self.orange.opacity(0.28), .clear], center: UnitPoint(x: 0.5, y: 0.36), startRadius: 0,
                         endRadius: geo.size.width * 0.85)
            .ignoresSafeArea()
          Ellipse().fill(RadialGradient(colors: [Self.orange.opacity(0.22), .clear], center: .center, startRadius: 0,
                                        endRadius: geo.size.width * 0.36))
            .frame(width: geo.size.width * 0.76, height: geo.size.width * 0.16)
            .position(x: geo.size.width / 2, y: geo.size.height * 0.535)
          effects(cues, t: b.t)
          VStack(spacing: 0) {
            topBar
            title(cues: cues, b: b)
            Spacer(minLength: 0)
            koa(f, size: geo.size)
            cardsRow(b: b, elapsed: elapsed)
              .padding(.top, 14)
            Spacer(minLength: 0)
            panel(left: left, now: now, b: b)
          }
          .padding(.horizontal, DS.Spacing.lg)
          .padding(.bottom, DS.Spacing.md)
        }
        .onChange(of: Int(elapsed / 16)) { _, _ in fire(b, elapsed: elapsed) }
      }
    }
    .onAppear {
      if startedAt == nil { onStarted(start) } else { heard.played = [-1] }
    }
    .preferredColorScheme(.dark)
    .statusBarHidden()
  }

  // MARK: trên

  private var topBar: some View {
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
      if let onEditJustDone, justDone != nil {
        Button(String(localized: "ws.edit"), action: onEditJustDone)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(Self.rose)
          .frame(minHeight: 44)
      }
    }
  }

  /// Tiêu đề kiểu cảnh xong buổi: "XONG SET!" lúc mở đầu, "LƯỢT MÌNH!" lúc hết giờ; còn lại là set vừa xong, nhỏ.
  private func title(cues: [KoaPerformance.Cue], b: Beat) -> some View {
    let big = cues.first { $0.title != nil }
    let since = big.map { b.t - $0.from } ?? 0
    return VStack(spacing: 6) {
      if let big, let t = big.title {
        Text(verbatim: t == "XONG SET!" ? String(localized: "koa.rest.setDone") : t == "LƯỢT MÌNH!" ? String(localized: "koa.rest.go") : t)
          .font(.system(size: 40, weight: .heavy, design: .rounded))
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.45), radius: 10, y: 4)
          .scaleEffect(reduceMotion ? 1 : 1 + 0.3 * max(0, 1 - since / 220))
          .opacity(min(1, since / 120) * min(1, (big.to - big.from - since) / 160))
        if t == "XONG SET!", let sub = subtitle ?? justDone {
          Text(verbatim: sub).font(.system(size: 17, weight: .medium)).foregroundStyle(.white.opacity(0.8))
        }
      } else if let justDone {
        Text(verbatim: justDone)
          .font(.system(size: 15, weight: .semibold).monospacedDigit())
          .foregroundStyle(.white.opacity(0.7))
      }
      if let record, big == nil {
        Text(verbatim: record)
          .font(.system(size: 14, weight: .heavy))
          .foregroundStyle(.black.opacity(0.85))
          .padding(.horizontal, 12).padding(.vertical, 6)
          .background(Capsule().fill(Self.gold))
      }
    }
    .frame(height: 96)
  }

  // MARK: Koa (như `KoaReactionView.koa`)

  private func koa(_ f: KoaPerformance.Frame, size: CGSize) -> some View {
    let fig = min(size.width * 0.66, 270.0)
    let unit = fig / 240
    let still = reduceMotion
    let air = (still ? 0 : f.air) * unit
    let lift = min(1, f.air / 40)
    return ZStack {
      Ellipse().fill(Color(red: 0.68, green: 0.71, blue: 0.75).opacity(0.32 * (1 - 0.55 * lift)))
        .frame(width: 128 * unit * (1 - 0.35 * lift), height: 18 * unit * (1 - 0.35 * lift))
        .offset(y: (294 - 150) * unit)
      KoaFigureView(
        expression: f.expression, pose: .idle, gesture: nil, size: fig, animated: true, stage: false,
        walk: still ? KoaWalk.Pose() : f.walk, bleeds: true,
        headLook: KoaMath.Gaze(x: f.look.x, y: f.look.y, k: 1), eyes: KoaMath.Gaze(x: f.eyes.x, y: f.eyes.y, k: 1),
        turn: still ? 0 : f.turn, groundShadow: false, gestureAmount: 0
      )
      .scaleEffect(x: still ? 1 : f.sx, y: still ? 1 : f.sy, anchor: .bottom)
      .offset(y: -air)
    }
    .scaleEffect(still ? 1 : f.zoom, anchor: .bottom)
    .frame(height: fig * 1.25)
    .accessibilityHidden(true)
  }

  /// Thẻ số của set: hiện từ giữa mở đầu (đếm lên như cảnh xong buổi), rồi ở lại suốt quãng nghỉ để đọc.
  @ViewBuilder private func cardsRow(b: Beat, elapsed: Double) -> some View {
    let appear = 2600.0
    if !cards.isEmpty {
      let since = elapsed - appear
      HStack(spacing: 10) {
        ForEach(Array(cards.enumerated()), id: \.offset) { k, c in
          VStack(spacing: 2) {
            Text(verbatim: c.value)
              .font(.system(size: 21, weight: .bold, design: .rounded)).monospacedDigit()
              .foregroundStyle(c.accent ? Self.orange : .white)
              .lineLimit(1).minimumScaleFactor(0.7)
            Text(verbatim: c.label).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
          }
          .frame(maxWidth: .infinity).padding(.vertical, 12)
          .background(RoundedRectangle(cornerRadius: 16).fill(.white.opacity(0.08)))
          .opacity(max(0, min(1, (since - Double(k) * 150) / 150)))
        }
      }
      .frame(height: 64)
    } else {
      Color.clear.frame(height: 64)
    }
  }

  // MARK: dưới: đồng hồ + nút

  private func panel(left: Int, now: EpochMillis, b: Beat) -> some View {
    let paused = timer.isPaused
    let warning = RestTimer.warns(left: left, paused: paused)
    let ready = b.scene == .restGo
    return VStack(spacing: 12) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(verbatim: RestTimer.label(seconds: left))
          .font(.system(size: 52, weight: .semibold, design: .rounded)).monospacedDigit()
          .contentTransition(.numericText(countsDown: true))
          .foregroundStyle(warning ? Self.gold : .white)
        Text(paused ? String(localized: "workout.rest.title.paused") : String(localized: "workout.rest.title"))
          .font(.system(size: 15, weight: .medium)).foregroundStyle(.white.opacity(0.5))
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text(String(format: String(localized: "workout.rest.left"), left)))
      .accessibilityIdentifier("workout.rest.clock")
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(.white.opacity(0.1))
          Capsule().fill(warning ? Self.gold : Self.orange).frame(width: g.size.width * timer.ringFraction(at: now))
        }
      }
      .frame(height: 5)
      HStack(spacing: DS.Spacing.sm) {
        chip(Text(verbatim: "−15s"), String(format: String(localized: "workout.rest.adjust"), "-15")) { onAdjust(-15) }
        chip(Image(systemName: paused ? "play.fill" : "pause.fill"),
             String(localized: paused ? "workout.rest.resume" : "workout.rest.pause")) { onSetPaused(!paused) }
        chip(Text(verbatim: "+15s"), String(format: String(localized: "workout.rest.adjust"), "+15")) { onAdjust(15) }
      }
      if let next {
        Text(verbatim: String(localized: "ws.rest.next") + " · " + next)
          .font(.system(size: 14, weight: .medium).monospacedDigit())
          .foregroundStyle(.white.opacity(0.65))
          .lineLimit(1).minimumScaleFactor(0.8)
      }
      Button(action: onSkip) {
        Text(String(localized: next == nil ? "ws.rest.skip" : "koa.rest.startNext"))
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 52)
          .background(Capsule().fill(ready ? Self.orange : .white.opacity(0.1)))
          .contentShape(Capsule())
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityIdentifier("workout.rest.skip")
    }
  }

  private func chip<Label: View>(_ label: Label, _ a11y: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      label
        .font(.system(size: 16, weight: .semibold).monospacedDigit())
        .foregroundStyle(.white)
        .frame(minWidth: 76, minHeight: 44)
        .background(.white.opacity(0.09), in: Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: a11y))
  }

  // MARK: hiệu ứng (như cảnh xong buổi)

  private func effects(_ cues: [KoaPerformance.Cue], t: Double) -> some View {
    Canvas { c, sz in
      guard !reduceMotion else { return }
      func rnd(_ i: Double) -> Double { let x = sin(i * 12.9898) * 43758.5453; return x - floor(x) }
      let cx = sz.width / 2, cy = sz.height * 0.36
      for cue in cues {
        let local = t - cue.from
        if cue.effects.contains(.sweat) {
          for i in 0..<3 {
            let q = (local / 800 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
            let r = CGRect(x: cx - 80 + Double(i) * 75, y: cy - 110 + q * 80, width: 12, height: 18)
            c.fill(Path(ellipseIn: r), with: .color(Color(red: 0.62, green: 0.85, blue: 0.95).opacity(1 - q)))
          }
        }
        if cue.effects.contains(.confetti) {
          let cols: [Color] = [Self.orange, Self.gold, Self.rose, Color(red: 0.49, green: 0.78, blue: 0.93), .white]
          for i in 0..<60 {
            let d = Double(i)
            let life = local / 1000 + rnd(d + 11) * 0.4
            let x = rnd(d + 5) * sz.width + (rnd(d) - 0.5) * 60 * life
            let y = -20 - rnd(d + 7) * 200 + (170 + rnd(d + 9) * 150) * life + 110 * life * life
            guard y < sz.height * 0.6 else { continue }
            var g = c
            g.translateBy(x: x, y: y)
            g.rotate(by: .radians(life * (rnd(d + 3) * 10 - 5)))
            g.fill(Path(CGRect(x: -4, y: -7, width: 8, height: 14 * abs(cos(life * 6 + d)))), with: .color(cols[i % 5]))
          }
        }
      }
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
  }

  // MARK: tiếng + nhịp

  private func fire(_ b: Beat, elapsed: Double) {
    guard frozen == nil else { return }
    let sec = Int(elapsed / 1000)
    if sec != heard.tick { heard.tick = sec; onSettle() }
    guard heard.played != [-1] || b.scene != .restIntro else { return }   // mở lại giữa chừng: không phát lại mở đầu
    if heard.scene != b.scene { heard.scene = b.scene; heard.played = [] }
    guard let s = b.scene else { return }
    for (i, snd) in KoaPerformance.sounds(s).enumerated() where snd.t <= b.t && !heard.played.contains(i) {
      heard.played.insert(i)
      if b.t - snd.t < 250 { KoaSound.reaction(snd.name, gain: snd.gain) }
    }
  }
}
