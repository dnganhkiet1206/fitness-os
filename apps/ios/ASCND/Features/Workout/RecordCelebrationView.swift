import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Khoảnh khắc kỷ lục sau khi ghi buổi (#527, `log-workout`) —
/// `components/ascnd/record-celebration.tsx` @ fac9ac2.
///
/// RN behavior (giữ nguyên):
/// - phủ LÊN form (không thay form) trên nền thẻ đặc — đọc kỷ lục qua hai mươi
///   ô nhập là không đọc được;
/// - Koa "tự hào" 150 điểm hiện mờ dần + nảy; dưới là thẻ: tiêu đề ("Kỷ lục
///   mới" / "N kỷ lục mới"), tối đa ba dòng (`recordLine`, mức tăng lớn nhất
///   trước), rồi "Chạm để tiếp tục";
/// - tự đi sau 2,6 giây, chạm bất kỳ đâu để đi sớm — chỉ đi MỘT lần;
/// - Reduce Motion: hiện ngay, Koa đứng yên;
/// - VoiceOver: một vùng modal, đọc tiêu đề và các dòng thành một câu.
///
/// Khác RN: không phát sự kiện `personal_record` cho sân khấu Koa (`emitKoa`)
/// — sân khấu phản ứng của Koa chưa có ở native.
struct RecordCelebrationView: View {
  let records: [PersonalRecord]
  let unit: WeightUnit
  let onDone: () -> Void

  /// `RECORD_HOLD_MS`.
  static let hold: Duration = .milliseconds(2600)
  /// `MAX_LINES`.
  static let maxLines = 3

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false
  @State private var popped = false
  @State private var left = false

  private var title: String {
    records.count > 1
      ? String(localized: "pr.titleMany \(records.count)")
      : String(localized: "pr.title")
  }

  private var lines: [String] { records.prefix(Self.maxLines).map(Self.line(unit: unit)) }

  var body: some View {
    Button(action: leave) {
      VStack(spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: .proud, size: 150, animated: !reduceMotion)
          .opacity(shown ? 1 : 0)
          .scaleEffect(0.86 + (popped ? 0.14 : 0))
          .accessibilityHidden(true)
        VStack(spacing: DS.Spacing.xs) {
          Text(verbatim: title)
            .font(DS.TextStyle.caption.weight(.heavy))
            .tracking(2.5)
            .textCase(.uppercase)
            .foregroundStyle(DS.Color.primary.swiftUI)
            .padding(.bottom, 2)
          ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
            Text(verbatim: line)
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .multilineTextAlignment(.center)
              .lineLimit(2)
          }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.Spacing.md)
        .padding(.horizontal, DS.Spacing.lg)
        .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.xl).stroke(DS.Color.border.swiftUI, lineWidth: 0.5))
        Text(String(localized: "pr.continue"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.top, DS.Spacing.sm)
      }
      .padding(DS.Spacing.xl)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(DS.Color.card.swiftUI.ignoresSafeArea())
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .opacity(shown ? 1 : 0)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: ([title] + lines).joined(separator: ". ")))
    .accessibilityHint(Text(String(localized: "pr.continue")))
    .accessibilityAddTraits(.isModal)
    .task {
      if reduceMotion {
        shown = true
        popped = true
      } else {
        withAnimation(.easeOut(duration: 0.22)) { shown = true }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.55).delay(0.09)) { popped = true }
      }
      try? await Task.sleep(for: Self.hold)
      leave()
    }
  }

  /// Chạm và hẹn giờ cùng về đây; chỉ lần đầu được đi.
  private func leave() {
    guard !left else { return }
    left = true
    onDone()
  }

  /// `recordLine` trên bảng dịch.
  static func line(unit: WeightUnit) -> (PersonalRecord) -> String {
    { r in
      let p = RecordLine.parts(r, unit: unit)
      switch p.form {
      case .weight:
        return String(localized: "pr.weight \(p.exercise) \(p.value) \(unit.label) \(p.previous)")
      case .firstLoad:
        return String(localized: "pr.firstLoad \(p.exercise) \(p.value) \(unit.label)")
      case .reps:
        return p.count == 1
          ? String(localized: "pr.reps.one \(p.exercise) \(p.atWeight) \(unit.label) \(p.previous)")
          : String(localized: "pr.reps.other \(p.exercise) \(p.count) \(p.atWeight) \(unit.label) \(p.previous)")
      case .repsBodyweight:
        return p.count == 1
          ? String(localized: "pr.repsBody.one \(p.exercise) \(p.previous)")
          : String(localized: "pr.repsBody.other \(p.exercise) \(p.count) \(p.previous)")
      }
    }
  }
}
