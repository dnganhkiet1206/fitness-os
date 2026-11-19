@testable import ASCNDCore
import Foundation
import Testing

/// Cửa sổ lịch sử Apple Health (iOS 27) và cờ "lịch sử giới hạn" của engine.
///
/// Không có golden vector cho phần này: RN không có khái niệm cửa sổ iOS 27,
/// và parity RN đã bỏ (17/11) — hành vi mới chỉ khóa bằng unit test native.
/// Golden hiện có (DailyLog, Health) phải vẫn xanh nguyên: đầu vào mới mặc
/// định "không biết cửa sổ", điểm không đổi.
struct HealthHistoryWindowTests {
  static let utc = TimeZone(identifier: "UTC")!
  static let today = LocalDate("2026-11-17")!

  // MARK: - Số học cửa sổ

  @Test func unknownWindowHasNoReadableDays() {
    #expect(HealthHistoryWindow.unknown.readableDays(through: Self.today) == nil)
    #expect(HealthHistoryWindow.unknown.limitsBaseline(through: Self.today) == false)
    #expect(HealthHistoryWindow.unknown.note(through: Self.today) == nil)
  }

  @Test func readableDaysCountsBothEnds() {
    let window = HealthHistoryWindow.limited(earliest: LocalDate("2026-11-17")!)
    #expect(window.readableDays(through: Self.today) == 1)
  }

  @Test func readableDaysForZeroThreeSevenAndThirty() {
    // 0 ngày: ngày sớm nhất SAU ngày chấm (không xảy ra thực tế) thì 0, không âm.
    #expect(
      HealthHistoryWindow.limited(earliest: LocalDate("2026-11-18")!).readableDays(through: Self.today) == 0)
    #expect(
      HealthHistoryWindow.limited(earliest: LocalDate("2026-11-15")!).readableDays(through: Self.today) == 3)
    #expect(
      HealthHistoryWindow.limited(earliest: LocalDate("2026-11-11")!).readableDays(through: Self.today) == 7)
    #expect(
      HealthHistoryWindow.limited(earliest: LocalDate("2026-10-19")!).readableDays(through: Self.today) == 30)
  }

  @Test func baselineLimitAndNoteKinds() {
    let short = HealthHistoryWindow.limited(earliest: LocalDate("2026-11-15")!)
    #expect(short.limitsBaseline(through: Self.today) == true)
    #expect(short.note(through: Self.today) == .short)
    let enough = HealthHistoryWindow.limited(earliest: LocalDate("2026-11-11")!)
    #expect(enough.limitsBaseline(through: Self.today) == false)
    #expect(enough.note(through: Self.today) == .limited)
    let thirty = HealthHistoryWindow.limited(earliest: LocalDate("2026-10-19")!)
    #expect(thirty.note(through: Self.today) == .limited)
  }

  @Test func storedMillisRoundTrips() {
    #expect(HealthHistoryWindow.fromStored(millis: 0, in: Self.utc) == .unknown)
    #expect(HealthHistoryWindow.fromStored(millis: -5, in: Self.utc) == .unknown)
    let ms = EpochMillis(iso8601: "2026-11-15T08:00:00.000Z")!
    #expect(
      HealthHistoryWindow.fromStored(millis: ms.millis, in: Self.utc)
        == .limited(earliest: LocalDate("2026-11-15")!))
  }

  // MARK: - Cờ của engine

  static func input(
    hrvHistory: [Double], rhrHistory: [Double], readableDays: Int?
  ) -> ReadinessInput {
    ReadinessInput(
      hrvToday: 54, rhrToday: 55, sleepMinLastNight: 480, sleepTargetMin: 480, sleepDebt7dMin: 0,
      trainingLoad7d: 700, trainingLoad28d: 2800, trainingDays28d: 28, sorenessToday: nil,
      illness: false, painFlagMax: nil, hrvHistory28d: hrvHistory, rhrHistory28d: rhrHistory,
      readableHistoryDays: readableDays)
  }

  static let fullHrv: [Double] = [52, 55, 50, 58, 54, 53, 56, 51, 57, 55]
  static let fullRhr: [Double] = [55, 56, 54, 57, 55, 56, 54, 55, 56, 55]
  static let shortHrv: [Double] = [52, 55, 50]
  static let shortRhr: [Double] = [55, 56, 54]

  /// Không biết cửa sổ thì không cờ — hành vi như trước.
  @Test func unknownWindowNeverFlags() throws {
    let r = try #require(ReadinessEngine.compute(Self.input(
      hrvHistory: Self.shortHrv, rhrHistory: Self.shortRhr, readableDays: nil)))
    #expect(r.limitedHistory == false)
  }

  /// Cửa sổ ngắn + nền thiếu ngày = cờ bật (0 và 3 ngày).
  @Test func shortWindowWithShortBaselineFlags() throws {
    for days in [0, 3] {
      let r = try #require(ReadinessEngine.compute(Self.input(
        hrvHistory: Self.shortHrv, rhrHistory: Self.shortRhr, readableDays: days)))
      #expect(r.limitedHistory == true)
    }
  }

  /// Cửa sổ đủ 7 / 30 ngày thì không cờ, dù nền thiếu (thiếu vì lý do khác).
  @Test func sufficientWindowNeverFlags() throws {
    for days in [7, 30] {
      let r = try #require(ReadinessEngine.compute(Self.input(
        hrvHistory: Self.shortHrv, rhrHistory: Self.shortRhr, readableDays: days)))
      #expect(r.limitedHistory == false)
    }
  }

  /// Cửa sổ ngắn nhưng nền đã đủ (lưu từ lần cấp quyền trước) thì không cờ:
  /// cờ nghĩa là nền thiếu VÌ cửa sổ, không phải cửa sổ ngắn là cờ.
  @Test func shortWindowWithFullBaselineDoesNotFlag() throws {
    let r = try #require(ReadinessEngine.compute(Self.input(
      hrvHistory: Self.fullHrv, rhrHistory: Self.fullRhr, readableDays: 3)))
    #expect(r.limitedHistory == false)
    #expect(r.confidence == .high)
  }

  /// Cờ không đổi điểm: cùng đầu vào, chỉ khác cửa sổ → điểm và trạng thái
  /// như nhau; chỉ cờ và (khi cần) độ tin cậy đổi.
  @Test func windowNeverChangesTheScore() throws {
    let base = try #require(ReadinessEngine.compute(Self.input(
      hrvHistory: Self.shortHrv, rhrHistory: Self.shortRhr, readableDays: nil)))
    let flagged = try #require(ReadinessEngine.compute(Self.input(
      hrvHistory: Self.shortHrv, rhrHistory: Self.shortRhr, readableDays: 3)))
    #expect(flagged.score == base.score)
    #expect(flagged.status == base.status)
    #expect(flagged.explainToken == base.explainToken)
    #expect(flagged.limitedHistory == true)
  }

  /// Khi cờ bật mà đủ 3 chiều trở lên, độ tin cậy tối đa là "vừa": nền
  /// không tái tạo được từ Health thì điểm không được tự tin cao. Trường hợp
  /// này cần chiều tải + giấc ngủ + một nền đủ ngày — ở đây RHR đủ, HRV
  /// thiếu, cửa sổ 3 ngày.
  @Test func flaggedResultCapsConfidenceAtMedium() throws {
    let r = try #require(ReadinessEngine.compute(Self.input(
      hrvHistory: Self.shortHrv, rhrHistory: Self.fullRhr, readableDays: 3)))
    #expect(r.limitedHistory == true)
    #expect(r.confidence == .medium)
  }

  // MARK: - Nối từ DailyLog

  /// `readinessInput` chuyển cửa sổ thành số ngày đọc được tới đúng ngày chấm.
  @Test func readinessInputPlumbsTheWindow() {
    let rows: [JSONValue] = (13...15).map { day in
      .object([
        "date_time": .string("2026-11-\(day)T08:00:00.000Z"),
        "hrv_rmssd_ms": .number(55), "hr_bpm": .number(56),
      ])
    }
    let sources = DailyLog.Sources(
      meals: [], workouts: [], sleeps: [], supplements: [], intakes: [], bio: [], profile: nil,
      bioHistory: rows, load7d: [], load28d: [], sleeps7d: [], water: [])
    let window = HealthHistoryWindow.limited(earliest: LocalDate("2026-11-15")!)
    let input = DailyLog.readinessInput(
      sources: sources, date: Self.today, now: EpochMillis(iso8601: "2026-11-17T10:00:00.000Z")!,
      in: Self.utc, historyWindow: window)
    #expect(input?.readableHistoryDays == 3)
    let unknown = DailyLog.readinessInput(
      sources: sources, date: Self.today, now: EpochMillis(iso8601: "2026-11-17T10:00:00.000Z")!,
      in: Self.utc)
    #expect(unknown?.readableHistoryDays == nil)
  }
}
