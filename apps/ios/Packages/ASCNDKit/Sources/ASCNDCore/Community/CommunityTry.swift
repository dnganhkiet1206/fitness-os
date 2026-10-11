public import Foundation

/// "Thử workout" trên thẻ bài (#527, Cộng đồng lát 15) — `tryIt` của
/// `workout-post-card.tsx` + `useRecordTry` (`hooks/use-community.ts`) @ fac9ac2,
/// trên lõi chép template của A (`TemplateCopy` / `PlanEditor.copyShared`, #430).
///
/// RN: `workoutFromPost` → không còn bài nào thì báo `nCmTryNone`, KHÔNG ghi gì;
/// có thì tạo template loại `community`, RỒI mới ghi `community_post_tries`
/// (thử mà không có mẫu tập thì tác giả nhận thông báo về việc chưa xảy ra);
/// 23505 = đã ghi rồi. Nút ẩn với bài của mình và ở thẻ xem trước.
public protocol CommunityTryRemote: Sendable {
  /// Chèn `community_post_tries` (`post_id`, `user_id`); 23505 không phải lỗi.
  func recordTry(postId: String, userId: String) async throws
}

public enum CommunityTry {
  /// Payload → dòng của lõi chép (`WorkoutExerciseLine` có `sets` / `reps` là số).
  public static func lines(_ w: CommunityPayloads.Workout) -> [SharedWorkoutLine] {
    w.exercises.map {
      SharedWorkoutLine(
        exerciseId: $0.exerciseId, exerciseName: $0.exerciseName, library: $0.library, sets: int($0.sets),
        reps: int($0.reps))
    }
  }

  static func int(_ v: Double) -> Int {
    guard v.isFinite else { return 0 }
    return Int(max(-1e9, min(1e9, v.rounded(.towardZero))))
  }

  /// Nút có hiện không: bài workout của người khác, trên thẻ thật (không phải xem trước).
  public static func offered(_ post: CommunityFeed.Post) -> Bool { post.kind == .workout && !post.mine }

  public enum Outcome: Sendable, Hashable {
    /// Đã thêm vào Buổi tập; `skipped` bài tự tạo của người đăng không chép được.
    case tried(skipped: Int)
    /// Buổi chỉ có bài tự tạo — không có gì để chép, không ghi gì.
    case nothingToCopy
    /// Không tạo được template (lý do của lõi chép).
    case refused
    /// Đang có một lượt thử bài này.
    case busy
  }
}

/// Lượt "Thử" của một màn. Id template sinh MỘT lần cho mỗi bài và giữ qua các
/// lần bấm lại, nên bấm hai lần không thành hai template (lõi chép idempotent
/// theo id).
@MainActor
@Observable
public final class CommunityTryBook {
  /// Chép một buổi được chia sẻ thành template mới với `id` cho trước; trả số
  /// bài bị bỏ. App truyền `PlanEditor.copyShared`.
  public typealias Copy = @MainActor (
    _ id: String, _ title: String?, _ lines: [SharedWorkoutLine], _ fallbackName: String
  ) async throws -> Int

  public let userId: String
  /// Bài đang thử — nút tắt trong lúc đó (`addTemplate.isPending`).
  public private(set) var busy: Set<String> = []

  @ObservationIgnored private let remote: any CommunityTryRemote
  @ObservationIgnored private let newId: @MainActor () -> String
  @ObservationIgnored private var ids: [String: String] = [:]

  public init(userId: String, remote: any CommunityTryRemote, newId: @escaping @MainActor () -> String) {
    self.userId = userId
    self.remote = remote
    self.newId = newId
  }

  public func tryWorkout(_ post: CommunityFeed.Post, fallbackName: String, copy: Copy) async -> CommunityTry.Outcome {
    guard !busy.contains(post.id) else { return .busy }
    let lines = CommunityTry.lines(post.workout)
    let draft = TemplateCopy.fromShared(title: post.workout.title, lines: lines, fallbackName: fallbackName)
    if draft.exercises.isEmpty { return .nothingToCopy }
    busy.insert(post.id)
    defer { busy.remove(post.id) }
    let id = ids[post.id] ?? newId()
    ids[post.id] = id
    let skipped: Int
    do {
      skipped = try await copy(id, post.workout.title, lines, fallbackName)
    } catch {
      return .refused
    }
    // Sau template, không trước. Template đã BỀN trên máy (hàng đợi gửi khi có
    // mạng) — ghi lượt thử hỏng chỉ làm tác giả thiếu một thông báo, không
    // biến một template đã lưu thành "thất bại".
    try? await remote.recordTry(postId: post.id, userId: userId)
    return .tried(skipped: skipped)
  }
}
