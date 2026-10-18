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
///
/// 15/10 (audit toàn app): vòng + nhãn + quyết định điểm nào hiện là CHUNG với
/// thẻ Tóm tắt của Trợ lý (`ReadinessGauge`, `AssistantSummary.shown`). Hôm nay
/// chưa có điểm mà 7 ngày qua có → điểm gần nhất, ghi "Điểm gần nhất · hôm qua".
struct TodayReadinessRow: View {
  let book: ReadinessBook
  let lang: AppPreferences.Lang
  /// Điểm các ngày trước hôm nay (cũ → mới) — cho điểm gần nhất khi hôm nay trống.
  var recent: [(date: LocalDate, value: Int)] = []
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
      let latest = AssistantSummary.shown(today: nil, status: nil, recent: recent)
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        if let latest {
          row(
            shown: latest, title: AssistantText.label(latest.level), reason: ReadinessGauge.staleNote(latest) ?? "")
        } else {
          row(shown: nil, title: String(localized: "today.rd.none"), reason: String(localized: "today.rd.none.how"))
        }
        sleepButton
      }
    case .ready(let day):
      let copy = ReadinessCopyStore.copy
      let recovery = copy.map { ReadinessCard.hasRecoverySignal(day.explain, copy: $0) } ?? true
      if AssistantSummary.provisional(score: day.score, hasRecovery: recovery) {
        // Điểm chỉ dựa vào tải tập (17/10): không hiện "80 · Tập hết mình" như
        // một lời khuyên — nói còn thiếu gì và cách lấp.
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          row(shown: nil, title: String(localized: "rd.provisional.title"), reason: String(localized: "rd.provisional.reason"))
          sleepButton
        }
      } else {
        let reason = copy.map { ReadinessCard.explainText(day.explain, lang: lang, copy: $0) } ?? ""
        let shown = AssistantSummary.shown(today: day.score, status: day.status.rawValue, recent: [])
        row(shown: shown, title: AssistantText.label(shown?.level), reason: reason)
      }
    }
  }

  @ViewBuilder private var sleepButton: some View {
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

  private func row(shown: AssistantSummary.Shown?, title: String, reason: String) -> some View {
    let score = shown?.score
    return Button(action: onOpen) {
      HStack(spacing: DS.Spacing.md) {
        ReadinessGauge(shown: shown, size: 48)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: title)
            .font(DS.TextStyle.headline)
            .foregroundStyle(shown == nil ? DS.Color.foreground.swiftUI : AssistantText.tint(shown?.level))
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
