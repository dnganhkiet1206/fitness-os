#if DEBUG
  import ASCNDCore
  import Foundation

  /// Máy chủ Supabase GIẢ trong app — chỉ bản Debug, chỉ khi mở app với
  /// `-uiTestFakeBackend` (`UITestMode`). Không có máy chủ nào chạy: mọi request
  /// của client Supabase tới `UITestMode.host` được `FakeSupabaseProtocol` trả lời
  /// từ một kho trong bộ nhớ, dựng lại mỗi lần mở app từ `UITestSeed`.
  ///
  /// Đủ PostgREST cho các truy vấn của app (`ASCNDBackend`, `RowQuery`): lọc
  /// `eq / neq / gt / gte / lt / lte / is / in / like / ilike / not.* / or`,
  /// `order`, `limit`, `offset`, nhúng bảng con một tầng (`meal_entry_items(...)`),
  /// đếm (`count=exact`), `insert / upsert / update / delete`, `rpc/*`, và trả lời
  /// mẫu của edge function. Không kiểm RLS hay ràng buộc — đây không phải bản sao
  /// của server, chỉ là dữ liệu ổn định cho test UI.
  final class FakeSupabaseStore: @unchecked Sendable {
    static let shared = FakeSupabaseStore()

    private let lock = NSLock()
    private var tables: [String: [[String: JSONValue]]] = [:]
    /// Request tới `*.supabase.co` bị chặn trong chế độ test (phải luôn là 0).
    private(set) var blockedRealRequests = 0

    func reset(_ seed: [String: [[String: JSONValue]]]) {
      lock.withLock { tables = seed }
    }

    func rows(_ table: String) -> [[String: JSONValue]] {
      lock.withLock { tables[table] ?? [] }
    }

    func noteBlocked() {
      lock.withLock { blockedRealRequests += 1 }
    }

    // MARK: Trả lời một request

    struct Reply {
      var status: Int
      var body: Data
      var headers: [String: String] = ["Content-Type": "application/json"]
    }

    func handle(_ request: URLRequest, body: Data?) -> Reply {
      guard let url = request.url, let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
        return Reply(status: 400, body: Data())
      }
      let path = comps.path
      let query = comps.queryItems ?? []
      let method = request.httpMethod ?? "GET"
      let prefer = request.value(forHTTPHeaderField: "Prefer") ?? ""
      let wantsObject = (request.value(forHTTPHeaderField: "Accept") ?? "").contains("vnd.pgrst.object")
      let json = body.flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) }

      if path.hasPrefix("/rest/v1/rpc/") {
        return rpc(String(path.dropFirst("/rest/v1/rpc/".count)), json)
      }
      if path.hasPrefix("/rest/v1/") {
        let table = String(path.dropFirst("/rest/v1/".count))
        return lock.withLock {
          rest(table: table, method: method, query: query, prefer: prefer, wantsObject: wantsObject, body: json)
        }
      }
      if path.hasPrefix("/functions/v1/") {
        return function(String(path.dropFirst("/functions/v1/".count)), json)
      }
      if path.hasPrefix("/auth/v1/") {
        return auth(String(path.dropFirst("/auth/v1/".count)))
      }
      return Reply(status: 404, body: Self.encode(.object(["message": .string("not found in UI test backend")])))
    }

    // MARK: PostgREST

    private func rest(
      table: String, method: String, query: [URLQueryItem], prefer: String, wantsObject: Bool, body: JSONValue?
    ) -> Reply {
      let reserved: Set<String> = ["select", "order", "limit", "offset", "on_conflict", "columns"]
      let filters = query.filter { !reserved.contains($0.name) && !$0.name.contains(".") }
      let select = query.first { $0.name == "select" }?.value ?? "*"
      let returns = prefer.contains("return=representation")

      switch method {
      case "GET", "HEAD":
        var matched = (tables[table] ?? []).filter { row in filters.allSatisfy { Self.matches(row, $0) } }
        if let order = query.first(where: { $0.name == "order" })?.value { Self.sort(&matched, by: order) }
        let total = matched.count
        if let off = query.first(where: { $0.name == "offset" })?.value.flatMap(Int.init) {
          matched = Array(matched.dropFirst(off))
        }
        if let lim = query.first(where: { $0.name == "limit" })?.value.flatMap(Int.init) {
          matched = Array(matched.prefix(lim))
        }
        var reply = respond(table: table, rows: matched, select: select, wantsObject: wantsObject, status: 200)
        if prefer.contains("count=") {
          reply.headers["Content-Range"] = total == 0 ? "*/0" : "0-\(max(matched.count - 1, 0))/\(total)"
        }
        if method == "HEAD" { reply.body = Data() }
        return reply

      case "POST":
        let incoming: [[String: JSONValue]] =
          switch body {
          case .array(let a): a.compactMap { if case .object(let o) = $0 { o } else { nil } }
          case .object(let o): [o]
          default: []
          }
        let upsert = prefer.contains("resolution=")
        let ignore = prefer.contains("ignore-duplicates")
        let conflict = (query.first { $0.name == "on_conflict" }?.value ?? "id").split(separator: ",").map {
          String($0).trimmingCharacters(in: .whitespaces)
        }
        var written: [[String: JSONValue]] = []
        var rows = tables[table] ?? []
        for var row in incoming {
          if row["id"] == nil { row["id"] = .string(UUID().uuidString.lowercased()) }
          if row["created_at"] == nil { row["created_at"] = .string(Self.iso(Date())) }
          if upsert, let i = rows.firstIndex(where: { r in conflict.allSatisfy { r[$0] != nil && r[$0] == row[$0] } }) {
            if ignore { continue }
            var merged = rows[i]
            for (k, v) in row where k != "id" { merged[k] = v }
            rows[i] = merged
            written.append(merged)
          } else {
            rows.append(row)
            written.append(row)
          }
        }
        tables[table] = rows
        return returns
          ? respond(table: table, rows: written, select: select, wantsObject: wantsObject, status: 201)
          : Reply(status: 201, body: Data())

      case "PATCH":
        guard case .object(let patch) = body else { return Reply(status: 400, body: Data()) }
        var rows = tables[table] ?? []
        var written: [[String: JSONValue]] = []
        for i in rows.indices where filters.allSatisfy({ Self.matches(rows[i], $0) }) {
          for (k, v) in patch { rows[i][k] = v }
          written.append(rows[i])
        }
        tables[table] = rows
        return returns
          ? respond(table: table, rows: written, select: select, wantsObject: wantsObject, status: 200)
          : Reply(status: 204, body: Data())

      case "DELETE":
        let rows = tables[table] ?? []
        let gone = rows.filter { row in filters.allSatisfy { Self.matches(row, $0) } }
        tables[table] = rows.filter { row in !filters.allSatisfy { Self.matches(row, $0) } }
        return returns
          ? respond(table: table, rows: gone, select: select, wantsObject: wantsObject, status: 200)
          : Reply(status: 204, body: Data())

      default:
        return Reply(status: 405, body: Data())
      }
    }

    private func respond(
      table: String, rows: [[String: JSONValue]], select: String, wantsObject: Bool, status: Int
    ) -> Reply {
      let shaped = rows.map { project($0, table: table, select: select) }
      if wantsObject {
        guard shaped.count == 1 else {
          return Reply(
            status: 406,
            body: Self.encode(.object([
              "code": .string("PGRST116"), "message": .string("JSON object requested, multiple (or no) rows returned"),
              "details": .string("\(shaped.count) rows"), "hint": .null,
            ])))
        }
        return Reply(status: status, body: Self.encode(shaped[0]))
      }
      return Reply(status: status, body: Self.encode(.array(shaped)))
    }

    /// Hàng → cột đã chọn. Cột thường trả nguyên hàng (bộ giải mã bỏ khoá thừa);
    /// chỉ phần nhúng `bảng(cột)` được dựng thêm.
    private func project(_ row: [String: JSONValue], table: String, select: String) -> JSONValue {
      var out = row
      for item in Self.splitTop(select) {
        guard let open = item.firstIndex(of: "("), item.hasSuffix(")") else { continue }
        var name = String(item[..<open])
        var key = name
        if let colon = name.firstIndex(of: ":") {
          key = String(name[..<colon])
          name = String(name[name.index(after: colon)...])
        }
        if let bang = name.firstIndex(of: "!") { name = String(name[..<bang]) }
        if key.contains("!") { key = name }
        let inner = String(item[item.index(after: open)..<item.index(before: item.endIndex)])
        let children = tables[name] ?? []
        let parentKey = Self.singular(table) + "_id"
        if children.contains(where: { $0[parentKey] != nil }) {
          out[key] = .array(
            children.filter { $0[parentKey] == row["id"] }.map { project($0, table: name, select: inner) })
        } else if let ref = row[Self.singular(name) + "_id"] {
          out[key] = children.first { $0["id"] == ref }.map { project($0, table: name, select: inner) } ?? .null
        } else {
          out[key] = .array([])
        }
      }
      return .object(out)
    }

    // MARK: Lọc và sắp xếp

    static func matches(_ row: [String: JSONValue], _ item: URLQueryItem) -> Bool {
      guard let raw = item.value else { return true }
      if item.name == "or" || item.name == "and" {
        let inner = raw.hasPrefix("(") && raw.hasSuffix(")") ? String(raw.dropFirst().dropLast()) : raw
        let parts = splitTop(inner).map { part -> Bool in
          // `col.op.value` hoặc `and(...)` / `or(...)` lồng nhau.
          if let open = part.firstIndex(of: "("), part.hasPrefix("and(") || part.hasPrefix("or(") {
            return matches(row, URLQueryItem(name: String(part[..<open]), value: String(part[open...])))
          }
          guard let dot = part.firstIndex(of: ".") else { return false }
          return matches(row, URLQueryItem(name: String(part[..<dot]), value: String(part[part.index(after: dot)...])))
        }
        return item.name == "or" ? parts.contains(true) : parts.allSatisfy { $0 }
      }
      return test(row[item.name] ?? .null, raw)
    }

    /// `op.value` (có thể `not.op.value`) trên một giá trị của hàng.
    static func test(_ value: JSONValue, _ expr: String) -> Bool {
      if expr.hasPrefix("not.") { return !test(value, String(expr.dropFirst(4))) }
      guard let dot = expr.firstIndex(of: ".") else { return false }
      let op = String(expr[..<dot])
      let arg = String(expr[expr.index(after: dot)...])
      switch op {
      case "eq": return compare(value, arg) == .orderedSame
      case "neq": return compare(value, arg).map { $0 != .orderedSame } ?? true
      case "gt": return compare(value, arg) == .orderedDescending
      case "gte": return [.orderedDescending, .orderedSame].contains(compare(value, arg))
      case "lt": return compare(value, arg) == .orderedAscending
      case "lte": return [.orderedAscending, .orderedSame].contains(compare(value, arg))
      case "is":
        switch arg {
        case "null": return value == .null
        case "true": return value == .bool(true)
        case "false": return value == .bool(false)
        default: return false
        }
      case "in":
        let list = arg.hasPrefix("(") && arg.hasSuffix(")") ? String(arg.dropFirst().dropLast()) : arg
        return splitTop(list).map(unquote).contains { compare(value, $0) == .orderedSame }
      case "like", "ilike":
        guard let s = value.stringValue else { return false }
        let pattern = "^" + NSRegularExpression.escapedPattern(for: unquote(arg))
          .replacingOccurrences(of: "%", with: ".*").replacingOccurrences(of: "\\*", with: ".*") + "$"
        let options: NSRegularExpression.Options = op == "ilike" ? [.caseInsensitive] : []
        return (try? NSRegularExpression(pattern: pattern, options: options))
          .map { $0.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil } ?? false
      default:
        return false
      }
    }

    static func compare(_ value: JSONValue, _ arg: String) -> ComparisonResult? {
      switch value {
      case .number(let n):
        guard let a = Double(arg) else { return nil }
        return n < a ? .orderedAscending : n > a ? .orderedDescending : .orderedSame
      case .bool(let b):
        return (arg == "true") == b ? .orderedSame : .orderedAscending
      case .string(let s):
        if s.count > 10, arg.count > 10, let l = date(s), let r = date(arg) {
          return l < r ? .orderedAscending : l > r ? .orderedDescending : .orderedSame
        }
        let l = s.lowercased(), r = arg.lowercased()
        return l < r ? .orderedAscending : l > r ? .orderedDescending : .orderedSame
      default:
        return nil
      }
    }

    static func sort(_ rows: inout [[String: JSONValue]], by order: String) {
      let keys = order.split(separator: ",").map { part -> (String, Bool) in
        let bits = part.split(separator: ".")
        return (String(bits.first ?? ""), !bits.contains("desc"))
      }
      rows.sort { a, b in
        for (col, asc) in keys {
          let l = a[col] ?? .null, r = b[col] ?? .null
          if l == r { continue }
          if l == .null { return false }
          if r == .null { return true }
          let c = sortKey(l) < sortKey(r)
          return asc ? c : !c
        }
        return false
      }
    }

    private static func sortKey(_ v: JSONValue) -> String {
      switch v {
      case .number(let n): String(format: "%020.4f", n + 1e12)
      case .string(let s): date(s).map { String(format: "%020.4f", $0.timeIntervalSince1970 + 1e12) } ?? s
      case .bool(let b): b ? "1" : "0"
      default: ""
      }
    }

    // MARK: RPC, edge function, auth

    private func rpc(_ name: String, _ params: JSONValue?) -> Reply {
      let value: JSONValue =
        switch name {
        case "current_tier": .string("free")
        case "claim_quest_reward", "buy_streak_freeze": .number(10)
        case "buy_mascot_item": .number(0)
        case "dm_open": .string(UUID().uuidString.lowercased())
        case "community_user_stats": .object([:])
        default: .array([])
        }
      return Reply(status: 200, body: Self.encode(value))
    }

    private func function(_ name: String, _ body: JSONValue?) -> Reply {
      if name == EdgeFunction.Name.coach.rawValue {
        return Reply(status: 200, body: UITestSeed.coachStream, headers: ["Content-Type": "text/event-stream"])
      }
      let value: JSONValue? = UITestSeed.edgeReply(name, body: body)
      guard let value else {
        return Reply(status: 404, body: Self.encode(.object(["code": .string("NOT_FOUND")])))
      }
      return Reply(status: 200, body: Self.encode(value))
    }

    private func auth(_ path: String) -> Reply {
      if path.hasPrefix("token") || path.hasPrefix("user") {
        let now = Date()
        let user: JSONValue = .object([
          "id": .string(UITestMode.userId), "aud": .string("authenticated"), "role": .string("authenticated"),
          "email": .string(UITestMode.email), "app_metadata": .object([:]), "user_metadata": .object([:]),
          "created_at": .string(Self.iso(now)), "updated_at": .string(Self.iso(now)), "is_anonymous": .bool(false),
        ])
        if path.hasPrefix("user") { return Reply(status: 200, body: Self.encode(user)) }
        let expires = now.addingTimeInterval(30 * 86_400).timeIntervalSince1970
        return Reply(
          status: 200,
          body: Self.encode(.object([
            "access_token": .string(UITestMode.accessToken(expiresAt: expires)), "token_type": .string("bearer"),
            "expires_in": .number(30 * 86_400), "expires_at": .number(expires.rounded()),
            "refresh_token": .string("ui-test-refresh"), "user": user,
          ])))
      }
      if path.hasPrefix("health") { return Reply(status: 200, body: Self.encode(.object([:]))) }
      return Reply(status: 204, body: Data())
    }

    // MARK: Tiện ích

    static func encode(_ v: JSONValue) -> Data {
      (try? JSONEncoder().encode(v)) ?? Data("null".utf8)
    }

    /// Tách theo dấu phẩy ở tầng ngoài cùng (bỏ qua phẩy trong `(...)` và `"..."`).
    static func splitTop(_ s: String) -> [String] {
      var out: [String] = []
      var depth = 0
      var quoted = false
      var cur = ""
      for ch in s {
        if ch == "\"" { quoted.toggle() }
        if !quoted {
          if ch == "(" { depth += 1 }
          if ch == ")" { depth -= 1 }
          if ch == ",", depth == 0 {
            out.append(cur.trimmingCharacters(in: .whitespaces))
            cur = ""
            continue
          }
        }
        cur.append(ch)
      }
      if !cur.trimmingCharacters(in: .whitespaces).isEmpty { out.append(cur.trimmingCharacters(in: .whitespaces)) }
      return out
    }

    static func unquote(_ s: String) -> String {
      s.count >= 2 && s.hasPrefix("\"") && s.hasSuffix("\"") ? String(s.dropFirst().dropLast()) : s
    }

    static func singular(_ table: String) -> String {
      if table.hasSuffix("ies") { return String(table.dropLast(3)) + "y" }
      if table.hasSuffix("s") { return String(table.dropLast()) }
      return table
    }

    static func iso(_ d: Date) -> String {
      let f = ISO8601DateFormatter()
      f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      return f.string(from: d)
    }

    static func date(_ s: String) -> Date? {
      let f = ISO8601DateFormatter()
      f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      if let d = f.date(from: s) { return d }
      f.formatOptions = [.withInternetDateTime]
      if let d = f.date(from: s) { return d }
      // `2026-10-26 08:00:00+00` của Postgres.
      return f.date(from: s.replacingOccurrences(of: " ", with: "T"))
    }
  }

  /// Chặn và trả lời request trong chế độ UI test. Gắn vào `URLSession` của client
  /// Supabase giả, và đăng ký chung (`URLProtocol.registerClass`) để cả request đi
  /// thẳng qua `URLSession.shared` (luồng chat Coach) cũng không ra mạng.
  final class FakeSupabaseProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool {
      guard let host = request.url?.host else { return false }
      return host == UITestMode.host || host.hasSuffix(".supabase.co") || host.hasSuffix(".supabase.in")
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
      guard let url = request.url, let client else { return }
      // Lưới an toàn: chế độ test không bao giờ được nói chuyện với Supabase thật.
      if url.host != UITestMode.host {
        FakeSupabaseStore.shared.noteBlocked()
        NSLog("[UITest] BLOCKED real Supabase request: %@", url.absoluteString)
        client.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
        return
      }
      let reply = FakeSupabaseStore.shared.handle(request, body: Self.body(of: request))
      guard
        let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)
      else { return }
      client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      if !reply.body.isEmpty { client.urlProtocol(self, didLoad: reply.body) }
      client.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// `URLSession` chuyển thân request thành luồng trước khi tới `URLProtocol`.
    private static func body(of request: URLRequest) -> Data? {
      if let data = request.httpBody { return data }
      guard let stream = request.httpBodyStream else { return nil }
      stream.open()
      defer { stream.close() }
      var data = Data()
      var buffer = [UInt8](repeating: 0, count: 16_384)
      while stream.hasBytesAvailable {
        let n = stream.read(&buffer, maxLength: buffer.count)
        if n <= 0 { break }
        data.append(buffer, count: n)
      }
      return data
    }
  }
#endif
