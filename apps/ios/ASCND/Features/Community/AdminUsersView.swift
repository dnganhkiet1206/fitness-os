import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Danh sách người dùng cho admin (#915, giai đoạn 2) — port của
/// `native/src/app/admin/users.tsx` (RN web): tìm kiếm (chờ gõ dừng 300ms rồi
/// mới gọi — mỗi phím một lượt quét `auth.users` là phí), huy hiệu vai trò,
/// số bài / ẩn / gỡ / báo cáo. Chạm một người thì mở chi tiết của họ.
struct AdminUsersScreen: View {
  let book: AdminBook
  @State private var query = ""
  @State private var openUser: String?
  @State private var searchTask: Task<Void, Never>?

  var body: some View {
    content
      .navigationTitle(Text("community.admin.users.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.load() }
      .task { if book.phase == .loading { await book.load() } }
      .navigationDestination(item: $openUser) { id in AdminUserScreen(book: book, userId: id) }
      .onDisappear { searchTask?.cancel() }
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
        systemImage: "shield.slash", title: String(localized: "community.admin.users.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      list
    }
  }

  private var list: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        HStack(spacing: DS.Spacing.sm) {
          Image(systemName: "magnifyingglass")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
          TextField(text: $query, prompt: Text("community.admin.users.search")) {
            Text("community.admin.users.search")
          }
          .font(DS.TextStyle.body)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .submitLabel(.search)
        }
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 44)
        .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onChange(of: query) { _, q in
          searchTask?.cancel()
          searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await book.searchUsers(q)
          }
        }
        if book.users.isEmpty {
          DSEmptyState(
            systemImage: "person.2.slash", title: String(localized: "community.admin.users.title"),
            message: String(localized: "community.admin.users.empty"))
        } else {
          ForEach(book.users) { row in
            Button { openUser = row.userId } label: {
              DSCard { AdminUserRowView(row: row) }
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }
}

/// Một người: tên + huy hiệu vai trò + email/handle + số liệu.
struct AdminUserRowView: View {
  let row: AdminUserRow

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: row.name)
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer(minLength: 0)
        Text(verbatim: ModerationFailureText.roleText(row.role))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
      }
      if let handle = row.handle, !handle.isEmpty {
        Text(verbatim: "@\(handle)")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      } else if let email = row.email, !email.isEmpty {
        Text(verbatim: email)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      HStack(spacing: DS.Spacing.md) {
        AdminStat(label: String(localized: "community.mod.authorstats.posts"), value: row.posts)
        AdminStat(label: String(localized: "community.mod.authorstats.hidden"), value: row.hiddenPosts)
        AdminStat(
          label: String(localized: "community.mod.authorstats.removed"), value: row.removedPosts,
          alert: row.removedPosts > 0)
      }
      HStack(spacing: DS.Spacing.md) {
        AdminStat(
          label: String(localized: "community.mod.authorstats.against"), value: row.openReportsAgainst,
          warn: row.openReportsAgainst > 0)
        AdminStat(label: String(localized: "community.mod.authorstats.filed"), value: row.reportsFiled)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

/// Một số liệu nhỏ (số to + nhãn dưới) — dùng chung cho danh sách người dùng
/// và chi tiết một người.
struct AdminStat: View {
  let label: String
  let value: Int
  var alert = false
  var warn = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(verbatim: "\(value)")
        .font(DS.TextStyle.title2)
        .foregroundStyle(
          alert ? DS.Color.destructive.swiftUI
            : warn ? DS.Color.readinessYellow.swiftUI : DS.Color.foreground.swiftUI)
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityLabel(Text(verbatim: "\(label) · \(value)"))
  }
}
