public import Foundation

/// Luật thuần của feed Cộng đồng (#527) @ fac9ac2:
/// - `hooks/use-community.ts`: `readWorkoutPayload`, `readProgressPayload`,
///   `readDiscoverKinds` — payload là JSON server dựng, nhưng bài cũ / seed viết
///   tay có thể thiếu trường, nên đọc phòng thủ từng trường, thẻ không bao giờ nổ;
/// - `lib/recipe-post.ts`: `readRecipePayload` — tổng tính lại từ các dòng, không
///   tin trường tổng của payload;
/// - `lib/feed-page.ts`: con trỏ khoá `(created_at, id)` và bộ lọc PostgREST;
/// - `lib/time-ago.ts`: "vừa xong / n phút / n giờ / n ngày", quá 7 ngày là ngày.
///
/// Golden: `Fixtures/community-feed-golden.json` — chính mã RN biên dịch
/// (`gen-community-feed.mjs`; hàm của file hook trích nguyên văn bằng
/// `extract-community.mjs`).
public enum CommunityPayloads {
  // MARK: - Số kiểu JS

  /// `num` của `use-community.ts`: số hữu hạn dùng thẳng (kể cả 0 / âm); còn
  /// lại `Number(v) || d`.
  static func num(_ v: JSONValue?, _ d: Double = 0) -> Double {
    if case .number(let n)? = v, n.isFinite { return n }
    let x = JS.number(v)
    return JS.truthy(x) ? x : d
  }

  /// `num` của `recipe-post.ts`: chỉ số > 0 hữu hạn (chuỗi rỗng / lạ → 0).
  static func positive(_ v: JSONValue?) -> Double {
    let n: Double
    switch v {
    case .number(let x)?: n = x
    case .string(let s)? where !RepEntry.trimJS(s).isEmpty: n = JS.number(v)
    default: n = .nan
    }
    return n.isFinite && n > 0 ? n : 0
  }

  static func object(_ v: JSONValue?) -> [String: JSONValue] {
    if case .object(let o)? = v { return o }
    return [:]
  }

  static func array(_ v: JSONValue?) -> [JSONValue]? {
    if case .array(let a)? = v { return a }
    return nil
  }

  // MARK: - Workout

  public struct WorkoutLine: Sendable, Hashable {
    public let exerciseId: String?
    public let exerciseName: String
    public let library: Bool
    public let sets: Double
    public let weight: Double
    public let reps: Double
  }

  public struct Workout: Sendable, Hashable {
    public let title: String?
    public let performedAt: String?
    public let volumeKg: Double
    public let pr: Bool
    public let minutes: Double?
    public let exerciseCount: Double
    public let exercises: [WorkoutLine]
  }

  public static func workout(_ raw: JSONValue?) -> Workout {
    let p = object(raw)
    let exercises = (array(p["exercises"]) ?? []).map { e -> WorkoutLine in
      let x = object(e)
      let id = x["exerciseId"]?.stringValue
      return WorkoutLine(
        exerciseId: (id?.isEmpty == false) ? id : nil, exerciseName: x["exerciseName"]?.stringValue ?? "?",
        library: x["library"] == .bool(true), sets: num(x["sets"]), weight: num(x["weight"]), reps: num(x["reps"]))
    }
    let minutes = num(p["minutes"], .nan)
    let title = p["title"]?.stringValue
    return Workout(
      title: title.flatMap { RepEntry.trimJS($0).isEmpty ? nil : $0 }, performedAt: p["performedAt"]?.stringValue,
      volumeKg: num(p["volumeKg"]), pr: p["pr"] == .bool(true),
      minutes: minutes.isFinite && minutes > 0 ? minutes : nil,
      exerciseCount: num(p["exerciseCount"], Double(exercises.count)), exercises: exercises)
  }

  // MARK: - Progress

  public struct Metric: Sendable, Hashable {
    public let start: Double
    public let end: Double
    public let series: [Double]
  }

  public struct Progress: Sendable, Hashable {
    public let weeks: Double
    public let weight: Metric?
    public let waist: Metric?
    public let lift: Metric?
    public let liftName: String?
  }

  static func metric(_ v: JSONValue?) -> Metric? {
    guard case .object(let o)? = v else { return nil }
    let series = (array(o["series"]) ?? []).map { num($0) }
    guard JS.number(o["start"]).isFinite, JS.number(o["end"]).isFinite else { return nil }
    return Metric(start: num(o["start"]), end: num(o["end"]), series: series)
  }

  public static func progress(_ raw: JSONValue?) -> Progress {
    let p = object(raw)
    let lift = metric(p["lift"])
    let name = object(p["lift"])["name"]?.stringValue ?? ""
    let hasLift = lift != nil && !name.isEmpty
    return Progress(
      weeks: num(p["weeks"], 12), weight: metric(p["weight"]), waist: metric(p["waist"]),
      lift: hasLift ? lift : nil, liftName: hasLift ? name : nil)
  }

  // MARK: - Recipe

  public struct Ingredient: Sendable, Hashable {
    public let name: String
    public let grams: Double?
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
  }

  public struct Recipe: Sendable, Hashable {
    public let title: String
    public let mealType: String?
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let ingredients: [Ingredient]
  }

  public static func recipe(_ raw: JSONValue?) -> Recipe {
    let o = object(raw)
    let str = { (v: JSONValue?) -> String in v?.stringValue.map(RepEntry.trimJS) ?? "" }
    let ingredients = (array(o["ingredients"]) ?? []).compactMap { x -> Ingredient? in
      guard case .object(let i) = x else { return nil }
      let g = positive(i["grams"])
      let name = str(i["name"])
      return Ingredient(
        name: name.isEmpty ? "?" : name, grams: g > 0 ? g : nil, kcal: positive(i["kcal"]),
        protein: positive(i["protein"]), carbs: positive(i["carbs"]), fat: positive(i["fat"]))
    }
    let mealType = str(o["mealType"])
    return Recipe(
      title: str(o["title"]), mealType: mealType.isEmpty ? nil : mealType,
      kcal: ingredients.reduce(0) { $0 + $1.kcal }, protein: ingredients.reduce(0) { $0 + $1.protein },
      carbs: ingredients.reduce(0) { $0 + $1.carbs }, fat: ingredients.reduce(0) { $0 + $1.fat },
      ingredients: ingredients)
  }

  // MARK: - Khám phá

  public static let discoverKinds = ["workout", "progress", "recipe"]

  /// Loại bài hợp lệ theo thứ tự catalog; rỗng / lạ / chưa có dòng = cả ba.
  public static func discover(_ v: JSONValue?) -> [String] {
    guard let a = array(v) else { return discoverKinds }
    let ok = discoverKinds.filter { a.contains(.string($0)) }
    return ok.isEmpty ? discoverKinds : ok
  }

  // MARK: - Phân trang

  public struct Cursor: Sendable, Hashable {
    public let at: String
    public let id: String
    /// Trang "mới hơn" (đi ngược lên).
    public let newer: Bool
    public init(at: String, id: String, newer: Bool = false) {
      self.at = at
      self.id = id
      self.newer = newer
    }
  }

  public static func nextCursor(_ page: [(createdAt: String, id: String)], size: Int) -> Cursor? {
    guard page.count >= size, let last = page.last else { return nil }
    return Cursor(at: last.createdAt, id: last.id)
  }

  public static func prevCursor(_ first: [(createdAt: String, id: String)], param: Cursor?, size: Int) -> Cursor? {
    guard let param else { return nil }
    if param.newer && first.count < size { return nil }
    guard let top = first.first else { return nil }
    return Cursor(at: top.createdAt, id: top.id, newer: true)
  }

  /// Bộ lọc `.or(...)` của PostgREST cho trang cũ hơn con trỏ.
  public static func olderThan(_ c: Cursor, idCol: String = "id") -> String {
    "created_at.lt.\"\(c.at)\",and(created_at.eq.\"\(c.at)\",\(idCol).lt.\"\(c.id)\")"
  }

  public static func newerThan(_ c: Cursor, idCol: String = "id") -> String {
    "created_at.gt.\"\(c.at)\",and(created_at.eq.\"\(c.at)\",\(idCol).gt.\"\(c.id)\")"
  }

  // MARK: - Thời gian

  public enum Ago: Sendable, Hashable {
    case justNow
    case minutes(Int)
    case hours(Int)
    case days(Int)
    /// Quá 7 ngày: in ngày (theo locale của app).
    case date(Date)
    /// Không đọc được mốc: RN in chuỗi rỗng.
    case invalid
  }

  public static func ago(_ iso: String, now: EpochMillis) -> Ago {
    guard let t = EpochMillis(iso8601: iso) else { return .invalid }
    let min = max(0, Int(((Double(now.millis - t.millis)) / 60_000).rounded(.down)))
    if min < 1 { return .justNow }
    if min < 60 { return .minutes(min) }
    let h = min / 60
    if h < 24 { return .hours(h) }
    let d = h / 24
    if d <= 7 { return .days(d) }
    return .date(Date(timeIntervalSince1970: TimeInterval(t.millis) / 1000))
  }
}
