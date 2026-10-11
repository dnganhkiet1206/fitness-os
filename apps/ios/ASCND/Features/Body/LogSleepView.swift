import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn ghi giấc ngủ (#527) — `app/log-sleep.tsx` trên `SleepLogger`.
///
/// Như RN:
/// - giờ đi ngủ / giờ dậy (mặc định 23:00 / 07:00) và thời lượng "7h 05m";
/// - ba ô giai đoạn (phút); ô sai hay tổng vượt cả đêm thì báo và khoá nút;
///   thời lượng ngoài 10–960 phút cũng vậy;
/// - năm mặt chất lượng 2…10 (mặc định 8);
/// - đêm hôm nay do Apple Health ghi: ghi chú, điền sẵn, và hỏi lại trước khi
///   lưu khi có sửa;
/// - có mạng: lưu (ghi lại cùng đêm là sửa) rồi đóng; mất mạng: xếp hàng,
///   "đã lưu — sẽ đồng bộ", đóng; lỗi: báo, ở lại.
///
/// Khác RN: không ghi ngược Apple Health (guardrail #527). Mở từ deep link
/// `ascnd://log-sleep` (lối vào ở Hôm nay / bảng Cơ thể là màn của E).
struct LogSleepView: View {
  let makeLogger: () -> SleepLogger?
  var onDone: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @State private var logger: SleepLogger?
  @State private var bed = SleepLog.Clock.defaultBed
  @State private var wake = SleepLog.Clock.defaultWake
  @State private var stages = ["", "", ""]
  @State private var quality = SleepLog.defaultQuality
  @State private var message: String?
  @State private var confirming = 0
  @State private var prefilled = false

  private var span: SleepLog.Span {
    logger?.span(bed: bed, wake: wake) ?? SleepLog.span(bed: bed, wake: wake, ref: EpochMillis(Date()), in: .current)
  }

  private var durationError: String? {
    SleepLog.durationBad(span.minutes)
      ? String(localized: "weight.outOfRange \("10") \("960") \(String(localized: "sleepLog.minutes"))") : nil
  }

  private var stageError: String? {
    switch SleepLog.stageProblem(stages, minutes: span.minutes) {
    case .outOfRange?:
      String(localized: "weight.outOfRange \("0") \("1440") \(String(localized: "sleepLog.minutes"))")
    case .overrun(let sum, let total)?:
      String(localized: "sleepLog.overrun \(Units.text(sum)) \(total)")
    case nil:
      nil
    }
  }

  private var canSave: Bool {
    guard let logger, !logger.submitting, !logger.done else { return false }
    return durationError == nil && stageError == nil
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          if logger?.healthNight != nil {
            Text(String(localized: "sleepLog.healthNote"))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          times
          Text(String(localized: "sleepLog.stages"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          HStack(spacing: DS.Spacing.sm) {
            stageCell(0, "sleepLog.deep")
            stageCell(1, "sleepLog.rem")
            stageCell(2, "sleepLog.light")
          }
          ForEach([stageError, durationError, message].compactMap { $0 }, id: \.self) { text in
            Text(verbatim: text)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          Text(String(localized: "sleepLog.how"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          qualityRow
          DSButton(String(localized: "sleepLog.save")) { requestSave() }
            .disabled(!canSave)
            .opacity(canSave ? 1 : 0.5)
        }
        .padding(DS.Spacing.lg)
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(Text("sleepLog.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
      .alert(
        String(localized: "sleepLog.override.title"),
        isPresented: Binding(get: { confirming > 0 }, set: { if !$0 { confirming = 0 } })
      ) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
        Button(String(localized: "sleepLog.override.confirm")) { Task { await save() } }
      } message: {
        Text(String(localized: "sleepLog.override.message \(confirming)"))
      }
    }
    .task {
      guard logger == nil else { return }
      let l = makeLogger()
      logger = l
      await l?.load()
      prefill()
    }
    .onDisappear { logger?.close() }
  }

  // MARK: - Phần màn

  private var times: some View {
    VStack(spacing: 0) {
      timeRow("sleepLog.bedtime", $bed)
      Divider()
      timeRow("sleepLog.wake", $wake)
      Divider()
      HStack {
        Text(String(localized: "sleepLog.duration"))
        Spacer()
        Text(verbatim: "\(span.minutes / 60)h \(String(format: "%02d", span.minutes % 60))m")
          .font(DS.TextStyle.headline.monospacedDigit())
      }
      .frame(minHeight: 52)
      .accessibilityElement(children: .combine)
    }
    .padding(.horizontal, DS.Spacing.md)
    .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  private func timeRow(_ key: String.LocalizationValue, _ value: Binding<SleepLog.Clock>) -> some View {
    DatePicker(
      String(localized: key),
      selection: Binding(
        get: {
          Calendar.current.date(bySettingHour: value.wrappedValue.hour, minute: value.wrappedValue.minute, second: 0, of: Date())
            ?? Date()
        },
        set: { d in
          let c = Calendar.current.dateComponents([.hour, .minute], from: d)
          value.wrappedValue = SleepLog.Clock(hour: c.hour ?? 0, minute: c.minute ?? 0)
        }),
      displayedComponents: .hourAndMinute
    )
    .frame(minHeight: 52)
  }

  private func stageCell(_ i: Int, _ key: String.LocalizationValue) -> some View {
    VStack(spacing: 4) {
      Text(String(localized: key))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      TextField("0", text: Binding(get: { stages[i] }, set: { stages[i] = NumberInput.decimal($0) }))
        .keyboardType(.numberPad)
        .multilineTextAlignment(.center)
        .frame(minHeight: 48)
        .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        .accessibilityLabel(Text(String(localized: key)))
      Text(String(localized: "sleepLog.minutes"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .frame(maxWidth: .infinity)
  }

  private static let faces: [(Int, String, DSColor)] = [
    (2, "face.dashed", DS.Color.readinessRed), (4, "cloud.rain", DS.Color.metricOrange),
    (6, "minus.circle", DS.Color.readinessYellow), (8, "face.smiling", DS.Color.readinessGreen),
    (10, "sun.max", DS.Color.metricCyan),
  ]

  private var qualityRow: some View {
    HStack(spacing: DS.Spacing.sm) {
      ForEach(Self.faces, id: \.0) { value, icon, color in
        let active = quality == value
        Button {
          quality = value
        } label: {
          Image(systemName: icon)
            .font(.title2)
            .foregroundStyle(active ? color.swiftUI : DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(
              active ? color.swiftUI.opacity(0.14) : DS.Color.background.swiftUI,
              in: RoundedRectangle(cornerRadius: DS.Radius.md)
            )
            .overlay(RoundedRectangle(cornerRadius: DS.Radius.md).stroke(active ? color.swiftUI : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "sleepLog.quality \(value) \(SleepLog.qualityMax)")))
        .accessibilityAddTraits(active ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: quality)
      }
    }
  }

  // MARK: - Hành động

  /// Điền sẵn MỘT lần từ đêm của Health — không giật chữ khỏi tay người đang gõ.
  private func prefill() {
    guard !prefilled, let night = logger?.healthNight else { return }
    prefilled = true
    if let b = SleepLog.millis(night["bedtime"]) { bed = SleepLog.clock(EpochMillis(b), in: .current) }
    if let w = SleepLog.millis(night["waketime"]) { wake = SleepLog.clock(EpochMillis(w), in: .current) }
    let filled = SleepLog.prefill(SleepLog.healthStages(night))
    for i in 0..<3 where !filled[i].isEmpty { stages[i] = filled[i] }
  }

  /// Mất mạng: xếp hàng ngay (RN không hỏi lại ở nhánh này). Có mạng: có sửa
  /// số của Health thì hỏi lại trước.
  private func requestSave() {
    guard let logger else { return }
    if services.sync.online {
      let n = logger.healthChanges(span: span, stages: stages)
      if n > 0 {
        confirming = n
        return
      }
    }
    Task { await save() }
  }

  private func save() async {
    guard let logger else { return }
    message = nil
    switch await logger.submit(span: span, quality: quality, stages: stages, online: services.sync.online) {
    case .saved:
      AccessibilityNotification.Announcement(String(localized: "sleepLog.saved")).post()
      onDone()
      dismiss()
    case .queued:
      AccessibilityNotification.Announcement(String(localized: "weight.queued")).post()
      onDone()
      dismiss()
    case .invalid, .unavailable:
      break
    case .replaceGone:
      show(String(localized: "sleepLog.gone"))
    case .failed:
      show(String(localized: "async.error.generic"))
    }
  }

  private func show(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}
