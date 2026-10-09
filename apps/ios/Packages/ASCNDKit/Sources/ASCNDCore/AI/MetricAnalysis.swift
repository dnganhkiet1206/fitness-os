import Foundation

/// Bảng chỉ số 7 ngày của tab Trợ lý (#527) — `lib/metric-analysis.ts` @ fac9ac2.
///
/// Như RN: 7 cột (ngày trống là cột "thiếu", không phải 0), hướng xu thế chỉ
/// khi có ≥ 4 ngày (median nửa cũ so với nửa mới, ±5 %); dưới ngưỡng ấy dòng
/// đầu nói còn thiếu bao nhiêu ngày thay vì bịa xu thế; câu hỏi gửi coach mang
/// đúng những con số đang hiện.
///
/// Khác RN: tiếng Tây Ban Nha (RN: vi / en); "1 day" không thành "1 days";
/// trung bình giấc ngủ 7 giờ 59,6 phút ra "8 giờ", không phải "7 giờ 60 phút".
/// Golden: `metrics-golden.json` từ CHÍNH `analyse` / `direction`.
public enum MetricAnalysis {
  public enum Kind: String, Sendable, Hashable, CaseIterable { case readiness, sleep, kcal, hr }
  public enum Direction: String, Sendable, Hashable { case up, down, flat }
  public typealias Text3 = AssistantSuggestions.Text3

  public struct Point: Sendable, Hashable {
    public let date: LocalDate
    public let value: Double
    public init(date: LocalDate, value: Double) {
      self.date = date
      self.value = value
    }
  }

  public struct Bar: Sendable, Hashable, Identifiable {
    public let date: LocalDate
    public let value: Double
    public let missing: Bool
    public let weekday: Text3
    public let today: Bool
    public var id: LocalDate { date }
  }

  public struct Stat: Sendable, Hashable, Identifiable {
    public let key: String
    public let label: Text3
    /// RN ghi giá trị bằng chữ vi cho mọi ngôn ngữ ("7 giờ 5 phút", "1.234 kcal").
    public let value: Text3
    public var id: String { key }
  }

  public struct Baseline: Sendable, Hashable {
    public let value: Double
    public let label: Text3
  }

  public struct Analysis: Sendable, Hashable {
    public let headline: Text3
    public let stats: [Stat]
    public let bars: [Bar]
    public let baseline: Baseline?
    public let ask: Text3
  }

  /// `MIN_TREND`.
  public static let minTrend = 4
  /// `WINDOW_DAYS`.
  public static let windowDays = 7

  static let weekdays: [Text3] = [
    Text3(vi: "CN", en: "S", es: "D"), Text3(vi: "T2", en: "M", es: "L"), Text3(vi: "T3", en: "T", es: "M"),
    Text3(vi: "T4", en: "W", es: "X"), Text3(vi: "T5", en: "T", es: "J"), Text3(vi: "T6", en: "F", es: "V"),
    Text3(vi: "T7", en: "S", es: "S"),
  ]

  /// `barsFor`: `days` ngày tới hôm nay; trùng ngày thì điểm SAU thắng (Map).
  public static func bars(_ points: [Point], days: Int, today: LocalDate) -> [Bar] {
    var byDate: [LocalDate: Double] = [:]
    for p in points { byDate[p.date] = p.value }
    return (0..<days).reversed().map { back in
      let d = today.adding(days: -back)
      let v = byDate[d]
      // 1970-01-01 là thứ Năm.
      let dow = ((d.daysSinceEpoch % 7) + 7 + 4) % 7
      return Bar(date: d, value: v ?? 0, missing: v == nil, weekday: weekdays[dow], today: back == 0)
    }
  }

  static func mean(_ xs: [Double]) -> Double { xs.isEmpty ? 0 : xs.reduce(0, +) / Double(xs.count) }

  static func median(_ xs: [Double]) -> Double {
    guard !xs.isEmpty else { return 0 }
    let s = xs.sorted()
    let mid = s.count / 2
    return s.count % 2 == 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }

  /// `direction`: median nửa cũ vs nửa mới; nửa cũ bằng 0 → phẳng.
  public static func direction(_ values: [Double]) -> Direction? {
    guard values.count >= minTrend else { return nil }
    let half = values.count / 2
    let older = median(Array(values.prefix(half)))
    let newer = median(Array(values.suffix(half)))
    if older == 0 { return .flat }
    let change = (newer - older) / older
    if change > 0.05 { return .up }
    if change < -0.05 { return .down }
    return .flat
  }

  private static func r(_ x: Double) -> String { ReadinessEngine.jsString(JS.round(x)) }
  private static func g(_ x: Double, _ lang: AppPreferences.Lang) -> String { AssistantBrief.group(x, lang) }

  /// `hhmm` — nhưng phút làm tròn lên 60 thì sang giờ kế (RN: "7 giờ 60 phút").
  static func hhmm(_ min: Double, _ lang: AppPreferences.Lang) -> String {
    var h = Int((min / 60).rounded(.down))
    var m = Int(JS.round(min.truncatingRemainder(dividingBy: 60)))
    if m == 60 {
      h += 1
      m = 0
    }
    switch lang {
    case .vi: return m == 0 ? "\(h) giờ" : "\(h) giờ \(m) phút"
    case .en: return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    case .es: return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }
  }

  private static func t(_ f: (AppPreferences.Lang) -> String) -> Text3 { Text3(vi: f(.vi), en: f(.en), es: f(.es)) }

  static func needMore(_ n: Int) -> Text3 {
    let left = minTrend - n
    if n == 0 {
      return Text3(
        vi: "Chưa có ngày nào được ghi trong tuần này.", en: "Nothing logged this week.",
        es: "No hay nada registrado esta semana.")
    }
    return Text3(
      vi: "Mới có \(n) ngày được ghi — thêm \(left) ngày nữa là tôi đọc được xu hướng.",
      en: "Only \(n) \(n == 1 ? "day" : "days") logged — \(left) more and I can read a trend.",
      es: "Solo \(n) \(n == 1 ? "día registrado" : "días registrados"): \(left) más y podré leer una tendencia.")
  }

  static let average = Text3(vi: "Trung bình", en: "Average", es: "Media")

  // swiftlint:disable:next function_body_length cyclomatic_complexity
  public static func analyse(kind: Kind, points: [Point], today: LocalDate, kcalTarget: Double = 0) -> Analysis {
    let bars = bars(points, days: windowDays, today: today)
    let values = bars.filter { !$0.missing }.map(\.value)
    let n = values.count
    let avg = mean(values)
    let dir = direction(values)
    let trend: Text3? =
      switch dir {
      case nil: nil
      case .up?: Text3(vi: "đang đi lên", en: "trending up", es: "va en aumento")
      case .down?: Text3(vi: "đang đi xuống", en: "trending down", es: "va a la baja")
      case .flat?: Text3(vi: "khá ổn định", en: "holding steady", es: "bastante estable")
      }

    switch kind {
    case .sleep:
      let target = 420.0
      let good = values.filter { $0 >= target }.count
      let headline: Text3 =
        if n < minTrend {
          needMore(n)
        } else {
          t {
            switch $0 {
            case .vi: "Bạn ngủ trung bình \(hhmm(avg, .vi)) trong \(n) đêm ghi được, \(trend?.vi ?? "")."
            case .en: "You averaged \(hhmm(avg, .en)) across \(n) logged nights, \(trend?.en ?? "")."
            case .es: "Dormiste de media \(hhmm(avg, .es)) en \(n) noches registradas, \(trend?.es ?? "")."
            }
          }
        }
      let stats: [Stat] =
        n == 0
        ? []
        : [
          Stat(key: "avg", label: average, value: t { hhmm(avg, $0) }),
          Stat(
            key: "good", label: Text3(vi: "Đêm đủ 7 giờ", en: "Nights over 7h", es: "Noches de más de 7 h"),
            value: Text3(vi: "\(good)/\(n)", en: "\(good)/\(n)", es: "\(good)/\(n)")),
        ]
      let ask: Text3 =
        n == 0
        ? Text3(
          vi: "Tôi chưa ghi giấc ngủ bao giờ. Nên bắt đầu theo dõi thế nào và cần chú ý điều gì?",
          en: "I haven’t logged any sleep yet. How should I start tracking it, and what should I watch for?",
          es: "Aún no he registrado mi sueño. ¿Cómo empiezo a seguirlo y en qué debo fijarme?")
        : t {
          switch $0 {
          case .vi:
            "Tuần này tôi ngủ trung bình \(hhmm(avg, .vi)) mỗi đêm, \(good)/\(n) đêm đủ 7 giờ. Tôi nên cải thiện thế nào?"
          case .en:
            "This week I averaged \(hhmm(avg, .en)) a night, with \(good) of \(n) nights over 7h. How should I improve?"
          case .es:
            "Esta semana dormí de media \(hhmm(avg, .es)) por noche, \(good) de \(n) noches de más de 7 h. ¿Cómo puedo mejorar?"
          }
        }
      return Analysis(
        headline: headline, stats: stats, bars: bars,
        baseline: Baseline(value: target, label: Text3(vi: "7 giờ", en: "7h", es: "7 h")), ask: ask)

    case .kcal:
      let hit = kcalTarget > 0 ? values.filter { $0 >= kcalTarget * 0.9 && $0 <= kcalTarget * 1.1 }.count : 0
      let a = JS.round(avg)
      let headline: Text3 =
        if n < minTrend {
          needMore(n)
        } else if kcalTarget > 0 {
          t {
            switch $0 {
            case .vi: "Bạn ăn trung bình \(g(a, .vi)) kcal mỗi ngày, \(hit)/\(n) ngày sát mục tiêu \(g(kcalTarget, .vi))."
            case .en:
              "You averaged \(g(a, .en)) kcal a day, hitting close to your \(g(kcalTarget, .en)) target on \(hit) of \(n) days."
            case .es:
              "Comiste de media \(g(a, .es)) kcal al día, cerca de tu objetivo de \(g(kcalTarget, .es)) en \(hit) de \(n) días."
            }
          }
        } else {
          t {
            switch $0 {
            case .vi: "Bạn ăn trung bình \(g(a, .vi)) kcal mỗi ngày, \(trend?.vi ?? "")."
            case .en: "You averaged \(g(a, .en)) kcal a day, \(trend?.en ?? "")."
            case .es: "Comiste de media \(g(a, .es)) kcal al día, \(trend?.es ?? "")."
            }
          }
        }
      var stats: [Stat] = []
      if n > 0 {
        stats.append(Stat(key: "avg", label: average, value: t { "\(g(a, $0)) kcal" }))
        if kcalTarget > 0 {
          stats.append(
            Stat(
              key: "hit", label: Text3(vi: "Ngày sát mục tiêu", en: "Days on target", es: "Días en el objetivo"),
              value: Text3(vi: "\(hit)/\(n)", en: "\(hit)/\(n)", es: "\(hit)/\(n)")))
        }
      }
      let ask: Text3 =
        n == 0
        ? Text3(
          vi: "Tôi chưa ghi bữa ăn nào. Nên bắt đầu theo dõi calo thế nào cho dễ duy trì?",
          en: "I haven’t logged any meals. How should I start tracking calories in a way I’ll keep up?",
          es: "Aún no he registrado comidas. ¿Cómo empiezo a contar calorías de una forma que pueda mantener?")
        : t {
          switch $0 {
          case .vi:
            "Tuần này tôi ăn trung bình \(g(a, .vi)) kcal mỗi ngày\(kcalTarget > 0 ? ", mục tiêu là \(g(kcalTarget, .vi)) kcal" : ""). Tôi nên điều chỉnh gì?"
          case .en:
            "This week I averaged \(g(a, .en)) kcal a day\(kcalTarget > 0 ? ", against a \(g(kcalTarget, .en)) target" : ""). What should I change?"
          case .es:
            "Esta semana comí de media \(g(a, .es)) kcal al día\(kcalTarget > 0 ? ", con un objetivo de \(g(kcalTarget, .es))" : ""). ¿Qué debería cambiar?"
          }
        }
      let baseline: Baseline? =
        kcalTarget > 0 ? Baseline(value: kcalTarget, label: t { "\(g(kcalTarget, $0)) kcal" }) : nil
      return Analysis(headline: headline, stats: stats, bars: bars, baseline: baseline, ask: ask)

    case .hr:
      let lo = values.min() ?? 0
      let hi = values.max() ?? 0
      let headline: Text3 =
        if n < minTrend {
          needMore(n)
        } else {
          Text3(
            vi:
              "Nhịp tim nghỉ trung bình \(r(avg)) bpm qua \(n) ngày\(dir == .down ? ", đang giảm dần" : dir == .up ? ", đang nhích lên" : "").",
            en:
              "Your resting heart rate averaged \(r(avg)) bpm over \(n) days\(dir == .down ? ", drifting down" : dir == .up ? ", creeping up" : "").",
            es:
              "Tu frecuencia cardíaca en reposo fue de media \(r(avg)) lpm en \(n) días\(dir == .down ? ", bajando poco a poco" : dir == .up ? ", subiendo un poco" : "").")
        }
      let stats: [Stat] =
        n == 0
        ? []
        : [
          Stat(key: "avg", label: average, value: Text3(vi: "\(r(avg)) bpm", en: "\(r(avg)) bpm", es: "\(r(avg)) lpm")),
          Stat(
            key: "range", label: Text3(vi: "Thấp nhất — cao nhất", en: "Low — high", es: "Mín. — máx."),
            value: Text3(vi: "\(r(lo))–\(r(hi))", en: "\(r(lo))–\(r(hi))", es: "\(r(lo))–\(r(hi))")),
        ]
      let ask: Text3 =
        n == 0
        ? Text3(
          vi: "Tôi chưa có dữ liệu nhịp tim. Nên đo thế nào và con số nào là đáng chú ý?",
          en: "I have no heart-rate data yet. How should I measure it, and what numbers matter?",
          es: "Aún no tengo datos de frecuencia cardíaca. ¿Cómo debería medirla y qué cifras importan?")
        : Text3(
          vi:
            "Nhịp tim nghỉ của tôi trung bình \(r(avg)) bpm trong \(n) ngày qua, dao động \(r(lo))–\(r(hi)). Điều đó nói lên gì?",
          en:
            "My resting heart rate averaged \(r(avg)) bpm over \(n) days, ranging \(r(lo))–\(r(hi)). What does that tell me?",
          es:
            "Mi frecuencia cardíaca en reposo fue de media \(r(avg)) lpm en \(n) días, entre \(r(lo)) y \(r(hi)). ¿Qué me dice eso?")
      return Analysis(
        headline: headline, stats: stats, bars: bars, baseline: n > 0 ? Baseline(value: avg, label: average) : nil,
        ask: ask)

    case .readiness:
      let best = values.max() ?? 0
      let headline: Text3 =
        if n < minTrend {
          needMore(n)
        } else {
          Text3(
            vi: "Điểm sẵn sàng trung bình \(r(avg))/100 qua \(n) ngày, \(trend?.vi ?? "").",
            en: "Your readiness averaged \(r(avg))/100 over \(n) days, \(trend?.en ?? "").",
            es: "Tu preparación fue de media \(r(avg))/100 en \(n) días, \(trend?.es ?? "").")
        }
      let stats: [Stat] =
        n == 0
        ? []
        : [
          Stat(key: "avg", label: average, value: Text3(vi: "\(r(avg))/100", en: "\(r(avg))/100", es: "\(r(avg))/100")),
          Stat(
            key: "best", label: Text3(vi: "Cao nhất", en: "Best", es: "Mejor"),
            value: Text3(vi: r(best), en: r(best), es: r(best))),
        ]
      let ask: Text3 =
        if n == 0 {
          Text3(
            vi: "Tôi chưa có điểm sẵn sàng nào. Điểm này được tính từ đâu và làm sao để có?",
            en: "I have no readiness scores yet. What is the score built from and how do I get one?",
            es: "Aún no tengo puntuaciones de preparación. ¿De qué se calcula y cómo consigo una?")
        } else if let trend {
          Text3(
            vi: "Điểm sẵn sàng của tôi trung bình \(r(avg))/100 trong \(n) ngày qua và \(trend.vi). Tôi nên làm gì để cải thiện?",
            en: "My readiness averaged \(r(avg))/100 over the last \(n) days and is \(trend.en). What should I do to improve it?",
            es: "Mi preparación fue de media \(r(avg))/100 en los últimos \(n) días y \(trend.es). ¿Qué hago para mejorarla?")
        } else {
          Text3(
            vi: "Tôi mới có \(n) ngày điểm sẵn sàng, trung bình \(r(avg))/100. Điểm này nói lên gì và tôi nên cải thiện thế nào?",
            en:
              "I only have \(n) \(n == 1 ? "day" : "days") of readiness scores, averaging \(r(avg))/100. What does that tell me and how do I improve it?",
            es:
              "Solo tengo \(n) \(n == 1 ? "día" : "días") de puntuaciones de preparación, con una media de \(r(avg))/100. ¿Qué me dice y cómo la mejoro?")
        }
      return Analysis(
        headline: headline, stats: stats, bars: bars, baseline: n > 0 ? Baseline(value: avg, label: average) : nil,
        ask: ask)
    }
  }
}
