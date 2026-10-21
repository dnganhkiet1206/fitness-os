import ASCNDCore
import Foundation

/// Lịch tuần từ onboarding (#527 đợt 3, mock `koa-wave3-activation.html`).
///
/// Lúc onboarding xong, phiên app (và `PlanEditor`) chưa dựng — nên lựa chọn được
/// giữ trên máy theo tài khoản, rồi áp khi `WorkoutFlow` đã đọc kế hoạch: tạo
/// mẫu buổi tập + gán ngày + đánh dấu ngày nghỉ qua đúng đường ghi của Kế hoạch
/// tuần (outbox — mất mạng vẫn bền). Chỉ áp khi tài khoản CHƯA có mẫu / lịch nào:
/// không bao giờ đè lịch người dùng đã tự làm.
@MainActor
enum StarterPlan {
  struct Pending: Codable, Equatable {
    let choice: StarterPrograms.Choice
    /// "Tập buổi đầu ngay" ở màn Sẵn sàng → mở tab Tập luyện sau khi áp.
    let startNow: Bool
  }

  static func pendingKey(_ userId: String) -> String { "ascnd_starter_plan.\(userId)" }
  /// Mẹo của buổi đầu (đợt 3) còn hiện — tới khi xong buổi đầu hoặc tắt mẹo.
  static func guideKey(_ userId: String) -> String { "ascnd_first_session_guide.\(userId)" }

  static func savePending(_ p: Pending, userId: String) {
    guard let data = try? JSONEncoder().encode(p) else { return }
    UserDefaults.standard.set(data, forKey: pendingKey(userId))
  }

  static func pending(_ userId: String) -> Pending? {
    UserDefaults.standard.data(forKey: pendingKey(userId)).flatMap { try? JSONDecoder().decode(Pending.self, from: $0) }
  }

  static func guideOn(_ userId: String) -> Bool { UserDefaults.standard.bool(forKey: guideKey(userId)) }
  static func setGuide(_ on: Bool, userId: String) { UserDefaults.standard.set(on, forKey: guideKey(userId)) }

  static func sessionName(_ s: StarterPrograms.Session) -> String {
    switch s {
    case .fullA: String(localized: "starter.session.fullA")
    case .fullB: String(localized: "starter.session.fullB")
    case .fullC: String(localized: "starter.session.fullC")
    case .upperA: String(localized: "starter.session.upperA")
    case .lowerA: String(localized: "starter.session.lowerA")
    case .upperB: String(localized: "starter.session.upperB")
    case .lowerB: String(localized: "starter.session.lowerB")
    case .push: String(localized: "starter.session.push")
    case .pull: String(localized: "starter.session.pull")
    case .legs: String(localized: "starter.session.legs")
    }
  }

  /// Áp lịch chờ nếu có. Trả về `true` khi người dùng muốn tập buổi đầu ngay.
  /// Kế hoạch chưa đọc được (mất mạng lần đầu) → giữ lịch chờ, lần mở sau thử lại.
  static func applyIfPending(userId: String, flow: WorkoutFlow) async -> Bool {
    guard let p = pending(userId) else { return false }
    guard let editor = flow.plan, let library = flow.today.library else { return false }
    let untouched = library.templates.isEmpty && library.routine.allSatisfy { $0.templateId == nil && !$0.isRest }
    guard untouched else {
      // Đã có lịch của riêng mình (máy khác, hay tự làm trước): không đè.
      UserDefaults.standard.removeObject(forKey: pendingKey(userId))
      return false
    }
    let c = p.choice
    var ids: [StarterPrograms.Session: String] = [:]
    do {
      for row in StarterPrograms.schedule(c) {
        if let id = ids[row.session] {
          try await editor.assign(day: row.day, templateId: id)
        } else {
          let id = editor.newTemplateId()
          try await editor.create(
            id: id, name: sessionName(row.session),
            exercises: StarterPrograms.exercises(row.session, place: c.place, beginner: c.beginner), scheduleOn: row.day)
          ids[row.session] = id
        }
      }
      // Ngày còn lại là ngày nghỉ đã đặt — Koa không nhắc, không tính là lỡ.
      for day in 0..<7 where !c.days.contains(day) { try await editor.assign(day: day, templateId: nil) }
    } catch {
      return false
    }
    UserDefaults.standard.removeObject(forKey: pendingKey(userId))
    setGuide(true, userId: userId)
    Telemetry.capture(.scheduleCreated, ["sessions": String(c.days.count), "place": c.place.rawValue])
    return p.startNow
  }
}
