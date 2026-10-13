#if DEBUG
  import ASCNDCore
  import Foundation

  /// Trả lời giả của `scan-food` / `ai-meal-suggest` — CHỈ bản Debug, chỉ khi
  /// mở app với `ASCND_FAKE_AI=1` (xem `AppServices.makeEdgeCaller`). Để chụp
  /// và thử giao diện khi project Supabase chưa deploy edge function.
  struct FakeAIEdgeCaller: EdgeCaller {
    func call(_ fn: EdgeFunction.Name, body: [String: JSONValue]) async throws(EdgeFunction.Failure) -> JSONValue? {
      try? await Task.sleep(for: .seconds(1.2))
      switch fn {
      case .scanFood:
        return .object([
          "items": .array([
            item("Cơm trắng", 260, serving: 200, p: 5, c: 57, f: 0.6),
            item("Gà nướng mật ong", 320, serving: 150, p: 34, c: 9, f: 16),
            item("Rau muống xào tỏi", 90, serving: 120, p: 3, c: 6, f: 6),
          ])
        ])
      case .mealSuggest:
        return .object([
          "suggestions": .array([
            suggestion("Bún gà xé phay", 480, p: 36, c: 58, f: 10, prep: 20, ["bún", "ức gà", "hành tây", "rau răm"]),
            suggestion("Cá hồi áp chảo, khoai lang", 560, p: 38, c: 42, f: 24, prep: 25, ["cá hồi", "khoai lang", "măng tây"]),
            suggestion("Salad đậu phụ mè rang", 390, p: 22, c: 28, f: 20, prep: 10, ["đậu phụ", "xà lách", "mè rang", "dưa leo"]),
          ])
        ])
      default:
        throw .notDeployed
      }
    }

    private func item(_ name: String, _ kcal: Double, serving: Double, p: Double, c: Double, f: Double) -> JSONValue {
      .object([
        "food_name": .string(name), "kcal": .number(kcal), "serving_g": .number(serving), "protein_g": .number(p),
        "carbs_g": .number(c), "fat_g": .number(f), "fiber_g": .number(2),
      ])
    }

    private func suggestion(
      _ name: String, _ kcal: Double, p: Double, c: Double, f: Double, prep: Double, _ ingredients: [String]
    ) -> JSONValue {
      .object([
        "name": .string(name), "description": .string("Nhiều đạm, vừa phần kcal còn lại."), "kcal": .number(kcal),
        "protein_g": .number(p), "carbs_g": .number(c), "fat_g": .number(f),
        "ingredients": .array(ingredients.map { .string($0) }), "prep_time_min": .number(prep),
      ])
    }
  }
#endif
