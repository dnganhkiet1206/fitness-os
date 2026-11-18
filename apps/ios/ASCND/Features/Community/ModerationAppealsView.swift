import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Hàng đợi kháng nghị (#915) — port của `native/src/app/admin/appeals.tsx`
/// (RN web) lên SwiftUI. Chạm một kháng nghị thì mở màn chi tiết của đích,
/// nơi quyết định chấp nhận / từ chối trong bối cảnh đầy đủ (nội dung, báo
/// cáo, lịch sử).
struct ModerationAppealsScreen: View {
  let book: ModerationBook
  @State private var openTarget: ModTargetRef?

  var body: some View {
    content
      .navigationTitle(Text("community.mod.appeals.title"))
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
        systemImage: "shield.slash", title: String(localized: "community.mod.appeals.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      queue
    }
  }

  private var queue: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        Picker(String(localized: "community.mod.appeals.title"), selection: statusBinding) {
          Text("community.mod.appeals.open").tag(ModAppealStatus.open)
          Text("community.mod.appeals.restored").tag(ModAppealStatus.restored)
          Text("community.mod.appeals.upheld").tag(ModAppealStatus.upheld)
        }
        .pickerStyle(.segmented)
        if book.appeals.isEmpty {
          DSEmptyState(
            systemImage: "arrow.uturn.backward", title: String(localized: "community.mod.appeals.title"),
            message: String(localized: "community.mod.appeals.empty"))
        } else {
          ForEach(book.appeals) { item in
            Button { openTarget = ModTargetRef(type: item.type, id: item.targetId) } label: {
              DSCard { ModAppealRow(item: item, showStale: book.appealStatus == .open) }
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  private var statusBinding: Binding<ModAppealStatus> {
    Binding(
      get: { book.appealStatus },
      set: { status in Task { await book.selectAppeals(status) } })
  }
}

/// Một kháng nghị: lời nhắn của tác giả, nội dung bị ẩn (xem trước), tác giả,
/// số báo cáo và thời gian.
struct ModAppealRow: View {
  let item: ModAppealItem
  /// Chỉ hiện nhãn "chờ hơn 48 giờ" cho kháng nghị đang mở.
  let showStale: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: item.type == .post ? "doc.text" : "bubble.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        if let author = item.author {
          Text(verbatim: author.name)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        Text(verbatim: PostHeaderView.agoText(item.createdAt))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if !item.message.isEmpty {
        Text(verbatim: item.message)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(3)
      }
      if let excerpt = item.excerpt, !excerpt.isEmpty {
        Text(verbatim: excerpt)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(2)
      }
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: ModQueueRow.countText(item.reports))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if showStale, ModStale.isStale(item.createdAt, now: Date()) {
          Text("community.mod.queue.stale")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, DS.Spacing.xs)
            .background(DS.Color.readinessYellow.swiftUI.opacity(0.12), in: Capsule())
        }
        Spacer(minLength: 0)
        if item.status == .open {
          Text("community.mod.appeals.open")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
        } else if item.status == .restored {
          Text("community.mod.appeals.restored")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        } else {
          Text("community.mod.appeals.upheld")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}
