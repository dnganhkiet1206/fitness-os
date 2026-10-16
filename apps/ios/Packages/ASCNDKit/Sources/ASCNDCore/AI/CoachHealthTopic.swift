import Foundation

extension Coach {
  /// Câu hỏi có đụng tới sức khoẻ không (16/10, chủ dự án: lời nhắc y tế "chỉ
  /// nên xuất hiện với câu hỏi liên quan đến sức khoẻ"). Chào hỏi, tra số calo,
  /// hỏi bài tập hay thực đơn thì không; đau, chấn thương, ốm, triệu chứng, tim
  /// mạch, giấc ngủ, phục hồi, thuốc / thực phẩm bổ sung, ăn kiêng, giảm cân thì có.
  /// vi / en / es, có dấu hay không dấu.
  public static func isHealthTopic(_ raw: String) -> Bool {
    let t = words(raw)
    return healthWords.contains { t.contains(" \($0) ") }
  }

  /// Chữ thường bỏ dấu, mọi ký tự không phải chữ / số thành khoảng trắng — để
  /// "phục hồi:" hay "(ACWR)" vẫn khớp nguyên từ.
  static func words(_ raw: String) -> String {
    let folded = CoachQuickReply.fold(raw)
    return " " + String(folded.map { $0.isLetter || $0.isNumber ? $0 : " " }) + " "
  }

  /// Câu trả lời của Koa có lời khuyên chạm tới sức khoẻ (chấn thương, phục hồi,
  /// gặp bác sĩ…) — câu hỏi không có từ sức khoẻ ("ACWR 3,43, có nên giảm tải?")
  /// mà câu trả lời có thì vẫn cần lời nhắc (16/10, chủ dự án).
  public static func answerTouchesHealth(_ raw: String) -> Bool {
    let t = words(raw)
    return answerWords.contains { t.contains(" \($0) ") }
  }

  static let answerWords = [
    "chan thuong", "phuc hoi", "qua tai", "bac si", "nghi ngoi", "injury", "injuries", "recovery", "recover",
    "overtraining", "doctor", "physician", "lesion", "lesiones", "recuperacion", "sobreentrenamiento", "medico",
  ]

  static let healthWords = [
    // Tải tập / nguy cơ chấn thương (vi, en, es).
    "acwr", "tai cap tinh", "giam tai", "qua tai", "tap qua suc", "deload", "overtraining", "overreaching",
    "injury risk", "training load", "sobreentrenamiento", "carga de entrenamiento",
    // vi (bỏ dấu)
    // Chữ trùng khi bỏ dấu (cảm/cảm ơn, ho/họ, tim/tìm, ốm/ôm) chỉ nhận theo cụm.
    "dau", "nhuc", "chan thuong", "bi thuong", "sung", "viem", "bi om", "om dau", "benh", "sot", "bi ho", "cam cum",
    "bi cam", "met", "kiet suc", "chong mat", "buon non", "kho tho", "nhip tim", "dau tim", "tim mach", "huyet ap",
    "hrv", "ngu", "mat ngu", "giac ngu",
    "phuc hoi", "thuoc", "bo sung", "thuc pham chuc nang", "creatine", "vitamin", "an kieng", "nhin an", "giam can",
    "beo", "tieu duong", "duong huyet", "cholesterol", "da day", "tieu hoa", "di ung", "mang thai", "kinh nguyet",
    "cang thang", "stress", "lo au", "tram cam",
    // en
    "pain", "hurt", "hurts", "injury", "injured", "sore", "soreness", "swollen", "sick", "ill", "illness", "fever",
    "cold", "flu", "tired", "fatigue", "dizzy", "nausea", "heart", "heart rate", "blood pressure", "sleep", "slept",
    "insomnia", "recovery", "recover", "medicine", "medication", "supplement", "supplements", "diet", "fasting",
    "lose weight", "weight loss", "diabetes", "blood sugar", "stomach", "digestion", "allergy", "allergic",
    "pregnant", "period", "anxiety", "depression",
    // es
    "dolor", "duele", "lesion", "lesionado", "enfermo", "fiebre", "gripe", "cansado", "cansancio", "mareo",
    "corazon", "presion arterial", "sueno", "dormir", "dormi", "insomnio", "recuperacion", "medicamento",
    "suplemento", "suplementos", "dieta", "ayuno", "bajar de peso", "diabetes", "azucar", "estomago", "alergia",
    "embarazada", "ansiedad", "depresion",
  ]
}
