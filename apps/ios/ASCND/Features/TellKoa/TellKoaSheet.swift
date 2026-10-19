import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Kể cho Koa" (18/10, chủ dự án: "nút log nhanh có biểu tượng ASCND Intelligence
/// ở màn Hôm nay … giải quyết vấn đề lười, có tuỳ chọn voice to text … cần log
/// chính xác"). Gõ hay nói một câu kể; app tách thành các mục (`SpokenLog`),
/// người dùng xem — và trả lời những chỗ app hỏi lại — rồi bấm Lưu một lần.
///
/// Không có gì được ghi khi chưa bấm Lưu. Mỗi mục ghi qua đúng sổ của nó:
/// - Ngủ: `SleepLogger.submit` (giờ ngủ / dậy; đã có giấc hôm nay thì sổ thay);
/// - Nước: `WaterBook.add` (cộng thêm);
/// - Cân: `WeightLogger.submit`;
/// - Bữa: món nào khớp CHẮC với món gần đây / thư viện (`FoodMatch`) thì ghi qua
///   `MealLogger`; bữa còn món chưa khớp (hay nói theo gram) thì sau khi lưu có nút
///   mở màn ghi bữa đã điền sẵn các món đã khớp — không đoán calo;
/// - Tập: "Đúng kế hoạch" (`ManualLogController.usePlan`) hoặc mở màn ghi buổi tập.
struct TellKoaSheet: View {
  let userId: String
  /// Chữ có sẵn (tin nhắn vừa gửi Koa Coach).
  var initialText = ""
  var onSaved: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(WorkoutFlow.self) private var flow
  @Environment(NutritionBooks.self) private var nutrition: NutritionBooks?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.weightUnit) private var weightUnit

  @State private var text = ""
  @State private var result = SpokenLog.Result()
  @State private var dictation = VoiceDictation()
  @FocusState private var typing: Bool

  // Bản sửa của từng mục (khởi từ `result`, người dùng chỉnh).
  @State private var sleep: SleepEdit?
  @State private var waterMl: Int?
  @State private var weightText = ""
  @State private var workout: SpokenLog.Workout?
  @State private var meals: [MealEdit] = []
  @State private var skipped: Set<Part> = []
  @State private var confirmedQuestion = false

  @State private var saving = false
  @State private var failed: [Part] = []
  @State private var done = false
  /// Việc còn phải làm ở màn riêng sau khi lưu.
  @State private var followUp: FollowUp?
  @State private var mealsToPick: [MealEdit] = []
  @State private var workoutToPick = false

  enum Part: Hashable { case sleep, water, weight, workout, meal(String) }

  struct SleepEdit: Equatable {
    var bed: SleepLog.Clock
    var wake: SleepLog.Clock
    /// "ngủ 7 giờ" chưa rõ: 7 tiếng hay ngủ lúc 7 giờ.
    var askHoursOrClock: Int?
    var askHalf: Bool
  }

  struct MealEdit: Identifiable, Equatable {
    var id: String { slot }
    var slot: String
    var slotGuessed: Bool
    var foods: [FoodEdit]
    var needsScreen: Bool { foods.contains { $0.match == nil || $0.spoken.grams != nil } }
  }

  struct FoodEdit: Identifiable, Equatable {
    let id = UUID()
    var spoken: SpokenLog.Food
    var match: MealLog.Food?
    var searching = true
  }

  enum FollowUp: Identifiable, Hashable {
    case meal(String, [MealLog.Food], query: String)
    case workout
    var id: String {
      switch self {
      case .meal(let s, _, _): "meal-\(s)"
      case .workout: "workout"
      }
    }
  }

  private var lang: AppPreferences.Lang { services.preferences.lang }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          if done { doneView } else { inputCard; parsedList }
        }
        .padding(DS.Spacing.md)
      }
      .scrollDismissesKeyboard(.interactively)
      .safeAreaInset(edge: .bottom) { if !done { saveBar } }
      .toolbar {
        ToolbarItem(placement: .principal) {
          HStack(spacing: 6) {
            IntelligenceMark(size: 16)
            Text("tellkoa.title").font(.system(size: 16, weight: .semibold))
          }
        }
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: done ? "tellkoa.close" : "common.cancel")) {
            dictation.stop()
            dismiss()
          }
        }
      }
      .navigationBarTitleDisplayMode(.inline)
      .ascndPage()
    }
    .presentationDetents([.large])
    .presentationBackground(DS.Color.background.swiftUI)
    .onAppear {
      if text.isEmpty, !initialText.isEmpty {
        text = initialText
        reparse()
      } else if initialText.isEmpty {
        typing = true
      }
    }
    .onChange(of: dictation.transcript) { _, t in
      guard !t.isEmpty else { return }
      text = t
    }
    .task(id: text) {
      // Đọc lại sau khi ngừng gõ / nói một nhịp.
      try? await Task.sleep(for: .milliseconds(350))
      guard !Task.isCancelled else { return }
      reparse()
    }
    .onDisappear { dictation.stop() }
    .sheet(item: $followUp) { f in
      switch f {
      case .meal(let slot, let prefill, let query):
        LogMealView(userId: userId, mealType: slot, start: .search, prefill: prefill, initialQuery: query) { onSaved() }
      case .workout:
        ManualLogView(flow: flow)
      }
    }
  }

  // MARK: - Ô kể

  private var inputCard: some View {
    VStack(alignment: .leading, spacing: 10) {
      ZStack(alignment: .topLeading) {
        if text.isEmpty {
          Text("tellkoa.placeholder")
            .font(.system(size: 17))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.top, 8)
            .padding(.leading, 5)
            .allowsHitTesting(false)
        }
        TextEditor(text: $text)
          .font(.system(size: 17))
          .scrollContentBackground(.hidden)
          .frame(minHeight: 96, maxHeight: 180)
          .focused($typing)
          .accessibilityLabel(Text("tellkoa.field.a11y"))
      }
      HStack(spacing: 10) {
        micButton
        Text(verbatim: micCaption)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(2)
        Spacer(minLength: 0)
        if !text.isEmpty {
          Button {
            text = ""
            typing = true
          } label: {
            Image(systemName: "xmark.circle.fill").foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          .accessibilityLabel(Text("tellkoa.clear"))
        }
      }
    }
    .padding(14)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private var micButton: some View {
    Button {
      if dictation.isListening {
        dictation.stop()
      } else {
        typing = false
        Task { await dictation.start(lang: lang) }
      }
    } label: {
      Image(systemName: dictation.isListening ? "stop.fill" : "mic.fill")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(dictation.isListening ? .white : DS.Color.foreground.swiftUI)
        .frame(width: 44, height: 44)
        .background(dictation.isListening ? DS.Color.destructive.swiftUI : DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
        .symbolEffect(.pulse, isActive: dictation.isListening && !reduceMotion)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(dictation.isListening ? "tellkoa.mic.stop" : "tellkoa.mic.start"))
  }

  private var micCaption: String {
    switch dictation.state {
    case .idle: String(localized: "tellkoa.mic.hint")
    case .listening(let onDevice): String(localized: onDevice ? "tellkoa.mic.listening.device" : "tellkoa.mic.listening.server")
    case .denied: String(localized: "tellkoa.mic.denied")
    case .unavailable: String(localized: "tellkoa.mic.unavailable")
    case .failed: String(localized: "tellkoa.mic.failed")
    }
  }

  // MARK: - Các mục

  @ViewBuilder private var parsedList: some View {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty {
      if result.items.isEmpty {
        note(String(localized: "tellkoa.nothing"), systemImage: "questionmark.bubble")
      } else {
        Text("tellkoa.found").font(DS.TextStyle.footnote.weight(.semibold)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if result.doubts.contains(.mixedQuestion), !confirmedQuestion {
          ask(String(localized: "tellkoa.ask.mixed")) {
            choice(String(localized: "tellkoa.ask.mixed.yes"), selected: false) { confirmedQuestion = true }
          }
        }
        if let sleep { card(.sleep) { sleepRow(sleep) } }
        if result.items.contains(where: { if case .water = $0 { true } else { false } }) { card(.water) { waterRow } }
        if result.items.contains(where: { if case .weight = $0 { true } else { false } }) { card(.weight) { weightRow } }
        if let workout { card(.workout) { workoutRow(workout) } }
        ForEach($meals) { $m in card(.meal(m.slot)) { mealRow($m) } }
      }
      ForEach(result.otherDay, id: \.self) { s in
        note(String(localized: "tellkoa.otherday \(s)"), systemImage: "calendar.badge.exclamationmark")
      }
      ForEach(result.unparsed, id: \.self) { s in
        note(String(localized: "tellkoa.unparsed \(s)"), systemImage: "questionmark.circle")
      }
      if !failed.isEmpty {
        note(String(localized: "tellkoa.failed"), systemImage: "exclamationmark.triangle", tint: DS.Color.destructive.swiftUI)
      }
    } else {
      VStack(alignment: .leading, spacing: 6) {
        Text("tellkoa.examples.title").font(DS.TextStyle.footnote.weight(.semibold))
        ForEach(Self.examples(lang), id: \.self) { ex in
          Button {
            text = ex
          } label: {
            Text(verbatim: "“\(ex)”").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .multilineTextAlignment(.leading)
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 4)
    }
  }

  private func card(_ part: Part, @ViewBuilder _ content: () -> some View) -> some View {
    let off = skipped.contains(part)
    return VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: Self.glyph(part))
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 22, height: 22)
          .background(Self.color(part), in: Circle())
        Text(verbatim: title(part)).font(.system(size: 15, weight: .bold))
        Spacer(minLength: 0)
        Toggle(isOn: Binding(get: { !off }, set: { on in if on { skipped.remove(part) } else { skipped.insert(part) } })) {
          Text("tellkoa.include")
        }
        .labelsHidden()
        .accessibilityLabel(Text(verbatim: title(part)))
      }
      if !off { content() }
      if failed.contains(part) {
        Text("tellkoa.part.failed").font(DS.TextStyle.caption).foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
    .padding(12)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .opacity(off ? 0.55 : 1)
  }

  // Ngủ
  @ViewBuilder private func sleepRow(_ s: SleepEdit) -> some View {
    if let h = s.askHoursOrClock {
      ask(String(localized: "tellkoa.ask.sleepHoursOrClock \(h)")) {
        choice(String(localized: "tellkoa.ask.sleepHours \(h)"), selected: true) {
          self.sleep?.askHoursOrClock = nil
        }
        choice(String(localized: "tellkoa.ask.sleepAt \(h)"), selected: false) {
          self.sleep?.bed = SleepLog.Clock(hour: h < 12 ? h + 12 : h, minute: 0)
          self.sleep?.askHoursOrClock = nil
          self.sleep?.askHalf = true
        }
      }
    }
    if s.askHalf {
      Text(verbatim: String(localized: "tellkoa.ask.sleepHalf")).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    HStack {
      clock("sleepLog.bedtime", Binding(get: { self.sleep?.bed ?? s.bed }, set: { self.sleep?.bed = $0; self.sleep?.askHalf = false }))
      Spacer()
      clock("sleepLog.wake", Binding(get: { self.sleep?.wake ?? s.wake }, set: { self.sleep?.wake = $0; self.sleep?.askHalf = false }))
    }
    Text(verbatim: SpokenLogDisplay.sleep(bed: s.bed, wake: s.wake, lang: lang))
      .font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func clock(_ title: LocalizedStringKey, _ value: Binding<SleepLog.Clock>) -> some View {
    DatePicker(
      title,
      selection: Binding(
        get: { Calendar.current.date(bySettingHour: value.wrappedValue.hour, minute: value.wrappedValue.minute, second: 0, of: Date()) ?? Date() },
        set: { d in
          let c = Calendar.current.dateComponents([.hour, .minute], from: d)
          value.wrappedValue = SleepLog.Clock(hour: c.hour ?? 0, minute: c.minute ?? 0)
        }),
      displayedComponents: .hourAndMinute
    )
    .font(DS.TextStyle.footnote)
    .fixedSize()
  }

  // Nước
  @ViewBuilder private var waterRow: some View {
    if waterMl == nil {
      ask(String(localized: "tellkoa.ask.water")) {
        ForEach([250, 500, 1000], id: \.self) { ml in
          choice(SpokenLogDisplay.water(ml, unit: services.preferences.volumeUnit), selected: false) { waterMl = ml }
        }
      }
    } else {
      Stepper(value: Binding(get: { waterMl ?? 250 }, set: { waterMl = min(max($0, 50), DayCheckIn.waterMaxMl) }), in: 50...DayCheckIn.waterMaxMl, step: 250) {
        Text(verbatim: SpokenLogDisplay.water(waterMl ?? 0, unit: services.preferences.volumeUnit)).font(.system(size: 17, weight: .semibold))
      }
      Text("tellkoa.water.adds").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  // Cân
  private var weightRow: some View {
    HStack(spacing: 8) {
      TextField("", text: $weightText)
        .keyboardType(.decimalPad)
        .font(.system(size: 22, weight: .bold).monospacedDigit())
        .frame(maxWidth: 110)
      Text(verbatim: weightUnit == .lbs ? "lb" : "kg").foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Spacer(minLength: 0)
      if weightKg == nil {
        Text("tellkoa.weight.invalid").font(DS.TextStyle.caption).foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
  }

  private var weightKg: Double? {
    guard let v = Double(weightText.replacingOccurrences(of: ",", with: ".")) else { return nil }
    let kg = weightUnit == .lbs ? v * 0.45359237 : v
    return WeightLog.plausible(kg) ? kg : nil
  }

  // Tập
  @ViewBuilder private func workoutRow(_ w: SpokenLog.Workout) -> some View {
    Text(verbatim: SpokenLogDisplay.workout(w, lang: lang)).font(.system(size: 17, weight: .semibold))
    Text("tellkoa.workout.how").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  // Bữa
  @ViewBuilder private func mealRow(_ m: Binding<MealEdit>) -> some View {
    if m.wrappedValue.slotGuessed {
      ask(String(localized: "tellkoa.ask.slot")) { EmptyView() }
    }
    Picker("", selection: m.slot) {
      ForEach(Self.slots, id: \.self) { t in Text(verbatim: SpokenLogDisplay.slot(t, lang: lang)).tag(t) }
    }
    .pickerStyle(.segmented)
    .labelsHidden()
    .onChange(of: m.wrappedValue.slot) { _, _ in m.wrappedValue.slotGuessed = false }
    ForEach(m.foods) { $f in
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: SpokenLogDisplay.food(f.spoken, lang: lang)).font(.system(size: 15, weight: .semibold))
          if f.searching {
            Text("tellkoa.food.searching").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          } else if let match = f.match, f.spoken.grams == nil {
            Text(verbatim: "\(match.name) · \(Int((match.kcal * f.spoken.servings).rounded())) kcal")
              .font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          } else {
            Text("tellkoa.food.pick").font(DS.TextStyle.caption).foregroundStyle(DS.Color.metricOrange.swiftUI)
          }
        }
        Spacer(minLength: 0)
        if f.match != nil, f.spoken.grams == nil {
          Image(systemName: "checkmark.circle.fill").foregroundStyle(.white, DS.Color.readinessGreen.swiftUI)
        }
      }
    }
    if m.wrappedValue.needsScreen {
      Text("tellkoa.meal.later").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  // Hỏi lại
  private func ask(_ question: String, @ViewBuilder choices: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Label {
        Text(verbatim: question).font(DS.TextStyle.footnote.weight(.semibold))
      } icon: {
        IntelligenceMark(size: 14)
      }
      FlowRows(spacing: DS.Spacing.sm, centered: false) { choices() }
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.foreground.swiftUI.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private func choice(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(verbatim: label)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(selected ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
        .padding(.horizontal, 14)
        .frame(minHeight: 36)
        .background(selected ? DS.Color.foreground.swiftUI : DS.Color.card.swiftUI, in: Capsule())
        .overlay { Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75) }
        .frame(minHeight: 44)
    }
    .buttonStyle(.plain)
  }

  private func note(_ s: String, systemImage: String, tint: Color = DS.Color.mutedForeground.swiftUI) -> some View {
    Label(s, systemImage: systemImage)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(tint)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: - Lưu

  private var included: [Part] {
    var parts: [Part] = []
    if sleep != nil { parts.append(.sleep) }
    if result.items.contains(where: { if case .water = $0 { true } else { false } }) { parts.append(.water) }
    if result.items.contains(where: { if case .weight = $0 { true } else { false } }) { parts.append(.weight) }
    if workout != nil { parts.append(.workout) }
    parts += meals.map { .meal($0.slot) }
    return parts.filter { !skipped.contains($0) }
  }

  /// Còn câu hỏi chưa trả lời thì chưa lưu được.
  private var unanswered: Bool {
    (result.doubts.contains(.mixedQuestion) && !confirmedQuestion)
      || (included.contains(.water) && waterMl == nil)
      || (included.contains(.sleep) && sleep?.askHoursOrClock != nil)
      || (included.contains(.weight) && weightKg == nil)
      || meals.contains { included.contains(.meal($0.slot)) && $0.foods.contains(where: \.searching) }
  }

  private var saveBar: some View {
    VStack(spacing: 6) {
      Button {
        Task { await save() }
      } label: {
        Group {
          if saving {
            ProgressView().tint(DS.Color.background.swiftUI)
          } else {
            Text(included.isEmpty ? String(localized: "tellkoa.save.none") : String(localized: "tellkoa.save \(included.count)"))
          }
        }
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 50)
        .background(Capsule().fill(DS.Color.foreground.swiftUI))
      }
      .buttonStyle(TodayPressStyle())
      .disabled(saving || included.isEmpty || unanswered || dictation.isListening)
      .opacity(included.isEmpty || unanswered ? 0.45 : 1)
      if unanswered, !included.isEmpty {
        Text("tellkoa.answer.first").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 10)
    .background(DS.Color.background.swiftUI)
  }

  private func save() async {
    guard !saving else { return }
    saving = true
    defer { saving = false }
    failed = []
    let online = services.sync.online
    var savedAny = false
    for part in included {
      let ok: Bool
      switch part {
      case .sleep: ok = await saveSleep(online: online)
      case .water: ok = await saveWater(online: online)
      case .weight: ok = await saveWeight(online: online)
      case .workout:
        ok = await saveWorkout()
      case .meal(let slot): ok = await saveMeal(slot, online: online)
      }
      if ok { savedAny = true } else { failed.append(part) }
    }
    if failed.isEmpty {
      if savedAny {
        services.didLog()
        Telemetry.capture(.dayLogged, ["items": "\(included.count)", "source": "tell_koa"])
        AccessibilityNotification.Announcement(String(localized: "tellkoa.saved")).post()
        onSaved()
      }
      withAnimation(reduceMotion ? nil : .smooth) { done = true }
      if mealsToPick.isEmpty, !workoutToPick { dismiss() }
    }
  }

  private func saveSleep(online: Bool) async -> Bool {
    guard let s = sleep, let logger = services.makeSleepLogger(userId: userId) else { return false }
    await logger.load()
    let span = logger.span(bed: s.bed, wake: s.wake)
    switch await logger.submit(span: span, quality: SleepLog.defaultQuality, stages: ["", "", ""], online: online) {
    case .saved, .queued: return true
    default: return false
    }
  }

  private func saveWater(online: Bool) async -> Bool {
    guard let ml = waterMl, let water = nutrition?.water else { return false }
    return (try? await water.add(amountMl: ml, online: online)) != nil
  }

  private func saveWeight(online: Bool) async -> Bool {
    guard let kg = weightKg, let logger = services.makeWeightLogger(userId: userId) else { return false }
    await logger.load()
    switch await logger.submit(kg: kg, online: online) {
    case .saved, .queued: return true
    default: return false
    }
  }

  /// Buổi tập: có buổi theo kế hoạch hôm nay thì ghi đúng kế hoạch; không thì để
  /// người dùng ghi ở màn buổi tập (không tự bịa hiệp / tạ).
  private func saveWorkout() async -> Bool {
    let log = flow.makeManualLog()
    await log.load()
    if await log.usePlan(), (try? await log.save()) != nil { return true }
    workoutToPick = true
    return true
  }

  private func saveMeal(_ slot: String, online: Bool) async -> Bool {
    guard let m = meals.first(where: { $0.slot == slot }) else { return false }
    let matched = m.foods.compactMap { f -> MealLog.Food? in f.spoken.grams == nil ? f.match : nil }
    if m.needsScreen {
      // Ghi ở màn bữa, đã điền sẵn món chắc chắn — không ghi nửa bữa ở đây.
      mealsToPick.append(MealEdit(slot: slot, slotGuessed: false, foods: m.foods))
      return true
    }
    guard let logger = services.makeMealLogger(userId: userId, date: nil, mealType: slot) else { return false }
    for (food, edit) in zip(matched, m.foods) {
      logger.add(food)
      if let id = logger.items.last?.id, edit.spoken.servings != 1 { logger.setServings(id, edit.spoken.servings) }
    }
    if case .queued = await logger.save(online: online) { return true }
    return false
  }

  // MARK: - Xong

  private var doneView: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Label("tellkoa.saved", systemImage: "checkmark.circle.fill")
        .font(.system(size: 20, weight: .bold))
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
      if !mealsToPick.isEmpty || workoutToPick {
        Text("tellkoa.done.more").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      ForEach(mealsToPick) { m in
        followButton(String(localized: "tellkoa.done.pickMeal \(SpokenLogDisplay.slot(m.slot, lang: lang))")) {
          followUp = .meal(
            m.slot, m.foods.compactMap { $0.spoken.grams == nil ? $0.match : nil },
            query: m.foods.first { $0.match == nil || $0.spoken.grams != nil }?.spoken.name ?? "")
        }
      }
      if workoutToPick {
        followButton(String(localized: "tellkoa.done.logWorkout")) { followUp = .workout }
      }
    }
  }

  private func followButton(_ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        Text(verbatim: label).font(.system(size: 16, weight: .semibold))
        Spacer()
        Image(systemName: "chevron.right").foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(14)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  // MARK: - Đọc câu

  private func reparse() {
    let hour = Calendar.current.component(.hour, from: Date())
    let r = SpokenLog.parse(text, hour: hour, weightUnit: weightUnit)
    guard r != result else { return }
    result = r
    confirmedQuestion = false
    failed = []
    sleep = nil
    workout = nil
    var nextMeals: [MealEdit] = []
    for item in r.items {
      switch item {
      case .sleep(let s):
        let wake = s.wake ?? SleepLog.Clock.defaultWake
        let bed = s.bed ?? s.minutes.map { Self.clock(wake, minus: $0) } ?? SleepLog.Clock.defaultBed
        let hoursOrClock = r.doubts.compactMap { if case .sleepHoursOrClock(let h) = $0 { h } else { nil } }.first
        // Chỉ nói thời lượng: giờ ngủ / dậy là app điền — nói rõ để người dùng xem lại.
        sleep = SleepEdit(
          bed: bed, wake: wake, askHoursOrClock: hoursOrClock,
          askHalf: r.doubts.contains(.sleepHalf) || (s.bed == nil && s.wake == nil))
      case .water(let ml): waterMl = ml
      case .weight(let kg):
        let shown = weightUnit == .lbs ? kg / 0.45359237 : kg
        weightText = shown.formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "en_US_POSIX")))
      case .workout(let w): workout = w
      case .meal(let m):
        let guessed = r.doubts.contains(.mealSlot(guess: m.slot))
        // Giữ món đã khớp của lần đọc trước nếu tên không đổi.
        let old = meals.first { $0.slot == m.slot }?.foods ?? []
        let foods = m.foods.map { f in old.first { $0.spoken == f } ?? FoodEdit(spoken: f) }
        nextMeals.append(MealEdit(slot: m.slot, slotGuessed: guessed, foods: foods))
      }
    }
    meals = nextMeals
    Task { await matchFoods() }
  }

  /// Khớp món: món gần đây / yêu thích của chính người dùng trước, thư viện sau.
  private func matchFoods() async {
    let pending = meals.flatMap { m in m.foods.filter(\.searching).map { (m.slot, $0) } }
    guard !pending.isEmpty, let logger = services.makeMealLogger(userId: userId, date: nil, mealType: nil) else {
      for i in meals.indices { for j in meals[i].foods.indices { meals[i].foods[j].searching = false } }
      return
    }
    await logger.loadRecents()
    let mine = logger.favorites + logger.recents
    for (slot, f) in pending {
      var match = FoodMatch.best(f.spoken.name, in: mine)?.food
      if match == nil {
        await logger.search(f.spoken.name)
        match = FoodMatch.best(f.spoken.name, in: logger.results ?? [])?.food
      }
      guard let i = meals.firstIndex(where: { $0.slot == slot }), let j = meals[i].foods.firstIndex(where: { $0.id == f.id }) else { continue }
      meals[i].foods[j].match = match
      meals[i].foods[j].searching = false
    }
    logger.close()
  }

  static func clock(_ c: SleepLog.Clock, minus minutes: Int) -> SleepLog.Clock {
    let total = ((c.hour * 60 + c.minute - minutes) % 1440 + 1440) % 1440
    return SleepLog.Clock(hour: total / 60, minute: total % 60)
  }

  private func title(_ p: Part) -> String {
    switch p {
    case .sleep: String(localized: "tellkoa.part.sleep")
    case .water: String(localized: "tellkoa.part.water")
    case .weight: String(localized: "tellkoa.part.weight")
    case .workout: String(localized: "tellkoa.part.workout")
    case .meal(let slot): SpokenLogDisplay.slot(slot, lang: lang)
    }
  }

  static func glyph(_ p: Part) -> String {
    switch p {
    case .sleep: TodayDayCard.glyph(.sleep)
    case .water: TodayDayCard.glyph(.water)
    case .weight: "scalemass.fill"
    case .workout: TodayDayCard.glyph(.workout)
    case .meal: TodayDayCard.glyph(.meal)
    }
  }

  static func color(_ p: Part) -> Color {
    switch p {
    case .sleep: TodayDayCard.color(.sleep)
    case .water: TodayDayCard.color(.water)
    case .weight: DS.Color.foreground.swiftUI.opacity(0.7)
    case .workout: TodayDayCard.color(.workout)
    case .meal: TodayDayCard.color(.meal)
    }
  }

  /// Bốn bữa người dùng chọn được ở đây (khoá của `MealLog`).
  static let slots = ["breakfast", "lunch", "dinner", "snack"]

  static func examples(_ lang: AppPreferences.Lang) -> [String] {
    switch lang {
    case .vi: ["Tối qua ngủ 7 tiếng, sáng ăn phở bò, uống 2 ly nước", "Vừa tập gym 45 phút, cân 68,5 kg"]
    case .en: ["Slept 7 hours, had oatmeal for breakfast, drank 2 glasses of water", "Just worked out 45 minutes, weighed 150 lb"]
    case .es: ["Dormí 7 horas, desayuné avena y bebí 2 vasos de agua", "Entrené 45 minutos, pesé 68 kg"]
    }
  }
}

/// Chữ hiện của các mục — vi / en / es.
enum SpokenLogDisplay {
  static func slot(_ s: String, lang: AppPreferences.Lang) -> String {
    switch (s, lang) {
    case ("breakfast", .vi): "Bữa sáng"
    case ("lunch", .vi): "Bữa trưa"
    case ("dinner", .vi): "Bữa tối"
    case ("snack", .vi): "Bữa phụ"
    case ("breakfast", .es): "Desayuno"
    case ("lunch", .es): "Almuerzo"
    case ("dinner", .es): "Cena"
    case ("snack", .es): "Merienda"
    case ("breakfast", _): "Breakfast"
    case ("lunch", _): "Lunch"
    case ("dinner", _): "Dinner"
    default: "Snack"
    }
  }

  static func water(_ ml: Int, unit: Water.Unit) -> String {
    if unit == .oz { return "\(Int(Water.displayVolume(Double(ml), unit).rounded())) oz" }
    return ml >= 1000 ? "\((Double(ml) / 1000).formatted(.number.precision(.fractionLength(0...2)).locale(.app))) L" : "\(ml) ml"
  }

  static func sleep(bed: SleepLog.Clock, wake: SleepLog.Clock, lang: AppPreferences.Lang) -> String {
    var m = (wake.hour * 60 + wake.minute) - (bed.hour * 60 + bed.minute)
    if m <= 0 { m += 1440 }
    let h = m / 60, mm = m % 60
    switch lang {
    case .vi: return mm == 0 ? "\(h) tiếng" : "\(h) tiếng \(mm) phút"
    case .en: return mm == 0 ? "\(h) h" : "\(h) h \(mm) min"
    case .es: return mm == 0 ? "\(h) h" : "\(h) h \(mm) min"
    }
  }

  static func workout(_ w: SpokenLog.Workout, lang: AppPreferences.Lang) -> String {
    let names: [SpokenLog.Workout.Kind: [String]] = [
      .run: ["Chạy bộ", "Run", "Correr"], .walk: ["Đi bộ", "Walk", "Caminar"], .cycle: ["Đạp xe", "Cycling", "Bicicleta"],
      .swim: ["Bơi", "Swim", "Natación"], .yoga: ["Yoga", "Yoga", "Yoga"], .gym: ["Tập gym", "Workout", "Entrenamiento"],
      .other: ["Tập luyện", "Workout", "Entrenamiento"],
    ]
    let i: Int, minute: String
    switch lang {
    case .vi: (i, minute) = (0, "phút")
    case .en: (i, minute) = (1, "min")
    case .es: (i, minute) = (2, "min")
    }
    let name = names[w.kind]?[i] ?? ""
    guard let m = w.minutes else { return name }
    return "\(name) · \(m) \(minute)"
  }

  static func food(_ f: SpokenLog.Food, lang: AppPreferences.Lang) -> String {
    var parts: [String] = []
    if let g = f.grams {
      parts.append("\(Int(g.rounded())) g")
    } else if f.servings != 1 || f.unit != nil {
      parts.append(f.servings.formatted(.number.precision(.fractionLength(0...2)).locale(.app)))
      if let u = f.unit { parts.append(u) }
    }
    parts.append(f.name)
    return parts.joined(separator: " ")
  }
}
