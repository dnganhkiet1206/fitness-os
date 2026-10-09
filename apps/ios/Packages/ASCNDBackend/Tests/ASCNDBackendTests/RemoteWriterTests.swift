@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Supabase
import Testing

/// Bảng dịch lỗi → `WriteFailure`. Gửi lại hay thôi là việc của `RetryPolicy`;
/// ở đây chỉ kiểm lỗi được gọi ĐÚNG TÊN.
struct RemoteWriterClassifyTests {
  @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cancelled])
  func unreachableIsOffline(code: URLError.Code) {
    #expect(SupabaseRemoteWriter.classify(URLError(code)) == .offline)
  }

  /// Tới được server nhưng phản hồi hỏng (vd. 5xx của gateway, URL sai) — lỗi
  /// tạm, KHÔNG phải offline: tính vào ngân sách.
  @Test func reachableButBrokenIsTransientServer() {
    #expect(SupabaseRemoteWriter.classify(URLError(.badServerResponse)) == .server(code: nil))
  }

  @Test func postgrestCodeIsCarried() {
    let e = PostgrestError(code: "23514", message: "violates check constraint")
    #expect(SupabaseRemoteWriter.classify(e) == .server(code: "23514"))
    #expect(RetryPolicy.isPermanent(SupabaseRemoteWriter.classify(e)))
  }

  /// Lệch baseline có chủ đích: JWT hết hạn là TẠM (token tự làm mới), không
  /// phải vĩnh viễn như mọi `PGRST…` khác — không thì buổi tập vào `dead`.
  @Test func expiredJwtIsTransient() {
    let e = PostgrestError(code: "PGRST301", message: "JWT expired")
    #expect(SupabaseRemoteWriter.classify(e) == .server(code: nil))
    #expect(!RetryPolicy.isPermanent(SupabaseRemoteWriter.classify(e)))
    // Các PGRST khác (lệch schema) vẫn vĩnh viễn như baseline.
    let drift = PostgrestError(code: "PGRST204", message: "column not found")
    #expect(RetryPolicy.isPermanent(SupabaseRemoteWriter.classify(drift)))
  }

  @Test func postgrestWithoutCodeIsTransient() {
    #expect(SupabaseRemoteWriter.classify(PostgrestError(message: "?")) == .server(code: nil))
  }

  @Test func cancellationIsOffline() {
    #expect(SupabaseRemoteWriter.classify(CancellationError()) == .offline)
  }

  @Test func nsURLErrorDomainIsUnderstood() {
    let e = NSError(domain: NSURLErrorDomain, code: URLError.Code.notConnectedToInternet.rawValue)
    #expect(SupabaseRemoteWriter.classify(e) == .offline)
  }

  @Test func unknownErrorIsTransient() {
    struct Weird: Error {}
    #expect(SupabaseRemoteWriter.classify(Weird()) == .server(code: nil))
  }

  /// Upsert theo `id` chỉ idempotent khi id hàng = id bản ghi.
  @Test func payloadMustBeTheRowWithTheSameId() {
    func e(_ payload: JSONValue) -> OutboxEntry {
      OutboxEntry(id: "s1", userId: "u", kind: "workout", payload: payload, createdAt: EpochMillis(0))
    }
    #expect(SupabaseRemoteWriter.isRow(e(.object(["id": .string("s1")]))))
    #expect(!SupabaseRemoteWriter.isRow(e(.object(["id": .string("other")]))))
    #expect(!SupabaseRemoteWriter.isRow(e(.object([:]))))
    #expect(!SupabaseRemoteWriter.isRow(e(.null)))
  }

  /// Bản ghi lại (#296): id hàng outbox `"<buổi>@<n>"`, hàng là `<buổi>`; ghi đè.
  @Test func revisionRowsOverwriteTheSession() {
    func e(_ id: String, _ row: String) -> OutboxEntry {
      OutboxEntry(id: id, userId: "u", kind: "workout-revision", payload: .object(["id": .string(row)]), createdAt: EpochMillis(0))
    }
    #expect(SupabaseRemoteWriter.isRow(e("s1@3", "s1")))
    #expect(!SupabaseRemoteWriter.isRow(e("s1@3", "s2")))
    #expect(!SupabaseRemoteWriter.isRow(e("s1", "s1")))
    #expect(SupabaseRemoteWriter.overwrites("workout-revision"))
    #expect(!SupabaseRemoteWriter.overwrites("workout"))
    #expect(SupabaseRemoteWriter.tables["workout-revision"] == "workout_sessions")
  }

  /// Gỡ set cuối cùng (#398): `"<buổi>@r<n>"` xoá hàng `<buổi>`; không ghi đè.
  @Test func deleteTargetsTheSessionRow() {
    func e(_ id: String, _ row: String) -> OutboxEntry {
      OutboxEntry(id: id, userId: "u", kind: "workout-delete", payload: .object(["id": .string(row)]), createdAt: EpochMillis(0))
    }
    #expect(SupabaseRemoteWriter.isRow(e("s1@r2", "s1")))
    #expect(!SupabaseRemoteWriter.isRow(e("s1@r2", "s2")))
    #expect(!SupabaseRemoteWriter.isRow(e("s1", "s1")))
    #expect(!SupabaseRemoteWriter.overwrites("workout-delete"))
    #expect(SupabaseRemoteWriter.revises("workout-delete"))
    #expect(SupabaseRemoteWriter.tables["workout-delete"] == "workout_sessions")
  }

  /// #401: tạo template theo id (bỏ trùng), xoá theo `"<template>@del-…"`,
  /// gán ngày không có id — hàng là (người, ngày), người phải là chủ bản ghi.
  @Test func planEditsTargetTheirTables() {
    func e(_ id: String, _ kind: String, _ payload: JSONValue) -> OutboxEntry {
      OutboxEntry(id: id, userId: "U1", kind: kind, payload: payload, createdAt: EpochMillis(0))
    }
    #expect(SupabaseRemoteWriter.tables[PlanEdit.templateKind] == "workout_templates")
    #expect(SupabaseRemoteWriter.tables[PlanEdit.templateDeleteKind] == "workout_templates")
    #expect(SupabaseRemoteWriter.tables[PlanEdit.routineDayKind] == "routine_days")
    #expect(SupabaseRemoteWriter.isRow(e("t1", PlanEdit.templateKind, .object(["id": .string("t1"), "user_id": .string("u1")]))))
    #expect(!SupabaseRemoteWriter.overwrites(PlanEdit.templateKind))
    #expect(SupabaseRemoteWriter.isRow(e("t1@del-x", PlanEdit.templateDeleteKind, .object(["id": .string("t1")]))))
    #expect(!SupabaseRemoteWriter.isRow(e("t1", PlanEdit.templateDeleteKind, .object(["id": .string("t1")]))))
    #expect(SupabaseRemoteWriter.deletes(PlanEdit.templateDeleteKind))
    let day = { (d: Double, user: String) in
      e("day0@x", PlanEdit.routineDayKind, .object(["day_of_week": .number(d), "user_id": .string(user)]))
    }
    #expect(SupabaseRemoteWriter.isRow(day(0, "u1")))
    #expect(!SupabaseRemoteWriter.isRow(day(7, "u1")))
    #expect(!SupabaseRemoteWriter.isRow(day(1.5, "u1")))
    #expect(!SupabaseRemoteWriter.isRow(day(0, "u2")), "kế hoạch của người khác")
  }

  /// #421: thêm bài theo id (bỏ trùng), chỉ cho chính chủ; xoá theo
  /// `"<bài>@del-…"` + `user_id`.
  @Test func exerciseEditsTargetExercises() {
    func e(_ id: String, _ kind: String, _ payload: JSONValue) -> OutboxEntry {
      OutboxEntry(id: id, userId: "u1", kind: kind, payload: payload, createdAt: EpochMillis(0))
    }
    #expect(SupabaseRemoteWriter.tables[ExerciseEdit.createKind] == "exercises")
    #expect(SupabaseRemoteWriter.tables[ExerciseEdit.deleteKind] == "exercises")
    #expect(SupabaseRemoteWriter.isRow(e("x1", ExerciseEdit.createKind, .object(["id": .string("x1"), "user_id": .string("U1")]))))
    #expect(!SupabaseRemoteWriter.isRow(e("x1", ExerciseEdit.createKind, .object(["id": .string("x1"), "user_id": .string("u2")]))))
    #expect(!SupabaseRemoteWriter.isRow(e("x1", ExerciseEdit.createKind, .object(["id": .string("x1")]))))
    #expect(!SupabaseRemoteWriter.overwrites(ExerciseEdit.createKind))
    #expect(SupabaseRemoteWriter.isRow(e("x1@del-a", ExerciseEdit.deleteKind, .object(["id": .string("x1")]))))
    #expect(!SupabaseRemoteWriter.isRow(e("x1", ExerciseEdit.deleteKind, .object(["id": .string("x1")]))))
    #expect(SupabaseRemoteWriter.deletes(ExerciseEdit.deleteKind))
    // Template cũng phải là của chủ bản ghi.
    #expect(!SupabaseRemoteWriter.isRow(e("t1", PlanEdit.templateKind, .object(["id": .string("t1"), "user_id": .string("u2")]))))
  }

  @Test func workoutGoesToWorkoutSessions() {
    #expect(SupabaseRemoteWriter.tables["workout"] == "workout_sessions")
    #expect(SupabaseRemoteWriter.tables["telepathy"] == nil)
  }
}

struct TemplateSourceMappingTests {
  /// Hàng thật như PostgREST trả về → domain, kể cả cột null.
  @Test func rowsMapToDomain() throws {
    let days = try JSONDecoder().decode([SupabaseTemplateSource.RoutineRow].self, from: Data("""
      [{"day_of_week":0,"is_rest":false,"is_deload":null,"template_id":"AAAAAAAA-0000-0000-0000-000000000001"},
       {"day_of_week":6,"is_rest":null,"is_deload":true,"template_id":null}]
      """.utf8))
    let tpls = try JSONDecoder().decode([SupabaseTemplateSource.TemplateRow].self, from: Data("""
      [{"id":"aaaaaaaa-0000-0000-0000-000000000001","name":"Push","exercises":[{"exerciseName":"Bench","sets":3,"reps":8,"weight":60}]},
       {"id":"b","name":null,"exercises":null,"type":"strength","created_at":"2026-10-05T07:00:00+00:00"}]
      """.utf8))
    let s = SupabaseTemplateSource.snapshot(days: days, templates: tpls, at: EpochMillis(0))
    #expect(s.templates[0].type == nil && s.templates[0].createdAt == nil, "cột thiếu → nil")
    #expect(s.routine[0].templateId == "aaaaaaaa-0000-0000-0000-000000000001", "uuid so khớp không phân biệt hoa thường")
    #expect(s.routine[1].isRest == false && s.routine[1].isDeload)
    #expect(s.templates[0].exercises.first?.sets == 3)
    #expect(s.templates[1].exercises.isEmpty && s.templates[1].name == "")
    #expect(s.templates[1].type == "strength" && s.templates[1].createdAt == EpochMillis(1_791_183_600_000))
    let monday = LocalDate("2026-10-05")!
    #expect(s.plan(for: monday, today: monday).status == .todo)
  }
}

struct TrainingHistoryMappingTests {
  @Test func postgrestTimestampsParse() throws {
    let rows = try JSONDecoder().decode([SupabaseTrainingHistory.Row].self, from: Data("""
      [{"date_time":"2026-10-05T07:00:00+00:00"},{"date_time":"2026-10-04T23:30:00.123456+00:00"},{"date_time":"bad"}]
      """.utf8))
    #expect(SupabaseTrainingHistory.times(rows) == [EpochMillis(1_791_183_600_000), EpochMillis(1_791_156_600_123)])
  }
}

struct ExerciseSourceMappingTests {
  @Test func rowsMapToDomain() throws {
    let rows = try JSONDecoder().decode([SupabaseExerciseSource.Row].self, from: Data("""
      [{"id":"AAAA","user_id":null,"name":"Bench Press","muscle_group":"chest","equipment":"barbell","exercise_kind":null},
       {"id":"b","user_id":"U1","name":"Curl","muscle_group":null,"equipment":null,"exercise_kind":"isolation"},
       {"id":"c","user_id":null,"name":"  ","muscle_group":"back","equipment":null,"exercise_kind":null}]
      """.utf8))
    let list = SupabaseExerciseSource.map(rows)
    #expect(list.map(\.id) == ["aaaa", "b"])
    #expect(list[0].isBuiltIn && list[1].userId == "u1" && list[1].kind == "isolation")
  }
}

struct ExerciseGuideSourceMappingTests {
  @Test func mediaRowsMapToDomain() throws {
    let rows = try JSONDecoder().decode([SupabaseExerciseGuideSource.MediaRowDTO].self, from: Data("""
      [{"kind":"video","uri":"v.mp4","position":1,"duration_s":"45.5","poster_uri":null,"alt":null,
        "exercise_media_content":[{"locale":"vi","title":"Video","description":null}]},
       {"kind":"image","uri":"a.png","position":null,"duration_s":12,"poster_uri":null,"alt":"A","exercise_media_content":null}]
      """.utf8))
    let media = rows.map(\.domain)
    #expect(media[0].durationS == 45.5 && media[0].captions?.first?.title == "Video")
    #expect(media[1].position == nil && media[1].durationS == 12)
    // `position: null` là 0 — tấm ảnh đứng trước video ở vị trí 1 và quyết
    // kiểu của cả bộ (luật "một bộ là một kiểu" của RN).
    #expect(MediaState.resolve(media, legacy: nil, lang: .vi).shape == .imageSingle)
  }

  /// Phần tử null trong mảng chữ (Postgres cho phép) không làm hỏng lượt
  /// đọc: bỏ đi như `clean` của RN, nội dung còn lại vẫn hiện.
  @Test func nullElementsInTextArraysAreSkipped() throws {
    let rows = try JSONDecoder().decode([SupabaseExerciseGuideSource.ContentRow].self, from: Data("""
      [{"locale":"vi","instructions":["Đứng thẳng",null,"  "],"form_cues":[null],"common_mistakes":null}]
      """.utf8))
    let content = try #require(GuideContent.pick(rows.map(\.domain), .vi))
    #expect(content.instructions == ["Đứng thẳng"] && content.formCues.isEmpty && content.commonMistakes.isEmpty)
  }
}

/// Một lần uống (#527 Phase 3): `applyOfflineWrite` `case 'water'` — upsert vào
/// `water_logs` theo `id`, bỏ trùng; hàng mang `user_id` của chủ bản ghi.
struct RemoteWriterWaterTests {
  private func water(user: String = "u1", rowUser: String = "u1") -> OutboxEntry {
    Water.entry(
      id: "W1", userId: user, amountMl: 250, date: LocalDate("2026-10-08")!, at: EpochMillis(0), createdAt: EpochMillis(0))
      .withPayloadUser(rowUser)
  }

  @Test func waterGoesToWaterLogsAndIsNeverAnOverwrite() {
    #expect(SupabaseRemoteWriter.tables[Water.addKind] == "water_logs")
    #expect(!SupabaseRemoteWriter.overwrites(Water.addKind))
    #expect(!SupabaseRemoteWriter.deletes(Water.addKind))
  }

  @Test func waterRowMustBeTheOwnersWithTheEntryId() {
    #expect(SupabaseRemoteWriter.isRow(water()))
    // Hàng của người khác: không bao giờ gửi (RLS cũng chặn).
    #expect(!SupabaseRemoteWriter.isRow(water(rowUser: "u2")))
  }
}

extension OutboxEntry {
  /// Bản sao với `user_id` của hàng đổi — dựng bản ghi hỏng cho test.
  fileprivate func withPayloadUser(_ user: String) -> OutboxEntry {
    guard case .object(var o) = payload else { return self }
    o["user_id"] = .string(user)
    return OutboxEntry(id: id, userId: userId, kind: kind, payload: .object(o), createdAt: createdAt)
  }
}

/// Một lần cân (#527 Phase 4): `applyOfflineWrite` `case 'weight'` — upsert vào
/// `weight_logs` theo `(user_id, date)`, ghi đè.
struct RemoteWriterWeightTests {
  @Test func weightGoesToWeightLogs() {
    #expect(SupabaseRemoteWriter.tables[WeightLog.kind] == "weight_logs")
    #expect(!SupabaseRemoteWriter.deletes(WeightLog.kind))
  }

  @Test func weightRowIsCheckedByOwnerDateAndRange() {
    let day = LocalDate("2026-10-09")!
    #expect(SupabaseRemoteWriter.isRow(WeightLog.entry(id: "a", userId: "u1", kg: 72, date: day, createdAt: EpochMillis(0))))
    let other = OutboxEntry(id: "b", userId: "u1", kind: WeightLog.kind,
                            payload: WeightLog.row(userId: "u2", kg: 72, date: day), createdAt: EpochMillis(0))
    #expect(!SupabaseRemoteWriter.isRow(other))
  }
}

struct RemoteWriterMealTests {
  static func meal(userId: String = "u1", payloadUser: String = "u1", meal: String = "lunch") -> OutboxEntry {
    let e = MealLog.entry(
      id: "m1", itemIds: ["i1"], userId: payloadUser, mealType: meal, dateTime: "2026-10-09T05:00:00.000Z",
      items: [MealLog.Item(id: "x", foodItemId: nil, name: "Phở", kcal: 450, protein: 20, carbs: 60, fat: 12)],
      createdAt: EpochMillis(0))
    return OutboxEntry(id: e.id, userId: userId, kind: e.kind, payload: e.payload, createdAt: e.createdAt)
  }

  @Test func mealGoesToMealEntries() {
    #expect(SupabaseRemoteWriter.tables[MealLog.kind] == "meal_entries")
    #expect(!SupabaseRemoteWriter.deletes(MealLog.kind))
    #expect(!SupabaseRemoteWriter.overwrites(MealLog.kind))
  }

  /// Bản ghi của chính chủ, đúng loại bữa, có món — còn lại không bao giờ gửi.
  @Test func mealRowIsCheckedByOwnerTypeAndItems() {
    #expect(SupabaseRemoteWriter.isRow(Self.meal()))
    #expect(!SupabaseRemoteWriter.isRow(Self.meal(payloadUser: "u2")))
    #expect(!SupabaseRemoteWriter.isRow(Self.meal(meal: "brunch")))
  }
}
