import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Koa Coach ở Hôm nay (Kiệt 21/10, GĐ3: "đưa insight và Koa coach lên today vì đây
/// sẽ là thứ người dùng thấy đầu tiên khi mở app"): thẻ "Insight hôm nay" ngay dưới
/// việc chính, dòng cuối "Hỏi Koa về hôm nay ›" (22/10: gộp ô hỏi vào thẻ). Chỉ ở
/// đây — Tiến bộ không lặp. Cuộc trò chuyện vẫn là MỘT của phiên (tab Tiến bộ giữ
/// nó): dòng hỏi mở đúng cuộc ấy, như nút Koa ở Ghi nhanh.
/// Chỉ khi các function AI có trên máy chủ (`AppServices.aiDeployed`).
struct TodayCoachSection: View {
  let userId: String
  let today: LocalDate
  let onAsk: () -> Void

  @Environment(AppServices.self) private var services
  @Environment(\.scenePhase) private var scenePhase
  @State private var signal: AssistantSignalBook?
  @State private var nudges: SmartNudgesBook?
  @State private var hour = Calendar.current.component(.hour, from: Date())

  private var lang: AppPreferences.Lang { services.preferences.lang }

  var body: some View {
    if services.aiDeployed == true {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        // Máy chủ chưa bật tính năng → không hiện thẻ lỗi vĩnh viễn (15/10, audit).
        if let nudges, !nudges.isNotDeployed {
          SmartInsightCard(
            book: nudges,
            // AI lỗi (quá tải, mạng…): nhắc dựng từ số thật thay cho dòng lỗi.
            fallback: signal.map { SmartNudges.fallback($0.signal, lang: lang.rawValue, hour: hour) } ?? [],
            ask: onAsk
          ) { Task { await loadInsight(force: true) } }
        }
      }
      .task(id: userId) {
        if signal == nil { signal = services.makeAssistantSignal(userId: userId, today: today) }
        if nudges == nil { nudges = services.makeSmartNudges(userId: userId) }
        await signal?.load()
        // Sau tín hiệu: khoá của insight cần dấu "đã ngủ / ăn / tập" hôm nay.
        await loadInsight()
      }
      .onChange(of: scenePhase) { _, phase in
        guard phase == .active else { return }
        hour = Calendar.current.component(.hour, from: Date())
        Task {
          await signal?.move(to: Self.today())
          await loadInsight()
        }
      }
      .onReceive(NotificationCenter.default.publisher(for: .healthSynced)) { _ in
        Task {
          await signal?.load()
          await loadInsight()
        }
      }
    }
  }

  /// Insight của hôm nay theo dấu dữ liệu hiện tại (đổi dấu → lượt gọi mới).
  private func loadInsight(force: Bool = false) async {
    guard let nudges, let stamp = signal?.nudgeStamp else { return }
    await nudges.load(
      date: Self.today(), lang: lang.rawValue, stamp: stamp, tzOffset: Coach.tzOffset(.current, at: Date()),
      force: force)
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}

/// "Insight hôm nay": đang đọc / lỗi (chạm thử lại) / không có gì nổi bật /
/// tối đa vài câu với chấm theo mức ưu tiên; "Cập nhật HH:mm" là lúc kết quả
/// về (ẩn khi chưa có lần nào).
struct SmartInsightCard: View {
  let book: SmartNudgesBook
  /// Nhắc từ số thật khi AI không trả lời (`SmartNudges.fallback`).
  var fallback: [SmartNudges.Nudge] = []
  /// Dòng "Hỏi Koa về hôm nay ›" ở cuối thẻ (Kiệt 22/10: gộp ô hỏi vào thẻ Insight).
  var ask: (() -> Void)?
  let retry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Label { Text("insight.title") } icon: { IntelligenceMark(size: 18) }
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        if case .ready(let entry) = book.phase {
          Text("insight.updated \(Self.time(entry.at))")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      VStack(alignment: .leading, spacing: 0) {
        content
          .padding(DS.Spacing.md)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let ask {
          Divider().opacity(0.6).padding(.horizontal, DS.Spacing.md)
          Button(action: ask) {
            HStack(spacing: 8) {
              Text("assistant.ask").font(DS.TextStyle.body.weight(.medium))
              Spacer(minLength: 0)
              Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
          }
          .buttonStyle(TodayPressStyle())
          .accessibilityLabel(Text("assistant.coach.open.a11y"))
        }
      }
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .idle, .loading:
      HStack(spacing: DS.Spacing.sm) {
        IntelligenceOrb(size: 24)
        Text("insight.loading")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    case .failed where !fallback.isEmpty:
      // Bản tóm tắt từ số liệu (16/10, chủ dự án): thẻ không trống mỗi lần AI quá
      // tải. Ghi rõ nguồn; chạm dòng nguồn để thử lại AI.
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        nudgeList(fallback)
        Button(action: retry) {
          Label("insight.fallback", systemImage: "arrow.clockwise")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    case .failed(let failure):
      Button(action: retry) {
        Label {
          VStack(alignment: .leading, spacing: 2) {
            Text("insight.failed")
            Text(verbatim: WeeklyReviewView.failureText(failure))
              .font(DS.TextStyle.caption)
          }
        } icon: {
          Image(systemName: "exclamationmark.triangle")
        }
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    case .ready(let entry) where entry.nudges.isEmpty:
      Text("insight.empty")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    case .ready(let entry):
      nudgeList(entry.nudges)
    }
  }

  private func nudgeList(_ nudges: [SmartNudges.Nudge]) -> some View {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        ForEach(Array(nudges.enumerated()), id: \.offset) { _, n in
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Circle()
              .fill(Self.tint(n.priority))
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)
            Text(verbatim: n.message)
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
  }

  private static func tint(_ p: SmartNudges.Priority) -> Color {
    switch p {
    case .high: DS.Color.readinessRed.swiftUI
    case .medium: DS.Color.readinessYellow.swiftUI
    case .low: DS.Color.readinessGreen.swiftUI
    }
  }

  private static func time(_ at: EpochMillis) -> String {
    Date(timeIntervalSince1970: TimeInterval(at.millis) / 1000)
      .formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(.app))
  }
}

extension SmartNudgesBook {
  /// Máy chủ chưa triển khai `ai-smart-nudges`.
  var isNotDeployed: Bool {
    if case .failed(.notDeployed) = phase { true } else { false }
  }
}
