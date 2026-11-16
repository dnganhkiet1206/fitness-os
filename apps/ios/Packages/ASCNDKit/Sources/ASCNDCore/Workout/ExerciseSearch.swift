public import Foundation

// Tìm bài tập và chống trùng (Kiệt 15/11, #527).
//
// Trước đây thư viện chỉ xếp theo "tên bắt đầu bằng / chứa chữ gõ": gõ "bench" thì
// ~20 biến thể (Bench Press with Chains, Reverse Band…) đứng ngang Bench Press;
// "db", "bp", "sqaut", "hít xà" không ra gì. Ở đây làm như các app tập lớn:
// 1. chuẩn hoá: bỏ dấu, chữ thường, bỏ dấu câu, bỏ từ nối, số nhiều về số ít,
//    ghép "pull up" → "pullup";
// 2. đồng nghĩa + viết tắt: db = dumbbell, bb = barbell, bp = bench press,
//    ohp, rdl, "tạ đơn" / "tạ đòn", "hít xà"…;
// 3. mỗi từ gõ khớp một từ của bài: đúng, đầu từ, hoặc sai một-hai chữ
//    (khoảng cách Damerau–Levenshtein);
// 4. điểm = độ khớp chữ + cụm khớp liền + tên ngắn gọn + độ phổ biến của bài.
//
// Chống trùng khi tạo bài (`ExerciseDuplicates`): so token (Jaccard + độ chứa),
// Jaro–Winkler trên chuỗi token đã xếp, phạt khi khác biến thể (incline / decline,
// front / back…) hay khác dụng cụ; ngưỡng giải thích ở `ExerciseDuplicates.threshold`.

/// Chuẩn hoá tên bài thành token — dùng chung cho tìm kiếm và chống trùng.
public enum ExerciseText {
  /// Cụm có dấu phải đổi TRƯỚC khi bỏ dấu: "tạ đơn" (dumbbell) và "tạ đòn"
  /// (barbell) cùng gập về "ta don".
  static let accentedPhrases: [(String, String)] = [
    ("tạ đơn", " dumbbell "), ("tạ đòn", " barbell "), ("tạ ấm", " kettlebell "), ("tạ bình vôi", " kettlebell "),
    ("máy", " machine "), ("dây cáp", " cable "), ("dây kháng lực", " band "),
  ]

  /// Cụm không dấu → token (sau khi gập dấu, trước khi tách).
  static let phrases: [(String, String)] = [
    ("hit xa", "pullup"), ("ho xa", "pullup"), ("hit dat", "pushup"), ("chong day", "pushup"),
    ("gap bung", "crunch"), ("nhay day", "rope jump"), ("bench press", "bench press"),
    ("day nguc", "bench press"), ("day vai", "shoulder press"), ("keo xa", "pulldown"),
  ]

  /// Từ gõ → các token chuẩn. Viết tắt quen dùng trong phòng tập.
  static let aliases: [String: [String]] = [
    "db": ["dumbbell"], "dbs": ["dumbbell"], "dumbell": ["dumbbell"], "bb": ["barbell"], "kb": ["kettlebell"],
    "bw": ["bodyweight"], "ez": ["ez"], "bp": ["bench", "press"], "ohp": ["overhead", "press"],
    "rdl": ["romanian", "deadlift"], "sldl": ["stiff", "leg", "deadlift"], "dl": ["deadlift"],
    "bss": ["bulgarian", "split", "squat"], "flye": ["fly"], "flie": ["fly"], "legged": ["leg"],
    "calve": ["calf"], "tricep": ["tricep"], "bicep": ["bicep"], "lats": ["lat"], "abdominal": ["ab"],
    "situp": ["situp"], "pushup": ["pushup"], "pullup": ["pullup"], "chinup": ["chinup"],
    "military": ["military"], "skullcrusher": ["skullcrusher"], "skull": ["skull"],
  ]

  static let notPlural: Set<String> = ["pres", "bis", "tris", "abs", "glutes"]

  /// Từ nối không mang nghĩa bài tập.
  static let stopWords: Set<String> = [
    "with", "the", "a", "an", "on", "to", "and", "for", "of", "in", "at", "from", "using", "voi", "va", "bang", "cua",
  ]

  /// Cặp từ viết rời thường gặp → một token ("pull up", "pull-up", "pullups").
  static let compounds: [String: Set<String>] = [
    "pull": ["up", "ups", "down", "downs", "through"], "push": ["up", "ups", "down", "downs"], "chin": ["up", "ups"],
    "sit": ["up", "ups"], "kick": ["back", "backs"], "step": ["up", "ups"], "skull": ["crusher", "crushers"],
  ]

  /// Gập dấu, đ → d, chữ thường; cụm có dấu đổi trước.
  static func fold(_ s: String) -> String {
    var t = s.lowercased()
    for (from, to) in accentedPhrases { t = t.replacingOccurrences(of: from, with: to) }
    return MuscleGroup.fold(t)
  }

  /// Số nhiều tiếng Anh về số ít: crunches → crunch, curls → curl, presses → press.
  static func singular(_ w: String) -> String {
    // "pres" là gõ thiếu của "press", không phải số nhiều của "pre".
    guard w.count > 3, w.allSatisfy(\.isLetter), !notPlural.contains(w) else { return w }
    for suffix in ["ches", "shes", "sses", "xes"] where w.hasSuffix(suffix) { return String(w.dropLast(2)) }
    if w.hasSuffix("ies"), w.count > 4 { return String(w.dropLast(3)) + "y" }
    if w.hasSuffix("s"), !w.hasSuffix("ss"), !w.hasSuffix("us") { return String(w.dropLast()) }
    return w
  }

  /// Tên → token chuẩn, giữ thứ tự, không trùng.
  public static func tokens(_ s: String) -> [String] {
    // "Landmine 180's", "Farmer’s walk": sở hữu cách không phải một từ.
    var t = " " + fold(s).replacingOccurrences(of: "'s", with: "").replacingOccurrences(of: "’s", with: "") + " "
    t = String(t.map { $0.isLetter || $0.isNumber ? $0 : " " })
    t = " " + t.split(separator: " ").joined(separator: " ") + " "
    for (from, to) in phrases { t = t.replacingOccurrences(of: " \(from) ", with: " \(to) ") }
    let raw = t.split(separator: " ").map(String.init)
    var merged: [String] = []
    var i = 0
    while i < raw.count {
      let w = raw[i]
      if i + 1 < raw.count, let next = compounds[w], next.contains(raw[i + 1]) || next.contains(singular(raw[i + 1])) {
        merged.append(w + singular(raw[i + 1]))
        i += 2
      } else {
        merged.append(w)
        i += 1
      }
    }
    var out: [String] = []
    for w in merged {
      let one = aliases[w] ?? aliases[singular(w)] ?? [singular(w)]
      for x in one where !stopWords.contains(x) && !out.contains(x) { out.append(x) }
    }
    return out
  }

  // MARK: - Khoảng cách chuỗi

  /// Damerau–Levenshtein (bản "optimal string alignment"): đổi hai chữ liền kề
  /// tính MỘT lỗi — "sqaut" → "squat" = 1.
  public static func editDistance(_ a: String, _ b: String) -> Int {
    let a = Array(a), b = Array(b)
    if a.isEmpty { return b.count }
    if b.isEmpty { return a.count }
    var d = Array(repeating: Array(repeating: 0, count: b.count + 1), count: a.count + 1)
    for i in 0...a.count { d[i][0] = i }
    for j in 0...b.count { d[0][j] = j }
    for i in 1...a.count {
      for j in 1...b.count {
        let cost = a[i - 1] == b[j - 1] ? 0 : 1
        d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
        if i > 1, j > 1, a[i - 1] == b[j - 2], a[i - 2] == b[j - 1] {
          d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
        }
      }
    }
    return d[a.count][b.count]
  }

  /// Jaro–Winkler (0…1), tiền tố tối đa 4, hệ số 0,1 — chuẩn của Winkler 1990.
  public static func jaroWinkler(_ s1: String, _ s2: String) -> Double {
    let a = Array(s1), b = Array(s2)
    if a.isEmpty && b.isEmpty { return 1 }
    if a.isEmpty || b.isEmpty { return 0 }
    let window = max(0, max(a.count, b.count) / 2 - 1)
    var aHit = Array(repeating: false, count: a.count), bHit = Array(repeating: false, count: b.count)
    var matches = 0
    for i in 0..<a.count {
      let lo = max(0, i - window), hi = min(b.count - 1, i + window)
      guard lo <= hi else { continue }
      for j in lo...hi where !bHit[j] && a[i] == b[j] {
        aHit[i] = true
        bHit[j] = true
        matches += 1
        break
      }
    }
    guard matches > 0 else { return 0 }
    var k = 0, transpositions = 0
    for i in 0..<a.count where aHit[i] {
      while !bHit[k] { k += 1 }
      if a[i] != b[k] { transpositions += 1 }
      k += 1
    }
    let m = Double(matches)
    let jaro = (m / Double(a.count) + m / Double(b.count) + (m - Double(transpositions) / 2) / m) / 3
    var prefix = 0
    while prefix < min(4, a.count, b.count), a[prefix] == b[prefix] { prefix += 1 }
    return jaro + Double(prefix) * 0.1 * (1 - jaro)
  }

  /// Lỗi gõ cho phép theo độ dài từ: < 4 chữ phải đúng (db, ab, lat…),
  /// 4–7 chữ một lỗi, ≥ 8 chữ hai lỗi — mức Algolia / Typesense dùng mặc định.
  static func typoBudget(_ length: Int) -> Int { length < 4 ? 0 : length < 8 ? 1 : 2 }

  /// Hai token coi là một (cho chống trùng): giống hệt hoặc trong mức lỗi gõ.
  static func sameToken(_ a: String, _ b: String) -> Bool {
    if a == b { return true }
    let budget = typoBudget(min(a.count, b.count))
    return budget > 0 && abs(a.count - b.count) <= budget && editDistance(a, b) <= budget
  }
}

/// Xếp hạng kết quả tìm bài — hàm thuần, dùng cho thư viện, builder và màn ghi tay.
public enum ExerciseSearch {
  /// Bài phổ biến (tên đúng như thư viện chung, gập bằng `PersonalRecords.exerciseKey`)
  /// → độ phổ biến 0…1. Danh sách soạn tay theo các bài cơ bản của chương trình
  /// tập phổ thông (bộ ba sức mạnh, đẩy / kéo / chân, bài máy hay gặp ở phòng tập);
  /// không có số liệu dùng thật (0 người dùng), khi có thì thay bằng số đếm.
  public static let popularity: [String: Double] = {
    let tiers: [(Double, [String])] = [
      (1.0, [
        "Bench Press", "Barbell Squat", "Deadlift", "Overhead Press", "Pull-up", "Lat Pulldown", "Barbell Row",
        "Dumbbell Curl", "Leg Press", "Romanian Deadlift", "Pushups",
      ]),
      (0.9, [
        "Dumbbell Bench Press", "Dumbbell Shoulder Press", "Side Lateral Raise", "Incline Dumbbell Press",
        "Barbell Incline Bench Press - Medium Grip", "Triceps Pushdown", "Seated Cable Rows", "Plank",
        "Barbell Hip Thrust", "Hammer Curls", "Barbell Curl", "Leg Extensions", "Lying Leg Curls",
        "One-Arm Dumbbell Row",
      ]),
      (0.8, [
        "Bent Over Barbell Row", "Bent Over Two-Dumbbell Row", "Dips - Triceps Version", "Chin-Up", "Crunches",
        "Dumbbell Lunges", "Standing Calf Raises", "Face Pull", "Goblet Squat", "Wide-Grip Lat Pulldown",
        "Seated Dumbbell Press", "Cable Crossover", "Dumbbell Flyes", "Stiff-Legged Dumbbell Deadlift",
      ]),
      (0.7, [
        "Front Barbell Squat", "Hack Squat", "Sumo Deadlift", "Barbell Shrug", "Dumbbell Shrug",
        "Arnold Dumbbell Press", "Preacher Curl", "EZ-Bar Skullcrusher", "Running, Treadmill",
        "Split Squat with Dumbbells", "Triceps Overhead Extension with Rope", "Hyperextensions (Back Extensions)",
        "Seated Calf Raise", "Tricep Dumbbell Kickback", "Reverse Flyes", "Incline Dumbbell Flyes",
      ]),
      (0.6, [
        "Machine Bench Press", "Smith Machine Squat", "Upright Barbell Row", "Russian Twist", "Mountain Climbers",
        "EZ-Bar Curl", "Incline Dumbbell Curl", "Machine Shoulder (Military) Press", "Close-Grip Barbell Bench Press",
      ]),
    ]
    // Trong một mức, bài đứng trước phổ biến hơn chút (0,001 / bậc): mục "Phổ biến"
    // ra Bench Press, Squat, Deadlift… thay vì theo ABC của thư viện.
    var out: [String: Double] = [:]
    for (w, names) in tiers {
      for (i, n) in names.enumerated() { out[PersonalRecords.exerciseKey(n)] = w - Double(i) * 0.001 }
    }
    return out
  }()

  /// Độ phổ biến của một bài (theo tên gốc, rồi tên tiếng Anh).
  public static func popularity(of e: LibraryExercise) -> Double {
    popularity[PersonalRecords.exerciseKey(e.name)]
      ?? e.localNames?["en"].flatMap { popularity[PersonalRecords.exerciseKey($0)] } ?? 0
  }

  /// Token đã chuẩn hoá của một bài, theo ba mức tin cậy.
  struct Entry {
    /// Tên gốc + tên theo ngôn ngữ (cả ba thứ tiếng).
    let primary: [String]
    /// Chữ tìm server dựng (tên bỏ dấu cả ba thứ tiếng) + dụng cụ.
    let secondary: Set<String>
    /// Nhóm cơ (en + vi): "chest", "nguc" — tìm theo nhóm vẫn ra nhưng xếp sau.
    let tertiary: Set<String>
    /// Tên gốc đã chuẩn hoá, nối bằng dấu cách — để so cụm liền.
    let nameLine: String

    init(_ e: LibraryExercise) {
      var p = ExerciseText.tokens(e.name)
      for n in [e.displayName] + (e.localNames.map { Array($0.values) } ?? []) {
        for t in ExerciseText.tokens(n) where !p.contains(t) { p.append(t) }
      }
      primary = p
      var s = Set(ExerciseText.tokens(e.searchText ?? ""))
      // Hai từ liền nhau viết dính: "benchpress", "legpress", "deadlift" đã là một.
      for i in p.indices.dropLast() { s.insert(p[i] + p[i + 1]) }
      if let gear = Equipment.canonical(e.equipment) { s.insert(gear.rawValue) }
      for t in ExerciseText.tokens(e.equipment ?? "") { s.insert(t) }
      secondary = s
      var m = Set<String>()
      for k in e.muscles {
        for t in ExerciseText.tokens(k.rawValue) + ExerciseText.tokens(k.label(.vi)) { m.insert(t) }
      }
      tertiary = m
      nameLine = ExerciseText.tokens(e.name).joined(separator: " ")
    }
  }

  /// Một từ gõ khớp một tập token: 1 đúng, 0,85 đầu từ, 0,7 sai chính tả
  /// (cả từ, hoặc đầu từ khi đang gõ dở từ cuối), 0 không khớp.
  static func tokenScore(_ q: String, in tokens: some Sequence<String>, last: Bool) -> Double {
    var best = 0.0
    let budget = ExerciseText.typoBudget(q.count)
    for t in tokens {
      if t == q { return 1 }
      if t.hasPrefix(q) {
        best = max(best, 0.85)
      } else if budget > 0, best < 0.7 {
        if abs(t.count - q.count) <= budget, ExerciseText.editDistance(q, t) <= budget {
          best = 0.7
        } else if last, t.count > q.count, ExerciseText.editDistance(q, String(t.prefix(q.count))) <= 1 {
          best = 0.6
        }
      }
    }
    return best
  }

  /// Điểm của một bài với chữ gõ; `nil` = không khớp. Lớn = tốt hơn.
  ///
  /// - textScore (0…1): trung bình điểm từng từ gõ; MỌI từ phải khớp. Khớp ở
  ///   chữ tìm phụ nhân 0,85, ở nhóm cơ nhân 0,5.
  /// - cụm liền: tên bắt đầu bằng cụm gõ +0,35, chứa cụm gõ +0,2.
  /// - gọn: tỉ lệ từ gõ / từ trong tên × 0,25 — "Bench Press" trước
  ///   "Bench Press with Chains".
  /// - phổ biến × 0,5 và dùng nhiều (`usage`, số lần đã ghi) tới +0,3: đủ để
  ///   bài quen vượt biến thể lạ cùng độ khớp, không đủ để một khớp sai chính tả
  ///   vượt một khớp đúng của bài khác ở cùng độ phổ biến.
  static func score(_ entry: Entry, query: [String], phrase: String, popularity: Double, usage: Int) -> Double? {
    guard !query.isEmpty else { return nil }
    var sum = 0.0
    for (i, q) in query.enumerated() {
      let last = i == query.count - 1
      let s = max(
        tokenScore(q, in: entry.primary, last: last),
        tokenScore(q, in: entry.secondary, last: last) * 0.85,
        tokenScore(q, in: entry.tertiary, last: last) * 0.5)
      guard s > 0 else { return nil }
      sum += s
    }
    var score = sum / Double(query.count)
    if entry.nameLine.hasPrefix(phrase) {
      score += 0.35
    } else if (" " + entry.nameLine).contains(" " + phrase) {
      score += 0.2
    }
    score += 0.25 * min(1, Double(query.count) / Double(max(entry.primary.count, 1)))
    score += 0.5 * popularity
    if usage > 0 { score += min(0.3, 0.1 * log2(Double(usage) + 1)) }
    return score
  }

  /// Lọc + xếp theo điểm. Chữ gõ rỗng → giữ nguyên danh sách. Cùng điểm giữ thứ
  /// tự thư viện. `usage`: số lần người dùng đã ghi mỗi bài (khoá `exerciseKey`).
  public static func rank(
    _ list: [LibraryExercise], query: String, usage: [String: Int] = [:]
  ) -> [LibraryExercise] {
    let q = ExerciseText.tokens(query)
    guard !q.isEmpty else {
      // Chữ gõ chỉ có dấu câu / từ nối: lọc theo chữ thô như trước.
      let raw = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return raw.isEmpty ? list : list.filter { ExerciseCatalog.matches($0, raw) }
    }
    let phrase = q.joined(separator: " ")
    let raw = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return list.enumerated()
      .compactMap { i, e -> (s: Double, i: Int, e: LibraryExercise)? in
        let pop = popularity(of: e)
        let use = usage[PersonalRecords.exerciseKey(e.name)] ?? 0
        if let s = score(Entry(e), query: q, phrase: phrase, popularity: pop, usage: use) { return (s, i, e) }
        // Lưới an toàn: chữ thô vẫn nằm trong tên (ký tự lạ, "3/4") thì không mất bài.
        return ExerciseCatalog.matches(e, raw) ? (0.3 + 0.5 * pop, i, e) : nil
      }
      .sorted { $0.s != $1.s ? $0.s > $1.s : $0.i < $1.i }
      .map(\.e)
  }

  /// Mục "Phổ biến" khi chưa gõ: bài phổ biến có trong danh sách, theo độ phổ
  /// biến (+ đã dùng nhiều), cùng mức giữ thứ tự thư viện; mỗi tên một lần.
  public static func popular(
    _ list: [LibraryExercise], limit: Int = 8, usage: [String: Int] = [:]
  ) -> [LibraryExercise] {
    var seen = Set<String>()
    return list.enumerated()
      .compactMap { i, e -> (s: Double, i: Int, e: LibraryExercise)? in
        let key = PersonalRecords.exerciseKey(e.name)
        let use = usage[key] ?? 0
        let s = popularity(of: e) + (use > 0 ? min(0.6, 0.2 * log2(Double(use) + 1)) : 0)
        guard s > 0 else { return nil }
        return (s, i, e)
      }
      .sorted { $0.s != $1.s ? $0.s > $1.s : $0.i < $1.i }
      .filter { seen.insert(PersonalRecords.exerciseKey($0.e.name)).inserted }
      .prefix(limit)
      .map(\.e)
  }
}

/// "Có phải bạn muốn…?" khi tạo bài mới.
public enum ExerciseDuplicates {
  public struct Match: Sendable, Hashable {
    public let exercise: LibraryExercise
    /// 0…1.
    public let score: Double
    /// Cùng tên sau chuẩn hoá (bỏ dấu, số nhiều, viết tắt, lỗi gõ nhẹ) và
    /// không khác dụng cụ: gần như chắc là trùng.
    public let exact: Bool
  }

  /// Ngưỡng gợi ý. Chọn bằng bộ cặp trong `ExerciseDuplicatesTests`:
  /// - cặp TRÙNG (lỗi gõ, đảo từ, viết tắt, số nhiều, thiếu dụng cụ) đều ≥ 0,78;
  /// - cặp KHÁC BÀI thật (incline / decline, front / back squat, leg curl / leg
  ///   extension, shoulder press / bench press) đều ≤ 0,62 sau khi phạt biến thể;
  /// - 0,7 nằm giữa hai cụm, nghiêng về phía gợi ý: gợi ý thừa chỉ tốn một chạm
  ///   "Vẫn tạo bài mới", bỏ sót thì sinh bài trùng làm rối lịch sử và kỷ lục.
  public static let threshold = 0.7
  public static let limit = 3

  /// Từ chỉ dụng cụ: tách khỏi tên để so riêng (Dumbbell vs Barbell Bench Press là
  /// hai bài khác nhau, nhưng "Bench Press" và "Barbell Bench Press" là một).
  static let gearWords: Set<String> = [
    "dumbbell", "barbell", "kettlebell", "cable", "machine", "bodyweight", "smith", "band", "ez",
  ]

  /// Tư thế: "seated db shoulder press" vẫn là Dumbbell Shoulder Press (bài này
  /// ngồi sẵn) — chỉ phạt nhẹ khi một bên nói thêm; hai bên nói hai tư thế khác
  /// nhau (lying vs seated leg curl) thì là khác bài.
  static let postureWords: Set<String> = ["seated", "standing", "lying", "single", "one", "alternating", "alternate"]

  /// Từ phân biệt biến thể: khác ở một trong các từ này là KHÁC bài.
  static let variantWords: Set<String> = [
    "incline", "decline", "flat", "front", "overhead", "close",
    "wide", "reverse", "sumo", "romanian", "stiff", "hack", "bulgarian", "goblet", "hammer", "preacher",
    "concentration", "split", "jump", "pause", "deficit", "upright", "narrow", "landmine", "zercher", "pendlay",
    "arnold", "military", "push", "rear", "lateral", "side", "curl", "extension", "raise", "fly", "row", "press",
    "squat", "deadlift", "lunge", "pulldown", "pullup", "chinup", "pushup", "dip", "shrug", "crunch", "plank",
  ]

  struct Shape {
    let core: [String]
    let gear: Set<String>
    let compact: String

    init(name: String, equipment: String?) {
      let t = ExerciseText.tokens(name)
      core = t.filter { !ExerciseDuplicates.gearWords.contains($0) }
      var g = Set(t.filter { ExerciseDuplicates.gearWords.contains($0) })
      if let e = Equipment.canonical(equipment) { g.insert(e.rawValue) }
      for w in ExerciseText.tokens(equipment ?? "") where ExerciseDuplicates.gearWords.contains(w) { g.insert(w) }
      gear = g
      compact = core.joined()
    }
  }

  /// Số token khớp nhau (cho phép lỗi gõ nhẹ), mỗi token dùng một lần.
  static func overlap(_ a: [String], _ b: [String]) -> Int {
    var used = Array(repeating: false, count: b.count)
    var n = 0
    for x in a {
      if let j = b.indices.first(where: { !used[$0] && ExerciseText.sameToken(x, b[$0]) }) {
        used[j] = true
        n += 1
      }
    }
    return n
  }

  /// Token của `a` không có bạn ở `b`.
  static func unmatched(_ a: [String], _ b: [String]) -> [String] {
    a.filter { x in !b.contains { ExerciseText.sameToken(x, $0) } }
  }

  /// Điểm giống nhau 0…1 giữa tên mới và một bài có sẵn.
  ///
  /// base = 0,35 × Jaccard + 0,35 × độ chứa (|A∩B| / min) + 0,3 × Jaro–Winkler
  /// trên token đã xếp (bắt lỗi gõ trong từ, không phụ thuộc thứ tự từ);
  /// − 0,25 khi khác từ biến thể (hay hai tư thế khác nhau), − 0,05 khi một bên
  /// nói thêm tư thế; − 0,35 khi hai bên nói hai dụng cụ khác nhau;
  /// + 0,05 cùng dụng cụ; + 0,05 cùng nhóm cơ, − 0,1 khác hẳn nhóm cơ.
  static func compare(
    _ new: Shape, muscles newMuscles: [MuscleGroup], with e: LibraryExercise
  ) -> (score: Double, exact: Bool) {
    let old = Shape(name: e.name, equipment: e.equipment)
    guard !new.core.isEmpty, !old.core.isEmpty else { return (0, false) }
    let gearConflict = !new.gear.isEmpty && !old.gear.isEmpty && new.gear.isDisjoint(with: old.gear)
    let shared = overlap(new.core, old.core)
    let sameCore = shared == new.core.count && shared == old.core.count
    let glued = new.compact == old.compact
      || (min(new.compact.count, old.compact.count) >= 8 && ExerciseText.editDistance(new.compact, old.compact) <= 1)
    if (sameCore || glued) && !gearConflict { return (1, true) }

    let union = new.core.count + old.core.count - shared
    let jaccard = Double(shared) / Double(max(union, 1))
    let contain = Double(shared) / Double(max(min(new.core.count, old.core.count), 1))
    let jw = ExerciseText.jaroWinkler(new.core.sorted().joined(separator: " "), old.core.sorted().joined(separator: " "))
    var s = 0.35 * jaccard + 0.35 * contain + 0.3 * jw
    if sameCore || glued { s = 0.95 }
    let onlyNew = unmatched(new.core, old.core), onlyOld = unmatched(old.core, new.core)
    let diff = onlyNew + onlyOld
    let postureClash = onlyNew.contains(where: postureWords.contains) && onlyOld.contains(where: postureWords.contains)
    if diff.contains(where: variantWords.contains) || postureClash {
      s -= 0.25
    } else if diff.contains(where: postureWords.contains) {
      s -= 0.05
    }
    if gearConflict {
      // Cùng tên khác dụng cụ là hai bài để theo dõi riêng (tạ đơn ≠ máy).
      s -= 0.35
    } else if !new.gear.isEmpty && !new.gear.isDisjoint(with: old.gear) {
      s += 0.05
    }
    let oldMuscles = e.muscles
    if !newMuscles.isEmpty && !oldMuscles.isEmpty {
      s += Set(newMuscles).isDisjoint(with: oldMuscles) ? -0.1 : 0.05
    }
    return (min(1, max(0, s)), false)
  }

  /// Bài có sẵn gần giống tên mới, tốt nhất trước, tối đa `limit`.
  /// - Parameters:
  ///   - muscleGroup / equipment: lựa chọn trong form (nhóm cơ chỉ cộng / trừ
  ///     điểm, không lọc — người dùng hay để mặc định "Ngực").
  public static func candidates(
    name: String, muscleGroup: String? = nil, equipment: String? = nil, in list: [LibraryExercise],
    limit: Int = limit
  ) -> [Match] {
    let shape = Shape(name: name, equipment: equipment)
    guard !shape.core.isEmpty else { return [] }
    let muscles = MuscleGroup.keys(for: muscleGroup)
    var seen = Set<String>()
    return list.enumerated()
      .compactMap { i, e -> (m: Match, i: Int)? in
        let r = compare(shape, muscles: muscles, with: e)
        guard r.score >= threshold else { return nil }
        return (Match(exercise: e, score: r.score, exact: r.exact), i)
      }
      .sorted {
        if $0.m.exact != $1.m.exact { return $0.m.exact }
        if $0.m.score != $1.m.score { return $0.m.score > $1.m.score }
        let p0 = ExerciseSearch.popularity(of: $0.m.exercise), p1 = ExerciseSearch.popularity(of: $1.m.exercise)
        return p0 != p1 ? p0 > p1 : $0.i < $1.i
      }
      .map(\.m)
      .filter { seen.insert(PersonalRecords.exerciseKey($0.exercise.name)).inserted }
      .prefix(limit)
      .map { $0 }
  }
}
