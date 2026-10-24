import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Insight hôm nay" ở Hôm nay (Kiệt 21/10, GĐ3: "đưa insight lên today vì đây sẽ
/// là thứ người dùng thấy đầu tiên khi mở app"), dạng điểm nhấn kiểu Apple Health
/// (mock duyệt 21/10): tiêu đề lớn, lời giải thích, thẻ số liệu của đúng chủ đề.
/// Có nút X để ẩn insight ấy; ghi thêm (ngủ / ăn / tập) ra insight mới thì hiện lại.
/// Lối hỏi Koa đã rời thẻ (Kiệt 21/10: sẽ làm riêng).
/// Chỉ khi các function AI có trên máy chủ (`AppServices.aiDeployed`).
struct TodayCoachSection: View {
  let userId: String
  let today: LocalDate
  /// Tăng mỗi lần Hôm nay đọc lại sau một lần ghi (nước, bữa, giấc ngủ, buổi tập) —
  /// Insight đọc lại số ngay, không giữ số cũ (Kiệt 22/10).
  var refresh = 0
  /// Nước hôm nay từ sổ Nước của trang (cùng số với thẻ Nước). `daily_logs.water_ml`
  /// chưa có ngay lượng vừa ghi — Insight từng báo "0 oz" khi thẻ Nước đã 16 oz.
  var waterMl: Double?

  @Environment(AppServices.self) private var services
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var signal: AssistantSignalBook?
  @State private var nudges: SmartNudgesBook?
  @State private var hour = Calendar.current.component(.hour, from: Date())
  @AppStorage private var dismissed: String

  init(userId: String, today: LocalDate, refresh: Int = 0, waterMl: Double? = nil) {
    self.userId = userId
    self.today = today
    self.refresh = refresh
    self.waterMl = waterMl
    _dismissed = AppStorage(wrappedValue: "", "ascnd-insight-dismissed.\(userId)")
  }

  private var lang: AppPreferences.Lang { services.preferences.lang }
  /// Khung giờ của insight: đổi khung thì AI viết lại cho đúng giờ (24/10).
  private var part: SmartNudges.DayPart { SmartNudges.DayPart(hour: hour) }
  private var dismissKey: String {
    InsightHighlight.dismissKey(date: signal?.today ?? today, stamp: "\(signal?.nudgeStamp ?? "")|\(part.rawValue)")
  }

  var body: some View {
    if services.aiDeployed == true {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        // Máy chủ chưa bật tính năng → không hiện thẻ lỗi vĩnh viễn (15/10, audit).
        if let nudges, !nudges.isNotDeployed, dismissed != dismissKey {
          SmartInsightCard(
            book: nudges,
            // AI lỗi (quá tải, mạng…): nhắc dựng từ số thật thay cho dòng lỗi.
            fallback: signal.map {
              SmartNudges.fitting(SmartNudges.fallback($0.signal, lang: lang.rawValue, hour: hour), hour: hour, lang: lang.rawValue)
            } ?? [],
            hour: hour,
            signal: signal,
            stepsGoal: Double(StepsGoalStore(store: UserDefaultsStore(), userId: userId).goal),
            lang: lang.rawValue,
            waterUnit: services.preferences.volumeUnit,
            liveWaterMl: waterMl,
            userId: userId,
            dismiss: {
              if reduceMotion { dismissed = dismissKey } else {
                withAnimation(.easeInOut(duration: 0.25)) { dismissed = dismissKey }
              }
            }
          ) { Task { await loadInsight(force: true) } }
          .transition(.opacity)
        }
      }
      .task(id: userId) {
        if signal == nil { signal = services.makeAssistantSignal(userId: userId, today: today) }
        if nudges == nil { nudges = services.makeSmartNudges(userId: userId) }
        await signal?.load()
        // Sau tín hiệu: khoá của insight cần dấu "đã ngủ / ăn / tập" hôm nay.
        await loadInsight()
      }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { moveToToday() }
      }
      .onNewDay { moveToToday() }
      // Vừa ghi gì đó: số của thẻ (giá trị, TB, tiêu đề) đọc lại; dấu dữ liệu đổi
      // (ngủ / ăn / tập) thì kéo luôn câu AI mới.
      .onChange(of: refresh) { _, _ in
        Task {
          await signal?.load()
          await loadInsight()
        }
      }
      // App để mở qua mốc giờ (vd. 22 giờ): khung đổi thì đọc insight của khung mới.
      .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in
        hour = Calendar.current.component(.hour, from: Date())
      }
      .onChange(of: part) { _, _ in Task { await loadInsight() } }
      .onReceive(NotificationCenter.default.publisher(for: .healthSynced)) { _ in
        Task {
          await signal?.load()
          await loadInsight()
        }
      }
    }
  }

  /// Insight của hôm nay theo dấu dữ liệu hiện tại (đổi dấu → lượt gọi mới).
  private func loadInsight(force: Bool = false) async {
    guard let nudges, let stamp = signal?.nudgeStamp else { return }
    await nudges.load(
      date: Self.today(), lang: lang.rawValue, stamp: "\(stamp)|\(part.rawValue)", tzOffset: Coach.tzOffset(.current, at: Date()),
      force: force)
  }

  private func moveToToday() {
    hour = Calendar.current.component(.hour, from: Date())
    Task {
      await signal?.move(to: Self.today())
      await loadInsight()
    }
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}

/// Thẻ "Insight hôm nay": hàng nhãn (giờ cập nhật + X), rồi đang đọc / lỗi (chạm
/// thử lại) / không có gì nổi bật / điểm nhấn: câu ưu tiên cao nhất thành tiêu đề
/// + lời giải thích + thẻ số liệu; các câu còn lại ở chân thẻ.
struct SmartInsightCard: View {
  let book: SmartNudgesBook
  /// Nhắc từ số thật khi AI không trả lời (`SmartNudges.fallback`).
  var fallback: [SmartNudges.Nudge] = []
  /// Giờ hiện tại: câu AI không hợp giờ (0 giờ mà nhắc uống nước) bị bỏ.
  var hour = Calendar.current.component(.hour, from: Date())
  var signal: AssistantSignalBook?
  var stepsGoal: Double = Double(DailySignals.defaultStepsGoal)
  var lang = "vi"
  /// Nước theo đơn vị người dùng chọn (ml / L hay oz), như ô Nước ở Hôm nay.
  var waterUnit: Water.Unit = .ml
  /// Nước sống của trang; `nil` → số của `daily_logs`.
  var liveWaterMl: Double?
  var userId = ""
  var dismiss: (() -> Void)?
  let retry: () -> Void

  @Environment(\.openURL) private var openURL
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Số lúc insight hiện tại về (lưu theo người dùng, một bản) — để biết câu nào đã cũ.
  private struct Base: Codable {
    let at: Int64
    let today: InsightHighlight.Today
  }

  private var baseKey: String { "ascnd-insight-base.\(userId)" }

  private func base(_ entry: SmartNudges.Entry) -> InsightHighlight.Today? {
    guard let data = UserDefaults.standard.data(forKey: baseKey),
      let b = try? JSONDecoder().decode(Base.self, from: data), b.at == entry.at.millis
    else { return nil }
    return b.today
  }

  /// Insight mới về (và số của trang đã đọc xong): ghi lại số lúc ấy.
  private func rememberBase() {
    guard case .ready(let entry) = book.phase, signal?.nudgeStamp != nil, liveWaterMl != nil,
      base(entry) == nil
    else { return }
    if let data = try? JSONEncoder().encode(Base(at: entry.at.millis, today: today)) {
      UserDefaults.standard.set(data, forKey: baseKey)
    }
  }

  /// Mọi câu AI đều đã xong hay đã cũ vì người dùng vừa ghi thêm → ẩn cả thẻ cho tới
  /// insight mới (Kiệt 22/10).
  private var allOutdated: Bool {
    guard case .ready(let entry) = book.phase, !fitting(entry).isEmpty else { return false }
    return InsightHighlight.live(fitting(entry), today, since: base(entry)).isEmpty
  }

  var body: some View {
    Group {
      if !allOutdated {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          kicker
          content
        }
      }
    }
    .task(id: "\(signal?.nudgeStamp ?? "-")|\(liveWaterMl != nil)|\(book.phaseKey)") { rememberBase() }
  }

  private var kicker: some View {
    HStack(spacing: 6) {
      IntelligenceMark(size: 15)
      Text("insight.title").textCase(.uppercase).tracking(1.2)
        .accessibilityAddTraits(.isHeader)
      if case .ready(let entry) = book.phase {
        Text(verbatim: "·")
        Text("insight.updated \(Self.time(entry.at))")
      }
      Spacer(minLength: 0)
      if let dismiss {
        Button(action: dismiss) {
          Image(systemName: "xmark").font(.system(size: 12, weight: .bold))
            .frame(width: 30, height: 30)
            .background(DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -7)
        .accessibilityLabel(Text("insight.dismiss.a11y"))
      }
    }
    .font(DS.TextStyle.footnote.weight(.semibold))
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .idle, .loading:
      HStack(spacing: DS.Spacing.sm) {
        IntelligenceOrb(size: 24)
        Text("insight.loading")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
    case .failed where !fallback.isEmpty:
      // Bản tóm tắt từ số liệu (16/10, chủ dự án): thẻ không trống mỗi lần AI quá
      // tải. Ghi rõ nguồn; chạm dòng nguồn để thử lại AI.
      highlight(fallback, source: true, since: nil)
    case .failed(let failure):
      Button(action: retry) {
        Label {
          VStack(alignment: .leading, spacing: 2) {
            Text("insight.failed")
            Text(verbatim: WeeklyReviewView.failureText(failure))
              .font(DS.TextStyle.caption)
          }
        } icon: {
          Image(systemName: "exclamationmark.triangle")
        }
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    case .ready(let entry) where fitting(entry).isEmpty:
      Text("insight.empty")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    case .ready(let entry):
      highlight(fitting(entry), source: false, since: base(entry))
    }
  }

  private func fitting(_ entry: SmartNudges.Entry) -> [SmartNudges.Nudge] {
    SmartNudges.fitting(entry.nudges, hour: hour, lang: lang)
  }

  // MARK: - Điểm nhấn

  @ViewBuilder private func highlight(
    _ nudges: [SmartNudges.Nudge], source: Bool, since base: InsightHighlight.Today?
  ) -> some View {
    // Bỏ câu người dùng đã làm xong, hay đã ghi thêm đúng chủ đề, kể từ lúc AI viết.
    if let (lead, rest) = InsightHighlight.lead(InsightHighlight.live(nudges, today, since: base)) {
      let topic = InsightHighlight.topic(lead.type)
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          if lead.type == SmartNudges.bedtimeType {
            // Đêm khuya: tiêu đề đậm như mọi điểm nhấn, câu nhắc ở dòng dưới (24/10).
            Text("insight.bedtime.title")
              .font(.title.bold())
              .tracking(-0.4)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
              .accessibilityAddTraits(.isHeader)
          } else if let topic {
            Text(verbatim: title(topic))
              .font(.title.bold())
              .tracking(-0.4)
              // Số trong tiêu đề chạy theo việc vừa ghi (Kiệt 22/10).
              .contentTransition(.numericText())
              .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: title(topic))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
              .accessibilityAddTraits(.isHeader)
          }
          Text(verbatim: lead.message)
            .font(.title3)
            .foregroundStyle(
              topic == nil && lead.type != SmartNudges.bedtimeType
                ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        if topic != nil || !rest.isEmpty || source {
          dataCard(topic, rest: rest, source: source)
        }
      }
    } else {
      // Mọi câu đã xong theo số hiện tại.
      Text("insight.empty")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func dataCard(_ topic: InsightHighlight.Topic?, rest: [SmartNudges.Nudge], source: Bool) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      if let topic {
        header(topic).padding(DS.Spacing.md)
        divider
        HStack(alignment: .top, spacing: DS.Spacing.md) {
          ForEach(Array(stats(topic).enumerated()), id: \.offset) { _, s in
            VStack(alignment: .leading, spacing: 3) {
              Text(verbatim: s.label).font(DS.TextStyle.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              Text(verbatim: s.value).font(.title3.bold().monospacedDigit())
                .foregroundStyle(DS.Color.foreground.swiftUI)
              Text(verbatim: s.sub).font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
          }
        }
        .padding(DS.Spacing.md)
      }
      if !rest.isEmpty {
        if topic != nil { divider }
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          ForEach(Array(rest.enumerated()), id: \.offset) { _, n in
            HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
              Circle()
                .fill(Self.tint(n.priority))
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
              Text(verbatim: n.message)
                .font(DS.TextStyle.body)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
        .padding(DS.Spacing.md)
      }
      if source {
        if topic != nil || !rest.isEmpty { divider }
        Button(action: retry) {
          Label("insight.fallback", systemImage: "arrow.clockwise")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, DS.Spacing.md)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
  }

  private var divider: some View { Divider().opacity(0.6).padding(.horizontal, DS.Spacing.md) }

  /// "Dinh dưỡng ›" + "● 1.308/2.508 kcal" + vòng. Chạm mở màn của chủ đề.
  private func header(_ topic: InsightHighlight.Topic) -> some View {
    let tint = tint(topic)
    return Button {
      if let url = URL(string: Self.link(topic)) { openURL(url) }
    } label: {
      HStack(alignment: .top, spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 3) {
            Text(verbatim: section(topic)).font(DS.TextStyle.body.weight(.semibold))
            Image(systemName: "chevron.right").font(.caption2.weight(.bold))
          }
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          HStack(spacing: 7) {
            Circle().fill(tint).frame(width: 11, height: 11).accessibilityHidden(true)
            Text(verbatim: valueLine(topic))
              .font(.title2.bold().monospacedDigit())
              .contentTransition(.numericText())
              .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: valueLine(topic))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1).minimumScaleFactor(0.7)
          }
        }
        Spacer(minLength: 0)
        // Vòng chỉ cho kết quả đã chốt (giấc đêm qua, sẵn sàng) — số còn tăng trong
        // ngày không vẽ thành vòng (Kiệt 22/10).
        if InsightHighlight.isSettled(topic) {
          ZStack {
            Circle().stroke(tint.opacity(0.22), lineWidth: 14)
          Circle()
            .trim(from: 0, to: InsightHighlight.progress(topic, today))
            .stroke(tint, style: StrokeStyle(lineWidth: 14, lineCap: .round))
            .rotationEffect(.degrees(-90))
          }
          .frame(width: 76, height: 76)
          .accessibilityHidden(true)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
  }

  // MARK: - Số liệu

  private var today: InsightHighlight.Today {
    let s = signal?.signal ?? AssistantSuggestions.Signal()
    return InsightHighlight.Today(
      kcal: s.kcal, kcalTarget: s.kcalTarget, proteinG: s.proteinG, proteinTarget: s.proteinTarget,
      sleepMin: s.sleepMin, sleepTargetMin: signal?.sleepTargetMin ?? 480, steps: s.steps, stepsGoal: stepsGoal,
      waterMl: liveWaterMl ?? signal?.waterMl ?? 0, waterTargetMl: signal?.waterTargetMl ?? 2500, readiness: s.scoredReadiness)
  }

  private var week: InsightHighlight.Week { signal?.week ?? InsightHighlight.Week() }

  private func n(_ v: Double) -> String { InsightHighlight.number(v, lang: lang) }
  private func dur(_ m: Double) -> String { InsightHighlight.duration(m, lang: lang) }
  private func water(_ ml: Double) -> String { SpokenLogDisplay.water(Int(ml.rounded()), unit: waterUnit) }

  private func title(_ topic: InsightHighlight.Topic) -> String {
    let t = today
    switch topic {
    case .calories:
      let left = t.kcalTarget - t.kcal
      return left > 0 && t.kcalTarget > 0
        ? String(localized: "insight.h.calories.left \(n(left))") : String(localized: "insight.h.calories.done")
    case .protein:
      let left = t.proteinTarget - t.proteinG
      return left > 0 && t.proteinTarget > 0
        ? String(localized: "insight.h.protein.left \(n(left))") : String(localized: "insight.h.protein.done")
    case .sleep:
      return t.sleepMin > 0
        ? String(localized: "insight.h.sleep \(dur(t.sleepMin))") : String(localized: "insight.h.sleep.none")
    case .readiness:
      guard let r = t.readiness else { return String(localized: "insight.h.readiness.none") }
      return r >= 75
        ? String(localized: "insight.h.readiness.high")
        : r >= 50 ? String(localized: "insight.h.readiness.mid") : String(localized: "insight.h.readiness.low")
    case .steps: return String(localized: "insight.h.steps \(n(t.steps))")
    case .water: return String(localized: "insight.h.water \(water(t.waterMl))")
    }
  }

  private func section(_ topic: InsightHighlight.Topic) -> String {
    switch topic {
    case .calories: String(localized: "insight.s.nutrition")
    case .protein: String(localized: "insight.s.protein")
    case .sleep: String(localized: "insight.s.sleep")
    case .readiness: String(localized: "insight.s.readiness")
    case .steps: String(localized: "insight.s.steps")
    case .water: String(localized: "insight.s.water")
    }
  }

  private func valueLine(_ topic: InsightHighlight.Topic) -> String {
    let t = today
    func pair(_ v: Double, _ goal: Double, _ unit: String) -> String {
      let value = v > 0 ? n(v) : "–"
      return goal > 0 ? "\(value)/\(n(goal)) \(unit)" : "\(value) \(unit)"
    }
    switch topic {
    case .calories: return pair(t.kcal, t.kcalTarget, "kcal")
    case .protein: return pair(t.proteinG, t.proteinTarget, "g")
    case .sleep: return "\(t.sleepMin > 0 ? dur(t.sleepMin) : "–") / \(dur(t.sleepTargetMin))"
    case .readiness: return "\(t.readiness.map(String.init) ?? "–")/100"
    case .steps: return pair(t.steps, t.stepsGoal, "").trimmingCharacters(in: .whitespaces)
    case .water: return Water.progressLabel(ml: t.waterMl, targetMl: t.waterTargetMl, waterUnit, locale: .app)
    }
  }

  private struct Stat {
    let label: String
    let value: String
    let sub: String
  }

  private func stats(_ topic: InsightHighlight.Topic) -> [Stat] {
    let t = today, w = week
    let none = String(localized: "insight.sub.noData")
    func days(_ a: InsightHighlight.Average?) -> String {
      a.map { String(localized: "insight.sub.days \("\($0.days)/7")") } ?? none
    }
    func goal(_ text: String) -> String { String(localized: "insight.sub.goal \(text)") }
    func avg(_ text: String) -> String { String(localized: "insight.sub.avg \(text)") }
    let avg7 = String(localized: "insight.l.avg7")
    let protein = Stat(
      label: String(localized: "insight.l.protein"), value: "\(n(t.proteinG)) g", sub: goal("\(n(t.proteinTarget)) g"))
    let energy = Stat(
      label: String(localized: "insight.l.calories"), value: "\(n(t.kcal)) kcal", sub: goal("\(n(t.kcalTarget)) kcal"))
    let sleepAvg = Stat(label: avg7, value: w.sleepMin.map { dur($0.value) } ?? "–", sub: days(w.sleepMin))
    let sleepToday = Stat(
      label: String(localized: "insight.l.sleep"), value: t.sleepMin > 0 ? dur(t.sleepMin) : "–",
      sub: w.sleepMin.map { avg(dur($0.value)) } ?? none)
    switch topic {
    case .calories:
      return [protein, Stat(label: avg7, value: w.kcal.map { "\(n($0.value)) kcal" } ?? "–", sub: days(w.kcal))]
    case .protein:
      return [energy, Stat(label: avg7, value: w.proteinG.map { "\(n($0.value)) g" } ?? "–", sub: days(w.proteinG))]
    case .sleep:
      return [
        sleepAvg,
        Stat(
          label: String(localized: "insight.l.readiness"), value: t.readiness.map { "\($0)/100" } ?? "–",
          sub: w.readiness.map { avg(n($0.value)) } ?? none),
      ]
    case .readiness:
      return [sleepToday, Stat(label: avg7, value: w.readiness.map { "\(n($0.value))/100" } ?? "–", sub: days(w.readiness))]
    case .steps:
      return [Stat(label: avg7, value: w.steps.map { n($0.value) } ?? "–", sub: days(w.steps)), energy]
    case .water:
      return [Stat(label: avg7, value: w.waterMl.map { water($0.value) } ?? "–", sub: days(w.waterMl)), sleepToday]
    }
  }

  private func tint(_ topic: InsightHighlight.Topic) -> Color {
    switch topic {
    case .calories: return DS.Color.metricOrange.swiftUI
    case .protein: return DS.Color.metricRose.swiftUI
    case .sleep: return DS.Color.metricPurple.swiftUI
    case .readiness:
      guard let r = today.readiness else { return DS.Color.mutedForeground.swiftUI }
      return r >= 75
        ? DS.Color.readinessGreen.swiftUI : r >= 50 ? DS.Color.readinessYellow.swiftUI : DS.Color.readinessRed.swiftUI
    case .steps: return DS.Color.metricCyan.swiftUI
    case .water: return DS.Color.waterFill.swiftUI
    }
  }

  /// Màn của chủ đề (`DeepLink`).
  static func link(_ topic: InsightHighlight.Topic) -> String {
    switch topic {
    case .calories, .protein: "ascnd://nutrition"
    case .sleep: "ascnd://log-sleep"
    case .water: "ascnd://water"
    case .readiness, .steps: "ascnd://assistant"
    }
  }

  private static func tint(_ p: SmartNudges.Priority) -> Color {
    switch p {
    case .high: DS.Color.readinessRed.swiftUI
    case .medium: DS.Color.readinessYellow.swiftUI
    case .low: DS.Color.readinessGreen.swiftUI
    }
  }

  private static func time(_ at: EpochMillis) -> String {
    Date(timeIntervalSince1970: TimeInterval(at.millis) / 1000)
      .formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(.app))
  }
}

extension SmartNudgesBook {
  /// Máy chủ chưa triển khai `ai-smart-nudges`.
  var isNotDeployed: Bool {
    if case .failed(.notDeployed) = phase { true } else { false }
  }
}

extension SmartNudgesBook {
  /// Khoá ngắn của pha (đổi khi kết quả mới về) — cho `.task(id:)`.
  var phaseKey: String {
    switch phase {
    case .idle: "idle"
    case .loading: "loading"
    case .failed: "failed"
    case .ready(let e): "ready-\(e.at.millis)"
    }
  }
}
