import Foundation

/// Insight dự phòng khi AI không trả lời (16/10, chủ dự án: thẻ Insight không
/// được trống mỗi lần Gemini quá tải). Dựng từ SỐ THẬT của hôm nay — chỉ nói
/// điều số liệu nói, không đoán; thẻ ghi rõ đây là bản tóm tắt từ số liệu.
///
/// Tối đa ba nhắc, ưu tiên: điểm sẵn sàng thấp → đạm thiếu → calo thiếu (theo
/// giờ trong ngày) → giấc ngủ chưa ghi / ngắn → bước chân.
extension SmartNudges {
  public static func fallback(
    _ s: AssistantSuggestions.Signal, lang: String, hour: Int
  ) -> [Nudge] {
    let l = CoachQuickReply.Lang(lang)
    func g(_ v: Double) -> String { CoachQuickReply.grouped(v, l) }
    var out: [Nudge] = []

    if let r = s.scoredReadiness, r < 50 {
      out.append(Nudge(type: "readiness", message: [
        .vi: "Điểm sẵn sàng \(r)/100 — hôm nay ưu tiên buổi tập nhẹ.",
        .en: "Readiness \(r)/100 — keep today's session light.",
        .es: "Preparación \(r)/100: hoy mejor una sesión suave.",
      ][l]!, priority: .high))
    }
    let proLeft = s.proteinTarget - s.proteinG
    if s.proteinTarget > 0, proLeft > s.proteinTarget * 0.3 {
      out.append(Nudge(type: "protein", message: [
        .vi: "Mới nạp \(g(s.proteinG))/\(g(s.proteinTarget)) g đạm — còn \(g(proLeft)) g.",
        .en: "Protein \(g(s.proteinG))/\(g(s.proteinTarget)) g — \(g(proLeft)) g to go.",
        .es: "Proteína \(g(s.proteinG))/\(g(s.proteinTarget)) g: faltan \(g(proLeft)) g.",
      ][l]!, priority: hour >= 15 ? .high : .medium))
    }
    // Calo: chỉ nhắc khi đã quá nửa ngày mà còn thiếu nhiều.
    let kcalLeft = s.kcalTarget - s.kcal
    if hour >= 12, s.kcalTarget > 0, kcalLeft > s.kcalTarget * 0.5 {
      out.append(Nudge(type: "calories", message: [
        .vi: "Mới \(g(s.kcal))/\(g(s.kcalTarget)) kcal — còn \(g(kcalLeft)) kcal cho các bữa còn lại.",
        .en: "\(g(s.kcal))/\(g(s.kcalTarget)) kcal so far — \(g(kcalLeft)) kcal left for the day.",
        .es: "\(g(s.kcal))/\(g(s.kcalTarget)) kcal por ahora: quedan \(g(kcalLeft)) kcal.",
      ][l]!, priority: .medium))
    }
    if s.sleepMin <= 0 {
      out.append(Nudge(type: "sleep", message: [
        .vi: "Chưa có dữ liệu giấc ngủ đêm qua — ghi lại để điểm sẵn sàng chính xác hơn.",
        .en: "No sleep logged for last night — add it for a more accurate readiness score.",
        .es: "Sin sueño registrado anoche: añádelo para una preparación más precisa.",
      ][l]!, priority: .low))
    } else if s.sleepMin < 6 * 60 {
      out.append(Nudge(type: "sleep", message: [
        .vi: "Đêm qua ngủ \(CoachQuickReply.duration(s.sleepMin, l)) — tối nay thử lên giường sớm hơn.",
        .en: "You slept \(CoachQuickReply.duration(s.sleepMin, l)) — try an earlier night tonight.",
        .es: "Dormiste \(CoachQuickReply.duration(s.sleepMin, l)): intenta acostarte antes hoy.",
      ][l]!, priority: .medium))
    }
    if hour >= 14, s.steps > 0, s.steps < 4000 {
      out.append(Nudge(type: "steps", message: [
        .vi: "Mới \(g(s.steps)) bước — một vòng đi bộ ngắn sẽ giúp tỉnh táo hơn.",
        .en: "Only \(g(s.steps)) steps — a short walk will help.",
        .es: "Solo \(g(s.steps)) pasos: un paseo corto te vendrá bien.",
      ][l]!, priority: .low))
    }
    return Array(out.prefix(3))
  }
}

