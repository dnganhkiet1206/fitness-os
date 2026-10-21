/// Chương trình khởi đầu của onboarding (#527 đợt 3, Kiệt duyệt 20/10
/// `docs/design/mocks/koa-wave3-activation.html`).
///
/// Người mới chọn số buổi / tuần, ngày tập và nơi tập; app tạo sẵn mẫu buổi tập
/// và kế hoạch tuần thật (qua `PlanEditor`, như người dùng tự làm ở Kế hoạch
/// tuần) — để Koa có nhiệm vụ chính, lời nhắc và ngày nghỉ ngay từ ngày đầu.
/// Mọi bài lấy ĐÚNG tên trong thư viện bài tập dựng sẵn (có hướng dẫn, hình).
public enum StarterPrograms {
  public enum Place: String, Sendable, Hashable, Codable, CaseIterable {
    case gym, dumbbell, bodyweight
  }

  /// Một buổi khác nhau trong chương trình (một mẫu buổi tập).
  public enum Session: String, Sendable, Hashable, Codable, CaseIterable {
    case fullA, fullB, fullC, upperA, lowerA, upperB, lowerB, push, pull, legs
  }

  public struct Choice: Sendable, Hashable, Codable {
    public var sessions: Int
    /// Thứ trong tuần có buổi (thứ Hai = 0), đúng `sessions` ngày.
    public var days: [Int]
    public var place: Place
    public var beginner: Bool
    public init(sessions: Int, days: [Int], place: Place, beginner: Bool) {
      self.sessions = sessions
      self.days = days
      self.place = place
      self.beginner = beginner
    }

    /// Mặc định theo kinh nghiệm: mới tập 3 buổi, còn lại 4.
    public static func suggested(trainingLevel: String?) -> Choice {
      let beginner = trainingLevel == nil || trainingLevel == "beginner"
      let n = beginner ? 3 : 4
      return Choice(sessions: n, days: StarterPrograms.defaultDays(n), place: .gym, beginner: beginner)
    }
  }

  public static let sessionCounts = 2...5

  /// Ngày mặc định: cách nhau để kịp hồi phục.
  public static func defaultDays(_ n: Int) -> [Int] {
    switch n {
    case ...2: [0, 3]
    case 3: [0, 2, 4]
    case 4: [0, 1, 3, 4]
    default: [0, 1, 2, 3, 4]
    }
  }

  /// Buổi của từng ngày tập, theo thứ tự ngày.
  public static func rotation(_ c: Choice) -> [Session] {
    let n = c.days.count
    let cycle: [Session] =
      switch (c.place, c.sessions) {
      case (.bodyweight, ...3): [.fullA, .fullB]
      case (.bodyweight, _): [.fullA, .fullB, .fullC]
      case (_, ...3): [.fullA, .fullB]
      case (_, 4): [.upperA, .lowerA, .upperB, .lowerB]
      default: [.push, .pull, .legs, .upperA, .lowerA]
      }
    return (0..<n).map { cycle[$0 % cycle.count] }
  }

  /// `[ngày: buổi]` cho mọi ngày tập; ngày còn lại là ngày nghỉ.
  public static func schedule(_ c: Choice) -> [(day: Int, session: Session)] {
    Array(zip(c.days.sorted(), rotation(c))).map { (day: $0.0, session: $0.1) }
  }

  /// Bài của một buổi, theo nơi tập và kinh nghiệm.
  public static func exercises(_ s: Session, place: Place, beginner: Bool) -> [TemplateExercise] {
    let base: [(String, Int, Int)] =
      place == .bodyweight ? bodyweight[s] ?? bodyweight[.fullA]! : gym[s] ?? gym[.fullA]!
    var seen = Set<String>()
    return base.compactMap { name, sets, reps in
      let n = place == .dumbbell ? dumbbellSwap[name] ?? name : name
      guard seen.insert(n).inserted else { return nil }
      // Mới tập: tối đa 3 hiệp, 10–12 lần (kể cả bài nặng) — học động tác trước.
      let s = beginner ? min(sets, 3) : sets
      let r = beginner ? max(reps, 10) : reps
      return TemplateExercise(exerciseName: n, sets: s, reps: r, weightKg: 0)
    }
  }

  /// Phút ước tính của một buổi (cùng công thức với builder).
  public static func minutes(_ s: Session, place: Place, beginner: Bool) -> Int {
    TemplateDraft.estimatedMinutes(exercises(s, place: place, beginner: beginner).map { ($0.sets, $0.reps, $0.restSeconds) })
  }

  // MARK: - Bài

  static let gym: [Session: [(String, Int, Int)]] = [
    .fullA: [
      ("Barbell Full Squat", 3, 8), ("Barbell Bench Press - Medium Grip", 3, 8), ("Bent Over Barbell Row", 3, 8),
      ("Dumbbell Shoulder Press", 2, 10), ("Dumbbell Lunges", 2, 10),
    ],
    .fullB: [
      ("Barbell Deadlift", 3, 5), ("Incline Dumbbell Press", 3, 10), ("Wide-Grip Lat Pulldown", 3, 10),
      ("Goblet Squat", 2, 12), ("Face Pull", 2, 12),
    ],
    .fullC: [
      ("Front Barbell Squat", 3, 8), ("Standing Military Press", 3, 8), ("Seated Cable Rows", 3, 10),
      ("Barbell Hip Thrust", 3, 10), ("Hammer Curls", 2, 12),
    ],
    .upperA: [
      ("Barbell Bench Press - Medium Grip", 3, 8), ("Bent Over Barbell Row", 3, 8), ("Dumbbell Shoulder Press", 3, 10),
      ("Wide-Grip Lat Pulldown", 3, 10), ("Dumbbell Bicep Curl", 2, 12), ("Triceps Pushdown", 2, 12),
    ],
    .lowerA: [
      ("Barbell Full Squat", 3, 8), ("Stiff-Legged Barbell Deadlift", 3, 10), ("Dumbbell Lunges", 3, 10),
      ("Lying Leg Curls", 2, 12), ("Standing Calf Raises", 3, 12),
    ],
    .upperB: [
      ("Incline Dumbbell Press", 3, 10), ("Seated Cable Rows", 3, 10), ("Standing Military Press", 3, 8),
      ("Pullups", 3, 6), ("Hammer Curls", 2, 12), ("Triceps Pushdown - Rope Attachment", 2, 12),
    ],
    .lowerB: [
      ("Barbell Deadlift", 3, 5), ("Front Barbell Squat", 3, 8), ("Barbell Hip Thrust", 3, 10),
      ("Leg Extensions", 2, 12), ("Standing Calf Raises", 3, 12),
    ],
    .push: [
      ("Barbell Bench Press - Medium Grip", 4, 8), ("Incline Dumbbell Press", 3, 10), ("Standing Military Press", 3, 8),
      ("Side Lateral Raise", 3, 12), ("Triceps Pushdown", 3, 12),
    ],
    .pull: [
      ("Barbell Deadlift", 3, 5), ("Pullups", 3, 6), ("Bent Over Barbell Row", 3, 8), ("Face Pull", 3, 12),
      ("Dumbbell Bicep Curl", 3, 12),
    ],
    .legs: [
      ("Barbell Full Squat", 4, 8), ("Stiff-Legged Barbell Deadlift", 3, 10), ("Dumbbell Lunges", 3, 10),
      ("Lying Leg Curls", 3, 12), ("Standing Calf Raises", 4, 12),
    ],
  ]

  /// Ở nhà với một đôi tạ đơn: bài tạ đòn / máy → bài tạ đơn gần nhất.
  static let dumbbellSwap: [String: String] = [
    "Barbell Full Squat": "Goblet Squat",
    "Front Barbell Squat": "Dumbbell Squat",
    "Barbell Bench Press - Medium Grip": "Dumbbell Floor Press",
    "Bent Over Barbell Row": "Bent Over Two-Dumbbell Row",
    "Wide-Grip Lat Pulldown": "One-Arm Dumbbell Row",
    "Seated Cable Rows": "One-Arm Dumbbell Row",
    "Pullups": "One-Arm Dumbbell Row",
    "Barbell Deadlift": "Stiff-Legged Dumbbell Deadlift",
    "Stiff-Legged Barbell Deadlift": "Stiff-Legged Dumbbell Deadlift",
    "Standing Military Press": "Dumbbell Shoulder Press",
    "Face Pull": "Side Lateral Raise",
    "Triceps Pushdown": "Standing Dumbbell Triceps Extension",
    "Triceps Pushdown - Rope Attachment": "Standing Dumbbell Triceps Extension",
    "Lying Leg Curls": "Dumbbell Step Ups",
    "Leg Extensions": "Dumbbell Step Ups",
    "Barbell Hip Thrust": "Single Leg Glute Bridge",
    "Standing Calf Raises": "Standing Dumbbell Calf Raise",
  ]

  static let bodyweight: [Session: [(String, Int, Int)]] = [
    .fullA: [
      ("Bodyweight Squat", 3, 15), ("Pushups", 3, 10), ("Inverted Row", 3, 8), ("Bodyweight Walking Lunge", 2, 12),
      ("Crunches", 2, 15),
    ],
    .fullB: [
      ("Bodyweight Squat", 3, 15), ("Push-Ups - Close Triceps Position", 3, 8), ("Superman", 3, 12),
      ("Single Leg Glute Bridge", 2, 12), ("Mountain Climbers", 2, 20),
    ],
    .fullC: [
      ("Bodyweight Walking Lunge", 3, 12), ("Pushups", 3, 10), ("Bench Dips", 3, 10), ("Butt Lift (Bridge)", 3, 15),
      ("Crunches", 2, 15),
    ],
  ]
}
