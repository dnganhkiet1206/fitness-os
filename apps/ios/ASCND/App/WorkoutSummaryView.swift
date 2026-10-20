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

  /// Phần Gains của buổi hôm nay: lịch sử KHÔNG có hôm nay → có hôm nay (không
  /// đếm trùng dù Hôm nay đã đọc lại lịch sử gồm buổi này).
  struct GainsGain {
    let before: KoaGains.State
    let after: KoaGains.State
    let planned: Bool
    let pr: Bool
    let fullWeek: Bool
    var delta: Int { after.points - before.points }
    var raw: Int {
      (planned ? KoaGains.plannedSession : KoaGains.offPlanSession) + (pr ? KoaGains.personalRecord : 0)
        + (fullWeek ? KoaGains.fullWeek : 0)
    }
  }

  private var gains: GainsGain? {
    guard let h = services?.koaGainsHistory else { return nil }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let past = h.days.filter { $0.date != today }
    let todayPR = summary.prDetected || h.days.contains { $0.date == today && $0.personalRecord }
    let before = KoaGains.compute(past, week: h.week, today: today)
    let after = KoaGains.compute(past + [.init(date: today, personalRecord: todayPR)], week: h.week, today: today)
    // tuần đủ buổi đạt đúng hôm nay?
    let monday = today.adding(days: -WorkoutPlanning.routineIndex(today))
    let thisWeek = Set(past.map(\.date).filter { $0 >= monday && $0 < today })
    return GainsGain(
      before: before, after: after, planned: h.week.planned.contains(WorkoutPlanning.routineIndex(today)), pr: todayPR,
      fullWeek: thisWeek.count < h.week.target && thisWeek.count + 1 >= h.week.target)
  }

  private func gainsCard(_ g: GainsGain) -> some View {
    let lang = AppPreferences.Lang(rawValue: String(locale.identifier.prefix(2))) ?? .vi
    let rankUp = g.after.rank > g.before.rank
    let rank = MascotRules.ranks[min(g.after.rank, MascotRules.ranks.count - 1)]
    var parts: [String] = [
      g.planned
        ? String(localized: "koa.gains.part.planned \(KoaGains.plannedSession)")
        : String(localized: "koa.gains.part.offPlan \(KoaGains.offPlanSession)"),
    ]
    if g.pr { parts.append(String(localized: "koa.gains.part.pr \(KoaGains.personalRecord)")) }
    if g.fullWeek { parts.append(String(localized: "koa.gains.part.week \(KoaGains.fullWeek)")) }
    if g.delta > g.raw { parts.append(String(localized: "koa.gains.part.memory")) }
    let next = KoaGains.toNext(g.after.points)
    return DSCard {
      VStack(spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: .proud, size: 132, animated: false, build: g.after.rank)
          .frame(height: 150)
          .accessibilityHidden(true)
        Text(
          rankUp
            ? String(localized: "koa.gains.newRank \(rank.name(lang))")
            : String(localized: "koa.gains.pump \(g.delta)")
        )
        .font(.system(size: 22, weight: .heavy))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(verbatim: parts.joined(separator: " · "))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
        if let next {
          ProgressView(value: Double(next.have), total: Double(next.need))
            .tint(Color(hex: rank.colorHex))
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

        DSCard {
          HStack(spacing: DS.Spacing.md) {
            DSStatTile(
              label: String(localized: "summary.volume"),
              // `Math.round(displayWeight(volume)).toLocaleString()` (`day-plan.tsx:1653`).
              value: unit.volume(Double(summary.volumeKg)).formatted(.number.locale(.app)),
              unit: unit.label
            )
            DSStatTile(
              label: String(localized: "summary.sets"),
              value: "\(summary.completedSets)"
            )
            DSStatTile(
              label: String(localized: "summary.exercises"),
              value: "\(summary.exerciseCount)"
            )
          }
        }
        .accessibilityElement(children: .combine)
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
          .padding(.top, DS.Spacing.md)
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(summary.templateName))
    .ascndPage()
  }

  private func setLabel(_ s: SummarySet) -> String {
    if let secs = s.durationSec, secs > 0 {
      return "\(secs)s"
    }
    if let w = s.weightKg, w > 0 {
      // Một chữ số lẻ theo đơn vị (RN `displayWeight`), dấu thập phân của máy.
      return "\(unit.localizedLoad(w) ?? "") × \(s.reps)"
    }
    return "× \(s.reps)"
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
#endif
