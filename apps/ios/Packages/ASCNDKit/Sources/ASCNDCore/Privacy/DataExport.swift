public import Foundation

/// "Tải dữ liệu của bạn" (#527 mục 7, Kiệt duyệt mock v2 01/11).
///
/// RN behavior: `exportData` của `settings.tsx` — 16 bảng theo `user_id`, đọc từng
///   trang 1000 hàng tới khi trang ngắn (không cắt ngầm ở 500), `meal_entry_items`
///   theo id bữa (bảng không có `user_id`), một JSON qua `Share.share`; hỏng giữa
///   chừng là báo lỗi, không đưa tệp thiếu.
/// Native behavior: cùng bảng, cùng cách đọc; đóng gói như Apple Health (một tệp
///   zip có thư mục) nhưng dùng định dạng mở được ngay — `ascnd.json` (toàn bộ) +
///   `csv/<bảng>.csv` (Excel / Numbers) + `README.txt` giải thích từng tệp.
/// Reason: Apple Health xuất XML Excel không mở thẳng được; Kiệt chọn cách đóng
///   gói của Apple với CSV (01/11).
public enum DataExport {
  /// Một bảng của tài khoản, theo thứ tự người đọc gặp (nhật ký ngày trước).
  public struct Table: Sendable, Hashable {
    public let name: String
    /// Tên tệp CSV, đọc được bằng tiếng Việt không dấu.
    public let file: String
    public let group: Group
  }

  /// Nhóm cho dòng đếm trên màn (mock: Bữa ăn và món · Buổi tập · Ngủ, cân, nước · Koa).
  public enum Group: String, Sendable, Hashable, CaseIterable {
    case profile, meals, workouts, body, koa
  }

  public static let tables: [Table] = [
    .init(name: "profiles", file: "ho-so", group: .profile),
    .init(name: "daily_logs", file: "nhat-ky-ngay", group: .body),
    .init(name: "meal_entries", file: "bua-an", group: .meals),
    .init(name: "workout_sessions", file: "buoi-tap", group: .workouts),
    .init(name: "sleep_logs", file: "giac-ngu", group: .body),
    .init(name: "weight_logs", file: "can-nang", group: .body),
    .init(name: "water_logs", file: "nuoc", group: .body),
    .init(name: "biometric_samples", file: "sinh-trac", group: .body),
    .init(name: "body_measurements", file: "so-do", group: .body),
    .init(name: "supplements", file: "bo-sung", group: .meals),
    .init(name: "supplement_intake_logs", file: "bo-sung-da-uong", group: .meals),
    .init(name: "food_items", file: "thuc-pham-cua-toi", group: .meals),
    .init(name: "progress_photos", file: "anh-tien-trinh", group: .body),
    .init(name: "weekly_challenges", file: "thu-thach-tuan", group: .koa),
    .init(name: "mascot_inventory", file: "koa-tu-do", group: .koa),
    .init(name: "mascot_transactions", file: "koa-so-xu", group: .koa),
  ]

  /// Món của từng bữa — không có `user_id`, đọc theo id bữa.
  public static let items = Table(name: "meal_entry_items", file: "mon-an", group: .meals)

  public static let page = 1000
  /// Số id bữa mỗi lần đọc món (`.in()` dài thành URL dài).
  public static let idBatch = 200

  /// Toàn bộ dữ liệu: bảng → hàng, theo thứ tự `tables` rồi `items`.
  public struct Bundle: Sendable, Hashable {
    public var rows: [String: [JSONValue]]

    public func count(_ g: Group) -> Int {
      (DataExport.tables + [DataExport.items]).filter { $0.group == g }.reduce(0) { $0 + (rows[$1.name]?.count ?? 0) }
    }

    public var total: Int { rows.values.reduce(0) { $0 + $1.count } }
  }

  /// Đọc hết. Hỏng ở bất cứ bảng / trang nào là ném lỗi — không bao giờ trả tệp thiếu.
  public static func load(userId: String, store: any RowStore) async throws(RowStoreError) -> Bundle {
    var rows: [String: [JSONValue]] = [:]
    for t in tables {
      rows[t.name] = try await pages(store) { offset in
        RowQuery(
          table: t.name, columns: "*", filters: [.eq("user_id", .string(userId))],
          order: .init(column: "id", ascending: true), limit: page, offset: offset)
      }
    }
    let ids = (rows["meal_entries"] ?? []).compactMap { $0["id"]?.stringValue }
    var items: [JSONValue] = []
    for start in stride(from: 0, to: ids.count, by: idBatch) {
      let batch = ids[start..<min(start + idBatch, ids.count)]
      // `or=(meal_entry_id.in.(…))` — một điều kiện; id là uuid nên không cần bọc.
      let cond = "meal_entry_id.in.(\(batch.joined(separator: ",")))"
      items += try await pages(store) { offset in
        RowQuery(
          table: DataExport.items.name, columns: "*", filters: [.or(cond)],
          order: .init(column: "id", ascending: true), limit: page, offset: offset)
      }
    }
    rows[DataExport.items.name] = items
    return Bundle(rows: rows)
  }

  /// Đọc từng trang tới khi trang ngắn hơn `page`.
  static func pages(
    _ store: any RowStore, _ query: (Int) -> RowQuery
  ) async throws(RowStoreError) -> [JSONValue] {
    var out: [JSONValue] = []
    var offset = 0
    while true {
      let got = try await store.select(query(offset))
      out += got
      if got.count < page { return out }
      offset += page
    }
  }

  // MARK: - Tệp

  /// Tệp trong gói: đường dẫn tương đối → nội dung.
  public static func files(_ b: Bundle, exportedAt: Date, lang: String) -> [(path: String, data: Data)] {
    var out: [(String, Data)] = []
    out.append(("README.txt", Data(readme(b, exportedAt: exportedAt, lang: lang).utf8)))
    out.append(("ascnd.json", json(b, exportedAt: exportedAt)))
    for t in tables + [items] {
      out.append(("csv/\(t.file).csv", csv(b.rows[t.name] ?? [])))
    }
    return out
  }

  /// Tên gói: `ascnd-2026-11-01`.
  public static func name(_ day: LocalDate) -> String { "ascnd-\(day)" }

  static func json(_ b: Bundle, exportedAt: Date) -> Data {
    var root: [String: JSONValue] = ["exported_at": .string(ISO8601DateFormatter().string(from: exportedAt))]
    for t in tables + [items] { root[t.name] = .array(b.rows[t.name] ?? []) }
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return (try? enc.encode(JSONValue.object(root))) ?? Data()
  }

  /// CSV kiểu Excel: BOM UTF-8 (Excel mới nhận ra tiếng Việt), dấu phẩy, CRLF,
  /// trường có `,` `"` xuống dòng thì bọc ngoặc kép. Cột: `id`, các cột ngày, rồi
  /// theo bảng chữ cái; giá trị lồng (mảng / object) ghi thành JSON trong một ô.
  public static func csv(_ rows: [JSONValue]) -> Data {
    let objects = rows.compactMap { r -> [String: JSONValue]? in
      if case .object(let o) = r { return o }
      return nil
    }
    let keys = Set(objects.flatMap(\.keys))
    let lead = ["id", "date", "date_time", "created_at"].filter(keys.contains)
    let columns = lead + keys.subtracting(lead).sorted()
    var lines = [columns.map(field).joined(separator: ",")]
    for o in objects {
      lines.append(columns.map { field(cell(o[$0])) }.joined(separator: ","))
    }
    return Data([0xEF, 0xBB, 0xBF]) + Data((lines.joined(separator: "\r\n") + "\r\n").utf8)
  }

  static func cell(_ v: JSONValue?) -> String {
    switch v {
    case nil, .null?: return ""
    case .bool(let b)?: return b ? "true" : "false"
    case .number(let n)?:
      return n.rounded() == n && abs(n) < 1e15 ? String(Int64(n)) : String(n)
    case .string(let s)?: return s
    case .array?, .object?:
      let enc = JSONEncoder()
      enc.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
      return (try? enc.encode(v!)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }
  }

  static func field(_ s: String) -> String {
    guard s.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) else { return s }
    return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
  }

  static func readme(_ b: Bundle, exportedAt: Date, lang: String) -> String {
    let f = ISO8601DateFormatter()
    let vi = lang == "vi"
    var out = vi
      ? "Dữ liệu ASCND của bạn\nXuất lúc \(f.string(from: exportedAt))\n\n- ascnd.json: toàn bộ dữ liệu, một tệp.\n- csv/: mỗi loại dữ liệu một tệp, mở bằng Excel hay Numbers.\n  Ô có dấu [ ] hay { } là dữ liệu lồng (ví dụ các set của buổi tập), ghi dạng JSON.\n- Ảnh tiến trình: chỉ có đường dẫn, không kèm ảnh.\n\nSố hàng:\n"
      : "Your ASCND data\nExported \(f.string(from: exportedAt))\n\n- ascnd.json: everything, one file.\n- csv/: one file per kind of data, opens in Excel or Numbers.\n  Cells with [ ] or { } hold nested data (e.g. a workout's sets) as JSON.\n- Progress photos: paths only, images are not included.\n\nRows:\n"
    for t in tables + [items] {
      out += "  csv/\(t.file).csv (\(t.name)): \(b.rows[t.name]?.count ?? 0)\n"
    }
    return out
  }
}
