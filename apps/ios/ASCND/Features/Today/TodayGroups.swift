import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Các nhóm dưới thẻ việc của tab Hôm nay (#527, E, lát T3) — `GroupHeader` +
// các widget của `today-widgets*.tsx` / `dashboard-cards.tsx` @ fac9ac2.

/// Thẻ kính bản sáng của RN (`GlassCard`): nền thẻ, viền mực 8%, bo 20, đệm
/// 20, bóng rất nhẹ.
struct TodayCard<Content: View>: View {
  var padding: CGFloat = DS.Spacing.card
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) { content() }
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
      .overlay(RoundedRectangle(cornerRadius: DS.Radius.lg).stroke(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 1))
      .shadow(color: DS.Color.foreground.swiftUI.opacity(0.05), radius: 7, y: 1)
  }
}

/// Tiêu đề thẻ nhỏ (`MicroTitle`): 12 đậm vừa, chữ hoa, giãn 2,4, mờ.
struct TodayMicroTitle: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 12, weight: .semibold))
      .textCase(.uppercase)
      .tracking(2.4)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }
}

/// Đầu nhóm (`GroupHeader`): huy hiệu tròn 22 tô màu nhóm 12% + biểu tượng
/// 13, tên 14 đậm vừa màu chữ 80%.
struct TodayGroupHeader: View {
  let title: String
  let symbol: String
  let tint: Color

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: symbol)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 22, height: 22)
        .background(tint.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      Text(title)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.8))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 4)
    .accessibilityAddTraits(.isHeader)
  }
}

/// Bước chân (`StepsWidget`): ô biểu tượng 40, "Bước", "8.432 / 10.000", phần
/// trăm, thanh 4 điểm. Mục tiêu từ cùng nơi với nhiệm vụ bước.
struct TodayStepsCard: View {
  let steps: Int
  let goal: Int

  var body: some View {
    let pct = goal > 0 ? min(100, Int((Double(steps) / Double(goal) * 100).rounded())) : 0
    let fmt = { (n: Int) in n.formatted(.number.locale(.app)) }
    TodayCard(padding: DS.Spacing.md) {
      HStack(spacing: 12) {
        Image(systemName: "shoeprints.fill")
          .font(.system(size: 18))
          .foregroundStyle(DS.Color.primary.swiftUI)
          .frame(width: 40, height: 40)
          .background(DS.Color.primary.swiftUI.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "mr.signal.steps"))
            .font(.system(size: 12))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: "\(fmt(steps)) / \(fmt(goal))")
            .font(.system(size: 14, weight: .semibold).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        Spacer(minLength: 0)
        Text(verbatim: "\(pct)%")
          .font(.system(size: 18, weight: .bold).monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
      }
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(DS.Color.ringTrack.swiftUI)
          Capsule().fill(DS.Color.primary.swiftUI).frame(width: g.size.width * Double(pct) / 100)
        }
      }
      .frame(height: 4)
      .padding(.top, -4)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "mr.signal.steps")))
    .accessibilityValue(Text(verbatim: "\(fmt(steps)) / \(fmt(goal)), \(pct)%"))
  }
}

/// Sinh trắc hôm nay (`BiometricsCard`): nguồn + giờ, lưới 2×2 các chỉ số có
/// số, hàng VO₂max nếu có. Không có số nào thì nơi gọi không vẽ thẻ.
struct TodayBiometricsCard: View {
  let sample: Biometrics.Sample

  /// Có ít nhất một chỉ số để vẽ (`BiometricsCard` ẩn khi cả năm đều trống).
  static func shows(_ s: Biometrics.Sample) -> Bool {
    [s.hr, s.hrvSdnn ?? s.hrvRmssd, s.spo2, s.resp, s.vo2max].contains { $0 != nil }
  }

  private struct Tile: Identifiable {
    let id: String
    let value: Double
    let unit: String
    let label: String
    let symbol: String
    let tint: Color
  }

  private var tiles: [Tile] {
    var t: [Tile] = []
    if let v = sample.hr {
      t.append(Tile(id: "hr", value: v, unit: "bpm", label: String(localized: "bio.hr"), symbol: "heart", tint: DS.Color.readinessRed.swiftUI))
    }
    if let v = sample.hrvSdnn {
      t.append(Tile(id: "hrv", value: v, unit: "ms", label: String(localized: "today.bio.hrvSdnn"), symbol: "waveform.path.ecg", tint: DS.Color.metricPurple.swiftUI))
    } else if let v = sample.hrvRmssd {
      t.append(Tile(id: "hrv", value: v, unit: "ms", label: String(localized: "today.bio.hrv"), symbol: "waveform.path.ecg", tint: DS.Color.metricPurple.swiftUI))
    }
    if let v = sample.spo2 {
      t.append(Tile(id: "spo2", value: v, unit: "%", label: String(localized: "today.bio.spo2"), symbol: "drop", tint: DS.Color.metricBlue.swiftUI))
    }
    if let v = sample.resp {
      t.append(Tile(id: "resp", value: v, unit: String(localized: "bio.resp.unit"), label: String(localized: "bio.resp"), symbol: "lungs", tint: DS.Color.metricBlue.swiftUI))
    }
    return t
  }

  private var source: String? {
    let s = sample.source.trimmingCharacters(in: .whitespaces)
    guard !s.isEmpty, s != "manual" else { return nil }
    return s.replacingOccurrences(of: "_", with: " ").capitalized
  }

  var body: some View {
    TodayCard {
      HStack {
        TodayMicroTitle(text: String(localized: "today.bio.title"))
        Spacer()
        HStack(spacing: 5) {
          Image(systemName: source == nil ? "wifi.slash" : "wifi")
            .font(.system(size: 11))
            .foregroundStyle(source == nil ? DS.Color.readinessRed.swiftUI : DS.Color.readinessGreen.swiftUI)
          Text(verbatim: source.map { "\($0) · \(Self.time(sample.at))" } ?? String(localized: "today.bio.notConnected"))
            .font(.system(size: 11))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
        ForEach(tiles) { tile in
          HStack(alignment: .top, spacing: 10) {
            Image(systemName: tile.symbol)
              .font(.system(size: 17))
              .foregroundStyle(tile.tint)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: Self.num(tile.value))
                  .font(.custom("Menlo", size: 19).weight(.bold).monospacedDigit())
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(verbatim: tile.unit).font(.system(size: 11)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              Text(verbatim: tile.label)
                .font(.system(size: 11))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(2)
            }
            Spacer(minLength: 0)
          }
          .padding(14)
          .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: 12))
          .overlay(RoundedRectangle(cornerRadius: 12).stroke(DS.Color.border.swiftUI, lineWidth: 0.5))
          .accessibilityElement(children: .combine)
        }
      }
      if let vo2 = sample.vo2max {
        HStack(spacing: 10) {
          Image(systemName: "figure.run").font(.system(size: 17)).foregroundStyle(DS.Color.readinessGreen.swiftUI)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
              Text(verbatim: Self.num(vo2))
                .font(.custom("Menlo", size: 19).weight(.bold).monospacedDigit())
              Text(String(localized: "today.bio.vo2.unit")).font(.system(size: 11)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            Text(String(localized: "today.bio.vo2")).font(.system(size: 11)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          Text(String(localized: "today.bio.fitness"))
            .font(.system(size: 11))
            .tracking(1.4)
            .textCase(.uppercase)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .padding(.top, 14)
        .padding(.horizontal, 14)
        .overlay(alignment: .top) { Rectangle().fill(DS.Color.border.swiftUI.opacity(0.55)).frame(height: 0.5) }
        .accessibilityElement(children: .combine)
      }
    }
  }

  /// Một chữ số lẻ, bỏ ".0" (`Math.round(v * 10) / 10`).
  static func num(_ v: Double) -> String {
    ((v * 10).rounded() / 10).formatted(.number.precision(.fractionLength(0...1)).locale(.app))
  }

  static func time(_ at: EpochMillis) -> String {
    Date(timeIntervalSince1970: Double(at.millis) / 1000).formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(.app))
  }
}

/// Cân nặng (`WeightCheckinCard`, phần đầu): số lớn Menlo 28 + đơn vị, "—" khi
/// chưa có. Chưa có: lịch sử ba lần cân trước, viên chênh lệch theo BMI.
struct TodayWeightCard: View {
  let value: String?
  let unit: String

  var body: some View {
    TodayCard {
      TodayMicroTitle(text: String(localized: "today.weight.title"))
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(verbatim: value ?? "—")
          .font(.custom("Menlo", size: 28).weight(.bold).monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if value != nil {
          Text(verbatim: unit).font(DS.TextStyle.body).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .padding(.top, -DS.Spacing.sm)
    }
    .accessibilityElement(children: .combine)
  }
}
