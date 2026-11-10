// Màn tóm tắt sau buổi tập — C sở hữu UI (#248, #279).
//
// SEAM cho A (#279): nhận `WorkoutSummary` THẬT do
// `WorkoutSessionController.finish()` trả về, KHÔNG tự tính lại từ
// `[PlannedSet] + DayProgress`.
//  - Số trên màn (volume, số set, số bài) = đúng `volume_load` gửi lên
//    server (Int, đã bỏ khởi động) — lấy từ `summary`, không gọi
//    `WorkoutMath` trong View (lệch làm tròn với `Math.round` baseline).
//  - Danh sách chi tiết lấy từ `sets` (A8 dựng từ bản ghi đã chốt).
//  - Fixture độc lập cho Preview (không cần controller thật).
#if canImport(SwiftUI)
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một set đã làm, để hiển thị — A8 (#272) dựng từ bản ghi đã chốt.
public struct SummarySet: Hashable, Sendable {
  public let exerciseName: String
  public let weightKg: Double?
  public let reps: Int
  public let durationSec: Int?
  public let warmup: Bool

  public init(
    exerciseName: String,
    weightKg: Double? = nil,
    reps: Int,
    durationSec: Int? = nil,
    warmup: Bool = false
  ) {
    self.exerciseName = exerciseName
    self.weightKg = weightKg
    self.reps = reps
    self.durationSec = durationSec
    self.warmup = warmup
  }
}

public struct WorkoutSummaryView: View {
  /// Tổng hợp thật từ `finish()` — số trên màn = số lên server.
  let summary: WorkoutSummary
  /// Chi tiết từng set đã làm (kể cả khởi động, hiện mờ).
  let sets: [SummarySet]
  /// Về Today — A8 nối navigation thật (#305).
  var onDone: (() -> Void)?
  /// Chia sẻ buổi lên cộng đồng (`CommunityShareWorkoutScreen`); `nil` = không có nút.
  var onShare: (() -> Void)?
  /// Đơn vị tạ của tài khoản (#527 1.9-A) — số lưu vẫn là kg.
  @Environment(\.weightUnit) private var unit
  /// Gains của Koa (#527 đợt 1): lịch sử tập đã đọc ở Hôm nay.
  @Environment(AppServices.self) private var services: AppServices?
  /// Phân tích bài tập — buổi này có tăng tải so với lần trước không (#527 phần 4).
  @Environment(WorkoutFlow.self) private var flow: WorkoutFlow?
  @Environment(\.locale) private var locale

  public init(
    summary: WorkoutSummary,
    sets: [SummarySet],
    onDone: (() -> Void)? = nil,
    onShare: (() -> Void)? = nil
  ) {
    self.summary = summary
    self.sets = sets
    self.onDone = onDone
    self.onShare = onShare
  }

  /// Buổi đã gửi `gains_earned` trong lần mở app này.
  @MainActor private static var reported: Set<Int64> = []
  /// Chữ thật cho cảnh xong buổi: tên buổi, ba ô số của buổi (khối lượng theo đơn vị tài khoản), Gains vừa nhận.
  /// Không có thời lượng buổi trong `WorkoutSummary`, nên ô "thời gian" của mock thành số bài.
  static func reactionContent(_ summary: WorkoutSummary, gains: GainsGain?, unit: WeightUnit, locale: Locale)
    -> KoaReaction.Content
  {
    let lang = AppPreferences.Lang(rawValue: String(locale.identifier.prefix(2))) ?? .vi
    let g = gains.flatMap { g -> KoaReaction.Content.Gains? in
      guard !g.repeatSession, !g.overtrained, g.delta > 0 else { return nil }
      let sub = KoaGains.toNext(g.after.points).map { next in
        let nextRank = MascotRules.ranks[min(g.after.rank + 1, MascotRules.ranks.count - 1)]
        return String(localized: "koa.gains.toRank \(next.need - next.have) \(nextRank.name(lang))")
      }
      return .init(title: String(localized: "koa.reaction.gains \(g.delta)"), subtitle: sub)
    }
    return KoaReaction.Content(
      title: String(localized: "koa.reaction.done"), subtitle: summary.templateName,
      stats: [
        .init(value: Double(unit.volume(Double(summary.volumeKg))), unit: unit.label,
              label: String(localized: "koa.reaction.volume")),
        .init(value: Double(summary.completedSets), unit: "", label: String(localized: "koa.reaction.sets")),
        .init(value: Double(summary.exerciseCount), unit: "", label: String(localized: "koa.reaction.exercises")),
      ],
      gains: g)
  }

  /// Phần Gains của buổi hôm nay: lịch sử KHÔNG có hôm nay → có hôm nay (không
  /// đếm trùng dù Hôm nay đã đọc lại lịch sử gồm buổi này).
  struct GainsGain {
    let before: KoaGains.State
    let after: KoaGains.State
    let planned: Bool
    let pr: Bool
    let overload: Bool
    let fullWeek: Bool
    /// Ngày tập liền thứ mấy (gồm hôm nay); quá `maxActiveStreak` thì buổi không có Gains.
    let streak: Int
    /// Hôm nay đã có buổi trước: buổi này không có thưởng.
    var repeatSession = false
    var overtrained: Bool { streak > KoaGains.maxActiveStreak }
    var delta: Int { after.points - before.points }
    var raw: Int {
      (planned ? KoaGains.plannedSession : KoaGains.offPlanSession) + (pr ? KoaGains.personalRecord : 0)
        + (overload ? KoaGains.overload : 0) + (fullWeek ? KoaGains.fullWeek : 0)
    }
  }

  private var gains: GainsGain? { Self.gains(summary, services: services, flow: flow) }

  static func gains(_ summary: WorkoutSummary, services: AppServices?, flow: WorkoutFlow?) -> GainsGain? {
    guard let h = services?.koaGainsHistory else { return nil }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    if KoaGains.hasEarlierSession(h.days, on: today, before: summary.dateTime) {
      let state = KoaGains.compute(h.days, week: h.week, today: today)
      return GainsGain(
        before: state, after: state, planned: false, pr: false, overload: false, fullWeek: false, streak: 0,
        repeatSession: true)
    }
    let past = h.days.filter { $0.date != today }
    let todayPR = summary.prDetected || h.days.contains { $0.date == today && $0.personalRecord }
    let todayOverload = h.days.contains { $0.date == today && $0.overload }
      || (flow?.insights).map { OverloadQuest.achieved(on: today, $0.performances) } ?? false
    let todayDay = KoaGains.Day(date: today, personalRecord: todayPR, overload: todayOverload)
    let before = KoaGains.compute(past, week: h.week, today: today)
    let after = KoaGains.compute(past + [todayDay], week: h.week, today: today)
    // từng phần đọc từ chính phép tính Gains: tính cả ngày đổi lịch và loại buổi
    let b = KoaGains.breakdown(past + [todayDay], week: h.week, on: today) ?? .init()
    return GainsGain(
      before: before, after: after, planned: b.planned, pr: b.personalRecord, overload: b.overload,
      fullWeek: b.fullWeek, streak: b.streak)
  }

  private func gainsCard(_ g: GainsGain) -> some View {
    KoaGainsCard(g: g)
      .onAppear {
        // một lần mỗi buổi: thẻ hiện lại khi cuộn hay quay về thì không đếm thêm
        guard Self.reported.insert(summary.dateTime.millis).inserted else { return }
        Telemetry.capture(
          .gainsEarned,
          [
            "delta": String(g.delta), "planned": String(g.planned), "pr": String(g.pr),
            "rank_up": String(g.after.rank > g.before.rank),
          ])
      }
  }

  private var exerciseGroups: [(name: String, rows: [SummarySet])] {
    var order: [String] = []
    var groups: [String: [SummarySet]] = [:]
    for s in sets {
      if groups[s.exerciseName] == nil { order.append(s.exerciseName) }
      groups[s.exerciseName, default: []].append(s)
    }
    return order.map { (name: $0, rows: groups[$0] ?? []) }
  }

  public var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        if let gains { gainsCard(gains) }
        // PR section — chỉ hiện khi model báo có (#305).
        // Không tự detect PR; prDetected=false → ẩn section.
        if summary.prDetected {
          DSCard {
            HStack(spacing: DS.Spacing.sm) {
              Image(systemName: "trophy.fill")
                .foregroundStyle(DS.Color.readinessYellow.swiftUI)
                .accessibilityHidden(true)
              Text(String(localized: "summary.pr"))
                .font(DS.TextStyle.headline)
                .foregroundStyle(DS.Color.foreground.swiftUI)
            }
          }
          .accessibilityElement(children: .combine)
          .accessibilityLabel(Text(String(localized: "summary.pr")))
        }

        // Kiệt 03/11: điều người tập muốn thấy là mức tạ của TỪNG bài so với lần trước;
        // tổng khối lượng cộng lại thành số rất lớn, dễ nhầm, nên chỉ là dòng phụ.
        if let compare { compareCard(compare) }
        Text(
          String(
            format: String(localized: "summary.stats.line"),
            unit.volume(Double(summary.volumeKg)).formatted(.number.locale(.app)), unit.label, summary.completedSets,
            summary.exerciseCount)
        )
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel(
          Text(
            String(
              format: String(localized: "summary.stats.accessibility"),
              unit.volume(Double(summary.volumeKg)), unit.label, summary.completedSets, summary.exerciseCount
            )
          )
        )

        // Empty: chưa có set nào (#305).
        if sets.isEmpty {
          DSEmptyState(
            systemImage: "list.bullet.clipboard",
            title: String(localized: "summary.empty.title"),
            message: String(localized: "summary.empty.message")
          )
        } else {
          ForEach(exerciseGroups, id: \.name) { group in
            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              DSSectionHeader(group.name)
              ForEach(group.rows, id: \.self) { s in
                HStack {
                  Text(setLabel(s))
                    .font(DS.TextStyle.body.monospacedDigit())
                    .foregroundStyle(DS.Color.foreground.swiftUI)
                  Spacer()
                  if s.warmup {
                    Text(String(localized: "summary.warmup"))
                      .font(DS.TextStyle.caption)
                      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  }
                }
                .opacity(s.warmup ? 0.5 : 1)
                .accessibilityElement(children: .combine)
                // Dữ liệu ghép, không phải câu dịch: `verbatim`, không tra
                // xcstrings bằng khoá "%@, %@".
                .accessibilityLabel(Text(verbatim: "\(group.name), \(setLabel(s))"))
              }
            }
          }
        }

        if let onShare {
          DSButton(String(localized: "summary.share"), style: .secondary, action: onShare)
            .padding(.top, DS.Spacing.md)
        }

        // CTA về Today (#305).
        if let onDone {
          DSButton(
            String(localized: "summary.backToToday"),
            style: .primary,
            action: onDone
          )
          .accessibilityIdentifier("summary.backToToday")
          .padding(.top, DS.Spacing.md)
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(summary.templateName))
    .ascndPage()
    .task { await services?.ensureKoaGainsHistory() }

  }

  /// Mỗi bài của buổi so với các buổi trước (`ExerciseCompare.session`); `nil` khi phân tích
  /// bài tập chưa tải.
  private var compare: [ExerciseCompare.Item]? {
    guard let insights = flow?.insights, insights.loaded else { return nil }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let items = exerciseGroups.compactMap { g in
      ExerciseCompare.session(
        name: g.name,
        sets: g.rows.filter { !$0.warmup }.map { .init(kg: $0.weightKg ?? 0, reps: $0.reps, seconds: $0.durationSec) },
        date: today, previous: insights.history(for: g.name), since: summary.dateTime)
    }
    return items.isEmpty ? nil : items
  }

  private func compareCard(_ items: [ExerciseCompare.Item]) -> some View {
    let text = ExerciseCompareText(unit: unit, locale: locale)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: ExerciseCompare.headline(items) == nil ? .pumped : .victory, size: 44, animated: false,
                         build: services?.koaBuild ?? 0)
          .accessibilityHidden(true)
        Text(verbatim: koaLine(items, text))
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      Text("summary.compare.title")
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      ForEach(items) { item in
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: item.name).font(DS.TextStyle.body.weight(.semibold))
            Text(verbatim: text.previousLine(item))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer(minLength: DS.Spacing.sm)
          VStack(alignment: .trailing, spacing: 4) {
            Text(verbatim: text.value(item.last, item.metric))
              .font(DS.TextStyle.body.weight(.bold))
              .monospacedDigit()
            ExerciseDeltaChip(delta: item.delta, text: text)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("summary.compare.\(item.key)")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard()
    .accessibilityIdentifier("summary.compare")
  }

  /// Câu của Koa: điều đáng nói nhất của buổi, bằng chính con số của bài ấy.
  private func koaLine(_ items: [ExerciseCompare.Item], _ text: ExerciseCompareText) -> String {
    if let top = ExerciseCompare.headline(items) {
      switch top.delta {
      case .weight: return String(localized: "summary.koa.weight \(top.name) \(text.chip(top.delta))")
      case .reps(let n): return String(localized: "summary.koa.reps \(top.name) \(n)")
      default: return String(localized: "summary.koa.time \(top.name)")
      }
    }
    if items.allSatisfy({ $0.delta == .first }) { return String(localized: "summary.koa.first") }
    if let held = items.first(where: { $0.delta == .same }), let next = ExerciseCompare.next(held) {
      return String(localized: "summary.koa.held \(held.name) \(text.next(next))")
    }
    return String(localized: "summary.koa.steady")
  }

  private func setLabel(_ s: SummarySet) -> String {
    if let secs = s.durationSec, secs > 0 {
      return "\(secs)s"
    }
    if let w = s.weightKg, w > 0 {
      // Một chữ số lẻ theo đơn vị (RN `displayWeight`), dấu thập phân của máy.
      return "\(unit.localizedLoad(w) ?? "") × \(s.reps)"
    }
    // Không tạ: "10 reps" như dòng "Set vừa xong" của màn tập — trước đây
    // là "× 10", dấu nhân không có vế trước (audit vòng 4, 26/10).
    return s.reps == 1 ? String(localized: "xi.reps.one") : String(localized: "xi.reps.other \(s.reps)")
  }
}

// MARK: - Fixture độc lập (không cần controller thật)

extension WorkoutSummaryView {
  static let sampleSummary = WorkoutSummary(
    sessionId: "preview-1",
    dateTime: EpochMillis(1_728_000_000_000),
    templateName: "Ngực – Vai – Tay",
    completedSets: 4,
    warmupSets: 1,
    holdSets: 1,
    exerciseCount: 2,
    volumeKg: 1340,
    sessionRpe: 8,
    prDetected: false
  )

  /// Fixture có PR (#305).
  static let prSummary = WorkoutSummary(
    sessionId: "preview-pr",
    dateTime: EpochMillis(1_728_000_000_000),
    templateName: "Ngực – Vai – Tay",
    completedSets: 5,
    warmupSets: 1,
    holdSets: 0,
    exerciseCount: 2,
    volumeKg: 1520,
    sessionRpe: 9,
    prDetected: true
  )

  /// Fixture rỗng (#305).
  static let emptySummary = WorkoutSummary(
    sessionId: "preview-empty",
    dateTime: EpochMillis(1_728_000_000_000),
    templateName: "Ngực – Vai – Tay",
    completedSets: 0,
    warmupSets: 0,
    holdSets: 0,
    exerciseCount: 0,
    volumeKg: 0,
    sessionRpe: 0,
    prDetected: false
  )

  static let sampleSets: [SummarySet] = [
    SummarySet(exerciseName: "Bench Press", weightKg: 40, reps: 8, warmup: true),
    SummarySet(exerciseName: "Bench Press", weightKg: 60, reps: 8),
    SummarySet(exerciseName: "Bench Press", weightKg: 60, reps: 8),
    SummarySet(exerciseName: "Bench Press", weightKg: 62.5, reps: 6),
    SummarySet(exerciseName: "Plank", reps: 0, durationSec: 45),
  ]
}

#Preview("Light") {
  NavigationStack {
    WorkoutSummaryView(summary: WorkoutSummaryView.sampleSummary, sets: WorkoutSummaryView.sampleSets)
  }
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  NavigationStack {
    WorkoutSummaryView(summary: WorkoutSummaryView.sampleSummary, sets: WorkoutSummaryView.sampleSets)
  }
  .preferredColorScheme(.dark)
}

#Preview("PR detected") {
  NavigationStack {
    WorkoutSummaryView(summary: WorkoutSummaryView.prSummary, sets: WorkoutSummaryView.sampleSets) {}
  }
  .preferredColorScheme(.light)
}

#Preview("Empty") {
  NavigationStack {
    WorkoutSummaryView(summary: WorkoutSummaryView.emptySummary, sets: []) {}
  }
  .preferredColorScheme(.light)
}

#Preview("Dynamic Type XXL") {
  NavigationStack {
    WorkoutSummaryView(summary: WorkoutSummaryView.sampleSummary, sets: WorkoutSummaryView.sampleSets) {}
  }
  .dynamicTypeSize(.accessibility3)
}
/// Thẻ Gains của màn tổng kết buổi tập (#527 đợt 1), tách khỏi `WorkoutSummaryView` để snapshot
/// test dựng thẳng (#795). Đo lường `gains_earned` ở lại màn tổng kết.
struct KoaGainsCard: View {
  let g: WorkoutSummaryView.GainsGain
  @Environment(\.locale) private var locale
  /// 22 pt ở cỡ chữ mặc định, lớn theo Dynamic Type (#795: ảnh chữ lớn cho thấy tiêu đề đứng yên).
  @ScaledMetric(relativeTo: .title2) private var titleSize: CGFloat = 22

  var body: some View {
    let lang = AppPreferences.Lang(rawValue: String(locale.identifier.prefix(2))) ?? .vi
    let rankUp = g.after.rank > g.before.rank
    let rank = MascotRules.ranks[min(g.after.rank, MascotRules.ranks.count - 1)]
    let next = KoaGains.toNext(g.after.points)
    DSCard {
      VStack(spacing: DS.Spacing.sm) {
        // xong buổi (05/11, Kiệt): lên hạng thì hét chiến thắng, còn lại tự hào
        MascotFigureView(emotion: rankUp ? .victory : .pumped, size: 132, animated: false, build: g.after.rank)
          .frame(height: 150)
          .accessibilityHidden(true)
        Text(
          g.repeatSession
            ? String(localized: "koa.gains.second")
            : g.overtrained
            ? String(localized: "koa.gains.restNeeded \(g.streak)")
            : rankUp
              ? String(localized: "koa.gains.newRank \(rank.name(lang))")
              : String(localized: "koa.gains.pump \(g.delta)")
        )
        .font(.system(size: titleSize, weight: .heavy))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
        // Quá ngày tập liền (29/10, Kiệt): nói vì sao không có Gains thay cho bảng cộng.
        Text(
          verbatim: g.repeatSession
            ? String(localized: "koa.gains.secondWhy")
            : g.overtrained ? String(localized: "koa.gains.restWhy") : parts.joined(separator: " · "))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
        if let next {
          ProgressView(value: Double(next.have), total: Double(next.need))
            .tint(Color.rank(rank))
            .accessibilityHidden(true)
          let nextRank = MascotRules.ranks[min(g.after.rank + 1, MascotRules.ranks.count - 1)]
          Text(String(localized: "koa.gains.toRank \(next.need - next.have) \(nextRank.name(lang))"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          Text(String(localized: "koa.gains.max"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .frame(maxWidth: .infinity)
    }
    .accessibilityElement(children: .combine)
  }

  /// Bảng cộng của buổi: "+10 buổi trong lịch · kỷ lục +4 · …".
  private var parts: [String] {
    var parts: [String] = [
      g.planned
        ? String(localized: "koa.gains.part.planned \(KoaGains.plannedSession)")
        : String(localized: "koa.gains.part.offPlan \(KoaGains.offPlanSession)"),
    ]
    if g.pr { parts.append(String(localized: "koa.gains.part.pr \(KoaGains.personalRecord)")) }
    if g.overload { parts.append(String(localized: "koa.gains.part.overload \(KoaGains.overload)")) }
    if g.fullWeek { parts.append(String(localized: "koa.gains.part.week \(KoaGains.fullWeek)")) }
    if g.delta > g.raw { parts.append(String(localized: "koa.gains.part.memory")) }
    return parts
  }
}

#endif

#if canImport(SwiftUI)
/// Koa ăn mừng toàn màn hình ngay khi bấm xong buổi, TRƯỚC màn tổng kết (storyboard xong buổi, Kiệt duyệt 07/11).
/// Phủ trên màn tập; hết cảnh hay chạm thì `onEnd` mở màn tổng kết. Số trên cảnh = số của màn tổng kết.
struct WorkoutDoneReaction: View {
  let summary: WorkoutSummary
  let onEnd: () -> Void
  @Environment(\.weightUnit) private var unit
  @Environment(AppServices.self) private var services: AppServices?
  @Environment(WorkoutFlow.self) private var flow: WorkoutFlow?
  @Environment(\.locale) private var locale

  var body: some View {
    KoaReactionView(
      scene: .done,
      content: WorkoutSummaryView.reactionContent(
        summary, gains: WorkoutSummaryView.gains(summary, services: services, flow: flow), unit: unit, locale: locale),
      onEnd: onEnd)
      .task { await services?.ensureKoaGainsHistory() }
  }
}
#endif
