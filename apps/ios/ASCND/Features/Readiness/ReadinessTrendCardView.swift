import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ xu hướng sẵn sàng 7 ngày (#527) — `ReadinessTrendCard` của
/// `today-widgets.tsx` @ fac9ac2 trên `ReadinessTrendBook`.
///
/// Như RN: ẩn khi chưa đủ 2 ngày (hoặc chưa đọc được); mỗi ngày một hàng
/// "thứ · thanh · số", thanh tô màu ĐỒ HOẠ của vùng, số tô màu CHỮ của vùng
/// (vàng tách hai vai — `readinessYellowGraphic`); TB / cao nhất / thấp nhất;
/// chú giải ba vùng bằng chấm.
///
/// Khác RN: chữ TB / cao nhất / chú giải theo đủ ba ngôn ngữ (RN chỉ vi / en);
/// thanh hiện ngay, không trễ dần từng hàng.
struct ReadinessTrendCardView: View {
  let book: ReadinessTrendBook

  var body: some View {
    if let points = book.points, let stats = book.stats {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "rt.title"))
              .font(DS.TextStyle.headline)
              .accessibilityAddTraits(.isHeader)
            Text(String(localized: "rt.hint"))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          VStack(spacing: 6) {
            ForEach(points, id: \.date) { p in row(p) }
          }
          HStack {
            stat(String(localized: "rt.avg"), stats.average)
            stat(String(localized: "rt.max"), stats.max)
            stat(String(localized: "rt.min"), stats.min)
          }
          legend
        }
      }
    }
  }

  private func row(_ p: ReadinessTrend.Point) -> some View {
    let zone = ReadinessTrend.zone(p.value)
    let day = p.date.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
    return HStack(spacing: DS.Spacing.sm) {
      Text(verbatim: day)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(width: 40, alignment: .leading)
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(DS.Color.ringTrack.swiftUI)
          Capsule()
            .fill(Self.graphic(zone))
            .frame(width: geo.size.width * Swift.min(Swift.max(p.value / 100, 0), 1))
        }
      }
      .frame(height: 8)
      Text(verbatim: Self.text(p.value.rounded()))
        .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(Self.ink(zone))
        .frame(width: 32, alignment: .trailing)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: p.date.calendarDate.formatted(
      Date.FormatStyle().weekday(.wide).day().month(.wide).locale(.app))))
    .accessibilityValue(Text(verbatim: "\(Self.text(p.value.rounded())), \(Self.zoneLabel(zone))"))
  }

  private func stat(_ label: String, _ value: Double) -> some View {
    VStack(spacing: 2) {
      Text(label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(verbatim: Self.text(value))
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(Self.ink(ReadinessTrend.zone(value)))
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }

  private var legend: some View {
    HStack(spacing: DS.Spacing.sm) {
      ForEach(ReadinessTrend.Zone.allCases, id: \.self) { z in
        HStack(spacing: 4) {
          Circle().fill(Self.graphic(z)).frame(width: 8, height: 8).accessibilityHidden(true)
          Text(Self.zoneLabel(z))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
      }
    }
  }

  /// Màu chữ của vùng (`readinessZone`).
  static func ink(_ z: ReadinessTrend.Zone) -> Color {
    switch z {
    case .train: DS.Color.readinessGreen.swiftUI
    case .moderate: DS.Color.readinessYellow.swiftUI
    case .recover: DS.Color.readinessRed.swiftUI
    }
  }

  /// Màu hình của vùng (`readinessZoneGraphic`) — chỉ vàng khác.
  static func graphic(_ z: ReadinessTrend.Zone) -> Color {
    switch z {
    case .train: DS.Color.readinessGreen.swiftUI
    case .moderate: DS.Color.readinessYellowGraphic.swiftUI
    case .recover: DS.Color.readinessRed.swiftUI
    }
  }

  static func zoneLabel(_ z: ReadinessTrend.Zone) -> String {
    switch z {
    case .train: String(localized: "rt.zone.train")
    case .moderate: String(localized: "rt.zone.moderate")
    case .recover: String(localized: "rt.zone.recover")
    }
  }

  /// `${n}` của JS.
  static func text(_ v: Double) -> String { v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : String(v) }
}
