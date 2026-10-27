#if DEBUG
  import ASCNDCore
  import Foundation

  /// Dữ liệu mẫu của chế độ UI test (`UITestMode`). Xác định: cùng ngày mở app thì
  /// cùng dữ liệu. Mọi ngày tính lùi từ HÔM NAY của máy, để Hôm nay luôn có cùng
  /// trạng thái: hôm nay có buổi tập chưa tập, chưa uống nước, chưa ghi bữa, đêm qua
  /// chưa ghi giấc ngủ; 13 ngày trước đó có đủ bữa / nước / ngủ / cân / buổi tập.
  enum UITestSeed {
    typealias Row = [String: Any]

    /// Hàng viết gọn (chữ / số / Bool / `JSONValue`) → hàng `JSONValue` của kho giả.
    static func normalize(_ row: Row) -> [String: JSONValue] { row.mapValues(json) }

    static func json(_ v: Any) -> JSONValue {
      switch v {
      case let j as JSONValue: j
      case let s as String: .string(s)
      case let b as Bool: .bool(b)
      case let i as Int: .number(Double(i))
      case let d as Double: .number(d)
      case let a as [Any]: .array(a.map(json))
      case let o as [String: Any]: .object(o.mapValues(json))
      default: .null
      }
    }

    static let templateA = "e2e0a000-0000-4000-8000-00000000000a"
    static let templateB = "e2e0b000-0000-4000-8000-00000000000b"

    static func tables(now: Date, calendar: Calendar) -> [String: [[String: JSONValue]]] {
      let user = JSONValue.string(UITestMode.userId)
      let today = calendar.startOfDay(for: now)
      func day(_ offset: Int) -> Date { calendar.date(byAdding: .day, value: offset, to: today)! }
      func at(_ offset: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day(offset))!
      }
      func dateString(_ d: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
      }
      func iso(_ d: Date) -> JSONValue { JSONValue.string(FakeSupabaseStore.iso(d)) }
      func id(_ kind: Int, _ n: Int) -> JSONValue {
        JSONValue.string(String(format: "e2e%05x-0000-4000-8000-%012x", kind, n))
      }
      let created = iso(day(-60))
      // Giờ dậy quen (từ `sleep_logs`) = trước giờ mở app: nút ghi nhanh giấc ngủ của
      // thẻ Giấc ngủ chỉ hiện khi giờ dậy quen đã qua — test chạy giờ nào (CI theo UTC) cũng thấy nút.
      let hour = calendar.component(.hour, from: now)
      let wakeHour = max(hour - 1, 0)
      let waketime = String(format: "%02d:00", wakeHour)
      let bedtime = String(format: "%02d:00", (wakeHour + 16) % 24)

      var t: [String: [Row]] = [:]

      t["profiles"] = [[
        "id": id(1, 1), "user_id": user, "name": "Alex Tester", "onboarding_completed": true, "goal": "bulk",
        "sex": "male", "dob": "1995-06-15", "height_cm": 178, "weight_kg": 76, "activity_level": "moderate",
        "training_level": "intermediate", "work_type": "desk", "units_weight": "kg", "units_height": "cm",
        "tdee_target_kcal": 2600, "macro_protein_g": 150, "macro_carbs_g": 300, "macro_fat_g": 80,
        "macro_fiber_g": 30, "water_target_ml": 2500, "sleep_target_hours": 8,
        "sleep_target_bedtime": bedtime, "sleep_target_waketime": waketime,
        "sleep_target_bedtime_set": true, "sleep_target_waketime_set": true,
        "dietary_preference": JSONValue.null, "allergies": JSONValue.array([]), "disliked_foods": JSONValue.array([]),
        "created_at": created, "updated_at": created,
      ]]

      // Bài tập: Full Body A / B xen kẽ, cả bảy ngày — hôm nay luôn có buổi.
      func exercise(_ name: String, _ eid: Int, sets: Int, reps: Int, weight: Double) -> JSONValue {
        json([
          "exerciseId": id(2, eid), "exerciseName": name, "sets": sets, "reps": reps, "weight": weight, "rpe": 8,
          "restSeconds": 90,
        ] as Row)
      }
      let a: [JSONValue] = [
        exercise("Squat", 1, sets: 2, reps: 5, weight: 80), exercise("Bench Press", 2, sets: 2, reps: 5, weight: 60),
      ]
      let b: [JSONValue] = [
        exercise("Deadlift", 3, sets: 2, reps: 5, weight: 100), exercise("Overhead Press", 4, sets: 2, reps: 5, weight: 40),
      ]
      t["workout_templates"] = [
        ["id": JSONValue.string(templateA), "user_id": user, "name": "Full Body A", "type": "custom", "exercises": JSONValue.array(a),
         "created_at": created, "updated_at": created],
        ["id": JSONValue.string(templateB), "user_id": user, "name": "Full Body B", "type": "custom", "exercises": JSONValue.array(b),
         "created_at": created, "updated_at": created],
      ]
      // 0 = Thứ Hai … 6 = Chủ Nhật. Hôm nay luôn là Full Body A.
      let todayIndex = (calendar.component(.weekday, from: today) + 5) % 7
      t["routine_days"] = (0..<7).map { d -> Row in
        let template = (d - todayIndex + 14) % 2 == 0 ? templateA : templateB
        return [
          "id": id(3, d), "user_id": user, "day_of_week": JSONValue.number(Double(d)), "is_rest": false, "is_deload": false,
          "template_id": JSONValue.string(template), "created_at": created, "updated_at": created,
        ]
      }
      t["exercises"] = [
        ("Squat", "legs", "barbell"), ("Bench Press", "chest", "barbell"), ("Deadlift", "back", "barbell"),
        ("Overhead Press", "shoulders", "barbell"),
      ].enumerated().map { i, e -> Row in
        [
          "id": id(2, i + 1), "user_id": JSONValue.null, "name": JSONValue.string(e.0), "name_en": JSONValue.string(e.0),
          "muscle_group": JSONValue.string(e.1), "equipment": JSONValue.string(e.2), "exercise_kind": "strength",
          "created_at": created, "updated_at": created,
        ]
      }

      // 13 ngày trước hôm nay: ngày lẻ có buổi tập.
      var sessions: [Row] = []
      var daily: [Row] = []
      var water: [Row] = []
      var sleep: [Row] = []
      var weight: [Row] = []
      var meals: [Row] = []
      var items: [Row] = []
      for back in 1...13 {
        let o = -back
        let trained = back % 2 == 1
        if trained {
          let template = back % 4 == 1 ? (templateB, "Full Body B", b) : (templateA, "Full Body A", a)
          var sets: [JSONValue] = []
          for case JSONValue.object(let ex) in template.2 {
            for s in 1...2 {
              sets.append(json([
                "exerciseId": ex["exerciseId"]!, "exerciseName": ex["exerciseName"]!,
                "setIndex": sets.count + 1, "weight": ex["weight"]!, "reps": 5, "rpe": 8,
              ] as Row))
              _ = s
            }
          }
          let volume = sets.reduce(0.0) { $0 + ($1["weight"]?.doubleValue ?? 0) * 5 }
          sessions.append([
            "id": id(4, back), "user_id": user, "date_time": iso(at(o, 18)), "template_id": JSONValue.string(template.0),
            "template_name": JSONValue.string(template.1), "session_rpe": 8, "volume_load": JSONValue.number(volume),
            "pr_detected": false, "sets": JSONValue.array(sets), "source": "manual", "created_at": iso(at(o, 19)),
            "updated_at": iso(at(o, 19)),
          ])
        }
        let ml = 1800 + (back % 3) * 300
        for (i, part) in [ml / 3, ml / 3, ml - 2 * (ml / 3)].enumerated() {
          water.append([
            "id": id(5, back * 10 + i), "user_id": user, "date": JSONValue.string(dateString(day(o))),
            "amount_ml": JSONValue.number(Double(part)), "logged_at": iso(at(o, 9 + i * 4)), "created_at": iso(at(o, 9 + i * 4)),
          ])
        }
        let asleep = 420 + (back % 4) * 15
        sleep.append([
          "id": id(6, back), "user_id": user, "bedtime": iso(at(o, wakeHour).addingTimeInterval(-8 * 3600)), "waketime": iso(at(o, wakeHour)),
          "asleep_min": JSONValue.number(Double(asleep)), "quality": 4, "source": "manual",
          "created_at": iso(at(o, 7)), "updated_at": iso(at(o, 7)),
        ])
        weight.append([
          "id": id(7, back), "user_id": user, "date": JSONValue.string(dateString(day(o))),
          "weight_kg": JSONValue.number(76 - Double(back) * 0.05), "created_at": iso(at(o, 7, 30)),
        ])
        var dayKcal = 0.0, dayProtein = 0.0
        for (m, meal) in [("breakfast", 8, "Oatmeal", 380.0, 14.0), ("lunch", 12, "Chicken & Rice", 650.0, 48.0),
                          ("dinner", 19, "Salmon Bowl", 720.0, 42.0)].enumerated() {
          let entry = id(8, back * 10 + m)
          meals.append([
            "id": entry, "user_id": user, "meal_type": JSONValue.string(meal.0), "date_time": iso(at(o, meal.1)),
            "total_kcal": JSONValue.number(meal.3), "total_protein_g": JSONValue.number(meal.4), "total_carbs_g": 60,
            "total_fat_g": 18, "total_fiber_g": 6, "created_at": iso(at(o, meal.1)), "updated_at": iso(at(o, meal.1)),
          ])
          items.append([
            "id": id(9, back * 10 + m), "meal_entry_id": entry, "food_item_id": id(10, m + 1),
            "food_name": JSONValue.string(meal.2), "servings": 1, "kcal": JSONValue.number(meal.3), "protein_g": JSONValue.number(meal.4),
            "carbs_g": 60, "fat_g": 18, "fiber_g": 6, "created_at": iso(at(o, meal.1)),
          ])
          dayKcal += meal.3
          dayProtein += meal.4
        }
        daily.append([
          "id": id(11, back), "user_id": user, "date": JSONValue.string(dateString(day(o))), "steps": JSONValue.number(Double(6000 + back * 250)),
          "kcal": JSONValue.number(dayKcal), "protein_g": JSONValue.number(dayProtein), "carbs_g": 180, "fat_g": 54, "fiber_g": 18,
          "water_ml": JSONValue.number(Double(ml)), "sleep_duration_min": JSONValue.number(Double(asleep)), "sleep_quality": 4,
          "workout_count": JSONValue.number(trained ? 1 : 0), "volume_load": JSONValue.number(trained ? 1800 : 0),
          "readiness_score": JSONValue.number(Double(70 + back % 3 * 5)), "readiness_status": "good",
          "active_kcal": 420, "active_minutes": 45, "created_at": iso(at(o, 23)), "updated_at": iso(at(o, 23)),
        ])
      }
      t["workout_sessions"] = sessions
      t["daily_logs"] = daily
      t["water_logs"] = water
      t["sleep_logs"] = sleep
      t["weight_logs"] = weight
      t["meal_entries"] = meals
      t["meal_entry_items"] = items

      t["food_items"] = [
        ("Oatmeal", 380.0, 14.0, 60.0, 8.0, 80.0), ("Chicken & Rice", 650.0, 48.0, 70.0, 14.0, 350.0),
        ("Salmon Bowl", 720.0, 42.0, 60.0, 28.0, 400.0), ("Greek Yogurt", 150.0, 15.0, 8.0, 4.0, 170.0),
      ].enumerated().map { i, f -> Row in
        [
          "id": id(10, i + 1), "user_id": user, "name": JSONValue.string(f.0), "name_en": JSONValue.string(f.0), "brand": JSONValue.null,
          "kcal": JSONValue.number(f.1), "protein_g": JSONValue.number(f.2), "carbs_g": JSONValue.number(f.3), "fat_g": JSONValue.number(f.4),
          "fiber_g": 3, "serving_g": JSONValue.number(f.5), "is_favorite": JSONValue.bool(i == 3), "is_estimate": false,
          "source": "user", "created_at": created, "updated_at": created,
        ]
      }

      // Koa: ví có xu, một món đồ đang mặc.
      t["mascot_transactions"] = [
        ["id": id(12, 1), "user_id": user, "amount": 250, "reason": "seed", "ref_key": "e2e:seed",
         "created_at": created],
      ]
      t["mascot_inventory"] = [
        ["id": id(13, 1), "user_id": user, "item_key": "headband", "equipped": true, "purchased_at": created],
      ]
      // Mọi huy chương đã có sẵn: không có màn "Huy chương mới!" chen giữa một flow.
      t["awards"] = Awards.catalogue.enumerated().map { i, def -> Row in
        [
          "id": id(14, i + 1), "user_id": user, "award_key": def.key, "title": def.key, "description": "",
          "icon": def.icon, "tier": def.tier.rawValue, "earned_at": created,
        ]
      }
      return t.mapValues { $0.map(normalize) }
    }

    /// Trả lời mẫu của edge function; `nil` = hàm "chưa deploy" (404).
    static func edgeReply(_ name: String, body: JSONValue?) -> JSONValue? {
      switch name {
      case EdgeFunction.Name.smartNudges.rawValue:
        return json([
          "nudges": [
            [
              "type": "hydration", "priority": "medium",
              "message": "Sip some water before your workout — you have not logged any today.",
            ] as Row
          ]
        ] as Row)
      default:
        return nil
      }
    }

    /// Luồng SSE của `ai-coach` — một câu trả lời cố định.
    static let coachStream = Data(
      """
      data: {"choices":[{"delta":{"content":"Nice work today. Stay hydrated and hit your Full Body A session."}}]}

      data: [DONE]

      """.utf8)
  }
#endif
