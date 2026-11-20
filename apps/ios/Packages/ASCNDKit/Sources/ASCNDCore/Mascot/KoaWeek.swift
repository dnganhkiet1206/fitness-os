public import Foundation
public import Observation

/// "Tuần của Koa" (#527 GĐ2, Kiệt duyệt 21/10 `docs/design/mocks/gd2-progress-koa-week.html`)
/// — thay 8 thử thách tuần chung.
///
/// - Đích = số buổi trong lịch tuần của CHÍNH người này (`KoaGains.Week.target`) —
///   cùng con số Gains dùng để cộng +15 khi đủ tuần, nên "đủ tuần" ở đây và ở Gains
///   là MỘT sự kiện. Người mới (onboarding 2–3 buổi) có đích 2–3.
/// - Đã tập = số NGÀY trong tuần (T2 → CN) có buổi ghi thật — không dựa vào việc mở màn.
/// - Ngày nghỉ đã đặt không tính; lỡ một buổi không mất các buổi đã tập; dời buổi
///   (GĐ1) vẫn tính vì đếm theo ngày có buổi ghi.
/// - Đủ tuần: +15 Gains (đã có trong `KoaGains`) và +50 xu, nhận MỘT lần mỗi tuần
///   qua `ch:silver:<tuần>:koa_week` — server định giá theo bậc `silver` và bỏ trùng
///   theo `ref_key`; không cần migration.
public enum KoaWeek {
  public static let rewardTier = "silver"
  public static let rewardCoins = 50
  public static let key = "koa_week"

  public struct Day: Sendable, Hashable {
    public let date: LocalDate
    public let planned: Bool
    public let rest: Bool
    public let trained: Bool
  }

  public struct State: Sendable, Hashable {
    public let weekStart: LocalDate
    public let days: [Day]
    public let target: Int
    /// Số ngày có buổi ghi thật trong tuần.
    public let done: Int
    public var complete: Bool { done >= target }
    public var refKey: String { KoaWeek.refKey(weekStart) }
  }

  public static func refKey(_ weekStart: LocalDate) -> String {
    MascotRules.challengeRefKey(tier: rewardTier, weekStart: weekStart.description, key: key)
  }

  /// `nil` khi chưa đọc được lịch hay lịch không có buổi nào (chưa có tuần để đếm).
  /// Ngày tạm nghỉ (`KoaPauseLog`, cả đợt đã qua) không tính vào đích: tuần có nghỉ thì đích nhỏ lại theo.
  public static func state(
    today: LocalDate, library: TemplateSnapshot?, trained: Set<LocalDate>,
    paused: (LocalDate) -> Bool = { _ in false }
  ) -> State? {
    guard let library else { return nil }
    let week = KoaGains.Week(library)
    guard !week.planned.isEmpty || !library.overrides.isEmpty else { return nil }
    let start = WeeklyChallenges.weekStart(today)
    let days = days(weekStart: start, today: today, library: library, trained: trained)
    let pausedPlanned = days.filter { $0.planned && !$0.trained && paused($0.date) }.count
    let target = max(0, week.target - pausedPlanned)
    guard target > 0, days.contains(where: \.planned) || days.contains(where: \.trained) else { return nil }
    return State(weekStart: start, days: days, target: target, done: days.filter(\.trained).count)
  }
}

extension KoaWeek {
  /// Bảy ngày Thứ Hai → Chủ nhật của một tuần bất kỳ theo lịch đã áp (vòng ngày ở
  /// màn Tổng kết tuần). Cùng `plan(for:)` với `state` nên tuần này hai nơi giống nhau.
  public static func days(
    weekStart: LocalDate, today: LocalDate, library: TemplateSnapshot, trained: Set<LocalDate>
  ) -> [Day] {
    (0..<7).map { o -> Day in
      let d = weekStart.adding(days: o)
      let p = library.plan(for: d, today: today)
      return Day(date: d, planned: p.template != nil, rest: p.status == .rest, trained: trained.contains(d))
    }
  }

  /// Tổng kết một tuần theo lịch (GĐ2, mở đầu màn Tổng kết tuần): buổi đã tập / đích,
  /// buổi dời, ngày nghỉ người dùng tự chọn, Gains kiếm trong tuần. Cùng lịch đã áp
  /// và cùng lịch sử với Gains — không có con số thứ hai.
  public struct Summary: Sendable, Hashable {
    public let target: Int
    public let done: Int
    public let moved: Int
    public let chosenRest: Int
    public let gains: Int
  }

  /// Luật chung của mọi màn tuần (KOA-T22):
  /// - Đích = số buổi theo lịch gốc của tuần (`KoaGains.Week.target`) TRỪ ngày Tạm nghỉ chưa tập —
  ///   cùng một phép tính với `state`, nên Hôm nay, phòng Koa và Tổng kết tuần cùng một con số.
  /// - Dời buổi KHÔNG đổi đích. Buổi dời sang tuần khác được tính ở tuần có buổi tập thật (tập ngày
  ///   nào thì "đã tập" thuộc tuần ấy); `moved` chỉ đếm buổi dời VÀO tuần này.
  /// - "Đã tập" = ngày có buổi ghi thật trong lịch sử truyền vào (Hôm nay: 14 ngày gần nhất của
  ///   `TodayController` — đủ phủ trọn tuần trước từ mọi ngày trong tuần; Tổng kết: lịch sử Gains).
  public static func summary(
    weekStart: LocalDate, today: LocalDate, library: TemplateSnapshot, history: [KoaGains.Day],
    paused: (LocalDate) -> Bool = { _ in false }
  ) -> Summary {
    let end = weekStart.adding(days: 6)
    let week = KoaGains.Week(library)
    let inWeek = library.overrides.filter { $0.date >= weekStart && $0.date <= end }
    let trained = Set(history.map(\.date).filter { $0 >= weekStart && $0 <= min(end, today) })
    let pausedPlanned = days(weekStart: weekStart, today: today, library: library, trained: trained)
      .filter { $0.planned && !$0.trained && paused($0.date) }.count
    let last = min(end, today)
    let after = KoaGains.compute(history, week: week, today: last).points
    let before = KoaGains.compute(history, week: week, today: weekStart.adding(days: -1)).points
    return Summary(
      target: max(0, week.target - pausedPlanned), done: trained.count, moved: inWeek.filter { $0.movedFrom != nil }.count,
      chosenRest: inWeek.filter { $0.isRest && $0.movedTo == nil }.count, gains: max(0, after - before))
  }
}

/// Nhận thưởng "Tuần của Koa" của MỘT tài khoản — một lần mỗi tuần, ở mọi máy.
@MainActor @Observable
public final class KoaWeekBook {
  public enum Claim: Sendable, Hashable {
    case notYet
    case claimed
    /// Vừa nhận ở lượt này — màn mừng.
    case justClaimed(coins: Int)
    case failed
  }

  public let userId: String
  public private(set) var claim: Claim = .notYet
  @ObservationIgnored private let economy: any MascotEconomy
  /// Cổng nhận thưởng chung của tài khoản (KOA-T55): biết khoá đã nhận ở server / máy này / chỗ khác
  /// đang gửi. App truyền MỘT cổng cho mọi chỗ nhận; test tự dựng.
  @ObservationIgnored public let gate: ClaimGate

  public init(userId: String, economy: any MascotEconomy, gate: ClaimGate) {
    self.userId = userId
    self.economy = economy
    self.gate = gate
  }

  public convenience init(userId: String, economy: any MascotEconomy, defaults: UserDefaults = .standard) {
    self.init(userId: userId, economy: economy, gate: ClaimGate(userId: userId, defaults: defaults))
  }

  /// Đủ tuần mà chưa nhận → nhận. Gọi lại bao nhiêu lần cũng chỉ một giao dịch:
  /// cổng nhớ đã nhận, và server bỏ trùng theo `ref_key` (trả 0 = đã nhận, KOA-T01).
  /// Trả số xu khi VỪA nhận mới ở lượt này (số server trả), `nil` khi đã nhận / chưa
  /// đủ / hỏng / đang có lượt khác nhận. Màn chỉ ăn mừng theo giá trị trả về — trạng
  /// thái `.justClaimed` giữ cho thẻ hiện "vừa nhận", nhưng tải lại Hôm nay không mừng
  /// lần hai (KOA-T05). Nhiều nơi gọi cùng lúc (phòng, Hôm nay, có mạng lại) chỉ gửi một
  /// lượt (KOA-T17).
  @discardableResult
  public func claimIfComplete(_ state: KoaWeek.State?) async -> Int? {
    guard let state else {
      claim = .notYet
      return nil
    }
    let ref = state.refKey
    if gate.isClaimed(ref) {
      if case .justClaimed = claim { return nil }
      claim = .claimed
      return nil
    }
    guard state.complete else {
      claim = .notYet
      return nil
    }
    switch await gate.claim(ref, send: { try await economy.claimReward(refKey: ref, reason: "koa week \(state.weekStart)") }) {
    case .paid(let amount):
      claim = .justClaimed(coins: amount)
      return amount
    case .alreadyClaimed:
      claim = .claimed
      return nil
    case .busy:
      return nil
    case .failed:
      claim = .failed
      return nil
    }
  }

  /// Nhận bù tuần TRƯỚC (đủ tuần lúc mất mạng, sang tuần mới mới có mạng): không đổi
  /// `claim` của tuần này. Trả số xu (server trả) khi vừa nhận ở lượt này.
  public func claimMissed(_ state: KoaWeek.State?) async -> Int? {
    guard let state, state.complete else { return nil }
    let ref = state.refKey
    if case .paid(let amount) = await gate.claim(ref, send: {
      try await economy.claimReward(refKey: ref, reason: "koa week \(state.weekStart)")
    }) {
      return amount
    }
    return nil
  }

}
