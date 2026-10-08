import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Sửa hồ sơ (#527 Phase 8) — `app/edit-profile.tsx` @ fac9ac2, trên
/// `ProfileBook` / `ProfileForm` (#443) và `ProfileEntry` / `MacroTargets`.
/// Mở từ thẻ tài khoản của Cài đặt (`settings.tsx:350`).
///
/// Như RN:
/// - mở trên đúng hồ sơ đã lưu; cột trống là ô TRỐNG, không bao giờ là số bịa;
///   hồ sơ về sau khi đã mở thì chỉ điền lại khi CHƯA ai sửa gì (`useFormSeed`);
/// - cao / nặng / nước gõ theo đơn vị của người dùng, form giữ cm / kg / ml;
///   đổi đơn vị thì ô đổi ngay tại chỗ; số đo ngoài cận thì báo dưới ô và khoá Lưu;
/// - "Tính lại theo chỉ số": cùng chuỗi với onboarding; thiếu số đo nào thì từ
///   chối và nói đúng ô thiếu — không số dự phòng;
/// - bốn macro lệch mục tiêu calo quá biên làm tròn thì nói ra con số, KHÔNG chặn lưu;
/// - dị ứng: tám ô của onboarding + mọi giá trị lạ đã lưu (hiện để gỡ được);
/// - Lưu cần mạng; xong thì đóng. Đóng bằng X là không lưu (như RN).
///
/// Khác RN (có chủ đích): app chưa có toast — kết quả "Tính lại" hiện ngay
/// dưới nút và đọc bằng VoiceOver; lỗi lưu là một alert gọi đúng tên lỗi.
struct EditProfileView: View {
  let book: ProfileBook

  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss

  @State private var form = ProfileForm()
  @State private var heightText = ""
  @State private var weightText = ""
  @State private var waterText = ""
  /// Đã sửa gì chưa — chưa thì hồ sơ mới về được điền lại (`useFormSeed`).
  @State private var edited = false
  @State private var showDob = false
  @State private var recalcNote: RecalcNote?
  @State private var failure: ProfileSaveFailure?
  @State private var saved = false

  enum RecalcNote: Equatable {
    case done
    case missing([FitnessCalc.StatField])
  }

  var body: some View {
    NavigationStack {
      Form {
        identity
        measurements
        choices
        targets
        sleep
        food
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(Text(String(localized: "ep.title")))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel(Text(String(localized: "common.cancel")))
        }
        ToolbarItem(placement: .confirmationAction) {
          Button {
            Task { await save() }
          } label: {
            if saved {
              Image(systemName: "checkmark")
            } else if book.saving {
              ProgressView()
            } else {
              Text(String(localized: "common.save")).bold()
            }
          }
          .disabled(book.saving || saved || form.statsBad)
          .accessibilityLabel(Text(String(localized: "common.save")))
        }
      }
      .alert(
        String(localized: "ep.error.title"),
        isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
      ) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      } message: {
        Text(failure.map(Self.message) ?? "")
      }
    }
    .onAppear { seed() }
    .onChange(of: book.profile) { _, _ in
      if !edited { seed() }
    }
  }

  // MARK: - Tên, ngày sinh, giới tính

  private var identity: some View {
    Section {
      TextField(String(localized: "ep.name"), text: edit(\.name), prompt: Text(verbatim: "—"))
        .textContentType(.name)
        .frame(minHeight: 44)
        .accessibilityLabel(Text(String(localized: "ep.name")))
      Button {
        showDob.toggle()
      } label: {
        LabeledContent(String(localized: "ep.dob")) {
          Text(verbatim: form.dob.isEmpty ? "—" : form.dob).monospacedDigit()
        }
      }
      .frame(minHeight: 44)
      .accessibilityHint(Text(String(localized: "ep.dob.hint")))
      if showDob {
        DatePicker(
          String(localized: "ep.dob"),
          selection: Binding(
            get: { (LocalDate(form.dob) ?? OnboardingDraft.defaultDob).calendarDate },
            set: { d in
              if let day = LocalDate(calendarDate: d) { update { $0.dob = day.description } }
            }),
          in: ...Date(),
          displayedComponents: .date
        )
        .datePickerStyle(.wheel)
        .labelsHidden()
      }
      Picker(String(localized: "ep.sex"), selection: edit(\.sex)) {
        Text(String(localized: "onboarding.sex.male")).tag("male")
        Text(String(localized: "onboarding.sex.female")).tag("female")
        Text(String(localized: "onboarding.sex.other")).tag("other")
      }
      .pickerStyle(.segmented)
      .accessibilityLabel(Text(String(localized: "ep.sex")))
    }
  }

  // MARK: - Chiều cao, cân nặng

  private var measurements: some View {
    Section {
      measure(
        .height, label: String(localized: "ep.height \(form.unitsHeight)"), text: $heightText,
        unit: form.unitsHeight, invalid: form.height == .outOfRange)
      unitPicker(String(localized: "ep.heightUnit"), options: ["cm", "in"], selection: heightUnit)
      measure(
        .weight, label: String(localized: "ep.weight \(form.unitsWeight)"), text: $weightText,
        unit: form.unitsWeight, invalid: form.weight == .outOfRange)
      unitPicker(String(localized: "ep.weightUnit"), options: ["kg", "lbs"], selection: weightUnit)
    } footer: {
      // Cận đo bằng cm / kg (đơn vị lưu), như RN `statMessage`.
      VStack(alignment: .leading, spacing: 2) {
        if form.height == .outOfRange { rangeError(FitnessCalc.heightBounds, unit: "cm") }
        if form.weight == .outOfRange { rangeError(FitnessCalc.weightBounds, unit: "kg") }
      }
    }
  }

  private func measure(
    _ field: ProfileEntry.Field, label: String, text: Binding<String>, unit: String, invalid: Bool
  ) -> some View {
    LabeledContent(label) {
      TextField(
        label,
        text: Binding(
          get: { text.wrappedValue },
          set: { raw in
            let v = NumberInput.decimal(raw)
            text.wrappedValue = v
            update { f in
              let metric = ProfileEntry.metric(field, display: v, unit: unit)
              switch field {
              case .height: f.heightCm = metric
              case .weight: f.weightKg = metric
              case .water: f.waterTargetMl = metric
              }
            }
          })
      )
      .keyboardType(.decimalPad)
      .multilineTextAlignment(.trailing)
      .monospacedDigit()
      .foregroundStyle(invalid ? DS.Color.destructive.swiftUI : DS.Color.foreground.swiftUI)
      .accessibilityLabel(Text(verbatim: label))
    }
    .frame(minHeight: 44)
  }

  private func unitPicker(_ label: String, options: [String], selection: Binding<String>) -> some View {
    Picker(label, selection: selection) {
      ForEach(options, id: \.self) { Text(verbatim: $0).tag($0) }
    }
    .pickerStyle(.segmented)
    .accessibilityLabel(Text(verbatim: label))
  }

  private func rangeError(_ bounds: ClosedRange<Double>, unit: String) -> some View {
    Text(String(localized: "onboarding.outOfRange \(Int(bounds.lowerBound)) \(Int(bounds.upperBound)) \(unit)"))
      .foregroundStyle(DS.Color.destructive.swiftUI)
  }

  /// Đổi đơn vị: cột hệ mét giữ nguyên, ô đổi tại chỗ.
  private var heightUnit: Binding<String> {
    Binding(
      get: { form.unitsHeight },
      set: { u in
        update { $0.unitsHeight = u }
        heightText = ProfileEntry.flip(.height, metric: form.heightCm, unit: u)
      })
  }

  private var weightUnit: Binding<String> {
    Binding(
      get: { form.unitsWeight },
      set: { u in
        update { $0.unitsWeight = u }
        weightText = ProfileEntry.flip(.weight, metric: form.weightKg, unit: u)
      })
  }

  // MARK: - Hoạt động, mục tiêu, trình độ, chế độ ăn

  private var choices: some View {
    Section {
      Picker(String(localized: "ep.activity"), selection: edit(\.activityLevel)) {
        ForEach(Self.activities) { a in
          Text(verbatim: "\(String(localized: a.label)) · \(String(localized: a.detail ?? ""))").tag(a.id)
        }
      }
      Picker(String(localized: "ep.goal"), selection: edit(\.goal)) {
        ForEach(Self.goals) { Text(String(localized: $0.label)).tag($0.id) }
      }
      Picker(String(localized: "ep.level"), selection: edit(\.trainingLevel)) {
        ForEach(Self.levels) { Text(String(localized: $0.label)).tag($0.id) }
      }
      Picker(String(localized: "ep.diet"), selection: edit(\.dietaryPreference)) {
        ForEach(Self.diets) { Text(String(localized: $0.label)).tag($0.id) }
      }
    } footer: {
      Text(String(localized: "ep.activity.note"))
    }
  }

  // MARK: - Mục tiêu calo, macro, nước

  private var targets: some View {
    Section {
      Button {
        recalc()
      } label: {
        Label(String(localized: "ep.recalc"), systemImage: "arrow.clockwise")
      }
      .frame(minHeight: 44)
      if let recalcNote {
        Text(Self.recalcText(recalcNote))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(
            recalcNote == .done ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI)
      }
      integer(String(localized: "ep.kcal"), \.tdeeTargetKcal)
      integer(String(localized: "ep.protein"), \.macroProteinG)
      integer(String(localized: "ep.carbs"), \.macroCarbsG)
      integer(String(localized: "ep.fat"), \.macroFatG)
      integer(String(localized: "ep.fiber"), \.macroFiberG)
      measure(
        .water, label: String(localized: "ep.water \(volumeUnit.rawValue)"), text: $waterText,
        unit: volumeUnit.rawValue, invalid: false)
      unitPicker(
        String(localized: "ep.waterUnit"), options: AppPreferences.VolumeUnit.allCases.map(\.rawValue),
        selection: Binding(
          get: { volumeUnit.rawValue },
          set: { raw in
            guard let u = AppPreferences.VolumeUnit(rawValue: raw) else { return }
            services.preferences.setVolumeUnit(u)
            waterText = ProfileEntry.flip(.water, metric: form.waterTargetMl, unit: u.rawValue)
          }))
    } footer: {
      // Chỉ nói ra con số — một tỉ lệ macro khác là quyền của người dùng.
      if let d = form.macroDrift {
        Text(Self.driftText(d))
      }
    }
  }

  private func integer(_ label: String, _ key: WritableKeyPath<ProfileForm, String>) -> some View {
    LabeledContent(label) {
      TextField(
        label,
        text: Binding(
          get: { form[keyPath: key] },
          set: { raw in update { $0[keyPath: key] = NumberInput.integer(raw) } })
      )
      .keyboardType(.numberPad)
      .multilineTextAlignment(.trailing)
      .monospacedDigit()
      .accessibilityLabel(Text(verbatim: label))
    }
    .frame(minHeight: 44)
  }

  private var volumeUnit: AppPreferences.VolumeUnit { services.preferences.volumeUnit }

  // MARK: - Giấc ngủ

  private var sleep: some View {
    Section {
      LabeledContent(String(localized: "ep.sleepHours")) {
        TextField(
          String(localized: "ep.sleepHours"),
          text: Binding(
            get: { form.sleepTargetHours },
            set: { raw in update { $0.sleepTargetHours = NumberInput.decimal(raw) } })
        )
        .keyboardType(.decimalPad)
        .multilineTextAlignment(.trailing)
        .monospacedDigit()
        .accessibilityLabel(Text(String(localized: "ep.sleepHours")))
      }
      .frame(minHeight: 44)
      time(String(localized: "ep.bedtime"), \.sleepTargetBedtime)
      time(String(localized: "ep.waketime"), \.sleepTargetWaketime)
    } header: {
      Text(String(localized: "ep.sleep"))
    }
  }

  /// "HH:MM" ↔ bánh xe giờ (`timeToDate` / `dateToTime` của RN).
  private func time(_ label: String, _ key: WritableKeyPath<ProfileForm, String>) -> some View {
    DatePicker(
      label,
      selection: Binding(
        get: {
          let parts = form[keyPath: key].split(separator: ":").map { Int($0) ?? 0 }
          let c = DateComponents(year: 2000, month: 1, day: 1, hour: parts.first ?? 0, minute: parts.dropFirst().first ?? 0)
          return Calendar.current.date(from: c) ?? Date()
        },
        set: { d in
          let c = Calendar.current.dateComponents([.hour, .minute], from: d)
          update { $0[keyPath: key] = String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0) }
        }),
      displayedComponents: .hourAndMinute
    )
    .frame(minHeight: 44)
  }

  // MARK: - Dị ứng, món không ăn

  private var food: some View {
    Section {
      ForEach(allergyRows, id: \.self) { value in
        let on = form.allergies.contains(value)
        Button {
          update { f in
            if on { f.allergies.removeAll { $0 == value } } else { f.allergies.append(value) }
          }
        } label: {
          HStack {
            Text(verbatim: FoodPreferences.allergyLabel(value, lang: services.preferences.lang))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Spacer()
            if on { Image(systemName: "checkmark").foregroundStyle(DS.Color.primary.swiftUI) }
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .accessibilityAddTraits(on ? .isSelected : [])
      }
      TextField(
        String(localized: "ep.dislikes"), text: edit(\.dislikes),
        prompt: Text(String(localized: "ep.dislikes.placeholder"))
      )
      .frame(minHeight: 44)
      .accessibilityLabel(Text(String(localized: "ep.dislikes")))
    } header: {
      Text(String(localized: "ep.allergies"))
    }
  }

  /// Tám ô của onboarding, rồi mọi giá trị lạ đã lưu — hiện (đã chọn) để gỡ được.
  private var allergyRows: [String] {
    let common = FoodPreferences.commonAllergies
    return common + form.allergies.filter { !common.contains($0) }
  }

  // MARK: - Việc

  /// Một lần sửa: đánh dấu đã sửa để hồ sơ về sau không ghi đè thứ đang gõ.
  private func update(_ change: (inout ProfileForm) -> Void) {
    edited = true
    change(&form)
  }

  private func edit(_ key: WritableKeyPath<ProfileForm, String>) -> Binding<String> {
    Binding(get: { form[keyPath: key] }, set: { v in update { $0[keyPath: key] = v } })
  }

  private func seed() {
    guard !edited else { return }
    form = book.makeForm()
    heightText = ProfileEntry.seed(.height, metric: form.heightCm, unit: form.unitsHeight)
    weightText = ProfileEntry.seed(.weight, metric: form.weightKg, unit: form.unitsWeight)
    waterText = ProfileEntry.seed(.water, metric: form.waterTargetMl, unit: volumeUnit.rawValue)
  }

  private func recalc() {
    edited = true
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let missing = form.recalcTargets(today: today)
    let note: RecalcNote = missing.isEmpty ? .done : .missing(missing)
    if missing.isEmpty {
      waterText = ProfileEntry.seed(.water, metric: form.waterTargetMl, unit: volumeUnit.rawValue)
    }
    recalcNote = note
    AccessibilityNotification.Announcement(Self.recalcText(note)).post()
  }

  private func save() async {
    do throws(ProfileSaveFailure) {
      try await book.save(form)
      saved = true
      AccessibilityNotification.Announcement(String(localized: "ep.saved")).post()
      dismiss()
    } catch {
      failure = error
    }
  }

  // MARK: - Chữ

  static func recalcText(_ note: RecalcNote) -> String {
    switch note {
    case .done:
      return String(localized: "ep.recalc.done")
    case .missing(let fields):
      let names = fields.map { f in
        switch f {
        case .heightCm: String(localized: "ep.heightName")
        case .weightKg: String(localized: "ep.weightName")
        case .dob: String(localized: "ep.dob")
        }
      }
      return String(localized: "ep.recalc.missing \(names.formatted(.list(type: .and)))")
    }
  }

  static func driftText(_ d: MacroTargets.Drift) -> String {
    let sum = Int(d.sum).formatted()
    let drift = "\(Int(abs(d.drift)).formatted()) kcal"
    return d.drift > 0
      ? String(localized: "ep.drift.over \(sum) \(drift)") : String(localized: "ep.drift.under \(sum) \(drift)")
  }

  static func message(_ f: ProfileSaveFailure) -> String {
    switch f {
    case .invalidStats: String(localized: "ep.error.invalidStats")
    case .offline: String(localized: "auth.error.network")
    case .nothingWritten: String(localized: "ep.error.nothingWritten")
    case .server: String(localized: "auth.error.generic")
    }
  }

  /// Nhãn của một giá trị đã lưu; giá trị lạ hiện nguyên văn, trống là "—"
  /// (thẻ tài khoản của `settings.tsx`).
  static func label(_ choices: [Choice], _ value: String?) -> String {
    guard let value, !value.isEmpty else { return "—" }
    return choices.first { $0.id == value }.map { String(localized: $0.label) } ?? value
  }

  /// Một lựa chọn: giá trị lưu + nhãn (+ tần suất của mức hoạt động, như RN).
  struct Choice: Identifiable, Sendable {
    let id: String
    let label: String.LocalizationValue
    var detail: String.LocalizationValue?
  }

  /// Cùng hai vế với onboarding (`activityFreq*`): năm tính từ đứng một mình
  /// không nói là công việc hay việc tập.
  static let activities: [Choice] = [
    Choice(id: "sedentary", label: "onboarding.activity.sedentary", detail: "ep.freq.sedentary"),
    Choice(id: "light", label: "onboarding.activity.light", detail: "ep.freq.light"),
    Choice(id: "moderate", label: "onboarding.activity.moderate", detail: "ep.freq.moderate"),
    Choice(id: "high", label: "onboarding.activity.high", detail: "ep.freq.high"),
    Choice(id: "athlete", label: "onboarding.activity.athlete", detail: "ep.freq.athlete"),
  ]

  static let goals: [Choice] = [
    Choice(id: "bulk", label: "ep.goal.bulk"), Choice(id: "cut", label: "ep.goal.cut"),
    Choice(id: "maintain", label: "ep.goal.maintain"), Choice(id: "recomp", label: "ep.goal.recomp"),
    Choice(id: "strength", label: "ep.goal.strength"), Choice(id: "endurance", label: "ep.goal.endurance"),
  ]

  static let levels: [Choice] = [
    Choice(id: "beginner", label: "ep.level.beginner"), Choice(id: "intermediate", label: "ep.level.intermediate"),
    Choice(id: "advanced", label: "ep.level.advanced"),
  ]

  static let diets: [Choice] = [
    Choice(id: "omnivore", label: "ep.diet.omnivore"), Choice(id: "vegetarian", label: "ep.diet.vegetarian"),
    Choice(id: "halal", label: "ep.diet.halal"),
  ]
}
