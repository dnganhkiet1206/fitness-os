import ASCNDCore
import Foundation
import Testing

/// Golden nước uống (#527 Phase 3): `Fixtures/water-golden.json` là output của
/// CHÍNH `units.ts`, `water-scale.ts`, `water-presets.ts` của RN và các biểu
/// thức hiển thị của `water.tsx` / `water-chart.tsx` trên hàm RN thật
/// (`apps/ios/tools/water-golden/gen.mjs`; bước cổng `verify.sh` sinh lại và so
/// từng byte). Expected KHÔNG sửa tay cho xanh.
struct WaterGoldenTests {
  struct Golden: Decodable {
    struct Volume: Decodable { let ml: Double; let unit: String; let out: Double }
    struct ToMl: Decodable { let value: Double; let unit: String; let out: Int }
    struct Scale: Decodable { let needMl: Double; let unit: String; let ml: Int; let display: Double }
    struct Axis: Decodable { let value: Double; let unit: String; let out: String }
    struct Screen: Decodable {
      let ml: Int
      let unit: String
      let bigValue: String
      let targetLabel: String
      let chartVolume: String
      let entry: String
    }
    struct Average: Decodable { let totals: [Int]; let unit: String; let out: String }
    let presets: [String: [Int]]
    let displayVolume: [Volume]
    let volumeToMl: [ToMl]
    let scaleTop: [Scale]
    let axisLabel: [Axis]
    let screen: [Screen]
    let average: [Average]
  }

  static let golden: Golden = {
    let url = Bundle.module.url(forResource: "water-golden", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSONDecoder().decode(Golden.self, from: Data(contentsOf: url))
  }()

  private func unit(_ s: String) -> Water.Unit { s == "oz" ? .oz : .ml }

  @Test func presetsAreTheRNSets() {
    #expect(Water.quickAmounts(.ml) == Self.golden.presets["ml"])
    #expect(Water.quickAmounts(.oz) == Self.golden.presets["oz"])
  }

  @Test func displayVolumeMatchesRN() {
    for c in Self.golden.displayVolume {
      #expect(Water.displayVolume(c.ml, unit(c.unit)) == c.out, "\(c.ml) \(c.unit)")
    }
  }

  @Test func volumeToMlMatchesRN() {
    for c in Self.golden.volumeToMl {
      #expect(Water.toMl(c.value, unit(c.unit)) == c.out, "\(c.value) \(c.unit)")
    }
  }

  @Test func scaleTopMatchesRN() {
    for c in Self.golden.scaleTop {
      let top = Water.scaleTop(needMl: c.needMl, unit(c.unit))
      #expect(top.ml == c.ml && top.display == c.display, "\(c.needMl) \(c.unit)")
    }
  }

  @Test func axisLabelMatchesRN() {
    for c in Self.golden.axisLabel {
      #expect(Water.axisLabel(c.value, unit(c.unit)) == c.out, "\(c.value) \(c.unit)")
    }
  }

  /// Gồm ca hai bên cách đều: 1125 ml → "1.13L" (JS `toFixed`), không "1.12L".
  @Test func screenStringsMatchRN() {
    for c in Self.golden.screen {
      let u = unit(c.unit)
      #expect(Water.bigValue(totalMl: c.ml, u) == c.bigValue, "\(c.ml) \(c.unit)")
      #expect(Water.targetLabel(Double(c.ml), u) == c.targetLabel, "\(c.ml) \(c.unit)")
      #expect(Water.chartVolume(Double(c.ml), u) == c.chartVolume, "\(c.ml) \(c.unit)")
      #expect(Water.entryAmount(c.ml, u) == c.entry, "\(c.ml) \(c.unit)")
    }
  }

  @Test func weeklyAverageMatchesRN() {
    let start = LocalDate("2026-10-02")!
    for c in Self.golden.average {
      let days = c.totals.enumerated().map { WaterDay(date: start.adding(days: $0.offset), totalMl: $0.element) }
      #expect(Water.averageLabel(days, unit(c.unit)) == c.out, "\(c.totals) \(c.unit)")
    }
  }
}

/// Các luật nhỏ của màn đọc thẳng từ nguồn RN.
struct WaterRuleTests {
  /// `Number(profile?.water_target_ml) || 2500`.
  @Test func targetFallsBackTo2500() {
    #expect(Water.target(nil) == 2500)
    #expect(Water.target(0) == 2500)
    #expect(Water.target(.nan) == 2500)
    #expect(Water.target(2700) == 2700)
  }

  /// `Math.min(100, …)` và `Math.round(pct)`.
  @Test func percentIsCappedAndRoundedHalfUp() {
    #expect(Water.percent(totalMl: 5000, targetMl: 2500) == 100)
    #expect(Water.percentLabel(Water.percent(totalMl: 1250, targetMl: 2500)) == "50%")
    #expect(Water.percentLabel(Water.percent(totalMl: 25, targetMl: 2000)) == "1%")  // 1.25 → 1
    #expect(Water.percentLabel(Water.percent(totalMl: 30, targetMl: 2000)) == "2%")  // 1.5 → 2
  }

  /// Ô nhập tay: lọc ký tự, phẩy ĐẦU thành chấm, rỗng là 0, hai dấu là NaN.
  @Test func manualTextParsesLikeNumber() {
    #expect(Water.sanitize("3a3 0ml") == "330")
    #expect(Water.sanitize("1234567") == "123456")
    #expect(Water.parse("1,5") == 1.5)
    #expect(Water.parse("5.") == 5)
    #expect(Water.parse(".5") == 0.5)
    #expect(Water.parse("") == 0)
    #expect(Water.parse(".") == nil)
    #expect(Water.parse("1,5,5") == nil)
    #expect(Water.parse("1..2") == nil)
  }

  /// Quá rào thì nói và không lưu; đúng rào thì lưu được; 0 / rỗng không lưu.
  @Test func manualCeilingRefusesWithoutClamping() {
    #expect(Water.check("2000", .ml) == Water.ManualCheck(amount: 2000, valid: true, tooMuch: false))
    #expect(Water.check("2001", .ml) == Water.ManualCheck(amount: 2001, valid: false, tooMuch: true))
    #expect(Water.check("68", .oz).valid && !Water.check("68.1", .oz).valid && Water.check("68.1", .oz).tooMuch)
    #expect(!Water.check("", .ml).valid && !Water.check("", .ml).tooMuch)
    #expect(!Water.check("0", .ml).valid)
    #expect(Water.limitLabel(.ml) == "2000 ml" && Water.limitLabel(.oz) == "68 oz")
  }

  /// `useWaterWeek`: đúng 7 ngày cũ → mới, ngày trống là 0, ngoài khung bỏ.
  @Test func weekIsSevenDaysOldestFirst() {
    let today = LocalDate("2026-10-08")!
    let week = Water.week(
      [
        WaterRow(id: "a", date: today, amountMl: 250), WaterRow(id: "b", date: today, amountMl: 500),
        WaterRow(id: "c", date: today.adding(days: -6), amountMl: 300),
        WaterRow(id: "d", date: today.adding(days: -7), amountMl: 999),
      ], today: today)
    #expect(week.map(\.date) == (0...6).map { today.adding(days: $0 - 6) })
    #expect(week.map(\.totalMl) == [300, 0, 0, 0, 0, 0, 750])
  }

  /// `newestFirst`: `logged_at` ↓, rồi `created_at` ↓, rồi `id` ↓ (#134).
  @Test func newestFirstBreaksTiesDeterministically() {
    let t = EpochMillis(1_000)
    let logs = [
      WaterLog(id: "a", amountMl: 1, loggedAt: t, createdAt: EpochMillis(5)),
      WaterLog(id: "c", amountMl: 1, loggedAt: t, createdAt: EpochMillis(5)),
      WaterLog(id: "b", amountMl: 1, loggedAt: t, createdAt: EpochMillis(9)),
      WaterLog(id: "z", amountMl: 1, loggedAt: EpochMillis(999), createdAt: EpochMillis(99)),
    ]
    #expect(Water.newestFirst(logs).map(\.id) == ["b", "c", "a", "z"])
  }

  /// Hàng outbox mang đúng hàng mà `applyOfflineWrite` upsert.
  @Test func outboxRowIsTheRNUpsert() throws {
    let at = try #require(EpochMillis(iso8601: "2026-10-08T07:30:00.000Z"))
    let e = Water.entry(id: "ABC", userId: "u1", amountMl: 330, date: LocalDate("2026-10-08")!, at: at, createdAt: at)
    #expect(e.id == "abc" && e.kind == "water" && e.userId == "u1")
    #expect(e.payload == .object([
      "id": .string("abc"), "user_id": .string("u1"), "amount_ml": .number(330), "date": .string("2026-10-08"),
      "logged_at": .string("2026-10-08T07:30:00.000Z"),
    ]))
    let back = try #require(Water.pendingLog(e))
    #expect(back.log == WaterLog(id: "abc", amountMl: 330, loggedAt: at, createdAt: nil, pending: true))
    #expect(back.row == WaterRow(id: "abc", date: LocalDate("2026-10-08")!, amountMl: 330))
  }
}
