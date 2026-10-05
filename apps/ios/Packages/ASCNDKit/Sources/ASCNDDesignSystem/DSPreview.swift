// Preview bảng màu — C sở hữu (#229, #246).
// Mở trong Xcode để xem token ở cả hai theme.
#if canImport(SwiftUI)
import SwiftUI

struct DSColorPreview: View {
  var body: some View {
    ScrollView {
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: DS.Spacing.md) {
        ForEach(DSColorTokens.tokens, id: \.0) { name, color in
          VStack(spacing: DS.Spacing.xs) {
            RoundedRectangle(cornerRadius: DS.Radius.md)
              .fill(color.swiftUI)
              .frame(height: 56)
            Text(name).font(DS.TextStyle.caption)
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }
}

enum DSColorTokens {
  static let tokens: [(String, DSColor)] = [
    ("background", DS.Color.background),
    ("card", DS.Color.card),
    ("secondary", DS.Color.secondary),
    ("muted", DS.Color.muted),
    ("accent", DS.Color.accent),
    ("border", DS.Color.border),
    ("input", DS.Color.input),
    ("ringTrack", DS.Color.ringTrack),
    ("foreground", DS.Color.foreground),
    ("mutedForeground", DS.Color.mutedForeground),
    ("mutedOnInset", DS.Color.mutedOnInset),
    ("glassMuted", DS.Color.glassMuted),
    ("secondaryForeground", DS.Color.secondaryForeground),
    ("brand", DS.Color.brand),
    ("primary", DS.Color.primary),
    ("primaryForeground", DS.Color.primaryForeground),
    ("goldLight", DS.Color.goldLight),
    ("champagne", DS.Color.champagne),
    ("destructive", DS.Color.destructive),
    ("destructiveForeground", DS.Color.destructiveForeground),
    ("readinessGreen", DS.Color.readinessGreen),
    ("readinessYellow", DS.Color.readinessYellow),
    ("readinessYellowGraphic", DS.Color.readinessYellowGraphic),
    ("readinessRed", DS.Color.readinessRed),
    ("metricBlue", DS.Color.metricBlue),
    ("waterFill", DS.Color.waterFill),
    ("metricBlueWash", DS.Color.metricBlueWash),
    ("metricBlueInk", DS.Color.metricBlueInk),
    ("recessBg", DS.Color.recessBg),
    ("recessBorder", DS.Color.recessBorder),
    ("metricPurple", DS.Color.metricPurple),
    ("metricCyan", DS.Color.metricCyan),
    ("metricOrange", DS.Color.metricOrange),
    ("metricOrangeGraphic", DS.Color.metricOrangeGraphic),
    ("metricRose", DS.Color.metricRose),
    ("metricBeige", DS.Color.metricBeige),
    ("metricViolet", DS.Color.metricViolet),
    ("metricSteel", DS.Color.metricSteel),
  ]
}

#Preview("Light") {
  DSColorPreview()
    .preferredColorScheme(.light)
}

#Preview("Dark") {
  DSColorPreview()
    .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  DSColorPreview()
    .dynamicTypeSize(.accessibility5)
}
#endif
