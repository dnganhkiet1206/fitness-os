import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Luồng onboarding (#527 1.3) — `components/ascnd/onboarding-flow.tsx` +
/// khung `onboarding/onboarding-screen.tsx` @ fac9ac2. Luật (thứ tự màn, bỏ màn,
/// khoá nút, câu ghi cuối, nháp bền theo người) nằm ở `OnboardingController`;
/// tệp này chỉ dựng màn.
///
/// Khác RN, có chủ đích và ghi ra:
/// - màn Sức khoẻ (12) vắng mặt: native chưa có HealthKit (#527 4.1), và RN
///   cũng bỏ màn này trên máy không có HealthKit — không mời điều không nhận
///   lời được. Bật lại bằng `healthAvailable` khi 4.1 vào;
/// - chưa có Koa ở màn 01 / 13 và chưa có hình chiếc cân ở màn 08 (linh vật là
///   Phase 7) — không vẽ hình giả thay vào;
/// - cây thước có VoiceOver (vuốt lên / xuống đổi 1 đơn vị); thước RN không có.
struct OnboardingFlowView: View {
  let userId: String
  let gate: OnboardingGate
  @Environment(AppServices.self) private var services
  @State private var flow: OnboardingController?

  var body: some View {
    Group {
      if let flow, flow.loaded {
        OnboardingStepsView(flow: flow)
      } else {
        DSLoadingView(message: String(localized: "rootgate.loading"))
      }
    }
    .task {
      let c = services.makeOnboarding(userId: userId, gate: gate, healthAvailable: false)
      await c.load()
      flow = c
      // Đơn vị theo hồ sơ (`useUnits`): bản nhớ trước, rồi server. Hồ sơ về
      // muộn thì thước đổi theo, trừ khi người dùng đã chọn trong luồng.
      let profile = services.makeProfileBook(userId: userId)
      await profile.load()
      if let p = profile.profile { c.setDefaultUnits(height: p.unitsHeight, weight: p.unitsWeight) }
      await profile.refresh()
      if let p = profile.profile { c.setDefaultUnits(height: p.unitsHeight, weight: p.unitsWeight) }
    }
  }
}

private struct OnboardingStepsView: View {
  let flow: OnboardingController
  @Environment(AppServices.self) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var forward = true
  @State private var legalOpen = false
  @State private var failure: OnboardingFailureCopy?

  private var step: OnboardingDraft.Step { flow.draft.step }

  var body: some View {
    VStack(spacing: 0) {
      ProgressView(value: Double(flow.progress.step), total: Double(max(flow.progress.total, 1)))
        .progressViewStyle(.linear)
        .tint(DS.Color.foreground.swiftUI.opacity(0.26))
        .padding(.horizontal, DS.Spacing.md)
        .padding(.top, DS.Spacing.xs)

      navRow

      Group {
        if step == .height || step == .weight {
          screen(step).padding(.horizontal, DS.Spacing.lg)
        } else {
          ScrollView {
            screen(step)
              .padding(.horizontal, DS.Spacing.lg)
              .padding(.bottom, DS.Spacing.md)
          }
          .scrollBounceBehavior(.basedOnSize)
        }
      }
      .id(step)
      .transition(reduceMotion ? AnyTransition.opacity : AnyTransition.push(from: forward ? .trailing : .leading))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

      footer
    }
    .background(DS.Color.background.swiftUI)
    .sensoryFeedback(.selection, trigger: step)
    .sensoryFeedback(.selection, trigger: choiceKey)
    .sensoryFeedback(.success, trigger: flow.finished) { _, done in done }
    .alert(
      Text("ASCND"),
      isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } }),
      presenting: failure
    ) { _ in
      Button(String(localized: "onboarding.alert.ok")) { failure = nil }
    } message: { copy in
      Text(Self.message(copy))
    }
    .sheet(isPresented: $legalOpen) {
      LegalSheet(lang: services.preferences.lang)
    }
  }

  // MARK: - Khung

  /// Nút quay lại: không có ở màn chào, và không có ở màn cuối (RN không truyền
  /// `onBack` cho màn 13).
  private var navRow: some View {
    HStack {
      if step != .welcome, step != .ready {
        Button {
          go(forward: false)
        } label: {
          Image(systemName: "chevron.left")
            .font(.title3)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(String(localized: "onboarding.back")))
      }
      Spacer()
    }
    .frame(height: 44)
    .padding(.horizontal, DS.Spacing.md)
  }

  private var footer: some View {
    VStack(spacing: DS.Spacing.sm) {
      DSButton(ctaTitle, style: .primary) { primary() }
        .disabled(!flow.canAdvance || flow.finishing)
      if step == .ready {
        // Dòng pháp lý MỞ ĐƯỢC tài liệu: một lời đồng ý cho văn bản không mở
        // nổi không phải lời đồng ý (`LegalSheet` của RN).
        Button {
          legalOpen = true
        } label: {
          Text(String(localized: "onboarding.ready.legal"))
            .font(DS.TextStyle.caption)
            .underline()
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .accessibilityAddTraits(.isLink)
      }
    }
    .padding(.horizontal, DS.Spacing.lg)
    .padding(.bottom, DS.Spacing.md)
  }

  private var ctaTitle: String {
    switch step {
    case .welcome: String(localized: "onboarding.start")
    case .ready: String(localized: "onboarding.ready.cta")
    default: String(localized: "onboarding.next")
    }
  }

  private func primary() {
    if step == .ready {
      Task {
        if !(await flow.finish()), let f = flow.failure { failure = f.copy }
      }
    } else {
      go(forward: true)
    }
  }

  private func go(forward f: Bool) {
    forward = f
    withAnimation(reduceMotion ? nil : .easeInOut(duration: DSMotion.transitionDuration)) {
      _ = f ? flow.next() : flow.back()
    }
  }

  /// Mỗi lựa chọn đổi là một cú chạm có phản hồi (`Haptics.selection`).
  private var choiceKey: String {
    let d = flow.draft
    return [d.branch?.rawValue, d.goal, d.sex?.rawValue, d.activityLevel, d.trainingLevel, flow.heightUnit, flow.weightUnit]
      .map { $0 ?? "-" }.joined(separator: "|")
  }

  static func message(_ copy: OnboardingFailureCopy) -> String {
    switch copy {
    case .onlineOnly: String(localized: "onboarding.error.onlineOnly")
    case .duplicate: String(localized: "onboarding.error.duplicate")
    case .invalid: String(localized: "onboarding.error.invalid")
    case .signedOut: String(localized: "onboarding.error.signedOut")
    case .notFound: String(localized: "onboarding.error.notFound")
    case .server: String(localized: "onboarding.error.server")
    case .unknown: String(localized: "onboarding.error.unknown")
    case .statsRequired: String(localized: "onboarding.error.statsRequired")
    }
  }

  // MARK: - Ruột từng màn

  @ViewBuilder
  private func screen(_ s: OnboardingDraft.Step) -> some View {
    switch s {
    case .welcome: welcome
    case .intention:
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        Ask(q: String(localized: "onboarding.intention.q"), why: String(localized: "onboarding.intention.why"))
        VStack(spacing: DS.Spacing.sm) {
          ForEach(OnboardingDraft.Branch.allCases, id: \.self) { b in
            ChoiceCard(label: Self.branchLabel(b), desc: Self.branchDesc(b), selected: flow.draft.branch == b) {
              flow.pickBranch(b)
            }
          }
        }
      }
    case .goal:
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          // Nhánh vừa chọn đứng TRÊN câu hỏi, đọc liền thành một đường đi.
          if let b = flow.draft.branch {
            Eyebrow(text: Self.branchLabel(b))
          }
          Text(String(localized: "onboarding.goal.q"))
            .font(DS.TextStyle.largeTitle)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .accessibilityAddTraits(.isHeader)
        }
        VStack(spacing: DS.Spacing.sm) {
          ForEach(flow.draft.branch?.goals ?? [], id: \.self) { g in
            ChoiceCard(label: Self.goalLabel(g), desc: Self.goalDesc(g), selected: flow.draft.goal == g) {
              _ = flow.pickGoal(g)
            }
          }
        }
      }
    case .sex:
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        Ask(q: String(localized: "onboarding.sex.q"), why: String(localized: "onboarding.sex.why"))
        VStack(spacing: DS.Spacing.sm) {
          ForEach(FitnessCalc.Sex.allCases, id: \.self) { sex in
            ChoiceCard(label: Self.sexLabel(sex), desc: nil, selected: flow.draft.sex == sex) { flow.pickSex(sex) }
          }
        }
      }
    case .dob: dob
    case .height: RulerScreen(flow: flow, quantity: .height).id("height-\(flow.heightUnit)")
    case .weight: RulerScreen(flow: flow, quantity: .weight).id("weight-\(flow.weightUnit)")
    case .activity:
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        Ask(q: String(localized: "onboarding.activity.q"), why: String(localized: "onboarding.activity.why"))
        // Năm hàng trong MỘT mặt: màn duy nhất có năm lựa chọn.
        VStack(spacing: 0) {
          ForEach(Array(OnboardingDraft.activityLevels.enumerated()), id: \.element) { i, level in
            if i > 0 { Divider() }
            ChoiceRow(
              label: Self.activityLabel(level), desc: Self.activityDesc(level),
              selected: flow.draft.activityLevel == level
            ) { _ = flow.pickActivity(level) }
          }
        }
        .background(DS.Color.card.swiftUI)
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
      }
    case .experience:
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        Ask(q: String(localized: "onboarding.exp.q"), why: String(localized: "onboarding.exp.why"))
        VStack(spacing: DS.Spacing.sm) {
          ForEach(OnboardingDraft.trainingLevels, id: \.self) { level in
            ChoiceCard(label: Self.expLabel(level), desc: Self.expDesc(level), selected: flow.draft.trainingLevel == level) {
              _ = flow.pickTraining(level)
            }
          }
        }
      }
    case .plan: plan
    case .health: EmptyView()  // healthAvailable = false: màn này không bao giờ hiện.
    case .ready: ready
    }
  }

  private var welcome: some View {
    VStack(spacing: DS.Spacing.xl) {
      Text("ASCND")
        .font(DS.TextStyle.largeTitle)
        .tracking(6)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Text(String(localized: "onboarding.brand.tagline"))
        .font(DS.TextStyle.hero)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
        .minimumScaleFactor(0.6)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, DS.Spacing.xl * 2)
  }

  private var dob: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.lg) {
      Ask(q: String(localized: "onboarding.dob.q"), why: String(localized: "onboarding.dob.why"))
      // `maximumDate`: ngày tương lai không chọn được ngay ở bánh xe. Câu báo
      // dưới vẫn giữ — một nháp cũ hay một lần đổi ngưỡng tuổi vẫn tới được đây.
      DatePicker(
        String(localized: "onboarding.dob.q"),
        selection: Binding(get: { Self.date(flow.draft.dob) }, set: { flow.setDob(Self.localDate($0)) }),
        in: ...Date(),
        displayedComponents: .date
      )
      .datePickerStyle(.wheel)
      .labelsHidden()
      .frame(maxWidth: .infinity)
      if flow.dobInvalid {
        FieldError(text: String(localized: "onboarding.dob.bad"))
      }
    }
  }

  @ViewBuilder
  private var plan: some View {
    if let p = flow.attempt.plan {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Eyebrow(text: String(localized: "onboarding.plan.eyebrow"))
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.xs) {
          Text(p.targetKcal.formatted(.number.locale(.app)))
            .font(DS.TextStyle.hero)
            .monospacedDigit()
          Text(verbatim: Self.kcal)
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityElement(children: .combine)
        Text(String(localized: "onboarding.plan.for \(goalLabel)"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(String(localized: "onboarding.plan.macros \(p.proteinG) \(p.carbsG) \(p.fatG)"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Divider().padding(.vertical, DS.Spacing.xs)
        Text(String(localized: "onboarding.plan.water \(water(p.waterMl))"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        // Mục tiêu ngủ mặc định 8 giờ (`profiles.sleep_target_hours`), như RN.
        Text(String(localized: "onboarding.plan.sleep \(8)"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        rank.padding(.top, DS.Spacing.lg)
      }
      .padding(.top, DS.Spacing.xl)
    }
  }

  /// Sáu bậc của thang hạng; người mới ở bậc đầu (`levelFromXp(0)` = 1).
  private var rank: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(spacing: DS.Spacing.xs) {
        ForEach(1...6, id: \.self) { lvl in
          Capsule()
            .fill(lvl == 1 ? DS.Color.foreground.swiftUI : DS.Color.border.swiftUI)
            .frame(width: 18, height: 4)
        }
      }
      .accessibilityHidden(true)
      Text(String(localized: "onboarding.plan.rankName"))
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(String(localized: "onboarding.plan.rank \(Self.level)"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }

  private var ready: some View {
    VStack(spacing: DS.Spacing.lg) {
      Eyebrow(text: String(localized: "onboarding.ready.eyebrow"))
      Text(String(localized: "onboarding.ready.line"))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      HStack(spacing: DS.Spacing.xs) {
        ForEach(readyChips, id: \.self) { t in
          Text(verbatim: t)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, DS.Spacing.xs)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
      }
      .accessibilityElement(children: .combine)
      if flow.finishing {
        ProgressView()
      }
      if let e = statError {
        FieldError(text: e)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.top, DS.Spacing.xl * 2)
  }

  // MARK: - Chữ suy ra

  private static let kcal = "kcal"
  /// `pad2(levelFromXp(0))`.
  private static let level = "01"

  private var readyChips: [String] {
    let kcal = flow.attempt.plan?.targetKcal ?? 0
    return [goalLabel, "\(kcal.formatted(.number.locale(.app))) \(Self.kcal)", String(localized: "onboarding.ready.level \(Self.level)")]
      .filter { !$0.isEmpty }
  }

  private var goalLabel: String { flow.draft.goal.map(Self.goalLabel) ?? "" }

  /// Câu báo số đo ngoài cận (`statMessage(..., outOfRange)`): cận và đơn vị là
  /// của `BOUNDS` — luôn cm / kg, như RN.
  private var statError: String? {
    let missing = flow.attempt.missing
    if missing.contains(.heightCm) {
      return String(localized: "onboarding.outOfRange \(100) \(250) \("cm")")
    }
    if missing.contains(.weightKg) {
      return String(localized: "onboarding.outOfRange \(20) \(400) \("kg")")
    }
    return nil
  }

  private func water(_ ml: Int) -> String {
    let unit = services.preferences.volumeUnit
    let v = OnboardingRuler.displayVolume(ml, unit: unit)
    return unit == .oz ? "\(OnboardingRuler.fixed1(v)) oz" : "\(Int(v).formatted(.number.locale(.app))) ml"
  }

  static func date(_ d: LocalDate) -> Date { d.calendarDate }

  static func localDate(_ date: Date) -> LocalDate { LocalDate(calendarDate: date) ?? OnboardingDraft.defaultDob }

  static func branchLabel(_ b: OnboardingDraft.Branch) -> String {
    switch b {
    case .body: String(localized: "onboarding.branch.body")
    case .capacity: String(localized: "onboarding.branch.capacity")
    case .maintain: String(localized: "onboarding.branch.maintain")
    }
  }

  static func branchDesc(_ b: OnboardingDraft.Branch) -> String {
    switch b {
    case .body: String(localized: "onboarding.branch.body.desc")
    case .capacity: String(localized: "onboarding.branch.capacity.desc")
    case .maintain: String(localized: "onboarding.branch.maintain.desc")
    }
  }

  /// `GOAL_COPY`: `maintain` mượn chữ của nhánh "Giữ đều".
  static func goalLabel(_ g: String) -> String {
    switch g {
    case "bulk": String(localized: "onboarding.goal.bulk")
    case "cut": String(localized: "onboarding.goal.cut")
    case "recomp": String(localized: "onboarding.goal.recomp")
    case "strength": String(localized: "onboarding.goal.strength")
    case "endurance": String(localized: "onboarding.goal.endurance")
    default: String(localized: "onboarding.branch.maintain")
    }
  }

  static func goalDesc(_ g: String) -> String {
    switch g {
    case "bulk": String(localized: "onboarding.goal.bulk.desc")
    case "cut": String(localized: "onboarding.goal.cut.desc")
    case "recomp": String(localized: "onboarding.goal.recomp.desc")
    case "strength": String(localized: "onboarding.goal.strength.desc")
    case "endurance": String(localized: "onboarding.goal.endurance.desc")
    default: String(localized: "onboarding.branch.maintain.desc")
    }
  }

  static func sexLabel(_ s: FitnessCalc.Sex) -> String {
    switch s {
    case .male: String(localized: "onboarding.sex.male")
    case .female: String(localized: "onboarding.sex.female")
    case .other: String(localized: "onboarding.sex.other")
    }
  }

  static func activityLabel(_ a: String) -> String {
    switch a {
    case "sedentary": String(localized: "onboarding.activity.sedentary")
    case "light": String(localized: "onboarding.activity.light")
    case "moderate": String(localized: "onboarding.activity.moderate")
    case "high": String(localized: "onboarding.activity.high")
    default: String(localized: "onboarding.activity.athlete")
    }
  }

  static func activityDesc(_ a: String) -> String {
    switch a {
    case "sedentary": String(localized: "onboarding.activity.sedentary.desc")
    case "light": String(localized: "onboarding.activity.light.desc")
    case "moderate": String(localized: "onboarding.activity.moderate.desc")
    case "high": String(localized: "onboarding.activity.high.desc")
    default: String(localized: "onboarding.activity.athlete.desc")
    }
  }

  /// Ba bậc theo cột `training_level` (`LEVELS`).
  static func expLabel(_ l: String) -> String {
    switch l {
    case "beginner": String(localized: "onboarding.exp.beginner")
    case "intermediate": String(localized: "onboarding.exp.intermediate")
    default: String(localized: "onboarding.exp.advanced")
    }
  }

  static func expDesc(_ l: String) -> String {
    switch l {
    case "beginner": String(localized: "onboarding.exp.beginner.desc")
    case "intermediate": String(localized: "onboarding.exp.intermediate.desc")
    default: String(localized: "onboarding.exp.advanced.desc")
    }
  }
}

// MARK: - Màn thước (07 chiều cao, 08 cân nặng)

/// Dựng lại mỗi lần đổi đơn vị (`.id`): một thang mới là một cây thước mới,
/// và đặt nó vào hạt giống ghi số đang lưu về vạch của thang ấy — như `key`
/// của `HeightBody` / `WeightBody`.
private struct RulerScreen: View {
  let flow: OnboardingController
  let quantity: OnboardingRuler.Quantity
  /// Vạch thước đang đứng — số hiện trên màn đọc từ đây, không từ số đã lưu
  /// (thang lbs không khép vòng: đọc lại từ kg sẽ nhảy vạch).
  @State private var index: Int?

  private var scale: OnboardingRuler.Scale { quantity == .height ? flow.heightScale : flow.weightScale }
  private var unit: String { quantity == .height ? flow.heightUnit : flow.weightUnit }
  private var shown: Int { index ?? flow.rulerIndex(quantity) }
  private var value: Double { scale.value(at: shown) }

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      if quantity == .height {
        Ask(q: String(localized: "onboarding.height.q"), why: String(localized: "onboarding.height.why"))
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        Text(String(localized: "onboarding.weight.q"))
          .font(DS.TextStyle.largeTitle)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .multilineTextAlignment(.center)
          .accessibilityAddTraits(.isHeader)
      }
      // Bộ chọn đứng ngay dưới câu hỏi: nó quyết định câu trả lời được ĐỌC bằng gì.
      Picker(selection: Binding(get: { unit }, set: { u in
        if quantity == .height { flow.setUnits(height: u) } else { flow.setUnits(weight: u) }
      })) {
        ForEach(quantity == .height ? ["cm", "in"] : ["kg", "lbs"], id: \.self) { u in
          Text(verbatim: u).tag(u)
        }
      } label: {
        Text(verbatim: unit)
      }
      .pickerStyle(.segmented)
      .frame(width: 160)

      Spacer(minLength: DS.Spacing.md)
      VStack(spacing: DS.Spacing.xs) {
        Text(verbatim: big)
          .font(DS.TextStyle.hero)
          .monospacedDigit()
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .contentTransition(.numericText())
        Text(verbatim: small)
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityHidden(true)
      Spacer(minLength: DS.Spacing.md)

      if quantity == .weight, let e = weightError {
        FieldError(text: e)
      }
      RulerStrip(
        scale: scale, seed: shown, haptics: quantity == .height,
        label: quantity == .height ? String(localized: "onboarding.height.q") : String(localized: "onboarding.weight.q"),
        readout: "\(big) \(small)"
      ) { i in
        index = i
        flow.commitRuler(quantity, index: i)
      }
      .padding(.horizontal, -DS.Spacing.lg)
      Text(String(localized: "onboarding.dragHint"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(.bottom, DS.Spacing.sm)
  }

  /// Hệ imperial đọc bằng hai dòng: `5'7"` như người ta nói, và `66.9 in` đổi
  /// theo TỪNG vạch để thước không trông như kẹt.
  private var big: String {
    if quantity == .height, unit == "in" {
      return OnboardingRuler.formatHeight(Units.heightToCm(value, unit: unit), unit: unit)
    }
    return OnboardingRuler.fixed1(value)
  }

  private var small: String {
    if quantity == .height {
      return unit == "in" ? "\(OnboardingRuler.fixed1(value)) in" : "cm"
    }
    return OnboardingRuler.weightLabel(unit)
  }

  private var weightError: String? {
    let missing = flow.attempt.missing
    if missing.contains(.heightCm) { return String(localized: "onboarding.outOfRange \(100) \(250) \("cm")") }
    if missing.contains(.weightKg) { return String(localized: "onboarding.outOfRange \(20) \(400) \("kg")") }
    return nil
  }
}

/// Cây thước: vạch 4 điểm, vạch dài ở mỗi đơn vị tròn, kim giữa màn — `Ruler`
/// của `weight-goal-ruler.tsx`. Vạch đang đứng = `round(offset / 4)`, báo ra
/// chỉ khi nó ĐỔI (`useRulerIndex`).
private struct RulerStrip: View {
  let scale: OnboardingRuler.Scale
  let seed: Int
  let haptics: Bool
  let label: String
  let readout: String
  let onIndex: (Int) -> Void

  static let tickW: CGFloat = 4
  static let height: CGFloat = 96
  @State private var position = ScrollPosition(edge: .leading)
  @State private var offset: CGFloat = 0
  @State private var shown: Int?
  @State private var placed = false

  var body: some View {
    // Đọc ở đây, không trong `Canvas`: hàm vẽ chạy ngoài lượt dựng nên không
    // được theo dõi — thước sẽ không vẽ lại khi cuộn.
    let at = offset
    GeometryReader { geo in
      let pad = (geo.size.width - Self.tickW) / 2
      ZStack {
        Canvas { ctx, size in draw(ctx, size: size, pad: pad, offset: at) }
        ScrollView(.horizontal, showsIndicators: false) {
          Color.clear
            .frame(width: pad * 2 + CGFloat(scale.count) * Self.tickW, height: Self.height)
            .contentShape(Rectangle())
        }
        .scrollPosition($position)
        .onScrollPhaseChange { _, phase in
          // Ngón tay chạm vào thước: từ đây mọi vạch là lựa chọn của người dùng.
          if phase == .interacting { placed = true }
        }
        .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.x } action: { _, x in
          offset = x
          report(Int((x / Self.tickW).rounded()))
        }
        Rectangle()
          .fill(DS.Color.foreground.swiftUI)
          .frame(width: 2, height: 64)
          .allowsHitTesting(false)
      }
    }
    .frame(height: Self.height)
    .sensoryFeedback(.selection, trigger: haptics ? shown : nil)
    .onAppear {
      position.scrollTo(x: CGFloat(seed) * Self.tickW)
      offset = CGFloat(seed) * Self.tickW
      // RN ghi ở lượt cuộn của cú `scrollTo` mở màn: số lưu về vạch của thang này.
      shown = seed
      onIndex(seed)
    }
    .accessibilityElement()
    .accessibilityLabel(Text(label))
    .accessibilityValue(Text(verbatim: readout))
    .accessibilityAdjustableAction { dir in
      let now = shown ?? seed
      let next = max(0, min(scale.count - 1, now + (dir == .increment ? 10 : -10)))
      position.scrollTo(x: CGFloat(next) * Self.tickW)
      offset = CGFloat(next) * Self.tickW
      placed = true
      shown = next
      onIndex(next)
    }
  }

  /// Lượt cuộn trước khi thước tới hạt giống (khung đầu, offset 0) không phải
  /// một lựa chọn của người dùng: bỏ qua cho tới khi thước đứng đúng hạt giống
  /// hoặc ngón tay đã chạm vào nó.
  private func report(_ raw: Int) {
    let i = max(0, min(scale.count - 1, raw))
    if !placed {
      guard i == seed else { return }
      placed = true
    }
    guard i != shown else { return }
    shown = i
    onIndex(i)
  }

  private func draw(_ ctx: GraphicsContext, size: CGSize, pad: CGFloat, offset: CGFloat) {
    let first = max(0, Int(((offset - pad) / Self.tickW).rounded(.down)) - 1)
    let last = min(scale.count - 1, Int(((offset + size.width - pad) / Self.tickW).rounded(.up)) + 1)
    guard first <= last else { return }
    let ink = DS.Color.mutedForeground.swiftUI
    for i in first...last {
      let x = pad + CGFloat(i) * Self.tickW - offset + Self.tickW / 2
      let major = (scale.min10 + i) % 10 == 0
      let h: CGFloat = major ? 50 : 28
      let rect = CGRect(x: x - 1, y: (size.height - h) / 2, width: 2, height: h)
      ctx.fill(Path(rect), with: .color(major ? ink : ink.opacity(0.45)))
    }
  }
}

// MARK: - Mảnh dùng chung

/// Câu hỏi + lý do hỏi (`Ask`).
private struct Ask: View {
  let q: String
  let why: String

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text(q)
        .font(DS.TextStyle.largeTitle)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Text(why)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct Eyebrow: View {
  let text: String

  var body: some View {
    Text(text.uppercased())
      .font(DS.TextStyle.caption)
      .tracking(1.2)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }
}

private struct FieldError: View {
  let text: String

  var body: some View {
    Text(text)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.destructive.swiftUI)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
  }
}

/// Thẻ chọn một (`ChoiceCard`): VoiceOver đọc "nhãn. mô tả", và đã chọn hay chưa.
private struct ChoiceCard: View {
  let label: String
  let desc: String?
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      ChoiceText(label: label, desc: desc, selected: selected)
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(DS.Color.card.swiftUI)
        .overlay(
          RoundedRectangle(cornerRadius: DS.Radius.md)
            .stroke(selected ? DS.Color.foreground.swiftUI : DS.Color.border.swiftUI, lineWidth: selected ? 2 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
        .contentShape(RoundedRectangle(cornerRadius: DS.Radius.md))
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
  }
}

/// Hàng của màn vận động: năm hàng trong một mặt, ngăn bằng hairline.
private struct ChoiceRow: View {
  let label: String
  let desc: String
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      ChoiceText(label: label, desc: desc, selected: selected)
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, DS.Spacing.sm)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(selected ? DS.Color.secondary.swiftUI : Color.clear)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
  }
}

private struct ChoiceText: View {
  let label: String
  let desc: String?
  let selected: Bool

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if let desc {
          Text(desc)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer(minLength: 0)
      if selected {
        Image(systemName: "checkmark")
          .font(.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityHidden(true)
      }
    }
    .multilineTextAlignment(.leading)
  }
}
