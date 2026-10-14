/// Trang gốc tab Tập luyện (#527, thiết kế lại 14/10 — chủ dự án duyệt mock):
/// dải tuần trên thẻ hôm nay và trạng thái của thẻ — `today-training.tsx` @
/// fac9ac2 (`WeekStrip` + bốn trạng thái), cộng trạng thái "đang tập dở" của
/// native (màn tập là một lớp mở ra, thoát ra vẫn giữ tiến độ).
public enum WorkoutHome {
  /// Một ô của dải tuần (Thứ Hai → Chủ nhật).
  public struct WeekDay: Sendable, Hashable, Identifiable {
    public let date: LocalDate
    public let status: DayStatus
    public let isToday: Bool
    public var id: LocalDate { date }
  }

  /// Bảy ngày của tuần chứa `today`, trạng thái theo đúng luật kế hoạch
  /// (`TemplateSnapshot.plan`). Chưa đọc được lịch → mọi ngày `unplanned`
  /// trừ ngày đã tập.
  public static func week(today: LocalDate, library: TemplateSnapshot?, trained: Set<LocalDate>) -> [WeekDay] {
    WeekPlanning.weekDates(today: today, offset: 0).map { d in
      let status = library?.plan(for: d, today: today, trained: trained).status
        ?? (trained.contains(d) ? .done : .unplanned)
      return WeekDay(date: d, status: status, isToday: d == today)
    }
  }

  /// Thẻ hôm nay.
  public enum Hero: Sendable, Hashable {
    /// Chưa đọc xong lịch: không đoán.
    case loading
    /// Có buổi, chưa chạm set nào.
    case start
    /// Đã tick ít nhất một set, chưa chốt.
    case inProgress(done: Int, total: Int)
    /// Đã tập hôm nay (chốt ở đây hoặc ở máy khác).
    case done
    /// Ngày nghỉ.
    case rest
    /// Chưa có kế hoạch.
    case pick
  }

  /// `cta` của `TodayRules` là luật gốc; phiên đang mở chỉ thêm "đang tập dở"
  /// (đã tick mà chưa chốt) và "đã chốt" (phiên vừa chốt trong ngày).
  public static func hero(
    cta: TodayCta, phase: WorkoutSessionController.Phase?, progress: (done: Int, total: Int)
  ) -> Hero {
    switch phase {
    case .active?: return .inProgress(done: progress.done, total: progress.total)
    case .finished?: return .done
    default: break
    }
    switch cta {
    case .none: return .loading
    case .start: return .start
    case .extra: return .done
    case .logFree: return .rest
    case .pick: return .pick
    }
  }

  /// Set đã làm / tổng (không tính set khởi động — cùng cách đếm của màn tóm tắt).
  public static func setProgress(_ rows: [PlannedSet], done: [String: Bool]) -> (done: Int, total: Int) {
    let work = rows.filter { !$0.warmup }
    return (work.filter { done[$0.key] == true }.count, work.count)
  }

  /// Bài của buổi theo thứ tự xuất hiện, kèm số set làm việc và reps của set
  /// đầu ("3 × 10") — danh sách trên thẻ hôm nay.
  public struct Line: Sendable, Hashable, Identifiable {
    public let name: String
    public let sets: Int
    public let reps: Int
    /// Nghỉ của set đầu (giây) — cho số phút ước tính.
    public let rest: Int
    public var id: String { name }
  }

  public static func lines(_ rows: [PlannedSet]) -> [Line] {
    var order: [String] = []
    var sets: [String: Int] = [:]
    var reps: [String: Int] = [:]
    var rest: [String: Int] = [:]
    for r in rows where !r.warmup {
      if sets[r.exerciseName] == nil {
        order.append(r.exerciseName)
        reps[r.exerciseName] = r.reps
        rest[r.exerciseName] = r.plannedRest
      }
      sets[r.exerciseName, default: 0] += 1
    }
    return order.map { Line(name: $0, sets: sets[$0] ?? 0, reps: reps[$0] ?? 0, rest: rest[$0] ?? 0) }
  }

  /// Số phút ước tính của buổi (`estimatedMinutes`, như thẻ ở Hôm nay).
  public static func minutes(_ lines: [Line]) -> Int {
    TemplateDraft.estimatedMinutes(lines.map { ($0.sets, $0.reps, $0.rest) })
  }
}
