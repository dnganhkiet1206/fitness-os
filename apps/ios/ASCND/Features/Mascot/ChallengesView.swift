import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thử thách tuần (#527) — `app/challenges.tsx` @ fac9ac2 trên `WeeklyChallengesBook`.
///
/// Như RN: đọc lỗi trả lời trước (không bao giờ nói "chưa có thử thách" thay
/// cho "không đọc được"); mở màn thì gieo tuần nếu trống rồi đo lại tiến độ;
/// mỗi thử thách: tên + mô tả theo ngôn ngữ app (khoá lạ → chữ lưu trong hàng),
/// thanh tiến độ, "x / y" hoặc "Hoàn thành"; đo lại không xong thì NÓI ra (con
/// số trên màn có thể đã cũ); vừa xong thử thách có phần thưởng → thẻ ăn mừng
/// (`enqueueAward`), kèm một dòng trên màn.
struct ChallengesView: View {
  let book: WeeklyChallengesBook
  let lang: AppPreferences.Lang

  @Environment(AppServices.self) private var services

  var body: some View {
    content
      // nền trang như mọi màn (RN: `Screen`) — không thì ScrollView để lộ nền trắng
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      // Thiết kế lại 15/10: nền giấy + tiêu đề lớn trong nội dung.
      .background { TodayAmbient(accent: nil) }
      .statusBarScrim()
      .navigationTitle(Text(verbatim: ""))
      .navigationBarTitleDisplayMode(.inline)
      .task { if case .loading = book.phase { await book.load() } }
      .refreshable { await book.refreshProgress() }
      .onChange(of: book.justCompleted) { _, keys in
        guard case .ready(let rows) = book.phase else { return }
        for key in keys {
          guard let ch = rows.first(where: { $0.key == key }) else { continue }
          let name = title(key, fallback: ch.title)
          // `use-extras.ts:711`: chỉ thử thách CÓ phần thưởng mới có thẻ ăn
          // mừng (thẻ tự đọc cho VoiceOver); không có thì chỉ đọc một dòng.
          if let reward = ch.rewardTitle {
            services.celebrations.enqueue(
              title: ChallengeText.reward(key, lang: lang) ?? reward,
              description: String(localized: "ch.done \(name)"), icon: ch.icon ?? "trophy",
              tier: ch.rewardTier ?? "bronze")
          } else {
            AccessibilityNotification.Announcement(String(localized: "ch.done \(name)")).post()
          }
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
          Text(String(localized: "ch.title"))
            .font(.largeTitle.bold())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
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
    let tint = ch.completed ? DS.Color.readinessGreen.swiftUI : DS.Color.metricOrangeGraphic.swiftUI
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: DS.Spacing.md) {
          Image(systemName: ch.completed ? "checkmark" : "flag.2.crossed.fill")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 40, height: 40)
            .background(tint.opacity(0.13), in: Circle())
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(name).font(DS.TextStyle.headline)
            if let desc, !desc.isEmpty {
              Text(desc).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
          }
          Spacer(minLength: 0)
        }
        GeometryReader { g in
          ZStack(alignment: .leading) {
            Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.07))
            Capsule().fill(tint).frame(width: g.size.width * min(1, max(0, Double(d.percent) / 100)))
          }
        }
        .frame(height: 8)
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
