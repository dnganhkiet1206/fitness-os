import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Dòng sẵn sàng trong thẻ buổi tập (#527, bản thiết kế Today đã duyệt): trả lời
/// "hôm nay tập nặng hay nhẹ" ngay cạnh nút Bắt đầu, thay vòng sẵn sàng lớn.
///
/// Mọi chữ và số là của RN, đã port ở `ReadinessCardView` / `ReadinessCard`:
/// - điểm và vùng do engine ghi vào `daily_logs` (≥75 tập, ≥50 vừa phải, còn lại
///   phục hồi — `rd.status.*`);
/// - lý do là `explainText` của RN (hai chiều thấp nhất), một dòng;
/// - chưa có điểm: "—", không bao giờ "0".
///
/// Chạm dòng → chi tiết sẵn sàng (thẻ RN ở dạng mở: năm ô, lời khuyên, "?").
/// Chưa có điểm thì có thêm nút "Ghi giấc ngủ" — một đêm ngủ là một trong các
/// cách để có điểm (`rd.empty.message`).
struct TodayReadinessRow: View {
  let book: ReadinessBook
  let lang: AppPreferences.Lang
  let onOpen: () -> Void
  var onLogSleep: (() -> Void)?

  var body: some View {
    switch book.phase {
    case .loading:
      ProgressView()
        .frame(maxWidth: .infinity, minHeight: 56)
        .accessibilityLabel(Text(String(localized: "rd.loading")))
    case .failed:
      HStack {
        Text(String(localized: "async.error.generic"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer()
        Button(String(localized: "common.retry")) { Task { await book.load() } }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(minHeight: 44)
      }
    case .empty:
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        row(
          score: nil, color: DS.Color.mutedForeground.swiftUI,
          title: String(localized: "today.rd.none"), reason: String(localized: "today.rd.none.how"))
        if let onLogSleep {
          Button(action: onLogSleep) {
            Label(String(localized: "today.do.sleep"), systemImage: "moon.fill")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .padding(.horizontal, DS.Spacing.md)
              .frame(minHeight: 44)
              .overlay(Capsule().strokeBorder(DS.Color.border.swiftUI))
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
        }
      }
    case .ready(let day):
      let copy = ReadinessCopyStore.copy
      let reason = copy.map { ReadinessCard.explainText(day.explain, lang: lang, copy: $0) } ?? ""
      row(
        score: day.score, color: ReadinessCardView.statusColor(day.status),
        title: ReadinessCardView.statusLabel(day.status), reason: reason)
    }
  }

  private func row(score: Int?, color: Color, title: String, reason: String) -> some View {
    Button(action: onOpen) {
      HStack(spacing: DS.Spacing.md) {
        Text(verbatim: score.map(String.init) ?? "—")
          .font(.custom("Menlo", size: 30, relativeTo: .title).weight(.bold))
          .foregroundStyle(color)
          .monospacedDigit()
          .contentTransition(.numericText(value: Double(score ?? 0)))
          .animation(.smooth(duration: 0.5), value: score)
          .frame(minWidth: 48, alignment: .leading)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: title)
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          if !reason.isEmpty {
            Text(verbatim: reason)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.sm)
      .frame(minHeight: 56)
      .background(DS.Color.foreground.swiftUI.opacity(0.05), in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: [
      String(localized: "rd.empty.title"), score.map(String.init) ?? "—", title, reason,
    ].filter { !$0.isEmpty }.joined(separator: ", ")))
    .accessibilityHint(Text(String(localized: "rd.hint.open")))
    .accessibilityAddTraits(.isButton)
  }
}
