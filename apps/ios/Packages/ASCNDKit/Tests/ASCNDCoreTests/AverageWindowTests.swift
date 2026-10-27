@testable import ASCNDCore
import Foundation
import Testing

/// Kiệt 27/10: MỌI trung bình 7 ngày bỏ hôm nay (ngày chưa xong). Một bộ số liệu đi qua
/// từng màn — Insight, Nước, Vận động, Dinh dưỡng 7 ngày, Giấc ngủ, Tiến bộ, tổng kết tuần —
/// và mọi màn phải ra cùng khung, cùng trung bình.
struct AverageWindowTests {
  /// Thứ Ba 27/10/2026. Khung: 20/10 … 26/10.
  static let today = LocalDate("2026-10-27")!
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  @Test func windowIsTheSevenDaysBeforeToday() {
    let days = AverageWindow.days(before: Self.today)
    #expect(days.map(\.description) == [
      "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26",
    ])
    #expect(AverageWindow.first(before: Self.today) == days.first && AverageWindow.last(before: Self.today) == days.last)
    #expect(!AverageWindow.contains(Self.today, before: Self.today))
    #expect(!AverageWindow.contains(LocalDate("2026-10-19")!, before: Self.today))
    #expect(AverageWindow.dateFilters(before: Self.today) == [
      .gte("date", .string("2026-10-20")), .lt("date", .string("2026-10-27")),
    ])
  }

  @Test func averageCountsOnlyLoggedDaysInTheWindow() {
    let a = AverageWindow.average(
      [(LocalDate("2026-10-19")!, 1000), (LocalDate("2026-10-20")!, 100), (LocalDate("2026-10-20")!, 100),
       (LocalDate("2026-10-23")!, 0), (LocalDate("2026-10-26")!, 400), (Self.today, 5)],
      before: Self.today)
    #expect(a == .init(value: 300, days: 2))
    #expect(AverageWindow.average([(Self.today, 5)], before: Self.today) == nil)
  }

  /// `daily_logs` của 9 ngày: một ngày ngoài khung (19/10), sáu ngày trong khung có số,
  /// và hôm nay (buổi sáng: số nhỏ) — hôm nay và 19/10 không được vào trung bình nào.
  static let logs: [(date: String, steps: Double, protein: Double, water: Double, kcal: Double)] = [
    ("2026-10-19", 50_000, 500, 9000, 9000),
    ("2026-10-20", 8000, 120, 2000, 2000),
    ("2026-10-21", 10_000, 100, 2400, 2200),
    ("2026-10-22", 0, 0, 0, 0),
    ("2026-10-23", 6000, 140, 1600, 1800),
    ("2026-10-24", 9000, 110, 2200, 2400),
    ("2026-10-25", 7000, 130, 1800, 2100),
    ("2026-10-26", 8000, 120, 2000, 2000),
    ("2026-10-27", 300, 10, 250, 300),
  ]
  static var rows: [JSONValue] {
    logs.map {
      .object([
        "date": .string($0.date), "steps": .number($0.steps), "protein_g": .number($0.protein),
        "water_ml": .number($0.water), "kcal": .number($0.kcal),
      ])
    }
  }
  /// Trung bình mong đợi: 6 ngày có số (22/10 trống).
  static let steps = 48_000.0 / 6
  static let protein = 720.0 / 6
  static let water = 12_000.0 / 6
  static let kcal = 12_500.0 / 6

  @Test func everyScreenAveragesTheSameDays() throws {
    let today = Self.today
    let days = Self.logs.map { LocalDate($0.date)! }

    // Insight (Hôm nay).
    let insight = InsightHighlight.week(Self.rows, today: today)
    #expect(insight.steps == .init(value: Self.steps, days: 6))
    #expect(insight.proteinG == .init(value: Self.protein, days: 6))
    #expect(insight.waterMl == .init(value: Self.water, days: 6))

    // Tiến bộ (thẻ + chi tiết).
    let window = ProgressStatus.window(today)
    #expect(window == AverageWindow.days(before: today))
    let stepsResult = ProgressStatus.steps(
      ProgressStatus.column(Self.rows, "steps", days: window), goal: 10_000,
      today: ProgressStatus.column(Self.rows, "steps", days: [today])[0])
    #expect(stepsResult.average == Self.steps && stepsResult.have == 6 && stepsResult.today == 300)
    #expect(ProgressStatus.nutrition(ProgressStatus.column(Self.rows, "protein_g", days: window), target: 140).average
      == Self.protein)
    let progressWater = ProgressStatus.column(Self.rows, "water_ml", days: window).compactMap { $0 }
    #expect(Water.loggedAverage(progressWater)?.ml == Self.water)

    // Màn Nước (sổ nước: hàng `water_logs`, hai lần uống một ngày).
    let water = zip(Self.logs, days).flatMap { l, d in
      [WaterRow(id: "\(d)-a", date: d, amountMl: Int(l.water / 2)), WaterRow(id: "\(d)-b", date: d, amountMl: Int(l.water / 2))]
    }
    #expect(Water.windowAverage(water, today: today) == .init(value: Self.water, days: 6))
    #expect(Water.weekStart(today) <= AverageWindow.first(before: today), "đọc đủ khung")

    // Vận động.
    #expect(Steps.stats(Steps.history(Self.rows), today: today).avg == JS.round(Self.steps))

    // Dinh dưỡng 7 ngày (chia cho ngày có hàng, như RN — ngày 22/10 có hàng 0).
    let nutrition = NutritionInsights.averaged(NutritionInsights.rows(Self.rows), today: today)
    #expect(nutrition.map(\.date) == AverageWindow.days(before: today))
    #expect(NutritionInsights.avgKcal(nutrition) == 12_500.0 / 7)

    // Tổng kết tuần (tuần đang chạy, Thứ Hai 26/10): trung bình chỉ có Thứ Hai, không có hôm nay.
    let week = WeeklyReview.summarize(
      WeeklyReview.Input(
        dailyLogs: Self.rows.filter { ($0["date"]?.stringValue ?? "") >= "2026-10-26" }, workouts: [], sleepLogs: [],
        prevLogs: [], volumeHistory: [], profile: nil),
      weekStart: LocalDate("2026-10-26")!, in: Self.tz, copy: try ReadinessCardGoldenTests.copy(), today: today)
    #expect(week.avgKcal == 2000 && week.avgProtein == 120 && week.avgWaterMl == 2000)
  }

  /// Giấc ngủ: đêm dậy sáng nay ở danh sách nhưng không vào trung bình; đọc từ nửa đêm
  /// ngày đầu khung.
  @Test func sleepUsesTheWakeDayInTheWindow() {
    func night(_ id: String, wake: String, minutes: Double) -> SleepInsights.Night? {
      SleepInsights.night(.object([
        "id": .string(id), "waketime": .string(wake), "asleep_min": .number(minutes),
      ]))
    }
    let nights = [
      night("a", wake: "2026-10-20T06:30:00+07:00", minutes: 420),
      night("b", wake: "2026-10-26T07:00:00+07:00", minutes: 480),
      night("today", wake: "2026-10-27T06:00:00+07:00", minutes: 240),
    ].compactMap { $0 }
    let kept = SleepInsights.inWindow(nights, today: Self.today, in: Self.tz)
    #expect(kept.map(\.id) == ["a", "b"])
    #expect(SleepInsights.stats(kept, targetHours: 8)?.avgTotal == 7.5)
    // 10:00 sáng nay: "bây giờ − 7 ngày" là 10:00 ngày 20 — đêm dậy 6:30 ngày 20 sẽ bị lỡ.
    let now = EpochMillis(Date(timeIntervalSince1970: 1_793_070_000))  // 2026-10-27T10:00+07:00
    let q = SleepInsights.query(userId: "u", now: now, in: Self.tz)
    #expect(q.filters.contains(.gte("waketime", .string(DailyLog.dayRange(LocalDate("2026-10-20")!, in: Self.tz).start))))
  }
}
