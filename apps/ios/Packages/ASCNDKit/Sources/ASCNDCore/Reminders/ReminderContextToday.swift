public import Foundation

extension ReminderContext {
  /// "Hôm nay đã biết gì" cho kế hoạch nhắc nhở — các vị từ của `useReminders`
  /// (`hooks/use-reminders.ts`), từ những gì phiên native đã đọc.
  ///
  /// Như RN, một nguồn CHƯA ĐỌC (`nil`) không phải "đã xong":
  /// - `workedOutToday`: có buổi trong ngày địa phương hôm nay;
  /// - `trainingDays`: ngày có template và không phải ngày nghỉ
  ///   (`filter(d => d.template_id && !d.is_rest)`); lịch chưa đọc → `nil`;
  /// - `supplementsDone`: `(supplements ?? []).every(s => s.taken)` — chưa đọc
  ///   hay rỗng là `true` (không có gì phải uống), đúng như RN;
  /// - `waterDone`: `(waterMl ?? 0) >= (Number(water_target_ml) || 2500)`.
  ///
  /// Các khoá native chưa có nguồn (cân, bữa ăn, sinh trắc, ngủ, thử thách cộng
  /// đồng) giữ giá trị của RN khi truy vấn chưa về: `false` / `[]` — lời nhắc
  /// vẫn được đặt, không bị bỏ vì một việc chưa biết là đã làm.
  public static func today(
    _ today: LocalDate, trained: Set<LocalDate>, routine: [RoutineDay]?, waterTotalMl: Int?,
    waterTargetMl: Double?, supplements: [Supplement]?, library: TemplateSnapshot? = nil
  ) -> ReminderContext {
    var ctx = ReminderContext()
    ctx.workedOutToday = trained.contains(today)
    ctx.trainingDays = routine.map { days in
      days.filter { day in !(day.templateId ?? "").isEmpty && !day.isRest }.map(\.dayOfWeek)
    }
    // Lịch đã áp đổi lịch theo ngày (GĐ1) — CÙNG lịch Today / Daily Plan đọc: ngày
    // đổi thành nghỉ không nhắc tập, ngày nhận buổi dời tới thì nhắc.
    ctx.plannedByOffset = library.map { lib in
      Dictionary(uniqueKeysWithValues: (0...6).map { ($0, lib.isPlanned(today.adding(days: $0))) })
    }
    ctx.supplementsDone = (supplements ?? []).allSatisfy(\.taken)
    ctx.waterDone = Double(waterTotalMl ?? 0) >= Water.target(waterTargetMl)
    return ctx
  }
}
