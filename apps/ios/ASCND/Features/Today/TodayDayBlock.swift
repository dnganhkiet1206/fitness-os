import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Khối "ngày" của tab Hôm nay (#527) — bản thiết kế chủ dự án đã duyệt,
/// phương án C (`docs/design/today/README.md`, `mock/RingOptions.dc.html`).
///
/// Ngày được đếm MỘT lần, ở đây:
/// - Koa (chạm → phòng linh vật) và bong bóng nói việc kế tiếp, với MỘT nút đặc
///   màu của việc ấy — điểm nhấn duy nhất của khối;
/// - "N of 5" và viên xu đang chờ nhận;
/// - năm ống mảnh (ngủ / bữa / nước / buổi tập / bước) tô dần từ đáy; ống "kế
///   tiếp" có viền màu, quầng sáng nhẹ và nhãn "Next" — khớp bong bóng.
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
  /// Nút trong bong bóng / chạm ống: ghi đúng việc ấy.
  let onAct: (MascotRules.Quest) -> Void
  let onOpenRoom: () -> Void
  /// Nguồn zoom sang phòng linh vật (Koa phóng thành phòng).
  var zoom: Namespace.ID?

  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// Được khen hôm nay chưa (khen một lần mỗi ngày, `allowPraise`).
  @State private var praiseAllowed = false
  /// Nhãn "Next" và viền của ống kế tiếp là MỘT vật trượt giữa các ống.
  @Namespace private var nextSpace

  /// Đã khen trong phiên app này — giữ câu khen đến hết phiên.
  @MainActor static var praisedThisSession = false

  var body: some View {
    TimelineView(.periodic(from: .now, by: 60)) { context in
      content(hour: Calendar.current.component(.hour, from: context.date))
    }
  }

  private func content(hour: Int) -> some View {
    let signals = TodayDay.merging(room.signals, localWaterMl: localWaterMl)
    let tubes = TodayDay.tubes(signals, stepsGoal: room.stepsGoal)
    let line = MascotLine.line(TodayDay.mascotDay(signals, hour: hour))
    let next = line.gap.map(TodayDay.quest)
    let total = MascotRules.energySignals.count
    return VStack(spacing: 18) {
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        koa
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          HStack(alignment: .firstTextBaseline) {
            countText(done: tubes.filter(\.done).count, total: total)
            Spacer(minLength: 0)
            if waitingCoins > 0 { coinPill(waitingCoins) }
          }
          if let text = bubbleText(line, tubes: tubes) {
            bubble(text, next: next)
              .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.45), value: text)
          }
        }
      }
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(tubes) { t in
          TodayTube(tube: t, isNext: t.quest == next, reduceMotion: reduceMotion, space: nextSpace) { onAct(t.quest) }
            .frame(maxWidth: .infinity)
        }
      }
    }
    .padding(DS.Spacing.md)
    .todayCard(radius: 30)
    // Việc kế tiếp đổi → nhãn và viền trượt sang ống mới; ống dâng như chất lỏng.
    .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.6, bounce: 0.22), value: next)
    .task(id: line) { updatePraise(line) }
  }

  // MARK: - Koa

  private var koa: some View {
    Button(action: onOpenRoom) {
      MascotFigureView(size: 76, animated: !reduceMotion)
        .frame(width: 84, height: 96)
        .background(alignment: .bottom) {
          Ellipse().fill(.black.opacity(0.08)).frame(width: 56, height: 8).blur(radius: 3)
        }
        .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.94))
    .modifier(ZoomSource(id: "koa", space: zoom))
    .accessibilityLabel(Text(String(localized: "today.koa.a11y")))
  }

  private func countText(done: Int, total: Int) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      Text(verbatim: "\(done)")
        .font(.custom("Menlo", size: 26, relativeTo: .title).weight(.bold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .contentTransition(.numericText(value: Double(done)))
        .animation(.smooth(duration: 0.4), value: done)
      Text(String(localized: "today.day.of \(total)"))
        .font(.custom("Menlo", size: 15, relativeTo: .body).weight(.bold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "today.day.a11y \(done) \(total)")))
  }

  /// Xu của các việc đã xong mà chưa nhận (nhận ở phòng linh vật).
  private var waitingCoins: Int {
    room.activeQuests
      .filter { room.questDone($0.key) && !room.isClaimed(MascotRules.questRefKey(room.today, $0.key)) }
      .map(\.coins).reduce(0, +)
  }

  private func coinPill(_ coins: Int) -> some View {
    Button(action: onOpenRoom) {
      HStack(spacing: 4) {
        Image(systemName: "circle.circle.fill")
          .font(.system(size: 12, weight: .bold))
        Text(String(localized: "today.day.coins \(coins)"))
          .font(.system(size: 13, weight: .bold).monospacedDigit())
      }
      .foregroundStyle(DS.Color.readinessYellow.swiftUI)
      .padding(.horizontal, 10)
      .frame(minHeight: 32)
      .todayGlass(cornerRadius: 16, solid: reduceTransparency)
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(String(localized: "today.day.coins.a11y \(coins)")))
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

  private func bubble(_ text: String, next: MascotRules.Quest?) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(verbatim: text)
        .font(.system(size: 15))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
        // Koa đổi câu: câu cũ nhoè đi, câu mới hiện ra (Reduce Motion: mờ dần).
        .id(text)
        .transition(reduceMotion ? AnyTransition.opacity : AnyTransition(.blurReplace))
      if let next, next != .steps {
        Button { onAct(next) } label: {
          HStack(spacing: 6) {
            Image(systemName: "plus").font(.system(size: 14, weight: .bold))
            Text(Self.action(next)).font(.system(size: 15, weight: .semibold))
            Text(verbatim: "+\(TodayDay.coins(next))")
              .font(.system(size: 13, weight: .bold).monospacedDigit())
              .opacity(0.85)
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 16)
          .frame(minHeight: 44)
          .background(MascotRoomView.signalColor(next), in: Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(Self.action(next)))
        .accessibilityValue(Text(String(localized: "today.day.worth \(TodayDay.coins(next))")))
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 5, bottomTrailingRadius: 16, topTrailingRadius: 16)
        .fill(DS.Color.card.swiftUI.opacity(reduceTransparency ? 1 : 0.82)))
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
    }
  }

  static func action(_ q: MascotRules.Quest) -> String {
    switch q {
    case .sleep: String(localized: "today.do.sleep")
    case .meal: String(localized: "today.do.meal")
    case .water: String(localized: "today.do.water")
    case .workout: String(localized: "today.do.workout")
    case .steps: String(localized: "today.sig.steps")
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
    case .steps: return compact(t.amount)
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
  let action: () -> Void
  @Environment(AppServices.self) private var services: AppServices?

  static let size = CGSize(width: 30, height: 104)

  private var unit: Water.Unit { services?.preferences.volumeUnit ?? .ml }

  var body: some View {
    let color = MascotRoomView.signalColor(tube.quest)
    Button(action: action) {
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
          .font(.custom("Menlo", size: 11, relativeTo: .caption2).weight(.bold))
          .foregroundStyle(tube.done || isNext ? color : DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      .frame(minWidth: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    // Bước chân tự đến từ Apple Health — không bấm được. KHÔNG dùng
    // `.disabled`: iOS làm mờ nút bị tắt, nên ống trông như chưa đồng bộ
    // dù đã có số (chủ dự án 15/10: "Apple Health đã sync sao thanh vẫn mờ").
    .allowsHitTesting(tube.quest != .steps)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: TodayDayBlock.name(tube.quest)))
    .accessibilityValue(Text(verbatim: [
      TodayDayBlock.value(tube, unit: unit),
      tube.done ? String(localized: "today.tube.done") : nil,
      isNext ? String(localized: "today.next") : nil,
    ].compactMap { $0 }.joined(separator: ", ")))
    .accessibilityAddTraits(tube.quest == .steps ? [] : .isButton)
  }

  static func glyph(_ q: MascotRules.Quest) -> String {
    switch q {
    case .sleep: "moon.fill"
    case .meal: "fork.knife"
    case .water: "drop.fill"
    case .workout: "dumbbell.fill"
    case .steps: "figure.walk"
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
