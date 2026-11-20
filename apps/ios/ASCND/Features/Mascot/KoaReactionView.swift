import ASCNDCore
import SwiftUI

#if DEBUG
  /// Mock phản ứng toàn màn hình của Koa (05/11), tự lặp. Mở: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REACTION=set|record|done`;
  /// `ASCND_DEBUG_KOA_REACTION_T=<ms>` dừng ở một mốc để chụp. Chạm để phát lại.
  struct KoaReactionPreview: View {
    static var scene: KoaReaction.Scene? {
      ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REACTION"].flatMap(KoaReaction.Scene.init(rawValue:))
    }

    static var frozen: Double? { ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REACTION_T"].flatMap(Double.init) }

    let scene: KoaReaction.Scene
    var body: some View { KoaReactionView(scene: scene, frozen: Self.frozen) }
  }
#endif

/// Cảnh Koa toàn màn hình đang chạy thật: hộp hệ thống (xin quyền thông báo) chờ cảnh xong rồi mới hiện, không đè
/// lên Koa (07/11, thấy khi chạy thật trên simulator).
@MainActor enum KoaReactionGate {
  static var playing = false

  /// Chờ cảnh đang chạy (nếu có) xong. Chờ một nhịp trước: cảnh mở ngay SAU khi buổi được ghi.
  static func waitIdle() async {
    try? await Task.sleep(for: .seconds(1))
    while playing { try? await Task.sleep(for: .milliseconds(250)) }
  }
}

/// Koa phản ứng toàn màn hình: một cú quay liền (`KoaPerformance`), không đổi dáng — thân, tay, đầu, tai, mắt chạy
/// trên cùng một dòng thời gian, lớp theo đà tính tự động; tiếng theo nhịp diễn.
///
/// 07/11: Kiệt duyệt storyboard xong buổi → chạy thật trước màn tổng kết với số của buổi (`content`), phát một lần,
/// chạm để bỏ qua. Cảnh ghi set / kỷ lục CHƯA duyệt: chỉ có ở bản mock (`KoaReactionPreview`).
struct KoaReactionView: View {
  let scene: KoaReaction.Scene
  /// Chữ thật; `nil` = số mẫu của mock.
  var content: KoaReaction.Content? = nil
  /// Dừng ở một mốc (ms) — chỉ để chụp so sánh.
  var frozen: Double? = nil
  /// Có thì phát một lần rồi gọi (hết cảnh hoặc chạm); `nil` = tự lặp như mock.
  var onEnd: (() -> Void)? = nil
  @State private var start = Date.now
  @State private var heard = Heard()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// Ra nền thì đồng hồ cảnh dừng (KOA-T11).
  @Environment(\.scenePhase) private var scenePhase

  /// Tiếng đã phát trong vòng lặp này (không phát lại khi khung vẽ lại).
  final class Heard { var loop = -1; var played = Set<Int>(); var cue = -1; var ended = false; var buzzed = Set<Double>() }

  private var cueList: [KoaPerformance.Cue] { KoaPerformance.cues(scene, content: content) }

  private static let orange = KoaShowStage.orange
  private static let gold = KoaShowStage.gold
  private static let rose = KoaShowStage.rose

  var body: some View {
    // KOA-T11: tối đa 60 khung/giây (đúng tốc độ màn), dừng khi app không ở tiền cảnh.
    // reduce-motion: đồng hồ của cảnh; bật Giảm chuyển động thì máy không đẩy, không rung, không pháo giấy, chỉ còn chữ mờ dần
    TimelineView(.animation(minimumInterval: 1.0 / 60, paused: scenePhase != .active)) { ctx in
      let total = KoaPerformance.duration(scene)
      let cycle = total + 900
      // `ASCND_DEBUG_KOA_REACTION_T=<ms>`: dừng ở một mốc để chụp so sánh
      let raw = frozen ?? max(0, ctx.date.timeIntervalSince(start) * 1000)
      let loop = Int(raw / cycle)
      let t = onEnd == nil ? min(total, raw.truncatingRemainder(dividingBy: cycle)) : min(total, raw)
      let f = KoaPerformance.frame(scene, at: t)
      let cues = cueList.filter { t >= $0.from && t < $0.to }
      GeometryReader { geo in
        ZStack {
          KoaShowStage.Backdrop(size: geo.size)
          KoaShowStage.Effects(cues: cues, t: t, reduceMotion: reduceMotion)
          koa(f, t: t, size: geo.size)
          ring(f.ring)
          ForEach(Array(cues.enumerated()), id: \.offset) { _, c in overlay(c, since: t - c.from, size: geo.size) }
          if f.flash > 0 { Color.white.opacity(0.85 * f.flash).ignoresSafeArea() }
          VStack {
            Spacer()
            Text("koa.reaction.skip").font(.system(size: 13)).foregroundStyle(.white.opacity(0.45)).padding(.bottom, 8)
            GeometryReader { g in
              Rectangle().fill(Self.orange).frame(width: g.size.width * min(1, t / total), height: 3)
            }
            .frame(height: 3)
          }
        }
        .contentShape(Rectangle())
        .onTapGesture { if let onEnd { end(onEnd) } else { start = .now } }
        .onChange(of: Int(raw / 16)) { _, _ in
          fire(loop: loop, t: t)
          // phát một lần: hết cảnh + một nhịp lặng thì sang màn tổng kết
          if let onEnd, raw >= total + 400 { end(onEnd) }
        }
      }
    }
    .statusBarHidden()
    .onAppear { if onEnd != nil { KoaReactionGate.playing = true } }
    .onDisappear { if onEnd != nil { KoaReactionGate.playing = false } }
  }

  private func end(_ done: () -> Void) {
    guard !heard.ended else { return }
    heard.ended = true
    KoaReactionGate.playing = false
    done()
  }

  /// Tiếng + rung khi dòng thời gian đi qua mốc của chúng.
  private func fire(loop: Int, t: Double) {
    if heard.loop != loop { heard.loop = loop; heard.played = []; heard.cue = -1; heard.buzzed = [] }
    for (i, s) in KoaPerformance.sounds(scene).enumerated() where s.t <= t && !heard.played.contains(i) {
      heard.played.insert(i)
      if t - s.t < 250 { KoaSound.reaction(s.name, gain: s.gain) }
    }
    // KOA-T15: rung theo mốc của kịch bản (tắt tiếng vẫn rung; Giảm chuyển động thì không).
    guard KoaHaptics.allowed(reduceMotion: reduceMotion) else { return }
    for m in KoaHaptics.due(KoaHaptics.marks(cueList), at: t, fired: heard.buzzed) {
      heard.buzzed.insert(m.t)
      KoaHapticPlayer.play(m.haptic)
    }
  }

  // MARK: Koa — một hình duy nhất, không đổi dáng

  private func koa(_ f: KoaPerformance.Frame, t: Double, size: CGSize) -> some View {
    var dx = 0.0, dy = 0.0
    if !reduceMotion, cueList.contains(where: { $0.effects.contains(.shake) && t >= $0.from && t < $0.from + 300 }) {
      let a = 6.0
      dx = sin(t * 0.09) * a; dy = cos(t * 0.11) * a
    }
    let hand = KoaPerformance.hand(scene)
    return KoaShowStage.Figure(
      frame: f, size: size, reduceMotion: reduceMotion, gesture: f.cheer > 0.001 ? .cheer : nil,
      worn: hand.map { [.hand: $0] } ?? [:], gestureAmount: min(1.1, f.cheer), shrink: 1 - 0.58 * f.ring)
    .offset(x: dx, y: dy - f.ring * size.height * 0.2)
    .position(x: size.width / 2, y: size.height * KoaShowStage.koaY)
  }

  @ViewBuilder private func ring(_ k: Double) -> some View {
    if k > 0 {
      GeometryReader { g in
        ZStack {
          Circle().stroke(Self.rose, lineWidth: 8).frame(width: 236, height: 236)
          Text(verbatim: "1:30").font(.system(size: 42, weight: .semibold, design: .rounded)).foregroundStyle(.white)
            .offset(y: 70)
        }
        .position(x: g.size.width / 2, y: g.size.height * 0.34 + 40)
        .opacity(k)
      }
    }
  }

  // MARK: chữ, ô số

  @ViewBuilder private func overlay(_ c: KoaPerformance.Cue, since: Double, size: CGSize) -> some View {
    let p = since / max(1, c.to - c.from)
    let op = min(1, since / 120) * min(1, (c.to - c.from - since) / 160)
    let pop = since < 220 ? 1 + (c.effects.contains(.shake) ? 0.6 : 0.3) * (1 - since / 220) : 1
    VStack(spacing: 6) {
      if let title = c.title {
        Text(verbatim: title).font(.system(size: 40, weight: .heavy, design: .rounded)).foregroundStyle(.white)
          .shadow(color: .black.opacity(0.45), radius: 10, y: 4).scaleEffect(reduceMotion ? 1 : pop)
      }
      if let sub = c.subtitle {
        Text(verbatim: sub).font(.system(size: 17, weight: .medium)).foregroundStyle(.white.opacity(0.8))
      }
      Spacer()
      if let chip = c.chip {
        Text(verbatim: chip).font(.system(size: 15, weight: .heavy)).foregroundStyle(.black.opacity(0.85))
          .padding(.horizontal, 14).padding(.vertical, 7).background(Capsule().fill(Self.gold))
          .scaleEffect(since < 220 ? 1.3 - since / 220 * 0.3 : 1)
      }
      if !c.stats.isEmpty {
        HStack(spacing: 10) {
          ForEach(Array(c.stats.enumerated()), id: \.offset) { k, st in
            VStack(spacing: 2) {
              Text(verbatim: "\(Int(st.value * min(1, p / 0.7)).formatted())\(st.unit.isEmpty ? "" : " \(st.unit)")")
                .font(.system(size: 21, weight: .bold, design: .rounded)).foregroundStyle(.white).monospacedDigit()
              Text(verbatim: st.label).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 16).fill(.white.opacity(0.08)))
            .opacity(max(0, min(1, (since - Double(k) * 150) / 150)))
          }
        }
        .padding(.horizontal, 24)
      }
    }
    .opacity(max(0, op))
    .padding(.top, 70).padding(.bottom, 70)
  }
}
