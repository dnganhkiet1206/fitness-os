@testable import ASCNDCore
import Foundation
import Testing

/// Tìm bài và chống trùng (15/11) trên THƯ VIỆN THẬT: 10 bài gốc + 872 bài
/// free-exercise-db, chép từ migration (`Fixtures/exercise-library.json`).
enum RealLibrary {
  static let all: [LibraryExercise] = {
    guard let url = Bundle.module.url(forResource: "exercise-library", withExtension: "json", subdirectory: "Fixtures"),
      let data = try? Data(contentsOf: url),
      let root = try? JSONDecoder().decode(JSONValue.self, from: data),
      case .array(let rows)? = root["exercises"]
    else { return [] }
    let list = rows.map { r in
      LibraryExercise(
        id: r["id"]?.stringValue ?? "", userId: nil, name: r["name"]?.stringValue ?? "",
        muscleGroup: r["muscle"]?.stringValue, equipment: r["equipment"]?.stringValue, kind: nil,
        localNames: ["vi": r["vi"]?.stringValue ?? "", "en": r["en"]?.stringValue ?? "", "es": r["es"]?.stringValue ?? ""],
        searchText: r["search"]?.stringValue)
    }
    // Thứ tự server: nhóm cơ rồi tên.
    return list.sorted { ($0.muscleGroup ?? "", $0.name) < ($1.muscleGroup ?? "", $1.name) }
  }()

  static func top(_ q: String, _ n: Int = 3) -> [String] {
    Array(ExerciseSearch.rank(all, query: q).prefix(n)).map(\.name)
  }
}

struct ExerciseTextTests {
  @Test func tokensNormalise() {
    #expect(ExerciseText.tokens("Pull-ups") == ["pullup"])
    #expect(ExerciseText.tokens("pull up") == ["pullup"])
    #expect(ExerciseText.tokens("Hít xà") == ["pullup"])
    #expect(ExerciseText.tokens("Crunches") == ["crunch"])
    #expect(ExerciseText.tokens("Hammer Curls") == ["hammer", "curl"])
    #expect(ExerciseText.tokens("DB bench press") == ["dumbbell", "bench", "press"])
    #expect(ExerciseText.tokens("bp") == ["bench", "press"])
    #expect(ExerciseText.tokens("Squat with the bar") == ["squat", "bar"])
    // Có dấu: "tạ đơn" ≠ "tạ đòn" dù gập dấu cùng ra "ta don".
    #expect(ExerciseText.tokens("Curl tạ đơn") == ["curl", "dumbbell"])
    #expect(ExerciseText.tokens("Đẩy ngực tạ đòn") == ["bench", "press", "barbell"])
    #expect(ExerciseText.tokens("Lat pull down") == ["lat", "pulldown"])
  }

  @Test func distances() {
    #expect(ExerciseText.editDistance("sqaut", "squat") == 1)
    #expect(ExerciseText.editDistance("deadlfit", "deadlift") == 1)
    #expect(ExerciseText.editDistance("incline", "decline") == 2)
    #expect(abs(ExerciseText.jaroWinkler("martha", "marhta") - 0.9611) < 0.001)
    #expect(abs(ExerciseText.jaroWinkler("dixon", "dicksonx") - 0.8133) < 0.001)
    #expect(ExerciseText.jaroWinkler("", "") == 1)
    #expect(ExerciseText.typoBudget(3) == 0 && ExerciseText.typoBudget(5) == 1 && ExerciseText.typoBudget(9) == 2)
  }
}

struct ExerciseSearchTests {
  @Test func libraryLoaded() {
    #expect(RealLibrary.all.count == 882)
  }

  /// Bài phổ biến trước các biến thể lạ (trước đây "bench" ra chuỗi bài ABC).
  @Test func popularFirst() {
    #expect(RealLibrary.top("bench").first == "Bench Press")
    #expect(Set(RealLibrary.top("bench", 3)).isSubset(of: [
      "Bench Press", "Dumbbell Bench Press", "Barbell Incline Bench Press - Medium Grip",
    ]))
    #expect(RealLibrary.top("squat").first == "Barbell Squat")
    #expect(RealLibrary.top("deadlift").first == "Deadlift")
    #expect(RealLibrary.top("curl").first == "Dumbbell Curl")
    #expect(RealLibrary.top("row").first == "Barbell Row")
    #expect(RealLibrary.top("shoulder press").first == "Dumbbell Shoulder Press")
    #expect(RealLibrary.top("lat").first == "Lat Pulldown")
    #expect(RealLibrary.top("push up").first == "Pushups")
    #expect(RealLibrary.top("pushup").first == "Pushups")
    #expect(RealLibrary.top("plank").first == "Plank")
  }

  @Test func abbreviations() {
    #expect(RealLibrary.top("bp").first == "Bench Press")
    #expect(RealLibrary.top("ohp").first == "Overhead Press")
    #expect(RealLibrary.top("rdl").first == "Romanian Deadlift")
    #expect(RealLibrary.top("db curl").first == "Dumbbell Curl")
    #expect(RealLibrary.top("db bench").first == "Dumbbell Bench Press")
    let dbPress = RealLibrary.top("db press", 5)
    #expect(dbPress.contains("Dumbbell Shoulder Press") && dbPress.contains("Dumbbell Bench Press"))
    #expect(RealLibrary.top("lat pull down").first == "Lat Pulldown")
    #expect(RealLibrary.top("pull ups").first == "Pull-up")
  }

  @Test func vietnameseWithAndWithoutAccents() {
    #expect(RealLibrary.top("hít xà").first == "Pull-up")
    #expect(RealLibrary.top("hit xa").first == "Pull-up")
    #expect(RealLibrary.top("đẩy ngực").first == "Bench Press")
    #expect(RealLibrary.top("day nguc").first == "Bench Press")
    #expect(RealLibrary.top("chèo tạ đòn").first == "Barbell Row")
    #expect(RealLibrary.top("curl tạ đơn").first == "Dumbbell Curl")
  }

  @Test func typos() {
    #expect(RealLibrary.top("sqaut").first == "Barbell Squat")
    #expect(RealLibrary.top("deadlfit").first == "Deadlift")
    #expect(RealLibrary.top("bench pres").first == "Bench Press")
    #expect(RealLibrary.top("benchpress").isEmpty == false)
    #expect(RealLibrary.top("romainan deadlift").first == "Romanian Deadlift")
    #expect(RealLibrary.top("lateral raises").first == "Side Lateral Raise")
  }

  /// Bàn phím Telex đổi chữ tiếng Anh (16/11, thấy trên simulator): vẫn ra đúng bài.
  @Test func telexMangledEnglish() {
    #expect(ExerciseText.untelex("củl") == "curl")
    #expect(ExerciseText.untelex("prés") == "press")
    #expect(ExerciseText.untelex("đẩy") == "ddaary")
    #expect(ExerciseText.untelex("squat") == "squat")
    #expect(RealLibrary.top("củl").first == "Dumbbell Curl")
    #expect(RealLibrary.top("bench prés").first == "Bench Press")
    // Tiếng Việt thật vẫn tìm như cũ.
    #expect(RealLibrary.top("đẩy ngực").first == "Bench Press")
  }

  /// Gõ dở từ cuối vẫn ra (đầu từ), và chữ không liên quan không ra gì.
  @Test func prefixAndNoise() {
    #expect(RealLibrary.top("benc").first == "Bench Press")
    #expect(RealLibrary.top("dumbbell sh").first == "Dumbbell Shoulder Press")
    #expect(RealLibrary.top("zzzz").isEmpty)
    // Từ quá ngắn không được sửa lỗi: "ab" không ra "lat".
    #expect(!ExerciseSearch.rank(RealLibrary.all, query: "ab").map(\.name).contains("Lat Pulldown"))
  }

  /// Bài đã dùng nhiều lên trước ở cùng độ khớp.
  @Test func usageBoost() {
    let base = RealLibrary.top("incline dumbbell", 1)
    #expect(base.first == "Incline Dumbbell Press")
    let used = ExerciseSearch.rank(RealLibrary.all, query: "incline dumbbell", usage: ["incline dumbbell curl": 20])
    #expect(used.first?.name == "Incline Dumbbell Curl")
  }

  @Test func popularList() {
    let p = ExerciseSearch.popular(RealLibrary.all, limit: 11).map(\.name)
    #expect(Set(p) == [
      "Bench Press", "Barbell Squat", "Deadlift", "Overhead Press", "Pull-up", "Lat Pulldown", "Barbell Row",
      "Dumbbell Curl", "Leg Press", "Romanian Deadlift", "Pushups",
    ])
    // Mọi tên trong danh sách phổ biến đều có thật trong thư viện (không gõ nhầm).
    let names = Set(RealLibrary.all.map { PersonalRecords.exerciseKey($0.name) })
    for key in ExerciseSearch.popularity.keys { #expect(names.contains(key), "\(key)") }
  }

  /// Màn ghi tay: ô trống gợi ý bài phổ biến; có chữ thì như thư viện.
  @MainActor @Test func manualLogSuggestions() {
    #expect(ManualLogController.suggestions(for: "", in: RealLibrary.all).count == 5)
    #expect(ManualLogController.suggestions(for: "", in: RealLibrary.all).allSatisfy {
      ExerciseSearch.popularity(of: $0) > 0.98
    })
    #expect(ExerciseSearch.popular(RealLibrary.all, limit: 3).map(\.name) == ["Bench Press", "Barbell Squat", "Deadlift"])
    #expect(ManualLogController.suggestions(for: "bp", in: RealLibrary.all).first?.name == "Bench Press")
  }
}

/// Chống trùng: mỗi cặp ghi rõ vì sao phải (không) gợi ý. Ngưỡng 0,7 được chọn
/// để hai cụm dưới đây tách nhau (`ExerciseDuplicates.threshold`).
struct ExerciseDuplicatesTests {
  private func ex(_ name: String, _ muscle: String, _ gear: String?) -> LibraryExercise {
    LibraryExercise(id: name, userId: nil, name: name, muscleGroup: muscle, equipment: gear, kind: nil)
  }

  private func score(_ new: String, _ old: LibraryExercise, muscle: String? = nil, gear: String? = nil) -> Double {
    ExerciseDuplicates.compare(
      .init(name: new, equipment: gear), muscles: MuscleGroup.keys(for: muscle), with: old
    ).score
  }

  /// Cặp TRÙNG: phải gợi ý.
  @Test func duplicatesAreSuggested() {
    let cases: [(String, LibraryExercise)] = [
      ("bench pres", ex("Bench Press", "chest", "barbell")),               // lỗi gõ
      ("press bench", ex("Bench Press", "chest", "barbell")),              // đảo từ
      ("benchpress", ex("Bench Press", "chest", "barbell")),               // dính chữ
      ("Barbell bench press", ex("Bench Press", "chest", "barbell")),      // thêm dụng cụ đúng
      ("bench press db", ex("Dumbbell Bench Press", "chest", "dumbbell")), // viết tắt dụng cụ
      ("hammer curl", ex("Hammer Curls", "biceps", "dumbbell")),           // số nhiều
      ("pull ups", ex("Pull-up", "back", "bodyweight")),                   // gạch nối
      ("hít xà", ex("Pull-up", "back", "bodyweight")),                     // tiếng Việt
      ("lat pull down", ex("Lat Pulldown", "back", "cable")),
      ("romainan deadlift", ex("Romanian Deadlift", "legs", "barbell")),
      ("incline bench press", ex("Barbell Incline Bench Press - Medium Grip", "chest", "barbell")), // tên dài chứa tên ngắn
      ("seated db shoulder press", ex("Dumbbell Shoulder Press", "shoulders", "dumbbell")),
    ]
    for (new, old) in cases {
      let s = score(new, old)
      #expect(s >= 0.78, "\(new) ~ \(old.name): \(s)")
    }
  }

  /// Cặp KHÁC bài: không được gợi ý (dù chữ gần nhau).
  @Test func distinctExercisesAreNot() {
    let cases: [(String, LibraryExercise)] = [
      ("incline bench press", ex("Decline Barbell Bench Press", "chest", "barbell")),
      ("front squat", ex("Barbell Squat", "legs", "barbell")),
      ("leg curl", ex("Leg Extensions", "legs", "machine")),
      ("shoulder press", ex("Bench Press", "chest", "barbell")),
      ("hammer curl", ex("Dumbbell Curl", "biceps", "dumbbell")),
      ("dumbbell bench press", ex("Machine Bench Press", "chest", "machine")),
      ("sumo deadlift", ex("Romanian Deadlift", "legs", "barbell")),
      ("cable fly", ex("Cable Crossover", "chest", "cable")),
      ("lying leg curl", ex("Seated Leg Curl", "legs", "machine")),
      ("lateral raise", ex("Front Raise", "shoulders", "dumbbell")),
      ("calf raise", ex("Side Lateral Raise", "shoulders", "dumbbell")),
    ]
    for (new, old) in cases {
      let s = score(new, old)
      #expect(s <= 0.62, "\(new) ≁ \(old.name): \(s)")
    }
  }

  @Test func thresholdSitsBetween() {
    #expect(ExerciseDuplicates.threshold > 0.62 && ExerciseDuplicates.threshold < 0.78)
  }

  /// Trên thư viện thật: mock 3 của Kiệt — "bench pres db" gợi ý Dumbbell Bench Press trước.
  @Test func realLibraryCandidates() {
    let m = ExerciseDuplicates.candidates(name: "bench pres db", muscleGroup: "chest", in: RealLibrary.all)
    #expect(m.first?.exercise.name == "Dumbbell Bench Press")
    #expect(m.first?.exact == true)
    #expect(m.count <= ExerciseDuplicates.limit)

    #expect(ExerciseDuplicates.candidates(name: "Squats", in: RealLibrary.all).first?.exercise.name == "Barbell Squat")
    #expect(ExerciseDuplicates.candidates(name: "pullups", in: RealLibrary.all).first?.exact == true)
    // Tên thật sự mới thì không làm phiền.
    #expect(ExerciseDuplicates.candidates(name: "Koa jumping jacks dance", in: RealLibrary.all).isEmpty)
    #expect(ExerciseDuplicates.candidates(name: "Zombie walk", in: RealLibrary.all).isEmpty)
    // Có sẵn trong thư viện (sở hữu cách "180's" không phải một từ).
    #expect(ExerciseDuplicates.candidates(name: "Landmine 180", in: RealLibrary.all).first?.exact == true)
    #expect(ExerciseDuplicates.candidates(name: "   ", in: RealLibrary.all).isEmpty)
  }

  /// Dụng cụ chọn trong form cũng tính: chọn "dumbbell" thì Bench Press tạ đòn tụt
  /// xuống dưới Dumbbell Bench Press.
  @Test func formEquipmentCounts() {
    let barbell = ex("Bench Press", "chest", "barbell")
    let dumbbell = ex("Dumbbell Bench Press", "chest", "dumbbell")
    let m = ExerciseDuplicates.candidates(name: "bench press", equipment: "Dumbbell", in: [barbell, dumbbell])
    #expect(m.first?.exercise.name == "Dumbbell Bench Press")
  }
}

struct ExerciseNameDisplayTests {
  /// Tên tiếng Anh là tên chính, tên theo ngôn ngữ app là dòng phụ (Kiệt 15/11).
  @Test func englishFirst() {
    let ohp = LibraryExercise(
      id: "1", userId: nil, name: "Overhead Press", muscleGroup: "shoulders", equipment: "barbell", kind: nil,
      localNames: ["vi": "Đẩy vai qua đầu", "en": "Overhead Press", "es": "Press militar"])
    #expect(ohp.primaryName == "Overhead Press")
    let bench = LibraryExercise(
      id: "2", userId: nil, name: "Bench Press", muscleGroup: "chest", equipment: nil, kind: nil,
      localNames: ["vi": "Bench Press", "en": "Bench Press"])
    #expect(bench.localSubtitle == nil)
    let own = LibraryExercise(id: "3", userId: "u", name: "Đẩy ngực máy", muscleGroup: "chest", equipment: nil, kind: nil)
    #expect(own.primaryName == "Đẩy ngực máy" && own.localSubtitle == nil)
  }
}

struct ExercisePopularFirstTests {
  @Test func popularFirstKeepsRest() {
    let out = ExerciseSearch.popularFirst(RealLibrary.all)
    #expect(out.count == RealLibrary.all.count)
    #expect(Array(out.prefix(3)).map(\.name) == ["Bench Press", "Barbell Squat", "Deadlift"])
    // Phần không phổ biến giữ nguyên thứ tự thư viện.
    let rest = out.filter { ExerciseSearch.popularity(of: $0) == 0 }.map(\.id)
    #expect(rest == RealLibrary.all.filter { ExerciseSearch.popularity(of: $0) == 0 }.map(\.id))
  }
}
