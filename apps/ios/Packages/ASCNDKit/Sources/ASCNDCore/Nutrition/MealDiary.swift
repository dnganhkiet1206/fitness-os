public import Foundation
public import Observation

/// Nhật ký bữa ăn của một ngày (#527 Phase 3 · 3.10) — `app/diary.tsx` +
/// `DayMeals` (`components/ascnd/today-meals.tsx`) + `useTodayLog(date)` /
/// `useDeleteMealItem` / `useRestoreMealItem` / `useUpdateMealItemServings` /
/// `resyncMealEntry` (`hooks/use-nutrition.ts`).
///
/// RN behavior (giữ nguyên):
/// - một ngày địa phương bất kỳ, không bao giờ sau hôm nay (`?date=` tương lai
///   kẹp về hôm nay; mũi tên "ngày sau" tắt ở hôm nay);
/// - đọc `meal_entries` trong `[nửa đêm, nửa đêm hôm sau)` địa phương rồi
///   `meal_entry_items` của các bữa ấy — lượt đọc THỨ HAI hỏng cũng là hỏng
///   (không bao giờ "0 món · 520 kcal");
/// - gom theo loại bữa theo thứ tự một ngày; tổng làm tròn MỘT lần trên tổng;
/// - xoá một món: chụp hàng + bữa trước (chụp hỏng vẫn xoá, chỉ không mời hoàn
///   tác) → xoá (`confirmWrite`: không hàng nào = lỗi) → tính lại tổng bữa (hết
///   món thì xoá bữa) → dựng lại `daily_logs` của NGÀY ĐANG XEM;
/// - hoàn tác: upsert bữa rồi món theo id, `ignoreDuplicates` (chạy hai lần
///   không đổi gì) → tính lại tổng → dựng lại ngày;
/// - sửa khẩu phần: 0,5…20 bước 0,5; nhân mọi cột (cả `fiber_g`) theo tỉ lệ
///   mới / cũ, lưu số CHÍNH XÁC (làm tròn chỉ lúc đọc);
/// - mọi lệnh sửa chỉ khi có mạng (`useOnlineMutation`, `now(3)`).
///
/// Khác RN: không vá danh sách lạc quan rồi hoàn lại — sửa xong thì đọc lại từ
/// server (nút khoá trong lúc chạy). Kết quả trên màn như nhau, ít một lớp
/// trạng thái có thể lệch.
public enum MealDiary {
  /// `ORDER` của `today-meals.tsx`.
  public static let order = ["breakfast", "lunch", "dinner", "snack", "preworkout", "postworkout"]

  /// `Stepper` của sheet sửa khẩu phần.
  public static let servingsRange = 0.5...20.0
  public static let servingsStep = 0.5

  /// Cột đầy đủ — lượt chụp trước khi xoá và lượt chèn lại không thể lệch nhau
  /// (`fiber_g`, `food_item_id` không có trên màn).
  public static let itemColumns =
    "id, meal_entry_id, food_item_id, food_name, servings, kcal, protein_g, carbs_g, fat_g, fiber_g"
  public static let entryColumns =
    "id, user_id, meal_type, date_time, total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g"

  /// Một món đã ghi (số đã nhân theo khẩu phần đã ghi).
  public struct Item: Sendable, Hashable, Identifiable {
    public let id: String
    public let entryId: String
    public let foodName: String
    public let servings: Double
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    /// Còn nằm trong outbox, server chưa có — không sửa / xoá được cho tới khi gửi xong.
    public internal(set) var pending = false

    public init(
      id: String, entryId: String, foodName: String, servings: Double, kcal: Double, protein: Double,
      carbs: Double, fat: Double
    ) {
      self.id = id
      self.entryId = entryId
      self.foodName = foodName
      self.servings = servings
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
    }

    /// Hàng `meal_entry_items` của `useTodayLog`: số làm tròn, khẩu phần 0 / hỏng → 1.
    public init?(row: JSONValue) {
      guard let id = row["id"]?.stringValue, let entry = row["meal_entry_id"]?.stringValue else { return nil }
      let s = MealDiary.num(row["servings"])
      self.init(
        id: id, entryId: entry, foodName: row["food_name"]?.stringValue ?? "", servings: s == 0 ? 1 : s,
        kcal: JS.round(MealDiary.num(row["kcal"])), protein: JS.round(MealDiary.num(row["protein_g"])),
        carbs: JS.round(MealDiary.num(row["carbs_g"])), fat: JS.round(MealDiary.num(row["fat_g"])))
    }
  }

  /// Một bản ghi `meal_entries` và các món của nó.
  public struct Meal: Sendable, Hashable, Identifiable {
    public let id: String
    public let type: String
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public internal(set) var items: [Item]
    /// Bữa còn nằm trong outbox (`MealLog.pendingMeals`).
    public internal(set) var pending = false

    public init(id: String, type: String, kcal: Double, protein: Double, carbs: Double, fat: Double, items: [Item]) {
      self.id = id
      self.type = type
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
      self.items = items
    }
  }

  /// Các bữa cùng loại gộp lại (`MealGroup`).
  public struct Group: Sendable, Hashable, Identifiable {
    public let type: String
    public let entries: Int
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let items: [Item]
    public var id: String { type }
  }

  /// `Number(x) || 0`.
  static func num(_ v: JSONValue?) -> Double {
    let n = JS.number(v)
    return n.isNaN ? 0 : n
  }

  /// Bản server ⊕ bữa chưa gửi. Hàng đã gửi nhưng outbox chưa kịp bỏ thì server
  /// đã có cùng id — giữ bản server, không hiện hai lần.
  public static func merge(server: [Meal], pending: [Meal]) -> [Meal] {
    let ids = Set(server.map(\.id))
    return server + pending.filter { !ids.contains($0.id) }
  }

  /// Ghép hai lượt đọc của `useTodayLog`: bữa theo thứ tự đọc, món theo bữa.
  public static func meals(entries: [JSONValue], items: [JSONValue]) -> [Meal] {
    var byEntry: [String: [Item]] = [:]
    for row in items {
      guard let it = Item(row: row) else { continue }
      byEntry[it.entryId, default: []].append(it)
    }
    return entries.compactMap { e in
      guard let id = e["id"]?.stringValue else { return nil }
      return Meal(
        id: id, type: e["meal_type"]?.stringValue ?? "", kcal: JS.round(num(e["total_kcal"])),
        protein: JS.round(num(e["total_protein_g"])), carbs: JS.round(num(e["total_carbs_g"])),
        fat: JS.round(num(e["total_fat_g"])), items: byEntry[id] ?? [])
    }
  }

  /// `groupByType`: cộng thô, làm tròn MỘT lần trên tổng, xếp theo `order`
  /// (loại lạ đứng TRƯỚC như `indexOf` = -1 của JS, giữ thứ tự gặp).
  public static func groups(_ meals: [Meal]) -> [Group] {
    var keys: [String] = []
    var acc: [String: (entries: Int, kcal: Double, p: Double, c: Double, f: Double, items: [Item])] = [:]
    for m in meals {
      if acc[m.type] == nil {
        keys.append(m.type)
        acc[m.type] = (0, 0, 0, 0, 0, [])
      }
      acc[m.type]!.entries += 1
      acc[m.type]!.kcal += m.kcal
      acc[m.type]!.p += m.protein
      acc[m.type]!.c += m.carbs
      acc[m.type]!.f += m.fat
      acc[m.type]!.items += m.items
    }
    let rank = { (t: String) in order.firstIndex(of: t) ?? -1 }
    return keys.enumerated()
      .sorted { a, b in rank(a.element) != rank(b.element) ? rank(a.element) < rank(b.element) : a.offset < b.offset }
      .map { _, t in
        let g = acc[t]!
        return Group(
          type: t, entries: g.entries, kcal: JS.round(g.kcal), protein: JS.round(g.p), carbs: JS.round(g.c),
          fat: JS.round(g.f), items: g.items)
      }
  }

  /// Tổng của ngày cộng từ CHÍNH danh sách (không đọc `daily_logs`).
  public static func dayTotal(_ meals: [Meal]) -> (kcal: Double, protein: Double, carbs: Double, fat: Double) {
    meals.reduce((0.0, 0.0, 0.0, 0.0)) { a, m in (a.0 + m.kcal, a.1 + m.protein, a.2 + m.carbs, a.3 + m.fat) }
  }

  /// Ngày mở màn: `?date=` chỉ khi không sau hôm nay.
  public static func startDate(_ requested: LocalDate?, today: LocalDate) -> LocalDate {
    guard let requested, requested <= today else { return today }
    return requested
  }

  /// "×1.5" chỉ khi khác một khẩu phần, hai chữ số lẻ tối đa (`Math.round(s*100)/100`).
  public static func servingsBadge(_ s: Double) -> String? {
    guard s != 1 else { return nil }
    return jsNumber(JS.round(s * 100) / 100)
  }

  /// `formatValue` của stepper: số nguyên in trần, còn lại một chữ số lẻ.
  public static func servingsText(_ s: Double) -> String {
    s.truncatingRemainder(dividingBy: 1) == 0 ? jsNumber(s) : JS.fixed(s, 1)
  }

  /// Bước stepper, kẹp vào dải.
  public static func step(_ s: Double, by direction: Int) -> Double {
    let next = s + Double(direction) * servingsStep
    return Swift.min(Swift.max(next, servingsRange.lowerBound), servingsRange.upperBound)
  }

  /// Món sau khi đổi khẩu phần — cùng tỉ lệ server sẽ nhân (xem trước của sheet).
  public static func scaled(_ it: Item, to servings: Double) -> Item {
    let k = servings / (it.servings == 0 ? 1 : it.servings)
    return Item(
      id: it.id, entryId: it.entryId, foodName: it.foodName, servings: servings, kcal: it.kcal * k,
      protein: it.protein * k, carbs: it.carbs * k, fat: it.fat * k)
  }

  /// Cột ghi của `useUpdateMealItemServings` từ hàng đọc ngay trước: nhân theo
  /// tỉ lệ, KHÔNG làm tròn (đổi đi đổi lại vẫn về đúng số cũ).
  public static func servingsUpdate(row: JSONValue, servings: Double) -> [String: JSONValue] {
    let was = num(row["servings"])
    let k = servings / (was == 0 ? 1 : was)
    var out: [String: JSONValue] = ["servings": .number(servings)]
    for col in ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"] {
      out[col] = .number(num(row[col]) * k)
    }
    return out
  }

  /// `resyncMealEntry`: tổng mới của bữa từ các món còn lại; `nil` = hết món,
  /// xoá bữa.
  public static func entryTotals(_ rest: [JSONValue]) -> [String: JSONValue]? {
    guard !rest.isEmpty else { return nil }
    func sum(_ k: String) -> JSONValue { .number(JS.round(rest.reduce(0) { $0 + num($1[k]) })) }
    return [
      "total_kcal": sum("kcal"), "total_protein_g": sum("protein_g"), "total_carbs_g": sum("carbs_g"),
      "total_fat_g": sum("fat_g"), "total_fiber_g": sum("fiber_g"),
    ]
  }

  /// `String(n)` của JS cho số hữu hạn: số nguyên không có ".0".
  static func jsNumber(_ x: Double) -> String {
    if x == x.rounded(), abs(x) < 1e15 { return String(Int(x)) }
    return String(x)
  }
}

/// Đủ để dựng lại một món đã xoá, nguyên văn — kể cả id (`DeletedMealItem`).
public struct DeletedMealItem: Sendable, Hashable {
  public let item: JSONValue
  public let entry: JSONValue
  public init(item: JSONValue, entry: JSONValue) {
    self.item = item
    self.entry = entry
  }
}

/// Đọc / sửa `meal_entries` + `meal_entry_items` (`ASCNDBackend.SupabaseMealDiary`).
public protocol MealDiarySource: Sendable {
  /// `useTodayLog`, lượt 1: bữa của người trong `[start, end)`, theo `date_time` tăng.
  func entries(userId: String, start: String, end: String) async throws -> [JSONValue]
  /// `useTodayLog`, lượt 2: món của các bữa ấy.
  func items(entryIds: [String]) async throws -> [JSONValue]
  /// Hàng món (cột `MealDiary.itemColumns`); không có → `nil`.
  func item(id: String) async throws -> JSONValue?
  /// Hàng bữa của chính người (cột `MealDiary.entryColumns`); không có → `nil`.
  func entry(id: String, userId: String) async throws -> JSONValue?
  /// Xoá món; trả số hàng đã chạm.
  func deleteItem(id: String) async throws -> Int
  /// Sửa món; trả số hàng đã chạm.
  func updateItem(id: String, _ row: [String: JSONValue]) async throws -> Int
  /// Món còn lại của một bữa (`kcal…fiber_g`).
  func remainingItems(entryId: String) async throws -> [JSONValue]
  /// Xoá / sửa tổng một bữa; trả số hàng đã chạm.
  func deleteEntry(id: String) async throws -> Int
  func updateEntry(id: String, _ row: [String: JSONValue]) async throws -> Int
  /// `upsert(row, { onConflict: 'id', ignoreDuplicates: true })`.
  func restore(entry: JSONValue) async throws
  func restore(item: JSONValue) async throws
}

/// `confirmWrite` không chạm hàng nào — hàng đã bị xoá / đổi ở máy khác.
public struct MealDiaryNothingWritten: Error, Sendable, Hashable {}

/// Nhật ký bữa ăn của MỘT người, xem MỘT ngày tại một lúc.
@MainActor
@Observable
public final class MealDiaryBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([MealDiary.Meal])
  }

  public enum EditOutcome: Sendable, Hashable {
    /// Đã ghi và đã dựng lại ngày. `undo` = ảnh chụp để hoàn tác (rỗng: không mời).
    case done(undo: [DeletedMealItem])
    /// Mất mạng — không gì được ghi (`useOnlineMutation`).
    case onlineOnly
    /// Không hàng nào bị chạm — có lẽ đã sửa / xoá ở máy khác.
    case nothingWritten
    /// Ghi hỏng.
    case failed
    /// Món còn chờ gửi (outbox) — server chưa có, chưa sửa / xoá được.
    case pendingSync
    /// Đã ghi, nhưng dựng lại tổng ngày hỏng — KHÔNG được trông như đã xong.
    case rebuildFailed
  }

  public let userId: String
  /// Ngày đang xem.
  public private(set) var date: LocalDate
  public private(set) var phase: Phase = .loading
  /// Một lệnh sửa đang chạy — nút xoá / lưu khoá lại.
  public private(set) var busy = false

  public var today: LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }
  public var isToday: Bool { date == today }
  public var meals: [MealDiary.Meal] {
    if case .ready(let m) = phase { return m }
    return []
  }

  @ObservationIgnored private let source: any MealDiarySource
  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let pendingWrites: (any PendingWrites)?
  /// Server ĐÃ nhận ít nhất một lệnh sửa / xoá / hoàn tác VÀ `daily_logs` của
  /// ngày ấy đã dựng lại xong — mốc `onSettled → invalidateLogQueries` của RN
  /// (`use-nutrition.ts` `useDeleteMealItem` / `useRestoreMealItem` /
  /// `useUpdateMealItemServings`). Không gọi khi chưa ghi được gì, khi chỉ
  /// chạm món còn trong outbox, hay khi dựng lại hỏng (`daily_logs` chưa đổi).
  @ObservationIgnored private let onRebuilt: @MainActor (LocalDate) -> Void
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  public init(
    userId: String, source: any MealDiarySource, store: any RowStore, pending: (any PendingWrites)? = nil,
    date: LocalDate? = nil, clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    onRebuilt: @escaping @MainActor (LocalDate) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.store = store
    self.pendingWrites = pending
    self.onRebuilt = onRebuilt
    self.clock = clock
    self.timeZone = timeZone
    self.date = MealDiary.startDate(date, today: LocalDate(clock.nowMillis(), in: timeZone))
  }

  /// Đổi tài khoản / đóng màn: lượt đọc về muộn không đổi gì nữa.
  public func close() {
    closed = true
    generation += 1
  }

  /// Lùi / tiến `days` ngày; không bao giờ qua hôm nay. Đổi ngày thì đang tải
  /// (không bao giờ "chưa ghi bữa nào" cho một ngày chưa đọc xong).
  @discardableResult
  public func go(_ days: Int) -> Bool {
    let next = date.adding(days: days)
    guard next <= today, !closed else { return false }
    show(next)
    return true
  }

  /// Về hôm nay.
  public func goToday() { show(today) }

  private func show(_ day: LocalDate) {
    guard day != date else { return }
    date = day
    phase = .loading
    generation += 1
  }

  /// Đọc ngày đang xem (server ⊕ bữa còn trong outbox của ngày ấy). Lỗi khi
  /// đang hiện đúng ngày ấy thì giữ số cũ.
  public func load() async {
    guard !closed else { return }
    generation += 1
    let gen = generation, day = date
    let range = DailyLog.dayRange(day, in: timeZone)
    let source = self.source, userId = self.userId, pendingWrites = self.pendingWrites
    do {
      let entries = try await source.entries(userId: userId, start: range.start, end: range.end)
      let ids = entries.compactMap { $0["id"]?.stringValue }
      let items = ids.isEmpty ? [] : try await source.items(entryIds: ids)
      // Đọc outbox SAU server: hàng gửi xong giữa hai lượt thì đã có ở server.
      let queued = (try? await pendingWrites?.pending(userId: userId)) ?? []
      guard !closed, gen == generation else { return }
      phase = .ready(MealDiary.merge(
        server: MealDiary.meals(entries: entries, items: items),
        pending: MealLog.pendingMeals(queued, userId: userId, window: range)))
    } catch {
      guard !closed, gen == generation else { return }
      if case .ready = phase { return }
      phase = .failed(TodayController.failure([error]) ?? .unavailable)
    }
  }

  /// Xoá các món (một món, hay cả một bữa — từng món, như RN), rồi dựng lại ngày.
  public func delete(_ items: [MealDiary.Item], online: Bool) async -> EditOutcome {
    guard !closed, !busy, !items.isEmpty else { return .failed }
    // Món chưa tới server: xoá ở server không chạm hàng nào — bỏ ra, không báo lỗi giả.
    let items = items.filter { !$0.pending }
    guard !items.isEmpty else { return .pendingSync }
    guard online else { return .onlineOnly }
    busy = true
    defer { if !closed { busy = false } }
    var snaps: [DeletedMealItem] = []
    var outcome: EditOutcome?
    var wrote = false
    for it in items {
      let snap = await snapshot(it)
      do {
        guard try await source.deleteItem(id: it.id) > 0 else { throw MealDiaryNothingWritten() }
        wrote = true
        if let snap { snaps.append(snap) }
        try await resync(entryId: it.entryId)
      } catch {
        outcome = Self.failure(error)
        break
      }
    }
    return await finish(outcome, undo: snaps, wrote: wrote)
  }

  /// Đặt lại các món vừa xoá, nguyên văn.
  public func restore(_ snaps: [DeletedMealItem], online: Bool) async -> EditOutcome {
    guard !closed, !busy, !snaps.isEmpty else { return .failed }
    guard online else { return .onlineOnly }
    busy = true
    defer { if !closed { busy = false } }
    var outcome: EditOutcome?
    var wrote = false
    for s in snaps {
      do {
        try await source.restore(entry: s.entry)
        try await source.restore(item: s.item)
        wrote = true
        if let entry = s.item["meal_entry_id"]?.stringValue { try await resync(entryId: entry) }
      } catch {
        outcome = Self.failure(error)
        break
      }
    }
    return await finish(outcome, undo: [], wrote: wrote)
  }

  /// Đổi số khẩu phần của một món. Không đổi gì thì không ghi.
  public func setServings(_ it: MealDiary.Item, to servings: Double, online: Bool) async -> EditOutcome {
    guard !closed, !busy else { return .failed }
    guard !it.pending else { return .pendingSync }
    guard servings != it.servings else { return .done(undo: []) }
    guard MealDiary.servingsRange.contains(servings) else { return .failed }
    guard online else { return .onlineOnly }
    busy = true
    defer { if !closed { busy = false } }
    var outcome: EditOutcome?
    do {
      guard let row = try await source.item(id: it.id) else { throw MealDiaryNothingWritten() }
      guard try await source.updateItem(id: it.id, MealDiary.servingsUpdate(row: row, servings: servings)) > 0 else {
        throw MealDiaryNothingWritten()
      }
      try await resync(entryId: it.entryId)
    } catch {
      outcome = Self.failure(error)
    }
    return await finish(outcome, undo: [], wrote: outcome == nil)
  }

  /// Chụp hàng + bữa; hỏng thì `nil` (vẫn xoá, chỉ không mời hoàn tác).
  private func snapshot(_ it: MealDiary.Item) async -> DeletedMealItem? {
    let source = self.source, userId = self.userId
    async let item = try? source.item(id: it.id)
    async let entry = try? source.entry(id: it.entryId, userId: userId)
    let (i, e) = await (item, entry)
    guard let i, let e else { return nil }
    return DeletedMealItem(item: i, entry: e)
  }

  /// `resyncMealEntry`.
  private func resync(entryId: String) async throws {
    let rest = try await source.remainingItems(entryId: entryId)
    let touched: Int
    if let totals = MealDiary.entryTotals(rest) {
      touched = try await source.updateEntry(id: entryId, totals)
    } else {
      touched = try await source.deleteEntry(id: entryId)
    }
    guard touched > 0 else { throw MealDiaryNothingWritten() }
  }

  /// Dựng lại ngày khi đã có gì được ghi, rồi đọc lại.
  private func finish(_ failure: EditOutcome?, undo: [DeletedMealItem], wrote: Bool) async -> EditOutcome {
    guard !closed else { return failure ?? .done(undo: undo) }
    var rebuilt = true
    if wrote {
      let day = date
      do {
        try await DailyLog.recompute(
          userId: userId, date: day, store: store, now: clock.nowMillis(), in: timeZone)
        onRebuilt(day)
      } catch {
        rebuilt = false
      }
    }
    await load()
    if let failure { return failure }
    return rebuilt ? .done(undo: undo) : .rebuildFailed
  }

  private static func failure(_ error: any Error) -> EditOutcome {
    if error is MealDiaryNothingWritten { return .nothingWritten }
    return NetworkFailure.isOffline(error) ? .onlineOnly : .failed
  }
}
