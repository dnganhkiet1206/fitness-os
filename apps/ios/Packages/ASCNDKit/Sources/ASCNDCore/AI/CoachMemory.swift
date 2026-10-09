public import Foundation
public import Observation

/// Trí nhớ của coach (#527 Phase 6) — `app/coach-memory.tsx` @ fac9ac2.
///
/// Bảng `coach_memory`: server (`ai-coach-memory`) ghi, app chỉ đọc và xoá.
/// Như RN: mới nhắc → cũ (`last_confirmed` giảm dần), nhóm theo loại theo thứ
/// tự Giới hạn · Mục tiêu · Thói quen · Hoàn cảnh (loại lạ không hiện), ngày
/// "nhắc lần cuối" là ngày THEO GIỜ MÁY của `timestamptz` (không cắt chuỗi
/// UTC); xoá một / xoá hết phải chạm ít nhất một hàng (`confirmWrite`).
public enum CoachMemory {
  public enum Kind: String, Sendable, Hashable, CaseIterable {
    case constraint, goal, preference, context
  }

  public struct Fact: Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: Kind?
    public let fact: String
    /// `localDateStr(new Date(last_confirmed))`; `nil` khi không đọc được.
    public let lastConfirmed: LocalDate?

    public init(id: String, kind: Kind?, fact: String, lastConfirmed: LocalDate?) {
      self.id = id
      self.kind = kind
      self.fact = fact
      self.lastConfirmed = lastConfirmed
    }
  }

  public struct Group: Sendable, Hashable, Identifiable {
    public let kind: Kind
    public let facts: [Fact]
    public var id: Kind { kind }
  }

  /// `GROUPS.map(g => rows.filter(r => r.kind === g.kind))`, bỏ nhóm rỗng.
  public static func groups(_ facts: [Fact]) -> [Group] {
    Kind.allCases.compactMap { k in
      let items = facts.filter { $0.kind == k }
      return items.isEmpty ? nil : Group(kind: k, facts: items)
    }
  }

  /// Một hàng của `select('id, kind, fact, last_confirmed, source_excerpt')`.
  public static func fact(_ row: JSONValue, in tz: TimeZone) -> Fact? {
    guard let id = row["id"]?.stringValue else { return nil }
    let ms = DailyLog.millis(row["last_confirmed"])
    return Fact(
      id: id, kind: row["kind"]?.stringValue.flatMap(Kind.init(rawValue:)), fact: row["fact"]?.stringValue ?? "",
      lastConfirmed: ms.isFinite ? LocalDate(EpochMillis(Int64(ms)), in: tz) : nil)
  }
}

/// Kho `coach_memory` (RLS theo người dùng).
public protocol CoachMemoryStore: Sendable {
  /// Mọi hàng của người dùng, `last_confirmed` giảm dần.
  func facts(userId: String) async throws -> [JSONValue]
  /// Xoá một; không chạm hàng nào là lỗi.
  func forget(id: String, userId: String) async throws
  /// Xoá hết; không chạm hàng nào là lỗi.
  func forgetAll(userId: String) async throws
}

/// Trí nhớ coach của MỘT tài khoản. Đóng khi phiên đổi.
@MainActor @Observable
public final class CoachMemoryBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready([CoachMemory.Fact])
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Lần xoá gần nhất hỏng (RN: toast) — xoá khi thử lại.
  public private(set) var forgetFailed = false
  public private(set) var isForgetting = false

  @ObservationIgnored private let store: any CoachMemoryStore
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private var closed = false

  public init(userId: String, store: any CoachMemoryStore, in tz: TimeZone) {
    self.userId = userId
    self.store = store
    self.tz = tz
  }

  public func close() { closed = true }

  public var groups: [CoachMemory.Group] {
    if case .ready(let facts) = phase { return CoachMemory.groups(facts) }
    return []
  }

  /// Đọc. Đọc lại hỏng khi đã có danh sách thì giữ danh sách.
  public func load() async {
    do {
      let rows = try await store.facts(userId: userId)
      guard !closed else { return }
      phase = .ready(rows.compactMap { CoachMemory.fact($0, in: tz) })
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed
    }
  }

  public func forget(_ id: String) async {
    await write { [store, userId] in try await store.forget(id: id, userId: userId) }
  }

  public func forgetAll() async {
    await write { [store, userId] in try await store.forgetAll(userId: userId) }
  }

  /// Xoá rồi đọc lại (RN: `invalidateQueries`); không gửi chồng.
  private func write(_ op: @Sendable () async throws -> Void) async {
    guard !isForgetting, !closed else { return }
    isForgetting = true
    forgetFailed = false
    defer { if !closed { isForgetting = false } }
    do {
      try await op()
    } catch {
      guard !closed else { return }
      forgetFailed = true
      return
    }
    guard !closed else { return }
    await load()
  }
}
