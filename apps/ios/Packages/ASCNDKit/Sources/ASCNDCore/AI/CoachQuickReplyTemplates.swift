import Foundation

/// Kho câu mẫu của `CoachQuickReply` — số thật điền vào, mỗi loại nhiều mẫu để
/// hỏi lại không nghe như máy. Viết như Koa nói: ngắn, thân, không phán xét.
extension CoachQuickReply {
  // swiftlint:disable function_body_length cyclomatic_complexity
  static func templates(_ intent: Intent, _ s: AssistantSuggestions.Signal, _ l: Lang) -> [String] {
    let name = s.name.trimmingCharacters(in: .whitespaces)
    let hi = name.isEmpty ? "" : " \(name)"
    let kcal = grouped(s.kcal, l), kcalT = grouped(s.kcalTarget, l)
    let kcalLeft = grouped(max(0, s.kcalTarget - s.kcal), l)
    let pro = grouped(s.proteinG, l), proT = grouped(s.proteinTarget, l)
    let proLeft = grouped(max(0, s.proteinTarget - s.proteinG), l)
    let steps = grouped(s.steps, l)
    let sleep = duration(s.sleepMin, l)
    let r = s.readiness.map(String.init) ?? ""
    let kcalDone = s.kcal >= s.kcalTarget * 0.95
    let proDone = s.proteinG >= s.proteinTarget * 0.95

    switch (intent, l) {
    // MARK: Chào
    case (.greeting, .vi):
      return [
        "Chào\(hi)! Hôm nay bạn muốn hỏi Koa về tập luyện, ăn uống hay giấc ngủ?",
        "Hi\(hi) 👋 Koa đây. Cứ hỏi một câu cụ thể, ví dụ “hôm nay nên ăn gì để đủ đạm?”",
        "Chào bạn\(hi)! Mình đã xem số liệu hôm nay rồi — bạn muốn bắt đầu từ đâu?",
        "Xin chào\(hi)! Hỏi Koa bất cứ điều gì về buổi tập, bữa ăn hay phục hồi nhé.",
        "Hey\(hi)! Hôm nay mình giúp gì được — lịch tập, thực đơn hay giấc ngủ?",
      ]
    case (.greeting, .en):
      return [
        "Hi\(hi)! What would you like to ask Koa about — training, food or sleep?",
        "Hey\(hi) 👋 Koa here. Ask me something specific, like “what should I eat to hit my protein?”",
        "Hello\(hi)! I've looked at today's numbers — where do you want to start?",
        "Hi there\(hi)! Ask me anything about your workouts, meals or recovery.",
        "Hey\(hi)! What can I help with today — training plan, meals or sleep?",
      ]
    case (.greeting, .es):
      return [
        "¡Hola\(hi)! ¿Sobre qué quieres preguntarle a Koa: entrenamiento, comida o sueño?",
        "Hola\(hi) 👋 Soy Koa. Hazme una pregunta concreta, como “¿qué como para llegar a mi proteína?”",
        "¡Hola\(hi)! Ya vi tus números de hoy, ¿por dónde empezamos?",
        "¡Buenas\(hi)! Pregúntame lo que quieras sobre tus entrenos, comidas o recuperación.",
        "¡Hey\(hi)! ¿En qué te ayudo hoy: plan de entreno, comidas o sueño?",
      ]
    // MARK: Cảm ơn
    case (.thanks, .vi):
      return [
        "Không có gì! Cần gì cứ hỏi Koa nhé 💪",
        "Rất vui được giúp. Chúc bạn một ngày tập thật tốt!",
        "Có gì đâu\(hi)! Mình luôn ở đây khi bạn cần.",
        "Okay nè! Nhớ uống đủ nước nha, hỏi tiếp bất cứ lúc nào.",
      ]
    case (.thanks, .en):
      return [
        "Anytime! Ask Koa whenever you need 💪",
        "Happy to help. Have a great training day!",
        "No problem\(hi)! I'm here whenever you need me.",
        "You got it! Stay hydrated — ask again any time.",
      ]
    case (.thanks, .es):
      return [
        "¡De nada! Pregúntale a Koa cuando quieras 💪",
        "Un gusto ayudarte. ¡Que tengas un gran día de entreno!",
        "¡No hay de qué\(hi)! Aquí estoy cuando me necesites.",
        "¡Listo! Mantente hidratado y pregunta cuando quieras.",
      ]
    // MARK: Ok
    case (.ack, .vi):
      return [
        "Okay! Muốn mình đi sâu hơn phần nào không?",
        "Được rồi 👍 Còn câu nào về tập luyện hay ăn uống không?",
        "Nhận! Khi cần gợi ý cụ thể, cứ nhắn Koa.",
        "Tuyệt. Mình ở đây nếu bạn muốn hỏi thêm.",
      ]
    case (.ack, .en):
      return [
        "Okay! Want me to dig into any part of it?",
        "Got it 👍 Anything else about training or food?",
        "Noted! Ping Koa whenever you want specific tips.",
        "Great. I'm here if you want to ask more.",
      ]
    case (.ack, .es):
      return [
        "¡Vale! ¿Quieres que profundice en alguna parte?",
        "Entendido 👍 ¿Algo más sobre entreno o comida?",
        "¡Anotado! Escríbele a Koa cuando quieras consejos concretos.",
        "Genial. Aquí estoy si quieres preguntar algo más.",
      ]
    // MARK: Gõ nhầm / chưa rõ
    case (.vague, .vi):
      return [
        "Mình chưa hiểu ý bạn 🙂 Hãy hỏi một câu cụ thể để Koa đưa lời khuyên nhé — ví dụ “hôm nay nên tập gì?”",
        "Hình như bị gõ nhầm rồi. Bạn muốn hỏi về tập luyện, ăn uống hay giấc ngủ?",
        "Koa cần thêm chút thông tin. Thử hỏi kiểu “vì sao điểm sẵn sàng của mình thấp?” nhé.",
        "Bạn nói rõ hơn một chút được không? Ví dụ “bữa tối nên ăn gì cho đủ đạm?”",
      ]
    case (.vague, .en):
      return [
        "I didn't quite catch that 🙂 Ask something specific so Koa can help — like “what should I train today?”",
        "Looks like a typo. Do you want to ask about training, food or sleep?",
        "Koa needs a bit more to go on. Try “why is my readiness low?”",
        "Could you say a little more? For example “what should I eat for dinner to hit my protein?”",
      ]
    case (.vague, .es):
      return [
        "No te entendí del todo 🙂 Haz una pregunta concreta para que Koa te ayude, como “¿qué entreno hoy?”",
        "Parece un error al escribir. ¿Quieres preguntar sobre entreno, comida o sueño?",
        "Koa necesita un poco más de contexto. Prueba con “¿por qué mi preparación está baja?”",
        "¿Puedes contarme un poco más? Por ejemplo “¿qué ceno para llegar a mi proteína?”",
      ]
    // MARK: Sẵn sàng
    case (.readiness, .vi):
      guard s.readiness != nil else {
        return [
          "Hôm nay app chưa chấm được điểm sẵn sàng. Kết nối Apple Health hoặc ghi giấc ngủ để Koa có số nhé.",
          "Chưa có điểm sẵn sàng cho hôm nay — thiếu giấc ngủ hoặc nhịp tim. Ghi thêm là mình chấm ngay.",
          "Koa chưa đủ dữ liệu để chấm điểm hôm nay. Đồng bộ Apple Health là cách nhanh nhất.",
        ]
      }
      return [
        "Điểm sẵn sàng hôm nay của bạn là **\(r)/100**.",
        "Hôm nay bạn ở mức **\(r)/100** về khả năng tập luyện.",
        "Koa chấm hôm nay **\(r)/100**. Muốn biết vì sao, cứ hỏi “vì sao điểm của mình như vậy?”",
        "**\(r)/100** — đó là điểm sẵn sàng hôm nay. Hỏi Koa nếu bạn muốn gợi ý buổi tập phù hợp.",
      ]
    case (.readiness, .en):
      guard s.readiness != nil else {
        return [
          "The app couldn't score your readiness today yet. Connect Apple Health or log your sleep so Koa has numbers.",
          "No readiness score for today — sleep or heart-rate data is missing. Log it and I'll score right away.",
          "Koa doesn't have enough data to score today. Syncing Apple Health is the fastest way.",
        ]
      }
      return [
        "Your readiness today is **\(r)/100**.",
        "You're at **\(r)/100** training capacity today.",
        "Koa scores today at **\(r)/100**. Ask “why is my score like this?” if you want the reasons.",
        "**\(r)/100** — that's today's readiness. Ask Koa for a session that fits it.",
      ]
    case (.readiness, .es):
      guard s.readiness != nil else {
        return [
          "La app aún no pudo calcular tu preparación de hoy. Conecta Apple Health o registra tu sueño.",
          "No hay puntuación de preparación hoy: faltan datos de sueño o pulso. Regístralos y la calculo.",
          "Koa no tiene datos suficientes para hoy. Sincronizar Apple Health es lo más rápido.",
        ]
      }
      return [
        "Tu preparación de hoy es **\(r)/100**.",
        "Hoy estás en **\(r)/100** de capacidad de entreno.",
        "Koa te puntúa hoy con **\(r)/100**. Pregunta “¿por qué mi puntuación es así?” para ver los motivos.",
        "**\(r)/100**: esa es tu preparación de hoy. Pídele a Koa una sesión que encaje.",
      ]
    // MARK: Calo
    case (.calories, .vi):
      if kcalDone {
        return [
          "Bạn đã nạp **\(kcal) kcal**, gần đủ mục tiêu \(kcalT) kcal rồi 👏",
          "Hôm nay **\(kcal) / \(kcalT) kcal** — đã chạm mục tiêu.",
          "Đủ năng lượng rồi: **\(kcal) kcal** so với mục tiêu \(kcalT) kcal.",
        ]
      }
      return [
        "Hôm nay bạn đã nạp **\(kcal) kcal**, còn khoảng **\(kcalLeft) kcal** nữa để đạt \(kcalT) kcal.",
        "**\(kcal) / \(kcalT) kcal** đến lúc này. Còn \(kcalLeft) kcal cho các bữa còn lại.",
        "Bạn đang ở **\(kcal) kcal** — thiếu \(kcalLeft) kcal so với mục tiêu. Hỏi Koa nếu cần gợi ý món.",
        "Đã ghi **\(kcal) kcal** hôm nay. Mục tiêu là \(kcalT) kcal, còn \(kcalLeft) kcal nhé.",
      ]
    case (.calories, .en):
      if kcalDone {
        return [
          "You've had **\(kcal) kcal**, right around your \(kcalT) kcal target 👏",
          "Today: **\(kcal) / \(kcalT) kcal** — target reached.",
          "Fuelled up: **\(kcal) kcal** against a \(kcalT) kcal target.",
        ]
      }
      return [
        "You've eaten **\(kcal) kcal** today, about **\(kcalLeft) kcal** to go to reach \(kcalT).",
        "**\(kcal) / \(kcalT) kcal** so far. \(kcalLeft) kcal left for the rest of the day.",
        "You're at **\(kcal) kcal** — \(kcalLeft) short of your target. Ask Koa for meal ideas.",
        "**\(kcal) kcal** logged today. Target is \(kcalT), so \(kcalLeft) to go.",
      ]
    case (.calories, .es):
      if kcalDone {
        return [
          "Llevas **\(kcal) kcal**, casi en tu objetivo de \(kcalT) kcal 👏",
          "Hoy: **\(kcal) / \(kcalT) kcal**, objetivo cumplido.",
          "Con energía de sobra: **\(kcal) kcal** frente a \(kcalT) kcal.",
        ]
      }
      return [
        "Hoy llevas **\(kcal) kcal**, te faltan unas **\(kcalLeft) kcal** para llegar a \(kcalT).",
        "**\(kcal) / \(kcalT) kcal** hasta ahora. Quedan \(kcalLeft) kcal para el resto del día.",
        "Vas en **\(kcal) kcal**, te faltan \(kcalLeft). Pídele ideas de comidas a Koa.",
        "**\(kcal) kcal** registradas hoy. El objetivo es \(kcalT): faltan \(kcalLeft).",
      ]
    // MARK: Đạm
    case (.protein, .vi):
      if proDone {
        return [
          "Đạm hôm nay đã đủ: **\(pro) g / \(proT) g** 💪",
          "Bạn đã nạp **\(pro) g đạm**, chạm mục tiêu \(proT) g rồi.",
          "Tuyệt — **\(pro) g** đạm, đủ cho hôm nay.",
        ]
      }
      return [
        "Bạn đã nạp **\(pro) g đạm**, còn **\(proLeft) g** để đủ \(proT) g.",
        "Đạm hôm nay: **\(pro) / \(proT) g**. Thêm khoảng \(proLeft) g nữa nhé.",
        "**\(pro) g đạm** đến giờ — còn thiếu \(proLeft) g. Trứng, ức gà hay sữa chua đều giúp được.",
        "Mới **\(pro) g** trên mục tiêu \(proT) g đạm. Hỏi Koa nếu muốn gợi ý bữa giàu đạm.",
      ]
    case (.protein, .en):
      if proDone {
        return [
          "Protein is covered today: **\(pro) g / \(proT) g** 💪",
          "You've had **\(pro) g of protein**, target of \(proT) g reached.",
          "Nice — **\(pro) g** protein, enough for today.",
        ]
      }
      return [
        "You've had **\(pro) g of protein**, **\(proLeft) g** to go to reach \(proT) g.",
        "Protein today: **\(pro) / \(proT) g**. About \(proLeft) g more.",
        "**\(pro) g protein** so far — \(proLeft) g short. Eggs, chicken or Greek yogurt all help.",
        "Only **\(pro) g** of your \(proT) g protein target. Ask Koa for high-protein meal ideas.",
      ]
    case (.protein, .es):
      if proDone {
        return [
          "Proteína cubierta hoy: **\(pro) g / \(proT) g** 💪",
          "Llevas **\(pro) g de proteína**, objetivo de \(proT) g cumplido.",
          "Genial: **\(pro) g** de proteína, suficiente para hoy.",
        ]
      }
      return [
        "Llevas **\(pro) g de proteína**, te faltan **\(proLeft) g** para \(proT) g.",
        "Proteína hoy: **\(pro) / \(proT) g**. Unos \(proLeft) g más.",
        "**\(pro) g de proteína** por ahora, faltan \(proLeft) g. Huevos, pollo o yogur griego ayudan.",
        "Solo **\(pro) g** de tu objetivo de \(proT) g. Pídele a Koa ideas altas en proteína.",
      ]
    // MARK: Bước chân
    case (.steps, .vi):
      guard s.steps > 0 else {
        return [
          "Hôm nay chưa có số bước. Kết nối Apple Health để Koa đếm giúp bạn nhé.",
          "Koa chưa thấy bước chân nào hôm nay — có thể Apple Health chưa đồng bộ.",
          "Chưa có dữ liệu bước chân. Mở Apple Health hoặc mang điện thoại khi đi lại là có ngay.",
        ]
      }
      return [
        "Hôm nay bạn đã đi **\(steps) bước**.",
        "**\(steps) bước** tính đến giờ. Thêm một vòng đi bộ ngắn là đẹp!",
        "Bước chân hôm nay: **\(steps)**. Giữ nhịp nhé 🚶",
        "Bạn đang ở **\(steps) bước**. Đứng dậy đi lại vài phút mỗi giờ sẽ cộng nhanh lắm.",
      ]
    case (.steps, .en):
      guard s.steps > 0 else {
        return [
          "No steps yet today. Connect Apple Health so Koa can count them.",
          "Koa hasn't seen any steps today — Apple Health may not have synced.",
          "No step data yet. Open Apple Health or carry your phone and it'll show up.",
        ]
      }
      return [
        "You've walked **\(steps) steps** today.",
        "**\(steps) steps** so far. A short walk would round it off nicely!",
        "Steps today: **\(steps)**. Keep it going 🚶",
        "You're at **\(steps) steps**. A few minutes of walking each hour adds up fast.",
      ]
    case (.steps, .es):
      guard s.steps > 0 else {
        return [
          "Aún no hay pasos hoy. Conecta Apple Health para que Koa los cuente.",
          "Koa no ve pasos hoy: puede que Apple Health no se haya sincronizado.",
          "Sin datos de pasos todavía. Abre Apple Health o lleva el móvil y aparecerán.",
        ]
      }
      return [
        "Hoy llevas **\(steps) pasos**.",
        "**\(steps) pasos** hasta ahora. ¡Un paseo corto lo redondea!",
        "Pasos de hoy: **\(steps)**. Sigue así 🚶",
        "Vas en **\(steps) pasos**. Caminar unos minutos cada hora suma rápido.",
      ]
    // MARK: Giấc ngủ
    case (.sleep, .vi):
      guard s.sleepMin > 0 else {
        return [
          "Koa chưa có dữ liệu giấc ngủ đêm qua. Ghi tay hoặc đồng bộ Apple Health nhé.",
          "Đêm qua chưa được ghi lại. Thêm giấc ngủ để điểm sẵn sàng chính xác hơn.",
          "Chưa thấy giấc ngủ nào cho đêm qua — có thể đồng hồ chưa đồng bộ.",
        ]
      }
      return [
        "Đêm qua bạn ngủ **\(sleep)**.",
        "Giấc ngủ đêm qua: **\(sleep)**.",
        "Bạn đã ngủ **\(sleep)** đêm qua. Hỏi Koa nếu muốn mẹo ngủ ngon hơn.",
        "**\(sleep)** — đó là giấc ngủ đêm qua của bạn.",
      ]
    case (.sleep, .en):
      guard s.sleepMin > 0 else {
        return [
          "Koa has no sleep data for last night. Log it or sync Apple Health.",
          "Last night wasn't recorded. Add your sleep for a more accurate readiness score.",
          "No sleep found for last night — your watch may not have synced.",
        ]
      }
      return [
        "You slept **\(sleep)** last night.",
        "Last night's sleep: **\(sleep)**.",
        "You got **\(sleep)** of sleep last night. Ask Koa for tips to sleep better.",
        "**\(sleep)** — that's your sleep from last night.",
      ]
    case (.sleep, .es):
      guard s.sleepMin > 0 else {
        return [
          "Koa no tiene datos de sueño de anoche. Regístralo o sincroniza Apple Health.",
          "Anoche no quedó registrada. Añade tu sueño para una preparación más precisa.",
          "No hay sueño de anoche: puede que el reloj no se haya sincronizado.",
        ]
      }
      return [
        "Anoche dormiste **\(sleep)**.",
        "Sueño de anoche: **\(sleep)**.",
        "Dormiste **\(sleep)** anoche. Pídele a Koa consejos para dormir mejor.",
        "**\(sleep)**: eso dormiste anoche.",
      ]
    // MARK: Tổng quan hôm nay
    case (.today, .vi):
      return [
        "Đây là ngày của bạn đến lúc này. Muốn Koa gợi ý bước tiếp theo không?",
        "Tóm tắt nhanh hôm nay ở trên. Hỏi Koa phần nào bạn muốn cải thiện nhé.",
        "Số liệu hôm nay đây\(hi). Cần kế hoạch cho phần còn lại của ngày thì cứ nói.",
        "Một cái nhìn nhanh về hôm nay. Koa có thể gợi ý bữa ăn hoặc buổi tập phù hợp.",
      ]
    case (.today, .en):
      return [
        "Here's your day so far. Want Koa to suggest a next step?",
        "A quick summary of today above. Ask Koa about anything you want to improve.",
        "Today's numbers\(hi). Say the word if you want a plan for the rest of the day.",
        "A quick look at today. Koa can suggest a meal or session that fits.",
      ]
    case (.today, .es):
      return [
        "Así va tu día. ¿Quieres que Koa te sugiera el siguiente paso?",
        "Un resumen rápido de hoy arriba. Pregúntale a Koa lo que quieras mejorar.",
        "Los números de hoy\(hi). Dime si quieres un plan para el resto del día.",
        "Un vistazo rápido a hoy. Koa puede sugerirte una comida o sesión que encaje.",
      ]
    }
  }
  // swiftlint:enable function_body_length cyclomatic_complexity
}
