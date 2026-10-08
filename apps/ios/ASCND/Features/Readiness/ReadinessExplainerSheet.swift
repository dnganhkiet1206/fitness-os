import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tấm giải thích điểm sẵn sàng (#527) — `readiness-explainer.tsx` @ fac9ac2.
///
/// Thẻ chỉ hiện một con số, một màu và tới năm ô HRV / RHR / SLEEP / LOAD /
/// ACWR — toàn thuật ngữ. Tấm này nói mỗi nguồn là gì, nặng bao nhiêu, cái gì
/// KHÔNG tính, vì sao buổi tập đầu luôn ra 80, và rằng đây không phải chẩn đoán.
///
/// Các băng ACWR ĐỌC từ `ReadinessCard.AcwrZone` (cùng bảng thẻ tập luyện vẽ
/// theo, đủ năm băng theo thứ tự thang), không gõ lại. Trọng số là của
/// `ReadinessEngine` (30/20/30/20, không có HRV thì 25/45/30).
struct ReadinessExplainerSheet: View {
  @Environment(\.dismiss) private var dismiss

  private struct Part: Identifiable {
    let tag: String
    let title: String
    let weight: String
    let body: String
    var id: String { tag }
  }

  private var parts: [Part] {
    [
      Part(
        tag: "HRV", title: String(localized: "rx.hrv.title"), weight: "30%", body: String(localized: "rx.hrv.body")),
      Part(
        tag: "RHR", title: String(localized: "rx.rhr.title"), weight: String(localized: "rx.rhr.weight"),
        body: String(localized: "rx.rhr.body")),
      Part(
        tag: "SLEEP", title: String(localized: "rx.sleep.title"), weight: String(localized: "rx.sleep.weight"),
        body: String(localized: "rx.sleep.body")),
      Part(
        tag: "LOAD", title: String(localized: "rx.load.title"), weight: String(localized: "rx.load.weight"),
        body: String(localized: "rx.load.body")),
    ]
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.lg) {
          Text(String(localized: "rx.lede")).font(DS.TextStyle.body)

          ForEach(parts) { p in
            VStack(alignment: .leading, spacing: 6) {
              HStack(spacing: DS.Spacing.sm) {
                chip(p.tag)
                Text(p.title).font(DS.TextStyle.footnote.weight(.semibold))
                Spacer()
                Text(verbatim: p.weight)
                  .font(DS.TextStyle.caption.monospacedDigit())
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              bodyText(p.body)
            }
            .accessibilityElement(children: .combine)
          }

          VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: DS.Spacing.sm) {
              chip("ACWR")
              Text(String(localized: "rx.acwr.title")).font(DS.TextStyle.footnote.weight(.semibold))
            }
            bodyText(String(localized: "rx.acwr.body"))
            VStack(alignment: .leading, spacing: 6) {
              ForEach(ReadinessCard.AcwrZone.allCases, id: \.self) { z in
                band(ReadinessCardView.toneColor(z.tone), z.band, Self.zoneWhat(z))
              }
            }
          }

          section(String(localized: "rx.notUsed.title"), String(localized: "rx.notUsed.body"))
          section(String(localized: "rx.oneSource.title"), String(localized: "rx.oneSource.body"))

          VStack(alignment: .leading, spacing: 6) {
            Text(String(localized: "rx.zones.title")).font(DS.TextStyle.footnote.weight(.semibold))
            band(DS.Color.readinessGreen.swiftUI, "75 – 100", ReadinessCardView.statusLabel(.green))
            band(DS.Color.readinessYellowGraphic.swiftUI, "50 – 74", ReadinessCardView.statusLabel(.yellow))
            band(DS.Color.readinessRed.swiftUI, "0 – 49", ReadinessCardView.statusLabel(.red))
          }

          Text(String(localized: "rx.caveat"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(DS.Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(String(localized: "rd.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "eg.close")) { dismiss() }
        }
      }
    }
  }

  private func chip(_ text: String) -> some View {
    Text(verbatim: text)
      .font(.caption2.weight(.bold).monospacedDigit())
      .tracking(1)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.horizontal, 7)
      .padding(.vertical, 2)
      .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm - 4))
  }

  private func bodyText(_ text: String) -> some View {
    Text(text)
      .font(DS.TextStyle.footnote.weight(.regular))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .fixedSize(horizontal: false, vertical: true)
  }

  private func section(_ title: String, _ body: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(DS.TextStyle.footnote.weight(.semibold))
      bodyText(body)
    }
    .accessibilityElement(children: .combine)
  }

  /// Chấm là hình (bảng đồ hoạ); khoảng số và chữ là chữ trung tính.
  private func band(_ color: Color, _ range: String, _ what: String) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Circle().fill(color).frame(width: 7, height: 7).accessibilityHidden(true)
      Text(verbatim: range)
        .font(.caption.monospaced())
        .frame(width: 78, alignment: .leading)
      Text(what)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }

  /// `ZONE_WHAT`: một tên ngắn cho mỗi băng, cặp với `ACWR_BANDS`.
  static func zoneWhat(_ z: ReadinessCard.AcwrZone) -> String {
    switch z {
    case .detraining: String(localized: "rx.zone.detraining")
    case .low: String(localized: "rx.zone.low")
    case .optimal: String(localized: "rx.zone.optimal")
    case .elevated: String(localized: "rx.zone.elevated")
    case .spike: String(localized: "rx.zone.spike")
    }
  }
}
