import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

#if DEBUG
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
  /// Đồng hồ hoạt động của quãng nghỉ này, giữ ở màn tập qua các lần thu nhỏ (Devin #970: màn
  /// dựng lại sau khi thu nhỏ thì quên quãng đã dừng, Koa nhảy nhịp). `nil`: đồng hồ riêng.
  var clock: RestClockBox? = nil

  @State private var start = Date.now
  @State private var heard = Heard()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// Ra nền thì đồng hồ cảnh dừng (KOA-T11).
  @Environment(\.scenePhase) private var scenePhase

  final class Heard {
    var scene: KoaReaction.Scene?; var played = Set<Int>(); var tick = -1; var buzzed = Set<Double>()
    let active = RestClockBox()
  }

  private static let bg = KoaShowStage.bg
  private static let orange = KoaShowStage.orange
  private static let gold = KoaShowStage.gold
  private static let rose = KoaShowStage.rose
  /// Màu Tập luyện (Kiệt 07/11: "nút vào set và thanh thời gian nên là màu đỏ cho khớp với tập luyện").
  private static let train = DS.Color.metricRose.swiftUI

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
    // KOA-T11: tối đa 60 khung/giây, dừng khi app không ở tiền cảnh (giờ nghỉ tính theo mốc thời
    // gian nên không lệch khi quay lại).
    // reduce-motion: Koa đứng yên ở khung đầu của mỗi cảnh, không nhún, không pháo giấy; chữ, thẻ và đồng hồ vẫn chạy
    TimelineView(.animation(minimumInterval: 1.0 / 60, paused: scenePhase != .active)) { ctx in
      // KOA-T26: màn diễn chạy theo thời gian HOẠT ĐỘNG (trừ quãng dừng) — dừng thì Koa đứng yên
      // cùng đồng hồ đếm ngược, tiếp tục không nhảy cóc nhịp.
      let elapsed = frozen ?? (clock ?? heard.active).clock.elapsed(
        now: max(0, ctx.date.timeIntervalSince(startedAt ?? start) * 1000), paused: timer.isPaused)
      let now = frozen.map { EpochMillis((startedAt ?? start).addingTimeInterval($0 / 1000)) } ?? EpochMillis(ctx.date)
      let leftMs = timer.pausedLeft.map { Double($0) * 1000 } ?? Double(timer.endsAt.millis - now.millis)
      let left = timer.remaining(at: now)
      let seed = Self.debugSeed ?? Int((startedAt ?? start).timeIntervalSince1970)
      let b = Self.beat(elapsed: elapsed, left: leftMs, total: Double(timer.total), paused: timer.isPaused, seed: seed)
      let f = Self.frame(b)
      let cues = b.scene.map { s in KoaPerformance.cues(s).filter { b.t >= $0.from && b.t < $0.to } } ?? []
      GeometryReader { geo in
        // sân khấu và chỗ đứng của Koa ĐÚNG như cảnh xong buổi (`KoaReactionView`, Kiệt 07/11: "sân khấu và vị trí
        // đứng của koa phải khớp với story xong buổi tập"): quầng cam ở 46 %, vũng sáng sàn ở 79 %, Koa 82 % bề ngang
        // (tối đa 340) đứng giữa ở 54 %. Chữ + thẻ ở trên, đồng hồ + nút gọn ở dải dưới chân.
        ZStack {
          KoaShowStage.Backdrop(size: geo.size)
          KoaShowStage.Effects(
            cues: cues, t: b.t, reduceMotion: reduceMotion, centerY: 0.36, sweatRise: 110, confetti: 60, confettiFloor: 0.6)
          KoaShowStage.Figure(frame: f, size: geo.size, reduceMotion: reduceMotion)
            .position(x: geo.size.width / 2, y: geo.size.height * KoaShowStage.koaY)
          VStack(spacing: 8) {
            topBar
            title(cues: cues, b: b)
            cardsRow(b: b, elapsed: elapsed)
            Spacer(minLength: 0)
            panel(left: left, now: now, b: b)
          }
          .padding(.horizontal, DS.Spacing.lg)
          .padding(.bottom, DS.Spacing.sm)
        }
        .onChange(of: Int(elapsed / 16)) { _, _ in fire(b, elapsed: elapsed) }
      }
    }
    .onAppear {
      if startedAt == nil { onStarted(start) } else { heard.played = [-1] }
    }
    // Cảnh nghỉ luôn tối, nhưng CHỈ trong cảnh này: `preferredColorScheme` đổi cả cửa sổ và
    // giữ lại sau khi cảnh đóng, nên màn tập và cả app thành tối (12/11, Kiệt báo).
    .environment(\.colorScheme, .dark)
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
        // Khung 44 nằm TRONG nhãn + `contentShape`: khung đặt ngoài nút thì chỉ nét chữ nhận chạm (KOA-T47, 28×18).
        Button(action: onEditJustDone) {
          Text(String(localized: "ws.edit"))
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Self.rose)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
  }

  /// Tiêu đề kiểu cảnh xong buổi: "XONG SET!" lúc mở đầu, "LƯỢT MÌNH!" lúc hết giờ; còn lại là set vừa xong, nhỏ.
  private func title(cues: [KoaPerformance.Cue], b: Beat) -> some View {
    let big = cues.first { $0.title != nil }
    let since = big.map { b.t - $0.from } ?? 0
    return VStack(spacing: 6) {
      if let big, let t = big.title {
        Text(verbatim: KoaShowStage.title(big) ?? t)
          .font(.system(size: 40, weight: .heavy, design: .rounded))
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.45), radius: 10, y: 4)
          .scaleEffect(reduceMotion ? 1 : 1 + 0.3 * max(0, 1 - since / 220))
          .opacity(min(1, since / 120) * min(1, (big.to - big.from - since) / 160))
        if big.titleKey == .setDone, let sub = subtitle ?? justDone {
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
    .frame(height: 84)
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

  /// Dải dưới chân Koa (chỗ cảnh xong buổi đặt thẻ số): −15s · đồng hồ · +15s, rồi tạm dừng + "Vào set tiếp".
  private func panel(left: Int, now: EpochMillis, b: Beat) -> some View {
    let paused = timer.isPaused
    let warning = RestTimer.warns(left: left, paused: paused)
    return VStack(spacing: 10) {
      HStack(spacing: DS.Spacing.sm) {
        chip(Text(verbatim: "−15s"), String(format: String(localized: "workout.rest.adjust"), "-15")) { onAdjust(-15) }
        VStack(spacing: 4) {
          Text(verbatim: RestTimer.label(seconds: left))
            .font(.system(size: 40, weight: .semibold, design: .rounded)).monospacedDigit()
            .contentTransition(.numericText(countsDown: true))
            .foregroundStyle(warning ? Self.gold : .white)
            .lineLimit(1).minimumScaleFactor(0.7)
          GeometryReader { g in
            ZStack(alignment: .leading) {
              Capsule().fill(.white.opacity(0.1))
              Capsule().fill(warning ? Self.gold : Self.train).frame(width: g.size.width * timer.ringFraction(at: now))
            }
          }
          .frame(height: 4)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(format: String(localized: "workout.rest.left"), left)))
        .accessibilityIdentifier("workout.rest.clock")
        chip(Text(verbatim: "+15s"), String(format: String(localized: "workout.rest.adjust"), "+15")) { onAdjust(15) }
      }
      HStack(spacing: DS.Spacing.sm) {
        chip(Image(systemName: paused ? "play.fill" : "pause.fill"),
             String(localized: paused ? "workout.rest.resume" : "workout.rest.pause")) { onSetPaused(!paused) }
        Button(action: onSkip) {
          VStack(spacing: 1) {
            Text(String(localized: next == nil ? "ws.rest.skip" : "koa.rest.startNext"))
              .font(.system(size: 16, weight: .bold))
            // set tiếp theo nằm trong nút (dòng riêng đè lên chân Koa ở sân khấu kiểu xong buổi)
            if let next {
              Text(verbatim: next).font(.system(size: 11, weight: .medium).monospacedDigit()).opacity(0.75)
                .lineLimit(1).minimumScaleFactor(0.8)
            }
          }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 50)
            // đỏ Tập luyện chỉ khi đã hết giờ nghỉ (Kiệt 07/11); còn nghỉ thì nút xám
            .background(Capsule().fill(left <= 0 ? Self.train : Color.white.opacity(0.1)))
            .contentShape(Capsule())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityIdentifier("workout.rest.skip")
      }
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

  // MARK: tiếng + nhịp

  private func fire(_ b: Beat, elapsed: Double) {
    guard frozen == nil else { return }
    let sec = Int(elapsed / 1000)
    if sec != heard.tick { heard.tick = sec; onSettle() }
    guard heard.played != [-1] || b.scene != .restIntro else { return }   // mở lại giữa chừng: không phát lại mở đầu
    if heard.scene != b.scene { heard.scene = b.scene; heard.played = []; heard.buzzed = [] }
    guard let s = b.scene else { return }
    for (i, snd) in KoaPerformance.sounds(s).enumerated() where snd.t <= b.t && !heard.played.contains(i) {
      heard.played.insert(i)
      if b.t - snd.t < 250 { KoaSound.reaction(snd.name, gain: snd.gain) }
    }
    // KOA-T15: rung theo mốc của kịch bản, kể cả nhịp "LƯỢT MÌNH!" (đúng mốc, không trễ 1 giây
    // như rung hết giờ toàn cục — rung toàn cục bỏ qua khi nhịp này vừa rung).
    guard KoaHaptics.allowed(reduceMotion: reduceMotion) else { return }
    for m in KoaHaptics.due(KoaHaptics.marks(KoaPerformance.cues(s)), at: b.t, fired: heard.buzzed) {
      heard.buzzed.insert(m.t)
      KoaHapticPlayer.play(m.haptic, restGo: s == .restGo)
    }
  }
}

/// Hộp đồng hồ hoạt động (KOA-T26) — tham chiếu, để cập nhật mỗi khung hình không làm view vẽ lại.
final class RestClockBox {
  var clock = RestActiveClock()
}

/// Đồng hồ hoạt động theo khoá quãng nghỉ, sống cùng màn tập (Devin #970).
final class RestClockStore {
  private var boxes: [String: RestClockBox] = [:]
  func box(_ key: String) -> RestClockBox {
    if let b = boxes[key] { return b }
    let b = RestClockBox()
    boxes[key] = b
    return b
  }
}
