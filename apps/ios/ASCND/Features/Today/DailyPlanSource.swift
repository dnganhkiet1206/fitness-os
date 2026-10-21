import ASCNDCore
import Foundation
import Observation

/// Việc chính của hôm nay cho MỘT phiên (#527 GĐ1): dựng đầu vào từ kế hoạch
/// thật (`WorkoutFlow`), Gains, phục hồi và đạm; chạy `DailyPlan.decide`; đẩy kết
/// quả lên `AppServices.dailyPlan` để widget và lời nhắc đọc CÙNG kết quả với
/// Today — không có ba cách chọn hành động riêng.
@MainActor @Observable
final class DailyPlanSource {
  let userId: String
  private(set) var result = DailyPlan.Result(action: .loading, reason: .none)
  private(set) var input: DailyPlan.Input?

  @ObservationIgnored private var recovery: DailyPlan.Recovery?
  @ObservationIgnored private var proteinLeftG: Int?
  @ObservationIgnored private var dataDate: LocalDate?

  init(userId: String) {
    self.userId = userId
  }

  /// Đọc lại phục hồi + đạm (mở Today, kéo làm mới, ghi bữa / ngủ xong).
  func reloadData(services: AppServices, profile: Profile?, flow: WorkoutFlow) async {
    let date = flow.today.today
    let data = await services.loadDailyPlanData(userId: userId, date: date, profile: profile)
    recovery = data.recovery
    proteinLeftG = data.proteinLeftG
    dataDate = date
    recompute(services: services, flow: flow)
  }

  /// Dựng lại kết quả từ thứ đang có (kế hoạch / buổi / Gains vừa đổi).
  func recompute(services: AppServices, flow: WorkoutFlow) {
    let today = flow.today
    let date = today.today
    let library = today.plan == nil ? nil : today.library
    // Buổi đang dở: đã tick, chưa chốt, của hôm nay.
    let active: WorkoutTemplate? = flow.session.flatMap { s in
      guard s.phase == .active, s.plan.date == date, let id = s.plan.templateId else { return nil }
      return library?.templates.first { $0.id == id }
    }
    // Buổi đã ghi hôm nay; buổi vừa chốt ở máy này mà server chưa trả về cũng tính.
    var done = today.templatesDoneToday
    if let s = flow.session, s.plan.date == date, case .finished(let id) = s.phase,
      !today.sessionIdsToday.contains(id.lowercased())
    {
      let local = s.plan.templateId?.lowercased()
      // Server chưa trả buổi nào hôm nay: `templatesDoneToday` chỉ là giả định — thay
      // bằng buổi thật vừa chốt. Server đã có buổi khác: cộng thêm buổi này.
      done = today.sessionIdsToday.isEmpty ? [local] : done + [local]
    }
    let gains = services.koaGainsNow.flatMap { $0.userId == userId ? $0 : nil }
    let daysOff = gains.map { g -> Int in
      // `missedDays` đếm cả hôm nay khi hôm nay chưa tập và không phải ngày nghỉ;
      // "quay lại" chỉ tính các ngày TRƯỚC hôm nay.
      let todayCounted = done.isEmpty && !(library.map { KoaGains.Week($0).isRest(date) } ?? false)
      return max(0, g.state.missedDays - (todayCounted ? 1 : 0))
    }
    let input = DailyPlan.input(
      date: date, library: library, active: active, doneToday: done, daysOff: daysOff,
      recovery: dataDate == date ? recovery : nil, proteinLeftG: dataDate == date ? proteinLeftG : nil)
    self.input = input
    let result = DailyPlan.decide(input)
    let changed = result != self.result || services.dailyPlan?.date != date
    if result != self.result { self.result = result }
    services.dailyPlan = (userId, date, result)
    if changed { services.dailyPlanChanged() }
  }
}
