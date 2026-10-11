public import Foundation
public import Observation

/// Ô tìm thực phẩm trên tab Dinh dưỡng (#527, `(tabs)/nutrition.tsx:411-427`).
///
/// RN behavior (giữ nguyên):
/// - tìm sau 250 ms ngừng gõ, trên chữ đã cắt khoảng trắng; dưới 2 ký tự thì
///   không tìm và màn hiện lại "Của tôi" / "Gần đây";
/// - `food_items` theo tên (`ilike %q%`), món yêu thích trước rồi theo tên, 20
///   hàng; món mẫu chung bị bỏ khi người đã có món riêng cùng tên
///   (`dedupeSeedShadows`).
///
/// Khác RN:
/// - lượt tìm về muộn (chữ đã đổi) bị bỏ, không ghi đè kết quả mới;
/// - đọc hỏng là `.failed` (màn nói ra), không lặng lẽ không hiện gì như RN.
public enum FoodSearch {
  public static let limit = 20
  public static let debounce: Duration = .milliseconds(250)
}

@MainActor
@Observable
public final class FoodSearchBook {
  public enum Phase: Sendable, Hashable {
    /// Chưa đủ 2 ký tự — không phải "không có kết quả".
    case idle
    case searching
    case results([FoodLibrary.Food])
    case failed
  }

  public private(set) var phase: Phase = .idle

  @ObservationIgnored private let run: @Sendable (String, Int) async throws -> [JSONValue]
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  /// - Parameter search: `food_items` theo tên, `limit` hàng, đã xếp.
  public init(search: @escaping @Sendable (String, Int) async throws -> [JSONValue]) {
    self.run = search
  }

  public func close() { closed = true }

  /// Tìm `text` (bên gọi lo trễ 250 ms).
  public func search(_ text: String) async {
    guard !closed else { return }
    generation += 1
    let gen = generation
    let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= MealLog.searchMinLength else {
      phase = .idle
      return
    }
    phase = .searching
    let run = self.run
    do {
      let rows = try await run(q, FoodSearch.limit)
      guard !closed, gen == generation else { return }
      phase = .results(MealLog.dedupeSeedShadows(rows).compactMap(FoodLibrary.Food.init(row:)))
    } catch {
      guard !closed, gen == generation else { return }
      phase = .failed
    }
  }
}
