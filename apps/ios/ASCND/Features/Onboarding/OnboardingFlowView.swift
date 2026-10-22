import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Luồng onboarding (#527 1.3) — `components/ascnd/onboarding-flow.tsx` +
/// khung `onboarding/onboarding-screen.tsx` @ fac9ac2. Luật (thứ tự màn, bỏ màn,
/// khoá nút, câu ghi cuối, nháp bền theo người) nằm ở `OnboardingController`;
/// tệp này chỉ dựng màn.
///
/// Thiết kế lại 22/10 (Kiệt duyệt mock `onboarding_redesign_auth_style`): style màn
/// đăng nhập; 6 màn — Koa chào → mục tiêu (+ kinh nghiệm) → lịch tập → Về bạn (năm
/// số đo trong một danh sách) → Apple Health → kế hoạch (chỉ kcal + đạm) + buổi đầu.
/// Bốn mục tiêu (lên cơ / giảm mỡ / khoẻ hơn / giữ dáng); "recomp" và "endurance"
/// không còn ở onboarding (đổi được trong Cài đặt).
///
/// Khác RN, có chủ đích và ghi ra:
/// - màn Sức khoẻ (12): bật lại 15/10 (HealthKit đã có) — "Kết nối Apple Health"
///   xin quyền + đồng bộ lần đầu rồi đi tiếp, "Để sau" đi tiếp; máy không có
///   HealthKit thì bỏ màn như RN;
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
      // Màn Sức khoẻ bật lại (15/10 — HealthKit đã có): ngày đầu không trống, bước /
      // giấc ngủ / nhịp tim về ngay từ lúc vào app.
      let c = services.makeOnboarding(userId: userId, gate: gate, healthAvailable: services.health.isAvailable)
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

struct OnboardingStepsView: View {
  let flow: OnboardingController
  /// Luồng debug (`ASCND_DEBUG_FLOW`, chỉ bản Debug): không xin quyền Apple Health,
  /// không lưu lịch chờ áp, không gửi telemetry — chỉ để xem giao diện.
  var dryRun = false
  @Environment(AppServices.self) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var forward = true
  @State private var legalOpen = false
  @State private var failure: OnboardingFailureCopy?
  @State private var connecting = false
  /// Màn Về bạn: chạm Chiều cao / Cân nặng mở thước trong một tấm.
  @State private var ruler: RulerPick?

  private var step: OnboardingDraft.Step { flow.draft.step }

  /// Thiết kế lại 22/10 (Kiệt duyệt mock): style của màn đăng nhập — nền mực, quầng
  /// lửa nghiêng, bụi sáng, logo nhỏ góc trái, ô kính mờ; 13 màn còn 6.
  var body: some View {
    ZStack {
      AuthHero.ink.ignoresSafeArea()
      AuthHeroBackdrop(reduceMotion: reduceMotion)
        .ignoresSafeArea()
        .accessibilityHidden(true)
      VStack(spacing: 0) {
        navRow
        if let chapter { chapterBar(chapter) }
        ScrollView {
          screen(step)
            .padding(.horizontal, DS.Spacing.lg)
            .padding(.bottom, DS.Spacing.md)
        }
        .scrollBounceBehavior(.basedOnSize)
        .id(step)
        .transition(reduceMotion ? AnyTransition.opacity : AnyTransition.push(from: forward ? .trailing : .leading))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        footer
      }
    }
    .environment(\.colorScheme, .dark)
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
    .sheet(item: $ruler) { pick in
      RulerSheet(flow: flow, quantity: pick.quantity)
    }
    .sheet(isPresented: $legalOpen) {
      LegalSheet(lang: services.preferences.lang)
    }
  }

  // MARK: - Khung

  /// Nút quay lại: không có ở màn chào, và không có ở màn cuối (RN không truyền
  /// `onBack` cho màn 13).
  private var navRow: some View {
    HStack(spacing: DS.Spacing.sm) {
      if step != .welcome, step != .ready {
        Button {
          go(forward: false)
        } label: {
          Image(systemName: "chevron.left")
            .font(.title3.weight(.semibold))
            .foregroundStyle(AuthHero.paper.opacity(0.7))
            .frame(width: 32, height: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(String(localized: "onboarding.back")))
      }
      AuthLockup(mark: 24, text: 16)
      Spacer()
    }
    .frame(height: 44)
    .padding(.horizontal, DS.Spacing.lg)
  }

  /// Ba chặng: mục tiêu · lịch · về bạn.
  private var chapter: Int? {
    switch step {
    case .intention: 1
    case .schedule: 2
    case .sex: 3
    default: nil
    }
  }

  private func chapterBar(_ n: Int) -> some View {
    HStack(spacing: 6) {
      ForEach(1...3, id: \.self) { i in
        Capsule()
          .fill(AuthHero.paper.opacity(i <= n ? 1 : 0.15))
          .frame(height: 3)
      }
    }
    .padding(.horizontal, DS.Spacing.lg)
    .padding(.top, DS.Spacing.xs)
    .padding(.bottom, DS.Spacing.md)
    .accessibilityElement()
    .accessibilityLabel(Text(String(localized: "onb2.chapter \(n) \(3)")))
  }

  private var footer: some View {
    VStack(spacing: DS.Spacing.sm) {
      Button { primary() } label: {
        Text(ctaTitle)
          .font(DS.TextStyle.headline)
          .foregroundStyle(AuthHero.ink)
          .frame(maxWidth: .infinity, minHeight: 52)
          .background(Capsule().fill(AuthHero.paper))
          .opacity(flow.canAdvance && !flow.finishing && !connecting ? 1 : 0.4)
      }
      .buttonStyle(TodayPressStyle())
      .disabled(!flow.canAdvance || flow.finishing || connecting)
      if step == .sex {
        Button {
          flow.useAverages()
          go(forward: true)
        } label: {
          Text(String(localized: "onb2.about.skip"))
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(AuthHero.paper.opacity(0.6))
            .frame(maxWidth: .infinity, minHeight: 44)
        }
      }
      if step == .health {
        Button {
          go(forward: true)
        } label: {
          Text(String(localized: "onboarding.health.later"))
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .disabled(connecting)
      }
      if step == .ready, firstSession != nil {
        Button {
          finishOrAdvance(startNow: false)
        } label: {
          Text(String(localized: "onboarding.ready.later"))
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .disabled(!flow.canAdvance || flow.finishing)
      }
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
    case .sex: String(localized: "onb2.about.cta")
    case .ready: firstSession == nil ? String(localized: "onboarding.ready.cta") : String(localized: "onb2.ready.cta")
    case .health: String(localized: "onboarding.health.connect")
    default: String(localized: "onboarding.next")
    }
  }

  /// Buổi đầu của lịch vừa chọn (đợt 3).
  private var firstSession: (name: String, minutes: Int)? {
    guard let c = flow.draft.schedule, let s = StarterPrograms.schedule(c).first?.session else { return nil }
    return (Self.sessionName(s), StarterPrograms.minutes(s, place: c.place, beginner: c.beginner))
  }

  private func primary() { finishOrAdvance(startNow: true) }

  private func finishOrAdvance(startNow: Bool) {
    if step == .ready {
      // Nháp bị xoá khi xong — giữ lịch lại trước để phiên app áp nó (`StarterPlan`).
      let choice = flow.draft.schedule
      let userId = flow.userId
      Task {
        if await flow.finish() {
          guard !dryRun else { return }
          if let choice { StarterPlan.savePending(.init(choice: choice, startNow: startNow), userId: userId) }
          Telemetry.capture(.onboardingCompleted)
        } else if let f = flow.failure {
          failure = f.copy
        }
      }
    } else if step == .health, dryRun {
      go(forward: true)
    } else if step == .health {
      // Xin quyền + đồng bộ lần đầu; từ chối / lỗi vẫn đi tiếp — Cài đặt còn nút Đồng bộ.
      connecting = true
      Task {
        try? await services.health.syncNow(userId: flow.userId, lang: AppServices.appLang)
        connecting = false
        go(forward: true)
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
    case .intention: intention
    case .sex: about
    // Câu hỏi đã gộp vào màn khác (thiết kế lại 22/10) — không còn là một màn.
    case .goal, .dob, .height, .weight, .activity, .experience, .plan: EmptyView()
    case .schedule: schedule
    case .health: health
    case .ready: ready
    }
  }

  // MARK: - Lịch tập (đợt 3, mock `koa-wave3-activation.html`)

  private var schedule: some View {
    let c = flow.draft.schedule ?? .suggested(trainingLevel: flow.draft.trainingLevel)
    let valid = StarterPrograms.sessionCounts.contains(c.days.count)
    return VStack(alignment: .leading, spacing: DS.Spacing.lg) {
      Ask(q: String(localized: "onb2.week.q"), why: String(localized: "onb2.week.why"))
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        HStack(spacing: 6) {
          ForEach(0..<7, id: \.self) { d in
            GlassPill(text: Self.dayShort(d), selected: c.days.contains(d), round: true) { flow.toggleDay(d) }
          }
        }
        Text(valid ? String(localized: "onb2.week.count \(c.days.count)") : String(localized: "onb2.week.pick"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(AuthHero.paper.opacity(valid ? 0.6 : 0.85))
      }
      HStack(spacing: DS.Spacing.xs) {
        ForEach(StarterPrograms.Place.allCases, id: \.self) { p in
          GlassPill(text: Self.placeShort(p), selected: c.place == p) { flow.setPlace(p) }
            .accessibilityHint(Text(Self.placeDesc(p)))
        }
      }
      if valid {
        VStack(spacing: 0) {
          ForEach(Array(StarterPrograms.schedule(c).enumerated()), id: \.element.day) { i, row in
            if i > 0 { GlassDivider() }
            HStack {
              Text(verbatim: "\(Self.dayShort(row.day)) · \(Self.sessionName(row.session))")
              Spacer()
              Text(String(localized: "today.minutes \(StarterPrograms.minutes(row.session, place: c.place, beginner: c.beginner))"))
                .font(DS.TextStyle.number(13, .footnote))
                .foregroundStyle(AuthHero.paper.opacity(0.6))
            }
            .font(DS.TextStyle.body)
            .foregroundStyle(AuthHero.paper)
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 44)
          }
        }
        .onbGlass()
        Text(String(localized: "onboarding.schedule.editLater"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(AuthHero.paper.opacity(0.5))
      }
    }
  }

  /// Màn mục tiêu (gộp mục tiêu + kinh nghiệm): bốn mục tiêu, ba mức đã tập.
  private var intention: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.lg) {
      Ask(q: String(localized: "onb2.goal.q"), why: String(localized: "onb2.goal.why"))
      VStack(spacing: DS.Spacing.sm) {
        ForEach(OnboardingRules.primaryGoals, id: \.self) { g in
          GlassChoice(
            icon: Self.goalIcon(g), label: Self.primaryGoalLabel(g), desc: Self.primaryGoalDesc(g),
            selected: flow.draft.goal == g
          ) { flow.pickPrimaryGoal(g) }
        }
      }
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Eyebrow(text: String(localized: "onb2.exp.q"))
        HStack(spacing: DS.Spacing.xs) {
          ForEach(OnboardingDraft.trainingLevels, id: \.self) { l in
            GlassPill(text: Self.expShort(l), selected: flow.draft.trainingLevel == l) { _ = flow.pickTraining(l) }
              .accessibilityHint(Text(Self.expDesc(l)))
          }
        }
      }
    }
  }

  /// Màn Về bạn: năm số đo trong MỘT danh sách kính mờ (thay năm màn). Chiều cao /
  /// cân nặng mở thước cũ trong một tấm; ngày sinh là bộ chọn gọn của hệ thống.
  private var about: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.lg) {
      Ask(q: String(localized: "onb2.about.q"), why: String(localized: "onb2.about.why"))
      VStack(spacing: 0) {
        Menu {
          ForEach(FitnessCalc.Sex.allCases, id: \.self) { sex in
            Button(Self.sexLabel(sex)) { flow.pickSex(sex) }
          }
        } label: {
          AboutRow(label: String(localized: "onb2.about.sex"), value: flow.draft.sex.map(Self.sexLabel))
        }
        GlassDivider()
        HStack {
          Text(String(localized: "onb2.about.dob"))
            .foregroundStyle(AuthHero.paper)
          Spacer()
          DatePicker(
            String(localized: "onb2.about.dob"),
            selection: Binding(get: { Self.date(flow.draft.dob) }, set: { flow.setDob(Self.localDate($0)) }),
            in: ...Date(), displayedComponents: .date
          )
          .labelsHidden()
        }
        .font(DS.TextStyle.body)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 52)
        GlassDivider()
        Button { ruler = RulerPick(quantity: .height) } label: {
          AboutRow(label: String(localized: "onb2.about.height"), value: heightText)
        }
        .accessibilityLabel(Text(verbatim: "\(String(localized: "onb2.about.height")): \(heightText)"))
        GlassDivider()
        Button { ruler = RulerPick(quantity: .weight) } label: {
          AboutRow(label: String(localized: "onb2.about.weight"), value: weightText)
        }
        .accessibilityLabel(Text(verbatim: "\(String(localized: "onb2.about.weight")): \(weightText)"))
        GlassDivider()
        Menu {
          ForEach(OnboardingDraft.activityLevels, id: \.self) { level in
            Button {
              _ = flow.pickActivity(level)
            } label: {
              Text(Self.activityLabel(level))
              Text(Self.activityDesc(level))
            }
          }
        } label: {
          AboutRow(label: String(localized: "onb2.about.activity"), value: flow.draft.activityLevel.map(Self.activityLabel))
        }
      }
      .onbGlass()
      if flow.dobInvalid {
        FieldError(text: String(localized: "onboarding.dob.bad"))
      }
      if let e = statError {
        FieldError(text: e)
      }
    }
  }

  private var heightText: String {
    OnboardingRuler.formatHeight(Double(flow.draft.heightCm) ?? 0, unit: flow.heightUnit)
  }

  private var weightText: String {
    let kg = Double(flow.draft.weightKg) ?? 0
    let v = Units.displayWeight(kg, unit: flow.weightUnit)
    return "\(OnboardingRuler.fixed1(v, locale: .app)) \(OnboardingRuler.weightLabel(flow.weightUnit))"
  }

  static func dayShort(_ d: Int) -> String {
    [
      String(localized: "onboarding.day.mon"), String(localized: "onboarding.day.tue"),
      String(localized: "onboarding.day.wed"), String(localized: "onboarding.day.thu"),
      String(localized: "onboarding.day.fri"), String(localized: "onboarding.day.sat"),
      String(localized: "onboarding.day.sun"),
    ][d]
  }

  static func placeDesc(_ p: StarterPrograms.Place) -> String {
    switch p {
    case .gym: String(localized: "onboarding.place.gym.desc")
    case .dumbbell: String(localized: "onboarding.place.dumbbell.desc")
    case .bodyweight: String(localized: "onboarding.place.bodyweight.desc")
    }
  }

  static func sessionName(_ s: StarterPrograms.Session) -> String { StarterPlan.sessionName(s) }

  /// Kết nối Apple Health (bật lại 15/10): bốn thứ app đọc, một câu về quyền riêng tư.
  private var health: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.lg) {
      Image(systemName: "heart.fill")
        .font(.system(size: 30, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 64, height: 64)
        .background(Color(red: 1, green: 0.22, blue: 0.37), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityHidden(true)
      Ask(q: String(localized: "onboarding.health.q"), why: String(localized: "onboarding.health.why"))
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        healthRow("moon.fill", String(localized: "onboarding.health.sleep"))
        healthRow("figure.walk", String(localized: "onboarding.health.steps"))
        healthRow("heart.text.square", String(localized: "onboarding.health.heart"))
        healthRow("dumbbell.fill", String(localized: "onboarding.health.workouts"))
      }
      Text(String(localized: "onboarding.health.privacy"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func healthRow(_ symbol: String, _ text: String) -> some View {
    Label {
      Text(text).font(DS.TextStyle.body)
    } icon: {
      Image(systemName: symbol)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(width: 28)
    }
  }

  /// Koa chào ngay màn đầu (mock 22/10) — hình Koa có sẵn, không vẽ mới.
  private var welcome: some View {
    VStack(spacing: DS.Spacing.md) {
      MascotFigureView(emotion: .happy, size: 170, animated: !reduceMotion)
        .frame(height: 210)
        .accessibilityHidden(true)
      Text(String(localized: "onb2.welcome.title"))
        .font(.system(size: 30, weight: .bold))
        .foregroundStyle(AuthHero.paper)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(String(localized: "onb2.welcome.sub"))
        .font(DS.TextStyle.body)
        .foregroundStyle(AuthHero.paper.opacity(0.65))
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, DS.Spacing.xl * 2)
  }

  /// Kế hoạch + buổi đầu (gộp màn kế hoạch và màn sẵn sàng): chỉ kcal và đạm (V1).
  private var ready: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      HStack(spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: .warmup, size: 60, animated: false)
          .frame(width: 66, height: 76)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "onb2.plan.title"))
            .font(.system(size: 26, weight: .bold))
            .foregroundStyle(AuthHero.paper)
            .accessibilityAddTraits(.isHeader)
          Text(verbatim: planLine)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(AuthHero.paper.opacity(0.6))
        }
      }
      .padding(.top, DS.Spacing.lg)
      if let p = flow.attempt.plan {
        VStack(alignment: .leading, spacing: 4) {
          Eyebrow(text: String(localized: "onb2.plan.daily"))
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.xs) {
            Text(p.targetKcal.formatted(.number.locale(.app)))
              .font(DS.TextStyle.hero)
              .monospacedDigit()
            Text(verbatim: Self.kcal)
              .font(DS.TextStyle.headline)
              .foregroundStyle(AuthHero.paper.opacity(0.6))
          }
          Text(String(localized: "onb2.plan.protein \(p.proteinG)"))
            .font(DS.TextStyle.headline)
        }
        .foregroundStyle(AuthHero.paper)
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onbGlass()
        .accessibilityElement(children: .combine)
      }
      if let first = firstSession {
        VStack(alignment: .leading, spacing: 4) {
          Text(String(localized: "onboarding.ready.first \(first.name) \(first.minutes)"))
            .font(DS.TextStyle.headline)
            .foregroundStyle(AuthHero.paper)
          Text(String(localized: "onboarding.ready.firstWhy"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(AuthHero.paper.opacity(0.6))
        }
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onbGlass()
        .accessibilityElement(children: .combine)
      }
      // GĐ2: Gains là thang duy nhất — người mới ở hạng đầu.
      Text("onboarding.plan.gains")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(AuthHero.paper.opacity(0.5))
      if flow.finishing {
        ProgressView().frame(maxWidth: .infinity)
      }
      if let e = statError {
        FieldError(text: e)
      }
    }
  }

  /// "Lên cơ · T2 · T4 · T6".
  private var planLine: String {
    let days = (flow.draft.schedule?.days ?? []).map(Self.dayShort)
    return ([flow.draft.goal.map(Self.primaryGoalLabel)].compactMap { $0 } + days).joined(separator: " · ")
  }

  // MARK: - Chữ suy ra

  private static let kcal = "kcal"

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

  static func date(_ d: LocalDate) -> Date { d.calendarDate }

  static func localDate(_ date: Date) -> LocalDate { LocalDate(calendarDate: date) ?? OnboardingDraft.defaultDob }

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

  static func primaryGoalLabel(_ g: String) -> String {
    switch g {
    case "bulk": String(localized: "onb2.goal.bulk")
    case "cut": String(localized: "onb2.goal.cut")
    case "strength": String(localized: "onb2.goal.strength")
    case "maintain": String(localized: "onb2.goal.maintain")
    default: goalLabel(g)
    }
  }

  static func primaryGoalDesc(_ g: String) -> String {
    switch g {
    case "bulk": String(localized: "onb2.goal.bulk.desc")
    case "cut": String(localized: "onb2.goal.cut.desc")
    case "strength": String(localized: "onb2.goal.strength.desc")
    default: String(localized: "onb2.goal.maintain.desc")
    }
  }

  static func goalIcon(_ g: String) -> String {
    switch g {
    case "bulk": "dumbbell.fill"
    case "cut": "flame.fill"
    case "strength": "figure.strengthtraining.traditional"
    default: "scalemass.fill"
    }
  }

  static func expShort(_ l: String) -> String {
    switch l {
    case "beginner": String(localized: "onb2.exp.beginner")
    case "intermediate": String(localized: "onb2.exp.intermediate")
    default: String(localized: "onb2.exp.advanced")
    }
  }

  static func placeShort(_ p: StarterPrograms.Place) -> String {
    switch p {
    case .gym: String(localized: "onb2.place.gym")
    case .dumbbell: String(localized: "onb2.place.dumbbell")
    case .bodyweight: String(localized: "onb2.place.bodyweight")
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
    return OnboardingRuler.fixed1(value, locale: .app)
  }

  private var small: String {
    if quantity == .height {
      return unit == "in" ? "\(OnboardingRuler.fixed1(value, locale: .app)) in" : "cm"
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
///
/// Dùng chung với màn ghi cân (`LogWeightView`, #527 Phase 4) — MỘT cây thước,
/// như RN gom về `useRulerIndex` để bản chép không mang lỗi đã sửa ở bản kia.
struct RulerStrip: View {
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

// MARK: - Mảnh kính mờ (thiết kế lại 22/10, style màn đăng nhập)

private extension View {
  /// Nền giấy mờ 8 %, viền mảnh, bo 16 — như ô nhập của màn đăng nhập.
  func onbGlass(selected: Bool = false, radius: CGFloat = 16) -> some View {
    background(
      AuthHero.paper.opacity(selected ? 0.14 : 0.08), in: RoundedRectangle(cornerRadius: radius, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: radius, style: .continuous)
        .strokeBorder(AuthHero.paper.opacity(selected ? 0.9 : 0.12), lineWidth: selected ? 1.2 : 0.75)
    }
  }
}

/// Thẻ chọn một: icon màu lửa, nhãn, mô tả; chọn thì viền sáng + dấu tick.
private struct GlassChoice: View {
  let icon: String
  let label: String
  let desc: String
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: icon)
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(AuthHero.ember)
          .frame(width: 28)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(label).font(DS.TextStyle.headline).foregroundStyle(AuthHero.paper)
          Text(desc).font(DS.TextStyle.footnote).foregroundStyle(AuthHero.paper.opacity(0.6))
        }
        Spacer(minLength: 0)
        if selected {
          Image(systemName: "checkmark")
            .font(.headline)
            .foregroundStyle(AuthHero.paper)
            .accessibilityHidden(true)
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
      .onbGlass(selected: selected)
      .contentShape(RoundedRectangle(cornerRadius: 16))
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: "\(label). \(desc)"))
    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
  }
}

/// Viên chọn (ngày tập, nơi tập, mức đã tập): chọn thì nền giấy, chữ mực.
private struct GlassPill: View {
  let text: String
  let selected: Bool
  var round = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(verbatim: text)
        .font(.system(size: round ? 13 : 15, weight: .semibold))
        .foregroundStyle(selected ? AuthHero.ink : AuthHero.paper)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(selected ? AuthHero.paper : AuthHero.paper.opacity(0.08), in: RoundedRectangle(cornerRadius: round ? 22 : 14))
        .overlay {
          RoundedRectangle(cornerRadius: round ? 22 : 14)
            .strokeBorder(AuthHero.paper.opacity(selected ? 0 : 0.12), lineWidth: 0.75)
        }
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: text))
    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
  }
}

private struct GlassDivider: View {
  var body: some View {
    Rectangle().fill(AuthHero.paper.opacity(0.1)).frame(height: 0.5).padding(.leading, DS.Spacing.md)
  }
}

/// Hàng của màn Về bạn: nhãn trái, giá trị phải ("Chọn" khi chưa có), mũi tên.
private struct AboutRow: View {
  let label: String
  let value: String?

  var body: some View {
    HStack(spacing: DS.Spacing.xs) {
      Text(label).foregroundStyle(AuthHero.paper)
      Spacer()
      Text(value ?? String(localized: "onb2.about.choose"))
        .foregroundStyle(value == nil ? AuthHero.ember : AuthHero.paper.opacity(0.75))
      Image(systemName: "chevron.up.chevron.down")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(AuthHero.paper.opacity(0.4))
        .accessibilityHidden(true)
    }
    .font(DS.TextStyle.body)
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 52)
    .contentShape(Rectangle())
  }
}

private struct RulerPick: Identifiable {
  let quantity: OnboardingRuler.Quantity
  var id: String { quantity == .height ? "height" : "weight" }
}

/// Thước chiều cao / cân nặng cũ trong một tấm của màn Về bạn.
private struct RulerSheet: View {
  let flow: OnboardingController
  let quantity: OnboardingRuler.Quantity
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      RulerScreen(flow: flow, quantity: quantity)
        .id("\(quantity == .height ? flow.heightUnit : flow.weightUnit)")
        .padding(.horizontal, DS.Spacing.lg)
        .padding(.top, DS.Spacing.md)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            Button(String(localized: "common.ok")) { dismiss() }
          }
        }
    }
    .presentationDetents([.medium])
    .presentationBackground(AuthHero.sheet)
    .environment(\.colorScheme, .dark)
  }
}

