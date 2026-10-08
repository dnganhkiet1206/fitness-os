public import Foundation

/// Đọc dữ liệu cho hai widget và dựng payload — phần dữ liệu của
/// `usePushWidgetData` (RN) cộng `useDailyLog` / `useDailyStreak`, cùng truy vấn.
///
/// Khác RN có chủ đích: RN đẩy payload cả khi truy vấn chưa về / hỏng (chuỗi 0
/// ngày, "chưa có buổi tập") rồi đẩy lại khi có số. Widget không có "lần sau
/// trong giây lát": số sai nằm trên màn hình chính tới lần app mở kế. Ở đây
/// đọc hỏng thì KHÔNG ghi (`nil`) — widget giữ số đúng gần nhất. Riêng bảng
/// đóng băng được phép hỏng (bảng tới sau migration), như RN.
public enum WidgetSync {
  public struct Reads: Sendable {
    public let todaySessions, todayLog, streakDays, freezes: RowQuery
  }

  public static func queries(userId: String, today: LocalDate, in tz: TimeZone) -> Reads {
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let day = DailyLog.dayRange(today, in: tz)
    return Reads(
      todaySessions: RowQuery(
        table: "workout_sessions", columns: "template_name, sets",
        filters: [me, .gte("date_time", .string(day.start)), .lt("date_time", .string(day.end))],
        order: .init(column: "date_time", ascending: false)),
      todayLog: RowQuery(
        table: "daily_logs", columns: "readiness_score", filters: [me, .eq("date", .string(today.description))],
        mode: .maybeSingle),
      streakDays: RowQuery(
        table: "daily_logs", columns: "date", filters: [me, .or(Streak.loggedDayFilter)],
        order: .init(column: "date", ascending: false), limit: Streak.window),
      freezes: RowQuery(table: "streak_freezes", columns: "used_on", filters: [me]))
  }

  public struct Payloads: Sendable, Hashable {
    public let today: TodayWorkoutWidgetData
    public let streak: StreakReadinessWidgetData
  }

  /// `nil` khi một nguồn bắt buộc đọc hỏng — không ghi gì.
  public static func payloads(
    userId: String, store: any RowStore, copy: HomeWidgets.Copy, now: EpochMillis, in tz: TimeZone
  ) async -> Payloads? {
    let today = LocalDate(now, in: tz)
    let r = queries(userId: userId, today: today, in: tz)
    guard let sessions = try? await store.select(r.todaySessions),
      let log = try? await store.select(r.todayLog),
      let days = try? await store.select(r.streakDays)
    else { return nil }
    let frozenRows = (try? await store.select(r.freezes)) ?? []
    let frozen = frozenRows.compactMap { $0["used_on"]?.stringValue }.filter { !$0.isEmpty }
    let streak = Streak.from(days.compactMap { $0["date"]?.stringValue }, today: today.description, frozen: frozen)
    return Payloads(
      today: HomeWidgets.todayWorkout(sessions: sessions, copy: copy),
      streak: HomeWidgets.streakReadiness(streak: streak.count, readinessScore: log.first?["readiness_score"], copy: copy))
  }
}
