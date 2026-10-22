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
  public static func state(today: LocalDate, library: TemplateSnapshot?, trained: Set<LocalDate>) -> State? {
    guard let library else { return nil }
    let week = KoaGains.Week(library)
    guard !week.planned.isEmpty || !library.overrides.isEmpty else { return nil }
    let start = WeeklyChallenges.weekStart(today)
    let days = (0..<7).map { o -> Day in
      let d = start.adding(days: o)
      let p = library.plan(for: d, today: today)
      return Day(date: d, planned: p.template != nil, rest: p.status == .rest, trained: trained.contains(d))
    }
    guard week.target > 0, days.contains(where: \.planned) || days.contains(where: \.trained) else { return nil }
    return State(weekStart: start, days: days, target: week.target, done: days.filter(\.trained).count)
  }
}

extension KoaWeek {
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

  public static func summary(
    weekStart: LocalDate, today: LocalDate, library: TemplateSnapshot, history: [KoaGains.Day]
  ) -> Summary {
    let end = weekStart.adding(days: 6)
    let week = KoaGains.Week(library)
    let inWeek = library.overrides.filter { $0.date >= weekStart && $0.date <= end }
    let trained = Set(history.map(\.date).filter { $0 >= weekStart && $0 <= min(end, today) })
    let last = min(end, today)
    let after = KoaGains.compute(history, week: week, today: last).points
    let before = KoaGains.compute(history, week: week, today: weekStart.adding(days: -1)).points
    return Summary(
      target: week.target, done: trained.count, moved: inWeek.filter { $0.movedFrom != nil }.count,
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
  @ObservationIgnored private let defaults: UserDefaults

  public init(userId: String, economy: any MascotEconomy, defaults: UserDefaults = .standard) {
    self.userId = userId
    self.economy = economy
    self.defaults = defaults
  }

  private func seenKey(_ ref: String) -> String { "ascnd_koa_week.\(userId).\(ref)" }

  /// Đủ tuần mà chưa nhận → nhận. Gọi lại bao nhiêu lần cũng chỉ một giao dịch:
  /// máy nhớ đã nhận, và server bỏ trùng theo `ref_key` (lỗi 23505 = đã nhận).
  public func claimIfComplete(_ state: KoaWeek.State?) async {
    guard let state else {
      claim = .notYet
      return
    }
    let ref = state.refKey
    if defaults.bool(forKey: seenKey(ref)) {
      if case .justClaimed = claim { return }
      claim = .claimed
      return
    }
    guard state.complete else {
      claim = .notYet
      return
    }
    do {
      _ = try await economy.claimReward(refKey: ref, reason: "koa week \(state.weekStart)")
      defaults.set(true, forKey: seenKey(ref))
      claim = .justClaimed(coins: KoaWeek.rewardCoins)
    } catch let f as MascotFailure where f == .server(code: "23505") {
      defaults.set(true, forKey: seenKey(ref))
      claim = .claimed
    } catch {
      claim = .failed
    }
  }

  /// Nhận bù tuần TRƯỚC (đủ tuần lúc mất mạng, sang tuần mới mới có mạng): không đổi
  /// `claim` của tuần này. Trả số xu khi vừa nhận ở lượt này.
  public func claimMissed(_ state: KoaWeek.State?) async -> Int? {
    guard let state, state.complete else { return nil }
    let ref = state.refKey
    guard !defaults.bool(forKey: seenKey(ref)) else { return nil }
    do {
      _ = try await economy.claimReward(refKey: ref, reason: "koa week \(state.weekStart)")
      defaults.set(true, forKey: seenKey(ref))
      return KoaWeek.rewardCoins
    } catch let f as MascotFailure where f == .server(code: "23505") {
      defaults.set(true, forKey: seenKey(ref))
      return nil
    } catch {
      return nil
    }
  }
}
