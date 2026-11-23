@testable import ASCNDCore
import Foundation
import Testing

/// Thời tiết ngoài cửa sổ phòng Koa (Kiệt chọn A 23/11: theo mùa + cố định theo ngày).
struct KoaWeatherTests {
  /// Mọi ngày trong `years` năm của một tháng.
  static func days(month: Int, years: ClosedRange<Int> = 2000...2099) -> [(Int, Int, Int)] {
    years.flatMap { y in (1...28).map { (y, month, $0) } }
  }

  @Test func sameDayAlwaysSameWeather() {
    for (y, m, d) in Self.days(month: 7, years: 2026...2027) {
      let a = KoaWeather.of(year: y, month: m, day: d)
      #expect(KoaWeather.of(year: y, month: m, day: d) == a)
    }
    // lấy từ Date trong cùng ngày, sáng hay tối, đều ra một kiểu
    var cal = Foundation.Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let morning = cal.date(from: DateComponents(year: 2026, month: 11, day: 23, hour: 6))!
    let night = cal.date(from: DateComponents(year: 2026, month: 11, day: 23, hour: 23))!
    #expect(KoaWeather.of(morning, calendar: cal) == KoaWeather.of(night, calendar: cal))
    #expect(KoaWeather.of(morning, calendar: cal) == KoaWeather.of(year: 2026, month: 11, day: 23))
  }

  @Test func weatherChangesFromDayToDay() {
    let week = (1...14).map { KoaWeather.of(year: 2026, month: 4, day: $0) }
    #expect(Set(week).count >= 2)
  }

  @Test func oddsSumToOne() {
    for s in [KoaWeather.Season.winter, .spring, .summer, .autumn] {
      #expect(abs(KoaWeather.odds(s).map(\.1).reduce(0, +) - 1) < 1e-9)
    }
  }

  @Test func seasonsFollowTheTable() {
    for (month, season) in [(1, KoaWeather.Season.winter), (4, .spring), (7, .summer), (10, .autumn)] {
      let all = Self.days(month: month).map { KoaWeather.of(year: $0.0, month: $0.1, day: $0.2) }
      for (w, p) in KoaWeather.odds(season) {
        let share = Double(all.filter { $0 == w }.count) / Double(all.count)
        #expect(abs(share - p) < 0.04, "\(month) \(w.rawValue) \(share) vs \(p)")
      }
    }
  }

  @Test func summerHasNoFogAndCityNeverSnows() {
    for month in 1...12 {
      for (y, m, d) in Self.days(month: month, years: 2020...2040) {
        let city = KoaWeather.of(year: y, month: m, day: d)
        #expect(city != .snow)
        #expect(KoaWeather.of(year: y, month: m, day: d, window: "ocean") != .snow)
        if KoaWeather.season(month: m) == .summer { #expect(city != .fog) }
      }
    }
  }

  @Test func snowOnlyOnTheMountainInWinter() {
    var snowed = false
    for month in 1...12 {
      for (y, m, d) in Self.days(month: month, years: 2020...2040) {
        let mountain = KoaWeather.of(year: y, month: m, day: d, window: "mountain")
        if KoaWeather.season(month: m) == .winter {
          // mưa mùa đông trên núi thành tuyết, các kiểu khác giữ nguyên
          let city = KoaWeather.of(year: y, month: m, day: d)
          #expect(mountain == (city == .rain ? .snow : city))
          snowed = snowed || mountain == .snow
        } else {
          #expect(mountain != .snow)
        }
      }
    }
    #expect(snowed)
  }

  @Test func badWeatherIsGreyerAndCloudier() {
    #expect(KoaWeather.clear.overcast == 0)
    for w in [KoaWeather.cloudy, .rain, .fog, .snow] { #expect(w.overcast > 0) }
    #expect(KoaWeather.rain.cloudLayers > KoaWeather.clear.cloudLayers)
    #expect(KoaWeather.fog.cloudLayers == 0)
    #expect(KoaWeather.rain.denseClouds && !KoaWeather.clear.denseClouds)
  }

  /// Lịch của máy không phải Gregory (Hồi giáo, Phật lịch) vẫn ra cùng kiểu trời như lịch Gregory (Devin #1005).
  @Test func otherCalendarsGiveTheSameWeather() {
    let tz = TimeZone(identifier: "UTC")!
    var greg = Foundation.Calendar(identifier: .gregorian)
    greg.timeZone = tz
    for id in [Foundation.Calendar.Identifier.islamicCivil, .buddhist, .japanese, .hebrew] {
      var other = Foundation.Calendar(identifier: id)
      other.timeZone = tz
      for day in stride(from: 0, to: 400, by: 7) {
        let d = Date(timeIntervalSince1970: 1_783_814_400 + Double(day) * 86_400)  // từ 12/07/2026
        for w in [nil, "mountain"] {
          #expect(KoaWeather.of(d, calendar: other, window: w) == KoaWeather.of(d, calendar: greg, window: w), "\(id) \(day)")
        }
      }
    }
  }

  /// Quãng trôi = tích phân của vận tốc gió: giữa hai khung (1/30 s) ở thời điểm thật (~8·10⁸ s kể từ 2001)
  /// hạt chỉ dịch đúng vận tốc × khung, không nhảy (Devin #1005).
  @Test func windDriftIsTheIntegralOfWindSpeed() {
    let dt = 1.0 / 30
    for t in [0.0, 12, 1_000, 817_105_792, 817_105_792.5] {
      let rain = (KoaWeather.Wind.rainDrift(t + dt) - KoaWeather.Wind.rainDrift(t)) / dt
      #expect(abs(rain - KoaWeather.Wind.rainGust(t + dt / 2)) < 1e-3, "mưa t=\(t)")
      let snow = (KoaWeather.Wind.snowDrift(t + dt) - KoaWeather.Wind.snowDrift(t)) / dt
      #expect(abs(snow - KoaWeather.Wind.snowWind(t + dt / 2)) < 1e-3, "tuyết t=\(t)")
      // lớp mưa gần nhất (rơi 280 điểm/s, sp ≤ 1,15): mỗi khung dịch ngang < 3 điểm
      #expect(abs(rain * 280 * 1.15 * dt) < 3)
    }
  }
}
