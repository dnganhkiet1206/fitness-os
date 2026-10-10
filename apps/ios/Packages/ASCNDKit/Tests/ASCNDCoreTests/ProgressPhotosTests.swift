@testable import ASCNDCore
import Foundation
import Testing

/// Ảnh tiến trình = `progress-photos.tsx` (tấm so sánh) + `lib/photo-urls.ts`
/// (`signPhotos`, mã RN biên dịch) @ fac9ac2 — `Fixtures/progress-photos-golden.json`.
struct ProgressPhotosGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "progress-photos-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  /// `out` = đúng code RN (không cửa sổ); `fixed` = cùng mã với cửa sổ 30 ngày
  /// mà native dùng.
  @Test func comparisonIsRNs() throws {
    let cases = Self.array(try Self.root()["compares"])
    #expect(cases.count == 210)
    var waists = 0
    var cut = 0
    for c in cases {
      let weights = Self.array(c["weights"]).map {
        ProgressPhotos.Reading(date: $0["date"]?.stringValue ?? "", value: Self.num($0["value"]) ?? .nan)
      }
      // `measurements.filter((m) => m.waist_cm != null)`
      let waist = Self.array(c["measurements"]).compactMap { m -> ProgressPhotos.Reading? in
        guard let v = Self.num(m["waist_cm"]) else { return nil }
        return ProgressPhotos.Reading(date: m["date"]?.stringValue ?? "", value: v)
      }
      let before = c["before"]?.stringValue ?? "", after = c["after"]?.stringValue ?? ""
      let rn = ProgressPhotos.compare(beforeDate: before, afterDate: after, weights: weights, waists: waist, windowDays: nil)
      let native = ProgressPhotos.compare(beforeDate: before, afterDate: after, weights: weights, waists: waist)
      for (got, w) in [(rn, c["out"]), (native, c["fixed"])] {
        #expect(got.weightBefore == Self.num(w?["wBefore"]), "\(c)")
        #expect(got.weightAfter == Self.num(w?["wAfter"]))
        #expect(got.waistBefore == Self.num(w?["mBefore"]))
        #expect(got.waistAfter == Self.num(w?["mAfter"]))
        #expect(got.weightDelta == Self.num(w?["weightDelta"]), "\(c)")
        #expect(got.waistDelta == Self.num(w?["waistDelta"]), "\(c)")
        #expect(ProgressPhotos.deltaText(got.weightDelta, unit: "kg") == w?["weightText"]?.stringValue)
        #expect(ProgressPhotos.deltaText(got.waistDelta, unit: "cm") == w?["waistText"]?.stringValue)
      }
      if native.waistDelta != nil { waists += 1 }
      if rn != native { cut += 1 }
    }
    #expect(waists > 50)
    #expect(cut > 20)  // cửa sổ thật sự cắt trong golden
  }

  /// Chia loạt + bỏ trùng + bỏ URL tuyệt đối như `signPhotos`; ký hỏng (cả
  /// loạt lỗi, loạt ném, từng path hỏng) thì ô còn mà không có ảnh.
  @Test func signingIsRNs() throws {
    let cases = Self.array(try Self.root()["signs"])
    #expect(cases.count == 40)
    for c in cases {
      let paths = Self.array(c["rows"]).compactMap { $0["photo_url"]?.stringValue }
      let chunk = Int(Self.num(c["chunk"]) ?? 100)
      let batches = ProgressPhotos.signBatches(paths, chunk: chunk)
      #expect(batches == Self.array(c["calls"]).map { Self.array($0).compactMap(\.stringValue) }, "\(c)")
      // Mô phỏng chính kịch bản ký của golden.
      let mode = c["mode"]?.stringValue
      var signed: [String: URL] = [:]
      for (i, b) in batches.enumerated() {
        if mode == "error" && i == 0 { continue }
        if mode == "throw" && i == 1 { continue }
        for p in b where !p.contains("bad") { signed[p] = URL(string: "https://s/\(p)?t=1") }
      }
      let want = Self.array(c["urls"]).compactMap(\.stringValue)
      for (p, w) in zip(paths, want) {
        let got = ProgressPhotos.displayURL(p, signed: signed)
        if w == p && !p.hasPrefix("http") {
          #expect(got == nil, "\(p)")  // RN rơi về đường dẫn: ảnh không hiện
        } else {
          #expect(got?.absoluteString == w, "\(p)")
        }
      }
    }
  }

  @Test func pathsFollowTheBucketPolicy() {
    let p = ProgressPhotos.objectPath(userId: "u-1", date: LocalDate("2026-10-10")!, pose: .side, millis: 1_791_600_000_000)
    #expect(p == "u-1/2026-10-10-side-1791600000000.jpg")
    #expect(p.hasPrefix("u-1/"))  // thư mục đầu = uid (`storage.foldername(name)[1]`)
    #expect(ProgressPhotos.storagePath("u/x.jpg") == "u/x.jpg")
    #expect(
      ProgressPhotos.storagePath("https://x.supabase.co/storage/v1/object/public/progress-photos/u/x.jpg") == "u/x.jpg")
    #expect(ProgressPhotos.storagePath("https://cdn/other.jpg") == "")
  }

  /// Tấm so sánh in theo đơn vị của tài khoản (RN luôn "kg").
  @Test func compareTextFollowsTheAccountUnit() {
    #expect(ProgressPhotos.weightText(72.5, unit: .kg) == "72.5kg")
    #expect(ProgressPhotos.weightText(72.5, unit: .lbs) == "159.8lb")
    #expect(ProgressPhotos.weightDeltaText(-1.5, unit: .kg) == "-1.5kg")
    #expect(ProgressPhotos.weightDeltaText(1, unit: .lbs) == "+2.2lb")
    #expect(ProgressPhotos.weightDeltaText(nil, unit: .kg) == "—")
    #expect(ProgressPhotos.waistText(80.25) == "80.25cm")
  }
}

@MainActor
struct ProgressPhotosBookTests {
  struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_600_000) }  // 2026-10-10 UTC
  }

  final class Remote: ProgressPhotoRemote, @unchecked Sendable {
    var table: [JSONValue] = []
    var objects: Set<String> = []
    var failRead = false
    var failSign = false
    var failInsert = false
    var offline = false
    var pageCalls: [Int] = []

    func rows(userId: String, from: Int) async throws -> [JSONValue] {
      pageCalls.append(from)
      if failRead { throw ProgressPhotosFailure.server }
      let mine = table.filter { $0["user_id"]?.stringValue == userId }
      return Array(mine.dropFirst(from).prefix(ProgressPhotos.page))
    }
    func sign(paths: [String], expiresIn: Int) async throws -> [String: URL] {
      if failSign { throw ProgressPhotosFailure.server }
      return Dictionary(uniqueKeysWithValues: paths.map { ($0, URL(string: "https://s/\($0)")!) })
    }
    func upload(path: String, jpeg: Data) async throws {
      if offline { throw ProgressPhotosFailure.offline }
      objects.insert(path)
    }
    func insert(userId: String, date: LocalDate, path: String, pose: String) async throws {
      if failInsert { throw ProgressPhotosFailure.server }
      table.insert(row(id: "n\(table.count)", user: userId, date: date.description, path: path, pose: pose), at: 0)
    }
    func deleteRow(id: String, userId: String) async throws -> Int {
      if offline { throw ProgressPhotosFailure.offline }
      let before = table.count
      table.removeAll { $0["id"]?.stringValue == id && $0["user_id"]?.stringValue == userId }
      return before - table.count
    }
    func removeObject(path: String) async throws { objects.remove(path) }

    func row(id: String, user: String, date: String, path: String, pose: String = "front") -> JSONValue {
      .object([
        "id": .string(id), "user_id": .string(user), "date": .string(date), "photo_url": .string(path),
        "pose": .string(pose),
      ])
    }
  }

  static func book(_ r: Remote, user: String = "u") -> ProgressPhotosBook {
    ProgressPhotosBook(userId: user, remote: r, clock: Clock(), timeZone: TimeZone(identifier: "UTC")!)
  }

  @Test func readsEveryPageAndSignsOnlyOwnRows() async {
    let r = Remote()
    r.table = (0..<450).map { r.row(id: "p\($0)", user: "u", date: "2026-01-01", path: "u/\($0).jpg") }
    r.table.append(r.row(id: "x", user: "other", date: "2026-01-01", path: "other/x.jpg"))
    let b = Self.book(r)
    await b.load()
    #expect(b.photos.count == 450)
    #expect(r.pageCalls == [0, 200, 400])
    #expect(b.url(b.photos[0])?.absoluteString == "https://s/u/0.jpg")
    #expect(!b.photos.contains { $0.path.hasPrefix("other/") })
  }

  @Test func failedFirstReadIsAnErrorAndSignFailureKeepsCells() async {
    let r = Remote()
    r.failRead = true
    let b = Self.book(r)
    await b.load()
    #expect(b.phase == .failed)
    r.failRead = false
    r.failSign = true
    r.table = [r.row(id: "a", user: "u", date: "2026-01-02", path: "u/a.jpg")]
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.photos.count == 1)  // ô còn
    #expect(b.url(b.photos[0]) == nil)  // không có ảnh
    r.failRead = true
    await b.load()
    #expect(b.photos.count == 1)  // đọc lại hỏng: giữ ảnh
  }

  @Test func uploadWritesTodayUnderTheUserFolder() async {
    let r = Remote()
    let b = Self.book(r)
    #expect(await b.upload(jpeg: Data(repeating: 1, count: 10), pose: .back) == .done)
    #expect(r.objects == ["u/2026-10-10-back-1791600000000.jpg"])
    #expect(b.photos.first?.pose == "back")
    #expect(b.photos.first?.date == LocalDate("2026-10-10"))
  }

  @Test func failedInsertRemovesTheUploadedFileAndOfflineRefuses() async {
    let r = Remote()
    let b = Self.book(r)
    r.failInsert = true
    #expect(await b.upload(jpeg: Data([1]), pose: .front) == .failed(.server))
    #expect(r.objects.isEmpty)  // không để file mồ côi
    r.failInsert = false
    r.offline = true
    #expect(await b.upload(jpeg: Data([1]), pose: .front) == .failed(.offline))
    #expect(r.table.isEmpty)
    #expect(await b.upload(jpeg: Data(count: ProgressPhotos.maxBytes + 1), pose: .front) == .failed(.tooLarge))
  }

  @Test func deleteRemovesTheRowFirstAndNothingWrittenIsReported() async {
    let r = Remote()
    r.table = [r.row(id: "a", user: "u", date: "2026-01-02", path: "u/a.jpg")]
    r.objects = ["u/a.jpg"]
    let b = Self.book(r)
    await b.load()
    let photo = b.photos[0]
    r.offline = true
    #expect(await b.delete(photo) == .failed(.offline))
    #expect(r.objects == ["u/a.jpg"])  // hàng chưa xoá thì file còn nguyên
    r.offline = false
    #expect(await b.delete(photo) == .done)
    #expect(r.table.isEmpty)
    #expect(r.objects.isEmpty)
    #expect(await b.delete(photo) == .nothingWritten)  // đã xoá ở máy khác
  }

  @Test func anotherAccountsRowsAreNeverTouched() async {
    let r = Remote()
    r.table = [r.row(id: "a", user: "other", date: "2026-01-02", path: "other/a.jpg")]
    let b = Self.book(r, user: "u")
    await b.load()
    #expect(b.photos.isEmpty)
    let foreign = ProgressPhotos.photo(r.table[0])!
    #expect(await b.delete(foreign) == .nothingWritten)
    #expect(r.table.count == 1)
  }
}
