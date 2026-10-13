@testable import ASCNDCore
import Testing

/// "Chia sẻ lên Cộng đồng" trên thẻ bữa (`shareTarget` của `today-meals.tsx`).
struct MealShareTargetTests {
  let today = LocalDate("2026-10-13")!

  func group(_ entries: [String], pending: Set<String> = []) -> MealDiary.Group {
    let items = entries.enumerated().map { i, e in
      var it = MealDiary.Item(id: "i\(i)", entryId: e, foodName: "F", servings: 1, kcal: 100, protein: 1, carbs: 1, fat: 1)
      it.pending = pending.contains(e)
      return it
    }
    return MealDiary.Group(type: "lunch", entries: Set(entries).count, kcal: 0, protein: 0, carbs: 0, fat: 0, items: items)
  }

  @Test func oneOpenEntryGoesStraightToIt() {
    #expect(CommunityShareRecipe.target(group: group(["a", "a"]), shared: [], viewed: today, today: today) == .meal("a"))
    #expect(CommunityShareRecipe.target(group: group(["a", "b"]), shared: ["b"], viewed: today, today: today) == .meal("a"))
  }

  @Test func severalOpenEntriesOpenThePicker() {
    #expect(CommunityShareRecipe.target(group: group(["a", "b"]), shared: [], viewed: today, today: today) == .pick)
  }

  @Test func nothingWhenAllSharedUnknownOrPending() {
    #expect(CommunityShareRecipe.target(group: group(["a"]), shared: ["a"], viewed: today, today: today) == nil)
    #expect(CommunityShareRecipe.target(group: group(["a"]), shared: nil, viewed: today, today: today) == nil)
    #expect(CommunityShareRecipe.target(group: group(["a"], pending: ["a"]), shared: [], viewed: today, today: today) == nil)
  }

  @Test func windowIsTheShareScreensDays() {
    let g = group(["a"])
    let edge = today.adding(days: -(CommunityShareRecipe.days - 1))
    #expect(CommunityShareRecipe.target(group: g, shared: [], viewed: edge, today: today) == .meal("a"))
    #expect(CommunityShareRecipe.target(group: g, shared: [], viewed: edge.adding(days: -1), today: today) == nil)
  }
}
