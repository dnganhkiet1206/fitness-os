import ASCNDCore
import Foundation
import Testing

private func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }

/// Set khởi động trong mẫu buổi tập và màn tập theo kế hoạch (18/10, chủ dự
/// án): ghi lại, hiện ngọn lửa, KHÔNG tính khối lượng / kỷ lục / số set.
struct TemplateWarmupTests {
  @Test func warmupRowsComeFirstWithTheirOwnKeys() {
    let rows = WorkoutPlanning.rows([
      TemplateExercise(exerciseName: "Squat", sets: 2, reps: 5, weightKg: 100, restSeconds: 180, warmupSets: 3),
      TemplateExercise(exerciseName: "Plank", sets: 1, reps: 0, weightKg: 0),
    ])
    #expect(rows.map(\.key) == ["0-w0", "0-w1", "0-w2", "0-0", "0-1", "1-0"], "khoá set làm việc không đổi")
    #expect(rows.map(\.warmup) == [true, true, true, false, false, false])
    #expect(rows.prefix(3).map(\.weightKg) == [50, 65, 80], "50% → 80%, bội 2,5 kg")
    #expect(rows[0].plannedRest == 60 && rows[3].plannedRest == 180)
    #expect(rows[0].reps == 5)
  }

  @Test(arguments: [(60.0, 1, [30.0]), (61.0, 2, [30.0, 47.5]), (0.0, 2, [0.0, 0.0])])
  func warmupWeightsRampAndRoundDown(work: Double, count: Int, want: [Double]) {
    #expect((0..<count).map { WorkoutPlanning.warmupWeight(work, set: $0, of: count) } == want)
  }

  @Test func jsonRoundTripsAndOldTemplatesStayIdentical() {
    let plain = TemplateExercise(exerciseName: "Row", sets: 3, reps: 10, weightKg: 40)
    #expect(plain.json["warmupSets"] == nil, "không khởi động → JSON như trước")
    let warm = TemplateExercise(exerciseName: "Row", sets: 3, reps: 10, weightKg: 40, warmupSets: 2)
    #expect(TemplateExercise(json: warm.json) == warm)
    #expect(TemplateExercise(json: json(#"{"exerciseName":"Row","warmupSets":9}"#)).warmupSets == 5, "kẹp 0…5")
    #expect(TemplateExercise(json: json(#"{"exerciseName":"Row","warmupSets":"x"}"#)).warmupSets == 0)
  }

  @Test func cachedTemplatesWithoutTheFieldStillDecode() throws {
    let old = #"{"exerciseName":"Row","sets":3,"reps":10,"weightKg":40,"rpe":7,"restSeconds":90}"#
    let e = try JSONDecoder().decode(TemplateExercise.self, from: Data(old.utf8))
    #expect(e.warmupSets == 0 && e.sets == 3)
    let again = try JSONDecoder().decode(TemplateExercise.self, from: JSONEncoder().encode(
      TemplateExercise(exerciseName: "Row", sets: 3, reps: 10, weightKg: 40, warmupSets: 2)))
    #expect(again.warmupSets == 2)
  }

  @Test func draftPatchKeepsAndSetsWarmups() {
    var d = TemplateDraft()
    d.toggle(id: "sq", name: "Squat")
    d.patch(0, warmupSets: 2)
    d.patch(0, sets: 4)
    #expect(d.items[0].warmupSets == 2 && d.items[0].sets == 4)
  }

  /// Hàng kế hoạch mang cờ khởi động vào buổi được ghi; người dùng đổi trong
  /// buổi thì cờ đổi theo; số set làm việc bỏ qua khởi động.
  @Test func sessionSetsCarryTheWarmupFlag() {
    let rows = WorkoutPlanning.rows([
      TemplateExercise(exerciseName: "Bench", sets: 2, reps: 8, weightKg: 60, warmupSets: 1)
    ])
    var p = DayProgress()
    for r in rows { p.done[r.key] = true }
    #expect(WorkoutDay.sessionSets(rows, p).map(\.warmup) == [true, false, false])
    #expect(rows.map { WorkoutDay.workingNumber($0, in: rows, p) } == [nil, 1, 2])

    WorkoutDay.toggleWarmup(rows[1], &p)  // set làm việc đầu → khởi động
    #expect(WorkoutDay.sessionSets(rows, p).map(\.warmup) == [true, true, false])
    #expect(rows.map { WorkoutDay.workingNumber($0, in: rows, p) } == [nil, nil, 1])
    WorkoutDay.toggleWarmup(rows[1], &p)
    #expect(p.warmup.isEmpty, "về đúng kế hoạch thì không còn ghi đè")
    WorkoutDay.toggleWarmup(rows[0], &p)  // khởi động → set làm việc
    #expect(WorkoutDay.sessionSets(rows, p).map(\.warmup) == [false, false, false])
  }

  /// Điểm quay lại cũ (không có `warmup`) vẫn đọc được.
  @Test func oldProgressBlobsDecode() throws {
    let p = try JSONDecoder().decode(DayProgress.self, from: Data(#"{"done":{"0-0":true}}"#.utf8))
    #expect(p.warmup.isEmpty && p.done["0-0"] == true)
  }
}

/// Tiến độ và "set kế tiếp" bỏ qua khởi động (18/10).
struct WarmupFocusTests {
  let rows = WorkoutPlanning.rows([
    TemplateExercise(exerciseName: "Bench", sets: 2, reps: 8, weightKg: 60, warmupSets: 2),
    TemplateExercise(exerciseName: "Row", sets: 1, reps: 10, weightKg: 40),
  ])

  @Test func progressCountsWorkingSetsOnly() {
    var p = DayProgress()
    p.done = ["0-w0": true, "0-0": true]
    let ex = WorkoutFocus.exercises(rows, p)
    #expect(ex.map(\.done) == [1, 0] && ex.map(\.total) == [2, 1])
    p.done["0-1"] = true
    #expect(WorkoutFocus.exercises(rows, p)[0].isComplete, "xong set làm việc là xong bài, dù bỏ một khởi động")
  }

  @Test func skippedWarmupsAreNotNext() {
    var p = DayProgress()
    #expect(WorkoutFocus.next(rows, p)?.key == "0-w0", "chưa bắt đầu: khởi động trước")
    p.done["0-0"] = true  // vào thẳng set làm việc
    #expect(WorkoutFocus.next(rows, p)?.key == "0-1")
    p.done["0-1"] = true
    #expect(WorkoutFocus.next(rows, p)?.key == "1-0", "không quay lại khởi động đã bỏ")
  }
}

/// Danh sách chọn bài của builder xếp theo độ khớp khi có chữ tìm (18/10).
struct BuilderSearchRankTests {
  @Test func benchPressComesFirst() {
    let lib = ["Barbell Rollout from Bench", "Flat Bench Leg Pull-In", "Bench Press", "Squat"]
      .enumerated().map { LibraryExercise(id: "e\($0.offset)", userId: nil, name: $0.element, muscleGroup: "chest", equipment: nil, kind: nil) }
    #expect(TemplateDraft.visible(lib, group: nil, search: "bench").map(\.name)
      == ["Bench Press", "Barbell Rollout from Bench", "Flat Bench Leg Pull-In"])
    #expect(TemplateDraft.visible(lib, group: nil, search: "").map(\.name) == lib.map(\.name), "không tìm: giữ thứ tự")
  }
}

/// Kéo thả thứ tự bài (19/10, "như Apple Music").
@MainActor
struct ExerciseOrderTests {
  @Test func draftMoveMatchesListOnMove() {
    var d = TemplateDraft()
    for (id, n) in [("a", "A"), ("b", "B"), ("c", "C"), ("d", "D")] { d.toggle(id: id, name: n) }
    d.move(fromOffsets: IndexSet(integer: 0), toOffset: 3)  // kéo A xuống sau C
    #expect(d.items.map(\.exerciseName) == ["B", "C", "A", "D"])
    d.move(fromOffsets: IndexSet(integer: 3), toOffset: 0)  // kéo D lên đầu
    #expect(d.items.map(\.exerciseName) == ["D", "B", "C", "A"])
  }

  @Test func rowsFollowTheDraggedOrder() {
    let rows = WorkoutPlanning.rows([
      TemplateExercise(exerciseId: "bench", exerciseName: "Bench", sets: 2, reps: 8, weightKg: 60, warmupSets: 1),
      TemplateExercise(exerciseId: "row", exerciseName: "Row", sets: 1, reps: 10, weightKg: 40),
      TemplateExercise(exerciseId: "curl", exerciseName: "Curl", sets: 1, reps: 12, weightKg: 10),
    ])
    let o = WorkoutDay.ordered(rows, by: ["curl", "bench"])
    #expect(o.map(\.key) == ["2-0", "0-w0", "0-0", "0-1", "1-0"], "set trong bài giữ thứ tự; bài không có trong order đứng sau")
    #expect(WorkoutDay.ordered(rows, by: []) == rows)
  }

  @Test func oldProgressHasNoOrder() throws {
    let p = try JSONDecoder().decode(DayProgress.self, from: Data(#"{"done":{}}"#.utf8))
    #expect(p.order.isEmpty)
  }
}
