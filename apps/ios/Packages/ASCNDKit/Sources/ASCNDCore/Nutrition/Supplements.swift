public import Foundation
public import Observation

/// Thực phẩm bổ sung (#527 Phase 3 · 3.9) — `app/supplements.tsx` +
/// `useSupplementChecklist` / `useAddSupplement` / `useDeleteSupplement`
/// (`hooks/use-library.ts`). Server là chủ: `supplements` và
/// `supplement_intake_logs`, RLS `auth.uid() = user_id`.
public enum Supplements {
  /// `TIMINGS` của màn, đúng thứ tự hiện; giá trị là chữ lưu ở cột `timing`.
  public static let timings = ["morning", "pre-workout", "post-workout", "with meals", "before bed"]

  /// Ô chọn thời điểm bắt đầu ở "morning" (`useState('morning')`).
  public static let defaultTiming = "morning"

  /// `localDayRangeISO(dateStr)`: nửa đêm ĐỊA PHƯƠNG của ngày ấy tới nửa đêm
  /// địa phương ngày sau, ra ISO UTC. Ngày đổi giờ dài 23 / 25 giờ — tính bằng
  /// lịch, không cộng 24 giờ.
  public static func dayRange(_ date: LocalDate, in timeZone: TimeZone) -> (start: String, end: String) {
    (WorkoutSessionRecord.iso8601(midnight(date, timeZone)), WorkoutSessionRecord.iso8601(midnight(date.adding(days: 1), timeZone)))
  }

  static func midnight(_ d: LocalDate, _ tz: TimeZone) -> EpochMillis {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let date = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day)) ?? Date(timeIntervalSince1970: 0)
    return EpochMillis(date)
  }

  /// Hàng `insert` của `useAddSupplement`: tên / liều đã cắt khoảng trắng,
  /// `category: 'other'`, `notes: ''`. `nil` khi tên rỗng (`if (!name.trim()) return`).
  public static func newRow(userId: String, name: String, dose: String, timing: String) -> JSONValue? {
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return nil }
    return .object([
      "user_id": .string(userId), "name": .string(name), "category": .string("other"),
      "dose_text": .string(dose.trimmingCharacters(in: .whitespacesAndNewlines)), "timing": .string(timing),
      "notes": .string(""),
    ])
  }

  /// Dòng phụ của một mục: `[dose_text, timingLabel(timing)].filter(Boolean).join(' · ')`.
  public static func detail(dose: String?, timingLabel: String?) -> String {
    [dose, timingLabel].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
  }
}

/// Một mục của danh sách — hình dạng `useSupplementChecklist` trả về.
public struct Supplement: Sendable, Hashable, Codable, Identifiable {
  public let id: String
  public let name: String
  public let doseText: String?
  public let timing: String?
  public let category: String?
  /// Đã uống trong ngày đang xem (có dòng intake `taken = true`).
  public let taken: Bool

  public init(id: String, name: String, doseText: String?, timing: String?, category: String?, taken: Bool) {
    self.id = id.lowercased()
    self.name = name
    self.doseText = doseText
    self.timing = timing
    self.category = category
    self.taken = taken
  }
}

/// Đọc / ghi `supplements` (`ASCNDBackend.SupabaseSupplementSource`).
public protocol SupplementSource: Sendable {
  /// `select id, name, dose_text, timing, category … order('timing')`. Thứ tự
  /// của server giữ nguyên. Cột `taken` ở đây luôn `false` — chỗ ghép là `SupplementBook`.
  func supplements(userId: String) async throws -> [Supplement]
  /// `select supplement_id, taken` của intake trong `[start, end)`: id những mục
  /// có dòng `taken = true`.
  func takenIds(userId: String, start: String, end: String) async throws -> Set<String>
  func insert(_ row: JSONValue) async throws
  /// `delete().eq(id).eq(user_id)` + `confirmWrite`: số hàng đã xoá.
  func delete(id: String, userId: String) async throws -> Int
}

public protocol SupplementCache: Sendable {
  func load(userId: String) async throws -> SupplementSnapshot?
  func save(userId: String, _ snapshot: SupplementSnapshot) async throws
}

public struct SupplementSnapshot: Sendable, Hashable, Codable {
  public let date: LocalDate
  public let items: [Supplement]

  public init(date: LocalDate, items: [Supplement]) {
    self.date = date
    self.items = items
  }
}

/// Danh sách thực phẩm bổ sung của MỘT người, ngày hôm nay.
///
/// RN behavior:
/// - đọc hai bảng; lỗi ở BẤT KỲ lượt nào là lỗi — không bao giờ hiện "chưa
///   uống" thay cho "không đọc được" (người ta sẽ uống liều thứ hai);
/// - thêm / xoá: CHỈ online (`useOnlineMutation`, `now(6)` / `now(3)`); mất
///   mạng thì từ chối, không gửi, không giữ; xong thì đọc lại;
/// - xoá ra 0 hàng là lỗi (`nCxNothingWrittenSupplement`).
///
/// Native behavior: theo `userId`; kết quả về sau `close()` hay sau lượt đọc
/// mới hơn bị bỏ; bản lưu trên máy hiện khi mở lúc mất mạng (RN giữ cache
/// React Query trên đĩa). Tick "đã uống" chưa port — xem #527 (lớp Trạng thái #161).
@MainActor @Observable
public final class SupplementBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    /// Đọc được; rỗng là "chưa có".
    case ready([Supplement])
  }

  public enum AddOutcome: Sendable, Hashable {
    case added
    case emptyName
    /// Mất mạng: không gửi, không giữ lại (`errOnlineOnly`).
    case onlineOnly
    case failed
  }

  public enum DeleteOutcome: Sendable, Hashable {
    case deleted
    case onlineOnly
    /// Không hàng nào bị xoá — có lẽ đã xoá ở máy khác.
    case nothingWritten
    case failed
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Lần đọc gần nhất hỏng nhưng còn bản cũ đang hiện.
  public private(set) var staleFailure: TodayController.RefreshFailure?
  public private(set) var adding = false
  public private(set) var deleting = false
  public private(set) var date: LocalDate

  public var items: [Supplement] {
    if case .ready(let s) = phase { return s }
    return []
  }

  public var takenCount: Int { items.filter(\.taken).count }

  @ObservationIgnored private let source: any SupplementSource
  @ObservationIgnored private let cache: any SupplementCache
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  public init(
    userId: String, source: any SupplementSource, cache: any SupplementCache,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.clock = clock
    self.timeZone = timeZone
    date = LocalDate(clock.nowMillis(), in: timeZone)
  }

  /// Đăng xuất / đổi tài khoản: từ đây không lượt nào của sổ này đổi màn nữa.
  public func close() {
    closed = true
    generation += 1
  }

  private func today() -> LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  /// Bản lưu trên máy trước (chỉ khi chưa có gì và cùng ngày), rồi hỏi server.
  public func load() async {
    guard !closed else { return }
    if case .loading = phase {
      let gen = generation
      if let cached = try? await cache.load(userId: userId), !closed, gen == generation, case .loading = phase {
        // "Đã uống" của hôm qua không phải của hôm nay: bản lưu khác ngày thì
        // giữ danh sách, bỏ dấu tick.
        let day = today()
        phase = .ready(cached.date == day ? cached.items : cached.items.map(Self.untaken))
      }
    }
    await refresh()
  }

  /// Đọc lại. Lỗi khi đã có số thì giữ số (và ghi `staleFailure`); lỗi khi
  /// chưa có thì báo lỗi.
  public func refresh() async {
    guard !closed else { return }
    generation += 1
    let gen = generation
    let day = today()
    let range = Supplements.dayRange(day, in: timeZone)
    let source = self.source, userId = self.userId
    do {
      async let list = source.supplements(userId: userId)
      async let taken = source.takenIds(userId: userId, start: range.start, end: range.end)
      let (rows, ids) = try await (list, taken)
      guard !closed, gen == generation else { return }
      let items = rows.map {
        Supplement(id: $0.id, name: $0.name, doseText: $0.doseText, timing: $0.timing, category: $0.category,
                   taken: ids.contains($0.id))
      }
      date = day
      phase = .ready(items)
      staleFailure = nil
      try? await cache.save(userId: userId, SupplementSnapshot(date: day, items: items))
    } catch {
      guard !closed, gen == generation else { return }
      let failure = TodayController.failure([error]) ?? .unavailable
      if case .ready = phase {
        staleFailure = failure
      } else {
        phase = .failed(failure)
      }
    }
  }

  /// `useAddSupplement` — chỉ online.
  public func add(name: String, dose: String, timing: String, online: Bool) async -> AddOutcome {
    guard !closed, !adding else { return .failed }
    guard let row = Supplements.newRow(userId: userId, name: name, dose: dose, timing: timing) else {
      return .emptyName
    }
    guard online else { return .onlineOnly }
    adding = true
    defer { if !closed { adding = false } }
    do {
      try await source.insert(row)
    } catch {
      return NetworkFailure.isOffline(error) ? .onlineOnly : .failed
    }
    guard !closed else { return .added }
    await refresh()
    return .added
  }

  /// `useDeleteSupplement` — chỉ online; intake của mục đi theo (`ON DELETE CASCADE`).
  public func delete(id: String, online: Bool) async -> DeleteOutcome {
    guard !closed, !deleting else { return .failed }
    guard online else { return .onlineOnly }
    deleting = true
    defer { if !closed { deleting = false } }
    let outcome: DeleteOutcome
    do {
      outcome = try await source.delete(id: id.lowercased(), userId: userId) > 0 ? .deleted : .nothingWritten
    } catch {
      return NetworkFailure.isOffline(error) ? .onlineOnly : .failed
    }
    guard !closed else { return outcome }
    await refresh()
    return outcome
  }

  static func untaken(_ s: Supplement) -> Supplement {
    Supplement(id: s.id, name: s.name, doseText: s.doseText, timing: s.timing, category: s.category, taken: false)
  }
}
