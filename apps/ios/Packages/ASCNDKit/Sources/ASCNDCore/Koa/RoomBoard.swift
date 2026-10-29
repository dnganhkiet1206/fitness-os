import Foundation

/// Bảng số trên tường phòng Koa (#527 phần 3, Kiệt 29/10): người dùng chọn số hiện —
/// hạng Gains (mặc định), số buổi tuần này, hay kỷ lục gần nhất. Chạm bảng để đổi.
public enum RoomBoard {
  public enum Stat: String, Sendable, Hashable, CaseIterable {
    case rank, week, record

    /// Lựa chọn kế tiếp khi chạm bảng.
    public var next: Stat {
      let all = Stat.allCases
      return all[(all.firstIndex(of: self)! + 1) % all.count]
    }
  }

  /// Chữ đầu bảng (vẽ trên tranh, theo ngôn ngữ app như `StudioScene.signText`).
  static let words: [Stat: [String: String]] = [
    .rank: ["vi": "HẠNG", "en": "RANK", "es": "RANGO"],
    .week: ["vi": "TUẦN NÀY", "en": "THIS WEEK", "es": "ESTA SEMANA"],
    .record: ["vi": "KỶ LỤC", "en": "BEST", "es": "RÉCORD"],
  ]

  public static func word(_ s: Stat, lang: String) -> String { words[s]?[lang] ?? words[s]?["en"] ?? "" }

  /// Hạng `rank` (0-based) trên `count` hạng: số hạng 1…n, mỗi hạng một chấm.
  public static func rank(_ rank: Int, of count: Int, lang: String) -> StudioScene.Board {
    let n = max(0, min(rank, count - 1)) + 1
    return .init(word: word(.rank, lang: lang), value: "\(n)", icon: .dumbbell, dots: count, lit: n)
  }

  /// Buổi tuần này: số buổi đã tập, mỗi buổi trong lịch một chấm (tối đa 7).
  public static func week(done: Int, target: Int, lang: String) -> StudioScene.Board {
    let done = max(0, done)
    return .init(
      word: word(.week, lang: lang), value: "\(done)", icon: .check, dots: min(7, max(0, target)),
      lit: min(done, 7))
  }

  /// Kỷ lục gần nhất trong cửa sổ phân tích: buổi mới nhất có kỷ lục, kỷ lục đứng đầu
  /// của buổi ấy (`records` xếp tốt nhất trước).
  public static func latestRecord(_ performances: [ExercisePerformance]) -> PersonalRecord? {
    performances.filter { !$0.records.isEmpty }.max { $0.at < $1.at }?.records.first
  }

  /// Kỷ lục: số tạ (theo đơn vị của người dùng) hay số rep; chưa có thì "–".
  public static func record(_ r: PersonalRecord?, unit: WeightUnit, lang: String) -> StudioScene.Board {
    let head = word(.record, lang: lang)
    guard let r else { return .init(word: head, value: "–", icon: .trophy, dots: 0, lit: 0) }
    switch r.kind {
    case .weight:
      return .init(
        word: "\(head) · \(unit.label.uppercased())", value: unit.text(r.value), icon: .trophy, dots: 0, lit: 0)
    case .reps:
      return .init(word: "\(head) · REP", value: "\(Int(r.value.rounded()))", icon: .trophy, dots: 0, lit: 0)
    }
  }
}
