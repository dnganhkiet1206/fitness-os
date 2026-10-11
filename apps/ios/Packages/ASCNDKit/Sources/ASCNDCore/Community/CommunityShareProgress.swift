public import Foundation
public import Observation

/// Chia sẻ tiến trình (#527, lát 12) — `app/community-share-progress.tsx` +
/// `useProgressPreview` / `useShareProgress` (`hooks/use-community.ts`) @
/// fac9ac2.
///
/// Như RN:
/// - khoảng 4 / 8 / 12 / 24 tuần (mặc định 12); cân nặng BẬT, vòng eo TẮT
///   (số đo cơ thể nhạy cảm hơn — phải chủ động bật), bài sức mạnh: không /
///   một trong 6 bài có tạ hay tập nhất 90 ngày;
/// - xem trước là bản của SERVER: mỗi lần đổi lựa chọn gọi
///   `build_progress_payload` — đúng hàm `share_progress` gọi khi đăng; không
///   đủ dữ liệu thì server từ chối và màn nói đúng lý do;
/// - ảnh thư viện loại `progress` (không ảnh cơ thể), đổi phong cách;
/// - Đăng chỉ khi có thẻ xem trước.
public enum CommunityShareProgress {
  public static let ranges = [4, 8, 12, 24]
  public static let liftChoices = 6
  public static let historyDays = 90

  public struct Options: Sendable, Hashable {
    public var weeks = 12
    public var weight = true
    public var waist = false
    public var liftId: String?
    public init() {}
  }

  public struct Lift: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let count: Int
  }

  /// Bài có tạ trong các buổi (bỏ khởi động, cần `exerciseId`, tạ > 0), hay
  /// tập nhất trước; hoà giữ thứ tự gặp đầu; tên là tên lần gặp đầu.
  public static func lifts(_ sessions: [JSONValue]) -> [Lift] {
    var order: [String] = []
    var count: [String: (name: String, n: Int)] = [:]
    for s in sessions {
      guard case .array(let sets)? = s["sets"] else { continue }
      for x in sets {
        guard let id = x["exerciseId"]?.stringValue, !id.isEmpty else { continue }
        if JS.truthyValue(x["warmup"] ?? .null) { continue }
        guard let w = PersonalRecords.jsNumber(x["weight"]), w > 0 else { continue }
        if var cur = count[id] {
          cur.n += 1
          count[id] = cur
        } else {
          order.append(id)
          count[id] = (x["exerciseName"]?.stringValue ?? "?", 1)
        }
      }
    }
    let all = order.enumerated().compactMap { i, id in count[id].map { (i, Lift(id: id, name: $0.name, count: $0.n)) } }
    return Array(all.sorted { $0.1.count != $1.1.count ? $0.1.count > $1.1.count : $0.0 < $1.0 }.map(\.1).prefix(liftChoices))
  }
}

public protocol CommunityShareProgressRemote: Sendable {
  func myProfile(me: String) async throws -> JSONValue?
  func privacySettings(me: String) async throws -> JSONValue?
  func artLibrary() async throws -> [JSONValue]
  /// RPC `build_progress_payload`.
  func progressPreview(_ o: CommunityShareProgress.Options) async throws -> JSONValue
  /// RPC `share_progress` / `share_progress_with_art`; ném `CommunityShareFailure`.
  func shareProgress(
    _ o: CommunityShareProgress.Options, caption: String, visibility: CommunityShare.Visibility, artId: String?
  ) async throws
  func artURL(path: String) -> URL?
}

@MainActor @Observable
public final class CommunityShareProgressBook {
  public enum PreviewPhase: Sendable, Hashable {
    case loading
    /// Server từ chối: chưa đủ dữ liệu trong khoảng này.
    case nothing
    case ready
  }

  public let userId: String
  public private(set) var phase: CommunityShareWorkoutBook.Phase = .loading
  public private(set) var lifts: [CommunityShareProgress.Lift] = []
  public var options = CommunityShareProgress.Options()
  public var caption = ""
  public var visibilityPick: CommunityShare.Visibility?
  public var stylePick: String?
  public private(set) var previewPhase: PreviewPhase = .loading
  public private(set) var payload: JSONValue?
  public private(set) var posting = false

  @ObservationIgnored private let remote: any CommunityShareProgressRemote
  @ObservationIgnored private let history: any HistorySource
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var profileRow: JSONValue?
  @ObservationIgnored private var defaultVisibility: CommunityShare.Visibility = .public
  @ObservationIgnored private var library: [CommunityArtLibrary.Item] = []
  @ObservationIgnored private var previewFor: CommunityShareProgress.Options?
  @ObservationIgnored private var generation = 0

  public init(
    userId: String, remote: any CommunityShareProgressRemote, history: any HistorySource,
    clock: any WallClock = SystemWallClock()
  ) {
    self.userId = userId
    self.remote = remote
    self.history = history
    self.clock = clock
  }

  public var visibility: CommunityShare.Visibility { visibilityPick ?? defaultVisibility }
  public var art: CommunityArtLibrary.Item? {
    CommunityArtLibrary.pick(library, kind: "progress", tags: [], style: stylePick)
  }
  public var styles: [String] { CommunityArtLibrary.styles(library, kind: "progress") }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  /// Thẻ xem trước — chỉ khi server đã dựng được payload cho đúng lựa chọn.
  public var preview: CommunityFeed.Post? {
    guard previewPhase == .ready, let payload, let profileRow else { return nil }
    let row: JSONValue = .object([
      "id": .string("preview"), "author_id": .string(userId), "kind": .string("progress"), "payload": payload,
      "caption": .string(RepEntry.trimJS(caption)), "visibility": .string(visibility.rawValue),
      "like_count": .number(0), "comment_count": .number(0), "save_count": .number(0), "hidden": .bool(false),
      "created_at": .string(WorkoutSessionRecord.iso8601(clock.nowMillis())),
      "art_id": art.map { .string($0.id) } ?? .null, "comments_off": .bool(false),
    ])
    return CommunityFeed.hydrate(
      [row], me: userId, authors: [profileRow], liked: [], saved: [], arts: art.map { [$0.row] } ?? []
    ).first
  }

  public func load() async {
    let remote = self.remote, history = self.history, me = userId
    if phase != .ready { phase = .loading }
    do {
      let p = try await remote.myProfile(me: me)
      let since = EpochMillis(clock.nowMillis().millis - Int64(CommunityShareProgress.historyDays) * 24 * 3600 * 1000)
      // Phụ: hỏng thì để trống / mặc định.
      let sessions = (try? await history.sessions(userId: me, since: since)) ?? []
      let settings = try? await remote.privacySettings(me: me)
      let art = (try? await remote.artLibrary()) ?? []
      profileRow = p
      lifts = CommunityShareProgress.lifts(sessions)
      defaultVisibility = CommunityPrivacy.settings(settings).defaultVisibility
      library = art.compactMap(CommunityArtLibrary.item)
      phase = p == nil ? .noProfile : .ready
    } catch {
      phase = .failed
    }
  }

  /// Gọi lại `build_progress_payload` khi lựa chọn đổi.
  public func refreshPreview() async {
    let o = options
    guard o != previewFor || previewPhase == .nothing else { return }
    generation += 1
    let gen = generation, remote = self.remote
    previewPhase = .loading
    do {
      let p = try await remote.progressPreview(o)
      guard gen == generation else { return }
      payload = p
      previewFor = o
      previewPhase = .ready
    } catch {
      guard gen == generation else { return }
      payload = nil
      previewFor = o
      previewPhase = .nothing
    }
  }

  public func post() async -> CommunityShareWorkoutBook.PostResult {
    guard preview != nil, !posting else { return .ignored }
    posting = true
    defer { posting = false }
    let remote = self.remote, o = options, caption = self.caption, vis = visibility, artId = art?.id
    do {
      try await remote.shareProgress(o, caption: caption, visibility: vis, artId: artId)
      return .posted
    } catch let f as CommunityShareFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }
}
