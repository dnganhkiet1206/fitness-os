/// Dựng đầu vào của Daily Plan từ những gì app đã có (#527 GĐ1) — thuần, để
/// Today, widget và lời nhắc đọc CÙNG một kết quả từ cùng một chỗ dựng.
extension DailyPlan {
  /// Số ngày nhìn tới để tìm buổi kế tiếp.
  public static let lookAhead = 7

  public static func session(_ t: WorkoutTemplate) -> Session {
    Session(
      templateId: t.id, name: t.name,
      minutes: TemplateDraft.estimatedMinutes(t.exercises.map { ($0.sets, $0.reps, $0.restSeconds) }))
  }

  /// - Parameters:
  ///   - library: kế hoạch đã áp đổi lịch và lệnh chưa gửi; `nil` = chưa đọc xong.
  ///   - active: mẫu của buổi đang tập dở (đã tick, chưa chốt).
  ///   - doneToday: mẫu của các buổi đã ghi hôm nay (`nil` = buổi tự do).
  ///   - daysOff: `KoaGains.State.missedDays`; `nil` = chưa đọc (coi 0, không đoán quay lại).
  public static func input(
    date: LocalDate, library: TemplateSnapshot?, active: WorkoutTemplate?, doneToday: [String?], daysOff: Int?,
    recovery: Recovery?, proteinLeftG: Int?
  ) -> Input {
    guard let library else {
      return Input(date: date, loaded: false, hasSchedule: false, today: .empty)
    }
    let plan = library.plan(for: date, today: date)
    let today: Day =
      if let t = plan.template { .planned([session(t)]) } else if plan.status == .rest { .rest } else { .empty }
    let ahead = (1...lookAhead).map { date.adding(days: $0) }
    let next = ahead.lazy.compactMap { d in library.plan(for: d, today: date).template.map { Upcoming(date: d, session: session($0)) } }
      .first
    return Input(
      date: date, loaded: true, inProgress: active.map(session),
      hasSchedule: !KoaGains.Week(library).planned.isEmpty || next != nil || plan.template != nil,
      today: today, doneToday: doneToday, daysOff: daysOff ?? 0, recovery: recovery, proteinLeftG: proteinLeftG,
      next: next, canReschedule: library.overridesSupported,
      postponeTo: library.overridesSupported ? Reschedule.target(from: date, in: library) : nil)
  }
}
