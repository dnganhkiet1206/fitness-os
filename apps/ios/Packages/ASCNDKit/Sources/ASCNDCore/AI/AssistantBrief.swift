import Foundation

/// Lời chào + tóm tắt hôm nay của tab Trợ lý (#527) — `lib/assistant-brief.ts`
/// @ fac9ac2.
///
/// Như RN: tối đa ba dòng — một về đêm qua, một về trạng thái hôm nay, một về
/// việc tiếp theo (nghỉ tập > tải cao > calo > bước, theo thứ tự đáng nghe);
/// dòng trạng thái chỉ nói về HỒI PHỤC khi điểm thật sự đọc được ngủ / HRV /
/// RHR, không thì nói về khả năng tập; không bao giờ nói một con số không có;
/// tên gọi là chữ cuối (vi) / chữ đầu (en), tên quá dài thì bỏ.
///
/// Khác RN: có tiếng Tây Ban Nha (RN: `Bilingual` vi / en, es rơi về en); ăn
/// đúng mục tiêu calo là dòng `kcal-on` (RN: "vượt khoảng -0 kcal").
/// Golden: `brief-golden.json` từ CHÍNH `briefFor` / `givenName`.
public enum AssistantBrief {
  public struct Line: Sendable, Hashable, Identifiable {
    public let key: String
    public let text: AssistantSuggestions.Text3
    public var id: String { key }
  }

  public struct Brief: Sendable, Hashable {
    public let greeting: AssistantSuggestions.Text3
    public let lines: [Line]
  }

  /// `BRIEF_LINES`.
  public static let maxLines = 3
  static let shortSleep = 420.0
  static let goodSleep = 450.0

  /// `givenName`: vi lấy chữ cuối, en (và es) chữ đầu; > 18 ký tự UTF-16 → "".
  public static func givenName(_ full: String, vi: Bool) -> String {
    let parts = full.split(whereSeparator: \.isWhitespace).map(String.init)
    guard let one = vi ? parts.last : parts.first else { return "" }
    return one.utf16.count > 18 ? "" : one
  }

  /// `hours(min, vi)`: "6 giờ 59 phút" / "6h 59m".
  static func hours(_ min: Double, _ lang: AppPreferences.Lang) -> String {
    let m = Int(min)
    let h = m / 60
    let r = m % 60
    switch lang {
    case .vi: return r == 0 ? "\(h) giờ" : "\(h) giờ \(r) phút"
    case .en: return r == 0 ? "\(h)h" : "\(h)h \(r)m"
    case .es: return r == 0 ? "\(h) h" : "\(h) h \(r) min"
    }
  }

  /// `toLocaleString('vi-VN' | 'en-US')` cho số nguyên; es theo CLDR (nhóm từ
  /// 5 chữ số).
  static func group(_ n: Double, _ lang: AppPreferences.Lang) -> String {
    let v = Int(JS.round(n))
    let digits = String(abs(v))
    let sign = v < 0 ? "-" : ""
    // Dấu nhóm theo locale: en "1,234"; vi "1.234"; es "1234" / "12.500".
    let sep: Character
    switch lang {
    case .en: sep = ","
    case .vi: sep = "."
    case .es:
      if digits.count < 5 { return sign + digits }
      sep = "."
    }
    var out = Array(digits)
    var i = out.count - 3
    while i > 0 {
      out.insert(sep, at: i)
      i -= 3
    }
    return sign + String(out)
  }

  private static func t(_ f: (AppPreferences.Lang) -> String) -> AssistantSuggestions.Text3 {
    AssistantSuggestions.Text3(vi: f(.vi), en: f(.en), es: f(.es))
  }

  static func greeting(name: String, hour: Int) -> AssistantSuggestions.Text3 {
    let part =
      hour < 11
      ? AssistantSuggestions.Text3(vi: "Chào buổi sáng", en: "Good morning", es: "Buenos días")
      : hour < 18
        ? AssistantSuggestions.Text3(vi: "Chào buổi chiều", en: "Good afternoon", es: "Buenas tardes")
        : AssistantSuggestions.Text3(vi: "Chào buổi tối", en: "Good evening", es: "Buenas noches")
    // Như RN: tên có mà `givenName` ra "" vẫn để dấu phẩy ("Good morning, .").
    return t { lang in
      guard !name.isEmpty else { return "\(part(lang))." }
      // vi gọi bằng chữ cuối của tên, en / es bằng chữ đầu.
      let lastWord: Bool
      switch lang {
      case .vi: lastWord = true
      case .en, .es: lastWord = false
      }
      return "\(part(lang)), \(givenName(name, vi: lastWord))."
    }
  }

  public static func brief(for s: AssistantSuggestions.Signal, hour: Int) -> Brief {
    var lines = Array(facts(s).prefix(maxLines))
    if lines.isEmpty {
      lines.append(
        Line(
          key: "no-data",
          text: .init(
            vi: "Hôm nay chưa có dữ liệu nào. Ghi giấc ngủ hoặc một bữa ăn để tôi hiểu bạn hơn.",
            en: "Nothing logged today yet. Add your sleep or a meal and I’ll have something to go on.",
            es: "Hoy aún no hay nada registrado. Añade tu sueño o una comida y tendré algo con qué trabajar.")))
    }
    return Brief(greeting: greeting(name: s.name, hour: hour), lines: lines)
  }

  // swiftlint:disable:next function_body_length
  static func facts(_ s: AssistantSuggestions.Signal) -> [Line] {
    var night: Line?
    var state: Line?
    var next: [Line] = []
    let zone = s.acwr.map(ReadinessCard.zone)

    if s.sleepMin > 0 {
      let text: AssistantSuggestions.Text3 =
        s.sleepMin < shortSleep
        ? t {
          switch $0 {
          case .vi: "Đêm qua bạn ngủ \(hours(s.sleepMin, .vi)) — ngắn hơn bình thường."
          case .en: "You slept \(hours(s.sleepMin, .en)) last night — shorter than usual."
          case .es: "Anoche dormiste \(hours(s.sleepMin, .es)), menos de lo habitual."
          }
        }
        : s.sleepMin >= goodSleep
          ? t {
            switch $0 {
            case .vi: "Đêm qua bạn ngủ \(hours(s.sleepMin, .vi)), một đêm tốt."
            case .en: "You slept \(hours(s.sleepMin, .en)) last night, a good one."
            case .es: "Anoche dormiste \(hours(s.sleepMin, .es)), una buena noche."
            }
          }
          : t {
            switch $0 {
            case .vi: "Đêm qua bạn ngủ \(hours(s.sleepMin, .vi))."
            case .en: "You slept \(hours(s.sleepMin, .en)) last night."
            case .es: "Anoche dormiste \(hours(s.sleepMin, .es))."
            }
          }
      night = Line(key: "sleep", text: text)
    }

    if let status = s.status, !status.isEmpty {
      let text: AssistantSuggestions.Text3 =
        switch (s.hasRecovery, status) {
        case (true, "green"):
          .init(
            vi: "Hôm nay cơ thể bạn phục hồi tốt.", en: "Your recovery looks good today.",
            es: "Hoy tu recuperación se ve bien.")
        case (true, "yellow"):
          .init(
            vi: "Hôm nay bạn phục hồi ở mức vừa phải.", en: "Your recovery is middling today.",
            es: "Hoy tu recuperación es moderada.")
        case (true, _):
          .init(
            vi: "Hôm nay cơ thể bạn chưa phục hồi hẳn.", en: "Your body has not fully recovered today.",
            es: "Hoy tu cuerpo no se ha recuperado del todo.")
        case (false, "green"):
          .init(
            vi: "Hôm nay khả năng tập của bạn đang tốt.", en: "Your training capacity looks good today.",
            es: "Hoy tu capacidad de entrenamiento se ve bien.")
        case (false, "yellow"):
          .init(
            vi: "Hôm nay khả năng tập của bạn ở mức vừa phải.", en: "Your training capacity is middling today.",
            es: "Hoy tu capacidad de entrenamiento es moderada.")
        default:
          .init(
            vi: "Hôm nay khả năng tập của bạn đang thấp.", en: "Your training capacity looks low today.",
            es: "Hoy tu capacidad de entrenamiento está baja.")
        }
      state = Line(key: "readiness", text: text)
    }

    if let days = s.daysSinceWorkout {
      if days >= 2 {
        next.append(
          Line(
            key: "rest-gap",
            text: .init(
              vi: "Bạn đã nghỉ tập \(days) ngày.", en: "You haven’t trained for \(days) days.",
              es: "Llevas \(days) días sin entrenar.")))
      } else if let acwr = s.acwr, zone == .spike || zone == .elevated {
        let pct = ReadinessEngine.jsString(JS.round((acwr - 1) * 100))
        next.append(
          Line(
            key: "load-high",
            text: .init(
              vi: "Tải tập tuần này cao hơn thói quen khoảng \(pct)%.",
              en: "This week’s load is about \(pct)% above your baseline.",
              es: "La carga de esta semana está un \(pct) % por encima de lo habitual.")))
      }
    } else {
      next.append(
        Line(
          key: "no-workouts",
          text: .init(
            vi: "Bạn chưa ghi buổi tập nào — ghi một buổi để tôi theo dõi được tải tập.",
            en: "You haven’t logged a session yet — log one and I can track your load.",
            es: "Aún no has registrado ninguna sesión: registra una y podré seguir tu carga.")))
    }

    if s.kcal > 0 && s.kcalTarget > 0 {
      let left = s.kcalTarget - s.kcal
      // Khác RN: ăn ĐÚNG mục tiêu, RN rơi vào nhánh "vượt" với `-0`
      // ("vượt khoảng -0 kcal"). Ở đây là một dòng riêng.
      if left == 0 {
        next.append(
          Line(
            key: "kcal-on",
            text: .init(
              vi: "Hôm nay bạn đã ăn đúng mục tiêu calo.", en: "You’ve hit today’s calorie target.",
              es: "Hoy has llegado justo a tu objetivo de calorías.")))
      } else {
        next.append(
          left > 0
            ? Line(
              key: "kcal-left",
              text: t {
                switch $0 {
                case .vi: "Bạn còn khoảng \(group(left, .vi)) kcal cho hôm nay."
                case .en: "You have about \(group(left, .en)) kcal left today."
                case .es: "Te quedan unas \(group(left, .es)) kcal para hoy."
                }
              })
            : Line(
              key: "kcal-over",
              text: t {
                switch $0 {
                case .vi: "Bạn đã vượt mục tiêu calo hôm nay khoảng \(group(-left, .vi)) kcal."
                case .en: "You’re about \(group(-left, .en)) kcal over today’s target."
                case .es: "Hoy vas unas \(group(-left, .es)) kcal por encima del objetivo."
                }
              }))
      }
    } else if s.kcalTarget > 0 {
      next.append(
        Line(
          key: "kcal-none",
          text: t {
            switch $0 {
            case .vi: "Hôm nay bạn chưa ghi bữa nào — mục tiêu là \(group(s.kcalTarget, .vi)) kcal."
            case .en: "You haven’t logged a meal today — the target is \(group(s.kcalTarget, .en)) kcal."
            case .es: "Hoy no has registrado ninguna comida: el objetivo es \(group(s.kcalTarget, .es)) kcal."
            }
          }))
    }

    if s.steps > 0 {
      next.append(
        Line(
          key: "steps",
          text: t {
            switch $0 {
            case .vi: "Bạn đã đi \(group(s.steps, .vi)) bước."
            case .en: "You’ve walked \(group(s.steps, .en)) steps."
            case .es: "Has caminado \(group(s.steps, .es)) pasos."
            }
          }))
    }

    return [night, state, next.first].compactMap { $0 }
  }
}
