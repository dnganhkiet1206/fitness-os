public import Foundation
public import Observation

/// Chữ của một thông báo.
public struct ReminderText: Sendable, Hashable {
  public let title: String
  public let body: String
  public init(title: String, body: String) {
    self.title = title
    self.body = body
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
  /// Khoá theo tài khoản (`USER_KEYS`).
  public static let userKeys = [planKey, prefsKey, smartTimeKey]

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

  public func setWaterInterval(_ everyHours: Double) async {
    guard everyHours.isFinite, everyHours > 0 else { return }
    var next = prefs
    next.water.everyHours = everyHours
    await apply(next)
  }

  /// Lưu + đặt lại; xin quyền lần đầu có cái bật.
  private func apply(_ next: ReminderPrefs) async {
    write(next)
    if next.anyEnabled && !permission { permission = await scheduler.requestPermission() }
    guard permission else { return }
    await commit(ReminderPlan.plan(prefs, context, now: clock.now(), calendar: calendar))
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
    let plan = ReminderPlan.plan(prefs, ctx, now: clock.now(), calendar: calendar)
    if store.string(forKey: Self.planKey) == ReminderPlan.signature(plan) { return }
    await commit(plan)
  }

  /// Đặt kế hoạch, và CHỈ SAU ĐÓ ghi rằng nó đã được đặt.
  private func commit(_ plan: [PlannedReminder]) async {
    let items = plan.map { p in
      let shared = copy[p.key] ?? ReminderText(title: "", body: "")
      let text = p.title != nil || p.body != nil
        ? ReminderText(title: p.title ?? shared.title, body: p.body ?? shared.body) : shared
      return ScheduledReminder(key: p.key, at: p.at, text: text)
    }
    guard let outcome = await serialised({ [scheduler] in await scheduler.replaceAll(items) }) else { return }
    // Đặt hụt không phải kế hoạch: để chữ ký cũ, lần sau thử lại.
    guard outcome.supported, outcome.scheduled == outcome.requested else { return }
    store.set(ReminderPlan.signature(plan), forKey: Self.planKey)
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

  /// Áp giờ suy từ hồ sơ MỘT LẦN cho mỗi tài khoản. `bedtime` / `waketime` chỉ
  /// truyền khi người dùng đã tự lưu (`sleep_target_*_set`). Trả về `true` nếu
  /// có giờ được dời (và lịch đã đặt lại).
  @discardableResult
  public func applySmartTiming(bedtime: String?, waketime: String?) async -> Bool {
    guard store.string(forKey: Self.smartTimeKey) == nil else { return false }
    store.set("1", forKey: Self.smartTimeKey)
    guard bedtime != nil || waketime != nil,
      let next = ReminderTiming.smartDefaults(prefs, bedtime: bedtime, waketime: waketime)
    else { return false }
    write(next)
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
  public static func copy(_ lang: AppPreferences.Lang) -> ReminderCopy {
    let rows: [(ReminderKey, String, String)] = switch lang {
    case .vi: [
        (.water, "Uống nước", "Đến giờ uống một cốc nước rồi 💧"),
        (.supplements, "Thực phẩm bổ sung", "Nhớ uống thực phẩm bổ sung 💊"),
        (.bedtime, "Chuẩn bị ngủ", "Sắp đến giờ ngủ — thư giãn thôi 😴"),
        (.weighIn, "Cân buổi sáng", "Ghi cân nặng trước bữa sáng ⚖️"),
        (.workout, "Tập hôm nay", "Lịch của bạn có buổi tập hôm nay 💪"),
        (.meal, "Ghi bữa ăn", "Hôm nay chưa ghi bữa nào — bạn đã ăn gì? 🍽"),
        (.biometrics, "Số đo buổi sáng", "Nhịp tim nghỉ và HRV, trước khi rời giường ❤️"),
        (.sleepLog, "Ghi đêm qua", "Đêm qua ngủ thế nào? Ghi lại nhé 🌙"),
        (.challengeClaim, "Thưởng sắp hết hạn", "Thưởng sắp hết hạn"),
      ]
    case .en: [
        (.water, "Drink water", "Time for a glass of water 💧"),
        (.supplements, "Supplements", "Take your supplements 💊"),
        (.bedtime, "Wind down", "Bedtime soon — start winding down 😴"),
        (.weighIn, "Morning weigh-in", "Log your weight before breakfast ⚖️"),
        (.workout, "Train today", "Your plan has a session scheduled 💪"),
        (.meal, "Log a meal", "Nothing logged today yet — what did you eat? 🍽"),
        (.biometrics, "Morning readings", "Resting heart rate and HRV, before you get up ❤️"),
        (.sleepLog, "Log last night", "How did you sleep? Write it down 🌙"),
        (.challengeClaim, "Reward expiring soon", "Reward expiring soon"),
      ]
    case .es: [
        (.water, "Bebe agua", "Hora de un vaso de agua 💧"),
        (.supplements, "Suplementos", "Toma tus suplementos 💊"),
        (.bedtime, "Relájate", "Pronto es hora de acostarse — empieza a relajarte 😴"),
        (.weighIn, "Pesaje matutino", "Registra tu peso antes del desayuno ⚖️"),
        (.workout, "Entrena hoy", "Tu plan tiene una sesión programada 💪"),
        (.meal, "Registra una comida", "Aún no registraste nada hoy — ¿qué comiste? 🍽"),
        (.biometrics, "Lecturas matutinas", "Frecuencia cardíaca en reposo y HRV, antes de levantarte ❤️"),
        (.sleepLog, "Registra anoche", "¿Cómo dormiste? Anótalo 🌙"),
        (.challengeClaim, "Recompensa por vencer pronto", "Recompensa por vencer pronto"),
      ]
    }
    // `challengeClaim`: mỗi mục thật mang chữ riêng (tên thử thách, số xu) từ
    // bên gọi; dòng này chỉ là lưới an toàn. Mẫu RN của nó có chỗ trống
    // `{c}` / `{t}` chưa điền, nên ở đây là tiêu đề — không bao giờ lộ ngoặc.
    return Dictionary(uniqueKeysWithValues: rows.map { ($0.0, ReminderText(title: $0.1, body: $0.2)) })
  }
}
