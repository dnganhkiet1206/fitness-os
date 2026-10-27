import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một lần uống: giọt nước, lượng + đơn vị, giờ.
struct WaterLogRow: View {
  let log: WaterLog
  let unit: Water.Unit

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Image(systemName: "drop.fill")
        .foregroundStyle(WaterView.blue)
        .frame(width: 32, height: 32)
        .background(WaterView.blue.opacity(0.14), in: Circle())
        .accessibilityHidden(true)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(verbatim: Water.entryAmount(log.amountMl, unit)).font(DS.TextStyle.headline.monospacedDigit())
        Text(verbatim: Water.unitLabel(unit))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer()
      Text(verbatim: WaterView.time(log.loggedAt))
        .font(DS.TextStyle.footnote.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
    .frame(minHeight: 52)
    .accessibilityElement(children: .combine)
  }
}

/// Màn Nước uống (#527 Phase 3) — `app/water.tsx` @ native/src trên `WaterBook`.
///
/// Như RN:
/// - số to + "mục tiêu X" + phần trăm + thanh; mục tiêu là
///   `profiles.water_target_ml`, thiếu thì 2500 ml;
/// - thêm nhanh ba lượng TRÒN của đơn vị đang hiện (ml 250/500/750, oz 8/12/16),
///   "−" bớt lần uống gần nhất (chỉ online), "Lượng khác" mở ô nhập tay có rào
///   2000 ml / 68 oz — quá rào thì nói ra, không lưu, không cắt;
/// - biểu đồ 7 ngày: trung bình, cột hôm nay sáng nhất, ngày đạt mục tiêu sáng
///   hơn ngày chưa đạt, chạm một ngày để đọc số;
/// - nhật ký hôm nay: mới nhất trước, gập được, mở sẵn.
///
/// Khác RN / chưa có:
/// - app chưa có toast: kết quả ghi (đã giữ khi mất mạng, lỗi) hiện thành MỘT
///   dòng dưới hàng nút và được đọc bằng VoiceOver;
/// - lần đọc đầu hỏng thì nói "không đọc được" thay vì hiện 0 (RN hiện 0);
/// - thiết kế lại 13/10 (chủ dự án chọn hướng B, "màu xanh dương của nước",
///   vòng thay bằng CỐC NƯỚC): cốc dâng theo lượng đã uống + số Menlo, hàng
///   nút viên nang xanh nhạt, tuần là bảy cốc nhỏ (chạm một cốc để đọc số),
///   nhật ký trong một thẻ danh sách.
struct WaterView: View {
  /// Xanh nước (DS `metricBlueWash`, #3ba6ff) và mực xanh cho chữ trên nền nhạt.
  static let blue = DS.Color.metricBlueWash.swiftUI
  static let ink = DS.Color.metricBlueInk.swiftUI

  let book: WaterBook
  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @State private var feedback = WaterFeedback()
  @State private var showsManual = false
  @State private var logsOpen = true

  private var unit: Water.Unit { services.preferences.volumeUnit }
  private var target: Double { Water.target(profile?.profile?.waterTargetMl) }

  var body: some View {
    content
      .ascndPage()
      .navigationTitle(String(localized: "water.title"))
      .task { await book.clockTick() }
      .refreshable { await book.refresh() }
      .onChange(of: scenePhase) { _, phase in
        guard phase == .active else { return }
        Task { await book.clockTick() }
      }
      .onNewDay { Task { await book.clockTick() } }
      .sheet(isPresented: $showsManual) {
        WaterManualSheet(unit: unit) { amount in
          showsManual = false
          Task { await feedback.add(Water.toMl(amount, unit), to: book, online: services.sync.online) }
        }
      }
  }

  @ViewBuilder private var content: some View {
    if !book.loaded {
      // Chưa có số nào: không bao giờ nói "0" thay cho "chưa đọc được".
      switch book.failure {
      case nil:
        DSLoadingView()
      case .offline?:
        DSOfflineView { Task { await book.refresh() } }
      case .unavailable?:
        DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.refresh() } }
      }
    } else {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          summary
          WaterWeekCups(days: book.week, average: book.average, today: book.date, target: target, unit: unit)
            .padding(DS.Spacing.md)
            .todayCard()
          if !book.logs.isEmpty { logSection }
        }
        .padding(DS.Spacing.md)
      }
      .statusBarScrim()
    }
  }

  // MARK: - Hôm nay

  private var summary: some View {
    let pct = Water.percent(totalMl: book.totalMl, targetMl: target)
    return VStack(spacing: DS.Spacing.md) {
      VStack(spacing: DS.Spacing.sm) {
        WaterCup(fraction: pct / 100, reduceMotion: reduceMotion)
          .frame(width: 118, height: 150)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(verbatim: Water.shortLabel(ml: Double(book.totalMl), unit, locale: .app)
            .replacingOccurrences(of: unit == .oz ? " oz" : " L", with: ""))
            .font(DS.TextStyle.number(34, .largeTitle).weight(.bold))
            .monospacedDigit()
            // Số chạy lên khi thêm nước (Kiệt 22/10).
            .contentTransition(.numericText(value: Double(book.totalMl)))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: book.totalMl)
          Text(verbatim: "/ " + Water.shortLabel(ml: target, unit, locale: .app))
            .font(DS.TextStyle.number(15, .body))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Text(verbatim: Water.percentLabel(pct))
          .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
          .contentTransition(.numericText(value: pct))
          .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: pct)
          .foregroundStyle(Self.ink)
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, 3)
          .background(Self.blue.opacity(0.16), in: Capsule())
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "water.title")))
      .accessibilityValue(Text(verbatim: Self.summaryValue(book.totalMl, target: target, pct: pct, unit: unit)))

      WaterQuickAddRow(book: book, unit: unit, feedback: feedback)

      Button {
        showsManual = true
      } label: {
        Label(String(localized: "water.custom"), systemImage: "pencil.line")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "water.custom")))
      .sensoryFeedback(.selection, trigger: showsManual) { _, open in open }

      WaterFeedbackLine(feedback: feedback)
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity)
    .todayCard()
  }

  /// VoiceOver: "1.80L, mục tiêu 2.5L, 72%".
  static func summaryValue(_ totalMl: Int, target: Double, pct: Double, unit: Water.Unit) -> String {
    let of = String(localized: "water.ofTarget \(Water.targetLabel(target, unit))")
    return "\(Water.bigValue(totalMl: totalMl, unit)), \(of), \(Water.percentLabel(pct))"
  }

  // MARK: - Nhật ký hôm nay

  private var logSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Button(action: toggleLogs) { logHeader }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "water.todayLog")))
        .accessibilityValue(Text(verbatim: logState))
        .sensoryFeedback(.selection, trigger: logsOpen)
      if logsOpen {
        VStack(spacing: 0) {
          ForEach(Array(book.logs.enumerated()), id: \.element.id) { i, log in
            if i > 0 { Divider().padding(.leading, 62).opacity(0.6) }
            WaterLogRow(log: log, unit: unit)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .todayCard()
        .transition(reduceMotion ? .identity : .opacity.combined(with: .move(edge: .top)))
      }
    }
  }

  private func toggleLogs() {
    if reduceMotion {
      logsOpen.toggle()
    } else {
      withAnimation(.easeOut(duration: DSMotion.transitionDuration)) { logsOpen.toggle() }
    }
  }

  /// Số lần vẫn hiện khi gập — tiêu đề nói còn bao nhiêu ở sau nó.
  private var logHeader: some View {
    HStack {
      Text(String(localized: "water.todayLog")).font(DS.TextStyle.headline)
      Spacer()
      Text(Self.entries(book.logs.count))
        .font(DS.TextStyle.footnote.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Image(systemName: "chevron.down")
        .rotationEffect(.degrees(logsOpen ? 180 : 0))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .frame(minHeight: 44)
    .contentShape(Rectangle())
  }

  /// VoiceOver: "3 lần, Đang mở" — trạng thái gập như `aria-expanded` của RN.
  private var logState: String {
    let state = logsOpen ? String(localized: "xi.a11y.expanded") : String(localized: "xi.a11y.collapsed")
    return "\(Self.entries(book.logs.count)), \(state)"
  }

  /// "1 lần" / "3 lần" (`nWaterEntriesOne` / `nWaterEntries`).
  static func entries(_ n: Int) -> String {
    n == 1 ? String(localized: "water.entries.one") : String(localized: "water.entries \(n)")
  }

  /// Giờ của MÁY theo ngôn ngữ app (`toLocaleTimeString(…, {hour, minute})`).
  static func time(_ t: EpochMillis) -> String {
    t.date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(.app))
  }
}

// MARK: - Thêm nhanh (màn Nước + thẻ ở tab Dinh dưỡng)

/// "−" + ba lượng tròn — `water.tsx` và `WaterQuickAdd` của RN dùng chung một
/// bộ số (`water-presets.ts`), ở đây dùng chung một view.
struct WaterQuickAddRow: View {
  let book: WaterBook
  let unit: Water.Unit
  let feedback: WaterFeedback
  @Environment(AppServices.self) private var services
  @State private var added = 0

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      // Nhãn nói đúng việc nó làm — bớt lần uống gần nhất, đối của "+250" —
      // chứ không phải "Xoá" (#125): một bước lùi mà "+" lấy lại được.
      Button {
        Task { await feedback.removeLast(from: book, online: services.sync.online) }
      } label: {
        Image(systemName: "minus")
          .font(.body.weight(.semibold))
          .frame(minWidth: 46, minHeight: 46)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .overlay(Capsule().stroke(DS.Color.border.swiftUI, lineWidth: 1))
      .opacity(book.canRemove ? 1 : 0.4)
      .disabled(!book.canRemove)
      .sensoryFeedback(.selection, trigger: book.removing) { _, running in running }
      .accessibilityLabel(Text(String(localized: "water.a11y.undo")))

      ForEach(Water.quickAmounts(unit), id: \.self) { amount in
        Button {
          added += 1
          Task { await feedback.add(Water.toMl(Double(amount), unit), to: book, online: services.sync.online) }
        } label: {
          HStack(spacing: 2) {
            Image(systemName: "plus").font(.caption.weight(.bold))
            Text(verbatim: "\(amount)").font(DS.TextStyle.headline.monospacedDigit())
          }
          .foregroundStyle(WaterView.ink)
          .frame(maxWidth: .infinity, minHeight: 46)
          .background(WaterView.blue.opacity(0.16), in: Capsule())
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "water.a11y.add \(String(amount)) \(Water.unitLabel(unit))")))
      }
    }
    // Rung NGAY lúc chạm (RN `Haptics.light()` trong `onPress`), không đợi server.
    .sensoryFeedback(.impact(weight: .light), trigger: added)
  }
}

// MARK: - Kết quả ghi

/// Dòng kết quả thay cho toast của RN: đã giữ khi mất mạng / lỗi. Một dòng,
/// đọc bằng VoiceOver, tự tắt sau vài giây.
@MainActor @Observable
final class WaterFeedback {
  private(set) var message: String?
  private(set) var isError = false
  private var token = 0

  func add(_ ml: Int, to book: WaterBook, online: Bool) async {
    do {
      switch try await book.add(amountMl: ml, online: online) {
      case .saved: break
      case .queued: show(String(localized: "water.queued"), error: false)
      }
    } catch {
      show(String(localized: "async.error.generic"), error: true)
    }
  }

  func removeLast(from book: WaterBook, online: Bool) async {
    switch await book.removeLast(online: online) {
    case .removed, .nothingToRemove: break
    case .onlineOnly: show(String(localized: "water.error.onlineOnly"), error: true)
    case .nothingWritten: show(String(localized: "water.error.nothingWritten"), error: true)
    case .failed: show(String(localized: "async.error.generic"), error: true)
    }
  }

  private func show(_ text: String, error: Bool) {
    token += 1
    let mine = token
    message = text
    isError = error
    AccessibilityNotification.Announcement(text).post()
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(4))
      guard let self, self.token == mine else { return }
      self.message = nil
    }
  }
}

struct WaterFeedbackLine: View {
  let feedback: WaterFeedback

  var body: some View {
    if let message = feedback.message {
      Label(message, systemImage: feedback.isError ? "exclamationmark.circle" : "checkmark.circle")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(feedback.isError ? DS.Color.destructive.swiftUI : DS.Color.mutedForeground.swiftUI)
        .padding(.top, DS.Spacing.xs)
    }
  }
}

// MARK: - Cốc nước

/// Hình học chung của cốc trong khung `r`: miệng elip ở trên, thân thuôn
/// nhẹ, đáy cong (vẽ lại 14/10 — chủ dự án: cốc trước "chưa đẹp").
struct CupGeometry {
  let r: CGRect

  /// Độ cao nửa elip miệng / đáy.
  var rimH: CGFloat { r.height * 0.075 }
  var topY: CGFloat { r.minY + rimH }
  var bottomY: CGFloat { r.maxY - rimH * 1.1 }
  var inset: CGFloat { r.width * 0.11 }

  /// Mép trái / phải của thân ở độ cao `y` (thân thuôn tuyến tính).
  func halfWidth(at y: CGFloat) -> CGFloat {
    let t = max(0, min(1, (y - topY) / max(1, bottomY - topY)))
    return (r.width / 2) - inset * t
  }

  /// Bóng của thân (trước + sau), dùng để tô và cắt.
  var body: Path {
    var p = Path()
    let w0 = halfWidth(at: topY), w1 = halfWidth(at: bottomY)
    p.move(to: CGPoint(x: r.midX - w0, y: topY))
    p.addLine(to: CGPoint(x: r.midX - w1, y: bottomY))
    p.addQuadCurve(to: CGPoint(x: r.midX + w1, y: bottomY), control: CGPoint(x: r.midX, y: bottomY + rimH * 2))
    p.addLine(to: CGPoint(x: r.midX + w0, y: topY))
    p.addQuadCurve(to: CGPoint(x: r.midX - w0, y: topY), control: CGPoint(x: r.midX, y: topY - rimH * 2))
    p.closeSubpath()
    return p
  }

  /// Elip ngang ở độ cao `y` (miệng cốc, mặt nước).
  func ellipse(at y: CGFloat, scale: CGFloat = 1) -> CGRect {
    let w = halfWidth(at: y) * scale
    let h = rimH * (w / (r.width / 2))
    return CGRect(x: r.midX - w, y: y - h, width: w * 2, height: h * 2)
  }

  /// Độ cao của mặt nước cho mực 0…1.
  func waterY(_ level: Double) -> CGFloat { bottomY - (bottomY - topY) * CGFloat(level) * 0.94 }
}

/// Khối nước: phần thân dưới mặt nước (mặt nước là nửa trước của elip).
struct WaterBody: Shape {
  var level: Double
  var animatableData: Double {
    get { level }
    set { level = newValue }
  }

  func path(in r: CGRect) -> Path {
    let g = CupGeometry(r: r)
    guard level > 0.001 else { return Path() }
    let y = g.waterY(level)
    let w = g.halfWidth(at: y), w1 = g.halfWidth(at: g.bottomY)
    let e = g.ellipse(at: y)
    var p = Path()
    p.move(to: CGPoint(x: r.midX - w, y: y))
    p.addLine(to: CGPoint(x: r.midX - w1, y: g.bottomY))
    p.addQuadCurve(to: CGPoint(x: r.midX + w1, y: g.bottomY), control: CGPoint(x: r.midX, y: g.bottomY + g.rimH * 2))
    p.addLine(to: CGPoint(x: r.midX + w, y: y))
    p.addQuadCurve(to: CGPoint(x: r.midX - w, y: y), control: CGPoint(x: r.midX, y: y + e.height))
    p.closeSubpath()
    return p
  }
}

/// Mặt nước: một elip sáng ở mực nước.
struct WaterTop: Shape {
  var level: Double
  var animatableData: Double {
    get { level }
    set { level = newValue }
  }

  func path(in r: CGRect) -> Path {
    let g = CupGeometry(r: r)
    guard level > 0.001 else { return Path() }
    return Path(ellipseIn: g.ellipse(at: g.waterY(level)))
  }
}

struct CupBody: Shape {
  func path(in r: CGRect) -> Path { CupGeometry(r: r).body }
}

struct CupRim: Shape {
  func path(in r: CGRect) -> Path {
    let g = CupGeometry(r: r)
    return Path(ellipseIn: g.ellipse(at: g.topY))
  }
}

/// Đáy kính dày: một thấu kính mờ sát đáy.
struct CupBase: Shape {
  func path(in r: CGRect) -> Path {
    let g = CupGeometry(r: r)
    return Path(ellipseIn: g.ellipse(at: g.bottomY - g.rimH * 0.2, scale: 0.86))
  }
}

/// Cốc nước dâng theo lượng đã uống (thay vòng tiến độ — chủ dự án, 13/10).
struct WaterCup: View {
  /// 0…1+ (quá mục tiêu vẫn đầy cốc).
  let fraction: Double
  let reduceMotion: Bool
  var small = false
  @Environment(\.colorScheme) private var scheme

  private var water: LinearGradient {
    LinearGradient(
      colors: [Color(red: 0.49, green: 0.80, blue: 1.0), WaterView.blue, Color(red: 0.10, green: 0.50, blue: 0.93)],
      startPoint: .top, endPoint: .bottom)
  }

  var body: some View {
    let level = max(0, min(1, fraction))
    let glass = Color.white.opacity(scheme == .dark ? 0.06 : 0.45)
    let edge = WaterView.blue.opacity(scheme == .dark ? 0.55 : 0.4)
    ZStack {
      if !small {
        // Bóng đổ mềm dưới đáy.
        Ellipse()
          .fill(.black.opacity(scheme == .dark ? 0.35 : 0.08))
          .frame(height: 12)
          .blur(radius: 5)
          .frame(maxHeight: .infinity, alignment: .bottom)
          .offset(y: 6)
      }
      CupBody().fill(glass)
      CupBody().fill(WaterView.blue.opacity(0.07))
      WaterBody(level: level).fill(water)
      WaterTop(level: level)
        .fill(Color(red: 0.70, green: 0.88, blue: 1.0).opacity(0.95))
        .overlay(WaterTop(level: level).stroke(.white.opacity(0.6), lineWidth: small ? 0.5 : 1))
      if !small {
        CupBase().fill(.white.opacity(0.35))
        // Hai vệt sáng trên thành cốc.
        GeometryReader { geo in
          let g = CupGeometry(r: CGRect(origin: .zero, size: geo.size))
          let x = geo.size.width / 2 - g.halfWidth(at: g.topY) * 0.7
          Capsule()
            .fill(LinearGradient(colors: [.white.opacity(0.75), .white.opacity(0.1)], startPoint: .top, endPoint: .bottom))
            .frame(width: 7, height: (g.bottomY - g.topY) * 0.72)
            .position(x: x + 6, y: g.topY + (g.bottomY - g.topY) * 0.42)
          Capsule()
            .fill(.white.opacity(0.35))
            .frame(width: 3, height: (g.bottomY - g.topY) * 0.3)
            .position(x: geo.size.width - x - 4, y: g.topY + (g.bottomY - g.topY) * 0.3)
        }
        .clipShape(CupBody())
      }
      CupBody().stroke(edge, lineWidth: small ? 1 : 1.5)
      CupRim().stroke(edge, lineWidth: small ? 1 : 1.5)
      if !small { CupRim().fill(.white.opacity(0.25)) }
    }
    .animation(reduceMotion ? nil : .spring(duration: 0.7, bounce: 0.2), value: level)
    .accessibilityHidden(true)
  }
}

// MARK: - Bảy cốc của tuần

/// Trung bình các ngày có ghi (7 ngày TRƯỚC hôm nay, `AverageWindow`) + bảy cốc nhỏ (hôm nay
/// đậm chữ); chạm một cốc để đọc số của ngày ấy. Số và thang như `WaterChart` của RN.
struct WaterWeekCups: View {
  let days: [WaterDay]
  /// `WaterBook.average` — không gồm hôm nay (Kiệt 27/10); hôm nay là cốc lớn ở trên.
  let average: AverageWindow.Average?
  let today: LocalDate
  let target: Double
  let unit: Water.Unit
  @State private var picked: LocalDate?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "water.average"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          // Cùng chữ với Tiến bộ / Dinh dưỡng ("64 oz", "1,9 L"), không phải "64,5 oz" của RN.
          Text(verbatim: average.map { Water.shortLabel(ml: $0.value, unit, locale: .app) } ?? "–")
            .font(DS.TextStyle.number(20, .title3).weight(.bold))
          // Trung bình chia cho ngày CÓ ghi — nói rõ mẫu số.
          Text(String(localized: "insight.sub.days \("\(average?.days ?? 0)/\(AverageWindow.length)")"))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer()
        Text(verbatim: pickedLabel)
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.trailing)
      }
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(days, id: \.date) { d in
          let isToday = d.date == today
          Button {
            picked = picked == d.date ? nil : d.date
          } label: {
            VStack(spacing: 6) {
              WaterCup(fraction: target > 0 ? Double(d.totalMl) / target : 0, reduceMotion: reduceMotion, small: true)
                .frame(width: 26, height: 34)
                .opacity(picked == nil || picked == d.date ? 1 : 0.45)
              Text(verbatim: WaterWeekCups.weekday(d.date))
                .font(DS.TextStyle.caption.weight(isToday ? .bold : .regular))
                .foregroundStyle(isToday ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: WaterWeekCups.dayName(d.date, long: true)))
          .accessibilityValue(Text(verbatim: Water.chartVolume(Double(d.totalMl), unit)))
        }
      }
      .sensoryFeedback(.selection, trigger: picked)
    }
  }

  /// "7 ngày qua", hoặc số của ngày đang chạm.
  private var pickedLabel: String {
    guard let picked, let d = days.first(where: { $0.date == picked }) else {
      return String(localized: "water.last7")
    }
    return Water.chartVolume(Double(d.totalMl), unit) + " · " + Self.dayName(d.date, long: false)
  }

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
  }

  /// `dayLabel`: dài cho VoiceOver, ngắn cho ô số.
  static func dayName(_ d: LocalDate, long: Bool) -> String {
    let style =
      long
      ? Date.FormatStyle().weekday(.wide).day().month(.wide)
      : Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated)
    return d.calendarDate.formatted(style.locale(.app))
  }
}

// MARK: - Ô nhập tay

/// `ManualWaterSheet`: bàn phím số, một ô; dấu phẩy và dấu chấm đều là dấu
/// thập phân; quá rào thì nói và không lưu.
struct WaterManualSheet: View {
  let unit: Water.Unit
  let onSave: (Double) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    let check = Water.check(text, unit)
    VStack(spacing: DS.Spacing.md) {
      Text(String(localized: "water.custom.title"))
        .font(DS.TextStyle.headline)
        .frame(maxWidth: .infinity, alignment: .leading)
      HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
        TextField(text: $text, prompt: Text(verbatim: "0")) {
          Text(String(localized: "water.custom.title"))
        }
        .keyboardType(.decimalPad)
        .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
        .focused($focused)
        .onChange(of: text) { _, new in
          let clean = Water.sanitize(new)
          if clean != new { text = clean }
        }
        Text(verbatim: Water.unitLabel(unit))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
      .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))

      // Chỗ của câu cảnh báo giữ sẵn dù có hiện hay không — tấm không nhảy cao
      // lên lúc số vượt rào.
      Text(String(localized: "water.tooMuch \(Water.limitLabel(unit))"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.destructive.swiftUI)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(check.tooMuch ? 1 : 0)
        .accessibilityHidden(!check.tooMuch)

      HStack(spacing: DS.Spacing.sm) {
        DSButton(String(localized: "common.cancel"), style: .secondary) { dismiss() }
        DSButton(String(localized: "common.save")) {
          if check.valid, let amount = check.amount { onSave(amount) }
        }
        .disabled(!check.valid)
        .opacity(check.valid ? 1 : 0.5)
      }
    }
    .padding(DS.Spacing.lg)
    .presentationDetents([.height(300)])
    // Nền đặc màu trang (16/10, chủ dự án: thẻ trên bảng kính khó nhìn — như Ghi nhanh).
    .presentationBackground(DS.Color.background.swiftUI)
    .onAppear { focused = true }
  }

}
