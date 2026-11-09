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

  /// Mock uống bằng bình ống hút (08/11). Tay gập v28 bị loại vì "phá vỡ dáng tay ban đầu của koa", nên tay phải giữ
  /// NGUYÊN hình gốc, chỉ xoay quanh vai như mọi cảnh khác (`walk.armRight`). Bình nằm SAU hình, bàn tay gốc che phần dưới
  /// bình như đang nắm. Ống hút gập (vẽ trước mặt) đi từ nắp bình tới miệng. `SIMCTL_CHILD_ASCND_DEBUG_KOA_DRINK=1`.
  struct KoaDrinkMock: View {
    static var enabled: Bool { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_DRINK"] != nil }

    struct Pose {
      let label: String
      let face: KoaFlags.Expression
      let look: (Double, Double)
      let turn: Double
      /// Tay phải xoay quanh vai (độ, âm = giơ lên), hình tay giữ nguyên.
      let arm: Double
      /// Bình nghiêng (độ, âm = đầu bình nghiêng vào trong về phía miệng).
      let tilt: Double
      /// Ống hút chạm miệng hay buông.
      let sipping: Bool
    }

    static let poses: [Pose] = [
      Pose(label: "A · hút một ngụm", face: .meditate, look: (0.1, 0.1), turn: 0.25, arm: -38, tilt: -10, sipping: true),
      Pose(label: "B · hút say sưa", face: .meditate, look: (0.15, -0.15), turn: 0.35, arm: -56, tilt: -20, sipping: true),
      Pose(label: "C · nhả ống \"ahh\"", face: .happy, look: (0, 0), turn: 0.1, arm: -22, tilt: -4, sipping: false),
    ]

    var body: some View {
      VStack(spacing: 6) {
        ForEach(Self.poses.indices, id: \.self) { i in
          HStack(spacing: 0) {
            Self.figure(Self.poses[i], size: 210)
            Text(verbatim: Self.poses[i].label).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
      .padding(.top, 40)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .background(Color(red: 0.055, green: 0.059, blue: 0.071))
      .statusBarHidden()
    }

    /// Bàn tay phải, miệng (khung viewBox 240 × 300, đã qua `insetMat`).
    static func place(_ p: Pose) -> (paw: CGPoint, mouth: CGPoint) {
      var o = KoaRender.Options()
      o.size = 240
      o.expression = p.face
      o.look = KoaMath.Gaze(x: p.look.0, y: p.look.1, k: 1)
      o.eyes = o.look
      o.turn = p.turn
      var w = KoaWalk.Pose()
      w.armRight = p.arm
      o.walk = w
      let paw = KoaRender.paws(o).right ?? (186, 238)
      let nose = KoaRender.anchors(o)["nose"] ?? (120, 119)
      return (CGPoint(x: paw.x, y: paw.y), CGPoint(x: nose.x + 4 * p.turn, y: nose.y + 25))
    }

    static func figure(_ p: Pose, size: Double) -> some View {
      let u = size / 240
      let at = place(p)
      var w = KoaWalk.Pose()
      w.armRight = p.arm
      // bình: tâm thân bình cao hơn bàn tay một chút (bàn tay ôm nửa dưới)
      let a = p.tilt * .pi / 180
      let lift = 14.0
      let center = CGPoint(x: at.paw.x + sin(a) * lift, y: at.paw.y - cos(a) * lift)
      let capTop = CGPoint(x: center.x + sin(a) * 30, y: center.y - cos(a) * 30)
      return ZStack {
        // bình SAU hình: bàn tay gốc nằm đè lên như đang nắm
        Canvas { c, _ in
          var g = c
          g.translateBy(x: center.x * u, y: center.y * u)
          g.rotate(by: .radians(a))
          g.scaleBy(x: u, y: u)
          let blue = Color(red: 0.49, green: 0.78, blue: 0.93)
          let orange = Color(red: 0.91, green: 0.52, blue: 0.16)
          g.fill(Path(roundedRect: CGRect(x: -11, y: -22, width: 22, height: 46), cornerRadius: 8), with: .color(blue))
          g.fill(Path(roundedRect: CGRect(x: -7, y: -18, width: 4, height: 36), cornerRadius: 2), with: .color(.white.opacity(0.35)))
          g.fill(Path(CGRect(x: -11, y: 6, width: 22, height: 6)), with: .color(.white.opacity(0.9)))
          g.fill(Path(roundedRect: CGRect(x: -9, y: -31, width: 18, height: 10), cornerRadius: 3), with: .color(orange))
        }
        .frame(width: 240 * u, height: 300 * u)
        KoaFigureView(expression: p.face, size: size, animated: true,
                      walk: w, headLook: KoaMath.Gaze(x: p.look.0, y: p.look.1, k: 1),
                      eyes: KoaMath.Gaze(x: p.look.0, y: p.look.1, k: 1), turn: p.turn)
        // ống hút gập, trước mặt: lên khỏi nắp rồi uốn vào miệng (buông thì dựng thẳng)
        Canvas { c, _ in
          func q(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * u, y: y * u) }
          var straw = Path()
          straw.move(to: q(capTop.x, capTop.y + 2))
          if p.sipping {
            let bend = CGPoint(x: capTop.x - 2, y: min(capTop.y - 16, at.mouth.y - 4))
            straw.addLine(to: q(bend.x, bend.y + 6))
            straw.addQuadCurve(to: q(bend.x - 10, bend.y - 2), control: q(bend.x, bend.y - 2))
            straw.addLine(to: q(at.mouth.x + 3, at.mouth.y))
          } else {
            straw.addLine(to: q(capTop.x + 1, capTop.y - 18))
            straw.addQuadCurve(to: q(capTop.x - 9, capTop.y - 26), control: q(capTop.x + 1, capTop.y - 26))
          }
          c.stroke(straw, with: .color(.white), style: StrokeStyle(lineWidth: 5 * u, lineCap: .round, lineJoin: .round))
          c.stroke(straw, with: .color(Color(red: 0.91, green: 0.52, blue: 0.16).opacity(0.9)),
                   style: StrokeStyle(lineWidth: 5 * u, lineCap: .butt, dash: [3 * u, 4 * u]))
        }
        .frame(width: 240 * u, height: 300 * u)
        .allowsHitTesting(false)
      }
      .frame(width: 240 * u, height: 300 * u)
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
    static var eyesTest: Bool { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_RIG"] == "eyes" }
    var body: some View {
      if Self.eyesTest { eyes } else { grid }
    }
    /// Soát mắt lờ đờ khi Koa đảo mắt: mí phải đi cùng mắt.
    private var eyes: some View {
      let cases: [(KoaFlags.Expression, Double)] = [(.sleepy, 0), (.sleepy, -0.6), (.sleepy, 0.6), (.tired, 0), (.tired, -0.6),
                                                   (.confident, -0.6)]
      return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 3), spacing: 4) {
        ForEach(cases.indices, id: \.self) { i in
          VStack(spacing: 0) {
            KoaFigureView(expression: cases[i].0, size: 128, animated: true,
                          headLook: KoaMath.Gaze(x: 0, y: cases[i].1, k: 1), eyes: KoaMath.Gaze(x: 0, y: cases[i].1, k: 1))
              .frame(width: 128, height: 150)
            Text(verbatim: "\(cases[i].0) y \(cases[i].1)").font(.caption2).foregroundStyle(.white)
          }
        }
      }
      .padding(.top, 50)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .background(Color(red: 0.1, green: 0.1, blue: 0.12))
    }
    private var grid: some View {
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
    static var debugBottle: Bool { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REST_BOTTLE"] != nil }
  #else
    static let debugSeed: Int? = nil
    static let debugBottle = false
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
  /// Đã mua bình nước ở cửa hàng: có cảnh Koa đi lấy bình nước uống.
  var hasBottle = false
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
  /// Màu Tập luyện (Kiệt 07/11: "nút vào set và thanh thời gian nên là màu đỏ cho khớp với tập luyện").
  private static let train = DS.Color.metricRose.swiftUI

  /// Cảnh đang diễn và mốc trong cảnh; `nil` = đang thở đều.
  struct Beat { let scene: KoaReaction.Scene?; let t: Double }

  /// Lịch của lõi: mở đầu → thở đều xen các hoạt động (vươn vai, giãn hông, xoay vai, chạy bước nhỏ, hít sâu, vẫy tay,
  /// gồng khoe cơ, liếc đồng hồ; mỗi lần nghỉ bắt đầu ở một hoạt động khác) → 3,5 s cuối "LƯỢT MÌNH!".
  static func beat(elapsed e: Double, left: Double, total: Double, paused: Bool, seed: Int = 0, hasBottle: Bool = false)
    -> Beat
  {
    let r = KoaPerformance.restBeat(elapsed: e, left: left, total: total, paused: paused, seed: seed, hasBottle: hasBottle)
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
      let b = Self.beat(elapsed: elapsed, left: leftMs, total: Double(timer.total), paused: timer.isPaused, seed: seed,
                        hasBottle: hasBottle || Self.debugBottle)
      let f = Self.frame(b)
      let cues = b.scene.map { s in KoaPerformance.cues(s).filter { b.t >= $0.from && b.t < $0.to } } ?? []
      GeometryReader { geo in
        // sân khấu và chỗ đứng của Koa ĐÚNG như cảnh xong buổi (`KoaReactionView`, Kiệt 07/11: "sân khấu và vị trí
        // đứng của koa phải khớp với story xong buổi tập"): quầng cam ở 46 %, vũng sáng sàn ở 79 %, Koa 82 % bề ngang
        // (tối đa 340) đứng giữa ở 54 %. Chữ + thẻ ở trên, đồng hồ + nút gọn ở dải dưới chân.
        ZStack {
          Self.bg.ignoresSafeArea()
          RadialGradient(colors: [Self.orange.opacity(0.30), .clear], center: UnitPoint(x: 0.5, y: 0.46), startRadius: 0,
                         endRadius: geo.size.width * 0.85)
            .ignoresSafeArea()
          Ellipse().fill(RadialGradient(colors: [Self.orange.opacity(0.22), .clear], center: .center, startRadius: 0,
                                        endRadius: geo.size.width * 0.38))
            .frame(width: geo.size.width * 0.8, height: geo.size.width * 0.18)
            .position(x: geo.size.width / 2, y: geo.size.height * 0.79)
          effects(cues, t: b.t)
          koa(f, hand: KoaPerformance.restHand(b.scene, at: b.t), squirt: KoaPerformance.restSquirt(b.scene, at: b.t),
              t: b.t, size: geo.size)
            .position(x: geo.size.width / 2, y: geo.size.height * 0.54)
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
    .frame(height: 84)
  }

  // MARK: Koa (như `KoaReactionView.koa`)

  private func koa(_ f: KoaPerformance.Frame, hand: String?, squirt: Double = 0, t: Double = 0, size: CGSize) -> some View {
    // như `KoaReactionView.koa`: cùng cỡ, bóng đứng yên trên sàn, nhảy dời cả hình
    let fig = min(size.width * 0.82, 340.0)
    let unit = fig / 240
    let still = reduceMotion
    let air = (still ? 0 : f.air) * unit
    let lift = min(1, f.air / 40)
    return ZStack {
      Ellipse().fill(Color(red: 0.68, green: 0.71, blue: 0.75).opacity(0.32 * (1 - 0.55 * lift)))
        .frame(width: 128 * unit * (1 - 0.35 * lift), height: 18 * unit * (1 - 0.35 * lift))
        .offset(y: (294 - 150) * unit)
      if hasBottle || Self.debugBottle, hand == nil {
        // bình nước đã mua đứng sẵn trên sàn cạnh chân Koa: Koa cúi nhặt lên uống rồi đặt lại (`restDrink`)
        Image(systemName: "waterbottle.fill")
          .font(.system(size: 26 * unit, weight: .regular))
          .foregroundStyle(Color(red: 0.49, green: 0.78, blue: 0.93))
          .offset(x: 86 * unit, y: (282 - 150) * unit)
      }
      KoaFigureView(
        expression: f.expression, pose: .idle, gesture: nil, size: fig, animated: true,
        stage: false, walk: still ? KoaWalk.Pose() : f.walk, bleeds: true,
        headLook: KoaMath.Gaze(x: f.look.x, y: f.look.y, k: 1), eyes: KoaMath.Gaze(x: f.eyes.x, y: f.eyes.y, k: 1),
        turn: still ? 0 : f.turn, groundShadow: false, gestureAmount: 0
      )
      .scaleEffect(x: still ? 1 : f.sx, y: still ? 1 : f.sy, anchor: .bottom)
      .offset(y: -air)
      if hand != nil { bottleInHand(f, squirt: squirt, t: t, unit: unit) }
    }
    .scaleEffect(still ? 1 : f.zoom, anchor: UnitPoint(x: 0.5, y: 0.32 + 0.28 * f.focus))
    .accessibilityHidden(true)
  }

  /// Bình nước trong tay Koa, vẽ theo đúng bàn tay phải (vai `KoaGesture.shoulderR`, tay quay theo `armRight`, nhấc vai
  /// khi giơ cao như `KoaRender.shoulderTuck`). Giơ cao thì vòi bình nghiêng về phía miệng; lúc uống có vòi nước vòng
  /// cung bóp từ bình vào miệng. Cùng hình với bình đứng trên sàn.
  private func bottleInHand(_ f: KoaPerformance.Frame, squirt: Double, t: Double, unit: Double) -> some View {
    let raise = max(0, -f.walk.armRight)
    let th = raise * .pi / 180
    let tuck = raise >= KoaRender.armFlipDeg ? 6 * min(1, raise / 45) : 0
    // bàn tay khi buông ở (+12, +56) so với vai; quay ngược chiều kim đồng hồ khi giơ ra ngoài
    let hx = 12.0, hy = 56.0
    let paw = (160 + hx * cos(th) + hy * sin(th), 178 - tuck - hx * sin(th) + hy * cos(th) - f.walk.bob)
    let mouth = (120 + 10 * f.turn, 153 - f.walk.bob)
    // hướng của vòi bình: thẳng đứng khi cầm thấp, chĩa về miệng khi giơ lên
    let toMouth = atan2(mouth.0 - paw.0, -(mouth.1 - paw.1)) * 180 / .pi
    let k = min(1, max(0, (raise - 40) / 50))
    let angle = k * toMouth
    let len = 30.0
    let a = angle * .pi / 180
    let nozzle = (paw.0 + sin(a) * len, paw.1 - cos(a) * len)
    let body = (paw.0 + sin(a) * len * 0.45, paw.1 - cos(a) * len * 0.45)
    func v(_ p: (Double, Double)) -> CGPoint { CGPoint(x: (p.0 - 120) * unit, y: (p.1 - 150) * unit) }
    return ZStack {
      if squirt > 0.01 {
        // vòi nước: cung bay từ vòi bình tới miệng (toạ độ hình × `unit`, khung đúng cỡ hình 240 × 300)
        Canvas { c, _ in
          let u = CGFloat(unit)
          let p0 = CGPoint(x: CGFloat(nozzle.0) * u, y: CGFloat(nozzle.1) * u)
          let p2 = CGPoint(x: CGFloat(mouth.0) * u, y: CGFloat(mouth.1) * u)
          let mid: CGFloat = (p0.x + p2.x) * 0.5
          let top: CGFloat = min(p0.y, p2.y) - 10 * u
          let ctl = CGPoint(x: mid, y: top)
          var pa = Path(); pa.move(to: p0); pa.addQuadCurve(to: p2, control: ctl)
          c.stroke(pa.trimmedPath(from: 0, to: squirt), with: .color(Color(red: 0.62, green: 0.85, blue: 0.97).opacity(0.95)),
                   style: StrokeStyle(lineWidth: 3.4 * u, lineCap: .round, dash: [6 * u, 4 * u],
                                      dashPhase: CGFloat(-t / 30) * u))
        }
        .frame(width: 240 * unit, height: 300 * unit)
      }
      Image(systemName: "waterbottle.fill")
        .font(.system(size: 30 * unit, weight: .regular))
        .foregroundStyle(Color(red: 0.49, green: 0.78, blue: 0.93))
        .rotationEffect(.degrees(angle))
        .offset(x: v(body).x, y: v(body).y)
    }
    .allowsHitTesting(false)
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
