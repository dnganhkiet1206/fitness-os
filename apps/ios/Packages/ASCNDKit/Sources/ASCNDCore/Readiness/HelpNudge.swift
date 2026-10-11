public import Foundation

/// Lời nhắc "bấm `?` nếu chưa rõ" (#527, chỉ thị 6103829484) — `lib/help-nudge.ts`
/// + `useHelpTopic` (`components/ascnd/help-button.tsx`) @ fac9ac2.
///
/// Ba luật, cả ba phải cùng đúng (như RN):
/// 1. Mở phần giải thích một lần là xong VĨNH VIỄN.
/// 2. Tối đa `limit` (3) lần hiện, suốt đời bản cài.
/// 3. Tối đa một lần mỗi lần chạy app — tập "đã có lượt" sống đúng bằng đời
///    tiến trình (module scope ở RN), không lưu.
///
/// Đọc hỏng = chưa có gì (thêm một lần nhắc rẻ hơn một thẻ hỏng; luật 2 chặn
/// lại ngay khi một lần ghi thành công).
///
/// Khác RN (ghi `NATIVE_IMPROVEMENTS`): kho mang `userId`, và lượt "lần chạy
/// này" tính theo từng người. RN xoá khoá `ascnd-help-nudge` + tập lượt khi
/// đăng xuất (`USER_KEYS`, `onUserScopedReset`); native chưa nối khoá này vào
/// lượt dọn của phiên (tệp chung), nên đọc của người khác là rỗng — người sau
/// luôn bắt đầu từ 0 như RN; cùng một người đăng nhập lại thì giữ số đã đếm.
public final class HelpNudge: @unchecked Sendable {
  /// `NUDGE_LIMIT`.
  public static let limit = 3
  public static let storeKey = "ascnd-help-nudge"
  /// Chủ đề của thẻ sẵn sàng (`HELP_TOPIC`, `readiness-gauge.tsx:37`).
  public static let readiness = "readiness"

  struct State: Codable, Equatable {
    var count: Int
    var opened: Bool
  }

  struct Blob: Codable {
    var user: String
    var topics: [String: State]
  }

  /// Tập `shownThisRun` của MỘT lần chạy app — dùng chung mọi kho.
  public final class Run: @unchecked Sendable {
    public static let shared = Run()
    private let lock = NSLock()
    private var shown: Set<String> = []
    public init() {}
    func has(_ key: String) -> Bool { lock.withLock { shown.contains(key) } }
    func add(_ key: String) { lock.withLock { _ = shown.insert(key) } }
    /// `resetRun` — chỉ cho test (một lần "mở lại app").
    public func reset() { lock.withLock { shown.removeAll() } }
  }

  private let store: any KeyValueStore
  private let run: Run
  private let lock = NSLock()

  public init(store: any KeyValueStore, run: Run = .shared) {
    self.store = store
    self.run = run
  }

  private func read(_ userId: String) -> [String: State] {
    guard let raw = store.string(forKey: Self.storeKey), let data = raw.data(using: .utf8),
      let blob = try? JSONDecoder().decode(Blob.self, from: data), blob.user == userId
    else { return [:] }
    return blob.topics
  }

  private func write(_ topics: [String: State], _ userId: String) {
    guard let data = try? JSONEncoder().encode(Blob(user: userId, topics: topics)),
      let text = String(data: data, encoding: .utf8)
    else { return }
    store.set(text, forKey: Self.storeKey)
  }

  private static func runKey(_ topic: String, _ userId: String) -> String { "\(userId)\u{1F}\(topic)" }

  /// `shouldNudge`: có hiện lời nhắc của `topic` lúc này không. Trả `true` thì
  /// giữ luôn lượt của lần chạy, để hai thẻ dựng cùng lúc không cùng hiện.
  public func shouldNudge(_ topic: String, userId: String) -> Bool {
    lock.withLock {
      let key = Self.runKey(topic, userId)
      if run.has(key) { return false }
      let state = read(userId)[topic] ?? State(count: 0, opened: false)
      if state.opened || state.count >= Self.limit { return false }
      run.add(key)
      return true
    }
  }

  /// `noteNudged`: đếm một lần THẬT SỰ hiện.
  public func noteNudged(_ topic: String, userId: String) {
    lock.withLock {
      var all = read(userId)
      let state = all[topic] ?? State(count: 0, opened: false)
      if state.opened { return }
      all[topic] = State(count: state.count + 1, opened: false)
      write(all, userId)
    }
  }

  /// Trạng thái đang lưu của `topic` cho người này (test / golden).
  func state(_ topic: String, userId: String) -> State? { lock.withLock { read(userId)[topic] } }

  /// `noteHelpOpened`: phần giải thích đã mở — chủ đề này xong.
  public func noteHelpOpened(_ topic: String, userId: String) {
    lock.withLock {
      var all = read(userId)
      all[topic] = State(count: all[topic]?.count ?? 0, opened: true)
      run.add(Self.runKey(topic, userId))
      write(all, userId)
    }
  }
}
