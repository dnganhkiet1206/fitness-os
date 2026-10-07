// Extra exercise UI — C sở hữu (#408).
//
// Presentation cho bài tập thêm ngoài template (ad-hoc).
// KHÔNG session mutation, KHÔNG database/outbox/network trong View.
// Mọi thao tác là typed callbacks. Dùng local fixture protocol
// cho tới khi A20 (#399) + D-24 (#404) contract xong.
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Trạng thái của một extra exercise.
public enum ExtraExerciseState: Equatable {
  /// Mới thêm, chưa đặt tên.
  case new
  /// Đang sửa tên hoặc số sets.
  case editing
  /// Thiếu tên hoặc sets = 0 — chưa sẵn sàng.
  case incomplete
  /// Đã đạt max 20 sets.
  case atMaxSets
  /// Đã xoá, đang hiện undo banner (8s).
  case deleted
  /// Undo đã hết hạn.
  case undoExpired
}

/// Protocol cho extra exercise — A20 sẽ cung cấp model thật.
/// Khớp `AdHocExercise` của A20 (#399) và vectors D-24 (#404): `sets`.
public protocol ExtraExerciseProtocol: Identifiable {
  var id: String { get }
  var name: String { get }
  var sets: Int { get }
  var state: ExtraExerciseState { get }
}

/// Mock cho fixtures.
public struct MockExtraExercise: ExtraExerciseProtocol {
  public let id: String
  public let name: String
  public let sets: Int
  public let state: ExtraExerciseState

  public init(
    id: String = UUID().uuidString,
    name: String = "",
    sets: Int = 3,
    state: ExtraExerciseState = .new
  ) {
    self.id = id
    self.name = name
    self.sets = sets
    self.state = state
  }
}

/// Số sets tối đa cho phép.
public let maxExtraSets = 20

/// Cửa sổ undo — mirror A19 `undoWindowMillis` = 8 000 (issue #415).
/// A19: `undo(removal)` chỉ hợp lệ trong cửa sổ này.
public let undoWindowMillis = 8_000

/// Mirror presentation-side của A19 `Removal` (issue #415):
/// `removeLoggedSet(key) async throws(RemoveRefusal) -> Removal`.
/// UI không gọi API, không mutation — chỉ consume model để banner
/// hiển thị đúng tên và hết hạn đúng lúc (`expiresAt`).
public struct UndoRemoval: Equatable {
  /// Key của hàng bị gỡ. D-24 (AH-1/AH-3): id ổn định, key `x${id}-${n}`;
  /// xoá theo id, đổi tên giữ id.
  public let key: String
  public let sessionId: String
  public let expiresAt: Date
  /// true nếu lần gỡ này xoá cả hàng (gỡ set cuối cùng — A19 RS-3a).
  public let deletedSession: Bool
  /// Tên hiển thị — UI resolve từ key (mock; A20 #399 cung cấp model thật).
  public let exerciseName: String

  public init(
    key: String,
    sessionId: String,
    expiresAt: Date,
    deletedSession: Bool = false,
    exerciseName: String
  ) {
    self.key = key
    self.sessionId = sessionId
    self.expiresAt = expiresAt
    self.deletedSession = deletedSession
    self.exerciseName = exerciseName
  }
}
