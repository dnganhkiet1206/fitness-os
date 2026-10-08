import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thử thách tuần (#527) — `app/challenges.tsx` @ fac9ac2 trên `WeeklyChallengesBook`.
///
/// Như RN: đọc lỗi trả lời trước (không bao giờ nói "chưa có thử thách" thay
/// cho "không đọc được"); mở màn thì gieo tuần nếu trống rồi đo lại tiến độ;
/// mỗi thử thách: tên + mô tả theo ngôn ngữ app (khoá lạ → chữ lưu trong hàng),
/// thanh tiến độ, "x / y" hoặc "Hoàn thành"; đo lại không xong thì NÓI ra (con
/// số trên màn có thể đã cũ). Khác RN: không có pháo hoa khi vừa xong — báo một
/// dòng + VoiceOver.
struct ChallengesView: View {
  let book: WeeklyChallengesBook
  let lang: AppPreferences.Lang

  var body: some View {
    content
      .navigationTitle(String(localized: "ch.title"))
      .task { if case .loading = book.phase { await book.load() } }
      .refreshable { await book.refreshProgress() }
      .onChange(of: book.justCompleted) { _, keys in
        for key in keys {
          AccessibilityNotification.Announcement(String(localized: "ch.done \(title(key, fallback: key))")).post()
        }
      }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView(message: String(localized: "ch.loading"))
    case .failed:
      DSErrorView(message: String(localized: "ch.loadFailed")) {
        Task { await book.load() }
      }
    case .ready(let rows) where rows.isEmpty:
      DSEmptyState(
        systemImage: "target", title: String(localized: "ch.empty.title"),
        message: String(localized: "ch.empty.message"))
    case .ready(let rows):
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          if book.progressFailure != nil {
            Label(String(localized: "ch.error.progress"), systemImage: "exclamationmark.triangle")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          ForEach(book.justCompleted, id: \.self) { key in
            Label(String(localized: "ch.done \(title(key, fallback: key))"), systemImage: "sparkles")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.readinessGreen.swiftUI)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          ForEach(rows) { card($0) }
        }
        .padding(DS.Spacing.md)
      }
    }
  }

  private func card(_ ch: WeeklyChallenges.Row) -> some View {
    let d = ch.display
    let name = title(ch.key, fallback: ch.title)
    let desc = ChallengeText.desc(ch.key, lang: lang) ?? ch.description
    let tint = ch.completed ? DS.Color.readinessGreen.swiftUI : DS.Color.primary.swiftUI
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: DS.Spacing.md) {
          Image(systemName: "target")
            .foregroundStyle(DS.Color.primary.swiftUI)
            .frame(width: 40, height: 40)
            .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(name).font(DS.TextStyle.headline)
            if let desc, !desc.isEmpty {
              Text(desc).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
          }
          Spacer(minLength: 0)
          if ch.completed {
            Image(systemName: "checkmark")
              .font(.body.weight(.bold))
              .foregroundStyle(DS.Color.readinessGreen.swiftUI)
              .accessibilityHidden(true)
          }
        }
        ProgressView(value: Double(d.percent), total: 100)
          .tint(tint)
          .accessibilityHidden(true)
        Text(ch.completed ? String(localized: "ch.completed") : "\(d.current) / \(d.target)")
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity, alignment: .trailing)
          .accessibilityHidden(true)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityValue(
      Text(
        ch.completed
          ? String(localized: "ch.completed") : String(localized: "ch.progress.a11y \(d.current) \(d.target)")))
  }

  /// `challengeText(key, lang, { title })`: khoá lạ → chữ đã lưu.
  private func title(_ key: String, fallback: String) -> String {
    ChallengeText.title(key, lang: lang) ?? fallback
  }
}
