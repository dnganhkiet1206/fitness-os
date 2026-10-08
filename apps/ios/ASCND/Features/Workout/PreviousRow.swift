// Dòng "Lần trước" — C sở hữu (#312).
//
// Presentation seam: hiển thị buổi gần nhất của bài (nếu có), nút "Dùng lại",
// trạng thái đang tải / chưa có lịch sử.
// KHÔNG query history trong View — A13 cung cấp read model sau.
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Buổi gần nhất của một bài — A13 cung cấp sau.
public struct PreviousPerformance: Hashable, Sendable {
  public let weightKg: Double?
  public let reps: Int
  public let date: Date?

  public init(weightKg: Double? = nil, reps: Int, date: Date? = nil) {
    self.weightKg = weightKg
    self.reps = reps
    self.date = date
  }

  /// Nhãn hiển thị theo đơn vị của tài khoản (#527 1.9-A): "60 kg × 8",
  /// "132.3 lb × 8", hoặc "× 8" khi không tạ.
  public func label(_ unit: WeightUnit) -> String {
    if let w = weightKg, w > 0 {
      return "\(unit.load(w)) × \(reps)"
    }
    return "× \(reps)"
  }
}

/// Trạng thái dòng "Lần trước".
public enum PreviousRowState: Hashable, Sendable {
  case loading
  case none
  case available(PreviousPerformance)
}

public struct PreviousRow: View {
  let state: PreviousRowState
  @Environment(\.weightUnit) private var unit
  /// Dùng lại số của lần trước — controller áp vào ô nhập.
  var onUseAgain: ((PreviousPerformance) -> Void)?

  public init(
    state: PreviousRowState,
    onUseAgain: ((PreviousPerformance) -> Void)? = nil
  ) {
    self.state = state
    self.onUseAgain = onUseAgain
  }

  public var body: some View {
    switch state {
    case .loading:
      HStack(spacing: DS.Spacing.xs) {
        ProgressView()
          .controlSize(.small)
        Text(String(localized: "workout.previous.loading"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text(String(localized: "workout.previous.loading")))

    case .none:
      Text(String(localized: "workout.previous.none"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityLabel(Text(String(localized: "workout.previous.none")))

    case .available(let prev):
      HStack(spacing: DS.Spacing.sm) {
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "workout.previous.title"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(prev.label(unit))
            .font(DS.TextStyle.body.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        Spacer()
        if let onUseAgain {
          DSButton(
            String(localized: "workout.previous.useAgain"),
            style: .secondary,
            action: { onUseAgain(prev) }
          )
          .frame(maxWidth: 120)
        }
      }
      .accessibilityElement(children: .contain)
    }
  }
}

// MARK: - Preview

#Preview("Previous — có lịch sử") {
  PreviousRow(
    state: .available(.init(weightKg: 60, reps: 8)),
    onUseAgain: { _ in }
  )
  .padding()
}

#Preview("Previous — chưa có") {
  PreviousRow(state: .none)
    .padding()
}

#Preview("Previous — đang tải") {
  PreviousRow(state: .loading)
    .padding()
}
