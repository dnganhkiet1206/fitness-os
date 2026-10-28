import Foundation
@testable import ASCNDCore
import Testing

/// Khối "ngày" của tab Hôm nay (#527): ống và việc kế tiếp đọc từ cùng tín hiệu.
struct TodayDayTests {
  /// Tài khoản mới: năm ống rỗng, đúng thứ tự thiết kế.
  @Test func emptyDay() {
    let t = TodayDay.tubes(DailySignals(), stepsGoal: 10_000)
    #expect(t.map(\.quest) == [.sleep, .meal, .water, .workout, .steps])
    #expect(t.allSatisfy { $0.fill == 0 && !$0.done })
    #expect(TodayDay.tubes(nil, stepsGoal: 10_000).allSatisfy { $0.fill == 0 })
  }

  /// Ngủ xong (7h40), 0,8 / 2,5 L nước, 4.120 bước: ống ngủ đầy, nước 32 %, bước 41 %.
  @Test func partialFills() {
    let s = DailySignals(sleepMinutes: 460, steps: 4120, hasSleepRow: true, waterMl: 800, waterTargetMl: 2500)
    let t = TodayDay.tubes(s, stepsGoal: 10_000)
    #expect(t[0].fill == 1 && t[0].done && t[0].amount == 460)
    #expect(t[1].fill == 0)
    #expect(abs(t[2].fill - 0.32) < 1e-9 && !t[2].done && t[2].amount == 800)
    #expect(t[3].fill == 0)
    #expect(abs(t[4].fill - 0.412) < 1e-9)
  }

  /// Vượt mục tiêu thì ống đầy, không tràn; mục tiêu nước trống → 2.500.
  @Test func cappedAndDefaultTarget() {
    let s = DailySignals(steps: 25_000, waterMl: 3000)
    let t = TodayDay.tubes(s, stepsGoal: 10_000)
    #expect(t[2].fill == 1 && t[2].done)
    #expect(t[4].fill == 1 && t[4].done)
    #expect(TodayDay.waterTarget(s) == 2500)
  }

  /// Ngày cho Koa dùng luật "xong" của nhiệm vụ: có hàng ngủ mà 0 phút vẫn là đã ngủ;
  /// bữa = có kcal.
  @Test func mascotDayFollowsQuestRules() {
    let s = DailySignals(kcal: 640, workoutCount: 0, sleepMinutes: 0, hasSleepRow: true, waterMl: 1250, waterTargetMl: 2500)
    let d = TodayDay.mascotDay(s, hour: 12)
    #expect(d.sleepMin == 1)
    #expect(d.meals == 1)
    #expect(d.waterPct == 50)
    #expect(d.workouts == 0)
    #expect(d.hour == 12)
    #expect(TodayDay.mascotDay(nil, hour: 9).sleepMin == nil)
    #expect(MascotLine.line(TodayDay.mascotDay(nil, hour: 9)) == .silent)
  }

  /// 12:00, đã ngủ, chưa ăn: Koa ghi nhận giấc ngủ rồi hỏi bữa — ống "Next" là bữa.
  @Test func nextIsMealAtNoon() {
    let s = DailySignals(sleepMinutes: 460, hasSleepRow: true)
    let line = MascotLine.line(TodayDay.mascotDay(s, hour: 12))
    #expect(line == .notice(win: .sleep, gap: .meal))
    #expect(line.gap.map(TodayDay.quest) == .meal)
  }

  @Test func coinsPerSignal() {
    #expect(TodayDay.order.map(TodayDay.coins) == [8, 10, 8, 35, 8])
  }

  /// Lần uống còn trong outbox: ống nước và việc "xong" đọc tổng cục bộ; số
  /// server lớn hơn (máy khác vừa ghi) thì giữ số server; chưa có ngày → nil.
  @Test func localWaterCountsBeforeSync() {
    let server = DailySignals(waterMl: 500)
    let merged = TodayDay.merging(server, localWaterMl: 2_750)
    #expect(merged?.waterMl == 2_750)
    #expect(TodayDay.tubes(merged, stepsGoal: 10_000).first { $0.quest == .water }?.done == true)
    #expect(TodayDay.merging(server, localWaterMl: 250)?.waterMl == 500)
    #expect(TodayDay.merging(server, localWaterMl: nil)?.waterMl == 500)
    #expect(TodayDay.merging(nil, localWaterMl: 250) == nil)
  }

  /// Giấc / bữa ghi lúc mất mạng (còn trong hàng chờ) là "xong" ngay — audit 28/10:
  /// thẻ Giấc ngủ vẫn "Chưa ghi" tới khi đồng bộ. Hàng của hôm qua / người khác không tính.
  @Test func pendingSleepAndMealCountBeforeSync() {
    let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let today = LocalDate("2026-10-28")!
    func sleep(_ id: String, user: String = "u1", bed: String, wake: String) -> OutboxEntry {
      SleepLog.entry(
        id: id, userId: user,
        row: ["user_id": .string(user), "bedtime": .string(bed), "waketime": .string(wake), "quality": .number(6),
              "deep_min": .number(0), "rem_min": .number(0), "light_min": .number(0)],
        createdAt: EpochMillis(0))
    }
    let item = MealLog.Item(id: "i", foodItemId: nil, name: "Phở", servings: 1, kcal: 450, protein: 20, carbs: 60, fat: 10, fiber: 2)
    let entries = [
      // 23:00 → 07:00 giờ Hà Nội, thức dậy hôm nay: 480 phút.
      sleep("s1", bed: "2026-10-27T16:00:00.000Z", wake: "2026-10-28T00:00:00.000Z"),
      // Thức dậy hôm qua: không tính.
      sleep("s0", bed: "2026-10-26T16:00:00.000Z", wake: "2026-10-27T00:00:00.000Z"),
      // Của người khác: không tính.
      sleep("sx", user: "u2", bed: "2026-10-27T15:00:00.000Z", wake: "2026-10-28T01:00:00.000Z"),
      MealLog.entry(
        id: "m1", itemIds: ["i1"], userId: "u1", mealType: "lunch", dateTime: "2026-10-28T05:00:00.000Z", items: [item],
        createdAt: EpochMillis(0)),
    ]
    let p = TodayDay.pending(entries, userId: "u1", today: today, in: hanoi)
    #expect(p.sleepMinutes == 480)
    #expect(p.mealKcal == 450)
    let merged = TodayDay.merging(DailySignals(), localWaterMl: nil, pending: p)
    #expect(merged?.done(.sleep, stepsGoal: 10_000) == true)
    #expect(merged?.done(.meal, stepsGoal: 10_000) == true)
    #expect(merged?.sleepMinutes == 480)
    // Không có gì chờ: giữ nguyên số server.
    let empty = TodayDay.pending([], userId: "u1", today: today, in: hanoi)
    #expect(TodayDay.merging(DailySignals(kcal: 300), localWaterMl: nil, pending: empty) == DailySignals(kcal: 300))
  }

  /// Cân không còn là việc mỗi ngày: chỉ hỏi khi đã 7 ngày chưa cân, chưa cân
  /// lần nào, hoặc hôm nay vừa cân (giữ dấu tích).
  @Test func weighInRowOnlyAfterSevenDays() {
    let today = LocalDate("2026-10-17")!
    #expect(TodayDay.showsWeighIn(lastWeighIn: nil, today: today))
    #expect(TodayDay.showsWeighIn(lastWeighIn: today, today: today))
    #expect(!TodayDay.showsWeighIn(lastWeighIn: today.adding(days: -1), today: today))
    #expect(!TodayDay.showsWeighIn(lastWeighIn: today.adding(days: -6), today: today))
    #expect(TodayDay.showsWeighIn(lastWeighIn: today.adding(days: -7), today: today))
    #expect(TodayDay.showsWeighIn(lastWeighIn: today.adding(days: -40), today: today))
    // Ngày cân "ở tương lai" (máy khác múi giờ): không hỏi.
    #expect(!TodayDay.showsWeighIn(lastWeighIn: today.adding(days: 1), today: today))
  }
}
