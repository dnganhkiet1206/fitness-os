import ASCNDBackend
import ASCNDCore
import ASCNDStore
import Foundation
import Network
import Observation

/// Gốc lắp ráp của app: nơi DUY NHẤT dựng các mảnh thật và nối chúng với nhau.
///
///     màn tập ─▶ WorkoutSessionController ─▶ GRDBWorkoutStore ┐
///                                                              ├─ ascnd.sqlite (một tệp,
///     SyncWorker ◀─ OutboxStore ◀──────────────────────────────┘  một transaction khi chốt)
///         │
///         └─▶ SupabaseRemoteWriter ─▶ workout_sessions
///
/// Mọi thứ khác nhận các mảnh này qua `environment`, không tự dựng.
@MainActor
@Observable
final class AppServices {
  let session: SessionStore
  let sync: SyncWorker
  @ObservationIgnored let workouts: GRDBWorkoutStore
  /// Lỗi không mở được database / thiếu cấu hình — app vẫn mở, màn nói thật.
  private(set) var startupError: String?

  @ObservationIgnored private let monitor = NWPathMonitor()

  init() {
    let backend: Backend?
    var problems: [String] = []
    do {
      backend = Backend(config: try BackendConfig.fromMainBundle())
    } catch {
      backend = nil
      problems.append("backend: \(error)")
    }

    let database: ASCNDDatabase
    do {
      database = try ASCNDDatabase(path: try Self.databasePath())
    } catch {
      // Không mở được tệp thì vẫn chạy trong bộ nhớ: dữ liệu KHÔNG bền, và
      // `startupError` nói điều đó ra — không bao giờ giả vờ "đã lưu".
      problems.append("database: \(error)")
      database = try! ASCNDDatabase()  // trong bộ nhớ: không có lý do thất bại ngoài hết RAM
    }

    workouts = GRDBWorkoutStore(database)
    session = SessionStore(api: backend.map { SupabaseAuthAPI(backend: $0) as any AuthAPI } ?? UnconfiguredAuth())
    sync = SyncWorker(
      store: OutboxStore(database),
      remote: backend.map { SupabaseRemoteWriter(backend: $0) as any RemoteWriter } ?? UnconfiguredRemote(),
      online: false)
    startupError = problems.isEmpty ? nil : problems.joined(separator: "\n")

    // Đăng xuất: bỏ hàng đợi như baseline (#241 chờ Kiệt).
    session.onSignedOut { [sync] in await sync.signOut() }
    startNetworkMonitor()
  }

  /// App mở / quay lại tiền cảnh: đọc phiên, dọn ngày cũ, thử gửi hàng đợi.
  func start() async {
    await session.start()
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    _ = try? await workouts.pruneDays(today: today)
    sync.kick()
  }

  func didBecomeActive() {
    sync.kick()
  }

  /// `Application Support/ascnd.sqlite`. Bảo vệ "tới lần mở khoá đầu tiên":
  /// app ở nền (nút ±15 của Island, vòng sync) vẫn đọc được sau khi máy khoá.
  private static func databasePath() throws -> String {
    let fm = FileManager.default
    let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    try fm.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: dir.path)
    return dir.appendingPathComponent("ascnd.sqlite").path
  }

  private func startNetworkMonitor() {
    monitor.pathUpdateHandler = { [weak self] path in
      let online = path.status == .satisfied
      Task { @MainActor in self?.sync.setOnline(online) }
    }
    monitor.start(queue: DispatchQueue(label: "ascnd.network"))
  }
}

/// Thiếu cấu hình Supabase (Backend.xcconfig): không đăng nhập được, nói rõ.
private struct UnconfiguredAuth: AuthAPI {
  struct NotConfigured: Error {}
  func currentSession() async throws -> AuthSession? { nil }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> { AsyncStream { $0.finish() } }
  func signUp(email: String, password: String, name: String) async throws { throw NotConfigured() }
  func signIn(email: String, password: String) async throws { throw NotConfigured() }
  func signInWithApple(identityToken: String, rawNonce: String) async throws { throw NotConfigured() }
  func resetPassword(email: String) async throws { throw NotConfigured() }
  func signOut() async throws {}
}

/// Không có backend thì không gửi được — coi như mất mạng, hàng đợi giữ nguyên.
private struct UnconfiguredRemote: RemoteWriter {
  func send(_ entry: OutboxEntry) async throws(WriteFailure) { throw .offline }
}
