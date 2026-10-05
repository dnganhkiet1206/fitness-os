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
public protocol ExtraExerciseProtocol: Identifiable {
  var id: String { get }
  var name: String { get }
  var setCount: Int { get }
  var state: ExtraExerciseState { get }
}

/// Mock cho fixtures.
public struct MockExtraExercise: ExtraExerciseProtocol {
  public let id: String
  public let name: String
  public let setCount: Int
  public let state: ExtraExerciseState

  public init(
    id: String = UUID().uuidString,
    name: String = "",
    setCount: Int = 3,
    state: ExtraExerciseState = .new
  ) {
    self.id = id
    self.name = name
    self.setCount = setCount
    self.state = state
  }
}

/// Số sets tối đa cho phép.
public let maxExtraSets = 20
