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
///
/// 19/10 (chủ dự án: "chưa đủ đơn giản" — audit #596): MỘT màn "Ghi hôm nay" thay
/// cả "Ghi cả ngày" lẫn "Kể cho Koa". Micro to là việc chính; kết quả là danh sách
/// gọn mỗi mục một dòng (chạm để sửa, ✕ để bỏ — không còn công tắc); việc hôm nay
/// còn thiếu là chip "+ như thường lệ / như hôm qua / theo kế hoạch / theo kế hoạch
/// ăn". Không nói gì mà chỉ chạm chip rồi Lưu cũng được.
struct TellKoaSheet: View {
  let userId: String
  /// Chữ có sẵn (tin nhắn vừa gửi Koa Coach).
  var initialText = ""
  /// Mở bằng nút micro ở thẻ Hôm nay: bắt đầu nghe ngay.
  var startListening = false
  var onSaved: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(WorkoutFlow.self) private var flow
  @Environment(NutritionBooks.self) private var nutrition: NutritionBooks?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.weightUnit) private var weightUnit
  @Environment(ProfileBook.self) private var profile: ProfileBook?

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
  /// Dòng đang mở để sửa.
  @State private var expanded: Part?
  /// Món đang chỉnh macro.
  @State private var macroTarget: FoodRef?
  /// Việc còn thiếu hôm nay (đọc khi mở màn) và các chip người dùng đã thêm.
  @State private var gaps = Gaps()
  @State private var adds: Set<Add> = []

  enum Add: Hashable { case sleep, water, workout, yesterdayMeals, planMeals }

  /// Hôm nay còn thiếu gì + số điền sẵn cho chip.
  struct Gaps {
    var sleep = false
    var waterMl: Int?
    var workoutPlan: String?
    var yesterday: [MealLog.RecentMeal] = []
    /// Kế hoạch ăn: tên, các bữa hôm nay chưa ghi.
    var planName: String?
    var planMeals: [String] = []
    var planKcal: Double = 0
    var trainedToday = false
  }

  enum Part: Hashable { case sleep, water, weight, workout, meal(String), yesterdayMeals, planMeals }

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
    /// Còn món chưa biết số (không khớp thư viện / nói theo gram) mà người dùng chưa
    /// nhập macro → mở màn ghi bữa sau khi lưu.
    var needsScreen: Bool { foods.contains { ($0.match == nil || $0.spoken.grams != nil) && !$0.hasMacros } }
  }

  struct FoodEdit: Identifiable, Equatable {
    let id = UUID()
    var spoken: SpokenLog.Food
    var match: MealLog.Food?
    var searching = true
    /// Macro MỖI PHẦN người dùng chỉnh (19/10, chủ dự án: "cho phép người dùng chỉnh
    /// macro"). Điền sẵn từ món khớp; món không khớp nhập kcal là ghi được luôn.
    var kcal = ""
    var protein = ""
    var carbs = ""
    var fat = ""
    var editing = false
    var hasMacros: Bool { !kcal.trimmingCharacters(in: .whitespaces).isEmpty }
    /// Macro đã nhập hợp lệ (cùng luật với món nhập tay của màn ghi bữa).
    var macrosValid: Bool {
      MealLog.customItem(id: "x", name: spoken.name, kcal: kcal, protein: protein, carbs: carbs, fat: fat) != nil
    }
    var shownKcal: Double? {
      if hasMacros { return Double(kcal.replacingOccurrences(of: ",", with: ".")).map { $0 * spoken.servings } }
      guard spoken.grams == nil, let match else { return nil }
      return match.kcal * spoken.servings
    }

    mutating func prefill(from m: MealLog.Food) {
      func s(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v) }
      kcal = s(m.kcal)
      protein = s(m.protein)
      carbs = s(m.carbs)
      fat = s(m.fat)
    }
  }

  enum FollowUp: Identifiable, Hashable {
    case meal(String, [MealLog.Food], query: String)
    var id: String {
      switch self {
      case .meal(let s, _, _): "meal-\(s)"
      }
    }
  }

  private var lang: AppPreferences.Lang { services.preferences.lang }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          if done { doneView } else { koaLine; aiNotice; tiles; gapTiles; notes; inputSummary }
        }
        .padding(DS.Spacing.md)
      }
      .scrollDismissesKeyboard(.interactively)
      .safeAreaInset(edge: .bottom) {
        if !done {
          VStack(spacing: 10) {
            chatBar.padding(.horizontal, DS.Spacing.md)
            saveBar
          }
          .padding(.top, 8)
        }
      }
      .sheet(item: $macroTarget) { ref in macroSheet(ref) }
      .toolbar {
        ToolbarItem(placement: .principal) {
          HStack(spacing: 6) {
            IntelligenceMark(size: 16)
            Text("logday.title").font(.system(size: 16, weight: .semibold))
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
      }
    }
    .task {
      if startListening { Task { await dictation.start(lang: lang) } }
      await loadGaps()
    }
    .onChange(of: dictation.transcript) { _, t in
      guard !t.isEmpty else { return }
      if correcting != nil { correction = t } else { text = t }
    }
    .task(id: text) {
      // Đọc lại sau khi ngừng gõ / nói một nhịp.
      try? await Task.sleep(for: .milliseconds(350))
      guard !Task.isCancelled else { return }
      reparse()
      await understand()
    }
    .onDisappear { dictation.stop() }
    .sheet(item: $followUp) { f in
      switch f {
      case .meal(let slot, let prefill, let query):
        LogMealView(userId: userId, mealType: slot, start: .search, prefill: prefill, initialQuery: query) { onSaved() }
      }
    }
  }

  // MARK: - Ô kể

  /// Thanh chat (19/10, chủ dự án: "bỏ nút micro to, để lại thanh chat kèm micro …
  /// liquid glass có fallback"): cùng viên kính với mọi ô chat của app
  /// (`glassComposer`), ô chữ giãn tới 4 dòng + micro + xoá.
  private var chatBar: some View {
    VStack(alignment: .leading, spacing: 6) {
      // Đang sửa một thẻ (24/10, Kiệt: dùng chung thanh chat thay cho ô trong thẻ):
      // nhãn "Sửa: Nước ✕" trên thanh, chữ gõ / nói đi vào câu sửa của thẻ ấy.
      if let part = correcting {
        HStack(spacing: 6) {
          Image(systemName: "sparkles").foregroundStyle(IntelligenceTones.violet)
          Text(verbatim: String(localized: "logday.fix.editing \(title(part))"))
            .font(.system(size: 13, weight: .semibold))
          Button {
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.2)) { stopCorrecting() }
          } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .bold))
              .frame(width: 32, height: 32)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("logday.fix.cancel"))
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .background(.thinMaterial, in: Capsule())
        .transition(.opacity.combined(with: .move(edge: .bottom)))
      }
      chatField
    }
  }

  private var chatField: some View {
    HStack(alignment: .bottom, spacing: 6) {
      TextField(
        correcting.map { String(localized: "logday.fix.placeholder.part \(fixExample($0))") } ?? String(localized: "logday.type"),
        text: correcting == nil ? $text : $correction, axis: .vertical
      )
        .font(.system(size: 16))
        .lineLimit(1...4)
        .focused($typing)
        .submitLabel(correcting == nil ? .return : .send)
        .onSubmit { if let part = correcting { Task { await correct(part) } } }
        .padding(.vertical, 12)
        .padding(.leading, 16)
        .accessibilityLabel(Text("tellkoa.field.a11y"))
      if let part = correcting, !correction.trimmingCharacters(in: .whitespaces).isEmpty, !dictation.isListening {
        Button { Task { await correct(part) } } label: {
          Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(width: 38, height: 38)
            .background(IntelligenceTones.violet, in: Circle())
            .padding(.bottom, 5)
        }
        .buttonStyle(TodayPressStyle())
        .disabled(fixing != nil)
        .accessibilityLabel(Text("logday.fix.send"))
      }
      if correcting == nil, !text.isEmpty, !dictation.isListening {
        Button { text = "" } label: {
          Image(systemName: "xmark.circle.fill").font(.system(size: 17))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 36, height: 44)
        }
        .accessibilityLabel(Text("tellkoa.clear"))
      }
      Button { toggleMic() } label: {
        Image(systemName: dictation.isListening ? "stop.fill" : "mic.fill")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(dictation.isListening ? .white : DS.Color.background.swiftUI)
          .frame(width: 38, height: 38)
          .background(dictation.isListening ? DS.Color.destructive.swiftUI : DS.Color.foreground.swiftUI, in: Circle())
          .symbolEffect(.pulse, isActive: dictation.isListening && !reduceMotion)
          .padding(.bottom, 5)
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityLabel(Text(dictation.isListening ? "tellkoa.mic.stop" : "tellkoa.mic.start"))
    }
    .padding(.trailing, 5)
    .glassComposer(radius: 24)
    .intelligenceGlow(thinking || correcting != nil, radius: 24)
    .animation(reduceMotion ? nil : .smooth(duration: 0.3), value: thinking)
  }

  private func toggleMic() {
    if dictation.isListening {
      dictation.stop()
    } else {
      typing = false
      Task { await dictation.start(lang: lang) }
    }
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

  /// Koa nói một câu tóm tắt (mock B, 19/10).
  private var koaLine: some View {
    HStack(alignment: .top, spacing: 10) {
      MascotAvatar(mascotId: nil, size: 36)
      HStack(spacing: 8) {
        // Đang đọc / đang sửa: MỘT kiểu duy nhất — ký hiệu + "Koa đang hiểu…" có ánh
        // lướt (24/10: trước lúc hiện cả chữ "ASCND Intelligence", lúc không).
        if busyLine {
          IntelligenceMark(size: 16)
          IntelligenceSheenText(text: Text(verbatim: koaSays), font: .system(size: 15))
            .fixedSize(horizontal: false, vertical: true)
        } else {
          Text(verbatim: koaSays)
            .contentTransition(.opacity)
            .font(.system(size: 15))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.horizontal, 13)
      .padding(.vertical, 10)
      .background(
        DS.Color.card.swiftUI,
        in: UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 18, style: .continuous))
      .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
    .animation(reduceMotion ? nil : .smooth(duration: 0.3), value: busyLine)
  }

  private var busyLine: Bool { (thinking && correcting == nil) || fixing != nil }

  /// ASCND Intelligence không trả lời: nói lý do (quá tải…) và rằng thẻ là bản đọc cơ bản.
  @ViewBuilder private var aiNotice: some View {
    // Chỉ khi AI THẬT SỰ quá tải / hết lượt — lỗi khác thì lặng lẽ dùng bản đọc trong máy.
    if let f = aiFailure, f.isBusy, !text.trimmingCharacters(in: .whitespaces).isEmpty {
      note(String(localized: "logday.ai.fallback \(WeeklyReviewView.failureText(f))"),
           systemImage: "exclamationmark.triangle", tint: DS.Color.metricOrangeGraphic.swiftUI)
    }
  }

  /// Câu của Koa theo việc người dùng đang làm (24/10, Kiệt: chạm thẻ nào thì Koa
  /// hướng dẫn chỗ khó hiểu của thẻ ấy).
  private var koaSays: String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if let part = fixing { return String(localized: "logday.fix.working \(title(part))") }
    if let part = fixMissed {
      if let f = aiFailure, f.isBusy { return WeeklyReviewView.failureText(f) }
      return String(localized: "logday.fix.none.part \(fixExample(part))")
    }
    if let part = correcting {
      if dictation.isListening, !correction.isEmpty { return correction }
      return String(localized: "logday.fix.ask \(title(part)) \(fixExample(part))")
    }
    if dictation.isListening { return trimmed.isEmpty ? String(localized: "logday.koa.listening") : trimmed }
    if thinking { return String(localized: "logday.understanding") }
    if let open = expanded, let hint = hint(open) { return hint }
    if included.isEmpty {
      return trimmed.isEmpty ? String(localized: "logday.koa.empty") : String(localized: "tellkoa.nothing")
    }
    let ready = String(localized: "logday.koa.ready \(included.count)")
    return meals.isEmpty ? ready : "\(ready) \(String(localized: "logday.hint.foods"))"
  }

  /// Chỗ khó hiểu của từng thẻ, nói khi người dùng mở thẻ ấy.
  private func hint(_ p: Part) -> String? {
    switch p {
    case .water: String(localized: "logday.hint.water")
    case .sleep: String(localized: "logday.hint.sleep")
    case .weight: String(localized: "logday.hint.weight")
    default: nil
    }
  }

  /// Câu sửa mẫu cho từng loại thẻ.
  private func fixExample(_ p: Part) -> String {
    switch p {
    case .water: String(localized: "logday.fix.ex.water")
    case .sleep: String(localized: "logday.fix.ex.sleep")
    case .weight: String(localized: "logday.fix.ex.weight")
    case .workout: String(localized: "logday.fix.ex.workout")
    default: String(localized: "logday.fix.ex.meal")
    }
  }

  private func stopCorrecting() {
    correcting = nil
    correction = ""
    fixMissed = nil
    if dictation.isListening { dictation.stop() }
  }

  /// Ô lớn hai cột cho ngủ / nước / cân / tập; bữa trải hết bề ngang.
  @ViewBuilder private var tiles: some View {
    tilesBody
      .opacity(thinking ? 0.45 : 1)
      .blur(radius: thinking && !reduceMotion ? 1.5 : 0)
      .animation(reduceMotion ? nil : .smooth(duration: 0.35), value: thinking)
  }

  @ViewBuilder private var tilesBody: some View {
    let small = included.filter { [.sleep, .water, .weight, .workout].contains($0) }
    let wide = included.filter { ![.sleep, .water, .weight, .workout].contains($0) }
    if result.doubts.contains(.mixedQuestion), !confirmedQuestion {
      ask(String(localized: "tellkoa.ask.mixed")) {
        choice(String(localized: "tellkoa.ask.mixed.yes"), selected: false) { confirmedQuestion = true }
      }
    }
    if !small.isEmpty {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
        ForEach(small, id: \.self) { tile($0) }
      }
    }
    if let open = expanded, [.sleep, .water, .weight].contains(open), included.contains(open) {
      VStack(alignment: .leading, spacing: 10) { editor(open) }
        .padding(14)
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
    ForEach(wide, id: \.self) { mealTile($0) }
  }

  private func tileShell<Content: View>(_ part: Part, @ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top) {
        Image(systemName: Self.glyph(part))
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 32, height: 32)
          .background(Self.color(part), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        Spacer(minLength: 0)
        if fixable(part) {
          Button {
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.2)) {
              if correcting == part { stopCorrecting() } else {
                correcting = part
                correction = ""
                fixMissed = nil
                typing = true
              }
            }
          } label: {
            Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold))
              .foregroundStyle(correcting == part ? IntelligenceTones.violet : DS.Color.mutedForeground.swiftUI)
              .frame(width: 28, height: 28)
              .frame(width: 40, height: 44, alignment: .topTrailing)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: String(localized: "logday.fix.a11y \(title(part))")))
        }
        Button { remove(part) } label: {
          Image(systemName: "xmark").font(.system(size: 11, weight: .bold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 28, height: 28)
            .frame(width: 44, height: 44, alignment: .topTrailing)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: String(localized: "logday.remove \(title(part))")))
      }
      .padding(.bottom, -8)
      content()
      if let fix = lastFix, fix.part == part { fixSummary(fix) }
      if failed.contains(part) {
        Text("tellkoa.part.failed").font(DS.TextStyle.caption).foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .strokeBorder(expanded == part ? Self.color(part).opacity(0.6) : .clear, lineWidth: 1.5)
    }
    .intelligenceGlow(fixing == part || lastFix?.part == part, radius: 20)
    .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
  }

  private func tile(_ part: Part) -> some View {
    let v = bigValue(part)
    return tileShell(part) {
      Button {
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.25)) { expanded = expanded == part ? nil : part }
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: v.big).font(.system(size: 22, weight: .bold).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1).minimumScaleFactor(0.7)
          Text(verbatim: v.small).font(.system(size: 12))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .allowsHitTesting(editable(part))
      doubts(part)
    }
  }

  /// Số to + dòng nhỏ của một ô.
  private func bigValue(_ p: Part) -> (big: String, small: String) {
    let unit = services.preferences.volumeUnit
    switch p {
    case .sleep:
      guard let s = sleep else { return ("", "") }
      return (SpokenLogDisplay.sleep(bed: s.bed, wake: s.wake, lang: lang), "\(Self.hhmm(s.bed)) – \(Self.hhmm(s.wake))")
    case .water:
      guard let ml = waterMl else { return ("?", String(localized: "logday.water.howMuch")) }
      return ("+\(SpokenLogDisplay.water(ml, unit: unit))", String(localized: "tellkoa.water.adds"))
    case .weight:
      return (weightKg == nil ? "—" : "\(weightText) \(weightUnit == .lbs ? "lb" : "kg")", title(.weight))
    case .workout:
      if let w = workout {
        return (SpokenLogDisplay.workout(w, lang: lang),
                gaps.trainedToday ? String(localized: "logday.workout.extra") : title(.workout))
      }
      return (gaps.workoutPlan ?? title(.workout), String(localized: "logday.add.workout"))
    default:
      return (title(p), summary(p))
    }
  }

  /// Bữa: tên bữa + tổng kcal, các món là chip (chạm để chỉnh macro).
  @ViewBuilder private func mealTile(_ part: Part) -> some View {
    tileShell(part) {
      switch part {
      case .meal(let slot):
        if let i = meals.firstIndex(where: { $0.slot == slot }) {
          let m = meals[i]
          let kcal = m.foods.reduce(0.0) { $0 + ($1.shownKcal ?? 0) }
          let unknown = m.foods.contains { $0.shownKcal == nil && !$0.searching }
          Text(verbatim: kcal == 0 && unknown
            ? "\(title(part)) · \(String(localized: "logday.kcal.unknown"))"
            : "\(title(part)) · \(Int(kcal.rounded()))\(unknown ? "+" : "") kcal")
            .font(.system(size: 19, weight: .bold).monospacedDigit())
          FlowRows(spacing: 6, centered: false) {
            ForEach(m.foods) { f in foodChip(f, slot: slot) }
          }
          doubts(part)
        }
      case .planMeals:
        planTileBody
      default:
        Text(verbatim: title(part)).font(.system(size: 19, weight: .bold))
        Text(verbatim: summary(part)).font(.system(size: 13)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  /// Thẻ kế hoạch ăn dễ hiểu (19/10, chủ dự án): nói rõ đây là gì, rồi từng bữa sẽ
  /// ghi kèm món và kcal — người dùng biết chính xác Lưu sẽ ghi gì.
  @ViewBuilder private var planTileBody: some View {
    let day = MealPlans.dayIndex(Date())
    let items = (planBook?.items ?? []).filter { $0.day == day }
    let open = planMealsToLog
    let total = items.filter { open.contains($0.mealType) }.reduce(0) { $0 + $1.kcal }
    VStack(alignment: .leading, spacing: 2) {
      Text("logday.plan.headline").font(.system(size: 18, weight: .bold))
      Text(verbatim: String(localized: "logday.plan.sub \(gaps.planName ?? "") \(open.count)"))
        .font(.system(size: 13)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    VStack(spacing: 0) {
      ForEach(Array(open.enumerated()), id: \.element) { i, meal in
        let foods = items.filter { $0.mealType == meal }
        if i > 0 { Divider() }
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          Text(verbatim: DiaryView.mealName(meal)).font(.system(size: 14, weight: .semibold))
            .frame(width: 84, alignment: .leading)
          Text(verbatim: foods.map(\.name).joined(separator: ", "))
            .font(.system(size: 14)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(2)
          Spacer(minLength: 0)
          Text(verbatim: "\(Int(foods.reduce(0) { $0 + $1.kcal }.rounded()))")
            .font(.system(size: 14, weight: .semibold).monospacedDigit())
            .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
        }
        .padding(.vertical, 8)
      }
    }
    .padding(.horizontal, 12)
    .background(DS.Color.foreground.swiftUI.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    Text(verbatim: String(localized: "logday.plan.total \(Int(total.rounded()))"))
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
  }

  private func foodChip(_ f: FoodEdit, slot: String) -> some View {
    let known = f.shownKcal != nil
    return Button { macroTarget = FoodRef(slot: slot, id: f.id) } label: {
      HStack(spacing: 5) {
        Text(verbatim: f.match?.name ?? f.spoken.name).lineLimit(1)
        if f.searching {
          ProgressView().controlSize(.mini)
        } else if let k = f.shownKcal {
          Text(verbatim: "\(Int(k.rounded()))").fontWeight(.bold).monospacedDigit()
            .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
        } else {
          Image(systemName: "plus.circle.fill").foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
        }
      }
      .font(.system(size: 13))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .padding(.horizontal, 10)
      .frame(minHeight: 32)
      .background(known ? DS.Color.metricOrangeGraphic.swiftUI.opacity(0.10) : DS.Color.card.swiftUI,
                  in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay {
        if !known {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .strokeBorder(DS.Color.metricOrangeGraphic.swiftUI, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
      }
      .frame(minHeight: 44)
    }
    .buttonStyle(.plain)
    .disabled(f.searching)
    .accessibilityHint(Text("logday.macros.edit"))
  }

  struct FoodRef: Identifiable, Hashable {
    let slot: String
    let id: UUID
  }

  /// Chỉnh macro một món (mock A): khẩu phần + kcal / đạm / tinh bột / béo mỗi phần.
  @ViewBuilder private func macroSheet(_ ref: FoodRef) -> some View {
    if let i = meals.firstIndex(where: { $0.slot == ref.slot }), let j = meals[i].foods.firstIndex(where: { $0.id == ref.id }) {
      let f = $meals[i].foods[j]
      NavigationStack {
        VStack(alignment: .leading, spacing: 16) {
          Text(verbatim: f.wrappedValue.match?.name ?? f.wrappedValue.spoken.name).font(.system(size: 22, weight: .bold))
          Stepper(value: f.spoken.servings, in: 0.5...20, step: 0.5) {
            Text(verbatim: String(localized: "logday.servings \(f.wrappedValue.spoken.servings.formatted(.number.precision(.fractionLength(0...1)).locale(.app)))"))
              .font(.system(size: 16, weight: .semibold))
          }
          HStack(spacing: 8) {
            macroField("kcal", f.kcal)
            macroField(String(localized: "logday.macro.protein"), f.protein)
            macroField(String(localized: "logday.macro.carbs"), f.carbs)
            macroField(String(localized: "logday.macro.fat"), f.fat)
          }
          Text(f.wrappedValue.hasMacros && !f.wrappedValue.macrosValid ? "logday.macros.invalid" : "logday.macros.perServing")
            .font(DS.TextStyle.caption)
            .foregroundStyle(f.wrappedValue.hasMacros && !f.wrappedValue.macrosValid ? DS.Color.destructive.swiftUI : DS.Color.mutedForeground.swiftUI)
          Spacer(minLength: 0)
        }
        .padding(DS.Spacing.md)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            Button(String(localized: "logMeal.edit.done")) { macroTarget = nil }
              .disabled(f.wrappedValue.hasMacros && !f.wrappedValue.macrosValid)
          }
        }
        .ascndPage()
      }
      .presentationDetents([.height(340)])
      .presentationBackground(DS.Color.background.swiftUI)
    }
  }

  /// Phần ngày khác / chưa hiểu / lỗi.
  @ViewBuilder private var notes: some View {
    ForEach(result.otherDay, id: \.self) { s in
      note(String(localized: "tellkoa.otherday \(s)"), systemImage: "calendar.badge.exclamationmark")
    }
    ForEach(result.unparsed, id: \.self) { s in
      note(String(localized: "tellkoa.unparsed \(s)"), systemImage: "questionmark.circle")
    }
    if !failed.isEmpty {
      note(String(localized: "tellkoa.failed"), systemImage: "exclamationmark.triangle", tint: DS.Color.destructive.swiftUI)
    }
    if text.isEmpty, included.isEmpty, !dictation.isListening {
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Self.examples(lang), id: \.self) { ex in
          Button { text = ex } label: {
            Text(verbatim: "“\(ex)”").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .multilineTextAlignment(.leading)
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.leading, 46)
    }
  }

  /// Tổng sẽ ghi (19/10, chủ dự án: "vẽ lại cho dễ nhìn dễ hiểu"): mỗi chỉ số một
  /// dòng — biểu tượng màu, tên, số sắp ghi, và hôm nay sẽ thành bao nhiêu so với
  /// mục tiêu (thanh). Chỉ hiện những gì Lưu thật sự ghi.
  @ViewBuilder private var inputSummary: some View {
    let s = entryTotals
    let rows = summaryRows(s)
    if !rows.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        Text("logday.total.title").font(.system(size: 15, weight: .bold))
        ForEach(rows, id: \.label) { r in
          VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
              Image(systemName: r.glyph)
                .font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(r.color, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
              Text(verbatim: r.label).font(.system(size: 14))
              Spacer(minLength: 0)
              Text(verbatim: r.value).font(.system(size: 16, weight: .bold).monospacedDigit())
            }
            if let p = r.progress {
              HStack(spacing: 8) {
                GeometryReader { g in
                  ZStack(alignment: .leading) {
                    Capsule().fill(r.color.opacity(0.15))
                    Capsule().fill(r.color).frame(width: g.size.width * min(1, p))
                  }
                }
                .frame(height: 6)
                Text(verbatim: r.after ?? "").font(.system(size: 11).monospacedDigit())
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .fixedSize()
              }
              .padding(.leading, 34)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
      .padding(16)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
    }
  }

  private struct SummaryRow {
    let glyph: String, label: String, value: String, color: Color
    var progress: Double?
    var after: String?
  }

  private func summaryRows(_ s: (kcal: Double, protein: Double, waterMl: Int, sleepMin: Int)) -> [SummaryRow] {
    var out: [SummaryRow] = []
    let fmt = { (v: Double) in v.formatted(.number.precision(.fractionLength(0)).locale(.app)) }
    if s.kcal > 0 {
      var r = SummaryRow(glyph: TodayDayCard.glyph(.meal), label: String(localized: "logday.sum.kcal"),
                         value: "+\(fmt(s.kcal)) kcal", color: TodayDayCard.color(.meal))
      if let target = todayTargets.kcal, target > 0 {
        let after = todayTargets.kcalNow + s.kcal
        r.progress = after / target
        r.after = String(localized: "logday.sum.after \(fmt(after)) \(fmt(target))")
      }
      out.append(r)
    }
    if s.protein > 0 {
      var r = SummaryRow(glyph: "bolt.fill", label: String(localized: "logday.macro.protein"),
                         value: "+\(fmt(s.protein)) g", color: DS.Color.metricRose.swiftUI)
      if let target = todayTargets.protein, target > 0 {
        let after = todayTargets.proteinNow + s.protein
        r.progress = after / target
        r.after = String(localized: "logday.sum.after \(fmt(after)) \(fmt(target))")
      }
      out.append(r)
    }
    if s.waterMl > 0 {
      out.append(SummaryRow(glyph: TodayDayCard.glyph(.water), label: String(localized: "today.sig.water"),
                            value: "+\(SpokenLogDisplay.water(s.waterMl, unit: services.preferences.volumeUnit))",
                            color: TodayDayCard.color(.water)))
    }
    if s.sleepMin > 0 {
      out.append(SummaryRow(glyph: TodayDayCard.glyph(.sleep), label: String(localized: "today.sig.sleep"),
                            value: SpokenLogDisplay.sleep(bed: .init(hour: 0, minute: 0), wake: .init(hour: s.sleepMin / 60, minute: s.sleepMin % 60), lang: lang),
                            color: TodayDayCard.color(.sleep)))
    }
    if included.contains(.workout) {
      out.append(SummaryRow(glyph: TodayDayCard.glyph(.workout), label: String(localized: "today.sig.workout"),
                            value: bigValue(.workout).big, color: TodayDayCard.color(.workout)))
    }
    return out
  }

  private var entryTotals: (kcal: Double, protein: Double, waterMl: Int, sleepMin: Int) {
    var kcal = 0.0, protein = 0.0
    for part in included {
      switch part {
      case .meal(let slot):
        for f in meals.first(where: { $0.slot == slot })?.foods ?? [] {
          kcal += f.shownKcal ?? 0
          if f.hasMacros { protein += (Double(f.protein.replacingOccurrences(of: ",", with: ".")) ?? 0) * f.spoken.servings }
          else if let m = f.match, f.spoken.grams == nil { protein += m.protein * f.spoken.servings }
        }
      case .planMeals:
        let day = MealPlans.dayIndex(Date())
        for it in planBook?.items ?? [] where it.day == day && planMealsToLog.contains(it.mealType) {
          kcal += it.kcal
          protein += it.protein
        }
      case .yesterdayMeals:
        for m in gaps.yesterday {
          kcal += m.kcal
          protein += m.foods.reduce(0) { $0 + $1.food.protein * $1.servings }
        }
      default: break
      }
    }
    var sleepMin = 0
    if included.contains(.sleep), let s = sleep {
      sleepMin = ((s.wake.hour * 60 + s.wake.minute) - (s.bed.hour * 60 + s.bed.minute) + 1440) % 1440
    }
    return (kcal, protein, included.contains(.water) ? (waterMl ?? 0) : 0, sleepMin)
  }

  private func editable(_ p: Part) -> Bool {
    switch p {
    case .sleep, .water, .weight, .meal: true
    case .workout, .yesterdayMeals, .planMeals: false
    }
  }

  @ViewBuilder private func editor(_ p: Part) -> some View {
    switch p {
    case .sleep: if let sleep { sleepRow(sleep) }
    case .water: waterRow
    case .weight: weightRow
    case .meal(let slot):
      if let i = meals.firstIndex(where: { $0.slot == slot }) { mealRow($meals[i]) }
    default: EmptyView()
    }
  }

  /// Câu hỏi lại của dòng — hiện luôn, không cần mở.
  @ViewBuilder private func doubts(_ p: Part) -> some View {
    switch p {
    case .sleep:
      if let h = sleep?.askHoursOrClock {
        ask(String(localized: "tellkoa.ask.sleepHoursOrClock \(h)")) {
          choice(String(localized: "tellkoa.ask.sleepHours \(h)"), selected: false) { sleep?.askHoursOrClock = nil }
          choice(String(localized: "tellkoa.ask.sleepAt \(h)"), selected: false) {
            sleep?.bed = SleepLog.Clock(hour: h < 12 ? h + 12 : h, minute: 0)
            sleep?.askHoursOrClock = nil
            expanded = .sleep
          }
        }
      }
    case .water:
      if waterMl == nil {
        ask(String(localized: "tellkoa.ask.water")) {
          ForEach([250, 500, 1000], id: \.self) { ml in
            choice(SpokenLogDisplay.water(ml, unit: services.preferences.volumeUnit), selected: false) { waterMl = ml }
          }
        }
      }
    case .meal(let slot):
      if let i = meals.firstIndex(where: { $0.slot == slot }), meals[i].slotGuessed {
        ask(String(localized: "tellkoa.ask.slot")) {
          ForEach(Self.slots, id: \.self) { s in
            choice(SpokenLogDisplay.slot(s, lang: lang), selected: s == slot) {
              meals[i].slot = s
              meals[i].slotGuessed = false
            }
          }
        }
      }
    default: EmptyView()
    }
  }

  private func summary(_ p: Part) -> String {
    let unit = services.preferences.volumeUnit
    switch p {
    case .sleep:
      guard let s = sleep else { return "" }
      let span = "\(Self.hhmm(s.bed))–\(Self.hhmm(s.wake))"
      return "\(SpokenLogDisplay.sleep(bed: s.bed, wake: s.wake, lang: lang)) · \(span)"
    case .water:
      guard let ml = waterMl else { return String(localized: "logday.water.howMuch") }
      return "+\(SpokenLogDisplay.water(ml, unit: unit))"
    case .weight:
      return weightKg == nil ? String(localized: "tellkoa.weight.invalid") : "\(weightText) \(weightUnit == .lbs ? "lb" : "kg")"
    case .workout:
      if let w = workout { return SpokenLogDisplay.workout(w, lang: lang) }
      return gaps.workoutPlan.map { String(localized: "logday.workout.plan \($0)") } ?? ""
    case .meal(let slot):
      guard let m = meals.first(where: { $0.slot == slot }) else { return "" }
      if m.foods.contains(where: \.searching) { return String(localized: "tellkoa.food.searching") }
      let names = m.foods.map { $0.match?.name ?? $0.spoken.name }.joined(separator: ", ")
      let kcal = m.foods.reduce(0.0) { $0 + ($1.shownKcal ?? 0) }
      let tail = m.needsScreen ? String(localized: "tellkoa.meal.later") : "\(Int(kcal.rounded())) kcal"
      return "\(names) · \(tail)"
    case .yesterdayMeals:
      return YesterdayMealsCard.detail(gaps.yesterday)
    case .planMeals:
      let open = planMealsToLog
      let slots = open.map(DiaryView.mealName).joined(separator: ", ")
      let kcal = open.flatMap { m in planBook?.items.filter { $0.day == MealPlans.dayIndex(Date()) && $0.mealType == m } ?? [] }
        .reduce(0) { $0 + $1.kcal }
      return "\(gaps.planName ?? "") · \(slots) · \(Int(kcal.rounded())) kcal"
    }
  }

  /// Bữa của kế hoạch sẽ ghi: bỏ các khung người dùng vừa kể (bữa kể thắng —
  /// không ghi hai bữa trưa).
  private var planMealsToLog: [String] {
    let spoken = Set(meals.filter { !skipped.contains(.meal($0.slot)) }.map(\.slot))
    return gaps.planMeals.filter { !spoken.contains($0) }
  }

  static func hhmm(_ c: SleepLog.Clock) -> String { String(format: "%d:%02d", c.hour, c.minute) }

  private func remove(_ p: Part) {
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.2)) {
      if expanded == p { expanded = nil }
      switch p {
      case .sleep: if adds.contains(.sleep), !parsed(.sleep) { adds.remove(.sleep); sleep = nil } else { skipped.insert(p) }
      case .water: if adds.contains(.water), !parsed(.water) { adds.remove(.water); waterMl = nil } else { skipped.insert(p) }
      case .workout: if adds.contains(.workout), workout == nil { adds.remove(.workout) } else { skipped.insert(p) }
      case .yesterdayMeals: adds.remove(.yesterdayMeals)
      case .planMeals: adds.remove(.planMeals)
      default: skipped.insert(p)
      }
    }
  }

  private func parsed(_ p: Part) -> Bool {
    result.items.contains { item in
      switch (item, p) {
      case (.sleep, .sleep), (.water, .water), (.weight, .weight), (.workout, .workout): true
      default: false
      }
    }
  }

  // MARK: - Còn thiếu (chip)

  /// Việc còn thiếu: ô mờ viền đứt, chạm để thêm (mock A/B).
  @ViewBuilder private var gapTiles: some View {
    let chips = availableAdds
    if !chips.isEmpty, !dictation.isListening {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
        ForEach(chips, id: \.self) { a in
          Button { add(a) } label: {
            HStack(spacing: 8) {
              Image(systemName: "plus").font(.system(size: 13, weight: .bold))
              Text(verbatim: addLabel(a)).font(.system(size: 13, weight: .semibold))
                .multilineTextAlignment(.leading)
                .lineLimit(2)
              Spacer(minLength: 0)
            }
            .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.75))
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .overlay {
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.22), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4]))
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(TodayPressStyle())
        }
      }
    }
  }

  /// Chip còn chọn được: việc hôm nay còn thiếu, chưa có trong danh sách.
  private var availableAdds: [Add] {
    var out: [Add] = []
    if gaps.sleep, sleep == nil { out.append(.sleep) }
    if gaps.waterMl != nil, !included.contains(.water) { out.append(.water) }
    if gaps.workoutPlan != nil, !included.contains(.workout) { out.append(.workout) }
    let anyMeal = included.contains { if case .meal = $0 { true } else { $0 == .yesterdayMeals || $0 == .planMeals } }
    if !anyMeal {
      if !gaps.planMeals.isEmpty { out.append(.planMeals) }
      if !gaps.yesterday.isEmpty { out.append(.yesterdayMeals) }
    }
    return out
  }

  private func addLabel(_ a: Add) -> String {
    switch a {
    case .sleep:
      let b = SleepLog.Clock.defaultBed, w = SleepLog.Clock.defaultWake
      return String(localized: "logday.add.sleep \("\(Self.hhmm(b))–\(Self.hhmm(w))")")
    case .water: return String(localized: "logday.add.water \(SpokenLogDisplay.water(gaps.waterMl ?? 0, unit: services.preferences.volumeUnit))")
    case .workout: return String(localized: "logday.add.workout")
    case .yesterdayMeals: return String(localized: "meal.yesterday.title")
    case .planMeals: return String(localized: "logday.add.plan")
    }
  }

  private func add(_ a: Add) {
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.25)) {
      adds.insert(a)
      switch a {
      case .sleep:
        sleep = SleepEdit(bed: .defaultBed, wake: .defaultWake, askHoursOrClock: nil, askHalf: false)
        skipped.remove(.sleep)
      case .water:
        waterMl = gaps.waterMl
        skipped.remove(.water)
      case .workout: skipped.remove(.workout)
      case .yesterdayMeals, .planMeals: break
      }
    }
  }

  /// Hôm nay còn thiếu gì — đọc từ đúng các sổ sẽ ghi.
  private func loadGaps() async {
    var g = Gaps()
    if let s = services.makeSleepLogger(userId: userId) {
      await s.load()
      g.sleep = !s.hasNight
      s.close()
    }
    if let water = nutrition?.water {
      if !water.loaded { await water.load() }
      if water.totalMl == 0 {
        let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
        g.waterMl = DayCheckIn.waterPrefillMl(yesterdayMl: DayCheckIn.yesterdayWaterMl(water.week, today: today))
      }
    }
    let log = flow.makeManualLog()
    await log.load()
    g.workoutPlan = log.planOffer?.name
    // Hôm nay đã tập (hay không có kế hoạch): buổi người dùng kể là buổi PHÁT SINH
    // (19/10, chủ dự án) — vẫn hiện, hỏi rõ, ghi ở màn ghi buổi tập.
    g.trainedToday = log.planOffer == nil
    if let m = services.makeMealLogger(userId: userId, date: nil, mealType: nil) {
      await m.loadRecents()
      g.yesterday = m.yesterdayMeals
      var seen = Set<String>()
      recentFoodNames = (m.favorites + m.recents).map(\.name).filter { seen.insert($0.lowercased()).inserted }
      m.close()
    }
    // Kế hoạch ăn (19/10, chủ dự án: "đưa phần kế hoạch ăn vào áp dụng luôn"): kế
    // hoạch mới nhất có món; ngày 1 = thứ Hai. Chỉ các bữa hôm nay chưa ghi.
    if let today = await TodayMealPlan.load(services, userId: userId) {
      let open = today.openMeals
      if !open.isEmpty {
        g.planName = today.plan.name
        g.planMeals = open
        g.planKcal = open.flatMap(today.planned).reduce(0) { $0 + $1.kcal }
        planBook = today.book
      }
    }
    gaps = g
    // Hôm nay đã ăn bao nhiêu + mục tiêu: thẻ "Tổng sẽ ghi" nói "sau khi lưu: x / y".
    if let book = services.makeNutritionToday(userId: userId) {
      await book.load()
      let p = profile?.profile
      if case .ready(let tot) = book.phase {
        todayTargets = Targets(
          kcalNow: tot.kcal, proteinNow: tot.protein,
          kcal: NutritionToday.calorieTarget(p), protein: NutritionToday.macroTargets(p).protein)
      }
    }
    // 24/10 (mock "Ghi hôm nay" Kiệt duyệt): việc còn thiếu chỉ là CHIP gợi ý, không
    // tự thêm thẻ — trước đây điền sẵn mọi việc (19/10) làm người dùng phải ✕ bớt và
    // dễ ghi trùng điều vừa kể.
  }

  @State private var planBook: MealPlanBook?
  /// Tên món của chính người dùng (yêu thích + gần đây) — ngữ cảnh cho AI.
  @State private var recentFoodNames: [String] = []
  /// Hôm nay đã ăn / mục tiêu (cho thẻ "Tổng sẽ ghi").
  @State private var todayTargets = Targets()
  struct Targets {
    var kcalNow = 0.0, proteinNow = 0.0
    var kcal: Double?, protein: Double?
  }
  /// Câu AI đã đọc xong (không gọi lại cho cùng câu) và trạng thái "đang hiểu".
  @State private var understood = ""
  @State private var thinking = false

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
          } else if let kcal = f.shownKcal {
            Text(verbatim: "\(f.match?.name ?? f.spoken.name) · \(Int(kcal.rounded())) kcal")
              .font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          } else {
            Text("tellkoa.food.pick").font(DS.TextStyle.caption).foregroundStyle(DS.Color.metricOrange.swiftUI)
          }
        }
        Spacer(minLength: 0)
        Button {
          withAnimation(reduceMotion ? nil : .smooth(duration: 0.2)) { f.editing.toggle() }
        } label: {
          Text("logday.macros.edit").font(DS.TextStyle.caption.weight(.semibold))
            .padding(.horizontal, 10).frame(minHeight: 32)
            .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Capsule())
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(f.searching)
      }
      if f.editing {
        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) {
            macroField("kcal", $f.kcal)
            macroField(String(localized: "logday.macro.protein"), $f.protein)
            macroField(String(localized: "logday.macro.carbs"), $f.carbs)
            macroField(String(localized: "logday.macro.fat"), $f.fat)
          }
          Text(f.hasMacros && !f.macrosValid ? "logday.macros.invalid" : "logday.macros.perServing")
            .font(DS.TextStyle.caption)
            .foregroundStyle(f.hasMacros && !f.macrosValid ? DS.Color.destructive.swiftUI : DS.Color.mutedForeground.swiftUI)
        }
      }
    }
    if m.wrappedValue.needsScreen {
      Text("tellkoa.meal.later").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func macroField(_ label: String, _ value: Binding<String>) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: label).font(.system(size: 11, weight: .semibold)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      TextField("0", text: value)
        .keyboardType(.decimalPad)
        .font(.system(size: 15, weight: .semibold).monospacedDigit())
        .padding(.horizontal, 8).frame(minHeight: 36)
        .background(DS.Color.foreground.swiftUI.opacity(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityLabel(Text(verbatim: label))
    }
    .frame(maxWidth: .infinity)
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
    if parsed(.water) || adds.contains(.water) { parts.append(.water) }
    if parsed(.weight) { parts.append(.weight) }
    if workout != nil || adds.contains(.workout) { parts.append(.workout) }
    parts += meals.map { .meal($0.slot) }
    if adds.contains(.planMeals), !planMealsToLog.isEmpty { parts.append(.planMeals) }
    if adds.contains(.yesterdayMeals), meals.isEmpty { parts.append(.yesterdayMeals) }
    return parts.filter { !skipped.contains($0) }
  }

  /// Còn câu hỏi chưa trả lời thì chưa lưu được.
  private var unanswered: Bool {
    (result.doubts.contains(.mixedQuestion) && !confirmedQuestion)
      || (included.contains(.water) && waterMl == nil)
      || (included.contains(.sleep) && sleep?.askHoursOrClock != nil)
      || (included.contains(.weight) && weightKg == nil)
      || meals.contains { included.contains(.meal($0.slot)) && $0.foods.contains(where: \.searching) }
      || meals.contains { included.contains(.meal($0.slot)) && $0.foods.contains { $0.hasMacros && !$0.macrosValid } }
  }

  private var saveBar: some View {
    VStack(spacing: 6) {
      Button {
        Task { await save() }
      } label: {
        Group {
          if saving {
            ProgressView().tint(DS.Color.background.swiftUI)
          } else if thinking {
            // Nút Lưu chờ AI: quả cầu Intelligence + "Koa đang hiểu…".
            HStack(spacing: 8) {
              IntelligenceOrb(size: 20)
              Text("logday.understanding.short")
            }
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
      .disabled(saving || included.isEmpty || unanswered || dictation.isListening || thinking)
      .padding(.top, 2)
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
      case .yesterdayMeals: ok = await saveYesterday(online: online)
      case .planMeals: ok = await savePlan(online: online)
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
    // Buổi phát sinh: không bao giờ tự ghi — mở màn ghi buổi tập sau khi lưu.
    if gaps.trainedToday {
      workoutToPick = true
      return true
    }
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
    _ = matched
    for f in m.foods {
      if f.hasMacros {
        // Macro người dùng chỉnh: món khớp thì sửa số của nó, không thì món nhập tay.
        if let match = f.match, f.spoken.grams == nil {
          logger.add(match)
          guard let id = logger.items.last?.id,
            logger.edit(id, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat)
          else { return false }
        } else {
          guard logger.addCustom(name: f.spoken.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat)
          else { return false }
        }
      } else if let match = f.match, f.spoken.grams == nil {
        logger.add(match)
      } else {
        continue
      }
      if let id = logger.items.last?.id, f.spoken.servings != 1 { logger.setServings(id, f.spoken.servings) }
    }
    if case .queued = await logger.save(online: online) { return true }
    return false
  }

  private func saveYesterday(online: Bool) async -> Bool {
    guard let logger = services.makeMealLogger(userId: userId, date: nil, mealType: nil) else { return false }
    await logger.loadRecents()
    if case .queued = await logger.copyYesterday(online: online) { return true }
    return false
  }

  private func savePlan(online: Bool) async -> Bool {
    guard let book = planBook else { return false }
    let day = MealPlans.dayIndex(Date())
    for meal in planMealsToLog {
      if case .failed = await book.eat(meal: meal, day: day, online: online) { return false }
    }
    return true
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
        // Buổi theo lịch hôm nay ở Tập luyện, không form ghi riêng (Kiệt 22/10).
        followButton(String(localized: "tellkoa.done.logWorkout")) {
          dismiss()
          services.sessionRequest += 1
        }
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

  /// AI hiểu câu kể (19/10, chủ dự án: "Koa vẫn chưa đủ hiểu"): luật trên máy hiện
  /// ngay; khi người dùng ngừng gõ / nói, `ai-log-parse` đọc lại cả câu và kết quả
  /// của nó thay vào (nếu đọc được). Mất mạng / hết lượt / lỗi: giữ kết quả luật.
  // MARK: - Sửa một thẻ bằng lời (24/10, mock "Ghi hôm nay")

  /// Thẻ đang mở ô "sửa bằng lời", thẻ AI đang sửa, và lần sửa gần nhất (hoàn tác).
  @State private var correcting: Part?
  @State private var correction = ""
  @State private var fixing: Part?
  @State private var lastFix: Fix?
  @State private var fixMissed: Part?
  /// Lần gọi ASCND Intelligence gần nhất hỏng (quá tải, hết lượt…) — hiện thành dòng
  /// báo; thẻ khi ấy là bản đọc bằng luật trong máy.
  @State private var aiFailure: EdgeFunction.Failure?

  /// Ảnh chụp mọi bản sửa — hoàn tác trả về đúng như trước lần sửa.
  struct Snapshot {
    var sleep: SleepEdit?
    var waterMl: Int?
    var weightText: String
    var workout: SpokenLog.Workout?
    var meals: [MealEdit]
  }

  struct Fix {
    let part: Part
    let before: Snapshot
    /// "786 → 393 kcal", "2 Phở bò → 1 Phở bò, trứng"…
    let changes: [String]
  }

  private func snapshot() -> Snapshot {
    Snapshot(sleep: sleep, waterMl: waterMl, weightText: weightText, workout: workout, meals: meals)
  }

  private func restore(_ s: Snapshot) {
    sleep = s.sleep
    waterMl = s.waterMl
    weightText = s.weightText
    workout = s.workout
    meals = s.meals
  }

  private func fixable(_ p: Part) -> Bool {
    switch p {
    case .sleep, .water, .weight, .workout, .meal: true
    default: false
    }
  }

  /// "✦ Koa đã sửa" / các dòng trước → sau / Hoàn tác — xếp dọc để vừa cả ô hẹp
  /// hai cột (24/10: chữ bị cắt khi đặt cạnh nhau).
  private func fixSummary(_ fix: Fix) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Label {
        Text("logday.fix.done").font(.system(size: 13, weight: .semibold))
      } icon: {
        Image(systemName: "sparkles").foregroundStyle(IntelligenceTones.violet)
      }
      ForEach(fix.changes, id: \.self) { c in
        Text(verbatim: c).font(.system(size: 13).monospacedDigit()).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      Button {
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.25)) {
          restore(fix.before)
          lastFix = nil
        }
      } label: {
        Label(String(localized: "logday.fix.undo"), systemImage: "arrow.uturn.backward")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
  }

  /// Một câu tả thẻ như người dùng nói — ghép với câu sửa rồi đọc lại.
  private func describe(_ p: Part) -> String {
    switch p {
    case .sleep:
      guard let s = sleep else { return "" }
      return String(localized: "logday.desc.sleep \(Self.hhmm(s.bed)) \(Self.hhmm(s.wake))")
    case .water:
      return String(localized: "logday.desc.water \(SpokenLogDisplay.water(waterMl ?? 0, unit: .ml))")
    case .weight:
      return String(localized: "logday.desc.weight \("\(weightText) \(weightUnit == .lbs ? "lb" : "kg")")")
    case .workout:
      return workout.map { SpokenLogDisplay.workout($0, lang: lang) } ?? (gaps.workoutPlan ?? "")
    case .meal(let slot):
      guard let m = meals.first(where: { $0.slot == slot }) else { return "" }
      let foods = m.foods.map { SpokenLogDisplay.food($0.spoken, lang: lang) }.joined(separator: ", ")
      return "\(SpokenLogDisplay.slot(slot, lang: lang)): \(foods)"
    default:
      return ""
    }
  }

  /// Giá trị so trước / sau của một thẻ ("786 kcal · 2 Phở bò").
  private func shown(_ p: Part) -> String {
    switch p {
    case .meal(let slot):
      guard let m = meals.first(where: { $0.slot == slot }) else { return "" }
      return m.foods.map { SpokenLogDisplay.food($0.spoken, lang: lang) }.joined(separator: ", ")
    default:
      return bigValue(p).big
    }
  }

  /// Ghép câu tả thẻ + câu sửa → đọc lại (AI khi có mạng, luật khi không) → chỉ
  /// thay ĐÚNG thẻ ấy; ghi lại trước / sau để hiện "Koa đã sửa" và hoàn tác.
  private func correct(_ part: Part) async {
    let ask = correction.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ask.isEmpty, fixing == nil else { return }
    let before = snapshot()
    let oldShown = shown(part)
    let oldKcal = mealKcal(part)
    fixing = part
    fixMissed = nil
    defer { fixing = nil }
    let hour = Calendar.current.component(.hour, from: Date())
    let combined = "\(describe(part)). \(String(localized: "logday.desc.correct")) \(ask)"
    var r: SpokenLog.Result?
    if services.sync.online, let edge = services.edge {
      let body: [String: JSONValue] = ["text": .string(combined), "hour": .number(Double(hour)), "context": aiContext]
      do throws(EdgeFunction.Failure) {
        if let reply = try await edge.call(.logParse, body: body) { r = SpokenLog.fromAI(reply, hour: hour) }
        aiFailure = nil
      } catch {
        aiFailure = error
      }
    }
    // Không mạng / AI không trả: đọc câu sửa bằng luật, có từ khoá của thẻ đứng
    // trước ("6 cốc" → "nước 6 cốc") — câu cụt một mình luật không nhận ra.
    if r == nil || !(r.map { replaces(part, from: $0) } ?? false) {
      let plain = SpokenLog.parse(ask, hour: hour, weightUnit: weightUnit)
      r = replaces(part, from: plain) ? plain : SpokenLog.parse("\(keyword(part)) \(ask)", hour: hour, weightUnit: weightUnit)
    }
    guard let r, replaces(part, from: r) else {
      fixMissed = part
      return
    }
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { applyOnly(part, from: r) }
    // Món mới khớp xong mới biết kcal — so sau khi khớp, không hiện "→ 0 kcal".
    await matchFoods()
    var changes: [String] = []
    let newShown = shown(part)
    if newShown != oldShown { changes.append("\(oldShown) → \(newShown)") }
    if let a = oldKcal, let b = mealKcal(part), b > 0, Int(a.rounded()) != Int(b.rounded()) {
      changes.append("\(Int(a.rounded())) → \(Int(b.rounded())) kcal")
    }
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) {
      lastFix = Fix(part: part, before: before, changes: changes)
      correcting = nil
      correction = ""
    }
  }

  private func keyword(_ p: Part) -> String {
    switch p {
    case .water: String(localized: "logday.kw.water")
    case .sleep: String(localized: "logday.kw.sleep")
    case .weight: String(localized: "logday.kw.weight")
    case .workout: String(localized: "logday.kw.workout")
    case .meal(let slot): "\(SpokenLogDisplay.slot(slot, lang: lang)) \(String(localized: "logday.kw.ate"))"
    default: ""
    }
  }

  private func mealKcal(_ p: Part) -> Double? {
    guard case .meal(let slot) = p, let m = meals.first(where: { $0.slot == slot }) else { return nil }
    return m.foods.reduce(0.0) { $0 + ($1.shownKcal ?? 0) }
  }

  /// Kết quả đọc có mục cùng loại với thẻ không.
  private func replaces(_ p: Part, from r: SpokenLog.Result) -> Bool {
    r.items.contains { item in
      switch (item, p) {
      case (.sleep, .sleep), (.water, .water), (.weight, .weight), (.workout, .workout), (.meal, .meal): true
      default: false
      }
    }
  }

  /// Chỉ thay thẻ `p` bằng mục cùng loại trong `r` (bữa: giữ đúng bữa đang sửa).
  private func applyOnly(_ p: Part, from r: SpokenLog.Result) {
    for item in r.items {
      switch (item, p) {
      case (.sleep(let s), .sleep):
        let wake = s.wake ?? sleep?.wake ?? SleepLog.Clock.defaultWake
        let bed = s.bed ?? s.minutes.map { Self.clock(wake, minus: $0) } ?? sleep?.bed ?? SleepLog.Clock.defaultBed
        sleep = SleepEdit(bed: bed, wake: wake, askHoursOrClock: nil, askHalf: false)
        return
      case (.water(let ml), .water):
        waterMl = ml
        return
      case (.weight(let kg), .weight):
        let v = weightUnit == .lbs ? kg / 0.45359237 : kg
        weightText = v.formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "en_US_POSIX")))
        return
      case (.workout(let w), .workout):
        workout = w
        return
      case (.meal(let m), .meal(let slot)):
        guard let i = meals.firstIndex(where: { $0.slot == slot }) else { return }
        let old = meals[i].foods
        meals[i].foods = m.foods.map { f in old.first { $0.spoken == f } ?? FoodEdit(spoken: f) }
        return
      default:
        continue
      }
    }
  }

  private func understand() async {
    let asked = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard asked.count >= 6, asked != understood, !dictation.isListening, services.sync.online,
      let edge = services.edge
    else { return }
    try? await Task.sleep(for: .milliseconds(450))
    guard !Task.isCancelled else { return }
    thinking = true
    defer { thinking = false }
    let hour = Calendar.current.component(.hour, from: Date())
    let body: [String: JSONValue] = ["text": .string(asked), "hour": .number(Double(hour)), "context": aiContext]
    let reply: JSONValue?
    do throws(EdgeFunction.Failure) {
      reply = try await edge.call(.logParse, body: body)
      aiFailure = nil
    } catch {
      // AI quá tải / lỗi: thẻ vẫn là bản đọc bằng luật — nói rõ để người dùng kiểm lại.
      if !Task.isCancelled { aiFailure = error }
      return
    }
    guard !Task.isCancelled, text.trimmingCharacters(in: .whitespacesAndNewlines) == asked,
      let reply, let r = SpokenLog.fromAI(reply, hour: hour)
    else { return }
    understood = asked
    // Câu tắt: thêm đúng mục điền sẵn ("ăn như hôm qua" → bữa hôm qua…).
    for s in r.shortcuts {
      switch s {
      case .mealsLikeYesterday where !gaps.yesterday.isEmpty: add(.yesterdayMeals)
      case .mealsAsPlanned where !gaps.planMeals.isEmpty: add(.planMeals)
      case .workoutAsPlanned where gaps.workoutPlan != nil: add(.workout)
      default: break
      }
    }
    // AI không thấy gì mà luật thấy: giữ luật (không xoá điều người dùng vừa thấy).
    guard !r.items.isEmpty || result.items.isEmpty else { return }
    apply(r)
  }

  /// Ngữ cảnh của chính người dùng gửi kèm câu kể (19/10, chủ dự án: "áp dụng AI để
  /// suy đoán câu chat tốt hơn"): món hay ăn (sửa lỗi gõ / thiếu dấu về đúng tên
  /// món của họ), kế hoạch ăn / tập hôm nay, giờ ngủ quen, đơn vị cân.
  private var aiContext: JSONValue {
    let day = MealPlans.dayIndex(Date())
    let plan = (planBook?.items ?? []).filter { $0.day == day }.map { JSONValue.string($0.name) }
    var o: [String: JSONValue] = [
      "recentFoods": .array(recentFoodNames.prefix(40).map(JSONValue.string)),
      "planToday": .array(Array(plan.prefix(20))),
      "usualSleep": .object([
        "bed": .string(Self.hhmm(SleepLog.Clock.defaultBed)), "wake": .string(Self.hhmm(SleepLog.Clock.defaultWake)),
      ]),
      "weightUnit": .string(weightUnit == .lbs ? "lb" : "kg"),
    ]
    if let w = gaps.workoutPlan { o["workoutPlan"] = .string(w) }
    return .object(o)
  }

  private func reparse() {
    let hour = Calendar.current.component(.hour, from: Date())
    let r = SpokenLog.parse(text, hour: hour, weightUnit: weightUnit)
    // Câu vừa được AI đọc thì giữ kết quả AI.
    guard r != result, text.trimmingCharacters(in: .whitespacesAndNewlines) != understood else { return }
    apply(r)
  }

  private func apply(_ r: SpokenLog.Result) {
    guard r != result else { return }
    result = r
    // Câu kể đổi → đọc lại từ đầu: lần sửa bằng lời cũ không còn để hoàn tác.
    lastFix = nil
    correcting = nil
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
    // Chip "+ Ngủ như thường lệ" vẫn giữ khi câu kể không nói gì về giấc ngủ.
    if sleep == nil, adds.contains(.sleep) {
      sleep = SleepEdit(bed: .defaultBed, wake: .defaultWake, askHoursOrClock: nil, askHalf: false)
    }
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
      if let match, meals[i].foods[j].spoken.grams == nil, !meals[i].foods[j].hasMacros {
        meals[i].foods[j].prefill(from: match)
      }
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
    case .yesterdayMeals: String(localized: "meal.yesterday.title")
    case .planMeals: String(localized: "logday.plan.title")
    }
  }

  static func glyph(_ p: Part) -> String {
    switch p {
    case .sleep: TodayDayCard.glyph(.sleep)
    case .water: TodayDayCard.glyph(.water)
    case .weight: "scalemass.fill"
    case .workout: TodayDayCard.glyph(.workout)
    case .meal, .yesterdayMeals, .planMeals: TodayDayCard.glyph(.meal)
    }
  }

  static func color(_ p: Part) -> Color {
    switch p {
    case .sleep: TodayDayCard.color(.sleep)
    case .water: TodayDayCard.color(.water)
    case .weight: DS.Color.foreground.swiftUI.opacity(0.7)
    case .workout: TodayDayCard.color(.workout)
    case .meal, .yesterdayMeals, .planMeals: TodayDayCard.color(.meal)
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
