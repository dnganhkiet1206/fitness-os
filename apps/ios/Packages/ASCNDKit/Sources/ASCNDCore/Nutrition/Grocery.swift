public import Foundation
public import Observation

/// Danh sách đi chợ (#527, N1) — `app/grocery.tsx` + `useGroceryItems` /
/// `useGroceryMutations` (`hooks/use-extras.ts`) @ fac9ac2. Server là chủ:
/// bảng `grocery_items`, RLS `auth.uid() = user_id`.
public enum Grocery {
  /// Khoá gộp của lớp Trạng thái (#161): `groceryCheckedKey(id)`.
  public static func checkedKey(_ id: String) -> String { "grocery:checked:\(id.lowercased())" }

  /// Tên đã cắt khoảng trắng; `nil` khi rỗng (`if (!name) return`).
  public static func cleanName(_ draft: String) -> String? {
    let name = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return name.isEmpty ? nil : name
  }

  /// Một món của thực đơn gần nhất, gộp theo tên (không phân biệt hoa thường).
  public struct Suggestion: Sendable, Hashable, Identifiable {
    public let name: String
    public let grams: Double
    public let times: Int
    public var id: String { name.lowercased() }

    /// `amountOf`: "400g" khi có gam, không thì "×3". Đây là chữ LƯU vào
    /// `grocery_items.quantity` (không theo ngôn ngữ); hiển thị qua `quantityLabel`.
    public var amount: String {
      grams > 0 ? "\(Int(JS.round(grams)))g" : "×\(times)"
    }
  }

  /// Số lượng để hiện (26/10, audit vòng 3: "Cơm 21000g", và hàng danh sách thêm "×"
  /// trước "×3" thành "××3"). Chữ lưu dạng "<số>g" → nhóm chữ số theo `locale`, từ
  /// 1000 g đổi ra kg (một chữ số lẻ): "400 g", "1,5 kg", "21 kg". Chữ khác (vd. "×3",
  /// hay số lượng gõ tay) giữ nguyên.
  public static func quantityLabel(_ stored: String, locale: Locale) -> String {
    let t = stored.trimmingCharacters(in: .whitespaces)
    guard t.hasSuffix("g"), let g = Double(t.dropLast().trimmingCharacters(in: .whitespaces)), g.isFinite, g >= 0
    else { return stored }
    if g >= 1000 {
      return "\((JS.round(g / 100) / 10).formatted(.number.precision(.fractionLength(0...1)).locale(locale))) kg"
    }
    return "\(Int(JS.round(g)).formatted(.number.locale(locale))) g"
  }

  /// `queryFn` của `grocery_meal_plan`: gộp `meal_plan_items` theo tên đã cắt
  /// (khoá chữ thường, giữ cách viết của lần gặp đầu), cộng gam và số lần;
  /// bỏ tên rỗng; xếp theo tên. Rồi bỏ món đã có trong danh sách
  /// (`existingNames`, so chữ thường).
  public static func suggestions(planRows: [(name: String?, grams: Double?)], existing: [GroceryItem]) -> [Suggestion] {
    var order: [String] = []
    var byKey: [String: (name: String, grams: Double, times: Int)] = [:]
    for row in planRows {
      let name = (row.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !name.isEmpty else { continue }
      let key = name.lowercased()
      var at = byKey[key] ?? (name, 0, 0)
      if byKey[key] == nil { order.append(key) }
      at.grams += (row.grams.map { $0.isFinite ? $0 : 0 }) ?? 0
      at.times += 1
      byKey[key] = at
    }
    let have = Set(existing.map { $0.name.lowercased() })
    return order.compactMap { byKey[$0] }
      .map { Suggestion(name: $0.name, grams: $0.grams, times: $0.times) }
      .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
      .filter { !have.contains($0.name.lowercased()) }
  }
}

/// Một món — hình dạng `select('id, name, quantity, checked, category')`.
public struct GroceryItem: Sendable, Hashable, Codable, Identifiable {
  public let id: String
  public let name: String
  public let quantity: String?
  public let checked: Bool
  public let category: String?

  public init(id: String, name: String, quantity: String?, checked: Bool, category: String? = nil) {
    self.id = id.lowercased()
    self.name = name
    self.quantity = quantity
    self.checked = checked
    self.category = category
  }
}

/// Đọc / ghi `grocery_items` (`ASCNDBackend.SupabaseGrocerySource`).
public protocol GrocerySource: Sendable {
  /// `.order('checked').order('created_at', desc)` — thứ tự của server giữ nguyên.
  func items(userId: String) async throws -> [GroceryItem]
  /// `insert({ user_id, name, quantity, checked: false })`.
  func insert(userId: String, name: String, quantity: String?) async throws
  /// `update({ checked }).eq(id).eq(user_id)` + `confirmWrite`: số hàng đã đổi.
  func setChecked(id: String, userId: String, checked: Bool) async throws -> Int
  /// `delete().eq(id).eq(user_id)` + `confirmWrite`: số hàng đã xoá.
  func delete(id: String, userId: String) async throws -> Int
  /// Thực đơn mới nhất của người ấy → `meal_plan_items(food_name, serving_g)`;
  /// không có thực đơn → `[]`.
  func latestPlanRows(userId: String) async throws -> [(name: String?, grams: Double?)]
}

/// Danh sách đi chợ của MỘT người.
///
/// RN behavior:
/// - đọc hỏng là lỗi có thử lại, không bao giờ là "danh sách trống";
/// - thêm / xoá: chỉ online (`useOnlineMutation`); hỏng thì báo; xong thì đọc lại;
/// - tick: lớp Trạng thái (#161) — giá trị tuyệt đối, gộp theo món, mất mạng
///   giữ ý trong phiên; món đã xoá ở máy khác (0 hàng) → bỏ ý và báo;
/// - gợi ý "Từ thực đơn": món của thực đơn mới nhất chưa có trong danh sách,
///   chạm để thêm kèm lượng.
///
/// Native behavior: theo `userId`; kết quả về sau `close()` hay sau lượt đọc
/// mới hơn bị bỏ. Không có bản lưu trên máy (RN giữ cache React Query) — mở
/// lúc mất mạng là màn lỗi có thử lại.
@MainActor @Observable
public final class GroceryBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([GroceryItem])
  }

  public enum WriteOutcome: Sendable, Hashable {
    case done
    case emptyName
    /// Mất mạng: không gửi, không giữ.
    case onlineOnly
    /// Không hàng nào bị chạm — món đã bị xoá ở máy khác.
    case nothingWritten
    case failed
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var staleFailure: TodayController.RefreshFailure?
  public private(set) var suggestions: [Grocery.Suggestion] = []
  public private(set) var busy = false

  public var items: [GroceryItem] {
    if case .ready(let i) = phase { return i }
    return []
  }

  @ObservationIgnored private let source: any GrocerySource
  @ObservationIgnored private var planRows: [(name: String?, grams: Double?)] = []
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  public init(userId: String, source: any GrocerySource) {
    self.userId = userId
    self.source = source
  }

  public func close() {
    closed = true
    generation += 1
  }

  /// Đọc danh sách và thực đơn gần nhất. Lỗi khi đã có số thì giữ số; lỗi khi
  /// chưa có thì báo lỗi. Thực đơn đọc hỏng thì chỉ là không có gợi ý.
  public func refresh() async {
    guard !closed else { return }
    generation += 1
    let gen = generation
    let source = self.source, userId = self.userId
    async let plan = try? source.latestPlanRows(userId: userId)
    do {
      let rows = try await source.items(userId: userId)
      let planRows = await plan ?? []
      guard !closed, gen == generation else { return }
      self.planRows = planRows
      phase = .ready(rows)
      staleFailure = nil
      suggestions = Grocery.suggestions(planRows: planRows, existing: rows)
    } catch {
      _ = await plan
      guard !closed, gen == generation else { return }
      let failure = TodayController.failure([error]) ?? .unavailable
      if case .ready = phase { staleFailure = failure } else { phase = .failed(failure) }
    }
  }

  /// `add.mutate(name)` / `add.mutate({ name, quantity })` — chỉ online.
  public func add(_ draft: String, quantity: String? = nil, online: Bool) async -> WriteOutcome {
    guard !closed, !busy else { return .failed }
    guard let name = Grocery.cleanName(draft) else { return .emptyName }
    guard online else { return .onlineOnly }
    busy = true
    defer { if !closed { busy = false } }
    do {
      try await source.insert(userId: userId, name: name, quantity: quantity)
    } catch {
      await refresh()
      return NetworkFailure.isOffline(error) ? .onlineOnly : .failed
    }
    await refresh()
    return .done
  }

  /// `remove.mutate(id)` — chỉ online; 0 hàng là lỗi (`nCxNothingWrittenGrocery`).
  public func remove(id: String, online: Bool) async -> WriteOutcome {
    guard !closed, !busy else { return .failed }
    guard online else { return .onlineOnly }
    busy = true
    defer { if !closed { busy = false } }
    let outcome: WriteOutcome
    do {
      outcome = try await source.delete(id: id.lowercased(), userId: userId) > 0 ? .done : .nothingWritten
    } catch {
      return NetworkFailure.isOffline(error) ? .onlineOnly : .failed
    }
    await refresh()
    return outcome
  }

  // MARK: - Tick (#161)

  /// `toggle.set(id, checked)`: giá trị TUYỆT ĐỐI qua lớp Trạng thái; `server`
  /// là giá trị đang có của server (bản đọc gần nhất). Ghi xong thì bản trong
  /// sổ mang ngay giá trị ấy (ý chờ gửi đã gỡ, không được nháy về bản cũ) rồi
  /// đọc lại — `invalidateQueries` của RN, món đã lấy xuống cuối.
  @discardableResult
  public func setChecked(_ item: GroceryItem, checked: Bool, writer: StateWriter) -> StateWriter.Outcome {
    let source = self.source, userId = self.userId, id = item.id
    return writer.set(key: Grocery.checkedKey(id), value: checked, server: item.checked) { [weak self] value in
      guard try await source.setChecked(id: id, userId: userId, checked: value) > 0 else { return .gone }
      self?.settle(id: id, checked: value)
      return .ok
    }
  }

  private func settle(id: String, checked: Bool) {
    guard !closed, case .ready(let rows) = phase else { return }
    phase = .ready(rows.map {
      $0.id == id ? GroceryItem(id: $0.id, name: $0.name, quantity: $0.quantity, checked: checked, category: $0.category) : $0
    })
    Task { await refresh() }
  }

  /// "Đã lấy" để HIỆN: ý đang chờ gửi thắng bản của server.
  public func shownChecked(_ item: GroceryItem, writer: StateWriter?) -> Bool {
    writer?.pending(Grocery.checkedKey(item.id)) ?? item.checked
  }

  /// Món có ý đang chờ gửi (`pending`) — màn vẽ dấu chờ trên chính món ấy.
  public func isPending(_ item: GroceryItem, writer: StateWriter?) -> Bool {
    writer?.pending(Grocery.checkedKey(item.id)) != nil
  }

  /// "N món còn lại" (`nGroceryLeft`): món chưa lấy theo giá trị đang hiện.
  public func remaining(writer: StateWriter?) -> Int {
    items.filter { !shownChecked($0, writer: writer) }.count
  }
}
