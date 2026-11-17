public import Foundation
public import Observation

// Bài quen thuộc + bài yêu thích (Kiệt 15/11, #527).
//
// - Quen thuộc: số BUỔI đã tập mỗi bài trong cửa sổ của `InsightBook` (90 ngày),
//   lần gần nhất để phân thứ hạng khi bằng số buổi. Khoá là
//   `PersonalRecords.exerciseKey(tên)` — cùng khoá với lịch sử, kỷ lục.
// - Yêu thích: ngôi sao trên thẻ bài. Lưu trên máy theo tài khoản (`ExerciseFavoriteStore`)
//   và đồng bộ lên bảng `exercise_favorites` (migration 20261116120000, deploy 16/11
//   khi Kiệt duyệt; mất mạng thì giữ bản trên máy, lần sau gửi bù), `ExerciseFavoritesSync`.

/// Mức quen thuộc của một bài với người dùng.
public struct ExerciseUsage: Sendable, Hashable {
  /// Số buổi khác nhau có bài này.
  public let sessions: Int
  /// Lần tập gần nhất.
  public let lastAt: EpochMillis
}

public enum ExerciseFamiliarity {
  /// Số buổi + lần gần nhất theo `exerciseKey`, từ các (buổi, bài) của lịch sử.
  public static func usage(_ performances: [ExercisePerformance]) -> [String: ExerciseUsage] {
    var sessions: [String: Set<String>] = [:]
    var last: [String: EpochMillis] = [:]
    for p in performances where !p.exerciseKey.isEmpty {
      sessions[p.exerciseKey, default: []].insert(p.sessionId)
      last[p.exerciseKey] = max(last[p.exerciseKey] ?? p.at, p.at)
    }
    var out: [String: ExerciseUsage] = [:]
    for (key, ids) in sessions {
      out[key] = ExerciseUsage(sessions: ids.count, lastAt: last[key] ?? EpochMillis(0))
    }
    return out
  }

  /// Chỉ số buổi — dạng `ExerciseSearch.rank(usage:)` nhận.
  public static func counts(_ usage: [String: ExerciseUsage]) -> [String: Int] {
    usage.mapValues(\.sessions)
  }

  /// Bộ lọc "Quen thuộc": bài trong danh sách đã từng tập, nhiều buổi trước,
  /// bằng nhau thì tập gần đây hơn trước; mỗi tên một lần.
  public static func familiar(_ list: [LibraryExercise], usage: [String: ExerciseUsage]) -> [LibraryExercise] {
    var seen = Set<String>()
    return list.enumerated()
      .compactMap { i, e -> (u: ExerciseUsage, i: Int, e: LibraryExercise)? in
        usage[PersonalRecords.exerciseKey(e.name)].map { ($0, i, e) }
      }
      .sorted {
        if $0.u.sessions != $1.u.sessions { return $0.u.sessions > $1.u.sessions }
        if $0.u.lastAt != $1.u.lastAt { return $0.u.lastAt > $1.u.lastAt }
        return $0.i < $1.i
      }
      .map(\.e)
      .filter { seen.insert(PersonalRecords.exerciseKey($0.name)).inserted }
  }
}

/// Nơi giữ sao yêu thích của một tài khoản (app: trên máy). Hai ô: `.local` là điều người
/// dùng thấy, `.synced` là điều server đã nhận — chênh lệch giữa hai ô là phần chưa gửi.
public protocol ExerciseFavoriteStore: Sendable {
  func load(userId: String, slot: ExerciseFavoriteSlot) -> Set<String>
  func save(userId: String, slot: ExerciseFavoriteSlot, _ ids: Set<String>)
}

public enum ExerciseFavoriteSlot: String, Sendable {
  case local
  case synced
}

/// Sao yêu thích của bài tập — một cờ TUYỆT ĐỐI theo id bài (đặt / bỏ, không "đảo",
/// như luật #161): bấm hai lần vì lag vẫn ra đúng trạng thái người dùng thấy.
@MainActor @Observable
public final class ExerciseFavorites {
  public let userId: String
  public private(set) var ids: Set<String>
  @ObservationIgnored private let store: any ExerciseFavoriteStore

  public init(userId: String, store: any ExerciseFavoriteStore) {
    self.userId = userId
    self.store = store
    ids = store.load(userId: userId, slot: .local)
  }

  public func contains(_ id: String) -> Bool { ids.contains(id.lowercased()) }

  /// Đặt sao của bài `id` thành `value`.
  public func set(_ id: String, _ value: Bool) {
    let key = id.lowercased()
    guard ids.contains(key) != value else { return }
    if value { ids.insert(key) } else { ids.remove(key) }
    store.save(userId: userId, slot: .local, ids)
  }

  /// Đẩy phần chưa gửi lên `exercise_favorites`, rồi lấy bản server về khi không còn gì chờ
  /// (sao đánh ở máy khác hiện ra ở đây). Từng dòng một: một bài server chưa có (bài vừa tạo
  /// còn trong hàng chờ, khoá ngoại hỏng) không chặn các sao khác. Hỏng (mất mạng, bảng chưa
  /// deploy) thì giữ nguyên trên máy, lần sau gửi bù. `true` khi sao trên máy vừa đổi theo server.
  @discardableResult
  public func sync(rows: any RowStore) async -> Bool {
    var synced = store.load(userId: userId, slot: .synced)
    for row in ExerciseFavoritesSync.rows(from: synced, to: ids, userId: userId) {
      guard let id = row["exercise_id"]?.stringValue else { continue }
      do {
        try await rows.upsert(ExerciseFavoritesSync.table, [row], onConflict: ExerciseFavoritesSync.conflict)
        if row["is_favorite"] == .bool(true) { synced.insert(id) } else { synced.remove(id) }
        store.save(userId: userId, slot: .synced, synced)
      } catch {
        continue
      }
    }
    guard synced == ids, let found = try? await rows.select(ExerciseFavoritesSync.query(userId: userId)) else {
      return false
    }
    let server = ExerciseFavoritesSync.decode(found)
    store.save(userId: userId, slot: .synced, server)
    // Có người vừa đánh sao trong lúc chờ server trả lời: giữ ý mới, lần sau gửi.
    guard synced == ids, server != ids else { return false }
    ids = server
    store.save(userId: userId, slot: .local, server)
    return true
  }

  /// Bài yêu thích có trong danh sách, giữ thứ tự danh sách.
  public func filter(_ list: [LibraryExercise]) -> [LibraryExercise] {
    list.filter { ids.contains($0.id.lowercased()) }
  }
}

extension ExerciseSearch {
  /// Thứ tự khi chưa gõ, cá nhân hoá: bài yêu thích → bài tập nhiều → bài phổ biến
  /// → phần còn lại giữ thứ tự thư viện (sắp xếp ổn định).
  ///
  /// Điểm = 3 (yêu thích) + tới 1,5 theo số buổi (0,75 × log₂(n+1), bão hoà ở 3
  /// buổi) + độ phổ biến (0…1): bài đã tập từ 2 buổi đứng trên mọi bài phổ biến
  /// mình chưa tập; yêu thích luôn đứng trên cùng.
  public static func personalFirst(
    _ list: [LibraryExercise], usage: [String: Int] = [:], favorites: Set<String> = []
  ) -> [LibraryExercise] {
    list.enumerated()
      .map { i, e -> (s: Double, i: Int, e: LibraryExercise) in
        (personalScore(e, usage: usage, favorites: favorites) + popularity(of: e), i, e)
      }
      .sorted { $0.s != $1.s ? $0.s > $1.s : $0.i < $1.i }
      .map(\.e)
  }

  /// Phần cá nhân của điểm (không gồm độ phổ biến).
  static func personalScore(_ e: LibraryExercise, usage: [String: Int], favorites: Set<String>) -> Double {
    let fav = favorites.contains(e.id.lowercased()) ? 3.0 : 0
    let n = usage[PersonalRecords.exerciseKey(e.name)] ?? 0
    return fav + (n > 0 ? min(1.5, 0.75 * log2(Double(n) + 1)) : 0)
  }
}

/// Bảng `exercise_favorites` (migration 20261116120000, deploy 16/11): một cờ tuyệt đối mỗi
/// (người, bài), chỉ upsert, không xoá — bỏ sao là `is_favorite = false`.
public enum ExerciseFavoritesSync {
  public static let table = "exercise_favorites"
  public static let conflict = "user_id,exercise_id"

  public static func query(userId: String) -> RowQuery {
    RowQuery(
      table: table, columns: "exercise_id,is_favorite",
      filters: [.eq("user_id", .string(userId)), .eq("is_favorite", .bool(true))], limit: 2000)
  }

  public static func decode(_ rows: [JSONValue]) -> Set<String> {
    Set(rows.compactMap { r in r["is_favorite"] == .bool(false) ? nil : r["exercise_id"]?.stringValue?.lowercased() })
  }

  /// Dòng cần ghi để server đi từ `synced` tới `local`: sao mới (true) và sao đã bỏ (false),
  /// xếp theo id cho ổn định.
  public static func rows(from synced: Set<String>, to local: Set<String>, userId: String) -> [[String: JSONValue]] {
    func row(_ id: String, _ on: Bool) -> [String: JSONValue] {
      ["user_id": .string(userId), "exercise_id": .string(id), "is_favorite": .bool(on)]
    }
    return local.subtracting(synced).sorted().map { row($0, true) }
      + synced.subtracting(local).sorted().map { row($0, false) }
  }
}
