import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Một lần uống: giọt nước, lượng + đơn vị, giờ.
struct WaterLogRow: View {
  let log: WaterLog
  let unit: Water.Unit

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Image(systemName: "drop.fill")
        .foregroundStyle(DS.Color.metricBlue.swiftUI)
        .frame(width: 32, height: 32)
        .background(DS.Color.metricBlue.swiftUI.opacity(0.12), in: Circle())
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
    .frame(minHeight: 44)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
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
/// - lần đọc đầu hỏng thì nói "không đọc được" thay vì hiện 0 (RN hiện 0).
struct WaterView: View {
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
      .navigationTitle(String(localized: "water.title"))
      .task { await book.clockTick() }
      .refreshable { await book.refresh() }
      .onChange(of: scenePhase) { _, phase in
        guard phase == .active else { return }
        Task { await book.clockTick() }
      }
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
          DSCard { WaterWeekChart(days: book.week, today: book.date, target: target, unit: unit) }
          if !book.logs.isEmpty { logSection }
        }
        .padding(DS.Spacing.md)
      }
    }
  }

  // MARK: - Hôm nay

  private var summary: some View {
    let pct = Water.percent(totalMl: book.totalMl, targetMl: target)
    return DSCard {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: Water.bigValue(totalMl: book.totalMl, unit))
              .font(DS.TextStyle.mono(.largeTitle).weight(.bold))
            Text(String(localized: "water.ofTarget \(Water.targetLabel(target, unit))"))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          Text(verbatim: Water.percentLabel(pct))
            .font(DS.TextStyle.title.monospacedDigit())
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "water.title")))
        .accessibilityValue(Text(verbatim: Self.summaryValue(book.totalMl, target: target, pct: pct, unit: unit)))

        WaterProgressBar(fraction: pct / 100)
          .padding(.top, DS.Spacing.md)

        Text(String(localized: "water.quickAdd"))
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(1)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.top, DS.Spacing.md)
        WaterQuickAddRow(book: book, unit: unit, feedback: feedback)
          .padding(.top, DS.Spacing.sm)

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
        .padding(.top, DS.Spacing.xs)

        WaterFeedbackLine(feedback: feedback)
      }
    }
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
        ForEach(book.logs) { log in
          WaterLogRow(log: log, unit: unit)
            .transition(reduceMotion ? .identity : .opacity.combined(with: .move(edge: .top)))
        }
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
      .overlay(RoundedRectangle(cornerRadius: DS.Radius.md).stroke(DS.Color.border.swiftUI, lineWidth: 1))
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
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 46)
          .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
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

// MARK: - Thanh tiến độ

struct WaterProgressBar: View {
  /// 0…1.
  let fraction: Double

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(DS.Color.background.swiftUI)
        Capsule()
          .fill(DS.Color.metricBlue.swiftUI)
          .frame(width: geo.size.width * max(0, min(1, fraction)))
      }
    }
    .frame(height: 10)
    .accessibilityHidden(true)
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
    .onAppear { focused = true }
  }

}

// MARK: - Biểu đồ 7 ngày

/// `WaterChart`: trung bình, trục 0 / nửa / trần tròn (trần ≥ ngày cao nhất
/// và mục tiêu), mỗi ngày một cột — sáng nhất là hôm nay đã đạt; chạm một ngày
/// để đọc số.
struct WaterWeekChart: View {
  let days: [WaterDay]
  let today: LocalDate
  let target: Double
  let unit: Water.Unit
  @State private var picked: String?

  var body: some View {
    let best = Double(days.map(\.totalMl).max() ?? 0)
    let top = Water.scaleTop(needMl: max(best, target), unit)
    VStack(alignment: .leading, spacing: 2) {
      Text(String(localized: "water.average"))
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(verbatim: Water.averageLabel(days, unit))
        .font(DS.TextStyle.mono(.title2).weight(.bold))
      Text(String(localized: "water.last7"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)

      Chart(days, id: \.date) { d in
        BarMark(
          x: .value("day", d.date.description),
          y: .value("ml", min(Double(d.totalMl), Double(top.ml))),
          width: .ratio(0.42)
        )
        .foregroundStyle(DS.Color.metricBlue.swiftUI.opacity(Self.brightness(d, today: today, target: target, picked: picked)))
        .cornerRadius(4)
        .accessibilityLabel(Text(verbatim: Self.dayName(d.date, long: true)))
        .accessibilityValue(Text(verbatim: Water.chartVolume(Double(d.totalMl), unit)))

        if let picked, picked == d.date.description {
          RuleMark(x: .value("day", picked))
            .foregroundStyle(.clear)
            .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
              VStack(spacing: 0) {
                Text(verbatim: Water.chartVolume(Double(d.totalMl), unit)).font(DS.TextStyle.footnote.weight(.bold))
                Text(verbatim: Self.dayName(d.date, long: false)).font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              .padding(.horizontal, DS.Spacing.sm)
              .padding(.vertical, DS.Spacing.xs)
              .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
            }
        }
      }
      .chartYScale(domain: 0...Double(top.ml))
      .chartYAxis {
        AxisMarks(position: .trailing, values: [0, Double(top.ml) / 2, Double(top.ml)]) { value in
          AxisGridLine()
          AxisValueLabel {
            if let ml = value.as(Double.self) {
              Text(verbatim: Water.axisLabel(Self.axisValue(ml, top: top, unit: unit), unit))
            }
          }
        }
      }
      .chartXAxis {
        AxisMarks { value in
          AxisValueLabel {
            if let key = value.as(String.self), let d = LocalDate(key) {
              Text(verbatim: Self.weekday(d))
            }
          }
        }
      }
      .chartXSelection(value: $picked)
      .frame(height: 170)
      .padding(.top, DS.Spacing.md)
      .sensoryFeedback(.selection, trigger: picked)
    }
  }

  /// `brightness`: (hôm nay ? 1 : 0.72) × (đạt ? 1 : 0.625) × (ngày khác đang
  /// được chọn ? 0.4 : 1) — số của `water-chart.tsx`.
  static func brightness(_ d: WaterDay, today: LocalDate, target: Double, picked: String?) -> Double {
    let isToday = d.date == today
    let met = Double(d.totalMl) >= target
    let faded = picked != nil && picked != d.date.description
    return (isToday ? 1 : 0.72) * (met ? 1 : 0.625) * (faded ? 0.4 : 1)
  }

  /// Giá trị trục theo ĐƠN VỊ HIỂN THỊ (`axisLabel(top.display * f, unit)` của
  /// RN) — với ml thì chính là ml.
  static func axisValue(_ ml: Double, top: (ml: Int, display: Double), unit: Water.Unit) -> Double {
    guard top.ml > 0 else { return 0 }
    return unit == .oz ? top.display * ml / Double(top.ml) : ml
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
