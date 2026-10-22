import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Koa Coach ở Hôm nay (Kiệt 21/10, GĐ3: "đưa insight và Koa coach lên today vì đây
/// sẽ là thứ người dùng thấy đầu tiên khi mở app"): "Insight hôm nay" + ô hỏi Koa,
/// ngay dưới việc chính. Chỉ ở đây — Tiến bộ không lặp. Cuộc trò chuyện vẫn là MỘT
/// của phiên (tab Tiến bộ giữ nó): ô hỏi mở đúng cuộc ấy, như nút Koa ở Ghi nhanh.
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
            fallback: signal.map { SmartNudges.fallback($0.signal, lang: lang.rawValue, hour: hour) } ?? []
          ) { Task { await loadInsight(force: true) } }
        }
        AskCoachBar(lastAsked: nil, open: onAsk)
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

/// Ô "Hỏi coach về hôm nay…" — chạm mở chat; đang có cuộc trò chuyện thì có dòng
/// "Tiếp tục: …".
struct AskCoachBar: View {
  let lastAsked: String?
  let open: () -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var spin = false

  /// Viền + quầng kiểu Siri / Apple Intelligence (Kiệt 22/10) bằng dải màu của ASCND
  /// Intelligence (`IntelligenceTones.spectrum`); xoay chậm một vòng / 8 giây. Giảm
  /// chuyển động: đứng yên.
  private var tones: AngularGradient {
    AngularGradient(
      colors: IntelligenceTones.spectrum + [IntelligenceTones.spectrum[0]],
      center: .center, angle: .degrees(spin ? 360 : 0))
  }

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 6) {
        // Không ký hiệu ASCND Intelligence ở đây: thẻ Insight ngay trên đã mang nó.
        HStack(spacing: 10) {
          Text("assistant.ask")
            .font(.system(size: 15))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Spacer(minLength: 0)
          Image(systemName: "arrow.up")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(width: 34, height: 34)
            .background(DS.Color.foreground.swiftUI, in: Circle())
        }
        .padding(.leading, 16)
        .padding(.trailing, 6)
        .frame(height: 50)
        .background(DS.Color.card.swiftUI.opacity(0.94), in: Capsule())
        .overlay(Capsule().strokeBorder(tones, lineWidth: 1.6))
        .background(Capsule().fill(tones).blur(radius: 12).opacity(0.38).padding(-2))
        if let lastAsked {
          Label {
            Text("assistant.coach.continue \(lastAsked)").lineLimit(1)
          } icon: {
            Image(systemName: "clock")
          }
          .font(.system(size: 13))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.leading, 16)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text("assistant.coach.open.a11y"))
    .onAppear {
      guard !reduceMotion, !spin else { return }
      withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) { spin = true }
    }
  }
}

/// "Insight hôm nay": đang đọc / lỗi (chạm thử lại) / không có gì nổi bật /
/// tối đa vài câu với chấm theo mức ưu tiên; "Cập nhật HH:mm" là lúc kết quả
/// về (ẩn khi chưa có lần nào).
struct SmartInsightCard: View {
  let book: SmartNudgesBook
  /// Nhắc từ số thật khi AI không trả lời (`SmartNudges.fallback`).
  var fallback: [SmartNudges.Nudge] = []
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
      content
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
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
