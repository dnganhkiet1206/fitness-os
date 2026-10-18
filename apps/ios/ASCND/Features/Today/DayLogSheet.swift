import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Ghi cả ngày" (18/10, chủ dự án duyệt mock A): MỘT form cho mọi việc còn thiếu
/// của hôm nay, điền sẵn theo thói quen — ngày bình thường chỉ cần chạm Lưu.
///
/// Mỗi việc ghi qua đúng sổ của nó (cùng hàng đợi, cùng luật với màn riêng):
/// - Ngủ: `SleepLogger` (giờ ngủ / dậy, chất lượng mặc định, không giai đoạn);
/// - Bữa: "Như hôm qua" = `MealLogger.copyYesterday`; "Chọn món" mở màn ghi bữa;
/// - Nước: MỘT lần ghi tổng số đã chọn (`WaterBook.add`), nấc 250 ml;
/// - Tập: "Đúng kế hoạch" = ghi tay buổi theo kế hoạch hôm nay
///   (`ManualLogController.usePlan` + `save`); "Khác" mở màn ghi tay.
/// Việc nào lỗi thì giữ form và nói việc ấy; việc đã lưu không ghi lại.
struct DayLogSheet: View {
  let userId: String
  let pending: [DayCheckIn.Item]
  let meals: MealLogger?
  let water: WaterBook?
  let waterPrefillMl: Int
  let planName: String?
  var onPickMeal: () -> Void = {}
  var onPickWorkout: () -> Void = {}
  var onSaved: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(WorkoutFlow.self) private var flow
  @Environment(\.dismiss) private var dismiss

  @State private var bed = SleepLog.Clock.defaultBed
  @State private var wake = SleepLog.Clock.defaultWake
  @State private var logSleep = true
  @State private var mealChoice: MealChoice = .likeYesterday
  @State private var waterMl = 0
  @State private var logWater = true
  @State private var workoutChoice: WorkoutChoice = .asPlanned
  @State private var saving = false
  @State private var saved: Set<DayCheckIn.Item> = []
  @State private var failed: [DayCheckIn.Item] = []

  enum MealChoice: Hashable { case likeYesterday, skip }
  enum WorkoutChoice: Hashable { case asPlanned, skip }

  private var unit: Water.Unit { services.preferences.volumeUnit }
  private var hasYesterday: Bool { !(meals?.yesterdayMeals.isEmpty ?? true) }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.sm) {
          ForEach(pending, id: \.self) { item in
            row(item).opacity(saved.contains(item) ? 0.5 : 1)
          }
          if !failed.isEmpty {
            Text(verbatim: Self.failedText(failed))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          Button {
            Task { await save() }
          } label: {
            Group {
              if saving { ProgressView().tint(DS.Color.background.swiftUI) } else { Text("common.save") }
            }
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Capsule().fill(DS.Color.foreground.swiftUI))
          }
          .buttonStyle(TodayPressStyle())
          .disabled(saving)
          .padding(.top, DS.Spacing.xs)
          Text("day.sheet.footer")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(Text("day.sheet.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
      .ascndPage()
    }
    .presentationDetents([.large])
    .presentationBackground(DS.Color.background.swiftUI)
    .onAppear {
      waterMl = waterPrefillMl
      if !hasYesterday { mealChoice = .skip }
      if planName == nil { workoutChoice = .skip }
    }
  }

  // MARK: - Hàng

  @ViewBuilder private func row(_ item: DayCheckIn.Item) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: 8) {
        Image(systemName: TodayDayCard.glyph(item))
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 22, height: 22)
          .background(TodayDayCard.color(item), in: Circle())
        Text(verbatim: TodayDayCard.name(item)).font(.system(size: 15, weight: .bold))
        Spacer(minLength: 0)
        if saved.contains(item) {
          Image(systemName: "checkmark.circle.fill").foregroundStyle(.white, DS.Color.readinessGreen.swiftUI)
        }
      }
      switch item {
      case .sleep: sleepRow
      case .meal: mealRow
      case .water: waterRow
      case .workout: workoutRow
      }
    }
    .padding(12)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.06), lineWidth: 0.75)
    }
    .disabled(saved.contains(item))
  }

  private var sleepRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      Picker("", selection: $logSleep) {
        Text("day.opt.log").tag(true)
        Text("day.opt.skip").tag(false)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      if logSleep {
        HStack {
          clock("sleepLog.bedtime", $bed)
          Spacer()
          clock("sleepLog.wake", $wake)
        }
      }
    }
  }

  private func clock(_ title: LocalizedStringKey, _ value: Binding<SleepLog.Clock>) -> some View {
    DatePicker(
      title,
      selection: Binding(
        get: { Calendar.current.date(bySettingHour: value.wrappedValue.hour, minute: value.wrappedValue.minute, second: 0, of: Date()) ?? Date() },
        set: {
          let c = Calendar.current.dateComponents([.hour, .minute], from: $0)
          value.wrappedValue = SleepLog.Clock(hour: c.hour ?? 0, minute: c.minute ?? 0)
        }),
      displayedComponents: .hourAndMinute
    )
    .font(DS.TextStyle.footnote)
    .fixedSize()
  }

  private var mealRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Picker("", selection: $mealChoice) {
          if hasYesterday { Text("today.meal.yesterday").tag(MealChoice.likeYesterday) }
          Text("day.opt.skip").tag(MealChoice.skip)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        Button(String(localized: "day.opt.pickFoods")) {
          dismiss()
          onPickMeal()
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .buttonStyle(.bordered)
        .tint(DS.Color.foreground.swiftUI)
      }
      Text(verbatim: hasYesterday && mealChoice == .likeYesterday
        ? YesterdayMealsCard.detail(meals?.yesterdayMeals ?? []) : String(localized: "day.meal.none"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private var waterRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      Picker("", selection: $logWater) {
        Text("day.opt.log").tag(true)
        Text("day.opt.skip").tag(false)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      if logWater {
        HStack {
          Text(verbatim: Self.volume(waterMl, unit))
            .font(.system(size: 22, weight: .bold).monospacedDigit())
          Spacer()
          Stepper(
            "", value: $waterMl, in: DayCheckIn.waterStepMl...DayCheckIn.waterMaxMl, step: DayCheckIn.waterStepMl
          )
          .labelsHidden()
          .accessibilityLabel(Text(verbatim: TodayDayCard.name(.water)))
          .accessibilityValue(Text(verbatim: Self.volume(waterMl, unit)))
        }
      }
    }
  }

  private var workoutRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Picker("", selection: $workoutChoice) {
          if planName != nil { Text("day.opt.asPlanned").tag(WorkoutChoice.asPlanned) }
          Text("day.opt.skip").tag(WorkoutChoice.skip)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        Button(String(localized: "day.opt.other")) {
          dismiss()
          onPickWorkout()
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .buttonStyle(.bordered)
        .tint(DS.Color.foreground.swiftUI)
      }
      if let planName {
        Text(verbatim: planName)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  static func failedText(_ items: [DayCheckIn.Item]) -> String {
    let names = items.map(TodayDayCard.name).joined(separator: ", ")
    return String(localized: "day.sheet.failed \(names)")
  }

  /// "2,0 L" / "68 oz".
  static func volume(_ ml: Int, _ unit: Water.Unit) -> String {
    if unit == .oz {
      return "\(Int(Water.displayVolume(Double(ml), unit).rounded())) oz"
    }
    let liters = Double(ml) / 1000
    return "\(liters.formatted(.number.precision(.fractionLength(1)).locale(.app))) L"
  }

  // MARK: - Lưu

  private func save() async {
    guard !saving else { return }
    saving = true
    defer { saving = false }
    failed = []
    let online = services.sync.online
    for item in pending where !saved.contains(item) {
      if await save(item, online: online) { saved.insert(item) } else { failed.append(item) }
    }
    if failed.isEmpty {
      AccessibilityNotification.Announcement(String(localized: "day.saved")).post()
      Telemetry.capture(.dayLogged, ["items": "\(saved.count)"])
      services.didLog()
      onSaved()
      dismiss()
    }
  }

  /// `true` = đã lưu hoặc người dùng chọn bỏ qua.
  private func save(_ item: DayCheckIn.Item, online: Bool) async -> Bool {
    switch item {
    case .sleep:
      guard logSleep else { return true }
      guard let logger = services.makeSleepLogger(userId: userId) else { return false }
      await logger.load()
      let span = logger.span(bed: bed, wake: wake)
      switch await logger.submit(span: span, quality: SleepLog.defaultQuality, stages: ["", "", ""], online: online) {
      case .saved, .queued: return true
      default: return false
      }
    case .meal:
      guard mealChoice == .likeYesterday, let meals else { return true }
      if case .queued = await meals.copyYesterday(online: online) { return true }
      return false
    case .water:
      guard logWater, waterMl > 0 else { return true }
      guard let water else { return false }
      do {
        _ = try await water.add(amountMl: waterMl, online: online)
        return true
      } catch {
        return false
      }
    case .workout:
      guard workoutChoice == .asPlanned else { return true }
      let log = flow.makeManualLog()
      await log.load()
      guard await log.usePlan() else { return false }
      do {
        _ = try await log.save()
        return true
      } catch {
        return false
      }
    }
  }
}
