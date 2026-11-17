import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Báo cáo của tôi" (#915, giai đoạn 2) — người dùng thường xem báo cáo
/// mình đã gửi kèm trạng thái (đang mở / đã xử lý / đã bác), theo mẫu Support
/// Inbox của Facebook: người báo không bao giờ nghe lại thì ngừng báo cáo.
///
/// Lối vào: mục Quyền riêng tư trên hồ sơ của chính mình. Hàng KHÔNG điều
/// hướng: bài vừa báo cáo vốn ẩn khỏi chính người báo nên chạm vào chỉ thấy
/// màn lỗi; trích đoạn inline là đủ để nhớ mình đã báo cáo cái gì. Nội dung
/// đã gỡ càng không mở được.
struct MyReportsScreen: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @State private var book: MyReportsBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        MyReportsView(book: book)
      } else if built {
        DSEmptyState(
          systemImage: "flag", title: String(localized: "community.myreports.title"),
          message: String(localized: "placeholder.building"))
      } else {
        DSLoadingView()
      }
    }
    .navigationTitle(Text("community.myreports.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task {
      guard !built else { return }
      book = services.makeMyReports(userId: userId)
      built = true
    }
  }
}

struct MyReportsView: View {
  let book: MyReportsBook

  var body: some View {
    content
      .ascndPage()
      .refreshable { await book.load() }
      .task { if book.phase == .loading { await book.load() } }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(
        message: book.failure.map(ModerationFailureText.text) ?? String(localized: "community.mod.loadfailed")
      ) { Task { await book.load() } }
    case .ready:
      list
    }
  }

  private var list: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        if book.reports.isEmpty {
          DSEmptyState(
            systemImage: "flag.slash", title: String(localized: "community.myreports.title"),
            message: String(localized: "community.myreports.empty"))
        } else {
          ForEach(book.reports) { r in
            DSCard { MyReportRow(report: r) }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }
}

/// Một báo cáo: trích nội dung đích, lý do, trạng thái, ngày. Không điều
/// hướng (xem ghi chú ở đầu file).
struct MyReportRow: View {
  let report: MyReport

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: Self.typeText(report))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer(minLength: 0)
        Text(verbatim: PostHeaderView.agoText(report.createdAt))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if !report.excerpt.isEmpty {
        Text(verbatim: report.excerpt)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(3)
      }
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: report.reason.map(HiddenNoticeView.reasonText) ?? report.reasonRaw)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
        if report.removed {
          Text("community.mod.target.removed")
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
        Spacer(minLength: 0)
        Text(verbatim: Self.statusText(report.status))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(statusColor(report.status))
      }
      if let note = report.note, !note.isEmpty {
        Text(verbatim: note)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  static func typeText(_ r: MyReport) -> String {
    if r.isUserReport { return String(localized: "community.myreports.user") }
    switch r.targetType {
    case .comment: String(localized: "community.mod.target.comment")
    default: String(localized: "community.mod.target.post")
    }
  }

  static func statusText(_ s: ModReportStatus) -> String {
    switch s {
    case .open: String(localized: "community.mod.reports.open")
    case .actioned: String(localized: "community.mod.reports.actioned")
    case .dismissed: String(localized: "community.mod.reports.dismissed")
    }
  }

  private func statusColor(_ s: ModReportStatus) -> Color {
    switch s {
    case .open: DS.Color.metricBlue.swiftUI
    case .actioned: DS.Color.readinessGreen.swiftUI
    case .dismissed: DS.Color.mutedForeground.swiftUI
    }
  }
}
