import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Hàng đợi báo cáo (#915) — port của `native/src/app/admin/reports.tsx`
/// (RN web) lên SwiftUI. Các báo cáo gom theo đích, đã xếp theo
/// `ModTriage` (kháng nghị chờ, rồi số được tính, rồi cũ trước).
struct ModerationReportsScreen: View {
  let book: ModerationBook
  @State private var openTarget: ModTargetRef?

  var body: some View {
    content
      .navigationTitle(Text("community.mod.reports.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.load() }
      .task { if book.phase == .loading { await book.load() } }
      .navigationDestination(item: $openTarget) { t in ModerationTargetScreen(book: book, type: t.type, id: t.id) }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(
        message: book.failure.map(ModerationFailureText.text) ?? String(localized: "community.mod.loadfailed")
      ) { Task { await book.load() } }
    case .notStaff:
      DSEmptyState(
        systemImage: "shield.slash", title: String(localized: "community.mod.reports.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      queue
    }
  }

  private var queue: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        Picker(String(localized: "community.mod.reports.title"), selection: statusBinding) {
          Text("community.mod.reports.open").tag(ModReportStatus.open)
          Text("community.mod.reports.actioned").tag(ModReportStatus.actioned)
          Text("community.mod.reports.dismissed").tag(ModReportStatus.dismissed)
        }
        .pickerStyle(.segmented)
        if book.reports.isEmpty {
          DSEmptyState(
            systemImage: "flag.slash", title: String(localized: "community.mod.reports.title"),
            message: String(localized: "community.mod.reports.empty"))
        } else {
          ForEach(book.reports) { item in
            Button { openTarget = ModTargetRef(type: item.type, id: item.targetId) } label: {
              DSCard { ModQueueRow(item: item, showStale: book.reportStatus == .open) }
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  private var statusBinding: Binding<ModReportStatus> {
    Binding(
      get: { book.reportStatus },
      set: { status in Task { await book.selectReports(status) } })
  }
}

/// Một mục hàng đợi: nội dung xem trước, tác giả, số báo cáo, lý do hàng đầu,
/// trạng thái ẩn / gỡ và dấu kháng nghị chờ.
struct ModQueueRow: View {
  let item: ModQueueItem
  /// Chỉ hiện nhãn "chờ hơn 48 giờ" cho mục đang mở (mục đã quyết không cần
  /// nhắc — người ta đã xử lý rồi).
  let showStale: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: item.type == .post ? "doc.text" : "bubble.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        Text(verbatim: item.type == .post ? String(localized: "community.mod.target.post") : String(localized: "community.mod.target.comment"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer(minLength: 0)
        Text(verbatim: PostHeaderView.agoText(item.lastAt))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if !item.targetExcerpt.isEmpty {
        Text(verbatim: item.targetExcerpt)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(3)
      }
      HStack(spacing: DS.Spacing.sm) {
        if let author = item.author {
          Text(verbatim: author.name)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        Text(verbatim: Self.countText(item.reportCount))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
      }
      HStack(spacing: DS.Spacing.sm) {
        // Chờ hơn 48 giờ chưa quyết (Discourse nhắc mọi mod khi một cờ quá
        // 48 giờ) — nhãn vàng, chỉ ở tab đang mở.
        if showStale, ModStale.isStale(item.lastAt, now: Date()) {
          Text("community.mod.queue.stale")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, DS.Spacing.xs)
            .background(DS.Color.readinessYellow.swiftUI.opacity(0.12), in: Capsule())
        }
        if let top = item.topReason {
          Text(verbatim: HiddenNoticeView.reasonText(top))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, DS.Spacing.xs)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        if item.countedCount < item.reportCount {
          Text(verbatim: Self.countedText(item.countedCount))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer(minLength: 0)
        if item.hasOpenAppeal {
          Label(String(localized: "community.mod.reports.openappeal"), systemImage: "arrow.uturn.backward")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
            .labelStyle(.iconOnly)
            .accessibilityLabel(Text("community.mod.reports.openappeal"))
        }
        if item.target?.removed == true {
          Text("community.mod.target.removed")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.destructive.swiftUI)
        } else if item.target?.hidden == true {
          Text("community.mod.target.hidden")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  static func countText(_ n: Int) -> String {
    n == 1 ? String(localized: "community.mod.reports.count.one \(n)") : String(localized: "community.mod.reports.count.other \(n)")
  }

  static func countedText(_ n: Int) -> String {
    n == 1 ? String(localized: "community.mod.reports.counted.one \(n)") : String(localized: "community.mod.reports.counted.other \(n)")
  }
}

extension ModQueueItem {
  var targetExcerpt: String { target?.excerpt ?? "" }
}
