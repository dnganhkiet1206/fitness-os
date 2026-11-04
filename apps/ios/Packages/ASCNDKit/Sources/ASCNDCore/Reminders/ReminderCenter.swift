public import Foundation
public import Observation

/// Chữ của một thông báo.
public struct ReminderText: Sendable, Hashable {
  public let title: String
  public let body: String
  /// Câu khi lời nhắc bắn theo giờ quen ("giờ này mọi hôm bạn đã…"); `nil` = `body`.
  public let habitBody: String?
  public init(title: String, body: String, habitBody: String? = nil) {
    self.title = title
    self.body = body
    self.habitBody = habitBody
  }
}

/// Chữ theo khoá, ở ngôn ngữ đang dùng (`ReminderCopy`). Bên gọi giữ i18n.
public typealias ReminderCopy = [ReminderKey: ReminderText]

/// Một thông báo một lần cụ thể giao cho hệ điều hành.
public struct ScheduledReminder: Sendable, Hashable {
  public let key: ReminderKey
  public let at: Date
  public let text: ReminderText
  public init(key: ReminderKey, at: Date, text: ReminderText) {
    self.key = key
    self.at = at
    self.text = text
  }
}

/// Điều thật sự tới được hệ điều hành. `requested > scheduled` nghĩa là phần
/// đuôi không chờ.
public struct ScheduleOutcome: Sendable, Hashable {
  public let requested: Int
  public let scheduled: Int
  /// `false` khi máy không có thông báo — không thử gì cả.
  public let supported: Bool
  public init(requested: Int, scheduled: Int, supported: Bool) {
    self.requested = requested
    self.scheduled = scheduled
    self.supported = supported
  }
}

/// Cổng hệ điều hành (`lib/notifications.ts`). Bản iOS bọc
/// `UNUserNotificationCenter`; Core chỉ biết hợp đồng này.
///
/// Hợp đồng của `replaceAll` (RN, sau hai lần sửa):
/// - huỷ MỌI thông báo đang chờ của app trước — kế hoạch là phát biểu đầy đủ
///   về điều phải chờ; huỷ hỏng thì không đặt gì và báo `scheduled: 0`;
/// - một yêu cầu bị từ chối chỉ mất MỘT lời nhắc — đi tiếp, và đếm cái tới
///   được (từng có một `try` bọc cả vòng: từ chối thứ 20 làm mất 37/56).
public protocol ReminderScheduler: Sendable {
  /// Máy có thông báo cục bộ không (`notificationsAvailable`).
  var isAvailable: Bool { get }
  func hasPermission() async -> Bool
  /// Hỏi quyền; trả về đã được cấp chưa. Hỏng = `false`.
  func requestPermission() async -> Bool
  func replaceAll(_ items: [ScheduledReminder]) async -> ScheduleOutcome
  func cancelAll() async
}

/// Cài đặt nhắc nhở + lịch của hệ điều hành (`use-reminders.ts`).
///
/// RN behavior (giữ nguyên):
/// - MỘT bản cài đặt cho cả app (RN từng có hai bản — Hôm nay và màn Nhắc nhở
///   — và bản cũ ghi đè lịch của bản mới: công tắc bật, OS giữ 0);
/// - bật cái đầu tiên thì xin quyền; không có quyền thì không đặt gì;
/// - lịch đặt lại khi kế hoạch KHÁC chữ ký đã ghi (`ascnd_reminder_plan`), và
///   chữ ký chỉ được ghi SAU khi OS nhận ĐỦ — đặt hụt thì lần sau thử lại
///   (RN từng ghi trước: một lần từ chối là không bao giờ đặt lại);
/// - mỗi lần chỉ MỘT bên ghi lịch (hai lượt huỷ-rồi-thêm xen nhau từng để lại
///   112 thông báo cho kế hoạch 56);
/// - cài đặt, chữ ký và chốt giờ-thông-minh là THEO TÀI KHOẢN: đăng xuất xoá
///   cả ba, đưa cài đặt về mặc định, và huỷ mọi thông báo đang chờ.
/// Đọc cài đặt là đồng bộ (`UserDefaults`), nên không có cờ "đang nạp" và
/// không có cuộc đua nạp-sau-đăng-xuất mà RN phải chặn bằng số thế hệ.
@MainActor @Observable
public final class ReminderCenter {
  public static let prefsKey = "ascnd_reminders"
  public static let planKey = "ascnd_reminder_plan"
  public static let smartTimeKey = "ascnd_reminder_smart_time_v1"
  /// Sổ lời nhắc buổi tập của Koa đã bắn / đã mở (#800, `KoaNudge.Ledger`).
  public static let nudgeKey = "ascnd_koa_nudge_v1"
  /// Đã xin quyền thông báo sau khi có lịch tập (#800). Quyền là của máy, nên khoá này
  /// không theo tài khoản.
  public static let askedAfterScheduleKey = "ascnd_reminder_asked_after_schedule"
  /// Khoá theo tài khoản (`USER_KEYS`).
  public static let userKeys = [planKey, prefsKey, smartTimeKey, nudgeKey]

  public private(set) var prefs: ReminderPrefs
  /// Đã được cấp quyền thông báo.
  public private(set) var permission = false
  /// Chữ ở ngôn ngữ đang dùng. Đổi ngôn ngữ không đổi giờ nào, nên không đặt
  /// lại lịch (như RN) — thông báo đang chờ giữ chữ cũ tới lần đặt kế.
  public var copy: ReminderCopy
  /// Điều hôm nay đã biết, lần đồng bộ gần nhất.
  public private(set) var context: ReminderContext = .unknown

  @ObservationIgnored private let store: any KeyValueStore
  @ObservationIgnored private let scheduler: any ReminderScheduler
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let calendar: Calendar
  @ObservationIgnored private var writing: Task<ScheduleOutcome?, Never>?

  public init(
    store: any KeyValueStore, scheduler: any ReminderScheduler, copy: ReminderCopy,
    clock: any WallClock = SystemWallClock(), calendar: Calendar = .current
  ) {
    self.store = store
    self.scheduler = scheduler
    self.copy = copy
    self.clock = clock
    self.calendar = calendar
    prefs = ReminderPrefs.decode(store.string(forKey: Self.prefsKey))
  }

  public var isAvailable: Bool { scheduler.isAvailable }

  /// Xin quyền thông báo ngay sau khi người dùng có lịch tập đầu tiên (#800), không xin lúc
  /// mới mở app: lời nhắc buổi tập của Koa bật sẵn nên đây là lúc nó có ích. Chỉ một lần mỗi máy;
  /// đã có quyền, hay tắt cả hai lời nhắc buổi tập, thì không hỏi.
  public func askAfterSchedule() async {
    guard isAvailable, store.string(forKey: Self.askedAfterScheduleKey) == nil else { return }
    if !permission { permission = await scheduler.hasPermission() }
    guard !permission, prefs.koaTraining || prefs.workout.enabled else { return }
    store.set("1", forKey: Self.askedAfterScheduleKey)
    permission = await scheduler.requestPermission()
    guard permission else { return }
    await commit(currentPlan(context))
  }

  /// Người dùng chạm một lời nhắc: lời nhắc buổi tập được mở thì hết "bị bỏ qua" (#800).
  public func noteOpened(_ key: ReminderKey) {
    guard key == .koaTraining else { return }
    var ledger = nudge
    ledger.opened(at: clock.now())
    saveNudge(ledger)
  }

  /// Gợi ý bật quyền: máy có thông báo, chưa có quyền, mà có cái đang bật.
  public var needsPermissionHint: Bool { isAvailable && !permission && prefs.anyEnabled }

  /// Đọc lại quyền (lúc mở màn, lúc app quay lại tiền cảnh).
  public func refreshPermission() async {
    permission = await scheduler.hasPermission()
  }

  // MARK: - Sửa cài đặt

  public func setEnabled(_ key: ReminderKey, _ on: Bool) async {
    var next = prefs
    next.setEnabled(key, on)
    await apply(next)
  }

  public func setTime(_ key: ReminderKey, hour: Int, minute: Int) async {
    guard ReminderKey.timed.contains(key), (0...23).contains(hour), (0...59).contains(minute) else { return }
    var next = prefs
    next[timed: key].hour = hour
    next[timed: key].minute = minute
    await apply(next)
  }

  /// Giờ nhắc bữa thêm (Kiệt 01/11): thêm (tới `maxMealTimes`), đổi, xoá theo vị trí.
  public func addMealTime() async {
    guard prefs.mealExtra.count < ReminderPrefs.maxMealTimes - 1 else { return }
    var next = prefs
    next.mealExtra.append(ReminderPrefs.nextMealSlot(after: [prefs.meal.clock] + prefs.mealExtra))
    next.mealExtra.sort { $0.minutes < $1.minutes }
    await apply(next)
  }

  public func setMealTime(at index: Int, hour: Int, minute: Int) async {
    guard prefs.mealExtra.indices.contains(index), (0...23).contains(hour), (0...59).contains(minute) else { return }
    var next = prefs
    next.mealExtra[index] = ReminderClock(hour: hour, minute: minute)
    next.mealExtra.sort { $0.minutes < $1.minutes }
    await apply(next)
  }

  public func removeMealTime(at index: Int) async {
    guard prefs.mealExtra.indices.contains(index) else { return }
    var next = prefs
    next.mealExtra.remove(at: index)
    await apply(next)
  }

  public func setWaterInterval(_ everyHours: Double) async {
    guard everyHours.isFinite, everyHours > 0 else { return }
    var next = prefs
    next.water.everyHours = everyHours
    await apply(next)
  }

  /// Nhắc buổi tối sau lần ghi đầu tiên (17/10, chủ dự án: không có gì kéo người
  /// dùng quay lại — mọi nhắc nhở tắt mặc định như RN). Người CHƯA TỪNG chạm cài
  /// đặt nhắc nhở (chưa có `prefsKey`): bật nhắc bữa 20:00 — vốn chỉ bắn khi hôm
  /// ấy chưa ghi bữa nào — và xin quyền thông báo ngay lúc họ vừa ghi. Đã từng
  /// lưu cài đặt (kể cả tắt hết) thì không đụng. Mặc định của RN giữ nguyên.
  /// Khác RN — NATIVE_IMPROVEMENTS.
  public func firstLogNudge() async {
    guard isAvailable, store.string(forKey: Self.prefsKey) == nil else { return }
    var next = prefs
    next.setEnabled(.meal, true)
    await apply(next)
  }

  /// Lưu + đặt lại; xin quyền lần đầu có cái bật.
  ///
  /// Kế hoạch dựng từ `prefs` HIỆN TẠI sau khi chờ quyền, không từ `next`:
  /// `write(next)` đã đặt `prefs = next` trước đó (#457 — kế hoạch không cũ),
  /// và nếu trong lúc hộp xin quyền đang mở người dùng sửa thêm, lượt này phải
  /// đặt theo lần sửa MỚI NHẤT chứ không theo `next` đã cũ.
  private func apply(_ next: ReminderPrefs) async {
    write(next)
    if next.anyEnabled && !permission { permission = await scheduler.requestPermission() }
    guard permission else { return }
    await commit(currentPlan(context))
  }

  private func write(_ next: ReminderPrefs) {
    prefs = next
    store.set(next.encoded(), forKey: Self.prefsKey)
  }

  // MARK: - Giữ lịch đúng theo ngày

  /// Hôm nay có tin mới (đã tập, đã cân, lịch tập vừa đọc…): dựng lại kế hoạch
  /// và đặt lại nếu nó khác cái đã ghi. Không xin quyền — bật nhắc nhở vẫn là
  /// quyết định ở màn Nhắc nhở (`useReminderSync`).
  public func sync(_ ctx: ReminderContext) async {
    context = ctx
    guard permission else { return }
    let plan = currentPlan(ctx)
    if store.string(forKey: Self.planKey) == ReminderPlan.signature(plan) { return }
    await commit(plan)
  }

  /// Kế hoạch từ cài đặt hiện tại, sau khi tính các lời nhắc buổi tập đã bắn từ lần trước
  /// (bị bỏ qua 3 lần liền → 2 ngày một lần, #800).
  private func currentPlan(_ ctx: ReminderContext) -> [PlannedReminder] {
    let now = clock.now()
    var ledger = nudge
    ledger.settle(now: now)
    if ledger != nudge { saveNudge(ledger) }
    var ctx = ctx
    ctx.koaTrainingEvery = ledger.every
    ctx.lastKoaTrainingOffset = ledger.lastFiredOffset(now: now, calendar: calendar)
    return ReminderPlan.plan(prefs, ctx, now: now, calendar: calendar)
  }

  private var nudge: KoaNudge.Ledger {
    store.string(forKey: Self.nudgeKey).flatMap { try? JSONDecoder().decode(KoaNudge.Ledger.self, from: Data($0.utf8)) }
      ?? KoaNudge.Ledger()
  }

  private func saveNudge(_ ledger: KoaNudge.Ledger) {
    guard let data = try? JSONEncoder().encode(ledger), let text = String(data: data, encoding: .utf8) else { return }
    store.set(text, forKey: Self.nudgeKey)
  }

  /// Đặt kế hoạch, và CHỈ SAU ĐÓ ghi rằng nó đã được đặt.
  private func commit(_ plan: [PlannedReminder]) async {
    let items = plan.map { p in
      let shared = copy[p.key] ?? ReminderText(title: "", body: "")
      // Koa (đợt 2B): giờ quen → câu "mọi hôm"; `{n}` = số ngày chuỗi.
      let n = String(context.streak)
      let base = ReminderText(
        title: shared.title.replacingOccurrences(of: "{n}", with: n),
        body: (p.habit ? shared.habitBody ?? shared.body : shared.body).replacingOccurrences(of: "{n}", with: n))
      let text = p.title != nil || p.body != nil
        ? ReminderText(title: p.title ?? base.title, body: p.body ?? base.body) : base
      return ScheduledReminder(key: p.key, at: p.at, text: text)
    }
    guard let outcome = await serialised({ [scheduler] in await scheduler.replaceAll(items) }) else { return }
    // Đặt hụt không phải kế hoạch: để chữ ký cũ, lần sau thử lại.
    guard outcome.supported, outcome.scheduled == outcome.requested else { return }
    store.set(ReminderPlan.signature(plan), forKey: Self.planKey)
    var ledger = nudge
    ledger.record(plan.filter { $0.key == .koaTraining }.map(\.at))
    saveNudge(ledger)
  }

  /// Một bên ghi lịch tại một thời điểm: việc sau đợi việc trước xong hẳn.
  private func serialised(_ job: @escaping @Sendable () async -> ScheduleOutcome?) async -> ScheduleOutcome? {
    let previous = writing
    let task = Task<ScheduleOutcome?, Never> {
      _ = await previous?.value
      return await job()
    }
    writing = task
    return await task.value
  }

  // MARK: - Giờ thông minh (P1-12)

  /// Giờ ngủ / dậy mà người dùng đã TỰ lưu, đọc từ hồ sơ ĐÃ NẠP: mỗi giờ
  /// chỉ có khi cờ `sleep_target_*_set` của nó bật (không bao giờ giờ mặc
  /// định của DB).
  public struct SleepSchedule: Sendable, Hashable {
    public let bedtime: String?
    public let waketime: String?
    public init(bedtime: String?, waketime: String?) {
      self.bedtime = bedtime
      self.waketime = waketime
    }
  }

  /// Áp giờ suy từ hồ sơ MỘT LẦN cho mỗi tài khoản (P1-12, `use-reminders.ts:273`).
  /// Trả về `true` nếu có giờ được dời (và lịch đã đặt lại).
  ///
  /// `schedule == nil` = hồ sơ CHƯA nạp: không làm gì, không chốt (#457 —
  /// trước đây gọi sớm là chốt vĩnh viễn, lần gọi đúng sau đó bị bỏ). RN chỉ
  /// chạy khi `loaded && profile`. Khi hồ sơ đã nạp thì chốt như RN, kể cả
  /// khi không dời gì (chưa tự lưu giờ nào, giờ không đọc được, hay người
  /// dùng đã tự chọn giờ) — một giờ người dùng chọn không bao giờ bị dời.
  ///
  /// Thứ tự: ghi cài đặt TRƯỚC rồi mới chốt — app chết giữa chừng thì lần sau
  /// chạy lại, gặp giờ đã dời (không còn mặc định gõ tay) và chỉ chốt. Đặt
  /// lịch hỏng không gỡ chốt: cài đặt đã lưu, chữ ký chưa ghi, `sync` kế tiếp
  /// đặt lại.
  @discardableResult
  public func applySmartTiming(_ schedule: SleepSchedule?) async -> Bool {
    guard let schedule, store.string(forKey: Self.smartTimeKey) == nil else { return false }
    let next = schedule.bedtime != nil || schedule.waketime != nil
      ? ReminderTiming.smartDefaults(prefs, bedtime: schedule.bedtime, waketime: schedule.waketime) : nil
    if let next { write(next) }
    store.set("1", forKey: Self.smartTimeKey)
    guard next != nil else { return false }
    await sync(context)
    return true
  }

  // MARK: - Hết phiên

  /// Đăng xuất (`forgetPreviousAccount`): huỷ mọi thông báo đang chờ — lời
  /// nhắc của người trước không được bắn trên máy của người sau — xoá ba khoá
  /// theo tài khoản và đưa cài đặt về mặc định. Quyền là của máy, giữ nguyên.
  public func clearUserScoped() async {
    for key in Self.userKeys { store.remove(key) }
    prefs = .defaults
    context = .unknown
    _ = await serialised({ [scheduler] in
      await scheduler.cancelAll()
      return nil
    })
  }
}

/// Chữ thông báo theo ngôn ngữ app (`nReminder*` của `native-strings.ts` @
/// fac9ac2, nguyên văn). Thông báo không phải chữ trên màn hình: nó được đặt
/// trước nhiều ngày theo ngôn ngữ của `AppPreferences.lang` (không phải ngôn
/// ngữ máy), nên bảng nằm ở đây, kiểm được, thay vì trong String Catalog.
public enum ReminderCopyTable {
  /// Câu của Koa khi người dùng quay lại sau ≥ 3 ngày nghỉ (GĐ1, Kiệt 21/10):
  /// chào đón, thành tích còn nguyên, nhẹ cũng được. Không trách, không đếm lỗi.
  public static func koaWorkout(_ lang: AppPreferences.Lang) -> KoaWorkoutCopy {
    switch lang {
    case .vi:
      KoaWorkoutCopy(returning: ReminderText(
        title: "Koa vẫn ở đây 💪", body: "Thành tích của Koa còn nguyên. Buổi hôm nay nhẹ thôi cũng được."))
    case .en:
      KoaWorkoutCopy(returning: ReminderText(
        title: "Koa's still here 💪", body: "Everything Koa earned is still there. An easy session today is fine."))
    case .es:
      KoaWorkoutCopy(returning: ReminderText(
        title: "Koa sigue aquí 💪", body: "Todo lo que Koa ganó sigue ahí. Una sesión suave hoy está bien."))
    }
  }

  /// Các câu của lời nhắc buổi tập, xoay vòng theo ngày (#800). Câu đầu là câu chung của
  /// `copy`; giọng Koa, không trách, không nói mất mát. Cột thứ ba: câu khi bắn theo giờ quen.
  public static func koaTraining(_ lang: AppPreferences.Lang) -> [ReminderText] {
    let rows: [(String, String, String)] = switch lang {
    case .vi: [
        ("Koa khởi động xong rồi 🏋️", "Buổi tập hôm nay đang đợi bạn.",
          "Giờ này mọi hôm bạn đã vào tập. Koa khởi động xong rồi 🏋️"),
        ("Koa trải thảm sẵn rồi 🧘", "Hôm nay có buổi tập trong lịch. Vào lúc nào cũng được.",
          "Giờ này mọi hôm bạn đã tập. Thảm trải sẵn rồi nè 🧘"),
        ("Koa đang đếm bước 👟", "Một buổi ngắn hôm nay cũng tính. Koa đi cùng bạn.",
          "Giờ này mọi hôm bạn đã vào tập. Một buổi ngắn cũng được 👟"),
        ("Tạ ở đây, Koa ở đây 🏋️", "Buổi trong lịch hôm nay chờ bạn ghé qua.",
          "Đúng giờ quen của bạn rồi. Koa ở đây khi bạn sẵn sàng 🏋️"),
        ("Koa uống nước xong rồi 💧", "Mình vào buổi hôm nay nhé? Nhẹ thôi cũng được.",
          "Giờ này mọi hôm bạn đã tập. Nhẹ thôi cũng được 💧"),
      ]
    case .en: [
        ("Koa is warmed up 🏋️", "Today's session is waiting for you.",
          "You usually train by now. Koa is warmed up 🏋️"),
        ("Koa rolled out the mat 🧘", "There's a session on your plan today. Whenever suits you.",
          "You usually train by now. The mat is ready 🧘"),
        ("Koa is counting steps 👟", "A short session today still counts. Koa's coming along.",
          "You usually train by now. A short one is fine 👟"),
        ("The weights are here, so is Koa 🏋️", "Today's planned session is ready when you are.",
          "It's your usual time. Koa is here when you're ready 🏋️"),
        ("Koa just had some water 💧", "Shall we do today's session? Easy is fine.",
          "You usually train by now. Easy is fine 💧"),
      ]
    case .es: [
        ("Koa ya calentó 🏋️", "Tu sesión de hoy te está esperando.",
          "A esta hora sueles entrenar. Koa ya calentó 🏋️"),
        ("Koa extendió la esterilla 🧘", "Hoy hay una sesión en tu plan. Cuando te venga bien.",
          "A esta hora sueles entrenar. La esterilla está lista 🧘"),
        ("Koa está contando pasos 👟", "Una sesión corta hoy también cuenta. Koa te acompaña.",
          "A esta hora sueles entrenar. Una corta está bien 👟"),
        ("Las pesas están aquí, y Koa también 🏋️", "La sesión de hoy está lista cuando tú lo estés.",
          "Es tu hora de siempre. Koa está aquí cuando estés listo 🏋️"),
        ("Koa acaba de tomar agua 💧", "¿Hacemos la sesión de hoy? Suave está bien.",
          "A esta hora sueles entrenar. Suave está bien 💧"),
      ]
    }
    return rows.map { ReminderText(title: $0.0, body: $0.1, habitBody: $0.2) }
  }

  public static func copy(_ lang: AppPreferences.Lang) -> ReminderCopy {
    // Giọng Koa (đợt 2B, 19/10 — không theo RN): Koa nói ngôi thứ nhất, nhẹ nhàng,
    // không trách. Cột thứ tư: câu khi bắn theo giờ quen của người này.
    let rows: [(ReminderKey, String, String, String?)] = switch lang {
    case .vi: [
        (.water, "Uống nước nè", "Koa vừa uống một ngụm, bạn uống cùng nhé 💧", nil),
        (.supplements, "Thực phẩm bổ sung", "Koa nhắc nhẹ: tới giờ uống thực phẩm bổ sung rồi 💊", nil),
        (.bedtime, "Sắp tới giờ ngủ", "Koa ngáp rồi nè. Mình thư giãn rồi đi ngủ thôi 😴", nil),
        (.weighIn, "Cân buổi sáng", "Bước lên cân trước bữa sáng nhé, Koa ghi lại cho ⚖️", nil),
        (.workout, "Hôm nay có buổi tập", "Koa khởi động xong rồi, chờ bạn vào tập đó 💪",
          "Giờ này mọi hôm bạn đã tập rồi. Koa sẵn sàng khi bạn sẵn sàng 💪"),
        (.meal, "Bạn ăn gì chưa?", "Bụng Koa kêu rồi nè. Hôm nay bạn đã ăn gì? 🍽",
          "Giờ này mọi hôm bạn đã ăn rồi. Ghi bữa giúp Koa nhé 🍽"),
        (.biometrics, "Số đo buổi sáng", "Đo nhịp tim nghỉ và HRV trước khi rời giường nhé, Koa chờ số ❤️", nil),
        (.sleepLog, "Đêm qua ngủ sao?", "Koa ngủ ngon lắm. Còn bạn thì sao? Ghi lại nhé 🌙",
          "Giờ này mọi hôm bạn đã ghi giấc ngủ rồi. Đêm qua thế nào? 🌙"),
        (.challengeClaim, "Thưởng sắp hết hạn", "Thưởng sắp hết hạn", nil),
        (.streak, "Chuỗi {n} ngày đang chờ", "Chuỗi {n} ngày chỉ cần một việc nhỏ hôm nay thôi. Koa chờ bạn nè 🔥", nil),
        (.koaTraining, "Koa khởi động xong rồi 🏋️", "Buổi tập hôm nay đang đợi bạn.",
          "Giờ này mọi hôm bạn đã vào tập. Koa khởi động xong rồi 🏋️"),
      ]
    case .en: [
        (.water, "Water time", "Koa just had a sip. Join me for a glass 💧", nil),
        (.supplements, "Supplements", "Gentle nudge from Koa: time for your supplements 💊", nil),
        (.bedtime, "Bedtime soon", "Koa is yawning. Let's wind down and get some sleep 😴", nil),
        (.weighIn, "Morning weigh-in", "Hop on the scale before breakfast, Koa will note it ⚖️", nil),
        (.workout, "Workout today", "Koa is warmed up and waiting for you 💪",
          "You usually train by now. Koa is ready when you are 💪"),
        (.meal, "Eaten yet?", "Koa's tummy is rumbling. What did you eat today? 🍽",
          "You've usually eaten by now. Log it for Koa? 🍽"),
        (.biometrics, "Morning readings", "Resting heart rate and HRV before you get up, Koa is waiting ❤️", nil),
        (.sleepLog, "How did you sleep?", "Koa slept great. How about you? Write it down 🌙",
          "You usually log your sleep by now. How was last night? 🌙"),
        (.challengeClaim, "Reward expiring soon", "Reward expiring soon", nil),
        (.streak, "Your {n}-day streak is waiting", "Your {n}-day streak just needs one small thing today. Koa is waiting 🔥", nil),
        (.koaTraining, "Koa is warmed up 🏋️", "Today's session is waiting for you.",
          "You usually train by now. Koa is warmed up 🏋️"),
      ]
    case .es: [
        (.water, "Hora del agua", "Koa acaba de beber un sorbo. ¿Me acompañas con un vaso? 💧", nil),
        (.supplements, "Suplementos", "Un recordatorio de Koa: es hora de tus suplementos 💊", nil),
        (.bedtime, "Casi hora de dormir", "Koa está bostezando. Relajémonos y a dormir 😴", nil),
        (.weighIn, "Pesaje matutino", "Súbete a la báscula antes del desayuno, Koa lo anota ⚖️", nil),
        (.workout, "Entreno hoy", "Koa ya calentó y te está esperando 💪",
          "A esta hora sueles entrenar. Koa está listo cuando tú lo estés 💪"),
        (.meal, "¿Ya comiste?", "A Koa le suena la panza. ¿Qué comiste hoy? 🍽",
          "A esta hora sueles haber comido. ¿Lo registras para Koa? 🍽"),
        (.biometrics, "Lecturas matutinas", "Frecuencia en reposo y HRV antes de levantarte, Koa espera los datos ❤️", nil),
        (.sleepLog, "¿Cómo dormiste?", "Koa durmió genial. ¿Y tú? Anótalo 🌙",
          "A esta hora sueles registrar tu sueño. ¿Qué tal anoche? 🌙"),
        (.challengeClaim, "Recompensa por vencer pronto", "Recompensa por vencer pronto", nil),
        (.streak, "Tu racha de {n} días te espera", "Tu racha de {n} días solo necesita algo pequeño hoy. Koa te espera 🔥", nil),
        (.koaTraining, "Koa ya calentó 🏋️", "Tu sesión de hoy te está esperando.",
          "A esta hora sueles entrenar. Koa ya calentó 🏋️"),
      ]
    }
    // `challengeClaim`: mỗi mục thật mang chữ riêng (tên thử thách, số xu) từ
    // bên gọi; dòng này chỉ là lưới an toàn. Mẫu RN của nó có chỗ trống
    // `{c}` / `{t}` chưa điền, nên ở đây là tiêu đề — không bao giờ lộ ngoặc.
    return Dictionary(uniqueKeysWithValues: rows.map { ($0.0, ReminderText(title: $0.1, body: $0.2, habitBody: $0.3)) })
  }
}
