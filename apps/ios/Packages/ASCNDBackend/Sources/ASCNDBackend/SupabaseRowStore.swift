public import ASCNDCore
import Foundation
import Supabase

/// `RowStore` thật: thực thi một `RowQuery` của Core trên PostgREST. Core
/// quyết đọc GÌ (bảng, cột, cửa sổ — khoá bằng golden RN); ở đây chỉ dịch
/// sang supabase-swift.
public struct SupabaseRowStore: RowStore {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    do {
      var filtered = client.from(q.table).select(q.columns)
      for f in q.filters { filtered = Self.apply(f, filtered) }
      var t: PostgrestTransformBuilder = filtered
      if let o = q.order { t = t.order(o.column, ascending: o.ascending) }
      if let l = q.limit { t = t.limit(l) }
      let rows: [JSONValue] = try await t.execute().value
      switch q.mode {
      case .many: return rows
      case .maybeSingle: return Array(rows.prefix(1))
      case .single:
        // `.single()` của PostgREST: không đúng một hàng là lỗi `PGRST116`.
        guard rows.count == 1 else { throw RowStoreError(code: "PGRST116", message: "\(rows.count) rows") }
        return rows
      }
    } catch {
      throw Self.wrap(error)
    }
  }

  public func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
    do {
      try await client.from(table).insert(row).execute()
    } catch {
      throw Self.wrap(error)
    }
  }

  public func update(
    _ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]
  ) async throws(RowStoreError) -> Int {
    do {
      var q = try client.from(table).update(row)
      for f in filters { q = Self.apply(f, q) }
      let touched: [JSONValue] = try await q.select("id").execute().value
      return touched.count
    } catch {
      throw Self.wrap(error)
    }
  }

  static func apply(_ f: RowQuery.Filter, _ q: PostgrestFilterBuilder) -> PostgrestFilterBuilder {
    switch f {
    case .eq(let c, let v): q.eq(c, value: value(v))
    case .gte(let c, let v): q.gte(c, value: value(v))
    case .lt(let c, let v): q.lt(c, value: value(v))
    }
  }

  /// Giá trị bộ lọc như PostgREST nhận trên URL (`taken=eq.true`).
  static func value(_ v: JSONValue) -> String {
    switch v {
    case .string(let s): s
    case .bool(let b): b ? "true" : "false"
    case .number(let n): n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
    case .null: "null"
    case .array, .object: ""
    }
  }

  static func wrap(_ error: any Error) -> RowStoreError {
    if let e = error as? RowStoreError { return e }
    if let e = error as? PostgrestError { return RowStoreError(code: e.code, message: e.message) }
    return RowStoreError(code: nil, message: "\(error)")
  }
}
