@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T41: giá và luật kinh tế nằm HAI chỗ — hằng Swift (hiện trên màn) và bảng `reward_prices` /
/// `shop_prices` nạp bằng migration (server trả thật). Test này đọc thẳng `supabase/migrations/` theo thứ tự
/// tên tệp, áp mọi lệnh `INSERT … ON CONFLICT DO UPDATE` (lần sau thắng), rồi so với Swift. Sửa một bên mà
/// quên bên kia → đỏ ở đây (trước đây chỉ có bộ kiểm cho RN, không có cho Swift).
struct EconomyContractTests {
  static var migrations: URL {
    // …/apps/ios/Packages/ASCNDKit/Tests/ASCNDCoreTests/<tệp> → gốc repo
    URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("../../../../../../supabase/migrations").standardized
  }

  /// Bảng giá cuối cùng sau mọi migration: `table` là `reward_prices` hay `shop_prices`.
  static func finalPrices(_ table: String) throws -> [String: Int] {
    let files = try FileManager.default.contentsOfDirectory(at: migrations, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "sql" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    var out: [String: Int] = [:]
    let row = try NSRegularExpression(pattern: #"\(\s*'([^']+)'\s*,\s*(-?\d+)\s*\)"#)
    for url in files {
      let sql = try String(contentsOf: url, encoding: .utf8)
      var rest = sql[...]
      while let r = rest.range(of: "INSERT INTO public.\(table)") {
        let tail = rest[r.upperBound...]
        let end = tail.range(of: ";")?.lowerBound ?? tail.endIndex
        let stmt = String(tail[..<end])
        let ns = stmt as NSString
        for m in row.matches(in: stmt, range: NSRange(location: 0, length: ns.length)) {
          out[ns.substring(with: m.range(at: 1))] = Int(ns.substring(with: m.range(at: 2)))
        }
        rest = tail[end...]
      }
    }
    return out
  }

  @Test func rewardPricesMatchSwift() throws {
    let p = try Self.finalPrices("reward_prices")
    #expect(p.count > 20, "không đọc được reward_prices từ \(Self.migrations.path)")
    for q in MascotRules.dailyQuests {
      #expect(p["quest:\(q.key.rawValue)"] == q.coins, "nhiệm vụ \(q.key): Swift \(q.coins), SQL \(p["quest:\(q.key.rawValue)"] ?? -1)")
    }
    #expect(p["streak:max"] == MascotRules.streakPayout)
    for (tier, r) in MascotRules.challengeReward {
      #expect(p["challenge:\(tier)"] == r.coins, "thử thách \(tier)")
    }
    for x in ExploreQuest.allCases {
      #expect(p["explore:\(x.rawValue)"] == x.coins, "khám phá \(x)")
    }
    #expect(p["quest:overload"] == OverloadQuest.coins)
    for c in MascotShop.collections {
      #expect(p["set:\(c.id)"] == c.rewardCoins, "bộ sưu tập \(c.id)")
    }
  }

  @Test func shopPricesMatchSwift() throws {
    let p = try Self.finalPrices("shop_prices")
    #expect(p.count > 30, "không đọc được shop_prices")
    for item in MascotShop.items {
      #expect(p[item.key] == item.price, "\(item.key): Swift \(item.price), SQL \(p[item.key].map(String.init) ?? "không có")")
    }
  }
}
