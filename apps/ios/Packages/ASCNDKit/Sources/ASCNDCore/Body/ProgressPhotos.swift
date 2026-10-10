public import Foundation
public import Observation

/// Ảnh tiến trình (#527) — `app/progress-photos.tsx`, `hooks/use-progress-photos.ts`,
/// `lib/photo-urls.ts` @ fac9ac2.
///
/// Như RN: mọi ảnh của tài khoản, mới → cũ theo `(date, id)`, đọc hết theo
/// trang 200 (#179); ảnh nằm trong bucket RIÊNG TƯ `progress-photos`, chỉ xem
/// qua URL ký 1 giờ, ký từng loạt 100, cùng một đường dẫn ký một lần, ký hỏng
/// thì ô vẫn còn (không có ảnh) — một lần ký hỏng không làm cả thư viện "không
/// đọc được"; chụp → JPEG, đường dẫn `"{uid}/{ngày}-{tư thế}-{ms}.jpg"` (thư mục
/// đầu là uid — chính sách Storage chặn theo nó), rồi ghi hàng; xoá HÀNG TRƯỚC
/// (0 hàng là lỗi) rồi mới xoá file; so sánh hai ảnh với cân / vòng eo gần nhất
/// không sau ngày ảnh. Mọi thao tác ghi chỉ khi có mạng — không qua hàng đợi.
///
/// Khác RN: số cân trên tấm so sánh theo đơn vị của tài khoản (RN luôn "kg");
/// ghi hàng hỏng sau khi đã tải ảnh lên thì xoá luôn file vừa tải (RN để lại
/// file mồ côi).
public enum ProgressPhotos {
  public enum Pose: String, Sendable, Hashable, CaseIterable { case front, side, back }

  public struct Photo: Sendable, Hashable, Identifiable {
    public let id: String
    public let date: LocalDate?
    public let path: String
    public let pose: String
    public let notes: String?
  }

  public static let bucket = "progress-photos"
  public static let page = 200
  public static let signChunk = 100
  /// Giây sống của URL ký.
  public static let signSeconds = 3600
  /// Bucket nhận tối đa 5 MiB, chỉ `image/jpeg` (`20260812120000`).
  public static let maxBytes = 5_242_880
  /// `photo-size.ts`: cạnh dài tối đa và chất lượng JPEG.
  public static let maxEdge = 1920.0
  public static let jpegQuality = 0.6

  public static func photo(_ row: JSONValue) -> Photo? {
    guard let id = row["id"]?.stringValue, let path = row["photo_url"]?.stringValue else { return nil }
    return Photo(
      id: id, date: row["date"]?.stringValue.flatMap { LocalDate(String($0.prefix(10))) }, path: path,
      pose: row["pose"]?.stringValue ?? "front", notes: row["notes"]?.stringValue)
  }

  /// Đường dẫn trong bucket: thư mục đầu là uid của phiên.
  public static func objectPath(userId: String, date: LocalDate, pose: Pose, millis: Int64) -> String {
    "\(userId)/\(date)-\(pose.rawValue)-\(millis).jpg"
  }

  /// Đường dẫn cần ký: bỏ URL tuyệt đối (ảnh cũ lưu cả URL), bỏ trùng, giữ thứ
  /// tự xuất hiện đầu; chia loạt `chunk`.
  public static func signBatches(_ paths: [String], chunk: Int = signChunk) -> [[String]] {
    var seen = Set<String>()
    let unique = paths.filter { !$0.hasPrefix("http") && seen.insert($0).inserted }
    return stride(from: 0, to: unique.count, by: chunk).map { Array(unique[$0..<min($0 + chunk, unique.count)]) }
  }

  /// URL hiển thị của một ảnh: URL tuyệt đối dùng thẳng; còn lại theo bảng đã
  /// ký, chưa ký được → `nil` (RN: rơi về chính đường dẫn — ảnh không hiện).
  public static func displayURL(_ path: String, signed: [String: URL]) -> URL? {
    path.hasPrefix("http") ? URL(string: path) : signed[path]
  }

  /// Đường dẫn trong bucket để xoá (ảnh cũ lưu cả URL công khai).
  public static func storagePath(_ photoURL: String) -> String {
    guard photoURL.hasPrefix("http") else { return photoURL }
    let parts = photoURL.components(separatedBy: "/\(bucket)/")
    return parts.count > 1 ? parts[1] : ""
  }

  // MARK: - So sánh

  public struct Reading: Sendable, Hashable {
    public let date: String
    public let value: Double
    public init(date: String, value: Double) {
      self.date = date
      self.value = value
    }
  }

  public struct Comparison: Sendable, Hashable {
    /// kg.
    public let weightBefore: Double?
    public let weightAfter: Double?
    public let waistBefore: Double?
    public let waistAfter: Double?
    /// Hiệu làm tròn 0.1 (kg / cm).
    public let weightDelta: Double?
    public let waistDelta: Double?
  }

  /// `nearestOnOrBefore`: lần đo muộn nhất không sau `date`; bằng ngày thì lần
  /// đứng trước trong danh sách giữ chỗ.
  static func nearestOnOrBefore(_ rows: [Reading], _ date: String) -> Reading? {
    var best: Reading?
    for r in rows where r.date <= date {
      if best == nil || r.date > best!.date { best = r }
    }
    return best
  }

  /// Tấm so sánh: `before` là ảnh cũ hơn. `weights` (kg) và `waists` (cm) cũ → mới.
  public static func compare(beforeDate: String, afterDate: String, weights: [Reading], waists: [Reading])
    -> Comparison
  {
    let wb = nearestOnOrBefore(weights, beforeDate), wa = nearestOnOrBefore(weights, afterDate)
    let mb = nearestOnOrBefore(waists, beforeDate), ma = nearestOnOrBefore(waists, afterDate)
    let delta = { (a: Reading?, b: Reading?) -> Double? in
      guard let a, let b else { return nil }
      return JS.round((b.value - a.value) * 10) / 10
    }
    return Comparison(
      weightBefore: wb?.value, weightAfter: wa?.value, waistBefore: mb?.value, waistAfter: ma?.value,
      weightDelta: delta(wb, wa), waistDelta: delta(mb, ma))
  }

  /// `deltaText`: `+1.5` / `-0.4` / `0`, `—` khi thiếu số.
  public static func deltaText(_ v: Double?, unit: String) -> String {
    guard let v else { return "—" }
    return (v > 0 ? "+" : "") + ReadinessEngine.jsString(v) + unit
  }

  /// Hai ảnh đã chọn, cũ bên trái (theo ngày, rồi thứ tự chọn).
  public static func ordered(_ a: Photo, _ b: Photo) -> (Photo, Photo) {
    let da = a.date?.description ?? "", db = b.date?.description ?? ""
    return db < da ? (b, a) : (a, b)
  }
}

/// Kho ảnh trên server. Ném `ProgressPhotosFailure`.
public protocol ProgressPhotoRemote: Sendable {
  /// Một trang hàng `progress_photos` của tài khoản.
  func rows(userId: String, from: Int) async throws -> [JSONValue]
  /// Ký một loạt đường dẫn; đường dẫn ký hỏng không có trong kết quả.
  func sign(paths: [String], expiresIn: Int) async throws -> [String: URL]
  func upload(path: String, jpeg: Data) async throws
  func insert(userId: String, date: LocalDate, path: String, pose: String) async throws
  /// Xoá hàng (lọc `id` VÀ `user_id`), trả số hàng đã xoá.
  func deleteRow(id: String, userId: String) async throws -> Int
  func removeObject(path: String) async throws
}

public enum ProgressPhotosFailure: Error, Sendable, Hashable {
  case offline
  /// Ảnh quá 5 MiB sau khi nén.
  case tooLarge
  case server
}

/// Thư viện ảnh của MỘT tài khoản.
@MainActor @Observable
public final class ProgressPhotosBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready
  }

  public enum Outcome: Sendable, Hashable {
    case done
    /// Xoá không chạm hàng nào (`nCxNothingWrittenPhoto`).
    case nothingWritten
    case busy
    case failed(ProgressPhotosFailure)
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Mới → cũ.
  public private(set) var photos: [ProgressPhotos.Photo] = []
  public private(set) var urls: [String: URL] = [:]
  public private(set) var uploading = false
  public private(set) var deleting: String?

  @ObservationIgnored private let remote: any ProgressPhotoRemote
  /// Đọc cân / vòng eo cho tấm so sánh (`useWeightHistory(365)`, `useBodyMeasurements`).
  @ObservationIgnored private let store: (any RowStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var closed = false

  public init(
    userId: String, remote: any ProgressPhotoRemote, store: (any RowStore)? = nil,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.remote = remote
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
  }

  public func close() { closed = true }

  public func url(_ p: ProgressPhotos.Photo) -> URL? { ProgressPhotos.displayURL(p.path, signed: urls) }

  /// Đọc hết theo trang rồi ký. Lần đầu hỏng → lỗi (≠ trống); đọc lại hỏng giữ
  /// ảnh cũ. Ký hỏng không làm hỏng lượt đọc.
  public func load() async {
    var all: [JSONValue] = []
    do {
      while true {
        let page = try await remote.rows(userId: userId, from: all.count)
        all += page
        if page.count < ProgressPhotos.page { break }
      }
    } catch {
      guard !closed else { return }
      if phase != .ready { phase = .failed }
      return
    }
    let list = all.compactMap(ProgressPhotos.photo)
    var signed: [String: URL] = [:]
    for batch in ProgressPhotos.signBatches(list.map(\.path)) {
      if let got = try? await remote.sign(paths: batch, expiresIn: ProgressPhotos.signSeconds) {
        signed.merge(got) { _, new in new }
      }
    }
    guard !closed else { return }
    photos = list
    urls = signed
    phase = .ready
  }

  /// Tải ảnh (JPEG đã nén) lên rồi ghi hàng của hôm nay. Ghi hàng hỏng → xoá
  /// file vừa tải (không để mồ côi).
  public func upload(jpeg: Data, pose: ProgressPhotos.Pose) async -> Outcome {
    guard !uploading, !closed else { return .busy }
    guard jpeg.count <= ProgressPhotos.maxBytes else { return .failed(.tooLarge) }
    uploading = true
    defer { uploading = false }
    let now = clock.nowMillis()
    let day = LocalDate(now, in: timeZone)
    let path = ProgressPhotos.objectPath(userId: userId, date: day, pose: pose, millis: now.millis)
    do {
      try await remote.upload(path: path, jpeg: jpeg)
    } catch {
      return .failed(Self.failure(error))
    }
    do {
      try await remote.insert(userId: userId, date: day, path: path, pose: pose.rawValue)
    } catch {
      try? await remote.removeObject(path: path)
      return .failed(Self.failure(error))
    }
    await load()
    return .done
  }

  /// Xoá hàng trước (phải chạm đúng một hàng của mình), rồi mới xoá file.
  public func delete(_ p: ProgressPhotos.Photo) async -> Outcome {
    guard deleting == nil, !closed else { return .busy }
    deleting = p.id
    defer { deleting = nil }
    let touched: Int
    do {
      touched = try await remote.deleteRow(id: p.id, userId: userId)
    } catch {
      return .failed(Self.failure(error))
    }
    guard touched > 0 else {
      await load()
      return .nothingWritten
    }
    let path = ProgressPhotos.storagePath(p.path)
    if !path.isEmpty { try? await remote.removeObject(path: path) }
    await load()
    return .done
  }

  /// Tấm so sánh cho hai ảnh (cũ trước): cân 365 ngày + vòng eo của mọi lần
  /// đo. Đọc hỏng → thiếu số ("—"), không phải lỗi màn.
  public func comparison(_ before: ProgressPhotos.Photo, _ after: ProgressPhotos.Photo) async
    -> ProgressPhotos.Comparison
  {
    let today = LocalDate(clock.nowMillis(), in: timeZone)
    var weights: [ProgressPhotos.Reading] = []
    var waists: [ProgressPhotos.Reading] = []
    if let store {
      let me = RowQuery.Filter.eq("user_id", .string(userId))
      let w = try? await store.select(
        RowQuery(
          table: "weight_logs", columns: "date, weight_kg",
          filters: [me, .gte("date", .string(today.adding(days: -365).description))],
          order: RowQuery.Order(column: "date", ascending: true)))
      weights = (w ?? []).compactMap { r in
        guard let d = r["date"]?.stringValue else { return nil }
        return ProgressPhotos.Reading(date: d, value: JS.number(r["weight_kg"]))
      }
      let m = try? await store.select(
        RowQuery(
          table: "body_measurements", columns: "date, waist_cm", filters: [me],
          order: RowQuery.Order(column: "date", ascending: true)))
      waists = (m ?? []).compactMap { r in
        guard let d = r["date"]?.stringValue, JS.present(r["waist_cm"]) else { return nil }
        return ProgressPhotos.Reading(date: d, value: JS.number(r["waist_cm"]))
      }
    }
    return ProgressPhotos.compare(
      beforeDate: before.date?.description ?? "", afterDate: after.date?.description ?? "", weights: weights,
      waists: waists)
  }

  static func failure(_ error: any Error) -> ProgressPhotosFailure {
    if let f = error as? ProgressPhotosFailure { return f }
    return NetworkFailure.isOffline(error) ? .offline : .server
  }
}
