public import Foundation

/// Chip gợi ý của Trợ lý / AI Coach (#527) — `lib/assistant-suggestions.ts` +
/// `hooks/use-assistant-signal.ts` @ fac9ac2.
///
/// Như RN: chọn từ số của hôm nay, câu hỏi MANG con số (không bao giờ nói một
/// số không có), thứ tự luật là quyết định sản phẩm — điều đang sai hôm nay >
/// điều đang thiếu > ngày tốt > câu chung; mỗi chủ đề (trừ "chung") chỉ một
/// chip; tối đa bốn.
///
/// Khác RN: chip và câu hỏi có cả tiếng Tây Ban Nha (RN: `es` rơi về tiếng
/// Anh); số bước nhóm theo ngôn ngữ của câu (RN: theo locale của máy).
/// Golden: `suggestions-golden.json` từ CHÍNH `suggestionsFor` (vi / en).
public enum AssistantSuggestions {
  public enum Topic: String, Sendable, Hashable { case readiness, load, sleep, nutrition, movement, general }
  public enum Glyph: String, Sendable, Hashable { case gauge, pulse, moon, flame, leaf, bolt, heart }

  public struct Text3: Sendable, Hashable {
    public let vi: String
    public let en: String
    public let es: String

    public func callAsFunction(_ lang: AppPreferences.Lang) -> String {
      switch lang {
      case .vi: vi
      case .en: en
      case .es: es
      }
    }
  }

  public struct Suggestion: Sendable, Hashable, Identifiable {
    public let key: String
    public let topic: Topic
    public let glyph: Glyph
    /// Chữ trên chip.
    public let label: Text3
    /// Câu gửi cho coach.
    public let question: Text3
    public var id: String { key }
  }

  /// `AssistantSignal` — phần mà chip đọc.
  public struct Signal: Sendable, Hashable {
    public var readiness: Int?
    public var status: String?
    public var acwr: Double?
    /// Phút; 0 là chưa ghi (khác với không ngủ).
    public var sleepMin: Double
    public var kcal: Double
    public var kcalTarget: Double
    public var proteinG: Double
    public var proteinTarget: Double
    public var steps: Double
    /// Số ngày lịch từ buổi gần nhất; `nil` khi chưa ghi buổi nào.
    public var daysSinceWorkout: Int?

    public init(
      readiness: Int? = nil, status: String? = nil, acwr: Double? = nil, sleepMin: Double = 0, kcal: Double = 0,
      kcalTarget: Double = 2200, proteinG: Double = 0, proteinTarget: Double = 140, steps: Double = 0,
      daysSinceWorkout: Int? = nil
    ) {
      self.readiness = readiness
      self.status = status
      self.acwr = acwr
      self.sleepMin = sleepMin
      self.kcal = kcal
      self.kcalTarget = kcalTarget
      self.proteinG = proteinG
      self.proteinTarget = proteinTarget
      self.steps = steps
      self.daysSinceWorkout = daysSinceWorkout
    }
  }

  /// `SUGGESTION_SLOTS`.
  public static let slots = 4
  /// `SHORT_SLEEP_MIN` — 7 giờ.
  public static let shortSleepMin = 420.0
  /// `GOOD_SLEEP_MIN` — 7 giờ 30.
  public static let goodSleepMin = 450.0
  static let proteinShortfall = 0.7
  static let lowSteps = 4000.0
  static let kcalGap = 200.0

  /// Nhóm số bước theo ngôn ngữ của câu (`toLocaleString`).
  public typealias Grouping = @Sendable (Int, AppPreferences.Lang) -> String

  public static let localGrouping: Grouping = { n, lang in
    n.formatted(.number.locale(Locale(identifier: lang.rawValue)))
  }

  /// `suggestionsFor`: bỏ chip trùng chủ đề (trừ "chung"), dừng ở bốn.
  public static func suggestions(for s: Signal, grouping: Grouping = localGrouping) -> [Suggestion] {
    var seen = Set<Topic>()
    var out: [Suggestion] = []
    for c in candidates(s, grouping: grouping) {
      if c.topic != .general {
        if seen.contains(c.topic) { continue }
        seen.insert(c.topic)
      }
      out.append(c)
      if out.count == slots { break }
    }
    return out
  }

  /// `hhmm`: 320 → "5h20".
  static func hhmm(_ min: Double) -> String {
    let m = Int(min)
    let rest = m % 60
    return "\(m / 60)h\(rest < 10 ? "0" : "")\(rest)"
  }

  private static func r(_ x: Double) -> String { ReadinessEngine.jsString(JS.round(x)) }

  // swiftlint:disable:next function_body_length
  static func candidates(_ s: Signal, grouping: Grouping) -> [Suggestion] {
    var out: [Suggestion] = []
    func add(_ key: String, _ topic: Topic, _ glyph: Glyph, _ label: Text3, _ question: Text3) {
      out.append(Suggestion(key: key, topic: topic, glyph: glyph, label: label, question: question))
    }
    let zone = s.acwr.map(ReadinessCard.zone)
    let acwr = s.acwr.map { JS.fixed($0, 2) } ?? ""
    let kcalTarget = ReadinessEngine.jsString(s.kcalTarget)
    let proteinTarget = r(s.proteinTarget)

    // ── điều đang sai hôm nay ──
    if s.status == "red" {
      let q =
        if let score = s.readiness {
          Text3(
            vi: "Điểm sẵn sàng của tôi hôm nay là \(score)/100. Vì sao lại thấp và hôm nay tôi nên làm gì?",
            en: "My readiness today is \(score)/100. Why is it low and what should I do today?",
            es: "Mi preparación hoy es \(score)/100. ¿Por qué está baja y qué debería hacer hoy?")
        } else {
          Text3(
            vi: "Hôm nay tôi thấy chưa sẵn sàng tập. Tôi nên điều chỉnh thế nào?",
            en: "I’m not feeling ready to train today. How should I adjust?",
            es: "Hoy no me siento listo para entrenar. ¿Cómo debería ajustarlo?")
        }
      add(
        "readiness-low", .readiness, .gauge,
        Text3(vi: "Vì sao điểm thấp?", en: "Why is readiness low?", es: "¿Por qué está baja?"), q)
    }

    if zone == .spike {
      add(
        "load-spike", .load, .pulse,
        Text3(vi: "Tôi tập quá nặng?", en: "Training too hard?", es: "¿Entreno demasiado?"),
        Text3(
          vi:
            "Tỉ lệ tải cấp tính/mạn tính của tôi đang ở \(acwr), cao hơn nhiều so với thói quen. Tôi có nên giảm tải không, và giảm thế nào?",
          en: "My acute:chronic workload ratio is \(acwr), well above my baseline. Should I back off, and how?",
          es:
            "Mi ratio de carga aguda:crónica es \(acwr), muy por encima de lo habitual. ¿Debería bajar la carga, y cómo?"
        ))
    } else if zone == .elevated {
      add(
        "load-elevated", .load, .pulse,
        Text3(vi: "Tải đang hơi cao", en: "Load running high", es: "Carga algo alta"),
        Text3(
          vi: "Tỉ lệ tải của tôi là \(acwr), hơi cao hơn thói quen. Tuần này tôi nên tập thế nào cho hợp lý?",
          en: "My load ratio is \(acwr), a little above my baseline. How should I plan this week?",
          es: "Mi ratio de carga es \(acwr), un poco por encima de lo habitual. ¿Cómo debería planificar esta semana?"))
    }

    if s.sleepMin > 0 && s.sleepMin < shortSleepMin {
      let t = hhmm(s.sleepMin)
      add(
        "sleep-short", .sleep, .moon,
        Text3(vi: "Tôi ngủ chưa đủ", en: "I slept short", es: "Dormí poco"),
        Text3(
          vi: "Đêm qua tôi chỉ ngủ \(t). Điều đó ảnh hưởng thế nào tới buổi tập hôm nay và tôi nên bù lại ra sao?",
          en: "I only slept \(t) last night. How does that affect today’s training, and how should I recover?",
          es: "Anoche solo dormí \(t). ¿Cómo afecta eso al entrenamiento de hoy y cómo debería recuperarme?"))
    }

    if s.status == "yellow" {
      let q =
        if let score = s.readiness {
          Text3(
            vi: "Điểm sẵn sàng của tôi hôm nay là \(score)/100. Hôm nay tôi nên tập nặng hay tập nhẹ?",
            en: "My readiness today is \(score)/100. Should I train hard or take it easy?",
            es: "Mi preparación hoy es \(score)/100. ¿Debería entrenar fuerte o con calma?")
        } else {
          Text3(
            vi: "Hôm nay tôi nên tập nặng hay tập nhẹ?",
            en: "Should I train hard or take it easy today?",
            es: "¿Debería entrenar fuerte o con calma hoy?")
        }
      add(
        "readiness-moderate", .readiness, .gauge,
        Text3(vi: "Hôm nay tập gì?", en: "What to train?", es: "¿Qué entreno hoy?"), q)
    }

    if zone == .detraining {
      add(
        "load-detraining", .load, .pulse,
        Text3(vi: "Tập lại thế nào?", en: "Getting back in", es: "Cómo retomar"),
        Text3(
          vi: "Tôi đang tập ít hơn hẳn thói quen (tỉ lệ tải \(acwr)). Làm sao để tăng lại mà không bị chấn thương?",
          en: "I’ve been training well below my baseline (load ratio \(acwr)). How do I build back up without getting hurt?",
          es:
            "Estoy entrenando muy por debajo de lo habitual (ratio de carga \(acwr)). ¿Cómo vuelvo a subir sin lesionarme?"
        ))
    }

    // ── điều đang thiếu hôm nay ──
    if s.kcal > 0 && s.proteinTarget > 0 && s.proteinG < s.proteinTarget * proteinShortfall {
      let p = r(s.proteinG)
      add(
        "protein-low", .nutrition, .flame,
        Text3(vi: "Thiếu đạm hôm nay", en: "Short on protein", es: "Falta proteína"),
        Text3(
          vi: "Hôm nay tôi mới ăn \(p)g đạm trên mục tiêu \(proteinTarget)g. Gợi ý vài món giúp tôi bù phần còn lại?",
          en:
            "I’ve had \(p)g of protein today against a \(proteinTarget)g target. What could I eat to close the gap?",
          es:
            "Hoy llevo \(p) g de proteína de un objetivo de \(proteinTarget) g. ¿Qué podría comer para completar lo que falta?"
        ))
    }

    if s.kcal == 0 {
      add(
        "meal-idea", .nutrition, .flame,
        Text3(vi: "Hôm nay ăn gì?", en: "What to eat?", es: "¿Qué como hoy?"),
        Text3(
          vi: "Mục tiêu của tôi là khoảng \(kcalTarget) kcal và \(proteinTarget)g đạm mỗi ngày. Gợi ý thực đơn cho hôm nay?",
          en: "My daily targets are about \(kcalTarget) kcal and \(proteinTarget)g of protein. What could I eat today?",
          es:
            "Mis objetivos diarios son unas \(kcalTarget) kcal y \(proteinTarget) g de proteína. ¿Qué podría comer hoy?"))
    }

    if s.steps > 0 && s.steps < lowSteps {
      let n = Int(s.steps)
      add(
        "steps-low", .movement, .bolt,
        Text3(vi: "Vận động ít", en: "Barely moved", es: "Poco movimiento"),
        Text3(
          vi: "Hôm nay tôi mới đi \(grouping(n, .vi)) bước. Có cách nào dễ để vận động thêm trong ngày không?",
          en: "I’ve only walked \(grouping(n, .en)) steps today. What are some easy ways to move more?",
          es: "Hoy solo he caminado \(grouping(n, .es)) pasos. ¿Qué formas fáciles hay de moverme más?"))
    }

    if let days = s.daysSinceWorkout, days >= 3 {
      add(
        "rest-gap", .load, .pulse,
        Text3(vi: "Nghỉ lâu rồi", en: "Been a while", es: "Hace tiempo"),
        Text3(
          vi: "Đã \(days) ngày tôi chưa tập buổi nào. Nên quay lại bằng buổi tập thế nào cho hợp lý?",
          en: "It's been \(days) days since my last session. How should I ease back in?",
          es: "Han pasado \(days) días desde mi última sesión. ¿Cómo debería volver poco a poco?"))
    }

    if s.sleepMin == 0 {
      add(
        "sleep-quality", .sleep, .moon,
        Text3(vi: "Ngủ ngon hơn", en: "Sleep better", es: "Dormir mejor"),
        Text3(
          vi: "Tôi muốn ngủ sâu hơn và dậy đỡ mệt. Có những thay đổi nào đáng làm trước khi đi ngủ?",
          en: "I want deeper sleep and to wake up less tired. What’s worth changing in my evening routine?",
          es: "Quiero dormir más profundo y despertar menos cansado. ¿Qué vale la pena cambiar antes de dormir?"))
    }

    // ── ngày tốt vẫn đáng hỏi ──
    if s.status == "green", let score = s.readiness {
      add(
        "readiness-high", .readiness, .gauge,
        Text3(vi: "Tận dụng hôm nay", en: "Make it count", es: "Aprovecha el día"),
        Text3(
          vi: "Điểm sẵn sàng của tôi hôm nay là \(score)/100, khá tốt. Nên tận dụng ngày này thế nào?",
          en: "My readiness today is \(score)/100, which is good. How should I make the most of the day?",
          es: "Mi preparación hoy es \(score)/100, bastante buena. ¿Cómo aprovecho mejor el día?"))
    }

    if s.sleepMin >= goodSleepMin {
      let t = hhmm(s.sleepMin)
      add(
        "sleep-good", .sleep, .moon,
        Text3(vi: "Giữ nhịp ngủ này", en: "Keep this rhythm", es: "Mantén este ritmo"),
        Text3(
          vi: "Đêm qua tôi ngủ \(t), khá ổn. Làm sao để duy trì đều đặn như vậy?",
          en: "I slept \(t) last night, which felt right. How do I make that consistent?",
          es: "Anoche dormí \(t), bastante bien. ¿Cómo lo mantengo de forma constante?"))
    }

    if zone == .optimal {
      add(
        "load-optimal", .load, .pulse,
        Text3(vi: "Tăng tải thế nào?", en: "Ready to add?", es: "¿Subo la carga?"),
        Text3(
          vi: "Tỉ lệ tải của tôi là \(acwr), đang trong vùng hợp lý. Tuần tới tôi có nên tăng tải không, và tăng bao nhiêu?",
          en: "My load ratio is \(acwr), right in the useful band. Should I add more next week, and how much?",
          es: "Mi ratio de carga es \(acwr), dentro de la zona útil. ¿Debería subir la próxima semana, y cuánto?"))
    }

    if s.daysSinceWorkout == 0 {
      add(
        "trained-today", .movement, .bolt,
        Text3(vi: "Sau buổi tập", en: "After the session", es: "Después de entrenar"),
        Text3(
          vi: "Tôi vừa tập xong hôm nay. Nên ăn gì và làm gì trong vài giờ tới để phục hồi tốt nhất?",
          en: "I trained today. What should I eat and do over the next few hours to recover best?",
          es: "Hoy ya entrené. ¿Qué debería comer y hacer en las próximas horas para recuperarme mejor?"))
    }

    if s.kcal > 0 && s.kcalTarget > 0 && s.kcalTarget - s.kcal >= kcalGap {
      let k = r(s.kcal)
      let p = r(s.proteinG)
      add(
        "kcal-remaining", .nutrition, .flame,
        Text3(vi: "Còn lại ăn gì?", en: "What’s left to eat?", es: "¿Qué me queda?"),
        Text3(
          vi:
            "Hôm nay tôi đã ăn \(k) kcal trên mục tiêu \(kcalTarget) kcal, và \(p)g đạm trên \(proteinTarget)g. Phần còn lại nên ăn gì?",
          en:
            "I've had \(k) of my \(kcalTarget) kcal today, and \(p)g of \(proteinTarget)g protein. What should I eat for the rest?",
          es:
            "Hoy llevo \(k) de mis \(kcalTarget) kcal, y \(p) g de \(proteinTarget) g de proteína. ¿Qué debería comer el resto del día?"
        ))
    }

    // ── câu chung, ở cuối ──
    add(
      "recovery", .general, .leaf,
      Text3(vi: "Phục hồi tốt hơn", en: "Recover better", es: "Recuperarse mejor"),
      Text3(
        vi: "Tôi nên làm gì giữa các buổi tập để phục hồi tốt hơn?",
        en: "What should I be doing between sessions to recover better?",
        es: "¿Qué debería hacer entre sesiones para recuperarme mejor?"))
    add(
      "energy", .general, .bolt,
      Text3(vi: "Tăng năng lượng", en: "More energy", es: "Más energía"),
      Text3(
        vi: "Buổi chiều tôi hay tụt năng lượng. Nguyên nhân thường là gì và sửa thế nào?",
        en: "My energy dips in the afternoon. What usually causes that and how do I fix it?",
        es: "Por la tarde me baja la energía. ¿Qué suele causarlo y cómo lo soluciono?"))
    add(
      "habit", .general, .heart,
      Text3(vi: "Xây thói quen", en: "Build habits", es: "Crear hábitos"),
      Text3(
        vi: "Làm sao để tôi duy trì đều đặn việc tập và ăn uống trong nhiều tháng?",
        en: "How do I stay consistent with training and food over months rather than weeks?",
        es: "¿Cómo mantengo la constancia con el entrenamiento y la comida durante meses, no semanas?"))
    add(
      "weekly-plan", .general, .pulse,
      Text3(vi: "Kế hoạch tuần", en: "Plan my week", es: "Planear mi semana"),
      Text3(
        vi: "Tuần này tôi nên tập mấy buổi, vào những ngày nào, và nghỉ ngày nào?",
        en: "How many sessions should I train this week, on which days, and when should I rest?",
        es: "¿Cuántas sesiones debería entrenar esta semana, qué días, y cuándo descansar?"))
    return out
  }
}
