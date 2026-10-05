public import Foundation

/// Ghi kế hoạch tập (#401): tạo / xoá template, gán template vào ngày trong tuần.
///
/// Nguồn baseline (`fac9ac2`, `use-library.ts`):
/// - tạo: `useAddWorkoutTemplate` (`:289`) — `insert {user_id, name,
///   type || 'custom', exercises}` rồi trả id hàng mới;
/// - xoá: `useDeleteWorkoutTemplate` (`:328`) — `delete` theo `id` + `user_id`;
/// - gán ngày: `useUpsertRoutineDay` (`:448`) — `upsert {user_id, day_of_week,
///   template_id, is_rest, is_deload}`, `onConflict: 'user_id,day_of_week'`.
///   Hai chỗ gọi luôn gửi đủ bốn trường (`week-plan.tsx:343`, `:363`;
///   `workout-builder.tsx:463`).
///
/// RN behavior: chỉ chạy online; builder chờ insert trả id rồi mới gán ngày
///   (hai lượt mạng, lượt hai hỏng thì template có mà ngày không có).
/// Native behavior: cả hai đi qua outbox trong MỘT giao dịch, theo thứ tự
///   (làn tuần tự: tạo luôn tới server trước gán — D-26 TW-5b); id template do
///   máy sinh nên không phải chờ server; kế hoạch hiện ngay (TW-6b).
public enum PlanEdit {
  /// Tạo template: `insert` theo `id`, bỏ trùng — phát lại là một hàng (TW-5a).
  public static let templateKind = "template"
  /// Xoá template: id hàng outbox `"<template>@del-<op>"`.
  public static let templateDeleteKind = "template-delete"
  /// Gán / đổi / xoá ngày: upsert theo `(user_id, day_of_week)`.
  public static let routineDayKind = "routine-day"
  public static let kinds: Set<String> = [templateKind, templateDeleteKind, routineDayKind]

  /// `type || 'custom'` (D-26 TW-1a).
  public static let defaultType = "custom"
  public static let days = 0...6
}

/// Ghi bền các lệnh kế hoạch, và đọc lại những lệnh chưa tới server
/// (`ASCNDStore.OutboxStore`).
public protocol PlanWriteStore: PendingWrites {
  /// Ghi các hàng outbox trong MỘT giao dịch, đúng thứ tự. Id đã có thì bỏ qua
  /// hàng ấy (idempotent).
  func enqueue(_ entries: [OutboxEntry]) async throws
}

extension TemplateSnapshot {
  /// Kế hoạch sau khi các lệnh chưa tới server được áp lên, theo thứ tự hàng
  /// đợi — làm đúng việc server sẽ làm, nên áp lại một lệnh server đã nhận
  /// không đổi gì (idempotent):
  /// - tạo: thêm template; id đã có thì giữ bản của server (`ignoreDuplicates`);
  /// - xoá: bỏ template VÀ các ngày trỏ vào nó — `routine_days.template_id`
  ///   là `ON DELETE CASCADE`, ngày ấy thành "chưa lên lịch";
  /// - gán ngày: thay hàng của ngày ấy.
  public func applying(_ entries: [OutboxEntry]) -> TemplateSnapshot {
    var routine = self.routine
    var templates = self.templates
    for e in entries {
      switch e.kind {
      case PlanEdit.templateKind:
        guard let id = e.payload["id"]?.stringValue?.lowercased(), !templates.contains(where: { $0.id == id })
        else { continue }
        templates.append(WorkoutTemplate(
          id: id, name: e.payload["name"]?.stringValue ?? "", exercisesJSON: e.payload["exercises"],
          type: e.payload["type"]?.stringValue))
      case PlanEdit.templateDeleteKind:
        guard let id = e.payload["id"]?.stringValue?.lowercased() else { continue }
        templates.removeAll { $0.id == id }
        routine.removeAll { $0.templateId == id }
      case PlanEdit.routineDayKind:
        guard let day = e.payload["day_of_week"]?.intValue, PlanEdit.days.contains(day) else { continue }
        routine.removeAll { $0.dayOfWeek == day }
        routine.append(RoutineDay(
          dayOfWeek: day, isRest: e.payload["is_rest"]?.boolValue ?? false,
          isDeload: e.payload["is_deload"]?.boolValue ?? false,
          templateId: e.payload["template_id"]?.stringValue?.lowercased()))
        routine.sort { $0.dayOfWeek < $1.dayOfWeek }
      default:
        continue
      }
    }
    return TemplateSnapshot(routine: routine, templates: templates, fetchedAt: fetchedAt)
  }

  /// Hàng của một ngày (0 = Thứ Hai), `nil` khi ngày chưa có hàng.
  public func day(_ dayOfWeek: Int) -> RoutineDay? {
    routine.first { $0.dayOfWeek == dayOfWeek }
  }
}

extension WorkoutTemplate {
  /// Thứ tự của danh sách template (`newestFirst`, `template-list.tsx:155`):
  /// mới tạo trước. Template vừa tạo trên máy chưa có giờ của server — nó là
  /// cái mới nhất. Cùng giờ thì theo id, để thứ tự không đổi giữa hai lần đọc.
  public static func newestFirst(_ a: WorkoutTemplate, _ b: WorkoutTemplate) -> Bool {
    switch (a.createdAt, b.createdAt) {
    case (nil, nil): a.id < b.id
    case (nil, _): true
    case (_, nil): false
    case let (x?, y?): x != y ? x > y : a.id < b.id
    }
  }
}

/// Ghi kế hoạch tập: chỗ duy nhất builder, danh sách template và màn Plan gọi.
///
/// Mỗi lệnh: kiểm → ghi bền xuống outbox (một giao dịch) → báo `onEnqueued`
/// (Today áp lên kế hoạch ngay, vòng sync gửi). Trả về khi đã BỀN trên máy.
@MainActor
public final class PlanEditor {
  public enum Refusal: Error, Sendable, Hashable {
    /// Tên rỗng sau khi cắt khoảng trắng. Builder đưa tên gợi ý khi người
    /// dùng để trống (`shownName.trim() || suggestedName`) — tới đây phải có tên.
    case emptyName
    /// Chưa có bài nào: nút Lưu của builder tắt (`workout-builder.tsx:818`).
    case noExercises
    /// Ngày ngoài 0…6 (`CHECK (day_of_week BETWEEN 0 AND 6)`).
    case invalidDay
    /// Không có template này trong kế hoạch của mình (đã xoá, hoặc không phải
    /// của mình). Gán vào nó thì server từ chối (FK / RLS) và lệnh vào `dead`.
    case unknownTemplate
    /// `id` đã là của một template KHÁC nội dung (#430). Server bỏ trùng theo
    /// `id` (`ignoreDuplicates`) nên hàng mới không bao giờ tới nơi, còn người
    /// gọi tưởng đã có template mới — và gán ngày sẽ trỏ vào template cũ. Bản
    /// sao phải mang id mới; gửi lại ĐÚNG nội dung cũ thì vẫn idempotent.
    case idInUse
    case storage(LocalWriteError)
  }

  public let userId: String
  private let store: any PlanWriteStore
  private let current: @MainActor () -> TemplateSnapshot?
  private let clock: any WallClock
  private let makeId: @Sendable () -> String
  private let onEnqueued: @MainActor ([OutboxEntry]) async -> Void

  /// - Parameters:
  ///   - current: kế hoạch đang hiện (server ⊕ lệnh chưa gửi) — `TodayController.library`.
  ///   - onEnqueued: các hàng vừa bền, theo thứ tự.
  public init(
    userId: String, store: any PlanWriteStore, current: @escaping @MainActor () -> TemplateSnapshot?,
    clock: any WallClock = SystemWallClock(),
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor ([OutboxEntry]) async -> Void = { _ in }
  ) {
    self.userId = userId
    self.store = store
    self.current = current
    self.clock = clock
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  /// Id cho một template sắp tạo. Builder giữ nó từ lúc mở tới lúc lưu: bấm
  /// Lưu lại (mạng chậm, chạm hai lần) với cùng id là MỘT template (TW-5a).
  public func newTemplateId() -> String { makeId() }

  /// Lưu template mới; mở từ Plan thì gán luôn vào `day` — cùng một giao dịch,
  /// tạo đứng trước gán trong hàng đợi. Gán từ builder đặt lại deload như
  /// baseline (`is_rest: false, is_deload: false`).
  @discardableResult
  public func create(
    id: String, name: String, type: String = PlanEdit.defaultType, exercises: [TemplateExercise],
    scheduleOn day: Int? = nil
  ) async throws(Refusal) -> WorkoutTemplate {
    let id = id.lowercased()
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw .emptyName }
    guard !exercises.isEmpty else { throw .noExercises }
    if let day, !PlanEdit.days.contains(day) { throw .invalidDay }
    let kind = type.trimmingCharacters(in: .whitespacesAndNewlines)
    let template = WorkoutTemplate(
      id: id, name: trimmed, exercises: exercises, type: kind.isEmpty ? PlanEdit.defaultType : kind)
    if let existing = current()?.templates.first(where: { $0.id == id }),
      // So qua đúng đường đọc lại (`init(json:)`): template trên server / trong
      // lớp phủ được dựng từ JSON, gửi lại cùng nội dung phải ra bằng nhau.
      existing.name != template.name || existing.exercises != exercises.map({ TemplateExercise(json: $0.json) })
        || (existing.type ?? PlanEdit.defaultType) != template.type
    {
      throw .idInUse
    }
    let now = clock.nowMillis()
    var entries = [OutboxEntry(
      id: id, userId: userId, kind: PlanEdit.templateKind, payload: .object([
        "id": .string(id),
        "user_id": .string(userId),
        "name": .string(trimmed),
        "type": .string(template.type ?? PlanEdit.defaultType),
        "exercises": .array(exercises.map(\.json)),
      ]), createdAt: now)]
    if let day {
      // Id cố định theo template: lưu lại cùng template không gán thêm lần nữa.
      entries.append(routineDay(
        id: "\(id)@day\(day)", day: day, templateId: id, isRest: false, isDeload: false, at: now))
    }
    try await commit(entries)
    return current()?.templates.first { $0.id == id } ?? template
  }

  /// Xoá template (màn hỏi lại TRƯỚC, `templates.tsx:64`). Các ngày đang dùng
  /// nó thành "chưa lên lịch" (cascade). Buổi đang tập dở bằng nó vẫn tập
  /// tiếp — `WorkoutFlow` tách buổi ấy khỏi template (xem `templateDeleted`).
  public func delete(templateId: String) async throws(Refusal) {
    let id = templateId.lowercased()
    guard current()?.templates.contains(where: { $0.id == id }) == true else { throw .unknownTemplate }
    try await commit([OutboxEntry(
      id: "\(id)@del-\(makeId())", userId: userId, kind: PlanEdit.templateDeleteKind,
      payload: .object(["id": .string(id)]), createdAt: clock.nowMillis())])
  }

  /// Gán template cho ngày; `nil` = ngày nghỉ (`saveDay`, `week-plan.tsx:338`).
  /// Deload của ngày giữ nguyên.
  public func assign(day: Int, templateId: String?) async throws(Refusal) {
    guard PlanEdit.days.contains(day) else { throw .invalidDay }
    let id = templateId?.lowercased()
    let snapshot = current()
    if let id, snapshot?.templates.contains(where: { $0.id == id }) != true { throw .unknownTemplate }
    try await commit([routineDay(
      id: "day\(day)@\(makeId())", day: day, templateId: id, isRest: id == nil,
      isDeload: snapshot?.day(day)?.isDeload ?? false, at: clock.nowMillis())])
  }

  /// Bật / tắt deload (`toggleDeload`, `week-plan.tsx:361`): template và nghỉ
  /// giữ nguyên; ngày chưa có hàng thì là ngày nghỉ, như baseline.
  public func setDeload(day: Int, _ on: Bool) async throws(Refusal) {
    guard PlanEdit.days.contains(day) else { throw .invalidDay }
    let row = current()?.day(day)
    try await commit([routineDay(
      id: "day\(day)@\(makeId())", day: day, templateId: row?.templateId, isRest: row?.isRest ?? true,
      isDeload: on, at: clock.nowMillis())])
  }

  private func routineDay(
    id: String, day: Int, templateId: String?, isRest: Bool, isDeload: Bool, at: EpochMillis
  ) -> OutboxEntry {
    OutboxEntry(
      id: id, userId: userId, kind: PlanEdit.routineDayKind, payload: .object([
        "user_id": .string(userId),
        "day_of_week": .number(Double(day)),
        "template_id": templateId.map(JSONValue.string) ?? .null,
        "is_rest": .bool(isRest),
        "is_deload": .bool(isDeload),
      ]), createdAt: at)
  }

  private func commit(_ entries: [OutboxEntry]) async throws(Refusal) {
    do {
      try await store.enqueue(entries)
    } catch {
      throw .storage(LocalWriteError("\(error)"))
    }
    await onEnqueued(entries)
  }
}
