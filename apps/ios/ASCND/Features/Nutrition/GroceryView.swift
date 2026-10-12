import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

struct GroceryRoute: Hashable {}

/// Danh sách đi chợ (#527, N1) — `app/grocery.tsx` @ fac9ac2 trên `GroceryBook`.
///
/// Như RN:
/// - ô "Thêm món cần mua…" + nút thêm (tắt khi ô rỗng); thêm chỉ online;
/// - "Từ meal plan của bạn": món của thực đơn gần nhất chưa có trong danh sách,
///   chạm để thêm kèm lượng ("400g" / "×3");
/// - mỗi món: ô tick (vai checkbox, đọc tên + lượng + "đang chờ gửi") và nút
///   xoá là HAI nút cạnh nhau; xoá hỏi lại;
/// - tick qua lớp Trạng thái (#161): đổi ngay, mất mạng giữ ý và nói một lần;
/// - đọc hỏng là màn lỗi có thử lại, không bao giờ "Danh sách trống".
struct GroceryView: View {
  let book: GroceryBook

  @Environment(AppServices.self) private var services
  @State private var draft = ""
  @State private var message: String?
  @State private var pendingDelete: GroceryItem?
  @FocusState private var focused: Bool

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        addRow
        if !book.suggestions.isEmpty { fromPlan }
        if let message {
          Text(message)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        content
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(String(localized: "grocery.title")))
    .ascndPage()
    .refreshable { await book.refresh() }
    .task { await book.refresh() }
    .onChange(of: services.stateWriter.notice) { _, notice in
      switch notice {
      case .gone: message = String(localized: "state.gone")
      case .failed: message = String(localized: "grocery.nothingWritten")
      case nil: return
      }
      services.stateWriter.clearNotice()
    }
  }

  // MARK: - Thêm

  private var addRow: some View {
    HStack(spacing: DS.Spacing.sm) {
      TextField(String(localized: "grocery.add.placeholder"), text: $draft)
        .focused($focused)
        .submitLabel(.done)
        .onSubmit(submit)
        .padding(.horizontal, DS.Spacing.md)
        .frame(height: 48)
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.md).stroke(DS.Color.border.swiftUI, lineWidth: 0.5))
      Button(action: submit) {
        Image(systemName: "plus")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(DS.Color.primaryForeground.swiftUI)
          .frame(width: 48, height: 48)
          .background(DS.Color.primary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      }
      .buttonStyle(TodayPressStyle())
      .disabled(Grocery.cleanName(draft) == nil || book.busy)
      .opacity(Grocery.cleanName(draft) == nil ? 0.4 : 1)
      .accessibilityLabel(Text(String(localized: "grocery.add.a11y")))
      .sensoryFeedback(.impact(weight: .light), trigger: book.items.count)
    }
  }

  private func submit() {
    guard Grocery.cleanName(draft) != nil else { return }
    let name = draft
    draft = ""
    Task { report(await book.add(name, online: services.sync.online)) }
  }

  // MARK: - Từ thực đơn

  private var fromPlan: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Label(String(localized: "grocery.fromPlan"), systemImage: "fork.knife")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      FlowRows(spacing: DS.Spacing.sm, centered: false) {
        ForEach(book.suggestions) { s in
        Button {
          Task { report(await book.add(s.name, quantity: s.amount, online: services.sync.online)) }
        } label: {
          HStack(spacing: 6) {
            Text(verbatim: s.name).font(DS.TextStyle.footnote.weight(.semibold)).lineLimit(1)
            Text(verbatim: s.amount).font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Image(systemName: "plus").font(.system(size: 11, weight: .bold))
          }
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .padding(.horizontal, 12)
          .frame(minHeight: 36)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        .buttonStyle(TodayPressStyle())
        .disabled(book.busy)
        .accessibilityLabel(Text(verbatim: "\(s.name), \(s.amount)"))
        }
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard(radius: DS.Radius.lg)
  }

  // MARK: - Danh sách

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.refresh() } }
    case .ready(let items) where items.isEmpty:
      DSEmptyState(
        systemImage: "cart", title: String(localized: "grocery.empty.title"),
        message: String(localized: "grocery.empty.hint"))
    case .ready(let items):
      VStack(spacing: DS.Spacing.sm) {
        ForEach(items) { row($0) }
      }
    }
  }

  private func row(_ item: GroceryItem) -> some View {
    let checked = book.shownChecked(item, writer: services.stateWriter)
    let pending = book.isPending(item, writer: services.stateWriter)
    let label = [item.quantity.map { "\(item.name), \($0)" } ?? item.name, pending ? String(localized: "grocery.pending") : nil]
      .compactMap { $0 }.joined(separator: ", ")
    return HStack(spacing: DS.Spacing.md) {
      Button {
        let wasEmpty = services.stateWriter.size == 0
        let outcome = book.setChecked(item, checked: !checked, writer: services.stateWriter)
        if outcome == .queued, !services.sync.online, wasEmpty { message = String(localized: "state.queued") }
      } label: {
        HStack(spacing: DS.Spacing.md) {
          ZStack {
            Circle().stroke(checked ? DS.Color.readinessGreen.swiftUI : DS.Color.border.swiftUI, lineWidth: 1.5)
            if checked {
              Circle().fill(DS.Color.readinessGreen.swiftUI)
              Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
            }
          }
          .frame(width: 24, height: 24)
          (Text(verbatim: item.name)
            .foregroundStyle(checked ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
            + Text(verbatim: item.quantity.map { "  ×\($0)" } ?? "")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI))
            .font(DS.TextStyle.body)
            .strikethrough(checked, color: DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
          if pending {
            Circle().fill(DS.Color.mutedForeground.swiftUI.opacity(0.8)).frame(width: 6, height: 6)
              .accessibilityHidden(true)
          }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .sensoryFeedback(.selection, trigger: checked)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: label))
      .accessibilityAddTraits(checked ? [.isButton, .isSelected] : .isButton)
      Button {
        pendingDelete = item
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(book.busy)
      .accessibilityLabel(Text(String(localized: "grocery.remove.a11y \(item.name)")))
      // Gắn vào chính nút ✕: popover trỏ đúng món sắp xoá.
      .confirmationDialog(
        String(localized: "grocery.delete.confirm \(item.name)"),
        isPresented: Binding(
          get: { pendingDelete?.id == item.id }, set: { if !$0 { pendingDelete = nil } }),
        titleVisibility: .visible
      ) {
        Button(String(localized: "grocery.delete"), role: .destructive) {
          Task { report(await book.remove(id: item.id, online: services.sync.online)) }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
    }
    .padding(.leading, DS.Spacing.md)
    .padding(.vertical, 4)
    .todayCard(radius: DS.Radius.md)
  }

  private func report(_ outcome: GroceryBook.WriteOutcome) {
    switch outcome {
    case .done, .emptyName: message = nil
    case .onlineOnly: message = String(localized: "grocery.onlineOnly")
    case .nothingWritten: message = String(localized: "grocery.nothingWritten")
    case .failed: message = String(localized: "async.error.generic")
    }
  }
}

/// Hàng "Danh sách đi chợ" ở phân đoạn Kế hoạch ăn (`ShortcutRow` của RN):
/// "còn N món" khi danh sách có món; đọc chưa xong / hỏng thì không có số.
struct GroceryRow: View {
  let book: GroceryBook
  @Environment(AppServices.self) private var services

  var body: some View {
    NavigationLink(value: GroceryRoute()) {
      HStack {
        Label(String(localized: "grocery.title"), systemImage: "cart")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer()
        if !book.items.isEmpty {
          let n = book.remaining(writer: services.stateWriter)
          Text(n == 1 ? String(localized: "grocery.left.one") : String(localized: "grocery.left.other \(n)"))
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Image(systemName: "chevron.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.md)
      .frame(minHeight: 56)
      .todayCard(radius: DS.Radius.lg)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .task { if case .loading = book.phase { await book.refresh() } }
  }
}
