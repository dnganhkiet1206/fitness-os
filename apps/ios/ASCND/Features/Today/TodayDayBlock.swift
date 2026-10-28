import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Khối "ngày" của tab Hôm nay (#527) — bản thiết kế chủ dự án đã duyệt,
/// phương án C (`docs/design/today/README.md`, `mock/RingOptions.dc.html`).
///
/// Khối gồm:
/// - Koa (chạm → phòng linh vật) mặc đồ đã mua, nét mặt theo ngày thật
///   (`KoaMood`, Koa đợt 1) và bong bóng nói về ngày / việc kế tiếp, với MỘT nút
///   đặc màu của việc ấy — điểm nhấn duy nhất của khối;
/// - không còn "N of 5" và viên "xu đang chờ" (19/10): số "xong hôm nay" duy nhất
///   ở "Hôm nay của bạn", và xu tự về — Koa mừng rỡ với "+N" bay lên;
/// - năm ống mảnh (ngủ / bữa / nước / buổi tập / bước) tô dần từ đáy; ống "kế
///   tiếp" có viền màu, quầng sáng nhẹ và nhãn "Next" — khớp bong bóng.
///
/// 15/10 (audit toàn app, chủ dự án chọn "Danh sách là chỗ ghi"): ống chỉ còn là
/// thanh tiến độ thấp, chạm không ghi — ghi ở "Ngày của bạn" (và "Ghi nhanh").
///
/// "Kế tiếp" và câu của Koa là `MascotLine` (port `mascotLine` của RN, có
/// golden) — không có câu nào được bịa; số liệu là `TodayDay` trên CÙNG
/// `DailySignals` của nhiệm vụ ngày. Lời chào khi chưa ghi gì là chữ của bản
/// thiết kế đã duyệt.
///
/// Kính thật của iOS 26 (`glassEffect`); máy cũ hơn dùng material hệ thống;
/// Reduce Transparency → nền đặc. Reduce Motion → không quầng sáng động.
struct TodayDayBlock: View {
  let room: MascotRoomController
  /// Tổng nước hôm nay của sổ nước (gồm lần còn chờ gửi) — như `useTodayWater`
  /// mà Koa của RN đọc: chạm "+250 ml" là ống và câu đổi ngay. `nil` khi sổ
  /// chưa đọc xong.
  var localWaterMl: Int?
  /// Nút trong bong bóng: ghi đúng việc kế tiếp.
  let onAct: (MascotRules.Quest) -> Void
  let onOpenRoom: () -> Void
  /// Nguồn zoom sang phòng linh vật (Koa phóng thành phòng).
  var zoom: Namespace.ID?
  /// Hồ sơ: mục tiêu kcal (ăn quá) và ngày sinh (mũ sinh nhật).
  var profile: Profile?
  /// Giờ muộn của người này (`KoaToday.riskHour`).
  var riskHour = KoaMood.riskHour
  /// Khoá `mascot_inventory` đang mặc — Koa ở đây mặc đúng đồ ở phòng.
  var equipped: [String] = []
  /// Thưởng vừa tự về và app thấy việc vừa xong → Koa mừng rỡ, "+N" bay lên.
  var reward: AppServices.KoaReward?
  /// Koa của ngày (nét mặt, câu, việc kế) — cho widget Koa (đợt 2C).
  var onKoa: ((KoaState) -> Void)?
  /// Tên buổi trong lịch hôm nay (chưa tập) — Koa "đợi ở phòng tập" (đợt 2).
  var planName: String?
  /// Today gọn (GĐ1, mock `daily-plan-today.html`): chỉ Koa nhỏ + dòng "hạng ·
  /// Gains". Việc chính ở `TodayPlanHero`; năm thanh và chuỗi ngày ghi rời Today
  /// (Kiệt 21/10 — dữ liệu chuỗi vẫn nguyên). Câu của Koa vẫn ra widget.
  var compact = false

  struct KoaState: Equatable {
    let emotion: KoaEmotion.Emotion
    let line: String
    let next: MascotRules.Quest?
  }

  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme
  @Environment(AppServices.self) private var services: AppServices?
  /// Được khen hôm nay chưa (khen một lần mỗi ngày, `allowPraise`).
  @State private var praiseAllowed = false
  /// Nhãn "Next" và viền của ống kế tiếp là MỘT vật trượt giữa các ống.
  @Namespace private var nextSpace

  /// Hành động một lần (mừng rỡ) đè lên nét mặt của ngày, rồi tự trả về.
  @State private var oneShot: KoaEmotion.Emotion?
  @State private var burst: AppServices.KoaReward?

  /// Đã khen trong phiên app này — giữ câu khen đến hết phiên.
  @MainActor static var praisedThisSession = false
  /// `ACTION_MS.celebrate`.
  static let celebrateFor: Duration = .milliseconds(2600)

  var body: some View {
    TimelineView(.periodic(from: .now, by: 60)) { context in
      content(hour: Calendar.current.component(.hour, from: context.date))
    }
  }

  @ViewBuilder private func content(hour: Int) -> some View {
    let pending = services?.todayPending(userId: room.userId, today: room.today)
    let signals = TodayDay.merging(room.signals, localWaterMl: localWaterMl, pending: pending)
    let tubes = TodayDay.tubes(signals, stepsGoal: room.stepsGoal)
    let line = MascotLine.line(TodayDay.mascotDay(signals, hour: hour))
    let dayNext = line.gap.map(TodayDay.quest)
    let dayMood = KoaToday.read(
      room: room, localWaterMl: localWaterMl, pending: pending, profile: profile, riskHour: riskHour, hour: hour)
    let daySaid = KoaToday.line(dayMood, signals: signals, profile: profile, streak: room.streak.count)
    // Koa sống theo lịch tập (đợt 2): pump / đợi / mất pump / tụt hạng đè lên Koa của ngày.
    let sched = schedulePhase(hour: hour)
    let mood = sched.map { KoaMood.Read(emotion: Self.emotion($0), reason: dayMood.reason) } ?? dayMood
    let said = sched.map(scheduleLine) ?? daySaid
    let next = sched.map { $0 == .pump ? nil : MascotRules.Quest.workout } ?? dayNext
    // Premium (20/10, Kiệt duyệt mock `today-koa-card.html` + `today-koa-meters.html`
    // kiểu 2): sáng = giấy ấm (A), tối = titan đen như widget (B); năm ống thay
    // bằng năm thanh ngang; câu Koa to không bong bóng; chân thẻ "x/5 · chuỗi".
    let dark = scheme == .dark
    let doneCount = tubes.filter(\.done).count
    let state = KoaState(emotion: mood.emotion, line: said ?? bubbleText(line, tubes: tubes) ?? "", next: next)
    if compact {
      compactRow(emotion: oneShot ?? mood.emotion)
        .task(id: state) { onKoa?(state) }
        .onChange(of: reward?.id) { _, _ in celebrate() }
    } else {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center, spacing: 12) {
        koa(oneShot ?? mood.emotion)
          .frame(width: 104, height: 104)
          .background(
            RadialGradient(
              colors: dark ? [.white.opacity(0.10), .white.opacity(0.02)] : [Color(red: 0.94, green: 0.90, blue: 0.85), Color(red: 0.97, green: 0.95, blue: 0.91)],
              center: UnitPoint(x: 0.5, y: 0.7), startRadius: 0, endRadius: 70),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        VStack(alignment: .leading, spacing: 6) {
          Text("koa.card.name")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(KoaCardInk.muted(dark))
          if let text = said ?? bubbleText(line, tubes: tubes) {
            Text(verbatim: text)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(KoaCardInk.ink(dark))
              .fixedSize(horizontal: false, vertical: true)
              .id(text)
              .transition(reduceMotion ? AnyTransition.opacity : AnyTransition(.blurReplace))
              .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.45), value: text)
          }
          if let next, next != .steps { nextButton(next, dark: dark) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      VStack(spacing: 10) {
        ForEach(tubes) { t in
          KoaBar(tube: t, isNext: t.quest == next, dark: dark, reduceMotion: reduceMotion, unit: services?.preferences.volumeUnit ?? .ml)
        }
      }
      HStack {
        Text(verbatim: "\(doneCount)/\(tubes.count)").font(.system(size: 12, weight: .bold).monospacedDigit())
          .foregroundStyle(KoaCardInk.ink(dark))
          + Text(verbatim: " ") + Text("koa.card.doneToday").font(.system(size: 12)).foregroundStyle(KoaCardInk.muted(dark))
        Spacer()
        if room.streak.count > 0 {
          Label(String(localized: "koa.card.streak \(room.streak.count)"), systemImage: "flame.fill")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(MascotRoomView.signalColor(.meal))
        }
      }
    }
    .padding(18)
    .background { KoaCardBackground(dark: dark) }
    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    .shadow(color: .black.opacity(dark ? 0.25 : 0.08), radius: 14, y: 8)
    // Việc kế tiếp đổi → nhãn và viền trượt sang ống mới; ống dâng như chất lỏng.
    .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.6, bounce: 0.22), value: next)
    .task(id: line) { updatePraise(line) }
    .task(id: KoaState(emotion: mood.emotion, line: said ?? bubbleText(line, tubes: tubes) ?? "", next: next)) {
      onKoa?(KoaState(emotion: mood.emotion, line: said ?? bubbleText(line, tubes: tubes) ?? "", next: next))
    }
    .onChange(of: reward?.id) { _, _ in celebrate() }
    }
  }

  /// Today gọn: Koa nhỏ (chạm → phòng) + tên + "hạng · Gains · còn N tới hạng sau".
  private func compactRow(emotion: KoaEmotion.Emotion) -> some View {
    let g = room.gains
    let lang = services?.preferences.lang ?? .vi
    let ranks = MascotRules.ranks
    let rank = ranks[min(g.rank, ranks.count - 1)].name(lang)
    return HStack(spacing: 12) {
      koa(emotion)
        .frame(width: 64, height: 64)
        .background(DS.Color.secondary.swiftUI.opacity(0.6), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text("koa.card.name")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(String(localized: "dp.gains \(rank) \(g.points)"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if let to = KoaGains.toNext(g.points), g.rank + 1 < ranks.count {
          Text(String(localized: "dp.gains.next \(to.need - to.have) \(ranks[g.rank + 1].name(lang))"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
  }

  // MARK: - Koa theo lịch (đợt 2)

  private func schedulePhase(hour: Int) -> KoaSchedule.Phase? {
    guard let services, let now = services.koaGainsNow, now.userId == room.userId else { return nil }
    let habit = UserRhythm.lateClock(services.habitHours.habit(.workout, userId: room.userId))?.hour
    return KoaSchedule.phase(
      gains: now.state, lastSessionAt: services.koaLastSessionAt, now: SystemWallClock().nowMillis(),
      trainedToday: room.questDone(.workout), plannedToday: planName != nil, hour: hour, habitHour: habit)
  }

  static func emotion(_ p: KoaSchedule.Phase) -> KoaEmotion.Emotion {
    switch p {
    case .pump: .proud
    case .waiting: .warmup
    }
  }

  private func scheduleLine(_ p: KoaSchedule.Phase) -> String {
    switch p {
    case .pump: return String(localized: "koa.sched.pump")
    case .waiting:
      return planName.map { String(localized: "koa.sched.waiting \($0)") } ?? String(localized: "koa.sched.waiting.any")
    }
  }

  // MARK: - Koa

  private func koa(_ emotion: KoaEmotion.Emotion) -> some View {
    Button(action: onOpenRoom) {
      MascotFigureView(emotion: emotion, equipped: equipped, size: compact ? 50 : 76, animated: !reduceMotion)
        .frame(width: compact ? 56 : 84, height: compact ? 64 : 96)
        // Đổi nét mặt: hình cũ mờ sang hình mới (Reduce Motion: đổi ngay).
        .id(emotion)
        .transition(.opacity)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: emotion)
        .background(alignment: .bottom) {
          Ellipse().fill(.black.opacity(0.08)).frame(width: 56, height: 8).blur(radius: 3)
        }
        .overlay(alignment: .top) {
          if let burst {
            coinBurst(burst.amount)
              .id(burst.id)
              .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
          }
        }
        .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.94))
    .modifier(ZoomSource(id: "koa", space: zoom))
    .accessibilityLabel(Text(String(localized: "today.koa.a11y")))
    .sensoryFeedback(.success, trigger: burst?.id)
  }

  /// "+N" vàng bay lên trên đầu Koa khi xu vừa về.
  private func coinBurst(_ amount: Int) -> some View {
    HStack(spacing: 3) {
      Image(systemName: "circle.circle.fill").font(.system(size: 11, weight: .bold))
      Text(verbatim: "+\(amount)").font(.system(size: 14, weight: .heavy).monospacedDigit())
    }
    .foregroundStyle(DS.Color.readinessYellow.swiftUI)
    .padding(.horizontal, 8)
    .frame(minHeight: 24)
    .todayGlass(cornerRadius: 12, solid: reduceTransparency)
    .offset(y: -14)
    .accessibilityHidden(true)
  }

  /// Thưởng vừa về: chỉ việc app THẤY vừa xong mới được mừng (không diễn lại
  /// những việc đã xong lúc app đóng).
  private func celebrate() {
    guard let reward, reward.seen, reward.userId == room.userId else { return }
    AccessibilityNotification.Announcement(String(localized: "koa.say.coins \(reward.amount)")).post()
    withAnimation(reduceMotion ? nil : .spring(duration: 0.45, bounce: 0.3)) {
      oneShot = .celebrate
      burst = reward
    }
    Task {
      try? await Task.sleep(for: Self.celebrateFor)
      guard burst == reward else { return }
      withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
        oneShot = nil
        burst = nil
      }
    }
  }

  // MARK: - Bong bóng

  /// Câu của Koa. Chưa ghi gì và chưa tới giờ việc nào → lời chào của bản thiết
  /// kế; đã xong hết việc tới giờ → khen (một lần mỗi ngày); chưa đọc được
  /// ngày → không bong bóng.
  private func bubbleText(_ line: MascotLine.Line, tubes: [TodayDay.Tube]) -> String? {
    switch line {
    case .ask(let t): return Self.ask(t)
    case .notice(let win, let gap):
      return String(localized: "today.koa.then \(Self.win(win)) \(Self.gap(gap))")
    case .praise: return praiseAllowed ? String(localized: "today.koa.praise") : nil
    case .silent:
      guard room.signals != nil, !tubes.contains(where: \.done) else { return nil }
      return String(localized: "today.koa.greet")
    }
  }

  /// Lời Koa trong bong bóng iMessage xám có đuôi chỉ về Koa (16/10, chủ dự án chọn
  /// mock "A · Bong bóng iMessage"); nút việc kế tiếp nhỏ gọn nằm NGOÀI, ngay dưới.
  private func bubble(_ text: String, next: MascotRules.Quest?) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(verbatim: text)
        .font(.system(size: 15))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
        .messageBubble(mine: false, fill: Color(uiColor: .systemGray5))
        // Koa đổi câu: câu cũ nhoè đi, câu mới hiện ra (Reduce Motion: mờ dần).
        .id(text)
        .transition(reduceMotion ? AnyTransition.opacity : AnyTransition(.blurReplace))
      if let next, next != .steps {
        Button { onAct(next) } label: {
          HStack(spacing: 5) {
            Image(systemName: "plus").font(.system(size: 12, weight: .bold))
            Text(Self.action(next)).font(.system(size: 14, weight: .semibold))
            Text(verbatim: "· +\(TodayDay.coins(next))")
              .font(.system(size: 13, weight: .bold).monospacedDigit())
              .opacity(0.85)
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 14)
          .frame(minHeight: 34)
          .background(MascotRoomView.signalColor(next), in: Capsule())
          .frame(minHeight: 44)
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(Self.action(next)))
        .accessibilityValue(Text(String(localized: "today.day.worth \(TodayDay.coins(next))")))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// Nút "việc kế tiếp": viên đen (sáng) / trắng (tối) có chấm màu việc ấy.
  private func nextButton(_ next: MascotRules.Quest, dark: Bool) -> some View {
    Button { onAct(next) } label: {
      HStack(spacing: 6) {
        Circle().fill(MascotRoomView.signalColor(next)).frame(width: 8, height: 8)
        Text(Self.action(next)).font(.system(size: 13, weight: .bold))
        Text(verbatim: "+\(TodayDay.coins(next))").font(.system(size: 12, weight: .bold).monospacedDigit()).opacity(0.6)
      }
      .foregroundStyle(dark ? Color.black : .white)
      .padding(.horizontal, 12)
      .frame(minHeight: 32)
      .background(dark ? KoaCardInk.ink(true) : KoaCardInk.ink(false), in: Capsule())
      .frame(minHeight: 44)
      .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(Self.action(next)))
    .accessibilityValue(Text(String(localized: "today.day.worth \(TodayDay.coins(next))")))
  }

  // MARK: - Khen một lần mỗi ngày

  private func updatePraise(_ line: MascotLine.Line) {
    guard line == .praise else { return }
    let key = "ascnd-koa-praised-on.\(room.userId)"
    let stored = UserDefaults.standard.string(forKey: key).flatMap { LocalDate($0) }
    praiseAllowed = MascotLine.allowPraise(praisedOn: stored, today: room.today, thisSession: Self.praisedThisSession)
    if praiseAllowed {
      Self.praisedThisSession = true
      UserDefaults.standard.set(room.today.description, forKey: key)
    }
  }

  // MARK: - Chữ

  static func name(_ q: MascotRules.Quest) -> String {
    switch q {
    case .sleep: String(localized: "today.sig.sleep")
    case .meal: String(localized: "today.sig.meal")
    case .water: String(localized: "today.sig.water")
    case .workout: String(localized: "today.sig.workout")
    case .steps: String(localized: "today.sig.steps")
    case .recovery: String(localized: "mr.signal.recovery")
    }
  }

  static func action(_ q: MascotRules.Quest) -> String {
    switch q {
    case .sleep: String(localized: "today.do.sleep")
    case .meal: String(localized: "today.do.meal")
    case .water: String(localized: "today.do.water")
    case .workout: String(localized: "today.do.workout")
    case .steps: String(localized: "today.sig.steps")
    case .recovery: String(localized: "mr.signal.recovery")
    }
  }

  static func ask(_ t: MascotLine.Thing) -> String {
    switch t {
    case .sleep: String(localized: "today.koa.ask.sleep")
    case .meal: String(localized: "today.koa.ask.meal")
    case .water: String(localized: "today.koa.ask.water")
    case .workout: String(localized: "today.koa.ask.workout")
    }
  }

  static func win(_ t: MascotLine.Thing) -> String {
    switch t {
    case .sleep: String(localized: "today.koa.win.sleep")
    case .meal: String(localized: "today.koa.win.meal")
    case .water: String(localized: "today.koa.win.water")
    case .workout: String(localized: "today.koa.win.workout")
    }
  }

  static func gap(_ t: MascotLine.Thing) -> String {
    switch t {
    case .sleep: String(localized: "today.koa.gap.sleep")
    case .meal: String(localized: "today.koa.gap.meal")
    case .water: String(localized: "today.koa.gap.water")
    case .workout: String(localized: "today.koa.gap.workout")
    }
  }

  /// Số dưới ống, Menlo: `7h40` · kcal · `0.8L` / `27oz` · số buổi · `4.1k`.
  static func value(_ t: TodayDay.Tube, unit: Water.Unit = .ml) -> String {
    switch t.quest {
    case .sleep:
      let m = Int(t.amount.rounded())
      return m <= 0 ? "0" : "\(m / 60)h\(String(format: "%02d", m % 60))"
    case .meal: return compact(t.amount)
    case .water:
      // Theo đơn vị đã chọn (trước: luôn lít, kể cả khi người dùng chọn oz).
      return Water.shortLabel(ml: t.amount, unit, locale: .app).replacingOccurrences(of: " ", with: "")
    case .workout: return "\(Int(t.amount))"
    case .steps, .recovery: return compact(t.amount)
    }
  }

  static func compact(_ v: Double) -> String {
    guard v >= 1000 else { return "\(Int(v.rounded()))" }
    return (v / 1000).formatted(.number.precision(.fractionLength(0...1)).locale(.app)) + "k"
  }
}

/// Một ống mảnh (≈ 30 × 104, bo 15): tô từ đáy theo tiến độ, vệt sáng dọc, glyph
/// trong chip nhỏ ở đáy, số đo bên dưới. Ống "kế tiếp": viền 2 điểm màu của nó,
/// quầng sáng nhẹ, nhãn "Next" phía trên.
struct TodayTube: View {
  let tube: TodayDay.Tube
  let isNext: Bool
  let reduceMotion: Bool
  let space: Namespace.ID
  @Environment(AppServices.self) private var services: AppServices?

  static let size = CGSize(width: 26, height: 60)

  private var unit: Water.Unit { services?.preferences.volumeUnit ?? .ml }

  var body: some View {
    let color = MascotRoomView.signalColor(tube.quest)
    VStack(spacing: 6) {
      ZStack {
        // Giữ chỗ cho nhãn ở mọi ống để hàng không nhảy khi nhãn trượt đi.
        Text(String(localized: "today.next")).font(.system(size: 11, weight: .bold)).padding(.vertical, 2).hidden()
        if isNext {
          Text(String(localized: "today.next"))
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color, in: Capsule())
            .matchedGeometryEffect(id: "nextTag", in: space)
        }
      }
      .accessibilityHidden(true)
      ZStack(alignment: .bottom) {
        // Rãnh lõm: tối hơn mặt kính một chút và nhuốm màu tín hiệu, nên ống
        // rỗng vẫn đọc ra hình và ra "ống nào" — không hoà vào thẻ.
        Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.06))
        Capsule().fill(color.opacity(0.10))
        Capsule()
          .strokeBorder(
            LinearGradient(colors: [.black.opacity(0.10), .clear], startPoint: .top, endPoint: .center),
            lineWidth: 3)
          .blur(radius: 2)
        Capsule()
          .fill(LinearGradient(colors: [color.opacity(0.75), color], startPoint: .top, endPoint: .bottom))
          .frame(height: max(tube.fill > 0 ? Self.size.width : 0, Self.size.height * tube.fill))
          .opacity(tube.fill > 0 ? 1 : 0)
          .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.8, bounce: 0.18), value: tube.fill)
        // Vệt sáng dọc.
        Capsule()
          .fill(.white.opacity(0.45))
          .frame(width: 2, height: Self.size.height * 0.62)
          .offset(x: -7, y: -Self.size.height * 0.2)
        Image(systemName: Self.glyph(tube.quest))
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(tube.fill > 0.3 ? .white : color)
          .frame(width: 22, height: 22)
          .background(Circle().fill(tube.fill > 0.3 ? Color.white.opacity(0.22) : color.opacity(0.12)))
          .padding(.bottom, 4)
      }
      .frame(width: Self.size.width, height: Self.size.height)
      .clipShape(Capsule())
      .overlay(Capsule().strokeBorder(color.opacity(tube.fill > 0 ? 0.25 : 0.4), lineWidth: 1))
      .overlay {
        if isNext {
          Capsule()
            .strokeBorder(color, lineWidth: 2)
            .shadow(color: color.opacity(0.45), radius: 8)
            .matchedGeometryEffect(id: "nextRing", in: space)
        }
      }
      Text(verbatim: TodayDayBlock.value(tube, unit: unit))
        .font(DS.TextStyle.number(11, .caption2).weight(.bold))
        .foregroundStyle(tube.done || isNext ? color : DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(minWidth: 44)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: TodayDayBlock.name(tube.quest)))
    .accessibilityValue(Text(verbatim: [
      TodayDayBlock.value(tube, unit: unit),
      tube.done ? String(localized: "today.tube.done") : nil,
      isNext ? String(localized: "today.next") : nil,
    ].compactMap { $0 }.joined(separator: ", ")))
  }

  static func glyph(_ q: MascotRules.Quest) -> String {
    switch q {
    case .sleep: "moon.fill"
    case .meal: "fork.knife"
    case .water: "drop.fill"
    case .workout: "dumbbell.fill"
    case .steps: "figure.walk"
    case .recovery: "bed.double.fill"
    }
  }
}

extension View {
  /// Kính của tab Hôm nay: iOS 26 `glassEffect`; máy cũ hơn → material hệ
  /// thống; Reduce Transparency → nền thẻ đặc.
  @ViewBuilder func todayGlass(cornerRadius: CGFloat, solid: Bool) -> some View {
    if solid {
      self.background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: cornerRadius))
    } else if #available(iOS 26.0, *) {
      self.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    } else {
      self.background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
  }
}

/// Màu chữ của thẻ Koa (sáng: giấy ấm; tối: titan) — giá trị của widget Koa.
enum KoaCardInk {
  static func ink(_ dark: Bool) -> Color { dark ? Color(red: 245/255, green: 243/255, blue: 240/255) : Color(red: 28/255, green: 27/255, blue: 26/255) }
  static func muted(_ dark: Bool) -> Color { dark ? Color(red: 160/255, green: 156/255, blue: 150/255) : Color(red: 118/255, green: 112/255, blue: 104/255) }
  static func track(_ dark: Bool) -> Color { dark ? .white.opacity(0.10) : .black.opacity(0.07) }
}

/// Nền thẻ Koa: sáng = giấy ấm có viền sáng trên + quầng cam góc trên trái (A);
/// tối = titan đen chải ngang + quầng cam (B, như widget Koa).
struct KoaCardBackground: View {
  let dark: Bool
  var body: some View {
    ZStack {
      if dark {
        LinearGradient(colors: [Color(white: 0.15), Color(white: 0.08), Color(white: 0.06)], startPoint: .top, endPoint: .bottom)
        Canvas { ctx, size in
          var y: CGFloat = 0
          var i = 0
          while y < size.height {
            var p = Path()
            p.move(to: CGPoint(x: 0, y: y))
            p.addLine(to: CGPoint(x: size.width, y: y))
            ctx.stroke(p, with: .color(.white.opacity(i % 3 == 0 ? 0.045 : 0.022)), lineWidth: 0.5)
            y += 2
            i += 1
          }
        }
      } else {
        LinearGradient(colors: [Color(red: 1, green: 0.98, blue: 0.95), Color(red: 0.97, green: 0.945, blue: 0.90)], startPoint: .top, endPoint: .bottom)
      }
      RadialGradient(
        colors: [Color(red: 1, green: 0.57, blue: 0.19).opacity(dark ? 0.24 : 0.20), .clear],
        center: UnitPoint(x: 0.05, y: 0.0), startRadius: 0, endRadius: 190)
      LinearGradient(stops: [.init(color: .white.opacity(dark ? 0.10 : 0.6), location: 0), .init(color: .clear, location: 0.12)], startPoint: .top, endPoint: .bottom)
      RoundedRectangle(cornerRadius: 30, style: .continuous)
        .strokeBorder(dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.75)
    }
  }
}

/// Một chỉ số: biểu tượng · tên · thanh · số (mock kiểu 2). Việc kế tiếp: tên đậm
/// và nhãn "Tiếp".
struct KoaBar: View {
  let tube: TodayDay.Tube
  let isNext: Bool
  let dark: Bool
  let reduceMotion: Bool
  let unit: Water.Unit

  var body: some View {
    let color = MascotRoomView.signalColor(tube.quest)
    HStack(spacing: 10) {
      Image(systemName: TodayTube.glyph(tube.quest))
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(color)
        .frame(width: 18)
      Text(verbatim: TodayDayBlock.name(tube.quest))
        .font(.system(size: 13.5, weight: isNext ? .bold : .regular))
        .foregroundStyle(KoaCardInk.ink(dark))
        .frame(width: 64, alignment: .leading)
        .lineLimit(1).minimumScaleFactor(0.8)
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(KoaCardInk.track(dark))
          Capsule().fill(color)
            .frame(width: tube.fill > 0 ? max(7, g.size.width * min(1, tube.fill)) : 0)
            .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.7, bounce: 0.15), value: tube.fill)
        }
      }
      .frame(height: 7)
      Text(verbatim: tube.amount > 0 ? TodayDayBlock.value(tube, unit: unit) : "—")
        .font(DS.TextStyle.number(12.5, .caption).weight(.bold))
        .foregroundStyle(tube.done ? color : KoaCardInk.ink(dark))
        .frame(width: 58, alignment: .trailing)
        .lineLimit(1).minimumScaleFactor(0.7)
    }
    .frame(minHeight: 20)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: TodayDayBlock.name(tube.quest)))
    .accessibilityValue(Text(verbatim: [
      TodayDayBlock.value(tube, unit: unit),
      tube.done ? String(localized: "today.tube.done") : nil,
      isNext ? String(localized: "today.next") : nil,
    ].compactMap { $0 }.joined(separator: ", ")))
  }
}
